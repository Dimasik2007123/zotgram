from django.urls import path
from . import views

urlpatterns = [
    path('direct/', views.DirectView.as_view(), name='direct'),
    path('chats/', views.ChatsView.as_view(), name='chats'),
    path('unread/', views.UnreadView.as_view(), name='unread'),
    path('ws-ticket/', views.TicketView.as_view(), name='ws-ticket'),
    path('chats/<uuid:pk>/', views.ChatView.as_view(), name='chat'),
    path('chats/<uuid:pk>/members/', views.MembersView.as_view(), name='members'),
    path('chats/<uuid:pk>/members/<uuid:user_id>/', views.MembersView.as_view(), name='member'),
    path('chats/<uuid:pk>/messages/', views.MessagesView.as_view(), name='messages'),
    path('chats/<uuid:pk>/read/', views.ReadView.as_view()),
    path('chats/<uuid:pk>/avatar/', views.AvatarView.as_view(), name='chat-avatar'),
    path('chats/<uuid:pk>/messages/<uuid:message_id>/file/', views.FileView.as_view(), name='message-file'),
    path('chats/<uuid:pk>/messages/<uuid:message_id>/preview/', views.PreviewView.as_view(), name='message-preview'),
]
