/* ============================================================
 * todo addon - data model
 *
 * The list lives inside a stage comment as JSON after the `_TODO_LIST_` marker:
 *   {groups: [{id, name, color}],
 *    tasks:  [{id, name, startTime, endTime, done, groupId|tags, color,
 *              priority, steps: [{id, text, done}]}]}
 *
 * Compatibility rules (do not break when editing an old project):
 *  - unknown fields are preserved on read AND on write (spread raw first);
 *  - `groupId` and `tags` are both accepted and kept in sync;
 *  - legacy `color` is still rendered as-is until the item is saved, so an old
 *    custom colour does not change just by opening the list;
 *  - legacy `priority: 1` was written but never used, so it is only trusted
 *    when the stored colour matches that level. Otherwise the closest level is
 *    inferred from the stored colour;
 *  - `startTime` / `endTime` stay numeric timestamps; `showTime` only controls
 *    visibility, so hiding a range never destroys it.
 * ============================================================ */

export const TODO_POINT = '_TODO_LIST_';
export const EMPTY_TODO = Object.freeze({groups: [], tasks: []});
export const DEFAULT_DURATION = 10000086;

// Priority drives the colour now. All four colours are dark enough for white
// text on the translucent card (see getContrastColor), and 1 is the legacy
// default so old data naturally lands on "normal".
export const LEVELS = Object.freeze([
    {id: 0, color: '#5b7a99'},
    {id: 1, color: '#0099ff'},
    {id: 2, color: '#c96a10'},
    {id: 3, color: '#d43b3b'}
]);

// Groups pick from a small palette instead of a free-form colour picker.
export const GROUP_COLORS = Object.freeze([
    '#0099ff', '#5b7a99', '#2e9e6b', '#c96a10', '#d43b3b', '#8a5cc9'
]);

export const generateId = () => `todo-${Math.random().toString(36).slice(2, 11)}`;

const asArray = value => (Array.isArray(value) ? value : []);

const parseColor = value => {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (text[0] === '#') {
        const hex = text.slice(1);
        if (/^[\da-f]{3}$/i.test(hex)) return hex.split('').map(char => parseInt(char + char, 16));
        if (/^[\da-f]{6}$/i.test(hex)) return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
        return null;
    }
    const match = text.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

const colorDistance = (a, b) => a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0);

const nearestIndex = (color, palette) => {
    const rgb = parseColor(color);
    if (!rgb) return -1;
    let best = -1;
    let bestDistance = Infinity;
    palette.forEach((candidate, index) => {
        const target = parseColor(candidate);
        if (!target) return;
        const distance = colorDistance(rgb, target);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = index;
        }
    });
    return best;
};

export const levelOf = priority => {
    const index = Number(priority);
    return Number.isInteger(index) && index >= 0 && index < LEVELS.length ? LEVELS[index] : LEVELS[1];
};

export const inferPriority = task => {
    const stored = Number(task.priority);
    const level = Number.isInteger(stored) ? LEVELS[stored] : null;
    const storedRgb = parseColor(task.color);
    if (level && (!storedRgb || (parseColor(level.color) && colorDistance(storedRgb, parseColor(level.color)) === 0))) {
        return stored;
    }
    const nearest = nearestIndex(task.color, LEVELS.map(item => item.color));
    return nearest === -1 ? LEVELS[1].id : LEVELS[nearest].id;
};

// Stored colour wins for untouched legacy items; new/edited items always store
// the level colour, so this is effectively "colour = level" for new data.
export const taskColor = task => (typeof task.color === 'string' && task.color ? task.color : levelOf(task.priority).color);

export const groupColorIndex = color => {
    const index = nearestIndex(color, GROUP_COLORS);
    return index === -1 ? 0 : index;
};

export const getContrastColor = color => {
    const rgb = parseColor(color);
    if (!rgb) return '#000000';
    const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
};

// Accepts numeric timestamps, numeric strings and ISO strings.
export const normalizeTime = value => {
    if (value === null || value === undefined || value === '') return null;
    const text = String(value).trim();
    const numeric = typeof value === 'number' ? value : (/^\d+$/.test(text) ? Number(text) : NaN);
    const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value);
    const time = date.getTime();
    return Number.isFinite(time) ? time : null;
};

const pad = num => String(num).padStart(2, '0');

export const toDatetimeLocal = value => {
    const time = normalizeTime(value);
    if (time === null) return '';
    const date = new Date(time);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const fromDatetimeLocal = value => {
    if (!value) return null;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
};

export const getFormattedDateRange = (timestamp1, timestamp2) => {
    const time1 = normalizeTime(timestamp1);
    const time2 = normalizeTime(timestamp2);
    if (time1 === null || time2 === null) return '';
    const date1 = new Date(time1);
    const date2 = new Date(time2);
    const full1 = `${date1.getFullYear()}-${pad(date1.getMonth() + 1)}-${pad(date1.getDate())}`;
    const full2 = `${date2.getFullYear()}-${pad(date2.getMonth() + 1)}-${pad(date2.getDate())}`;
    const clock1 = `${pad(date1.getHours())}:${pad(date1.getMinutes())}:${pad(date1.getSeconds())}`;
    const clock2 = `${pad(date2.getHours())}:${pad(date2.getMinutes())}:${pad(date2.getSeconds())}`;
    return full1 === full2
        ? `${full1} ${clock1} → ${clock2}`
        : `${full1} ${clock1} → ${full2} ${clock2}`;
};

export const normalizeGroup = raw => ({
    ...raw,
    id: raw.id || generateId(),
    name: typeof raw.name === 'string' ? raw.name : '',
    color: typeof raw.color === 'string' && raw.color ? raw.color : GROUP_COLORS[0]
});

export const normalizeTask = raw => {
    const groupIds = Array.from(new Set([...asArray(raw.groupId), ...asArray(raw.tags)]));
    return {
        ...raw,
        id: raw.id || generateId(),
        name: typeof raw.name === 'string' ? raw.name : '',
        priority: inferPriority(raw),
        groupId: groupIds,
        tags: groupIds.slice(),
        showTime: typeof raw.showTime === 'boolean'
            ? raw.showTime
            : (normalizeTime(raw.startTime) !== null && normalizeTime(raw.endTime) !== null),
        startTime: normalizeTime(raw.startTime),
        endTime: normalizeTime(raw.endTime),
        done: !!raw.done,
        steps: asArray(raw.steps)
            .filter(step => step && typeof step === 'object')
            .map(step => ({
                ...step,
                id: step.id || generateId(),
                text: typeof step.text === 'string' ? step.text : '',
                done: !!step.done
            }))
    };
};

export const normalizeTodoList = raw => {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
        ...source,
        groups: asArray(source.groups).filter(group => group && typeof group === 'object').map(normalizeGroup),
        tasks: asArray(source.tasks).filter(task => task && typeof task === 'object').map(normalizeTask)
    };
};

export const parseTodoList = (text, point = TODO_POINT) => {
    try {
        const payload = String(text).split(point)[1];
        return normalizeTodoList(payload ? JSON.parse(payload) : {});
    } catch (e) {
        return normalizeTodoList({});
    }
};

// The marker must never appear inside user text, otherwise `split(POINT)` would
// cut the JSON in half. Escape it for the whole payload, not just new items.
export const formatTodoComment = (content, point = TODO_POINT) => `
This comment is for the "todo" addon, this comment will storage your to-do list.\n
So don't edit, remove it. But you can move, resize and hide it, it won't affect work.
${point}
${JSON.stringify(content).replaceAll(point, `Why? ${point.split('').join(' ')} is key word, how did you found it?`)}
`;
