# 🎯 План действий на ближайшие 3 месяца

**Цель:** Превратить Maze Quest в полноценную образовательную платформу

---

## 📌 ПРИОРИТЕТ 1: Процедурная генерация лабиринтов (Неделя 1-3)

### Почему это важно?
- Разные уровни каждый раз = лучше учится (не зубрежка)
- Основа для масштабирования количества уровней
- Ключевой компонент для системы челленджей

### ТЗ:

**Алгоритм: Recursive Backtracker**
```
1. Начать с полной сетки (все клетки = стены)
2. Случайно выбрать стартовую клетку (сделать путь)
3. Отметить текущую как посещенную
4. Пока есть непосещенные соседи:
   - Выбрать случайного соседа
   - Удалить стену между ними
   - Рекурсивно повторить для соседа
5. Если нет соседей — вернуться назад (backtrack)
```

### Реализация:
```javascript
function generateMazeRecursive(width, height, startX = 1, startY = 1) {
  // Инициализация: все стены
  const maze = Array(height).fill().map(() => Array(width).fill(1));
  const visited = new Set();
  
  function carve(x, y) {
    maze[y][x] = 0; // path
    visited.add(`${x},${y}`);
    
    const directions = shuffle([
      [0, -2], // up
      [2, 0],  // right
      [0, 2],  // down
      [-2, 0]  // left
    ]);
    
    for (const [dx, dy] of directions) {
      const nx = x + dx, ny = y + dy;
      if (nx > 0 && nx < width-1 && ny > 0 && ny < height-1 && !visited.has(`${nx},${ny}`)) {
        maze[y + dy/2][x + dx/2] = 0; // стена между ними
        carve(nx, ny);
      }
    }
  }
  
  carve(startX, startY);
  return maze;
}
```

**Спецификация:**
- Size: 14x14 как сейчас
- Гарантировать путь от старта до финиша (BFS проверка)
- Сложность можно регулировать (кол-во веток, завороты)
- Сохранять лабиринт в gameState для воспроизведения

**Задачи:**
- [ ] Реализовать алгоритм в `scripts/game.js`
- [ ] Заменить жестко закодированный `mazeTemplate`
- [ ] Добавить параметр сложности (difficulty: 1-5)
- [ ] Тестировать: 100+ уровней должны все пройти (BFS не вернет empty)
- [ ] Рендерить новый лабиринт для каждого level

---

## 📌 ПРИОРИТЕТ 2: Система режимов игры (Неделя 2-3)

### Три режима для начала:

#### 2.1 Story Mode (обычный режим)
- Стандартный прогресс по уровням
- Цель: пройти уровень
- Подсказки доступны

#### 2.2 Speed Challenge
- Соревнование: минимум **шагов** (не времени)
- Victory условие: `hero.finish()` с счетчиком шагов <= оптимальный BFS
- Награда: звезда за 1 звезда, 2 звезды за 1.1x BFS, 3 звезды за BFS
- Пример: если BFS = 10 шагов, то 3⭐ за ≤10, 2⭐ за ≤11, 1⭐ за ≤12

#### 2.3 Precision Mode
- Новая механика: нужно пройти **ровно N шагов**
- Например: "Пройди уровень ровно 15 шагами"
- Если 14 или 16 = неудача
- Обучает: точное планирование, детали

### Реализация:
```javascript
// В gameState добавить:
{
  mode: 'story', // 'story', 'speed', 'precision'
  targetSteps: null, // для precision mode
  optimalSteps: null, // для speed challenge
}

// В victory check:
function checkVictory() {
  if (gameState.mode === 'speed') {
    // 3 звезды = optimalSteps
    const stars = gameState.steps <= gameState.optimalSteps ? 3 : 2;
  } else if (gameState.mode === 'precision') {
    // точно targetSteps?
    const victory = gameState.steps === gameState.targetSteps;
  }
}
```

