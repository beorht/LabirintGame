const test = require('node:test');
const assert = require('node:assert/strict');
const { compileProgram, countCodeLines, MAX_STEPS } = require('../scripts/program.js');

const commands = result => result.steps.map(s => s.command);

test('plain commands, comments and blank lines', () => {
    const r = compileProgram('// start\nhero.right();\n\nhero.down()   // no semicolon\nhero.finish();');
    assert.equal(r.error, null);
    assert.deepEqual(commands(r), ['right', 'down', 'finish']);
    assert.deepEqual(r.steps.map(s => s.lineIndex), [1, 3, 4]);
    assert.equal(r.lines, 3);
});

test('repeat expands its body and records iterations', () => {
    const r = compileProgram('repeat(3) {\n    hero.right();\n    hero.down();\n}');
    assert.equal(r.error, null);
    assert.deepEqual(commands(r), ['right', 'down', 'right', 'down', 'right', 'down']);
    assert.deepEqual(r.steps[4].loops, [{ lineIndex: 0, iteration: 3, times: 3 }]);
    assert.equal(r.lines, 4);
});

test('nested repeat', () => {
    const r = compileProgram('repeat(2) {\n repeat(3) {\n  hero.right();\n }\n hero.down();\n}');
    assert.equal(r.error, null);
    assert.deepEqual(commands(r), ['right', 'right', 'right', 'down', 'right', 'right', 'right', 'down']);
    assert.deepEqual(r.steps[5].loops.map(l => l.iteration), [2, 2]);
});

test('flexible spacing: repeat (4){ and repeat(4)  {', () => {
    assert.equal(compileProgram('repeat (4){\nhero.up();\n}').steps.length, 4);
    assert.equal(compileProgram('repeat(4)  {  // go\nhero.up();\n}').steps.length, 4);
});

const errorOf = (source, options) => compileProgram(source, options).error;

test('syntax errors point at the right line', () => {
    assert.deepEqual(errorOf('hero.right();\nhero.jump();'), { lineIndex: 1, message: 'Неизвестная команда: jump()' });
    assert.equal(errorOf('hero.right(); hero.down();').lineIndex, 0);
    assert.match(errorOf('hero.right();\n}').message, /Лишняя/);
    assert.match(errorOf('repeat(3) {\nhero.right();').message, /не закрыт/);
    assert.equal(errorOf('repeat(3) {\nhero.right();').lineIndex, 0);
    assert.match(errorOf('repeat(2) {\n}').message, /Пустой цикл/);
    assert.match(errorOf('repeat 3 {\nhero.up();\n}').message, /repeat\(3\) \{/);
    assert.match(errorOf('repeat(3)\n{\nhero.up();\n}').message, /repeat\(3\) \{/);
    assert.match(errorOf('repeat(0) {\nhero.up();\n}').message, /от 1 до 20/);
    assert.match(errorOf('repeat(21) {\nhero.up();\n}').message, /от 1 до 20/);
});

test('level gates: repeat before level 5, nesting before level 10', () => {
    const loop = 'repeat(2) {\nhero.up();\n}';
    assert.match(errorOf(loop, { allowRepeat: false }).message, /уровне 5/);
    const nested = 'repeat(2) {\nrepeat(2) {\nhero.up();\n}\n}';
    assert.deepEqual(errorOf(nested, { allowRepeat: true, allowNesting: false }).lineIndex, 1);
    assert.equal(errorOf(nested, { allowRepeat: true, allowNesting: true }), null);
});

test('runaway loops are capped', () => {
    const r = compileProgram('repeat(20) {\nrepeat(20) {\nrepeat(20) {\nhero.up();\n}\n}\n}');
    assert.match(r.error.message, new RegExp(String(MAX_STEPS)));
    assert.equal(r.error.lineIndex, 0);
});

test('countCodeLines ignores blank and comment lines but counts braces', () => {
    assert.equal(countCodeLines('// hi\n\nrepeat(2) {\n  hero.up(); // x\n}\n'), 3);
});
