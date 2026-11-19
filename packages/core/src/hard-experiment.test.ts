import { describe, expect, it } from 'vitest';
import { generateExperimentalHardPuzzle } from './hard-experiment';
import { combineNurikabeBoard, validateNurikabeBoard } from './index';

describe('target-first hard experiment', () => {
  it('rejects invalid seeds and time budgets', () => {
    expect(() => generateExperimentalHardPuzzle(0.5)).toThrow('seed');
    expect(() => generateExperimentalHardPuzzle(0, { maxDurationMs: -1 })).toThrow('duration');
  });

  it('reports time exhaustion explicitly without returning an unproved candidate', () => {
    const result = generateExperimentalHardPuzzle(42, { maxDurationMs: 0 });
    expect(result.status).toBe('failed');
    expect(result.diagnostics.stopReason).toBe('time-limit');
    expect(result).not.toHaveProperty('puzzle');
  });

  it('plans the relaxed density while preserving distribution constraints', () => {
    const result = generateExperimentalHardPuzzle(42, { maxDurationMs: 1500 });
    const { diagnostics } = result;
    expect(diagnostics.lastPlan.length).toBeGreaterThan(18);
    expect(diagnostics.lastPlan.length / (10 * 15)).toBeLessThanOrEqual(0.16);
    expect(Math.max(...diagnostics.lastPlan)).toBeGreaterThanOrEqual(8);
    expect(new Set(diagnostics.lastPlan).size * 2).toBeGreaterThanOrEqual(Math.max(...diagnostics.lastPlan));
    for (const value of diagnostics.lastPlan) {
      expect(diagnostics.lastPlan.filter((size) => size === value).length * 4)
        .toBeLessThanOrEqual(diagnostics.lastPlan.length);
    }
    if (result.status === 'success') {
      const { definition, solution } = result.puzzle;
      expect(validateNurikabeBoard(combineNurikabeBoard(definition, solution)).valid).toBe(true);
      const clues = definition.clues.flat().filter((clue) => clue !== null);
      expect(clues.length).toBeGreaterThan(18);
      expect(clues.length / (10 * 15)).toBeLessThanOrEqual(0.16);
      expect(result.proof).toMatch(/deduction|exhaustive/);
    } else {
      expect(result).not.toHaveProperty('puzzle');
    }
  }, 10000);
});
