import type { CellColor } from './index.js';

export interface IslandReasoningState {
  width: number;
  height: number;
  clues: readonly (readonly (number | null)[])[];
  cells: readonly (readonly (CellColor | null)[])[];
  adjacent: Array<Array<Array<[number, number]>>>;
}

export function enumerateIslandShapes(
  state: IslandReasoningState, start: number, maxShapes: number, collectReview = true
) {
  const { width, clues, cells, adjacent } = state;
  const row = Math.floor(start / width);
  const col = start % width;
  const clue = clues[row][col];
  if (clue === null) throw new Error('Island shape enumeration requires a clue');
  const confirmed = new Set<number>([start]);
  const reviewed = collectReview ? new Set<number>([start]) : undefined;
  const queue = [start];
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    for (const [r, c] of adjacent[Math.floor(current / width)][current % width]) {
      const next = r * width + c;
      reviewed?.add(next);
      if (cells[r][c] === 'white' && !confirmed.has(next)) {
        confirmed.add(next);
        queue.push(next);
      }
    }
  }
  if (confirmed.size === clue) return { shapes: [[...confirmed]], confirmed, reviewed };
  let shapes = new Map<string, number[]>([[String(start), [start]]]);
  for (let size = 1; size < clue; size += 1) {
    const expanded = new Map<string, number[]>();
    for (const shape of shapes.values()) {
      for (const position of shape) {
        for (const [r, c] of adjacent[Math.floor(position / width)][position % width]) {
          const next = r * width + c;
          reviewed?.add(next);
          if (shape.includes(next) || cells[r][c] === 'black' ||
              (clues[r][c] !== null && next !== start) ||
              adjacent[r][c].some(([nr, nc]) => {
                reviewed?.add(nr * width + nc);
                return clues[nr][nc] !== null && nr * width + nc !== start;
              })) continue;
          const candidate = [...shape, next].sort((a, b) => a - b);
          expanded.set(candidate.join(','), candidate);
          if (expanded.size > maxShapes) return null;
        }
      }
    }
    shapes = expanded;
  }
  const valid = [...shapes.values()].filter((shape) =>
    [...confirmed].every((position) => shape.includes(position)));
  if (valid.length === 0) throw new Error('Contradiction in island shape deduction');
  return { shapes: valid, confirmed, reviewed };
}

function graphFor(state: IslandReasoningState): number[][] {
  return state.adjacent.flat().map((neighbors) => neighbors.map(([r, c]) => r * state.width + c));
}

