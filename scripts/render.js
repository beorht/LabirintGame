// View layer: canvas drawing. Knows nothing about game rules — callers pass in what to draw.

const CONFETTI_COLORS = ['#ff8a1f', '#72e4ff', '#f5b301', '#e5484d', '#2b6fd6', '#fdf6ee'];

let palette = {};

function getColor(cssVar) {
    return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
}

// Canvas colors are read once per theme change instead of on every draw call
function refreshPalette() {
    palette = {
        path: getColor('--path-color'),
        pathAlt: getColor('--path-alt'),
        wall: getColor('--wall-color'),
        wallTop: getColor('--wall-top'),
        grid: getColor('--grid-color'),
        start: getColor('--start-color'),
        finish: getColor('--finish-color'),
        trap: getColor('--trap-color'),
        coin: getColor('--coin-color'),
        coinLight: getColor('--coin-light'),
        coinEdge: getColor('--coin-edge'),
        player: getColor('--player-color'),
        playerLight: getColor('--player-light'),
        explored: getColor('--explored-color')
    };
}

// A canvas plus the cell size that fits the current grid into maxPx
function createBoardView(canvas, maxPx) {
    return { canvas, maxPx, ctx: null, gridSize: 0, cellSize: 0, size: 0, layer: null };
}

// Sizes the backing store for the grid and device pixel ratio so the board stays crisp
function resizeBoardView(view, gridSize) {
    const dpr = window.devicePixelRatio || 1;
    view.gridSize = gridSize;
    view.cellSize = Math.floor(view.maxPx / gridSize);
    view.size = view.cellSize * gridSize;
    view.canvas.width = view.size * dpr;
    view.canvas.height = view.size * dpr;
    view.ctx = view.canvas.getContext('2d');
    view.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r);
    else c.rect(x, y, w, h);
}

// Walls, grid, start and finish — everything that doesn't change during a run
function drawStaticBoard(c, cs, board) {
    const n = board.maze.length;
    const size = n * cs;
    c.fillStyle = palette.path;
    c.fillRect(0, 0, size, size);

    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (board.maze[y][x] === 1) {
                c.fillStyle = palette.wall;
                c.fillRect(x * cs, y * cs, cs, cs);
                // Lighter top edge on exposed walls gives the maze some depth
                if (y > 0 && board.maze[y - 1][x] !== 1) {
                    c.fillStyle = palette.wallTop;
                    c.fillRect(x * cs, y * cs, cs, Math.max(2, Math.round(cs * 0.16)));
                }
            } else if ((x + y) % 2) {
                c.fillStyle = palette.pathAlt;
                c.fillRect(x * cs, y * cs, cs, cs);
            }
        }
    }

    c.beginPath();
    for (let i = 0; i <= n; i++) {
        c.moveTo(i * cs, 0);
        c.lineTo(i * cs, size);
        c.moveTo(0, i * cs);
        c.lineTo(size, i * cs);
    }
    c.strokeStyle = palette.grid;
    c.lineWidth = 1;
    c.stroke();

    drawTile(c, board.startX, board.startY, cs, palette.start, 'A');
    drawTile(c, board.finishX, board.finishY, cs, palette.finish, '🚩');
}

function drawTile(c, x, y, cs, color, label) {
    const pad = cs * 0.08;
    c.fillStyle = color;
    roundRect(c, x * cs + pad, y * cs + pad, cs - pad * 2, cs - pad * 2, cs * 0.18);
    c.fill();
    c.fillStyle = '#ffffff';
    c.font = `bold ${Math.round(cs * 0.42)}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(label, x * cs + cs / 2, y * cs + cs / 2 + 1);
}

function drawTrap(c, x, y, cs) {
    const pad = cs * 0.14;
    const left = x * cs + pad;
    const width = cs - pad * 2;

    c.fillStyle = palette.trap;
    c.globalAlpha = 0.18;
    roundRect(c, left, y * cs + pad, width, width, cs * 0.14);
    c.fill();
    c.globalAlpha = 1;

    const spikes = 3;
    const base = width / spikes;
    const bottom = y * cs + cs - pad * 1.5;
    const top = y * cs + pad * 1.8;
    c.beginPath();
    for (let i = 0; i < spikes; i++) {
        const sx = left + i * base;
        c.moveTo(sx, bottom);
        c.lineTo(sx + base / 2, top);
        c.lineTo(sx + base, bottom);
    }
    c.fill();
}

function drawCoin(c, x, y, cs) {
    const cx = x * cs + cs / 2;
    const cy = y * cs + cs / 2;
    const r = cs * 0.27;

    const gradient = c.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    gradient.addColorStop(0, palette.coinLight);
    gradient.addColorStop(1, palette.coin);
    c.fillStyle = gradient;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = palette.coinEdge;
    c.lineWidth = Math.max(1.5, cs * 0.04);
    c.stroke();

    c.fillStyle = palette.coinEdge;
    c.font = `bold ${Math.round(r * 1.1)}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('★', cx, cy + 1);
}