**Задачи:**
- [ ] Добавить UI для выбора режима (кнопки/dropdown)
- [ ] Реализовать логику каждого режима
- [ ] Вычислять optimalSteps через BFS
- [ ] Сохранять рекорды по режимам
- [ ] Дизайн Victory modal под каждый режим

---

## 📌 ПРИОРИТЕТ 3: Система регистрации и прогресса (Неделя 4-6)

### 3.1 Backend структура

**Database schema:**
```sql
-- users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE,
  email VARCHAR(100) UNIQUE,
  password_hash VARCHAR(255),
  created_at TIMESTAMP,
  avatar_url VARCHAR(255)
);

-- game_progress
CREATE TABLE game_progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  game_id VARCHAR(50),
  level INTEGER,
  mode VARCHAR(20),
  steps INTEGER,
  time_spent INTEGER,
  stars INTEGER,
  completed BOOLEAN,
  completed_at TIMESTAMP
);

-- leaderboard (denormalized для быстроты)
CREATE TABLE leaderboard (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  game VARCHAR(50),
  rank INTEGER,
  score INTEGER,
  updated_at TIMESTAMP
);
```

### 3.2 API endpoints

```
POST   /api/auth/register        — регистрация
POST   /api/auth/login           — логин
POST   /api/auth/logout          — логаут
GET    /api/users/:id            — профиль
POST   /api/users/:id/avatar     — загруз аватара

POST   /api/progress             — сохранить прогресс
GET    /api/progress/:userId     — получить прогресс

GET    /api/leaderboard/maze     — лидерборд Maze Quest
GET    /api/leaderboard/speed    — лидерборд Speed Challenge
```

### 3.3 Frontend интеграция

**Компоненты:**
- [ ] Модальное окно регистрации (email, password, username)
- [ ] Модальное окно логина
- [ ] Страница профиля (аватар, статистика, достижения)
- [ ] Таблица лидеров (топ 100)

**Логика:**
- На старте: проверить localStorage для токена JWT
- Если токен есть: автоматически залогинить
- На каждый result: отправлять прогресс на сервер

**Задачи:**
- [ ] Спроектировать DB в PostgreSQL (или SQLite для начала)
- [ ] Написать API endpoints в server.js
- [ ] JWT аутентификация (jsonwebtoken пакет)
- [ ] Хранить токен в localStorage
- [ ] Отправлять прогресс при victory
- [ ] Загружать лидербord при старте игры

---

## 📌 ПРИОРИТЕТ 4: Вторая игра — Code Painter (Неделя 4-8)

### Игровая механика

**Что это:** Нарисовать узор, используя команды с циклами

**Пример:**
```javascript
for (let i = 0; i < 4; i++) {
  painter.forward(50);
  painter.rotate(90);
}
// Рисует квадрат 50x50
```

### Прототип (v1 — простой):

**Команды:**
- `painter.forward(pixels)` — движение вперед
- `painter.rotate(degrees)` — поворот
- `painter.penUp()` — поднять кисть (не рисует)
- `painter.penDown()` — опустить кисть
- `painter.color(r, g, b)` — цвет
- Цикл: `for (let i = 0; i < n; i++) { ... }`

**Canvas:**
- 500x500 пикселей для рисования
- Сетка справа с примерным узором
- Проверка: рисунок совпадает с примером?

### Уровни примеры:
1. Линия вверх (1 команда)
2. Квадрат (цикл 4 раза)
3. Треугольник (цикл 3 раза с rotate 120)
4. Спираль (двойной цикл)
5. Звезда (вложенные циклы)

### Задачи:**
- [ ] Создать новый файл `scripts/painter.js` (отдельная игра)
- [ ] Canvas для рисования (500x500)
- [ ] Парсер кода с поддержкой `for` и `function`
- [ ] Алгоритм проверки совпадения узора
- [ ] 5-10 уровней примеров
- [ ] UI/UX интеграция в `index.html`

---

## 📌 ПРИОРИТЕТ 5: Таблица лидеров (Неделя 3-4)

