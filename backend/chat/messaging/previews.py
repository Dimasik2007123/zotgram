import hashlib
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from io import BytesIO

from django.conf import settings
from PIL import Image, ImageOps, UnidentifiedImageError

from system.uploads import IMAGE_TYPES


PREVIEW_SIZE = (800, 600)
PREVIEW_QUALITY = 75
# Change the version when changing preview encoding or dimensions.
PREVIEW_VERSION = "v1"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".jfif", ".mpo", ".png", ".apng", ".webp", ".gif"}


class PreviewUnavailable(Exception):
    pass


def can_preview(mime, filename):
    if mime in IMAGE_TYPES.values():
        return True
    # Older MPO uploads were saved as generic files. Only offer a candidate
    # here: the decoder still validates the actual format and pixel limit.
    return (mime in ("", "application/octet-stream")
            and Path(filename).suffix.lower() in IMAGE_EXTENSIONS)


def render_preview(source):
    try:
        with Image.open(source) as image:
            if image.format not in IMAGE_TYPES or image.width * image.height > 20_000_000:
                raise PreviewUnavailable()
            # Opening an MPO/animation selects its first frame. Normalize EXIF
            # orientation before sizing and preserve alpha for transparent PNGs.
            with ImageOps.exif_transpose(image) as oriented:
                oriented.thumbnail(PREVIEW_SIZE, Image.Resampling.LANCZOS)
                mode = "RGBA" if "A" in oriented.getbands() or "transparency" in oriented.info else "RGB"
                with oriented.convert(mode) as preview:
                    output = BytesIO()
                    preview.save(output, "WEBP", quality=PREVIEW_QUALITY, method=4,
                                 icc_profile=image.info.get("icc_profile", b""))
                    return output.getvalue()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError) as exc:
        raise PreviewUnavailable() from exc


def open_preview(attachment):
    # Message attachments are immutable and their stored names contain a UUID.
    # Keep derived files private, alongside chat media, without database fields.
    key = hashlib.sha256(attachment.name.encode("utf-8")).hexdigest()
    path = Path(settings.MEDIA_ROOT) / "previews" / PREVIEW_VERSION / f"{key}.webp"
    try:
        return path.open("rb")
    except FileNotFoundError:
        pass

    try:
        with attachment.open("rb") as source:
            content = render_preview(source)
    except OSError as exc:
        raise PreviewUnavailable() from exc

    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with NamedTemporaryFile(dir=path.parent, suffix=".tmp", delete=False) as output:
            temporary = Path(output.name)
            output.write(content)
        # Concurrent workers may render the same image; readers must only see
        # complete WebP files, and no duplicate cache entries should remain.
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return path.open("rb")
