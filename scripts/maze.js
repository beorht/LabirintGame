// Domain layer: grid, generation, pathfinding and solver strategies.
// Pure functions with no DOM access, so they can be tested in Node.
// A maze is a square 2D array where 1 = wall, 0 = path.

const MOVES = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0]
};
const CLOCKWISE = ['up', 'right', 'down', 'left'];

const cellKey = (x, y) => `${x},${y}`;
const parseKey = key => key.split(',').map(Number);
const mazeSize = maze => maze.length;
const isInside = (maze, x, y) => x >= 0 && y >= 0 && x < maze.length && y < maze.length;
const isBorder = (size, x, y) => x === 0 || y === 0 || x === size - 1 || y === size - 1;
const isOpen = (maze, x, y) => isInside(maze, x, y) && maze[y][x] === 0;

function createGrid(size, fill) {
    return Array.from({ length: size }, () => new Array(size).fill(fill));
}

// Walled border, open interior
function createEmptyMaze(size) {
    return Array.from({ length: size }, (_, y) =>
        Array.from({ length: size }, (_, x) => (isBorder(size, x, y) ? 1 : 0))
    );
}

// Small deterministic PRNG (mulberry32): the same seed always gives the same level
function createRng(seed) {
    let a = seed >>> 0;
    return function rng() {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffle(items, rng) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

// ---------- Generation ----------

// Iterative recursive-backtracker on an odd-sized grid (rooms at odd coordinates),
// then knocks out a share of the remaining inner walls to create loops
function generateMaze(size, rng, { loopFactor = 0.1 } = {}) {
    if (!Number.isInteger(size) || size < 5 || size % 2 === 0) {
        throw new RangeError(`Размер генерируемого лабиринта должен быть нечётным и не меньше 5, получено ${size}`);
    }

    const maze = createGrid(size, 1);
    const stack = [[1, 1]];
    maze[1][1] = 0;

    while (stack.length) {
        const [x, y] = stack[stack.length - 1];
        const options = CLOCKWISE
            .map(dir => [x + MOVES[dir][0] * 2, y + MOVES[dir][1] * 2, MOVES[dir][0], MOVES[dir][1]])
            .filter(([nx, ny]) => nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1 && maze[ny][nx] === 1);

        if (!options.length) {
            stack.pop();
            continue;
        }
        const [nx, ny, dx, dy] = options[Math.floor(rng() * options.length)];
        maze[y + dy][x + dx] = 0;
        maze[ny][nx] = 0;
        stack.push([nx, ny]);
    }

    // Inner walls sitting between two rooms, horizontally or vertically
    const candidates = [];
    for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
            if (maze[y][x] !== 1) continue;
            const horizontal = maze[y][x - 1] === 0 && maze[y][x + 1] === 0 && maze[y - 1][x] === 1 && maze[y + 1][x] === 1;
            const vertical = maze[y - 1][x] === 0 && maze[y + 1][x] === 0 && maze[y][x - 1] === 1 && maze[y][x + 1] === 1;
            if (horizontal || vertical) candidates.push([x, y]);
        }
    }
    shuffle(candidates, rng)
        .slice(0, Math.round(candidates.length * loopFactor))
        .forEach(([x, y]) => { maze[y][x] = 0; });

    return maze;
}

// ---------- Pathfinding ----------

// Breadth-first search over open cells. Returns { path, explored, distances }:
// path = direction names to the target (null if unreachable, or when no target is given),
// explored = cells in the order they were dequeued
function bfsSearch(maze, startX, startY, endX = -1, endY = -1) {
    const size = mazeSize(maze);
    const startIdx = startY * size + startX;
    const endIdx = endX >= 0 ? endY * size + endX : -1;
    const prev = new Int32Array(size * size).fill(-1);
    const distances = new Int32Array(size * size).fill(-1);
    const prevDir = [];
    const explored = [];
    const queue = [startIdx];
    prev[startIdx] = startIdx;
    distances[startIdx] = 0;

    for (let head = 0; head < queue.length; head++) {
        const idx = queue[head];
        const x = idx % size;
        const y = (idx - x) / size;
        explored.push(cellKey(x, y));

        if (idx === endIdx) {
            const path = [];
            for (let i = endIdx; i !== startIdx; i = prev[i]) path.push(prevDir[i]);
            return { path: path.reverse(), explored, distances };
        }

        for (const dir of CLOCKWISE) {
            const nx = x + MOVES[dir][0];
            const ny = y + MOVES[dir][1];
            if (!isOpen(maze, nx, ny)) continue;
            const next = ny * size + nx;
            if (prev[next] !== -1) continue;
            prev[next] = idx;
            prevDir[next] = dir;
            distances[next] = distances[idx] + 1;
            queue.push(next);
        }
    }

    return { path: null, explored, distances };
}

