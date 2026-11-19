import type { Difficulty } from './index.js';

export function makeRandom(seed: number, difficulty: Difficulty): () => number {
  let state = (seed ^ Math.floor(seed / 0x100000000) ^
    (difficulty === 'easy' ? 0x9e3779b9 : difficulty === 'normal' ? 0x85ebca6b : 0xc2b2ae35)) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}
