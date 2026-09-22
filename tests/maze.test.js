const test = require('node:test');
const assert = require('node:assert/strict');
const {
    MOVES, SOLVERS, createRng, createEmptyMaze, generateMaze,
    bfs, bfsSearch, farthestCell, normalizeMap, solveBfs, solveDfs, solveRightHand
} = require('../scripts/maze.js');
const { getLevel } = require('../scripts/levels.js');

// Replays moves from start and checks every step lands on an open cell
function walk(maze, start, moves) {
    let { x, y } = start;
    for (const dir of moves) {
        x += MOVES[dir][0];
        y += MOVES[dir][1];
        assert.equal(maze[y][x], 0, `walked into a wall at ${x},${y}`);
    }
    return { x, y };
}

function openCells(maze) {
    const cells = [];
    maze.forEach((row, y) => row.forEach((c, x) => { if (c === 0) cells.push([x, y]); }));
    return cells;
}

test('createRng is deterministic per seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const seqA = [a(), a(), a()];
    assert.deepEqual(seqA, [b(), b(), b()]);
    assert.notDeepEqual(seqA, [c(), c(), c()]);
    seqA.forEach(v => assert.ok(v >= 0 && v < 1));
});

test('generateMaze rejects even or tiny sizes', () => {
    assert.throws(() => generateMaze(14, createRng(1)), RangeError);
    assert.throws(() => generateMaze(3, createRng(1)), RangeError);
});

for (const size of [5, 9, 15, 25]) {
    test(`generateMaze(${size}) has a solid border and a fully connected interior`, () => {
        const maze = generateMaze(size, createRng(size));
        assert.equal(maze.length, size);
        maze.forEach(row => assert.equal(row.length, size));
        for (let i = 0; i < size; i++) {
            assert.equal(maze[0][i], 1);
            assert.equal(maze[size - 1][i], 1);
            assert.equal(maze[i][0], 1);
            assert.equal(maze[i][size - 1], 1);
        }
        const reachable = bfsSearch(maze, 1, 1).explored.length;
        assert.equal(reachable, openCells(maze).length, 'every open cell is reachable from start');
    });
}

test('generateMaze without loops is a perfect maze (a tree)', () => {
    const maze = generateMaze(15, createRng(7), { loopFactor: 0 });
    const cells = openCells(maze);
    let edges = 0;
    for (const [x, y] of cells) {
        if (maze[y][x + 1] === 0) edges++;
        if (maze[y + 1][x] === 0) edges++;
    }
    assert.equal(edges, cells.length - 1);
});

test('same seed produces the same maze', () => {
    assert.deepEqual(generateMaze(13, createRng(99)), generateMaze(13, createRng(99)));
    assert.notDeepEqual(generateMaze(13, createRng(99)), generateMaze(13, createRng(100)));
});

test('farthestCell picks the cell with the longest shortest path', () => {
    const maze = generateMaze(11, createRng(3));
    const far = farthestCell(maze, 1, 1);
    for (const [x, y] of openCells(maze)) {
        assert.ok(bfs(maze, 1, 1, x, y).length <= far.distance);
    }
});

test('bfs returns a shortest path, [] for same cell, null if unreachable', () => {
    const maze = createEmptyMaze(7);
    assert.equal(bfs(maze, 1, 1, 5, 5).length, 8);
    assert.deepEqual(bfs(maze, 2, 2, 2, 2), []);
    maze[3] = [1, 1, 1, 1, 1, 1, 1];
    assert.equal(bfs(maze, 1, 1, 5, 5), null);
});

test('normalizeMap crops legacy 15-row maps and converts [x, y] items', () => {
    const legacy = { maze: [...getLevel(1).maze, new Array(14).fill(1)], traps: [[3, 3]], coins: ['1,5'] };
    const map = normalizeMap(legacy);
    assert.equal(map.maze.length, 14);
    assert.deepEqual(map.traps, ['3,3']);
    assert.deepEqual(map.coins, ['1,5']);
});

test('all solvers reach the finish on perfect mazes', () => {
    for (let seed = 1; seed <= 20; seed++) {
        const maze = generateMaze(15, createRng(seed), { loopFactor: 0 });
        const start = { x: 1, y: 1 };
        const finish = farthestCell(maze, 1, 1);
        for (const [name, solver] of Object.entries(SOLVERS)) {
            const result = solver.solve(maze, start, finish);
            assert.ok(result.solved, `${name} failed on seed ${seed}`);
            assert.deepEqual(walk(maze, start, result.moves), { x: finish.x, y: finish.y }, name);
        }
    }
});

test('BFS is optimal; DFS and right-hand are never shorter', () => {
    for (let seed = 1; seed <= 20; seed++) {
        const maze = generateMaze(13, createRng(seed));
        const start = { x: 1, y: 1 };
        const finish = farthestCell(maze, 1, 1);
        const best = solveBfs(maze, start, finish).moves.length;
        assert.equal(best, finish.distance);
        assert.ok(solveDfs(maze, start, finish).moves.length >= best);
        const hand = solveRightHand(maze, start, finish);
        if (hand.solved) assert.ok(hand.moves.length >= best);
    }
});

test('right-hand rule detects endless loops instead of hanging', () => {
    // Finish sits on a pillar island in the middle of an open room: the wall follower circles the room
    const maze = createEmptyMaze(9);
    for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) maze[y][x] = 1;
    maze[4][4] = 0;
    maze[3][4] = 0;
    const result = solveRightHand(maze, { x: 1, y: 1 }, { x: 4, y: 4 });
    assert.equal(result.solved, false);
    assert.match(result.reason, /по кругу/);
});

test('solvers report unreachable finish', () => {
    const maze = createEmptyMaze(7);
    maze[3] = [1, 1, 1, 1, 1, 1, 1];
    for (const solver of Object.values(SOLVERS)) {
        const result = solver.solve(maze, { x: 1, y: 1 }, { x: 5, y: 5 });
        assert.equal(result.solved, false);
    }
});
