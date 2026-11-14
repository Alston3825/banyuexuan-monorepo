"""把上传的合同文件（PDF / 手机照片）统一渲染成"每页一张 JPEG"。

- PDF：用 PyMuPDF 按页渲染（扫描件 PDF 每页就是一张图）。
- 图片：修正手机照片的 EXIF 方向，转成 JPEG。
- 每页有两档清晰度：普通档给整页识别用；高清档给"再读一遍潦草字段"用（按需才渲染）。
"""
import io
from dataclasses import dataclass
from typing import Callable, List, Tuple

import fitz  # PyMuPDF
from PIL import Image, ImageOps

try:  # 苹果手机相册的 HEIC 照片：装了 pillow-heif 就能直接读
    import pillow_heif

    pillow_heif.register_heif_opener()
except ImportError:  # pragma: no cover
    pass

NORMAL_LONG_SIDE = 1800
HIRES_LONG_SIDE = 2600
MAX_PAGES = 40


@dataclass
class PageImage:
    index: int  # 从 1 开始，跨文件连续编号
    source_name: str
    jpeg: bytes
    hires: Callable[[int], bytes]  # 参数=长边像素；多次采样时用不同清晰度


def _image_to_jpeg(data: bytes, long_side: int) -> bytes:
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    w, h = img.size
    scale = long_side / max(w, h)
    if scale < 1:
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=82)
    return buf.getvalue()


def _pdf_page_jpeg(doc: "fitz.Document", n: int, long_side: int) -> bytes:
    page = doc[n]
    rect = page.rect
    zoom = long_side / max(rect.width, rect.height)
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
    return pix.tobytes("jpeg", jpg_quality=82)


def render_pages(files: List[Tuple[str, bytes]]) -> List[PageImage]:
    pages: List[PageImage] = []
    for name, data in files:
        if data[:4] == b"%PDF":
            doc = fitz.open(stream=data, filetype="pdf")
            for n in range(len(doc)):
                pages.append(
                    PageImage(
                        index=len(pages) + 1,
                        source_name=name,
                        jpeg=_pdf_page_jpeg(doc, n, NORMAL_LONG_SIDE),
                        hires=(lambda long_side=HIRES_LONG_SIDE, d=doc, i=n: _pdf_page_jpeg(d, i, long_side)),
                    )
                )
        else:
            try:
                jpeg = _image_to_jpeg(data, NORMAL_LONG_SIDE)
            except Exception as exc:  # PIL 对不支持的格式会抛多种异常
                raise ValueError("文件「%s」不是可识别的 PDF 或图片（支持 PDF/JPG/PNG）" % name) from exc
            pages.append(
                PageImage(
                    index=len(pages) + 1,
                    source_name=name,
                    jpeg=jpeg,
                    hires=(lambda long_side=HIRES_LONG_SIDE, raw=data: _image_to_jpeg(raw, long_side)),
                )
            )
        if len(pages) > MAX_PAGES:
            raise ValueError("合同页数过多（最多 %d 页）" % MAX_PAGES)
    if not pages:
        raise ValueError("没有收到任何合同文件")
    return pages
