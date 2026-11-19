import { createHash } from 'node:crypto';
import { generateExperimentalHardPuzzle } from '../dist/hard-experiment.js';

const seeds = process.argv.slice(2).map(Number);
if (seeds.length === 0) seeds.push(0, 1, 2, 3, 4, 5, 6, 7, 8, 9);
if (seeds.some((seed) => !Number.isSafeInteger(seed))) throw new Error('Seeds must be safe integers');

const canonical = (grid) => {
  const horizontal = grid.map((row) => [...row].reverse());
  return [grid, horizontal, [...grid].reverse(), [...horizontal].reverse()]
    .map((variant) => JSON.stringify(variant)).sort()[0];
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
const results = [];
for (const seed of seeds) {
  const result = generateExperimentalHardPuzzle(seed);
  results.push(result);
  console.log(JSON.stringify({ seed, ...result }));
}
const successful = results.filter((result) => result.status === 'success');
const times = results.map((result) => result.diagnostics.elapsedMs).sort((a, b) => a - b);
const distinct = (select) => new Set(successful.map((result) => hash(canonical(select(result.puzzle))))).size;
console.log(JSON.stringify({
  summary: {
    seeds, attempts: results.length, successes: successful.length,
    successRate: successful.length / results.length,
    constructedBoards: results.reduce((sum, result) => sum + result.diagnostics.constructedBoards, 0),
    distinctConstructedLayoutsIgnoringReflections: new Set(results.flatMap((result) =>
      result.diagnostics.constructedLayoutKeys.map((key) => hash(canonical(key.split('/').map((row) => row.split(''))))))).size,
    constructionMs: results.reduce((sum, result) => sum + result.diagnostics.constructionMs, 0),
    uniquenessMs: results.reduce((sum, result) => sum + result.diagnostics.uniquenessMs, 0),
    multipleSolutions: results.reduce((sum, result) => sum + result.diagnostics.multipleSolutions, 0),
    inconclusiveProofs: results.reduce((sum, result) => sum + result.diagnostics.inconclusiveProofs, 0),
    elapsedMs: {
      mean: times.reduce((a, b) => a + b, 0) / times.length,
      p50: times[Math.ceil(times.length * 0.5) - 1],
      p95: times[Math.ceil(times.length * 0.95) - 1],
      max: times.at(-1)
    },
    distinctClueLayoutsIgnoringReflections: distinct((puzzle) => puzzle.definition.clues),
    distinctSolutionsIgnoringReflections: distinct((puzzle) => puzzle.solution.colors),
    duplicateRateIgnoringReflections: successful.length === 0 ? null
      : 1 - distinct((puzzle) => puzzle.definition.clues) / successful.length
  }
}));
