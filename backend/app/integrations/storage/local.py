import io, uuid
from pathlib import Path
from PIL import Image, UnidentifiedImageError
from ...config import get_settings
from ...core.exceptions import AppError

ALLOWED = {'JPEG': ('image/jpeg', 'jpg'), 'PNG': ('image/png', 'png'), 'WEBP': ('image/webp', 'webp')}


class InvalidUpload(AppError):
    status, code = 400, 'INVALID_UPLOAD'


def inspect_image(data: bytes) -> tuple[str, str, int, int]:
    """Validate by decoding the actual bytes, not the browser's declared MIME type."""
    s = get_settings()
    if len(data) > s.max_upload_size_mb * 1024 * 1024:
        raise InvalidUpload(f'Image is larger than {s.max_upload_size_mb} MB.', code='UPLOAD_TOO_LARGE', status=413)
    if not data:
        raise InvalidUpload('Empty file.')
    try:
        with Image.open(io.BytesIO(data)) as im:
            fmt = im.format; w, h = im.size; im.verify()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise InvalidUpload('File is not a valid JPEG, PNG or WebP image.', code='UNSUPPORTED_MEDIA_TYPE', status=415)
    if fmt not in ALLOWED:
        raise InvalidUpload('Only JPEG, PNG or WebP images are accepted.', code='UNSUPPORTED_MEDIA_TYPE', status=415)
    mime, ext = ALLOWED[fmt]
    return mime, ext, w, h


class LocalStorage:
    """Files are stored under generated keys, never user-supplied names, outside any public static directory."""
    def __init__(self, root: str | None = None):
        self.root = Path(root or get_settings().local_storage_path).resolve(); self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if self.root not in p.parents:
            raise InvalidUpload('Invalid storage key.')
        return p

    def put(self, data: bytes, ext: str, prefix: str) -> str:
        key = f'{prefix}/{uuid.uuid4().hex}.{ext}'
        p = self._path(key); p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(data)
        return key

    def get(self, key: str) -> bytes: return self._path(key).read_bytes()

    def delete(self, key: str) -> None: self._path(key).unlink(missing_ok=True)


_storage: LocalStorage | None = None


def get_storage() -> LocalStorage:
    global _storage
    if _storage is None:
        if get_settings().storage_provider != 'local':
            raise AppError('Only STORAGE_PROVIDER=local is implemented. A Cloud Storage adapter is not included yet.', code='STORAGE_NOT_CONFIGURED', status=500)
        _storage = LocalStorage()
    return _storage


def reset_storage() -> None:
    global _storage
    _storage = None
