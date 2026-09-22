const test = require('node:test');
const assert = require('node:assert/strict');
const { LEVELS, getLevel, REPEAT_LEVEL, NESTING_LEVEL } = require('../scripts/levels.js');
const { compileProgram, simulateSteps } = require('../scripts/program.js');
const { bfs } = require('../scripts/maze.js');

// Reference 3-star solutions. They live in the tests, not in the game.
const loop = (n, ...body) => [`repeat(${n}) {`, ...body, '}'];
const cmd = dir => `hero.${dir}();`;
const times = (n, dir) => Array(n).fill(cmd(dir));
const SOLUTIONS = {
    5: [...loop(8, cmd('right')), ...loop(8, cmd('down'))],
    6: [...loop(8, cmd('right')), ...loop(3, cmd('down')), ...loop(8, cmd('left')), ...loop(3, cmd('down')),
        ...loop(8, cmd('right')), ...times(2, 'down')],
    7: loop(8, cmd('right'), cmd('down')),
    8: loop(8, cmd('right'), cmd('down')),
    9: [...loop(8, cmd('right')), ...loop(8, cmd('down')), ...loop(8, cmd('left')), ...loop(6, cmd('up')),
        ...loop(6, cmd('right')), ...loop(4, cmd('down')), ...loop(4, cmd('left')), ...times(2, 'up'), ...times(2, 'right')],
    10: [...loop(2, ...loop(7, cmd('down')), ...times(2, 'right'), ...loop(7, cmd('up')), ...times(2, 'right')),
        ...loop(7, cmd('down'))],
    11: loop(3, ...loop(4, cmd('right')), ...loop(4, cmd('down'))),
    12: loop(3, ...loop(3, cmd('right'), cmd('right'), cmd('down')), ...times(2, 'down')),
    13: [...loop(3, ...loop(14, cmd('right')), ...times(2, 'down'), ...loop(14, cmd('left')), ...times(2, 'down')),
        ...loop(14, cmd('right')), ...times(2, 'down')],
    14: [...loop(3, ...loop(4, cmd('right'), cmd('down')), ...times(3, 'right')), ...loop(9, cmd('down')),
        ...loop(2, ...times(2, 'left'), ...loop(7, cmd('up')), ...times(2, 'left'), ...loop(7, cmd('down')))]
};

// Levels 1–4: the shortest path written out command by command
function explicitSolution(level) {
    return bfs(level.maze, level.startX, level.startY, level.finishX, level.finishY).map(cmd);
}

test('there are 14 levels', () => {
    assert.equal(LEVELS.length, 14);
});

for (let n = 1; n <= LEVELS.length; n++) {
    test(`level ${n}: ${LEVELS[n - 1].title}`, () => {
        const level = getLevel(n);
        const size = level.maze.length;

        // Square, walled border, start/finish/items on open cells
        level.maze.forEach(row => assert.equal(row.length, size));
        for (let i = 0; i < size; i++) {
            assert.equal(level.maze[0][i] + level.maze[size - 1][i] + level.maze[i][0] + level.maze[i][size - 1], 4);
        }
        for (const key of [...level.traps, ...level.coins]) {
            const [x, y] = key.split(',').map(Number);
            assert.equal(level.maze[y][x], 0, key);
        }

        assert.equal(level.allowRepeat, n >= REPEAT_LEVEL);
        assert.equal(level.allowNesting, n >= NESTING_LEVEL);
        if (n >= REPEAT_LEVEL) assert.ok(level.maxLines, 'loop levels need a line limit');

        // The reference solution earns 3 stars: shortest path, no traps, within the line limit
        const source = [...(SOLUTIONS[n] || explicitSolution(level)), cmd('finish')].join('\n');
        const program = compileProgram(source, level);
        assert.equal(program.error, null, program.error && program.error.message);
        const run = simulateSteps(level, program.steps);
        assert.equal(run.error, null, run.error && run.error.message);
        assert.ok(run.finished, 'solution reaches the finish');
        const optimal = bfs(level.maze, level.startX, level.startY, level.finishX, level.finishY).length;
        assert.equal(run.steps, optimal, 'shortest path without traps');
        if (level.maxLines) {
            assert.equal(program.lines, level.maxLines, 'limit equals the reference solution length');
            // Writing it without loops must not fit the limit — otherwise the loop isn't needed
            assert.ok(optimal + 1 > level.maxLines, 'explicit commands exceed the limit');
        }
    });
}
