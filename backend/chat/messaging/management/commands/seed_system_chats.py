from django.core.management.base import BaseCommand
from messaging.system_chats import seed_system_chats

class Command(BaseCommand):
    help = "Создать общий чат и пять чатов отделов без дубликатов"

    def handle(self, *args, **options):
        seed_system_chats()
        self.stdout.write(
            self.style.SUCCESS(
                "Готово: 6 встроенных чатов. Состав обновится при загрузке списка чатов."))
