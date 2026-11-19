import { validateNurikabeBoard, type CellColor, type NurikabeBoard } from './index.js';

export type SolutionProof =
  | { status: 'unique'; operations: number }
  | { status: 'multiple'; operations: number; alternative: CellColor[][] }
  | { status: 'inconclusive'; operations: number };

class ProofLimit extends Error {}

export function provePuzzleUniqueness(
  board: NurikabeBoard,
  limits: { maxOperations?: number; maxDurationMs?: number } = {}
): SolutionProof {
  if (!validateNurikabeBoard(board).valid) throw new Error('Cannot prove uniqueness of an invalid board');
  const maxOperations = limits.maxOperations ?? 250000;
  const maxDurationMs = limits.maxDurationMs ?? 1000;
  if (!Number.isSafeInteger(maxOperations) || maxOperations < 0 ||
      !Number.isFinite(maxDurationMs) || maxDurationMs < 0) throw new Error('Invalid proof limits');
  const deadline = performance.now() + maxDurationMs;
  let operations = 0;
  const tick = () => {
    operations += 1;
    if (operations > maxOperations ||
        ((operations === 1 || operations % 128 === 0) && performance.now() >= deadline)) throw new ProofLimit();
  };
  const { width, height } = board;
  const area = width * height;
  const bits = Array.from({ length: area }, (_, cell) => 1n << BigInt(cell));
  const full = (1n << BigInt(area)) - 1n;
  const left = Array.from({ length: height }, (_, row) => bits[row * width]).reduce((a, b) => a | b, 0n);
  const right = left << BigInt(width - 1);
  const shift = BigInt(width);
  const expand = (mask: bigint) =>
    (mask | (mask << shift) | (mask >> shift) |
      ((mask & (full ^ left)) >> 1n) | ((mask & (full ^ right)) << 1n)) & full;
  const adjacent = bits.map((_, cell) => {
    const row = Math.floor(cell / width);
    const col = cell % width;
    return [
      ...(row > 0 ? [cell - width] : []), ...(row + 1 < height ? [cell + width] : []),
      ...(col > 0 ? [cell - 1] : []), ...(col + 1 < width ? [cell + 1] : [])
    ];
  });
  const squares: bigint[] = [];
  for (let row = 0; row + 1 < height; row += 1) {
    for (let col = 0; col + 1 < width; col += 1) {
      const cell = row * width + col;
      squares.push(bits[cell] | bits[cell + 1] | bits[cell + width] | bits[cell + width + 1]);
    }
  }
  const clues = board.clues.flat().flatMap((value, cell) => value === null ? [] : [{ value, cell }]);
  const fixed = clues.reduce((mask, { cell }) => mask | bits[cell], 0n);
  const target = board.colors.flat().reduce((mask, color, cell) =>
    color === 'white' ? mask | bits[cell] : mask, 0n);
  type Shape = { mask: bigint; blocked: bigint };
  const connected = (start: bigint, allowed: bigint): bigint => {
    let reachable = start;
    while (true) {
      tick();
      const next = expand(reachable) & allowed;
      if (next === reachable) return reachable;
      reachable = next;
    }
  };
  try {
    const choices: Shape[][] = clues.map(({ value, cell }) => {
      const forbidden = expand(fixed ^ bits[cell]);
      let shapes = new Map<bigint, number[]>([[bits[cell], [cell]]]);
      for (let size = 1; size < value; size += 1) {
        const next = new Map<bigint, number[]>();
        for (const [mask, cells] of shapes) {
          for (const current of cells) {
            for (const candidate of adjacent[current]) {
              tick();
              if ((forbidden | mask) & bits[candidate]) continue;
              const expanded = mask | bits[candidate];
              if (!next.has(expanded)) next.set(expanded, [...cells, candidate]);
            }
          }
        }
        shapes = next;
      }
      return [...shapes.keys()].map((mask) => ({ mask, blocked: expand(mask) }));
    });
    const search = (left: Shape[][], occupied: bigint, blocked: bigint): bigint | null => {
      tick();
      if (left.length === 0) {
        if (occupied === target) return null;
        const black = full ^ occupied;
        if (squares.some((square) => (square & black) === square)) return null;
        return black === 0n || connected(black & -black, black) === black ? occupied : null;
      }
      const remaining = left.map((shapes) => shapes.filter(({ mask }) => {
        tick();
        return !(mask & blocked);
      }));
      if (remaining.some((shapes) => shapes.length === 0)) return null;
      let possible = occupied;
      for (const shapes of remaining) {
        for (const { mask } of shapes) possible |= mask;
      }
      if (squares.some((square) => !(square & possible))) return null;
      const forcedBlack = full ^ possible;
      if (forcedBlack &&
          (connected(forcedBlack & -forcedBlack, full ^ (occupied | fixed)) & forcedBlack) !== forcedBlack) {
        return null;
      }
      const nextIndex = remaining.reduce((best, shapes, i) =>
        shapes.length < remaining[best].length ? i : best, 0);
      const rest = remaining.filter((_, i) => i !== nextIndex);
      for (const shape of remaining[nextIndex]) {
        const result = search(rest, occupied | shape.mask, blocked | shape.blocked);
        if (result !== null) return result;
      }
      return null;
    };
    const answer = search(choices, 0n, 0n);
    if (answer === null) return { status: 'unique', operations };
    const alternative = Array.from({ length: height }, (_, row) =>
      Array.from({ length: width }, (_, col): CellColor =>
        answer & bits[row * width + col] ? 'white' : 'black'));
    if (!validateNurikabeBoard({ ...board, colors: alternative }).valid) {
      throw new Error('Second-solution search produced an invalid board');
    }
    return { status: 'multiple', operations, alternative };
  } catch (error) {
    if (error instanceof ProofLimit) return { status: 'inconclusive', operations };
    throw error;
  }
}
