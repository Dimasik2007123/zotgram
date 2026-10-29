import httpx
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from rest_framework.exceptions import APIException, NotAuthenticated, PermissionDenied
from .models import Chat, Membership
from .core_client import core_client

DEPARTMENTS = {
    "frontend": "Фронтенд", "backend": "Бэкенд", "design": "Дизайн",
    "management": "Менеджмент", "testing": "Тестирование",
}

class SystemChatsUnavailable(APIException):
    status_code = 503
    default_detail = "Общие чаты временно недоступны. Повторите позже."

def seed_system_chats():
    with transaction.atomic():
        Chat.objects.update_or_create(
            system_key="general",
            defaults={"type": "group", "name": "Общий чат",
                       "department_id": ""})
        for department_id, name in DEPARTMENTS.items():
            Chat.objects.update_or_create(
                system_key=f"department-{department_id}",
                defaults={"type": "group", "name": name,
                          "department_id": department_id})

def core_get(client, path, authorization, params=None):
    response = client.get(
        settings.CORE_INTERNAL_URL + path,
        headers={"Authorization": authorization},
        params=params)
    if response.status_code == 401:
        raise NotAuthenticated("Войдите снова.")
    response.raise_for_status()
    return response.json()

def core_profile(user_id, authorization):
    if not authorization:
        raise NotAuthenticated("Войдите снова.")
    try:
        profile = core_get(core_client, "/api/core/me/", authorization)
        if str(profile["id"]) != str(user_id):
            raise PermissionDenied("Чат недоступен.")
        return profile
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        raise SystemChatsUnavailable()

def require_system_access(chat, user_id, authorization):
    if not chat.system_key:
        return
    profile = core_profile(user_id, authorization)
    if chat.department_id and profile.get("department") != chat.department_id:
        raise PermissionDenied("Чат доступен только сотрудникам этого отдела.")

def visible_chats(request):
    chats = Chat.objects.filter(memberships__user_id=request.user.id)
    if chats.filter(system_key__isnull=False).exists():
        # Не кешируем права: смена отдела должна сразу закрывать старый чат.
        profile = core_profile(request.user.id, request.headers.get("Authorization", ""))
        allowed = Q(system_key__isnull=True) | Q(system_key="general")
        if profile.get("department"):
            allowed |= Q(department_id=profile["department"])
        chats = chats.filter(allowed)
    return chats

def sync_system_memberships(request):
    employees = []
    authorization = request.headers.get("Authorization", "")
    try:
        page = 1
        while True:
            data = core_get(
                core_client, "/api/core/users/", authorization,
                {"page": page, "page_size": 100})
            employees.extend(data["results"])
            if not data.get("next"):
                break
            page += 1
        employee_ids = {str(person["id"]) for person in employees}
        if str(request.user.id) not in employee_ids:
            raise PermissionDenied("Общие чаты доступны сотрудникам.")
        departments = {key: {str(person["id"]) for person in employees if person.get(
            "department") == key} for key in DEPARTMENTS}
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        raise SystemChatsUnavailable()
    from .services import notify_chat, publish
    with transaction.atomic():
        rooms = list(Chat.objects.select_for_update().filter(
            system_key__isnull=False).order_by("system_key"))
        expected = {"general", *(f"department-{key}" for key in DEPARTMENTS)}
        if {room.system_key for room in rooms} != expected:
            raise SystemChatsUnavailable()
        for room in rooms:
            wanted = departments[room.department_id] if room.department_id else employee_ids
            existing = {
                str(value)
                for value in room.memberships.values_list(
                    "user_id", flat=True)}
            added, removed = wanted - existing, existing - wanted
            Membership.objects.bulk_create([
                Membership(
                    chat=room, user_id=user_id)
                for user_id in added],
                ignore_conflicts=True)
            room.memberships.filter(user_id__in=removed).delete()
            if added or removed:
                notify_chat(room)
                if removed:
                    publish(
                        removed,
                        {"type": "chat.removed", "chat_id": str(room.pk)})
