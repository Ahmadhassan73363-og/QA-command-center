export const asString = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
export const asNumber = (v, fallback) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
export const asStringArray = (v, fallback) => Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : fallback;
//# sourceMappingURL=util.js.map