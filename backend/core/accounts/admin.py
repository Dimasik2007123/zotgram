from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, Department, Follow

@admin.register(User)
class AccountsAdmin(UserAdmin):
    list_display = ("__str__", "email", "department", "is_staff", "is_active")
    list_filter = UserAdmin.list_filter + ("department",)
    list_select_related = ("department",)
    autocomplete_fields = ("department",)
    readonly_fields = ("id", "avatar_color")
    fieldsets = UserAdmin.fieldsets + (("Профиль ZotGram", {"fields": (
        "yandex_id", "department", "bio", "phone", "birth_date", "avatar_color",
    )}), ("Идентификатор", {"fields": ("id",), "classes": ("collapse",)}))


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "id")
    search_fields = ("name", "id")
    ordering = ("name",)


@admin.register(Follow)
class FollowAdmin(admin.ModelAdmin):
    list_display = ("follower", "author")
    list_select_related = ("follower", "author")
    autocomplete_fields = ("follower", "author")
    search_fields = (
        "follower__username", "follower__first_name", "follower__last_name",
        "author__username", "author__first_name", "author__last_name",
    )
