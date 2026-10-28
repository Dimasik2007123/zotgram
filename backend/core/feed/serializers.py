from rest_framework import serializers
from accounts.serializers import UserSerializer
from system.uploads import validate_upload
from .models import Post


class PostSerializer(serializers.ModelSerializer):
    userId = serializers.UUIDField(source='author_id', read_only=True)
    author = UserSerializer(read_only=True)
    date = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = Post
        fields = ['id', 'userId', 'author', 'text', 'image', 'date']

    def validate_image(self, value):
        validate_upload(value, image_only=True)
        return value

    def validate(self, attrs):
        if not attrs.get('text', '').strip() and (not attrs.get('image')):
            raise serializers.ValidationError(
                'Добавьте текст или изображение.')
        return attrs

    def to_representation(self, instance):
        from urllib.parse import urlsplit
        data = super().to_representation(instance)
        if data.get('image'):
            data['image'] = urlsplit(data['image']).path
        return data
