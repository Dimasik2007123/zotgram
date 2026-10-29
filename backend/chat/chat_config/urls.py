from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView

urlpatterns = [
    path("admin/chat/", admin.site.urls),
    path("admin/", RedirectView.as_view(pattern_name="admin:index")),
    path("api/chat/", include("system.urls")),
    path("api/chat/", include("messaging.urls")),
]
