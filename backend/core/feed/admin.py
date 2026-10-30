from django.contrib import admin
from .models import Post, Like, Comment


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ("__str__", "author", "created_at")
    list_filter = ("created_at",)
    search_fields = ("text", "author__username", "author__first_name", "author__last_name")
    list_select_related = ("author",)
    autocomplete_fields = ("author",)
    readonly_fields = ("id", "created_at")
    ordering = ("-created_at",)
    date_hierarchy = "created_at"


@admin.register(Like)
class LikeAdmin(admin.ModelAdmin):
    list_display = ("user", "post")
    search_fields = ("user__username", "user__first_name", "user__last_name", "post__text")
    list_select_related = ("user", "post__author")
    autocomplete_fields = ("user", "post")


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("__str__", "post", "created_at")
    list_filter = ("created_at",)
    search_fields = ("text", "post__text", "author__username", "author__first_name", "author__last_name")
    list_select_related = ("author", "post__author")
    autocomplete_fields = ("author", "post")
    readonly_fields = ("id", "created_at")
    ordering = ("-created_at",)
    date_hierarchy = "created_at"
