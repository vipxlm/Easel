"""Small WebP derivatives for UI previews; source files remain untouched."""
import hashlib
import os
from pathlib import Path
import tempfile

from PIL import Image, ImageOps

PREVIEW_EDGE = 640
PREVIEW_QUALITY = 68


def image_preview(source: Path, cache_dir: Path | None = None) -> Path:
    cache_dir = cache_dir or Path(tempfile.gettempdir()) / 'easel-image-previews'
    cache_dir.mkdir(parents=True, exist_ok=True)
    stat = source.stat()
    key = hashlib.sha256(f'{source.resolve()}:{stat.st_mtime_ns}:{stat.st_size}'.encode()).hexdigest()
    target = cache_dir / f'{key}.webp'
    if target.is_file():
        return target
    # Unique temporary files + atomic replace keep concurrent requests safe.
    descriptor, temp_name = tempfile.mkstemp(suffix='.webp', dir=cache_dir)
    os.close(descriptor)
    temp = Path(temp_name)
    try:
        with Image.open(source) as original:
            image = ImageOps.exif_transpose(original)
            image.thumbnail((PREVIEW_EDGE, PREVIEW_EDGE))
            image = image.convert('RGBA' if 'A' in image.getbands() or 'transparency' in image.info else 'RGB')
            image.save(temp, format='WEBP', quality=PREVIEW_QUALITY, method=4)
        temp.replace(target)
    finally:
        temp.unlink(missing_ok=True)
    return target
