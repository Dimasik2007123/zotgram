from pathlib import Path
from uuid import uuid4
from PIL import Image, UnidentifiedImageError
from rest_framework.exceptions import ValidationError

IMAGE_TYPES = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp", "GIF": "image/gif"}


def upload_path(instance, filename):
    return f"uploads/{uuid4().hex}{Path(filename).suffix.lower()}"


def validate_upload(file, image_only=False):
    if not file:
        return None
    if file.size > (5 if image_only else 10) * 1024 * 1024:
        raise ValidationError("Файл слишком большой: фото до 5 МБ, вложения до 10 МБ.")
    try:
        with Image.open(file) as image:
            fmt = image.format
            if image.width * image.height > 20_000_000:
                raise ValidationError("Слишком большое разрешение изображения.")
            image.verify()
        if fmt not in IMAGE_TYPES:
            raise ValidationError("Для фото поддерживаются JPEG, PNG, WEBP и GIF.")
        mime = IMAGE_TYPES[fmt]
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        if image_only:
            raise ValidationError("Нужен корректный файл изображения.")
        mime = "application/octet-stream"
    except ValidationError:
        if image_only:
            raise
        # Любой другой файл можно отправить вложением без предпросмотра.
        mime = "application/octet-stream"
    finally:
        file.seek(0)
    return mime