### Простая версия:
```javascript
// На клиенте после victory
const leaderboard = await fetch('/api/leaderboard/maze?limit=100').json();
// Показать топ 100 с рангами и временем

// Если текущий игрок в топ 100:
const playerRank = leaderboard.findIndex(p => p.user_id === userId) + 1;
```

### UI:
- Таблица с колонками: Ранг | Имя | Игра | Баллы | Режим
- Фильтры: [Maze] [Speed] [Precision]
- Periode: [All time] [This week] [This month]
- Если залогинен: выделить текущего игрока

**Задачи:**
- [ ] API endpoint `/api/leaderboard/:game`
- [ ] Кэширование лидерборда (обновлять каждые 5 мин)
- [ ] Модальное окно/страница лидерборда
- [ ] Периоды (alltime, week, month)
- [ ] Синхронизировать с прогрессом

---

## 🚀 Быстрые побеждъ (можно сделать за дни):

### День 1-2: Режимы в Maze Quest
```javascript
// добавить в initGame():
const mode = localStorage.getItem('selectedMode') || 'story';
gameState.mode = mode;
if (mode === 'speed') {
  gameState.optimalSteps = bfs(startX, startY, finishX, finishY).length;
}
```

### День 3-4: Выбор режима в UI
```html
<div class="mode-selector">
  <button class="mode" data-mode="story">📖 Story</button>
  <button class="mode" data-mode="speed">⚡ Speed</button>
  <button class="mode" data-mode="precision">🎯 Precision</button>
</div>
```

### День 5-6: Таблица лидеров (демо локальная)
```javascript
const mockLeaderboard = [
  { rank: 1, name: "Player1", score: 1500 },
  { rank: 2, name: "Player2", score: 1200 },
];
// Показать в модальном окне
```

---

## 📊 Метрики успеха фазы 1

- ✅ Maze Quest имеет 3 режима (Story, Speed, Precision)
- ✅ Лабиринты генерируются процедурно (не жестко закодированы)
- ✅ Code Painter работает (5+ уровней)
- ✅ Система регистрации и сохранения прогресса
- ✅ Таблица лидеров работает
- ✅ 1000+ сыгранных уровней (внутри команды + друзей)

---

## 💾 Стек технологий для этапа

**Frontend:**
- Vanilla JS (как есть)
- HTML5 Canvas (рисование)
- CSS3 Grid/Flexbox

**Backend:**
- Node.js + Express
- PostgreSQL (или SQLite для быстрого старта)
- JWT для аутентификации
- Cors для кроссдомен запросов

**DevOps:**
- Git для версионирования
- GitHub Actions для CI (basic tests)
- localhost для разработки (localhost:3000)

---

## 📋 Чек-лист для старта

### Неделя 1:
- [ ] Реализовать Recursive Backtracker
- [ ] Тестировать генерацию 100+ лабиринтов
- [ ] Интегрировать в gameState

### Неделя 2:
- [ ] Добавить режимы (Story, Speed, Precision)
- [ ] UI для выбора режима
- [ ] Обновить Victory modal

### Неделя 3:
- [ ] Простая таблица лидеров (mock)
- [ ] Начать разработку Code Painter
- [ ] Спроектировать DB

### Неделя 4-6:
- [ ] Реализовать регистрацию/логин
- [ ] API endpoints для прогресса
- [ ] Синхронизация с лидербордом
- [ ] Завершить Code Painter v1 (5 уровней)

---

## 🎓 Обучающий компонент (не забыть!)

На каждый уровень добавить:
- **Learning Goal:** "Научиться использовать BFS для поиска пути"
- **Explanation:** Видео/текст объяснение (1-2 минуты)
- **Hint System:** Подсказка показывает 5 шагов, а не всё решение
- **Feedback:** "Отлично! Ты использовал оптимальный путь" или "Попробуй найти более короткий путь"

```javascript
const levelMeta = {
  1: {
    game: 'maze',
    goal: 'Reach the finish',
    complexity: 'easy',
    bfsRequired: false,
    videoURL: 'https://...'
  }
};
```

---

*План составлен: 2026-04-26*
*Версия: 1.0*
