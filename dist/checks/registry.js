const registry = new Map();
export function registerCheck(def) {
    if (registry.has(def.type))
        throw new Error(`Check "${def.type}" registered twice`);
    registry.set(def.type, def);
}
export const getCheck = (type) => registry.get(type);
export const listChecks = () => [...registry.values()];
//# sourceMappingURL=registry.js.map