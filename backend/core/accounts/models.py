from uuid import uuid4
from colorsys import hsv_to_rgb
from random import randint
from django.contrib.auth.models import AbstractUser
from django.db import models

def random_user_color():
    hue = randint(0, 359) / 360
    saturation = randint(75, 95) / 100
    brightness = randint(75, 90) / 100
    red, green, blue = hsv_to_rgb(hue, saturation, brightness)
    return f"#{round(red * 255):02X}{round(green * 255):02X}{round(blue * 255):02X}"

class Department(models.Model):
    id = models.SlugField("Код отдела", primary_key=True, max_length=60)
    name = models.CharField("Название", max_length=100)

    class Meta:
        verbose_name = "отдел"
        verbose_name_plural = "Отделы"

    def __str__(self):
        return self.name

class User(AbstractUser):
    id = models.UUIDField("ID пользователя", primary_key=True, default=uuid4, editable=False)
    yandex_id = models.CharField(
        "ID в Яндексе", max_length=100, unique=True, null=True, blank=True)
    department = models.ForeignKey(
        Department, verbose_name="Отдел", null=True, blank=True, on_delete=models.SET_NULL)
    bio = models.TextField("О себе", blank=True, max_length=2000)
    phone = models.CharField("Телефон", max_length=40, blank=True)
    birth_date = models.DateField("Дата рождения", null=True, blank=True)
    avatar_color = models.CharField(
        "Цвет аватара", max_length=7, default=random_user_color, editable=False)

    class Meta(AbstractUser.Meta):
        verbose_name = "пользователь"
        verbose_name_plural = "Пользователи"

    def __str__(self):
        name = self.get_full_name()
        return f"{name} (@{self.username})" if name else self.username

class Follow(models.Model):
    follower = models.ForeignKey(
        User, verbose_name="Подписчик", on_delete=models.CASCADE, related_name="outgoing_follows")
    author = models.ForeignKey(
        User, verbose_name="Автор", on_delete=models.CASCADE, related_name="incoming_follows")

    class Meta:
        verbose_name = "подписка"
        verbose_name_plural = "Подписки"
        constraints = [
            models.UniqueConstraint(
                fields=["follower", "author"],
                name="unique_follow"),
            models.CheckConstraint(
                condition=~models.Q(follower=models.F("author")),
                name="no_self_follow"),]

    def __str__(self):
        return f"{self.follower} → {self.author}"
