from django.contrib import admin
from .models import Chat, Membership, Message

@admin.register(Chat)
class ChatAdmin(admin.ModelAdmin):
    list_display = ("__str__", "type", "department_id", "updated_at")
    list_filter = ("type", "department_id")
    search_fields = ("name", "system_key", "department_id", "id")
    readonly_fields = ("id", "system_key", "department_id", "created_at", "updated_at")
    ordering = ("-updated_at",)

    def get_readonly_fields(self, request, obj=None):
        if obj and obj.system_key:
            return self.readonly_fields + ("type", "name", "avatar")
        return self.readonly_fields

    def has_delete_permission(self, request, obj=None):
        return super().has_delete_permission(
            request, obj) and not (
            obj and obj.system_key)

    def get_actions(self, request):
        actions = super().get_actions(request)
        actions.pop("delete_selected", None)
        return actions


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ("__str__", "user_id", "last_read_sequence")
    list_filter = ("role", "chat__type")
    search_fields = ("chat__name", "user_id")
    list_select_related = ("chat",)
    autocomplete_fields = ("chat",)


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("__str__", "author_id", "created_at")
    list_filter = ("created_at", "chat__type")
    search_fields = ("text", "attachment_name", "chat__name", "author_id", "id")
    list_select_related = ("chat",)
    autocomplete_fields = ("chat",)
    readonly_fields = ("id", "created_at")
    ordering = ("-created_at",)
    date_hierarchy = "created_at"
