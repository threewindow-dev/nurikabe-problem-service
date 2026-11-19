# @nurikabe/core

Nurikabe core domain package.  
Includes board generation and rule validation utilities.

## Domain contract

- `PuzzleMetadata` contains `id`, `title`, and `difficulty`.
- `PuzzleDefinition` contains dimensions and a row-major `clues` grid. A
  `Clue` is a positive safe integer no larger than the board area; `null`
  represents an empty clue cell. These numeric constraints are checked at
  runtime.
- `SolutionBoard` contains dimensions and a read-only, row-major `colors`
  grid with only white and black cells. It does not contain clues.
- `NurikabeBoard` combines the definition and solution for generation, analysis,
  and rule validation. `combineNurikabeBoard(definition, solution)` rejects
  mismatched dimensions. Each grid has `height` rows and `width` columns;
  clue cells must be white.
- `Puzzle` stores metadata, `definition`, and `solution`, without a second
  copy of the answer. The browser cache reads both the new format and older
  square or rectangular records with `board` and `grid`; the next write
  stores the separated format.
- `PlayState` stores the player's cells separately from the answer, with
  `unknown` for undecided cells.

## Generation profiles

`GenerationProfile` describes board size, generation mode, and a separate
`quality: QualityConstraints` object for required clue statistics. The mode
selects generation settings, not a measured human difficulty grade. Existing
quality thresholds and search budgets are unchanged.
`checkGenerationProfile(profile, summary)` is a pure check that
returns violations with actual and allowed counts; `summarizeClues` builds
the summary from a list of clue values. A passing profile check does not
validate the board or prove uniqueness. Generators still require both before
returning a puzzle, and search budgets and placement preferences remain
separate from profile requirements.

`getGenerationProfile(width, difficulty)` selects the active generation
requirements. `getClueCountBounds(profile)` returns the integer clue-count limits
used by the generator and the web app's generation conditions below the size picker.
The web app updates these conditions for the selected mode and size, separating
required constraints from optional placement and white-coverage preferences.
`getAutoSaveProfile(difficulty, size)` applies the revised
targets. The web app also requires its existing deduction check for automatic
saving. Archived hard experiments are separate from active generation.

## Main APIs

- `generateNurikabeBoard(width, seed, difficulty)`
  - Creates a deterministic completed board and its clues. Allowed widths are
    6, 8, 10, and 12 for both easy and normal. Hard is not available for
    generation. Height is `width * 3 / 2`. The seed must be a
    safe integer. `getSupportedWidths(difficulty)` returns the allowed widths.
  - The generator accepts only boards whose clues can be completely solved
    using sound deductions, so every returned puzzle has exactly one solution.
    Generation is deterministic for the same arguments in the current version.
  - Clue density is the number of clues divided by the number of cells.
    Easy puzzles and normal puzzles at widths 6, 8, 10, and 12 have maximum
    densities of 20% and 16%, respectively, with no density minimum.
    Each clue value occurs at most `floor(clue count / 4)` times, and at
    least half of the values from 1 through the actual largest clue appear.
    The largest clue is at least 4, 6, 8, or 10 at widths 6, 8, 10, or 12
    respectively.
  - Invalid difficulty, unsupported width, or an unsafe-integer seed throws an
    `Error`. The generator grows and merges islands, trying only valid
    candidates proven solvable by its deductions. Easy makes at most 15 seeded
    attempts and 8,000 intermediate deduction checks (30 and 20,000 at 12x18).
    Normal makes at most 20 attempts and 16,000 intermediate deduction checks. Generation
    explicitly throws if its search
    cannot find a valid puzzle satisfying its mode's quality and uniqueness
    requirements. Deduction contradictions also throw; no unsuccessful
    candidate is returned as a puzzle.
  - These settings are not a calibrated guarantee of human or logical solving
    difficulty. Generation, especially at 12x18,
    can take tens of seconds; the web app generates puzzles in a worker and
    shows failures while retaining the current puzzle. For newly generated
    puzzles the web app displays elapsed time from request start through worker
    response. The duration is stored with the puzzle and appears in Puzzle
    Analysis, including after reopening. Older puzzles without a measurement
    show that no generation time was recorded.
  - After the new easy or normal generator finds a valid puzzle, it tries to
    increase white cells toward 50% and reduce edge clues and clue pairs two
    cells apart. It accepts a change only if the existing quality requirements
    and deduction-based uniqueness proof still hold. This refinement has a
    separate limit of 300 deduction checks, never decreases white coverage,
    and may stop below 50% or without improving placement. A puzzle already
    above 50% is not reduced to meet the preference.
  - Normal 12x18 then tries to reduce the number of clue pairs in the same row
    or column. It moves clues only within their own islands, never adds an edge
    clue, and rechecks deduction-based uniqueness after each proposed move.
    This is a preference with a separate 60-check budget, not a rejection rule.
