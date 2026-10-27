"""生成插件图标 16/48/128（纯标准库：zlib + struct）"""
import zlib, struct, os

S = 512  # 超采样尺寸
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icons')


def lerp(a, b, t):
    return a + (b - a) * t


def rounded_rect_cov(x, y, x0, y0, x1, y1, r):
    """点 (x,y) 是否在圆角矩形内（坐标已归一化到像素）"""
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    dx, dy = x - cx, y - cy
    if x0 <= x <= x1 and y0 + r <= y <= y1 - r:
        return True
    if y0 <= y <= y1 and x0 + r <= x <= x1 - r:
        return True
    return dx * dx + dy * dy <= r * r


def point_in_tri(px, py, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    d1 = sign((px, py), a, b)
    d2 = sign((px, py), b, c)
    d3 = sign((px, py), c, a)
    neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (neg and pos)


def build(size=S):
    px = bytearray(size * size * 4)
    c1 = (0x3b, 0x82, 0xf6)   # 蓝
    c2 = (0x7c, 0x3a, 0xed)   # 紫

    for y in range(size):
        ny = y / size
        for x in range(size):
            nx = x / size
            idx = (y * size + x) * 4

            # 底板：圆角方块 + 对角渐变
            if not rounded_rect_cov(nx, ny, 0.02, 0.02, 0.98, 0.98, 0.22):
                px[idx:idx + 4] = b'\x00\x00\x00\x00'
                continue
            t = (nx + ny) / 2
            r = int(lerp(c1[0], c2[0], t))
            g = int(lerp(c1[1], c2[1], t))
            b = int(lerp(c1[2], c2[2], t))

            # 白色图形：相框 + 太阳 + 山 + 底托
            white = False
            # 相框（描边圆角矩形）
            outer = rounded_rect_cov(nx, ny, 0.22, 0.24, 0.78, 0.68, 0.05)
            inner = rounded_rect_cov(nx, ny, 0.22 + 0.055, 0.24 + 0.055, 0.78 - 0.055, 0.68 - 0.055, 0.03)
            if outer and not inner:
                white = True
            # 太阳
            if not white:
                dx, dy = nx - 0.36, ny - 0.395
                if dx * dx + dy * dy <= 0.045 ** 2:
                    white = True
            # 山（在相框内部）
            if not white and inner:
                if point_in_tri(nx, ny, (0.255, 0.625), (0.40, 0.455), (0.545, 0.625)):
                    white = True
                if point_in_tri(nx, ny, (0.42, 0.625), (0.53, 0.515), (0.64, 0.625)):
                    white = True
            # 底部横条（代表保存托盘）
            if not white and rounded_rect_cov(nx, ny, 0.38, 0.745, 0.62, 0.80, 0.027):
                white = True

            if white:
                px[idx:idx + 4] = bytes((255, 255, 255, 255))
            else:
                px[idx:idx + 4] = bytes((r, g, b, 255))
    return px


def downsample(px, src, dst):
    out = bytearray(dst * dst * 4)
    factor = src // dst
    area = factor * factor
    for y in range(dst):
        for x in range(dst):
            r = g = b = a = 0
            for sy in range(y * factor, (y + 1) * factor):
                base = (sy * src + x * factor) * 4
                for sx in range(factor):
                    p = base + sx * 4
                    al = px[p + 3]
                    r += px[p] * al
                    g += px[p + 1] * al
                    b += px[p + 2] * al
                    a += al
            o = (y * dst + x) * 4
            if a == 0:
                out[o:o + 4] = b'\x00\x00\x00\x00'
            else:
                out[o] = r // a
                out[o + 1] = g // a
                out[o + 2] = b // a
                out[o + 3] = a // area
    return out


def write_png(path, px, size):
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)
        raw += px[y * stride:(y + 1) * stride]

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    big = build(S)
    for s in (128, 48, 16):
        small = downsample(big, S, s)
        write_png(os.path.join(OUT, f'icon{s}.png'), small, s)
        print('wrote', f'icon{s}.png', s, 'x', s)
