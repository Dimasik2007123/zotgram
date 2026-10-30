from django.db import models
from django.utils.text import Truncator
from uuid import uuid4
from system.uploads import upload_path

class Chat(models.Model):
    id = models.UUIDField("ID чата", primary_key=True, default=uuid4, editable=False)
    type = models.CharField("Тип чата", max_length=10, choices=[
                            ('personal', 'Личный'), ('group', 'Группа')])
    direct_key = models.CharField(
        "Ключ личного чата", max_length=75, unique=True, null=True, blank=True)
    system_key = models.SlugField(
        "Ключ системного чата", max_length=80, unique=True, null=True, blank=True)
    department_id = models.SlugField("Код отдела", max_length=60, blank=True)
    name = models.CharField("Название", max_length=150)
    avatar = models.FileField("Аватар", upload_to=upload_path, blank=True)
    last_sequence = models.PositiveBigIntegerField("Номер последнего сообщения", default=0)
    created_at = models.DateTimeField("Дата создания", auto_now_add=True)
    updated_at = models.DateTimeField("Дата обновления", auto_now=True, db_index=True)

    class Meta:
        verbose_name = "чат"
        verbose_name_plural = "Чаты"

    def __str__(self):
        if self.name.strip():
            return self.name.strip()
        kind = "Личный чат" if self.type == "personal" else "Групповой чат"
        return f"{kind} ({str(self.pk)[:8]})"

class Membership(models.Model):
    chat = models.ForeignKey(
        Chat, verbose_name="Чат", on_delete=models.CASCADE, related_name='memberships')
    user_id = models.UUIDField("ID пользователя", db_index=True,
                               help_text="ID пользователя из основного сервиса ZotGram.")
    role = models.CharField(
        "Роль", max_length=10, choices=[('admin', 'Администратор'),
                                ('member', 'Участник')],
        default='member')
    last_read_sequence = models.PositiveBigIntegerField("Номер последнего прочитанного сообщения", default=0)

    class Meta:
        verbose_name = "участник чата"
        verbose_name_plural = "Участники чатов"
        constraints = [
            models.UniqueConstraint(
                fields=['chat', 'user_id'],
                name='unique_chat_member')]

    def __str__(self):
        return f"{self.get_role_display()} в чате «{self.chat}» ({str(self.user_id)[:8]})"

class Message(models.Model):
    id = models.UUIDField("ID сообщения", primary_key=True, default=uuid4, editable=False)
    chat = models.ForeignKey(
        Chat, verbose_name="Чат", on_delete=models.CASCADE, related_name="messages")
    author_id = models.UUIDField("ID автора", help_text="ID пользователя из основного сервиса ZotGram.")
    sequence = models.PositiveBigIntegerField("Номер сообщения в чате")
    attempt_id = models.UUIDField("ID попытки отправки", help_text="Ключ защиты от повторной отправки сообщения.")
    text = models.TextField("Текст", blank=True, max_length=10000)
    attachment = models.FileField("Вложение", upload_to=upload_path, blank=True)
    attachment_name = models.CharField("Имя файла", max_length=200, blank=True)
    attachment_mime = models.CharField("MIME-тип файла", max_length=100, blank=True)
    created_at = models.DateTimeField("Дата отправки", auto_now_add=True)

    class Meta:
        verbose_name = "сообщение"
        verbose_name_plural = "Сообщения"
        constraints = [
            models.UniqueConstraint(
                fields=["chat", "sequence"],
                name="unique_chat_sequence"),
            models.UniqueConstraint(
                fields=["chat", "author_id", "attempt_id"],
                name="unique_send_attempt"),]
        ordering = ["sequence"]

    def __str__(self):
        text = " ".join(self.text.split()) or self.attachment_name or ("Вложение" if self.attachment else "Без текста")
        return f"{self.chat} · №{self.sequence}: {Truncator(text).chars(70)}"
