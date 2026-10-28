from uuid import UUID
from django.db import transaction
from django.utils import timezone
from rest_framework.generics import GenericAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError
from .models import Chat, Membership, Message
from .serializers import DirectInput, MessageInput, MessageSerializer
from .services import chat_data, locked_chat, member, notify_chat, require_users
from . import tickets


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

    def get(self, request):
        uid = request.user.id
        qs = Chat.objects.filter(
            memberships__user_id=uid).order_by(
            '-updated_at', '-id')
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(
            [chat_data(chat, uid) for chat in page])


class ChatView(APIView):

    def get(self, request, pk):
        return Response(
            chat_data(
                member(pk, request.user.id).chat, request.user.id))


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
        member(pk, request.user.id)
        qs = Message.objects.filter(chat_id=pk)
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
            chat, _ = locked_chat(pk, uid)
            message = Message.objects.filter(
                chat=chat, author_id=uid, attempt_id=values['attempt_id']).first()
            created = message is None
            if created:
                chat.last_sequence += 1
                message = Message.objects.create(
                    chat=chat, author_id=uid, sequence=chat.last_sequence,
                    attempt_id=values['attempt_id'],
                    text=values.get('text', '').strip())
                chat.updated_at = timezone.now()
                chat.save(update_fields=['last_sequence', 'updated_at'])
                notify_chat(
                    chat, 'message.created',
                    {'message': MessageSerializer(message).data})
        return Response(
            MessageSerializer(message).data, status=201 if created else 200)


class TicketView(APIView):

    def post(self, request):
        return Response(
            {'ticket': tickets.issue(request.user.id, request.auth['exp'])})
