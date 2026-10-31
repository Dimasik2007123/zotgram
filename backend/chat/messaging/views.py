from uuid import UUID
from django.db import transaction
from django.http import FileResponse
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.generics import GenericAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError, NotFound
from .models import Chat, Membership, Message
from .serializers import DirectInput, GroupInput, GroupPatch, MemberInput, MessageInput, MessageSerializer, ReadInput
from .services import chat_data, chats_data, unread_memberships, locked_chat, member, notify_chat, publish, require_users, core_users
from system.pagination import ChatPages
from .system_chats import sync_system_memberships, visible_chats
from . import tickets
from .previews import can_preview, open_preview, PreviewUnavailable

class DirectView(APIView):

    def post(self, request):
        data = DirectInput(data=request.data)
        data.is_valid(raise_exception=True)
        other = data.validated_data['recipient_id']
        uid = UUID(str(request.user.id))
        if other == uid:
            raise ValidationError('Выберите другого пользователя.')
        require_users(request, [other])
        pair = ':'.join(sorted([str(uid), str(other)]))
        with transaction.atomic():
            chat, created = Chat.objects.get_or_create(
                direct_key=pair, defaults={'type': 'personal'})
            if created:
                Membership.objects.bulk_create(
                    [Membership(chat=chat, user_id=uid),
                     Membership(chat=chat, user_id=other)])
                notify_chat(chat)
        return Response(chat_data(chat, uid), status=201 if created else 200)

class ChatsView(GenericAPIView):
    pagination_class = ChatPages

    def get(self, request):
        uid = request.user.id
        first_page = not request.query_params.get('cursor')
        if first_page and (request.query_params.get('sync') ==
                           '1' or not Chat.objects.filter(
                memberships__user_id=uid,
                system_key__isnull=False).exists()):
            sync_system_memberships(request)
        qs = visible_chats(request).order_by('-updated_at', '-id')
        query = request.query_params.get('q', '').strip()[:100]
        if query:
            possible = Membership.objects.filter(chat__in=qs).exclude(
                user_id=uid).values_list('user_id', flat=True)
            matches = [user['id']
                       for user in core_users(request, possible, query)]
            qs = qs.filter(
                Q(name__icontains=query) |
                Q(type='personal', memberships__user_id__in=matches)
            ).distinct()
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(
            chats_data(page, uid))

    def post(self, request):
        data = GroupInput(data=request.data)
        data.is_valid(raise_exception=True)
        uid = UUID(str(request.user.id))
        others = set(data.validated_data['participants']) - {uid}
        require_users(request, others)
        with transaction.atomic():
            chat = Chat.objects.create(
                type='group', name=data.validated_data['name'])
            Membership.objects.create(chat=chat, user_id=uid, role='admin')
            Membership.objects.bulk_create([
                Membership(
                    chat=chat, user_id=x)
                for x in others])
            notify_chat(chat)
        return Response(chat_data(chat, uid), status=201)

