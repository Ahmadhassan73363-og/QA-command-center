import type { CheckDefinition } from './types.js';

const registry = new Map<string, CheckDefinition>();

export function registerCheck(def: CheckDefinition): void {
  if (registry.has(def.type)) throw new Error(`Check "${def.type}" registered twice`);
  registry.set(def.type, def);
}

export const getCheck = (type: string): CheckDefinition | undefined => registry.get(type);
export const listChecks = (): CheckDefinition[] => [...registry.values()];
