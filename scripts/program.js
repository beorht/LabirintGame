// Program layer: parses player code (hero commands + repeat blocks) and expands it into steps.
// Pure functions with no DOM access, so they can be tested in Node.
//
//   repeat(3) {        ← N from 1 to MAX_REPEAT, "{" at the end of the line
//       hero.right();  ← one command per line
//   }                  ← closing brace on its own line
//
// Comments start with // and may follow code on the same line.

const COMMAND_PATTERN = /^hero\.(\w+)\(\)\s*;?$/;
const REPEAT_PATTERN = /^repeat\s*\(\s*(\d+)\s*\)\s*\{$/;
const HERO_COMMANDS = new Set(['up', 'down', 'left', 'right', 'finish']);
const MAX_REPEAT = 20;
const MAX_STEPS = 500;
const TRAP_PENALTY = 5;
const STEP_MOVES = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

class ProgramError extends Error {
    constructor(lineIndex, message) {
        super(message);
        this.name = 'ProgramError';
        this.lineIndex = lineIndex;
    }
}

function stripComment(line) {
    const i = line.indexOf('//');
    return (i >= 0 ? line.slice(0, i) : line).trim();
}

// Lines that count towards a level's line limit: everything except blank lines and comments
function countCodeLines(source) {
    return source.split('\n').filter(line => stripComment(line)).length;
}

// Builds a tree of { type: 'command' | 'repeat' } nodes; throws ProgramError on the first mistake
function parseProgram(source, { allowRepeat = true, allowNesting = true } = {}) {
    const root = [];
    const stack = [{ body: root, node: null }];

    source.split('\n').forEach((raw, lineIndex) => {
        const text = stripComment(raw);
        if (!text) return;
        const current = stack[stack.length - 1];

        if (text === '}') {
            if (stack.length === 1) throw new ProgramError(lineIndex, 'Лишняя закрывающая скобка }');
            const block = stack.pop().node;
            if (!block.body.length) throw new ProgramError(block.lineIndex, 'Пустой цикл: добавьте команды внутрь repeat');
            return;
        }

        const repeat = text.match(REPEAT_PATTERN);
        if (repeat) {
            if (!allowRepeat) throw new ProgramError(lineIndex, 'Циклы repeat откроются на уровне 5');
            if (stack.length > 1 && !allowNesting) throw new ProgramError(lineIndex, 'Цикл внутри цикла откроется на уровне 10');
            const times = Number(repeat[1]);
            if (times < 1 || times > MAX_REPEAT) {
                throw new ProgramError(lineIndex, `Число повторов должно быть от 1 до ${MAX_REPEAT}`);
            }
            const node = { type: 'repeat', times, body: [], lineIndex, text };
            current.body.push(node);
            stack.push({ body: node.body, node });
            return;
        }
        if (/^repeat\b/.test(text)) {
            throw new ProgramError(lineIndex, 'Цикл пишется так: repeat(3) { — число в скобках и { в конце строки');
        }

        const command = text.match(COMMAND_PATTERN);
        if (!command) throw new ProgramError(lineIndex, `Невалидная команда: ${text}`);
        if (!HERO_COMMANDS.has(command[1])) throw new ProgramError(lineIndex, `Неизвестная команда: ${command[1]}()`);
        current.body.push({ type: 'command', command: command[1], lineIndex, text });
    });

    if (stack.length > 1) {
        throw new ProgramError(stack[stack.length - 1].node.lineIndex, 'Цикл не закрыт: добавьте } в конце');
    }
    return root;
}

// Unrolls loops into the flat list of commands the hero will execute.
// Each step keeps its editor line and the loop iterations it belongs to (outermost first).
function expandProgram(nodes, maxSteps = MAX_STEPS) {
    const steps = [];
    (function run(list, loops) {
        for (const node of list) {
            if (node.type === 'command') {
                if (steps.length >= maxSteps) {
                    throw new ProgramError(loops.length ? loops[0].lineIndex : node.lineIndex,
                        `Слишком много шагов (больше ${maxSteps}) — уменьшите число повторов`);
                }
                steps.push({ command: node.command, lineIndex: node.lineIndex, text: node.text, loops });
                continue;
            }
            for (let i = 1; i <= node.times; i++) {
                run(node.body, [...loops, { lineIndex: node.lineIndex, iteration: i, times: node.times }]);
            }
        }
    })(nodes, []);
    return steps;
}

// parse + expand; returns { steps, lines, error } where error = { lineIndex, message } or null
function compileProgram(source, options) {
    const lines = countCodeLines(source);
    try {
        return { steps: expandProgram(parseProgram(source, options)), lines, error: null };
    } catch (err) {
        if (!(err instanceof ProgramError)) throw err;
        return { steps: [], lines, error: { lineIndex: err.lineIndex, message: err.message } };
    }
}

// Dry-runs steps on a level without side effects. Returns where the hero ends, how many
// steps it took (with trap penalties) and the first error, if any.
function simulateSteps(level, steps) {
    let x = level.startX;
    let y = level.startY;
    let count = 0;
    const traps = new Set(level.traps);
    const n = level.maze.length;

    for (const step of steps) {
        if (step.command === 'finish') {
            if (x === level.finishX && y === level.finishY) return { x, y, steps: count, finished: true, error: null };
            return { x, y, steps: count, finished: false, error: { lineIndex: step.lineIndex, message: 'Вы не на финише' } };
        }
        const [dx, dy] = STEP_MOVES[step.command];
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) {
            return { x, y, steps: count, finished: false, error: { lineIndex: step.lineIndex, message: 'Выход за границы поля' } };
        }
        if (level.maze[ny][nx] === 1) {
            return { x, y, steps: count, finished: false, error: { lineIndex: step.lineIndex, message: 'Столкновение со стеной' } };
        }
        x = nx;
        y = ny;
        count++;
        const key = `${x},${y}`;
        if (traps.has(key)) {
            count += TRAP_PENALTY;
            traps.delete(key);
        }
    }
    const onFinish = x === level.finishX && y === level.finishY;
    return { x, y, steps: count, finished: onFinish, error: null };
}

if (typeof module !== 'undefined') {
    module.exports = {
        COMMAND_PATTERN, REPEAT_PATTERN, HERO_COMMANDS, MAX_REPEAT, MAX_STEPS, TRAP_PENALTY,
        ProgramError, stripComment, countCodeLines, parseProgram, expandProgram, compileProgram, simulateSteps
    };
}