function drawItems(c, cs, traps, coins) {
    traps.forEach(key => {
        const [x, y] = parseKey(key);
        drawTrap(c, x, y, cs);
    });
    coins.forEach(key => {
        const [x, y] = parseKey(key);
        drawCoin(c, x, y, cs);
    });
}

// Cells examined by a solver, shown as a translucent overlay
function drawExplored(c, cs, cells, count) {
    if (!count) return;
    c.fillStyle = palette.explored;
    const pad = cs * 0.06;
    for (let i = 0; i < count; i++) {
        const [x, y] = parseKey(cells[i]);
        c.fillRect(x * cs + pad, y * cs + pad, cs - pad * 2, cs - pad * 2);
    }
}

function drawTrail(c, cs, visited) {
    c.fillStyle = palette.player;
    c.globalAlpha = 0.28;
    visited.forEach(key => {
        const [x, y] = parseKey(key);
        c.beginPath();
        c.arc(x * cs + cs / 2, y * cs + cs / 2, Math.max(1.5, cs * 0.08), 0, Math.PI * 2);
        c.fill();
    });
    c.globalAlpha = 1;
}

// Line through the centres of cells ([x, y] pairs, in walking order)
function drawRouteLine(c, cs, cells, color, { dashed = false, width = 0.2 } = {}) {
    if (cells.length < 2) return;
    c.save();
    c.strokeStyle = color;
    c.lineWidth = Math.max(2, cs * width);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (dashed) c.setLineDash([cs * 0.32, cs * 0.26]);
    c.beginPath();
    cells.forEach(([x, y], i) => {
        const px = x * cs + cs / 2;
        const py = y * cs + cs / 2;
        if (i) c.lineTo(px, py);
        else c.moveTo(px, py);
    });
    c.stroke();
    c.restore();
}

function drawCellRing(c, cs, x, y, color) {
    c.save();
    c.strokeStyle = color;
    c.lineWidth = Math.max(2, cs * 0.12);
    c.beginPath();
    c.arc(x * cs + cs / 2, y * cs + cs / 2, cs * 0.46, 0, Math.PI * 2);
    c.stroke();
    c.restore();
}

function drawHero(c, cx, cy, cs, facing, image) {
    c.fillStyle = 'rgba(0, 0, 0, 0.18)';
    c.beginPath();
    c.ellipse(cx, cy + cs * 0.3, cs * 0.24, cs * 0.07, 0, 0, Math.PI * 2);
    c.fill();

    if (image) {
        const size = cs * 0.72;
        c.drawImage(image, cx - size / 2, cy - size / 2, size, size);
        return;
    }

    const r = cs * 0.3;
    const gradient = c.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r);
    gradient.addColorStop(0, palette.playerLight);
    gradient.addColorStop(1, palette.player);
    c.fillStyle = gradient;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();

    // Eyes look in the direction of the last move
    const [lx, ly] = MOVES[facing];
    for (const side of [-1, 1]) {
        const ex = cx + side * r * 0.36 + lx * r * 0.22;
        const ey = cy - r * 0.12 + ly * r * 0.22;
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.arc(ex, ey, r * 0.22, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#1b1b2f';
        c.beginPath();
        c.arc(ex + lx * r * 0.08, ey + ly * r * 0.08, r * 0.11, 0, Math.PI * 2);
        c.fill();
    }
}

// Layout of assets/robot/robot.png, produced by tools/build_robot_sprites.py
const ROBOT_SPRITE = {
    src: 'assets/robot/robot.png',
    cellW: 256,
    cellH: 192,
    footY: 188,                 // row the feet rest on in every cell
    frames: { idle: 0, blink: 1, walkA: 2, walkB: 3, cheer: 4 }
};

