from uuid import uuid4
from django.conf import settings
from django.db import models
from django.utils.text import Truncator
from system.uploads import upload_path

class Post(models.Model):
    id = models.UUIDField("ID публикации", primary_key=True, default=uuid4, editable=False)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="Автор", on_delete=models.CASCADE)
    text = models.TextField("Текст", blank=True, max_length=10000)
    image = models.FileField("Изображение", upload_to=upload_path, blank=True)
    created_at = models.DateTimeField("Дата публикации", auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "публикация"
        verbose_name_plural = "Публикации"

    def __str__(self):
        text = " ".join(self.text.split()) or ("Публикация с изображением" if self.image else "Без текста")
        return f"{self.author}: {Truncator(text).chars(70)}"

class Like(models.Model):
    post = models.ForeignKey(
        Post, verbose_name="Публикация", on_delete=models.CASCADE, related_name='likes')
    user = models.ForeignKey(settings.AUTH_USER_MODEL,
                             verbose_name="Пользователь", on_delete=models.CASCADE)

    class Meta:
        verbose_name = "отметка «Нравится»"
        verbose_name_plural = "Отметки «Нравится»"
        constraints = [
            models.UniqueConstraint(
                fields=['post', 'user'],
                name='unique_post_like')]

    def __str__(self):
        return f"{self.user} — нравится «{self.post}»"

class Comment(models.Model):
    id = models.UUIDField("ID комментария", primary_key=True, default=uuid4, editable=False)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="Автор", on_delete=models.CASCADE)
    post = models.ForeignKey(
        Post, verbose_name="Публикация", on_delete=models.CASCADE, related_name='comments')
    text = models.TextField("Текст", max_length=3000)
    created_at = models.DateTimeField("Дата создания", auto_now_add=True)

    class Meta:
        verbose_name = "комментарий"
        verbose_name_plural = "Комментарии"

    def __str__(self):
        return f"{self.author}: {Truncator(' '.join(self.text.split())).chars(70)}"
