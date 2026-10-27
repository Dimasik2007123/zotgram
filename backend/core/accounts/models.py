from uuid import uuid4
from colorsys import hsv_to_rgb
from random import randint
from django.contrib.auth.models import AbstractUser
from django.db import models
# Create your models here.


def random_user_color():
    hue = randint(0, 359) / 360
    saturation = randint(55, 85) / 100
    brightness = randint(45, 70) / 100
    red, green, blue = hsv_to_rgb(hue, saturation, brightness)
    return f"#{round(red * 255):02X}{round(green * 255):02X}{round(blue * 255):02X}"


class Department(models.Model):
    id = models.SlugField(primary_key=True, max_length=60)
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    yandex_id = models.CharField(
        max_length=100, unique=True, null=True, blank=True)
    department = models.ForeignKey(
        Department, null=True, blank=True, on_delete=models.SET_NULL)
    bio = models.TextField(blank=True, max_length=2000)
    phone = models.CharField(max_length=40, blank=True)
    birth_date = models.DateField(null=True, blank=True)
    avatar_color = models.CharField(
        max_length=7, default=random_user_color, editable=False)


class Follow(models.Model):
    follower = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="outgoing_follows")
    author = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="incoming_follows")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["follower", "author"],
                name="unique_follow"),
            models.CheckConstraint(
                condition=~models.Q(follower=models.F("author")),
                name="no_self_follow"),]
