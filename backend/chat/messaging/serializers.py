from rest_framework import serializers
from system.uploads import validate_upload
from .models import Message

class DirectInput(serializers.Serializer):
    recipient_id = serializers.UUIDField()

class MessageInput(serializers.Serializer):
    text = serializers.CharField(
        required=False, allow_blank=True, max_length=10000)
    attempt_id = serializers.UUIDField()
    file = serializers.FileField(required=False)

    def validate(self, attrs):
        if not attrs.get('text', '').strip() and not attrs.get('file'):
            raise serializers.ValidationError("Добавьте текст или файл")
        if attrs.get('file'):
            attrs['mime'] = validate_upload(attrs['file'])
        return attrs

class GroupInput(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    participants = serializers.ListField(
        child=serializers.UUIDField(),
        min_length=1,
        error_messages={
            'min_length': 'Добавьте хотя бы одного участника в группу.',
        })

class GroupPatch(serializers.Serializer):
    name = serializers.CharField(required=False, max_length=150)
    avatar = serializers.FileField(required=False, allow_null=True)

    def validate_avatar(self, value):
        if value:
            validate_upload(value, image_only=True)
        return value

class MemberInput(serializers.Serializer):
    user_id = serializers.UUIDField()
    role = serializers.ChoiceField(
        choices=['admin', 'member'],
        default='member')

class ReadInput(serializers.Serializer):
    sequence = serializers.IntegerField(min_value=0)

class MessageSerializer(serializers.ModelSerializer):
    chatId = serializers.UUIDField(source='chat.id')
    authorId = serializers.UUIDField(source='author_id')
    content = serializers.CharField(source='text')
    createdAt = serializers.DateTimeField(source='created_at')
    attachment = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ["id", "chatId", "authorId", "sequence",
                  "content", "createdAt", "attachment", "attempt_id"]

    def get_attachment(self, obj):
        if not obj.attachment:
            return None
        return {"name": obj.attachment_name, "mime": obj.attachment_mime,
                "url": f"/api/chat/chats/{obj.chat_id}/messages/{obj.id}/file/"}