- `validateNurikabeBoard(board)`
  - Validates a completed rectangular board's dimensions, clue values, cell
    colors, and core Nurikabe constraints:
    - clue on white cells only
    - each white island has exactly one clue
    - island size matches clue value
    - black cells are connected
    - no 2x2 black block
- `createSeededPuzzle(width, seed, difficulty)`
  - Returns a puzzle with metadata, a clue-only `definition`, and a
    color-only `solution`. The UI initializes play from `definition` and
    does not show `solution.colors` unless the player reveals the answer.
- `analyzePuzzle(board)`
  - Separates structural `PuzzleQualityMetrics` from solver
    `DifficultyMetrics`. Existing flat fields remain available for callers.
    No combined quality/difficulty score or human difficulty grade is assigned.
  - Checks that the completed board is valid, then returns clue counts, the
    ratio of clues to cells, and the ratio of 1 clues to all clues (`null` if
    there are no clues). `clueDistribution` lists each present clue value and
    its count in ascending numeric order, or an empty array if there are no
    clues. Invalid boards throw.
  - Analysis uses `RULE_PRIORITY`, ordered by observation stage and then rule:
    completed-island surroundings, 2x2 prevention, island separation, forced
    expansion, size overflow, unreachable cells, island reach, shape intersection,
    common shape boundaries, white connection passages, joint island space, and
    sea connectivity, followed by bounded assumption contradiction checks. It
    confirms one cell, then restarts from the first rule.
    All rule candidates are observed on the same frozen board; recording a
    candidate never advances other rules. Shape enumeration remains bounded;
    skipping an oversized search cannot create an unsound deduction.
    Generator checks retain the original mixed eight-rule scans without the
    four analysis-only additions or the new one-cell scheduling.
  - `techniqueLevel` is the highest level used to solve the puzzle (`basic` or
    `intermediate`, or `advanced`), or `null` if these rules cannot solve it.
    This is specific to this solver's rule order, not a calibrated difficulty
    rating. Assumption contradiction checks are one-step at the trace level:
    one cell color is assumed, then the deterministic rules and a bounded
    whole-board shape-compatibility check determine whether a completion exists.
  - Reports how many previously unknown cells each rule determined and how
    many scans made progress. Counts depend on rule and scan order; scans are
    not inference depth. A stalled result does not imply multiple solutions.
  - `SolveTracer` observes successful cell assignments without changing the
    deduction order. `solveTrace` records version 7, the priority-first policy,
    and ordered zero-based cell coordinates with rule, color, and scan number.
    Scan numbers include scans with no progress and are not dependency depth;
    a record is one confirmed cell, not one independent logical argument.
    Observations include confirmed cells, rule totals, highest used rule level,
    solved status, and remaining cells. Direct deductions use no supplied answer.
    When they stall, `assumptionContradiction` temporarily assigns one unknown
    cell, replays the existing rules, and checks compatible island shapes and sea
    connectivity. If an assumption cannot be completed, the opposite color is
    confirmed. Oversized shape searches remain inconclusive rather than unsound.
    Generator candidate checks do not collect traces.
  - The worker recomputes analysis and the trace for both new and saved boards;
    traces are not stored in the browser cache. Structural quality stays in
    Puzzle Analysis; solving observations and records appear beside the board
    in a sticky right-hand panel on wide screens, or below it on narrow screens.
    Detailed coordinate records are
    hidden behind an explicit spoiler button and never alter the player's cells.
    Beside the solution toggle, playback starts from clues only and uses previous
    and next buttons to apply or undo one trace assignment at a time. The current
    rule, coordinate, color, scan, and review scope appear above the board; its
    cell and any revealed detailed record are highlighted. Playback is read-only,
    preserves player marks, and never fills unresolved cells from the supplied
    solution. Solution view and playback are mutually exclusive. Opening or
    generating a board resets playback; an empty trace disables both arrows.
  - Island separation (an undecided cell joining two clue-bearing islands is
    sea), forced expansion (an incomplete island's only exit is land), and
    island-shape intersection (land shared by every enumerated candidate shape)
    have separate intermediate-rule counts and trace records. Previously
    separation and expansion shared `islandStructure`; shape intersections were
    included in `islandReach`. Version 2 changes attribution only, not solving
    order or generated puzzles. Counts still measure newly confirmed cells.
  - Version 3 adds a separate `RULE_STAGES` observation classification:
    stage 1 is completed-island surroundings, 2x2 prevention, island separation,
    and forced expansion; stage 2 is unreachable cells; stage 3 is island reach,
    shape intersection, and sea connectivity. The UI uses these stages rather
    than the legacy `techniqueLevel`/`RULE_LEVELS` classification. The solver's
    existing rule order and the Easy/Normal generation profiles are unchanged;
    stages are not execution priorities or calibrated difficulty grades.
  - Version 4 adds two deductions to analysis:
    `islandOverflow` (stage 1, legacy basic) makes a cell sea if joining its
    distinct neighboring white components would exceed their single clue's size.
    Clue-less white components are included and each component is counted once.
    `islandShapeBoundary` (stage 3, legacy intermediate) makes cells sea when
    they lie on the outside boundary of every enumerated shape of an island.
    It shares exhaustive candidate enumeration with shape intersection, including
    size-2 islands; both rules skip an island if enumeration hits its limit.
    Size overflow runs in the basic phase; common boundaries run alongside shape
    intersection in the fallback phase. Trace attribution and solving order can
    change. Generator checks retain the original eight rules and candidate order
    to preserve seeded layouts, bounded-search success, and quality preferences.
    Quality constraints and uniqueness requirements are unchanged. Saved boards
    are reanalyzed without changing their definitions.
  - Version 5 adds two analysis-only stage-3 rules (legacy advanced).
    `whiteConnection` finds clue-less white components with only one possible
    owner. Ownership uses conservative reachability and remaining island capacity;
    an undecided cell is land if removing it from the owner's potential region
    disconnects that component from its clue. Alternative owners or routes are
    not guessed. `sharedIslandSpace` considers two islands at a time, discards
    candidate-shape pairs that overlap or touch, and marks land present in the
    union of every remaining pair. This generalizes joint-space counting without
    deciding which island owns a shared cell. It reuses the bounded shape
    enumerator; a truncated island is excluded, never treated as exhaustive.
    No compatible pair reports a contradiction rather than a deduction.
    Each island has at most 50 enumerated shapes, so a pair has at most 2,500
    combinations; unrelated island regions are skipped. These rules run after
    single-island shape reasoning and before sea connectivity. Generation still
    uses only its original eight rules; analysis and checkpoints now use twelve.
  - Version 6 rechecks priority after every single confirmed cell. `RULE_PRIORITY`
    is shared by the solver and the UI table, so the displayed order is the
    actual selection order, including within a stage. A cell justified by several
    rules is attributed to the first-priority rule on that exact board state,
    not whichever batch happened to visit it first. Each progress scan now
    confirms one cell; checkpoints cover every pre-assignment state plus the
    final solved/stalled state. This changes trace order, counts, scan numbers,
    and observed levels, but not saved definitions or generation. Priority is a
    solver policy, not proof of the minimum human reasoning level.
  - Version 7 adds `assumptionContradiction` as the final analysis-only stage-3
    rule. It records cells whose opposite assumption cannot reach a valid board.
    White-connection articulation is checked against the owner's complete
    potential region rather than only a shortest-path tree, and sea feasibility
    is included in assumption replay. The global assumption search permits up
    to 5,000 shapes per island and 50 ms per color assumption; hitting either
    limit returns inconclusive.
  - Each recorded assignment has a `review` scope: distinct referenced cells
    and the height/width of their bounding rectangle. Local rules use their
    component/candidate neighborhood; shape rules include examined
    candidates. Unreachable-cell, sea-connectivity, and white-connection rules
    conservatively use the entire board; shared-space scopes include both
    islands' examined candidates and neighborhoods. Scopes are implementation-level reference regions,
    not minimal proof premises, eye movements, or human difficulty scores.
  - At scan starts after the state changes, the tracer evaluates direct rules
    against the same frozen cells without applying any candidates or propagating
    them. `checkpoints` count unique assignable cells, attributed to the lowest
    stage that finds them. Repeated scans of an unchanged state are not counted
    twice. The solver's shape limit still applies, so this is not an exhaustive
    count of every logical next move. Minimum candidate counts and single-candidate
    checkpoint counts exclude solved states; a stalled state with zero candidates
    is retained. These checkpoint samples do not cover every individual assignment
    within a scan. Probe results do not affect solving or generation.
- `createPlayState(puzzle)`, `setPlayCell(state, row, col, cell)`,
  `evaluatePlayState(state)`
  - Initialize unknown cells and fixed white clues, update a non-clue cell
    immutably, and evaluate progress. Coordinates are zero-based; invalid
    coordinates and attempts to edit clues throw errors.
  - Evaluation returns `playing` with `issues: null` while any cell is unknown.
    Once all cells are marked, the normal board validator determines whether
    the state is `completed` or still `playing` with validation issues.
  - The web app cycles cells through unknown (blank light gray), sea (muted blue),
    and island (warm sand, also used for clues). The board draws its inner grid
    on a non-interactive Canvas at one device pixel per line, with CSS gaps as
    a fallback and a lighter outer border against the dark page. The board
    uses one-based row labels on the left and column labels above the board,
    matching the accessible cell coordinates and trace display. Starting a new puzzle
    or selecting a saved puzzle resets progress. The browser cache saves
    puzzles, not play state. Unsupported modes and sizes are hidden from the
    board list without removing cached data. Experimental samples are kept
    outside the playable list. Selecting a board hides its answer until the
    player explicitly chooses to reveal it.
  - Generated puzzles are automatically cached only when the validated board
    is solved by the deduction engine and meets the revised density maximum
    (20% easy, 16% normal), minimum largest clue (`width - 2`),
    25% per-value limit, and at least half the values from 1 to the largest
    clue are present. Older-policy boards can still be saved manually. Cache
    data is local to the browser and can be lost when browser data is cleared;
    storage errors are displayed without discarding the active puzzle. An
    identical board with the same ID is not duplicated; distinct boards with
    the same ID are preserved.

## Experimental hard generator (10x15 only)

`generateExperimentalHardPuzzle(seed, { maxDurationMs? })` in
`src/hard-experiment.ts` is an opt-in experiment, not the web or public
`createSeededPuzzle` generation path. Its default time budget is 5,000 ms,
with at most eight construction attempts and six clue-placement trials per
completed layout.

It plans 24 island sizes before constructing any colors, exploring the
relaxed 16% density ceiling for this experiment (not a general density
minimum). Plans satisfy the 25% per-value maximum, minimum largest clue 8,
and distinct-value requirement. Row-frontier search tracks white component
sizes and black connectivity, disallows black 2x2 squares, and backtracks
locally instead of starting from a singleton grid. Each attempt has a
2,000-node construction limit. A reservation heuristic narrows construction
and can miss layouts that would require merging open components later.

Only complete boards undergo uniqueness testing: existing deductions first,
then bounded exhaustive island-shape search for a different solution. A
counterexample can guide moving a clue within its island. Proof budget
exhaustion is **inconclusive**, never a uniqueness proof. Failure returns
diagnostics without a puzzle; only a validated board with proven uniqueness
is a success. The deadline is cooperative, not a hard real-time guarantee;
individual validation/deduction calls can add a small overrun.

The seed controls search order, not a guarantee of success or non-repetition.
The benchmark compares actual clue and answer grids, including rectangular
reflections/180-degree rotations. No cache or non-repeating serving pool is
enabled by this experiment.

Build and benchmark (optional arguments select seeds; defaults to 0 through 9):

```bash
npm --prefix packages/core run build
node packages/core/scripts/benchmark-hard.mjs 0 1 42
```

The benchmark prints a JSON line per seed (including a puzzle only on proven
success) and a summary with success rate, timing percentiles, and duplicate
rate. With no successful boards, duplicate rate is `null`, not zero.

Local validation of seeds 0 through 9 at the earlier 12% ceiling produced
42 distinct layouts and no proven-unique puzzle. At the experimental 16%
ceiling, the same seeds produced 10 distinct layouts and one proven-unique
puzzle; 53 clue placements had multiple solutions and five proof checks
exhausted their budget. Mean request time was 4.39 seconds and maximum was
5.001 seconds. A single success is insufficient to evaluate usable-puzzle
diversity or guarantee performance; the experiment does not replace the
existing generator.

## Test

```bash
npm run test
```

From repository root:

```bash
npm run test:core
```

Build the package, including JavaScript and type declarations:

```bash
npm --prefix packages/core run build
```
