from random import choice

import accounts.models
from django.db import migrations, models


def fill_user_colors(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    colors = (
        "#4A6CF7", "#247452", "#A24A67", "#825BB3", "#AC6A21", "#237F8D",
        "#C2413B", "#7052A3", "#28784E", "#B34779", "#315EAD", "#946117",
    )
    users = User.objects.using(schema_editor.connection.alias)
    for user in users.filter(avatar_color__isnull=True).iterator():
        users.filter(pk=user.pk).update(avatar_color=choice(colors))


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="user",
            name="avatar_color",
            field=models.CharField(max_length=7, null=True, editable=False),
        ),
        migrations.RunPython(fill_user_colors, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="user",
            name="avatar_color",
            field=models.CharField(
                max_length=7, default=accounts.models.random_user_color, editable=False
            ),
        ),
    ]
