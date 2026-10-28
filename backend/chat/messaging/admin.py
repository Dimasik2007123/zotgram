from django.contrib import admin
from .models import Chat, Membership, Message

# Register your models here.
admin.site.register(Chat)
admin.site.register(Membership)
admin.site.register(Message)
