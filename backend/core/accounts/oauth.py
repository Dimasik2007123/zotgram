import json
import logging
import secrets
import time
from functools import wraps
from urllib.parse import urlencode
import httpx
from django.conf import settings
from django.db import transaction
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.exceptions import APIException
from rest_framework_simplejwt.exceptions import TokenError
from .models import User
from .serializers import UserSerializer

log = logging.getLogger(__name__)


def json_endpoint(view):
    @wraps(view)
    def wrapped(request):
        try:
            request.payload = json.loads(request.body or b"{}")
            if not isinstance(request.payload, dict):
                raise ValueError()
            return view(request)
        except (ValueError, TypeError, KeyError):
            return JsonResponse(
                {"detail": "Некорректный запрос или ответ провайдера."},
                status=400)
        except (APIException, TokenError):
            return JsonResponse(
                {"detail": "Авторизация недействительна. Войдите снова."},
                status=401)
        except httpx.HTTPError:
            return JsonResponse(
                {"detail": "Яндекс временно недоступен. Повторите вход."},
                status=502)
    return wrapped


def set_refresh(response, token):
    response.set_cookie(
        settings.REFRESH_COOKIE, str(token),
        httponly=True, secure=settings.COOKIE_SECURE, samesite="Lax",
        path=settings.REFRESH_COOKIE_PATH,
        max_age=max(0, int(token["exp"] - time.time())))
    response["Cache-Control"] = "no-store"
    return response


@require_GET
@ensure_csrf_cookie
def csrf(request):
    response = JsonResponse({"csrfToken": get_token(request)})
    response["Cache-Control"] = "no-store"
    return response


@require_GET
def start(request):
    if not settings.YANDEX_CLIENT_ID or not settings.YANDEX_CLIENT_SECRET:
        return JsonResponse(
            {"detail": "Заполните настройки Яндекса в Core."},
            status=503)
    state = secrets.token_urlsafe(32)
    request.session["oauth_attempt"] = {"state": state, "created": time.time()}
    params = {"response_type": "code", "client_id": settings.YANDEX_CLIENT_ID,
              "redirect_uri": settings.YANDEX_REDIRECT_URI, "state": state}
    response = JsonResponse(
        {"authorize_url": "https://oauth.yandex.ru/authorize?" +
         urlencode(params)})
    response["Cache-Control"] = "no-store"
    return response


def fetch_yandex(code):
    with httpx.Client(timeout=10) as client:
        response = client.post(
            "https://oauth.yandex.ru/token",
            data={"grant_type": "authorization_code", "code": code,
                  "client_id": settings.YANDEX_CLIENT_ID,
                  "client_secret": settings.YANDEX_CLIENT_SECRET,
                  "redirect_uri": settings.YANDEX_REDIRECT_URI, })
        response.raise_for_status()
        token = response.json()["access_token"]
        response = client.get(
            "https://login.yandex.ru/info", params={"format": "json"},
            headers={"Authorization": f"OAuth {token}"})
        response.raise_for_status()
        return response.json()


@require_POST
@csrf_protect
@json_endpoint
def callback(request):
    attempt = request.session.pop("oauth_attempt", None)
    received = str(request.payload.get("state", ""))
    if not attempt or time.time() - attempt["created"] > 600 or not secrets.compare_digest(attempt["state"], received):
        return JsonResponse(
            {"detail": "Попытка входа устарела. Начните заново."},
            status=400)
    code = request.payload.get("code")
    if not isinstance(code, str) or not code or len(code) > 2048:
        raise ValueError()
    profile = fetch_yandex(code)
    yandex_id = str(profile["id"])
    if settings.YANDEX_ALLOWED_IDS and yandex_id not in settings.YANDEX_ALLOWED_IDS:
        return JsonResponse(
            {"detail": "Аккаунт не приглашён в ZotGram."},
            status=403)
    with transaction.atomic():
        user, created = User.objects.get_or_create(
            yandex_id=yandex_id,
            defaults={"username": f"yandex_{yandex_id}",
                      "first_name": profile.get("first_name", ""),
                      "last_name": profile.get("last_name", ""),
                      "email": profile.get("default_email", ""), })
        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])
    if not user.is_active:
        return JsonResponse({"detail": "Аккаунт отключён."}, status=403)
    request.session.cycle_key()
    refresh = RefreshToken.for_user(user)
    response = JsonResponse(
        {"access": str(refresh.access_token),
         "user": UserSerializer(user, context={"request": request}).data})
    return set_refresh(response, refresh)


@require_POST
@csrf_protect
@json_endpoint
def refresh(request):
    raw = request.COOKIES.get(settings.REFRESH_COOKIE)
    if not raw:
        return JsonResponse({"detail": "Войдите в аккаунт."}, status=401)
    serializer = TokenRefreshSerializer(data={"refresh": raw})
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    response = JsonResponse({"access": data["access"]})
    return set_refresh(response, RefreshToken(data["refresh"]))


@require_POST
@csrf_protect
@json_endpoint
def logout(request):
    raw = request.COOKIES.get(settings.REFRESH_COOKIE)
    if raw:
        try:
            RefreshToken(raw).blacklist()
        except TokenError:
            pass
    request.session.flush()
    response = JsonResponse({"ok": True})
    response.delete_cookie(
        settings.REFRESH_COOKIE, path=settings.REFRESH_COOKIE_PATH,
        samesite="Lax")
    response["Cache-Control"] = "no-store"
    return response
