import logging
import httpx
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.db import transaction
from rest_framework.exceptions import APIException, NotAuthenticated, NotFound, ValidationError, PermissionDenied
from .models import Chat, Membership
from .serializers import MessageSerializer
from .system_chats import require_system_access
from .core_client import core_client
log = logging.getLogger(__name__)

class CoreUnavailable(APIException):
    status_code = 503
    default_detail = 'Core недоступен. Повторите позже.'

def core_users(request, ids, query=''):
    ids = list(set((str(x) for x in ids)))
    found = []
    try:
        for offset in range(0, len(ids), 100):
            response = core_client.get(
                settings.CORE_INTERNAL_URL + '/api/core/users/batch/',
                params={'ids': ','.join(ids[offset: offset + 100]), 'q': query},
                headers={'Authorization': request.headers.get('Authorization', '')})
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

def member(chat_id, user_id, authorization=''):
    membership = Membership.objects.filter(
        chat_id=chat_id, user_id=user_id).select_related('chat').first()
    if not membership and authorization:
        chat = Chat.objects.filter(pk=chat_id,
                                   system_key__isnull=False).first()
        if chat:
            require_system_access(chat, user_id, authorization)
            membership, _ = Membership.objects.get_or_create(
                chat=chat, user_id=user_id)
    if not membership:
        raise NotFound('Чат не найден.')
    if membership.chat.system_key:
        require_system_access(membership.chat, user_id, authorization)
    return membership

def locked_chat(chat_id, user_id, admin=False, authorization=''):
    chat = Chat.objects.select_for_update().filter(pk=chat_id).first()
    if not chat:
        raise NotFound('Чат не найден.')
    membership = member(chat.pk, user_id, authorization=authorization)
    if admin and (
            chat.system_key or chat.type != 'group' or membership.role != 'admin'):
        raise PermissionDenied('Нужна роль админа группы.')
    return (chat, membership)

def publish(user_ids, event):

    async def send_all():
        layer = get_channel_layer()
        for uid in user_ids:
            await layer.group_send(f'user.{uid}', {'type': 'notify', 'event': event})

    def send():
        try:
            async_to_sync(send_all)()
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
    own = next((x for x in members if str(x.user_id) == str(user_id)), None)
    last = chat.messages.order_by('-sequence').first()
    unread = (
        chat.messages
        .filter(sequence__gt=own.last_read_sequence)
        .exclude(author_id=user_id)
        .count()
        if own else 0
    )
    return {
        'id': str(chat.pk),
        'type': chat.type,
        'name': chat.name,
        'systemKey': chat.system_key,
        'departmentId': chat.department_id or None,
        'participants': [str(x.user_id) for x in members],
        'members': [
            {
                'userId': str(x.user_id),
                'role': x.role,
                'lastReadSequence': x.last_read_sequence,
            }
            for x in members
        ],
        'myRole': own.role if own else '',
        'unreadCount': unread,
        'lastReadSequence': own.last_read_sequence if own else 0,
        'lastSequence': chat.last_sequence,
        'avatar': f'/api/chat/chats/{chat.pk}/avatar/' if chat.avatar else '',
        'lastMessage': MessageSerializer(last).data if last else None,
        'updatedAt': chat.updated_at.isoformat(),
    }
