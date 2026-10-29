from django.contrib import admin
from .models import Chat, Membership, Message

@admin.register(Chat)
class ChatAdmin(admin.ModelAdmin):
    readonly_fields = ("system_key", "department_id")

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

admin.site.register(Membership)
admin.site.register(Message)
