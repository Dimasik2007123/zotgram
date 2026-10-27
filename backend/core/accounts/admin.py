from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, Department, Follow

# Register your models here.


@admin.register(User)
class AccountsAdmin(UserAdmin):
    readonly_fields = ("avatar_color",)
    fieldsets = UserAdmin.fieldsets + (("ZotGram", {"fields": (
        "yandex_id", "department", "bio", "phone", "birth_date", "avatar_color",
    )}),)


admin.site.register([Department, Follow])
