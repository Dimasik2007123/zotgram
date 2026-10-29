from django.db import models
from uuid import uuid4
from system.uploads import upload_path

class Chat(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    type = models.CharField(max_length=10, choices=[
                            ('personal', 'Личный'), ('group', 'Группа')])
    direct_key = models.CharField(
        max_length=75, unique=True, null=True, blank=True)
    system_key = models.SlugField(
        max_length=80, unique=True, null=True, blank=True)
    department_id = models.SlugField(max_length=60, blank=True)
    name = models.CharField(max_length=150)
    avatar = models.FileField(upload_to=upload_path, blank=True)
    last_sequence = models.PositiveBigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    def __str__(self):
        return self.name

class Membership(models.Model):
    chat = models.ForeignKey(
        Chat, on_delete=models.CASCADE, related_name='memberships')
    user_id = models.UUIDField(db_index=True)
    role = models.CharField(
        max_length=10, choices=[('admin', 'Админ'),
                                ('member', 'Участник')],
        default='member')
    last_read_sequence = models.PositiveBigIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['chat', 'user_id'],
                name='unique_chat_member')]

class Message(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    chat = models.ForeignKey(
        Chat, on_delete=models.CASCADE, related_name="messages")
    author_id = models.UUIDField()
    sequence = models.PositiveBigIntegerField()
    attempt_id = models.UUIDField()
    text = models.TextField(blank=True, max_length=10000)
    attachment = models.FileField(upload_to=upload_path, blank=True)
    attachment_name = models.CharField(max_length=200, blank=True)
    attachment_mime = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["chat", "sequence"],
                name="unique_chat_sequence"),
            models.UniqueConstraint(
                fields=["chat", "author_id", "attempt_id"],
                name="unique_send_attempt"),]
        ordering = ["sequence"]