class ChatView(APIView):

    def get(self, request, pk):
        return Response(
            chat_data(
                member(
                    pk, request.user.id, authorization=request.headers.get(
                        'Authorization', '')).chat, request.user.id))

    def patch(self, request, pk):
        data = GroupPatch(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            chat, _ = locked_chat(
                pk, request.user.id, admin=True,
                authorization=request.headers.get('Authorization', ''))
            for key, value in data.validated_data.items():
                setattr(chat, key, '' if key ==
                        'avatar' and value is None else value)
            chat.updated_at = timezone.now()
            chat.save()
            notify_chat(chat)
        return Response(chat_data(chat, request.user.id))

    def delete(self, request, pk):
        with transaction.atomic():
            chat, _ = locked_chat(
                pk, request.user.id, admin=True,
                authorization=request.headers.get('Authorization', ''))
            recipients = list(chat.memberships.values_list('user_id', flat=True))
            chat.delete()
            publish(
                [str(user_id) for user_id in recipients],
                {'type': 'chat.removed', 'chat_id': str(pk)})
        return Response(status=204)

class MembersView(APIView):

    def put(self, request, pk):
        data = MemberInput(data=request.data)
        data.is_valid(raise_exception=True)
        uid, role = (
            data.validated_data['user_id'],
            data.validated_data['role'])
        require_users(request, [uid])
        with transaction.atomic():
            chat, _ = locked_chat(
                pk, request.user.id, admin=True,
                authorization=request.headers.get('Authorization', ''))
            existing = Membership.objects.filter(
                chat=chat, user_id=uid).first()
            if existing and existing.role == 'admin' and (
                    role != 'admin') and (
                    chat.memberships.filter(role='admin').count() == 1):
                raise ValidationError('Сначала назначьте другого админа.')
            Membership.objects.update_or_create(
                chat=chat, user_id=uid, defaults={'role': role})
            notify_chat(chat)
        return Response(chat_data(chat, request.user.id))

    def delete(self, request, pk, user_id):
        with transaction.atomic():
            chat, own = locked_chat(
                pk, request.user.id, authorization=request.headers.get(
                    'Authorization', ''))
            if chat.system_key or chat.type != 'group' or (
                    str(user_id) != str(request.user.id) and own.role != 'admin'):
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('Недостаточно прав.')
            target = get_object_or_404(Membership, chat=chat, user_id=user_id)
            if target.role == 'admin' and chat.memberships.filter(
                    role='admin').count() == 1:
                raise ValidationError('Сначала назначьте другого админа.')
            target.delete()
            notify_chat(chat)
            publish(
                [str(user_id)],
                {'type': 'chat.removed', 'chat_id': str(pk)})
        return Response(status=204)

def number(params, key):
    try:
        value = int(params[key]) if key in params else None
        if value is not None and value < 0:
            raise ValueError()
        return value
    except (ValueError, TypeError):
        raise ValidationError({key: 'Нужно неотрицательное целое число.'})

class MessagesView(APIView):

    def get(self, request, pk):
        member(
            pk, request.user.id, authorization=request.headers.get(
                'Authorization', ''))
        qs = Message.objects.filter(chat_id=pk)
        query = request.query_params.get('q', '').strip()[:100]
        if query:
            qs = qs.filter(text__icontains=query)
        after, before = (number(request.query_params, 'after'),
                         number(request.query_params, 'before'))
        if after is not None:
            qs = qs.filter(sequence__gt=after).order_by('sequence')
        else:
            if before is not None:
                qs = qs.filter(sequence__lt=before)
            qs = qs.order_by('-sequence')
        items = list(qs[:51])
        more = len(items) > 50
        items = items[:50]
        if after is None:
            items.reverse()
        return Response(
            {'results': MessageSerializer(items, many=True).data,
             'has_more': more})

    def post(self, request, pk):
        data = MessageInput(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        uid = request.user.id
        with transaction.atomic():
            chat, _ = locked_chat(
                pk, uid, authorization=request.headers.get(
                    'Authorization', ''))
            message = Message.objects.filter(
                chat=chat, author_id=uid, attempt_id=values['attempt_id']).first()
            created = message is None
            if created:
                upload = values.get('file')
                chat.last_sequence += 1
                message = Message.objects.create(
                    chat=chat,
                    author_id=uid,
                    sequence=chat.last_sequence,
                    attempt_id=values['attempt_id'],
                    text=values.get('text', '').strip(),
                    attachment=upload or '',
                    attachment_name=(
                        upload.name.replace('\\', '/').split('/')[-1][:200]
                        if upload else ''
                    ),
                    attachment_mime=values.get('mime', ''),
                )
                chat.updated_at = timezone.now()
                chat.save(update_fields=['last_sequence', 'updated_at'])
                notify_chat(
                    chat, 'message.created',
                    {'message': MessageSerializer(message).data})
        return Response(
            MessageSerializer(message).data, status=201 if created else 200)

class UnreadView(APIView):
    def get(self, request):
        # Один SQL-запрос на все счётчики; состав отделов здесь не пересобираем.
        memberships = unread_memberships(Membership.objects.filter(
            user_id=request.user.id, chat__in=visible_chats(request)
        ), request.user.id)
        rows = list(memberships.select_related('chat'))
        return Response({'chats': [
            {'id': str(row.chat_id), 'unreadCount': row.unread_count,
             'lastReadSequence': row.last_read_sequence, 'lastSequence': row.chat.last_sequence}
            for row in rows
        ], 'totalUnread': sum(row.unread_count for row in rows), 'systemChats': [
            {'id': str(row.chat_id), 'systemKey': row.chat.system_key,
             'departmentId': row.chat.department_id or None, 'name': row.chat.name}
            for row in rows if row.chat.system_key
        ]})

class ReadView(APIView):

    def post(self, request, pk):
        data = ReadInput(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            chat, own = locked_chat(
                pk, request.user.id, authorization=request.headers.get(
                    'Authorization', ''))
            value = min(data.validated_data['sequence'], chat.last_sequence)
            changed = value > own.last_read_sequence
            if changed:
                own.last_read_sequence = value
                own.save(update_fields=['last_read_sequence'])
            unread = chat.messages.filter(
                sequence__gt=own.last_read_sequence).exclude(
                author_id=request.user.id).count()
            result = {'sequence': own.last_read_sequence,
                      'unreadCount': unread, 'lastSequence': chat.last_sequence}
            if changed:
                notify_chat(
                    chat, 'read.updated',
                    {'user_id': str(request.user.id),
                     'sequence': own.last_read_sequence,
                     'unread_count': unread,
                     'last_sequence': chat.last_sequence})
        return Response(result)

class TicketView(APIView):

    def post(self, request):
        return Response({'ticket': tickets.issue(
            request.user.id, request.auth['exp'],
            authorization=request.headers.get(
                'Authorization', ''))})

class FileView(APIView):
    def get_message(self, request, pk, message_id):
        member(
            pk,
            request.user.id,
            authorization=request.headers.get('Authorization', ''),
        )

        message = get_object_or_404(
            Message,
            pk=message_id,
            chat_id=pk,
        )

        if not message.attachment:
            raise NotFound()

        return message

    def get(self, request, pk, message_id):
        message = self.get_message(request, pk, message_id)
        response = FileResponse(
            message.attachment.open('rb'),
            as_attachment=True,
            filename=message.attachment_name,
            content_type=message.attachment_mime,
        )
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

class PreviewView(FileView):
    def get(self, request, pk, message_id):
        message = self.get_message(request, pk, message_id)
        if not can_preview(message.attachment_mime, message.attachment_name):
            raise NotFound()
        try:
            preview = open_preview(message.attachment)
        except PreviewUnavailable:
            raise NotFound('Превью недоступно.')
        response = FileResponse(preview, content_type='image/webp', filename='preview.webp')
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

class AvatarView(APIView):
    def get(self, request, pk):
        chat = member(
            pk,
            request.user.id,
            authorization=request.headers.get('Authorization', ''),
        ).chat

        if not chat.avatar:
            raise NotFound()

        response = FileResponse(
            chat.avatar.open('rb'),
            as_attachment=True,
            filename='group-image',
        )
        response['Cache-Control'] = 'private, no-store'
        return response
