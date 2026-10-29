from django.urls import path
from .views import PostsView, LikeView, CommentView, PostDetailView

urlpatterns = [
    path('posts/', PostsView.as_view(), name='posts'),
    path('posts/<uuid:pk>/', PostDetailView.as_view(), name='post-detail'),
    path('posts/<uuid:pk>/like/', LikeView.as_view(), name='like'),
    path('posts/<uuid:pk>/comments/', CommentView.as_view(), name='comments'),
]
