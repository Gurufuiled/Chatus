"""
One-off / repeatable: upscales chat wallpaper assets and saves as PNG
to reduce JPEG banding (dark stripes) and improve sharpness on tall phones.

Requires: pip install Pillow
Run from repo root: python mobile/scripts/regenerate_chat_wallpapers.py
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1] / "src" / "assets" / "chat-themes"


def cover_resize(im: Image.Image, tw: int, th: int) -> Image.Image:
    """Scale image to cover (tw, th), center crop."""
    sw, sh = im.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(math.ceil(sw * scale)), int(math.ceil(sh * scale))
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    x0 = (nw - tw) // 2
    y0 = (nh - th) // 2
    return im.crop((x0, y0, x0 + tw, y0 + th))


def add_grain(rgb: Image.Image, sigma: float = 3.5, blend: float = 0.045) -> Image.Image:
    """Blend subtle Gaussian noise to mask JPEG banding on gradients (fast)."""
    w, h = rgb.size
    noise = Image.effect_noise((w, h), sigma).convert("RGB")
    out = Image.blend(rgb, noise, blend)
    return out.filter(ImageFilter.GaussianBlur(radius=0.15))


def process_default_dark() -> None:
    src_j = ROOT / "bg_default_dark_doodle.jpg"
    src_p = ROOT / "bg_default_dark_doodle.png"
    src = src_j if src_j.exists() else src_p
    out = ROOT / "bg_default_dark_doodle.png"
    im = Image.open(src).convert("RGB")
    # Match light / night canvas for consistent cover scaling on phones.
    im = cover_resize(im, 1536, 1024)
    im = add_grain(im, sigma=4.0, blend=0.055)
    im.save(out, format="PNG", optimize=True)
    print(f"Wrote {out.name} {im.size} from {src.name}")


def process_square_jpeg(stem: str) -> None:
    """stem e.g. bg_cyberpunk_doodle — reads .jpg if present else existing .png."""
    src_j = ROOT / f"{stem}.jpg"
    src_p = ROOT / f"{stem}.png"
    src = src_j if src_j.exists() else src_p
    if not src.exists():
        return
    out = ROOT / f"{stem}.png"
    im = Image.open(src).convert("RGB")
    im = im.resize((1536, 1536), Image.Resampling.LANCZOS)
    im = add_grain(im, sigma=3.0, blend=0.035)
    im.save(out, format="PNG", optimize=True)
    print(f"Wrote {out.name} {im.size} from {src.name}")


def main() -> None:
    process_default_dark()
    for stem in ("bg_cyberpunk_doodle", "bg_snow_doodle", "bg_holiday_doodle"):
        process_square_jpeg(stem)
    print("Done.")


if __name__ == "__main__":
    main()
