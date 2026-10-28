import logging
import httpx
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.db import transaction
from rest_framework.exceptions import APIException, NotAuthenticated, NotFound, ValidationError
from .models import Chat, Membership
from .serializers import MessageSerializer
log = logging.getLogger(__name__)


class CoreUnavailable(APIException):
    status_code = 503
    default_detail = 'Core недоступен. Повторите позже.'


def core_users(request, ids):
    ids = list(set((str(x) for x in ids)))
    found = []
    try:
        with httpx.Client(timeout=5) as client:
            for offset in range(0, len(ids), 100):
                response = client.get(
                    settings.CORE_INTERNAL_URL + '/api/core/users/batch/',
                    params={'ids': ','.join(ids[offset: offset + 100])},
                    headers={'Authorization': request.headers.get(
                        'Authorization', '')})
                if response.status_code == 401:
                    raise NotAuthenticated('Войдите снова.')
                response.raise_for_status()
                found.extend(response.json())
    except (httpx.HTTPError, ValueError):
        raise CoreUnavailable()
    return found


def require_users(request, ids):
    if set((str(x) for x in ids)) != {str(user['id'])
                                      for user in core_users(request, ids)}:
        raise ValidationError('Один из пользователей не найден или отключён.')


def member(chat_id, user_id):
    membership = Membership.objects.filter(
        chat_id=chat_id, user_id=user_id).select_related('chat').first()
    if not membership:
        raise NotFound('Чат не найден.')
    return membership


def locked_chat(chat_id, user_id):
    chat = Chat.objects.select_for_update().filter(pk=chat_id).first()
    if not chat:
        raise NotFound('Чат не найден.')
    membership = member(chat.pk, user_id)
    return (chat, membership)


def publish(user_ids, event):

    def send():
        try:
            layer = get_channel_layer()
            for uid in user_ids:
                async_to_sync(
                    layer.group_send)(
                    f'user.{uid}', {'type': 'notify', 'event': event})
        except Exception:
            log.exception('Не удалось опубликовать событие Chat')
    transaction.on_commit(send)


def notify_chat(chat, kind='chat.updated', payload=None, extra_users=()):
    ids = set(
        (str(x) for x in chat.memberships.values_list(
            'user_id', flat=True))) | set(
        (str(x) for x in extra_users))
    publish(ids, {'type': kind, 'chat_id': str(chat.pk), **(payload or {})})


def chat_data(chat, user_id):
    members = list(chat.memberships.all())
    last = chat.messages.order_by('-sequence').first()
    return {'id': str(chat.pk), 'type': chat.type, 'name': chat.name, 'participants': [str(x.user_id) for x in members], 'lastMessage': MessageSerializer(last).data if last else None, 'updatedAt': chat.updated_at.isoformat()}
