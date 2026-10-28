from uuid import uuid4
from django.conf import settings
from django.db import models
from system.uploads import upload_path


class Post(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    text = models.TextField(blank=True, max_length=10000)
    image = models.FileField(upload_to=upload_path, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