// Shortest path as direction names, or null if unreachable
function bfs(maze, startX, startY, endX, endY) {
    return bfsSearch(maze, startX, startY, endX, endY).path;
}

// The reachable cell farthest from the start — a good finish for generated levels
function farthestCell(maze, startX, startY) {
    const { distances } = bfsSearch(maze, startX, startY);
    const size = mazeSize(maze);
    let best = startY * size + startX;
    for (let i = 0; i < distances.length; i++) {
        if (distances[i] > distances[best]) best = i;
    }
    return { x: best % size, y: Math.floor(best / size), distance: distances[best] };
}

// ---------- Maps ----------

// Makes older saved maps usable: square grid (extra rows are cropped), items as "x,y" keys
function normalizeMap(data) {
    const size = data.maze[0].length;
    const toKey = item => (Array.isArray(item) ? cellKey(item[0], item[1]) : item);
    return {
        ...data,
        maze: data.maze.slice(0, size).map(row => [...row]),
        traps: (data.traps || []).map(toKey),
        coins: (data.coins || []).map(toKey)
    };
}

// ---------- Solver strategies ----------
// Every solver returns { moves, explored, solved, reason? }:
// moves = directions the hero walks, explored = cells the algorithm examined in order.

function solveBfs(maze, start, finish) {
    const { path, explored } = bfsSearch(maze, start.x, start.y, finish.x, finish.y);
    return path
        ? { moves: path, explored, solved: true }
        : { moves: [], explored, solved: false, reason: 'Финиш недостижим' };
}

// Depth-first search; the hero physically walks back out of dead ends
function solveDfs(maze, start, finish) {
    const visited = new Set([cellKey(start.x, start.y)]);
    const explored = [cellKey(start.x, start.y)];
    const moves = [];
    const stack = [{ x: start.x, y: start.y, from: null }];
    const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };

    while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.x === finish.x && top.y === finish.y) return { moves, explored, solved: true };

        const dir = CLOCKWISE.find(d => {
            const nx = top.x + MOVES[d][0];
            const ny = top.y + MOVES[d][1];
            return isOpen(maze, nx, ny) && !visited.has(cellKey(nx, ny));
        });

        if (dir) {
            const nx = top.x + MOVES[dir][0];
            const ny = top.y + MOVES[dir][1];
            visited.add(cellKey(nx, ny));
            explored.push(cellKey(nx, ny));
            moves.push(dir);
            stack.push({ x: nx, y: ny, from: dir });
        } else {
            stack.pop();
            if (top.from) moves.push(opposite[top.from]);
        }
    }

    return { moves, explored, solved: false, reason: 'Финиш недостижим' };
}

// Right-hand rule: keep the right hand on the wall. Can circle forever in mazes with loops,
// so a repeated (cell, heading) state ends the attempt
function solveRightHand(maze, start, finish) {
    let x = start.x;
    let y = start.y;
    let heading = CLOCKWISE.find(d => isOpen(maze, x + MOVES[d][0], y + MOVES[d][1])) || 'right';
    const moves = [];
    const explored = [cellKey(x, y)];
    const seenCells = new Set(explored);
    const seenStates = new Set();

    while (!(x === finish.x && y === finish.y)) {
        const state = `${x},${y},${heading}`;
        if (seenStates.has(state)) {
            return { moves, explored, solved: false, reason: 'Ходит по кругу — правило руки не работает в лабиринтах с петлями' };
        }
        seenStates.add(state);

        const h = CLOCKWISE.indexOf(heading);
        // Try right, straight, left, back
        const dir = [1, 0, 3, 2]
            .map(turn => CLOCKWISE[(h + turn) % 4])
            .find(d => isOpen(maze, x + MOVES[d][0], y + MOVES[d][1]));
        if (!dir) return { moves, explored, solved: false, reason: 'Некуда идти' };

        heading = dir;
        x += MOVES[dir][0];
        y += MOVES[dir][1];
        moves.push(dir);
        const key = cellKey(x, y);
        if (!seenCells.has(key)) {
            seenCells.add(key);
            explored.push(key);
        }
    }

    return { moves, explored, solved: true };
}

const SOLVERS = {
    bfs: { name: 'Поиск в ширину (BFS)', solve: solveBfs },
    dfs: { name: 'Поиск в глубину (DFS)', solve: solveDfs },
    rightHand: { name: 'Правило правой руки', solve: solveRightHand }
};

if (typeof module !== 'undefined') {
    module.exports = {
        MOVES, CLOCKWISE, SOLVERS,
        cellKey, parseKey, mazeSize, isInside, isBorder, isOpen,
        createGrid, createEmptyMaze, createRng, shuffle,
        generateMaze, bfsSearch, bfs, farthestCell, normalizeMap,
        solveBfs, solveDfs, solveRightHand
    };
}
