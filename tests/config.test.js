const test = require('node:test');
const assert = require('node:assert/strict');
const { ConfigError, DEFAULT_SETTINGS, validateSettings } = require('../scripts/config.js');

test('validateSettings fills defaults, normalizes numbers and drops unknown keys', () => {
    assert.deepEqual(validateSettings({}), DEFAULT_SETTINGS);
    assert.deepEqual(validateSettings({ speed: '200' }), { speed: 200 });
    assert.deepEqual(validateSettings({ gridSize: 15, speed: 50 }), { speed: 50 });
});

test('validateSettings throws ConfigError with a readable message', () => {
    for (const raw of [null, 'x', { speed: 10 }, { speed: 2000 }, { speed: 12.5 }, { speed: 'fast' }]) {
        assert.throws(() => validateSettings(raw), err => err instanceof ConfigError && err.message.length > 0, JSON.stringify(raw));
    }
});
