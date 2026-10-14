#!/usr/bin/env python3
"""Build talk@2x.swf: the original bubble with its backdrop bitmap redrawn at twice the size.

The redraws (issue #19) are scaled to exactly 2x the original bitmap and replace it
losslessly; the fill matrix is halved so the bubble keeps its stage geometry, text and buttons.

  python3 scripts/talk-hd.py <dir with talk1.png..talk4.png> resources/pet/talk
"""
import struct
import sys
import zlib
from io import BytesIO
from pathlib import Path

from PIL import Image

SHAPES = {2: 1, 22: 2, 32: 3, 83: 4}


class Bits:
    def __init__(self, data: bytes, pos: int):
        self.data, self.bit = data, pos * 8

    def u(self, n: int) -> int:
        v = 0
        for _ in range(n):
            v = v << 1 | (self.data[self.bit >> 3] >> (7 - (self.bit & 7)) & 1)
            self.bit += 1
        return v

    def s(self, n: int) -> int:
        v = self.u(n)
        return v - (1 << n) if n and v >> (n - 1) else v

    def align(self) -> int:
        self.bit = (self.bit + 7) & ~7
        return self.bit >> 3


class Writer:
    def __init__(self):
        self.out, self.acc, self.n = bytearray(), 0, 0

    def put(self, v: int, n: int) -> None:
        for i in range(n - 1, -1, -1):
            self.acc = self.acc << 1 | (v >> i & 1)
            self.n += 1
            if self.n == 8:
                self.out.append(self.acc)
                self.acc = self.n = 0

    def bytes(self) -> bytes:
        if self.n:
            self.put(0, 8 - self.n)
        return bytes(self.out)


def width(*values: int) -> int:
    return max(max(v.bit_length() + 1 if v >= 0 else (~v).bit_length() + 1 for v in values), 1)


def read_matrix(data: bytes, pos: int) -> tuple[list, int]:
    b = Bits(data, pos)
    scale = [b.s(n), b.s(n)] if b.u(1) and (n := b.u(5)) else None
    rotate = [b.s(n), b.s(n)] if b.u(1) and (n := b.u(5)) else None
    n = b.u(5)
    return [scale, rotate, [b.s(n), b.s(n)]], b.align()


def write_matrix(scale, rotate, translate) -> bytes:
    w = Writer()
    for pair in (scale, rotate):
        w.put(pair is not None, 1)
        if pair is not None:
            n = width(*pair)
            w.put(n, 5)
            for v in pair:
                w.put(v & (1 << n) - 1, n)
    n = width(*translate)
    w.put(n, 5)
    for v in translate:
        w.put(v & (1 << n) - 1, n)
    return w.bytes()


def skip_rect(data: bytes, pos: int) -> int:
    b = Bits(data, pos)
    n = b.u(5)
    b.u(4 * n)
    return b.align()


def halve_bitmap_fill(body: bytes, version: int, bitmap: int) -> bytes | None:
    """Fill styles of the shape header; the bitmap matrix is rewritten in place."""
    pos = skip_rect(body, 2)
    if version == 4:
        pos = skip_rect(body, pos) + 1
    count = body[pos]
    pos += 1
    if count == 0xFF and version > 1:
        count = struct.unpack_from('<H', body, pos)[0]
        pos += 2
    color = 4 if version >= 3 else 3
    for _ in range(count):
        kind = body[pos]
        pos += 1
        if kind == 0x00:
            pos += color
        elif kind in (0x10, 0x12, 0x13):
            pos = read_matrix(body, pos)[1]
            records = body[pos] & 0x0F
            pos += 1 + records * (1 + color) + (2 if kind == 0x13 else 0)
        elif kind in (0x40, 0x41, 0x42, 0x43):
            target = struct.unpack_from('<H', body, pos)[0]
            start = pos + 2
            (scale, rotate, translate), end = read_matrix(body, start)
            if target != bitmap:
                pos = end
                continue
            scale = [v // 2 for v in scale]
            rotate = rotate and [v // 2 for v in rotate]
            # Smoothed: the 2x bitmap is drawn at half size on 1x screens.
            smoothed = bytes([kind & ~0x02])
            return body[:pos - 1] + smoothed + body[pos:start] + write_matrix(scale, rotate, translate) + body[end:]
        else:
            raise ValueError(f'unknown fill style {kind:#x}')
    return None


def tags(data: bytes, pos: int):
    while pos < len(data):
        head = struct.unpack_from('<H', data, pos)[0]
        code, length, start = head >> 6, head & 0x3F, pos + 2
        if length == 0x3F:
            length = struct.unpack_from('<I', data, start)[0]
            start += 4
        yield code, data[start:start + length]
        pos = start + length
        if code == 0:
            return


def tag(code: int, body: bytes) -> bytes:
    return struct.pack('<HI', code << 6 | 0x3F, len(body)) + body


def lossless2(char: int, image: Image.Image) -> bytes:
    rgba = image.convert('RGBA').tobytes()
    # DefineBitsLossless2 stores premultiplied ARGB.
    pixels = bytearray()
    for i in range(0, len(rgba), 4):
        r, g, b, a = rgba[i:i + 4]
        pixels += bytes((a, r * a // 255, g * a // 255, b * a // 255))
    return struct.pack('<HBHH', char, 5, *image.size) + zlib.compress(bytes(pixels), 9)


def build(original: Path, redraw: Path, out: Path) -> None:
    raw = original.read_bytes()
    if raw[:3] != b'CWS':
        raise ValueError(f'{original}: expected a zlib SWF')
    data = zlib.decompress(raw[8:])
    header = skip_rect(data, 0) + 4
    jpegs = [(code, body) for code, body in tags(data, header) if code == 35]
    if len(jpegs) != 1:
        raise ValueError(f'{original}: expected one DefineBitsJPEG3 backdrop')
    body = jpegs[0][1]
    char = struct.unpack_from('<H', body)[0]
    w, h = Image.open(BytesIO(body[6:6 + struct.unpack_from('<I', body, 2)[0]])).size
    image = Image.open(redraw).convert('RGBA').resize((w * 2, h * 2), Image.LANCZOS)
    rebuilt, patched = bytearray(data[:header]), 0
    for code, body in tags(data, header):
        if code == 35:
            rebuilt += tag(36, lossless2(char, image))
            continue
        if code in SHAPES:
            fixed = halve_bitmap_fill(body, SHAPES[code], char)
            if fixed is not None:
                body, patched = fixed, patched + 1
        rebuilt += tag(code, body)
    if patched != 1:
        raise ValueError(f'{original}: expected one shape filled with bitmap {char}, found {patched}')
    out.write_bytes(b'CWS' + bytes([raw[3]]) + struct.pack('<I', len(rebuilt) + 8) + zlib.compress(bytes(rebuilt), 9))
    print(f'{out}: {w * 2}x{h * 2}, {out.stat().st_size // 1024} KB')


if __name__ == '__main__':
    redraws, talk = Path(sys.argv[1]), Path(sys.argv[2])
    for skin in range(1, 5):
        build(talk / str(skin) / 'talk.swf', redraws / f'talk{skin}.png', talk / str(skin) / 'talk@2x.swf')
