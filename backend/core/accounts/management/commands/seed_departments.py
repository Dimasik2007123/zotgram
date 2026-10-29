from django.core.management.base import BaseCommand
from accounts.models import Department

class Command(BaseCommand):
    help = "Создать справочник отделов без тестовых пользователей"

    def handle(self, *args, **options):
        for key, name in {
            "frontend": "Фронтенд", "backend": "Бэкенд", "design": "Дизайн",
                "management": "Менеджмент", "testing": "Тестирование"}.items():
            Department.objects.update_or_create(
                id=key, defaults={"name": name})
        self.stdout.write(self.style.SUCCESS("Отделы готовы"))
