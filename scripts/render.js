// View layer: canvas drawing. Knows nothing about game rules — callers pass in what to draw.

const CONFETTI_COLORS = ['#286AFF', '#1D9E75', '#f0ad00', '#e5484d', '#8d85f2'];

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
function createParticles(cx, cy, colors, count, { speed = 140, gravity = 380, life = 650 } = {}) {
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
            color: colors[i % colors.length]
        };
    });
}

// Draws live particles and returns the ones still alive
function drawParticles(c, particles, now) {
    const alive = particles.filter(p => now - p.born < p.life);
    for (const p of alive) {
        const t = Math.max(0, now - p.born) / 1000;
        c.globalAlpha = 1 - (now - p.born) / p.life;
        c.fillStyle = p.color;
        c.fillRect(p.x + p.vx * t - p.size / 2, p.y + p.vy * t + 0.5 * p.gravity * t * t - p.size / 2, p.size, p.size);
    }
    c.globalAlpha = 1;
    return alive;
}
