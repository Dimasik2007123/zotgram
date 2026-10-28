from django.db.models import Case, IntegerField, Value, When
from rest_framework import generics
from accounts.models import Follow
from .models import Post
from .serializers import PostSerializer


class PostsView(generics.ListCreateAPIView):
    serializer_class = PostSerializer

    def get_queryset(self):
        qs = Post.objects.select_related('author', 'author__department')
        params = self.request.query_params
        if params.get('author'):
            from uuid import UUID
            from rest_framework.exceptions import ValidationError
            try:
                author_id = UUID(params.get('author'))
            except ValueError:
                raise ValidationError({'author': 'Неверный UUID.'})
            qs = qs.filter(author_id=author_id)
        else:
            qs = qs.exclude(author=self.request.user)
        if params.get('q'):
            qs = qs.filter(text__icontains=params['q'][:100])
        following = Follow.objects.filter(
            follower=self.request.user).values('author_id')
        return qs.annotate(
            priority=Case(
                When(author_id__in=following, then=Value(0)),
                default=Value(1),
                output_field=IntegerField())).order_by(
            'priority', '-created_at', '-id')

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)
