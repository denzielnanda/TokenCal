"""Generate TokenCal's original code-drawn app and tray icons (no dependencies)."""
from pathlib import Path
import struct, zlib, math

out=Path(__file__).resolve().parent.parent/'assets'
out.mkdir(exist_ok=True)

def render(size, template=False):
    rows=[]
    for y in range(size):
        row=bytearray()
        for x in range(size):
            px,py=(x+.5)/size,(y+.5)/size
            rgba=(0,0,0,0)
            if not template:
                dx=max(abs(px-.5)-.32,0);dy=max(abs(py-.5)-.32,0)
                if dx*dx+dy*dy < .15**2:rgba=(66,103,78,255)
            # Three offset token rings, each with a flat opening on the right.
            for cy in [.32,.5,.68]:
                radius=math.hypot((px-.48)/1.18,py-cy)
                if .17<radius<.225 and (px<.62 or py>cy):
                    rgba=(0,0,0,255) if template else (235,244,228,255)
            # One vertical stem makes the stack a distinctive T monogram.
            if .47<px<.53 and .31<py<.74:rgba=(0,0,0,255) if template else (235,244,228,255)
            row.extend(rgba)
        rows.append(b'\x00'+bytes(row))
    def chunk(t,b):return struct.pack('!I',len(b))+t+b+struct.pack('!I',zlib.crc32(t+b)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows),9))+chunk(b'IEND',b'')

for name,size,template in [('icon.png',1024,False),('tray.png',32,False),('trayTemplate.png',36,True)]:
    (out/name).write_bytes(render(size,template))
print('Generated app and tray icons in assets/')
