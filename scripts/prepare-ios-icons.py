#!/usr/bin/env python3
"""Regenerate checked-in legacy iOS icons from build/icon.png using Pillow.

This optional maintainer tool requires the open-source Pillow package. Normal
iOS builds copy the resulting PNGs and need no image compiler or Pillow install.
"""
from pathlib import Path

from PIL import Image


def main():
    root = Path(__file__).resolve().parent.parent
    destination = root / 'ios' / 'icons'
    destination.mkdir(exist_ok=True)
    sizes = {'Icon-60@2x.png': 120, 'Icon-60@3x.png': 180,
             'Icon-76@2x.png': 152, 'Icon-83.5@2x.png': 167}
    with Image.open(root / 'build' / 'icon.png') as original:
        source = original.convert('RGBA')
        resampling = getattr(Image, 'Resampling', Image)
        for name, size in sizes.items():
            icon = source.resize((size, size), resampling.LANCZOS)
            opaque = Image.new('RGB', icon.size, 'white')
            opaque.paste(icon, mask=icon.getchannel('A'))
            opaque.save(destination / name, format='PNG', optimize=True)


if __name__ == '__main__':
    main()
