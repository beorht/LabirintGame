// Config layer: settings defaults and validation. No DOM access, so it can be tested in Node.

const MIN_GRID_SIZE = 5;                // map sizes accepted by the level editor
const MAX_GRID_SIZE = 25;

const SETTINGS_LIMITS = {
    speedMin: 50,
    speedMax: 1000
};

const DEFAULT_SETTINGS = {
    speed: 300                          // ms between executed commands
};

// Invalid configuration: the message is meant to be shown to the player as is
class ConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConfigError';
    }
}

// Returns a clean settings object or throws ConfigError. Unknown keys are dropped.
function validateSettings(raw) {
    if (!raw || typeof raw !== 'object') throw new ConfigError('Настройки должны быть объектом');

    const speed = Number(raw.speed ?? DEFAULT_SETTINGS.speed);
    if (!Number.isInteger(speed) || speed < SETTINGS_LIMITS.speedMin || speed > SETTINGS_LIMITS.speedMax) {
        throw new ConfigError(`Скорость должна быть целым числом от ${SETTINGS_LIMITS.speedMin} до ${SETTINGS_LIMITS.speedMax} мс`);
    }
    return { speed };
}

if (typeof module !== 'undefined') {
    module.exports = { MIN_GRID_SIZE, MAX_GRID_SIZE, SETTINGS_LIMITS, DEFAULT_SETTINGS, ConfigError, validateSettings };
}
