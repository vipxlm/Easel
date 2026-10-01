import asyncio
import hashlib
import os
from pathlib import Path

from PIL import Image
import pytest
from fastapi import HTTPException

from easel.media_preview import image_preview
import web.app as web


def test_preview_is_small_webp_cached_and_original_untouched(tmp_path):
    source = tmp_path / '原图.png'
    Image.new('RGB', (2160, 2880), 'red').save(source)
    before = hashlib.sha256(source.read_bytes()).hexdigest()
    cache = tmp_path / 'cache'
    preview = image_preview(source, cache)
    with Image.open(preview) as image:
        assert image.format == 'WEBP'
        assert image.size == (480, 640)
    assert preview.stat().st_size < source.stat().st_size
    mtime = preview.stat().st_mtime_ns
    assert image_preview(source, cache) == preview
    assert preview.stat().st_mtime_ns == mtime
    assert hashlib.sha256(source.read_bytes()).hexdigest() == before
    Image.new('RGB', (2160, 2880), 'blue').save(source)
    os.utime(source, ns=(source.stat().st_atime_ns, source.stat().st_mtime_ns + 1_000_000))
    assert image_preview(source, cache) != preview


def test_transparency_and_exif_orientation(tmp_path):
    png = tmp_path / 'alpha.png'
    Image.new('RGBA', (100, 100), (10, 20, 30, 0)).save(png)
    with Image.open(image_preview(png, tmp_path / 'cache')) as image:
        assert image.mode == 'RGBA'
        assert image.getpixel((0, 0))[3] == 0
    jpg = tmp_path / 'rotated.jpg'
    exif = Image.Exif()
    exif[274] = 6
    Image.new('RGB', (800, 400), 'red').save(jpg, exif=exif)
    with Image.open(image_preview(jpg, tmp_path / 'cache')) as image:
        assert image.size == (320, 640)


def test_media_preview_keeps_path_guard_and_rejects_non_images(tmp_path, monkeypatch):
    outputs = tmp_path / 'outputs'
    outputs.mkdir()
    monkeypatch.setattr(web, 'OUTPUTS_DIR', outputs)
    (outputs / '文档.txt').write_text('hello')
    for path, status in [('../secret.png',403), ('missing.png',404), ('文档.txt',415)]:
        with pytest.raises(HTTPException) as exc:
            asyncio.run(web.api_media(path, preview=True))
        assert exc.value.status_code == status
    (outputs / 'broken.png').write_text('invalid image')
    with pytest.raises(HTTPException) as exc:
        asyncio.run(web.api_media('broken.png',preview=True))
    assert exc.value.status_code == 415
