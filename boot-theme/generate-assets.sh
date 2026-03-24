#!/bin/bash
# Generate Plymouth spinner dot asset
# The logo.png is included in the repo — only the dot needs generating.

THEME_DIR="/usr/share/plymouth/themes/bigaos"

if command -v python3 &>/dev/null; then
  python3 << 'PYEOF'
import struct, zlib, os

THEME_DIR = "/usr/share/plymouth/themes/bigaos"

def write_png(path, width, height, pixels):
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    raw = b''
    for y in range(height):
        raw += b'\x00'
        for x in range(width):
            raw += bytes(pixels[y * width + x])
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(raw)))
        f.write(chunk(b'IEND', b''))

# Spinner dot: 8x8 dark blue circle on transparent background
w, h = 8, 8
pixels = [(0, 0, 0, 0)] * (w * h)
dot_color = (21, 112, 181, 255)
for y in range(h):
    for x in range(w):
        if (x - 3.5)**2 + (y - 3.5)**2 <= 3.5**2:
            pixels[y * w + x] = dot_color
write_png(os.path.join(THEME_DIR, "dot.png"), w, h, pixels)
PYEOF
elif command -v convert &>/dev/null; then
  convert -size 8x8 xc:none \
    -fill '#1570b5' -draw 'circle 4,4 4,0' \
    "$THEME_DIR/dot.png"
fi
