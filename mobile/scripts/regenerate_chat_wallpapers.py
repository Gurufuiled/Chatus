"""
Upscale preset chat wallpaper JPEGs to PNG (1536) + light grain against banding.
Тёмная «Без темы» в приложении: нативный bg_night_doodle.png — этот скрипт его не трогает.

Requires: pip install Pillow
Run: python mobile/scripts/regenerate_chat_wallpapers.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1] / "src" / "assets" / "chat-themes"


def add_grain(rgb: Image.Image, sigma: float = 3.5, blend: float = 0.045) -> Image.Image:
    """Blend subtle Gaussian noise to mask JPEG banding on gradients (fast)."""
    w, h = rgb.size
    noise = Image.effect_noise((w, h), sigma).convert("RGB")
    out = Image.blend(rgb, noise, blend)
    return out.filter(ImageFilter.GaussianBlur(radius=0.15))


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
    for stem in ("bg_cyberpunk_doodle", "bg_snow_doodle", "bg_holiday_doodle"):
        process_square_jpeg(stem)
    print("Done.")


if __name__ == "__main__":
    main()
