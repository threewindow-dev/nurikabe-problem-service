import { describe, expect, it } from 'vitest';
import { analyzePuzzle, combineNurikabeBoard, createSeededPuzzle, type Puzzle } from '@core';
import { meetsSavedQualityTargets } from './saved-quality';
import { samplePuzzle } from './sample-puzzle';
import { hardSamples } from './hard-samples';
import { hardDensity16Sample } from './hard-density16-sample';
import { provePuzzleUniqueness } from '../../../packages/core/src/solution-proof';

describe('automatic save quality', () => {
  const completedBoard = ({ definition, solution }: Puzzle) => combineNurikabeBoard(definition, solution);
  const puzzle = createSeededPuzzle(6, 42, 'normal');
  const analysis = analyzePuzzle(completedBoard(puzzle));

  it('accepts a valid puzzle meeting all revised targets', () => {
    expect(meetsSavedQualityTargets(puzzle, analysis)).toBe(true);
  });

  it('rejects unsolved puzzles and those exceeding each revised target', () => {
    expect(meetsSavedQualityTargets(puzzle, { ...analysis, solved: false })).toBe(false);
    expect(meetsSavedQualityTargets(puzzle, { ...analysis, clueCount: 9 })).toBe(false);
    expect(meetsSavedQualityTargets(puzzle, {
      ...analysis, clueDistribution: [{ value: 1, count: 3 }, { value: 4, count: 1 }]
    })).toBe(false);
    expect(meetsSavedQualityTargets(puzzle, {
      ...analysis, clueDistribution: [{ value: 1, count: 1 }, { value: 6, count: 1 }]
    })).toBe(false);
    expect(meetsSavedQualityTargets(puzzle, {
      ...analysis, clueDistribution: [{ value: 1, count: 1 }, { value: 2, count: 1 }, { value: 3, count: 1 }]
    })).toBe(false);
    expect(meetsSavedQualityTargets({ ...puzzle, difficulty: 'hard' }, analysis)).toBe(false);
  });

  it('keeps the experimental 14×21 sample valid, uniquely solvable by deduction, and within targets', () => {
    const sampleAnalysis = analyzePuzzle(completedBoard(samplePuzzle));
    expect(samplePuzzle.definition).toMatchObject({ width: 14, height: 21 });
    expect(meetsSavedQualityTargets(samplePuzzle, sampleAnalysis)).toBe(true);
  });

  it('keeps the archived hard samples valid and deduction-solvable', () => {
    for (const puzzle of hardSamples) {
      expect(puzzle.difficulty).toBe('hard');
      expect(puzzle.definition.height).toBe(puzzle.definition.width * 3 / 2);
      expect(analyzePuzzle(completedBoard(puzzle)).solved).toBe(true);
    }
  });

  it('verifies the relaxed-density hard sample with exhaustive uniqueness proof', () => {
    const board = completedBoard(hardDensity16Sample);
    const analysis = analyzePuzzle(board);
    const largest = Math.max(...analysis.clueDistribution.map(({ value }) => value));
    expect(analysis.clueCount).toBe(24);
    expect(analysis.clueCount * 100).toBeLessThanOrEqual(analysis.cellCount * 16);
    expect(largest).toBeGreaterThanOrEqual(8);
    expect(analysis.clueDistribution.length * 2).toBeGreaterThanOrEqual(largest);
    expect(analysis.clueDistribution.every(({ count }) => count * 4 <= analysis.clueCount)).toBe(true);
    expect(provePuzzleUniqueness(board, { maxOperations: 10_000_000, maxDurationMs: 10_000 }).status).toBe('unique');
  }, 15000);
});