// Draws one robot frame with its feet on the lower part of the cell; lift raises it (hops)
function drawRobot(c, cx, cy, cs, sprite, frame, flip, lift = 0) {
    const footY = cy + cs * 0.38;
    c.fillStyle = 'rgba(0, 0, 0, 0.18)';
    c.beginPath();
    c.ellipse(cx, footY - cs * 0.02, cs * 0.26 * (1 - lift / cs), cs * 0.07, 0, 0, Math.PI * 2);
    c.fill();

    const k = (cs * 1.15) / ROBOT_SPRITE.cellH;
    const dw = ROBOT_SPRITE.cellW * k;
    const dh = ROBOT_SPRITE.cellH * k;
    const dy = footY - lift - ROBOT_SPRITE.footY * k;
    const sx = ROBOT_SPRITE.frames[frame] * ROBOT_SPRITE.cellW;

    c.save();
    c.imageSmoothingQuality = 'high';
    c.translate(cx, 0);
    if (flip) c.scale(-1, 1);
    c.drawImage(sprite, sx, 0, ROBOT_SPRITE.cellW, ROBOT_SPRITE.cellH, -dw / 2, dy, dw, dh);
    c.restore();
}

// Pre-renders the static board into an offscreen canvas of the view's size
function buildBoardLayer(view, board) {
    const dpr = window.devicePixelRatio || 1;
    const layer = document.createElement('canvas');
    layer.width = layer.height = view.size * dpr;
    const c = layer.getContext('2d');
    c.scale(dpr, dpr);
    drawStaticBoard(c, view.cellSize, board);
    view.layer = layer;
}

// ---------- Particles ----------

// Positions are computed analytically from age, so no per-frame state is needed
function createParticles(cx, cy, colors, count, { speed = 140, gravity = 380, life = 650, shape = 'square', spin = 0 } = {}) {
    const now = performance.now();
    return Array.from({ length: count }, (_, i) => {
        const angle = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.6);
        return {
            x: cx,
            y: cy,
            vx: Math.cos(angle) * v,
            vy: Math.sin(angle) * v - speed * 0.6,
            gravity,
            born: now,
            life: life * (0.7 + Math.random() * 0.6),
            size: 3 + Math.random() * 3,
            color: colors[i % colors.length],
            shape,
            spin: spin * (Math.random() < 0.5 ? -1 : 1)
        };
    });
}

// Four-point sparkle, used for coin pickups
function drawSpark(c, x, y, size, rotation) {
    c.save();
    c.translate(x, y);
    c.rotate(rotation);
    c.beginPath();
    c.moveTo(0, -size * 2);
    c.quadraticCurveTo(size * 0.4, -size * 0.4, size * 2, 0);
    c.quadraticCurveTo(size * 0.4, size * 0.4, 0, size * 2);
    c.quadraticCurveTo(-size * 0.4, size * 0.4, -size * 2, 0);
    c.quadraticCurveTo(-size * 0.4, -size * 0.4, 0, -size * 2);
    c.closePath();
    c.fill();
    c.restore();
}

// Draws live particles and returns the ones still alive
function drawParticles(c, particles, now) {
    const alive = particles.filter(p => now - p.born < p.life);
    for (const p of alive) {
        const age = now - p.born;
        const t = Math.max(0, age) / 1000;
        const x = p.x + p.vx * t, y = p.y + p.vy * t + 0.5 * p.gravity * t * t;
        c.globalAlpha = Math.max(0, 1 - age / p.life);
        c.fillStyle = p.color;
        if (p.shape === 'spark') drawSpark(c, x, y, p.size, p.spin * t);
        else c.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size);
    }
    c.globalAlpha = 1;
    return alive;
}

// Expanding, fading ring — a short burst of feedback (e.g. arriving on the finish tile)
function createRing(cx, cy, color, { maxRadius = 46, life = 480, lineWidth = 4 } = {}) {
    return { x: cx, y: cy, color, maxRadius, life, lineWidth, born: performance.now() };
}

function drawRings(c, rings, now) {
    const alive = rings.filter(r => now - r.born < r.life);
    for (const r of alive) {
        const t = (now - r.born) / r.life;
        c.globalAlpha = 1 - t;
        c.strokeStyle = r.color;
        c.lineWidth = r.lineWidth * (1 - t * 0.6);
        c.beginPath();
        c.arc(r.x, r.y, r.maxRadius * t, 0, Math.PI * 2);
        c.stroke();
    }
    c.globalAlpha = 1;
    return alive;
}
