from django.db.models import Case, IntegerField, Value, When
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.models import Follow
from .models import Post, Comment, Like
from .serializers import PostSerializer, CommentSerializer

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

class LikeView(APIView):
    def put(self, request, pk):
        post = get_object_or_404(Post, pk=pk)
        Like.objects.get_or_create(post=post, user=request.user)
        return Response(
            PostSerializer(post, context={'request': request}).data)

    def delete(self, request, pk):
        post = get_object_or_404(Post, pk=pk)
        Like.objects.filter(post=post, user=request.user).delete()
        return Response(
            PostSerializer(post, context={'request': request}).data)

class CommentView(generics.ListCreateAPIView):
    serializer_class = CommentSerializer

    def get_queryset(self):
        get_object_or_404(Post, pk=self.kwargs['pk'])
        return Comment.objects.filter(
            post_id=self.kwargs['pk']).select_related('author').order_by(
            'created_at', 'id')

    def perform_create(self, serializer):
        serializer.save(
            post=get_object_or_404(Post, pk=self.kwargs["pk"]),
            author=self.request.user)

class PostDetailView(generics.RetrieveAPIView):
    serializer_class = PostSerializer
    queryset = Post.objects.select_related('author', 'author__department')
