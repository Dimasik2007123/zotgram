from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/chat/", include("system.urls")),
    path("api/chat/", include("messaging.urls")),
]
