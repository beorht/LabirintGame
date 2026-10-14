"""Builds assets/robot/robot.png from the source sprite sheet.

The source sheet has no alpha channel (the checkerboard is painted in), and its poses are
laid out irregularly. This cuts the poses out, removes the background, composes a blink
frame and packs everything into equal cells anchored at the feet, so frames don't jitter.

Usage: python3 tools/build_robot_sprites.py
"""
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets' / 'Cute Robot Sprite Sheet.png'
OUTPUT = ROOT / 'assets' / 'robot' / 'robot.png'

# Generous crop boxes (left, top, right, bottom) around each element of the source sheet
BOXES = {
    'idle': (40, 615, 400, 990),
    'walkA': (425, 610, 750, 990),
    'walkB': (785, 610, 1115, 990),
    'cheer': (1130, 580, 1520, 990),
    'faceClosed': (965, 85, 1305, 325),
}
# Cell order in the output strip; scripts/render.js (ROBOT_FRAMES) relies on it
FRAMES = ['idle', 'blink', 'walkA', 'walkB', 'cheer']

SCALE = 0.5
CELL_W = 256
CELL_H = 192
FOOT_Y = CELL_H - 4           # feet rest on this row of every cell
HOLE_MIN_AREA = 120         # enclosed checkerboard pockets larger than this are background too


def is_background(rgb):
    r, g, b = rgb
    return max(r, g, b) - min(r, g, b) < 12 and min(r, g, b) > 215


def flood(mask_fn, w, h, seeds, px):
    """Returns the set of pixels reachable from seeds through pixels where mask_fn holds."""
    seen = set()
    queue = deque()
    for s in seeds:
        if s not in seen and mask_fn(px[s]):
            seen.add(s)
            queue.append(s)
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and mask_fn(px[nx, ny]):
                seen.add((nx, ny))
                queue.append((nx, ny))
    return seen


def cut_out(img):
    """RGB crop -> RGBA with the painted checkerboard made transparent."""
    w, h = img.size
    px = img.load()
    border = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + \
             [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    clear = flood(is_background, w, h, border, px)

    # Checkerboard pockets enclosed by the outline (e.g. between a raised arm and the head);
    # small light specks are highlights and stay
    visited = set(clear)
    for y in range(h):
        for x in range(w):
            if (x, y) not in visited and is_background(px[x, y]):
                pocket = flood(is_background, w, h, [(x, y)], px)
                visited |= pocket
                if len(pocket) >= HOLE_MIN_AREA:
                    clear |= pocket

    out = img.convert('RGBA')
    opx = out.load()
    for p in clear:
        opx[p] = (0, 0, 0, 0)

    # Soften the light anti-aliasing fringe left between the outline and the background
    for y in range(h):
        for x in range(w):
            r, g, b, a = opx[x, y]
            if a and min(r, g, b) > 190 and max(r, g, b) - min(r, g, b) < 20:
                near_clear = any((x + dx, y + dy) in clear for dx in (-1, 0, 1) for dy in (-1, 0, 1))
                if near_clear:
                    opx[x, y] = (r, g, b, 0)
    return out.crop(out.getbbox())


def screen_bbox(robot):
    """Bounding box of the dark face screen on the front-facing pose."""
    w, h = robot.size
    px = robot.load()
    dark = lambda p: p[3] and max(p[:3]) < 115
    seed = (w // 2, int(h * 0.3))
    if not dark(px[seed]):
        raise SystemExit(f'Face screen not found at {seed}: {px[seed]}')
    region = flood(dark, w, int(h * 0.6), [seed], px)
    xs = [p[0] for p in region]
    ys = [p[1] for p in region]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def make_blink(idle, face_closed):
    """Idle pose with the closed-eyes face screen pasted over its open-eyes screen."""
    left, top, right, bottom = screen_bbox(idle)
    face = face_closed.resize((right - left, bottom - top), Image.LANCZOS)
    blink = idle.copy()
    blink.alpha_composite(face, (left, top))
    return blink


def foot_anchor_x(sprite):
    """Horizontal centre of the opaque pixels in the bottom rows (the feet)."""
    w, h = sprite.size
    alpha = sprite.getchannel('A').load()
    xs = [x for y in range(int(h * 0.88), h) for x in range(w) if alpha[x, y] > 128]
    return (min(xs) + max(xs)) / 2


def place(sprite):
    """Scales a cut-out pose and places it in a cell with the feet on FOOT_Y, centred."""
    w, h = sprite.size
    scaled = sprite.convert('RGBa').resize((round(w * SCALE), round(h * SCALE)), Image.LANCZOS).convert('RGBA')
    sw, sh = scaled.size
    ax = foot_anchor_x(scaled)
    x = round(CELL_W / 2 - ax)
    y = FOOT_Y - sh
    if x < 0 or y < 0 or x + sw > CELL_W:
        raise SystemExit(f'Pose does not fit the {CELL_W}x{CELL_H} cell (x={x}, y={y}, w={sw}, h={sh})')
    cell = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    cell.alpha_composite(scaled, (x, y))
    return cell


def main():
    sheet = Image.open(SOURCE).convert('RGB')
    parts = {name: cut_out(sheet.crop(box)) for name, box in BOXES.items()}
    parts['blink'] = make_blink(parts['idle'], parts['faceClosed'])

    strip = Image.new('RGBA', (CELL_W * len(FRAMES), CELL_H), (0, 0, 0, 0))
    for i, name in enumerate(FRAMES):
        strip.alpha_composite(place(parts[name]), (i * CELL_W, 0))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    strip.save(OUTPUT, optimize=True)
    print(f'{OUTPUT.relative_to(ROOT)}: {strip.size[0]}x{strip.size[1]}, frames: {", ".join(FRAMES)}')


if __name__ == '__main__':
    main()
