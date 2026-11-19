import { describe, expect, it } from 'vitest';
import { enumerateIslandShapes, findSharedIslandSpace, findWhiteConnections, type IslandReasoningState } from './island-reasoning.js';

function stateFor(rows: string[]): IslandReasoningState {
  const width = rows[0].length;
  const height = rows.length;
  return {
    width, height,
    clues: rows.map((row) => [...row].map((cell) => /[1-9]/.test(cell) ? Number(cell) : null)),
    cells: rows.map((row) => [...row].map((cell) =>
      cell === '#' ? 'black' : cell === 'w' || /[1-9]/.test(cell) ? 'white' : null)),
    adjacent: rows.map((row, r) => [...row].map((_, c) => {
      const neighbors: Array<[number, number]> = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
      return neighbors.filter(([nr, nc]) => nr >= 0 && nr < height && nc >= 0 && nc < width);
    }))
  };
}

describe('white connection passages', () => {
  it('finds the mandatory path from a clue-less white component without changing the snapshot', () => {
    const state = stateFor([
      '.6w...', '.#...#', '4w.w#1', '.#.###', '.2#1#w',
      '#..#..', '#....w', '#..w#5', '.2#5..'
    ]);
    const before = structuredClone(state);
    expect(findWhiteConnections(state)).toContain(5 * state.width + 5);
    expect(state).toEqual(before);
  });

  it('does not choose a route when the same owner can connect along either side', () => {
    expect(findWhiteConnections(stateFor(['7..', '.#.', '..w']))).toEqual([]);
  });

  it('does not choose an owner when two clues can reach the white component', () => {
    expect(findWhiteConnections(stateFor(['5.....5', '...w...', '.......']))).toEqual([]);
  });
});

describe('two-island shared space', () => {
  it('finds land required by compatible pairs but not by either island alone', () => {
    const state = stateFor([
      '.5w#2.', '##w..#', '1#.#..', '##.4..', 'w#.#..',
      'w#w.##', '3#3#1#', '###.#.', '7wwwww'
    ]);
    const target = 3 * state.width + 4;
    for (let position = 0; position < state.width * state.height; position += 1) {
      if (state.clues[Math.floor(position / state.width)][position % state.width] === null) continue;
      const candidate = enumerateIslandShapes(state, position, 50);
      if (candidate) expect(candidate.shapes.every((shape) => shape.includes(target))).toBe(false);
    }
    const before = structuredClone(state);
    const groups = findSharedIslandSpace(state, 50);
    expect(groups.flatMap(({ positions }) => positions)).toContain(target);
    expect(groups.find(({ positions }) => positions.includes(target))?.reviewed.has(target)).toBe(true);
    expect(state).toEqual(before);
  });

  it('leaves optional space undecided when multiple pair arrangements remain', () => {
    expect(findSharedIslandSpace(stateFor(['2..2', '....', '....']), 50)).toEqual([]);
  });

  it('does not use a partially enumerated island to force shared space', () => {
    expect(findSharedIslandSpace(stateFor(['3.4.', '....', '....', '....']), 1)).toEqual([]);
  });

  it('reports a contradiction when individually possible islands cannot coexist without touching', () => {
    expect(() => findSharedIslandSpace(stateFor(['2.#', '..2']), 50))
      .toThrow('Contradiction in shared island space deduction');
  });
});