export function findWhiteConnections(state: IslandReasoningState): number[] {
  const { width, height, clues, cells } = state;
  const graph = graphFor(state);
  const seen = new Set<number>();
  const components: Array<{ positions: number[]; clue: number | null }> = [];
  for (let start = 0; start < width * height; start += 1) {
    if (cells[Math.floor(start / width)][start % width] !== 'white' || seen.has(start)) continue;
    const positions = [start];
    seen.add(start);
    let clue: number | null = null;
    for (let i = 0; i < positions.length; i += 1) {
      const position = positions[i];
      const value = clues[Math.floor(position / width)][position % width];
      if (value !== null) {
        if (clue !== null) throw new Error('Contradiction in white connection deduction');
        clue = value;
      }
      for (const next of graph[position]) {
        if (cells[Math.floor(next / width)][next % width] === 'white' && !seen.has(next)) {
          seen.add(next);
          positions.push(next);
        }
      }
    }
    components.push({ positions, clue });
  }
  const orphans = components.filter(({ clue }) => clue === null);
  if (orphans.length === 0) return [];
  const owners = components.filter(({ clue }) => clue !== null).map((component) => {
    const start = component.positions.find((position) => clues[Math.floor(position / width)][position % width] !== null);
    if (start === undefined || component.clue === null) throw new Error('Missing white component clue');
    const parents = new Int32Array(width * height).fill(-1);
    const distance = new Int32Array(width * height);
    const queue = [start];
    parents[start] = start;
    for (let i = 0; i < queue.length; i += 1) {
      const position = queue[i];
      if (distance[position] + 1 >= component.clue) continue;
      for (const next of graph[position]) {
        const r = Math.floor(next / width);
        const c = next % width;
        if (parents[next] !== -1 || cells[r][c] === 'black' || clues[r][c] !== null ||
            graph[next].some((neighbor) => neighbor !== start &&
              clues[Math.floor(neighbor / width)][neighbor % width] !== null)) continue;
        parents[next] = position;
        distance[next] = distance[position] + 1;
        queue.push(next);
      }
    }
    return {
      start,
      parents,
      reachable: new Set(queue),
      size: component.positions.length,
      clue: component.clue
    };
  });
  const forced = new Set<number>();
  for (const orphan of orphans) {
    const possible = owners.filter((owner) =>
      owner.size + orphan.positions.length <= owner.clue &&
      owner.parents[orphan.positions[0]] !== -1);
    if (possible.length === 0) throw new Error('Contradiction in white connection ownership');
    if (possible.length !== 1) continue;
    const owner = possible[0];
    const target = orphan.positions.find((position) => owner.parents[position] !== -1);
    if (target === undefined) throw new Error('Missing white connection target');
    // Test a candidate path against the complete reachable region, not just the BFS tree.
    for (let blocked = target; blocked !== owner.start; blocked = owner.parents[blocked]) {
      if (cells[Math.floor(blocked / width)][blocked % width] !== null || forced.has(blocked)) continue;
      const reached = new Set<number>([owner.start]);
      const queue = [owner.start];
      for (let i = 0; i < queue.length && !reached.has(target); i += 1) {
        for (const next of graph[queue[i]]) {
          if (next !== blocked && owner.reachable.has(next) && !reached.has(next)) {
            reached.add(next);
            queue.push(next);
          }
        }
      }
      if (!reached.has(target)) forced.add(blocked);
    }
  }
  return [...forced];
}

export function findSharedIslandSpace(state: IslandReasoningState, maxShapes: number) {
  const { width, height, clues, cells } = state;
  const graph = graphFor(state);
  const islands = [];
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (clues[row][col] === null) continue;
      const candidates = enumerateIslandShapes(state, row * width + col, maxShapes);
      if (candidates === null) continue;
      islands.push({
        ...candidates,
        shapes: candidates.shapes.map((positions) => ({
          positions, occupied: new Set(positions),
          neighborhood: new Set(positions.flatMap((position) => [position, ...graph[position]]))
        }))
      });
    }
  }
  const deductions: Array<{ positions: number[]; reviewed: Set<number> }> = [];
  for (let i = 0; i < islands.length; i += 1) {
    const left = islands[i];
    const neighborhood = new Set(left.shapes.flatMap((shape) => [...shape.neighborhood]));
    for (const right of islands.slice(i + 1)) {
      if (!right.shapes.some((shape) => shape.positions.some((position) => neighborhood.has(position)))) continue;
      let common: Set<number> | null = null;
      for (const a of left.shapes) {
        for (const b of right.shapes) {
          if (b.positions.some((position) => a.neighborhood.has(position))) continue;
          if (common === null) common = new Set([...a.positions, ...b.positions]);
          else {
            for (const position of common) {
              if (!a.occupied.has(position) && !b.occupied.has(position)) common.delete(position);
            }
          }
        }
      }
      if (common === null) throw new Error('Contradiction in shared island space deduction');
      const positions = [...common].filter((position) => cells[Math.floor(position / width)][position % width] === null);
      if (positions.length > 0) {
        deductions.push({
          positions,
          reviewed: new Set([
            ...(left.reviewed ?? []), ...(right.reviewed ?? []),
            ...left.shapes.flatMap((shape) => [...shape.neighborhood]),
            ...right.shapes.flatMap((shape) => [...shape.neighborhood])
          ])
        });
      }
    }
  }
  return deductions;
}
