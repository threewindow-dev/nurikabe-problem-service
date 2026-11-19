import { describe, expect, it } from 'vitest';
import { provePuzzleUniqueness } from './solution-proof';
import { validateNurikabeBoard, type CellColor, type NurikabeBoard } from './index';

describe('bounded second-solution proof', () => {
  const ambiguous: NurikabeBoard = {
    width: 2, height: 2,
    clues: [[2, null], [null, null]],
    colors: [['white', 'white'], ['black', 'black']]
  };

  it('finds an alternative without treating the supplied answer as the only solution', () => {
    const result = provePuzzleUniqueness(ambiguous);
    expect(result.status).toBe('multiple');
    if (result.status === 'multiple') {
      expect(result.alternative).not.toEqual(ambiguous.colors);
    }
  });

  it('proves a unique answer even when it contains no black cells', () => {
    expect(provePuzzleUniqueness({
      width: 2, height: 2,
      clues: [[4, null], [null, null]],
      colors: [['white', 'white'], ['white', 'white']]
    }).status).toBe('unique');
  });

  it('reports an exhausted budget as inconclusive, never unique', () => {
    expect(provePuzzleUniqueness(ambiguous, { maxOperations: 1 }).status).toBe('inconclusive');
  });

  it('rejects invalid supplied solutions instead of claiming uniqueness', () => {
    expect(() => provePuzzleUniqueness({
      ...ambiguous, colors: [['black', 'black'], ['black', 'black']]
    })).toThrow('invalid board');
  });

  it('agrees with exhaustive coloring counts for small rectangular boards', () => {
    const colorings = Array.from({ length: 64 }, (_, mask) =>
      Array.from({ length: 3 }, (_, row) => Array.from({ length: 2 }, (_, col): CellColor =>
        mask & (1 << (row * 2 + col)) ? 'white' : 'black')));
    let checked = 0;
    for (const colors of colorings) {
      for (const chooseLast of [false, true]) {
        const clues = Array.from({ length: 3 }, () => Array<number | null>(2).fill(null));
        const seen = new Set<number>();
        for (let cell = 0; cell < 6; cell += 1) {
          if (seen.has(cell) || colors[Math.floor(cell / 2)][cell % 2] !== 'white') continue;
          const island = [cell];
          seen.add(cell);
          for (let i = 0; i < island.length; i += 1) {
            const current = island[i];
            const col = current % 2;
            for (const next of [current - 2, current + 2, ...(col === 0 ? [current + 1] : [current - 1])]) {
              if (next < 0 || next >= 6 || seen.has(next) ||
                  colors[Math.floor(next / 2)][next % 2] !== 'white') continue;
              seen.add(next);
              island.push(next);
            }
          }
          const chosen = chooseLast ? island[island.length - 1] : island[0];
          clues[Math.floor(chosen / 2)][chosen % 2] = island.length;
        }
        const board = { width: 2, height: 3, colors, clues };
        if (!validateNurikabeBoard(board).valid) continue;
        const count = colorings.filter((candidate) =>
          validateNurikabeBoard({ ...board, colors: candidate }).valid).length;
        const proof = provePuzzleUniqueness(board);
        expect(proof.status).toBe(count === 1 ? 'unique' : 'multiple');
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});
