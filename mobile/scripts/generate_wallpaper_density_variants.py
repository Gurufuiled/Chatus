"""
Создаёт @2x и @3x PNG рядом с базовым файлом (имя@2x.png / имя@3x.png).
Metro/React Native подставляет вариант по PixelRatio — меньше «мыла» на 2x/3x экранах.

Требует: pip install Pillow
Пример:
  python mobile/scripts/generate_wallpaper_density_variants.py bg_night_doodle.png
  python mobile/scripts/generate_wallpaper_density_variants.py bg_default_light_doodle.png
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "src" / "assets" / "chat-themes"


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: generate_wallpaper_density_variants.py <filename.png>")
        sys.exit(1)
    name = sys.argv[1]
    src = ROOT / name
    if not src.exists():
        print(f"Missing: {src}")
        sys.exit(1)
    stem = src.stem
    if "@" in stem:
        print("Pass the base file without @2x/@3x suffix.")
        sys.exit(1)
    im = Image.open(src).convert("RGB")
    w, h = im.size
    for tag, mul in (("@2x", 2), ("@3x", 3)):
        out = im.resize((w * mul, h * mul), Image.Resampling.LANCZOS)
        dest = ROOT / f"{stem}{tag}.png"
        out.save(dest, format="PNG", optimize=True)
        kb = dest.stat().st_size // 1024
        print(f"Wrote {dest.name} {out.size} ~{kb} KB")


if __name__ == "__main__":
    main()
