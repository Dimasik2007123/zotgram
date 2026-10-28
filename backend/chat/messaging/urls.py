from django.urls import path
from . import views

urlpatterns = [
    path('direct/', views.DirectView.as_view(), name='direct'),
    path('chats/', views.ChatsView.as_view(), name='chats'),
    path('ws-ticket/', views.TicketView.as_view(), name='ws-ticket'),
    path('chats/<uuid:pk>/', views.ChatView.as_view(), name='chat'),
    path('chats/<uuid:pk>/messages/', views.MessagesView.as_view(), name='messages'),
]
