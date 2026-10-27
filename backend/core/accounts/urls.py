from django.urls import path
from . import oauth, views

urlpatterns = [
    path('auth/csrf/', oauth.csrf),
    path('auth/start/', oauth.start),
    path('auth/callback/', oauth.callback),
    path('auth/refresh/', oauth.refresh),
    path('auth/logout/', oauth.logout),
    path('me/', views.MeView.as_view()),
    path('departments/', views.DepartmentView.as_view()),
    path('users/', views.UsersView.as_view()),
    path('users/batch/', views.UserBatchView.as_view()),
    path('users/<uuid:pk>/', views.UserView.as_view()),
    path('users/<uuid:pk>/follow/', views.FollowView.as_view()),]
