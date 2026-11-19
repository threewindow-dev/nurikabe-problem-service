import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzePuzzle, combineNurikabeBoard, createSeededPuzzle, type Puzzle, type PuzzleAnalysis } from '@core';
import type { WorkerRequest, GenerationResponse } from './generator.worker';
import App from './App';
import { samplePuzzle } from './sample-puzzle';
import { hardSamples } from './hard-samples';

let generationFailure: string | null = null;
let holdWorker = false;
let pendingWorker: TestWorker | null = null;
let generationOverride: { puzzle: Puzzle; analysis: PuzzleAnalysis } | null = null;

class TestWorker {
  onmessage: ((event: MessageEvent<GenerationResponse>) => void) | null = null;
  private terminated = false;

  postMessage(request: WorkerRequest) {
    if (holdWorker) {
      pendingWorker = this;
      return;
    }
    queueMicrotask(() => {
      if (this.terminated) return;
      try {
        if (generationFailure) throw new Error(generationFailure);
        if (!('puzzle' in request) && generationOverride) {
          this.onmessage?.(new MessageEvent('message', { data: generationOverride }));
          return;
        }
        const puzzle = 'puzzle' in request
          ? request.puzzle
          : createSeededPuzzle(request.width, request.seed, request.difficulty);
        this.onmessage?.(new MessageEvent('message', {
          data: { puzzle, analysis: analyzePuzzle(combineNurikabeBoard(puzzle.definition, puzzle.solution)) }
        }));
      } catch (error) {
        this.onmessage?.(new MessageEvent('message', {
          data: { error: error instanceof Error ? error.message : String(error) }
        }));
      }
    });
  }

  terminate() {
    this.terminated = true;
  }
}

async function renderReady() {
  render(<App />);
  await screen.findByRole('group', { name: '퍼즐 보드' });
}

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    generationFailure = null;
    holdWorker = false;
    pendingWorker = null;
    generationOverride = null;
    vi.stubGlobal('Worker', TestWorker);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows saved count from local cache on first render', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    const puzzle = createSeededPuzzle(6, 42, 'normal');
    const cached = [puzzle, { ...puzzle, id: 'p-normal-2' }, { ...puzzle, id: 'p-normal-3' }];
    window.localStorage.setItem('nurikabe:puzzles', JSON.stringify(cached));

    await renderReady();

    expect(screen.getByText('3 saved')).toBeInTheDocument();
  });

  it('uses selected difficulty when generating a new puzzle', async () => {
    const user = userEvent.setup();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);

    await renderReady();
    await user.click(screen.getByRole('button', { name: 'easy' }));
    expect(screen.getByLabelText('보드 크기')).toHaveValue('6');

    nowSpy.mockReturnValue(2000);
    await user.click(screen.getByRole('button', { name: '새 문제 생성' }));

    expect(await screen.findByText('Nurikabe easy #2000')).toBeInTheDocument();
    expect(screen.getByText('6x9', { selector: 'span' })).toBeInTheDocument();
  });

  it('offers the same four sizes for Easy and Normal and keeps the selected size', async () => {
    const user = userEvent.setup();
    vi.spyOn(Date, 'now').mockReturnValue(42);
    await renderReady();

    const select = screen.getByLabelText('보드 크기');
    const options = () => within(select).getAllByRole('option').map((option) => option.textContent);
    const sizes = ['6x9', '8x12', '10x15', '12x18'];
    expect(options()).toEqual(sizes);
    expect(screen.queryByRole('button', { name: 'hard' })).not.toBeInTheDocument();
    await user.selectOptions(select, '12');
    await user.click(screen.getByRole('button', { name: 'easy' }));
    expect(options()).toEqual(sizes);
    expect(select).toHaveValue('12');
    await user.click(screen.getByRole('button', { name: 'normal' }));
    expect(select).toHaveValue('12');
  });

  it('shows generation requirements for the selected mode and size without replacing the current board', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    await renderReady();
    const user = userEvent.setup();
    const conditions = within(screen.getByRole('region', { name: '보드 생성 조건' }));
    const board = screen.getByRole('group', { name: '퍼즐 보드' });
    expect(conditions.getByText('단서 밀도: 16% 이하 (최대 8개)')).toBeVisible();
    expect(conditions.getByText('최대 단서값: 4 이상')).toBeVisible();
    expect(conditions.getByText(/같은 숫자의 단서:.*25%/)).toBeVisible();
    expect(conditions.getByText(/단서 숫자 종류:.*50%/)).toBeVisible();
    expect(conditions.getByText(/유일해.*8가지 직접 추론/)).toBeVisible();
    expect(conditions.getByText('풀이 분석은 신규 규칙 4개를 포함한 12가지 규칙으로 기록합니다.')).toBeVisible();
    expect(conditions.getByText('선호 조건 (보장하지 않음)')).toBeVisible();
    expect(conditions.queryByText('같은 행·열의 단서 쏠림 완화')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('보드 크기'), '12');
    expect(conditions.getByText('단서 밀도: 16% 이하 (최대 34개)')).toBeVisible();
    expect(conditions.getByText('최대 단서값: 10 이상')).toBeVisible();
    expect(conditions.getByText('같은 행·열의 단서 쏠림 완화')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'easy' }));
    expect(conditions.getByText('선택한 새 보드 기준: easy · 12×18')).toBeVisible();
    expect(conditions.getByText('단서 밀도: 20% 이하 (최대 43개)')).toBeVisible();
    expect(conditions.queryByText('같은 행·열의 단서 쏠림 완화')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '퍼즐 보드' })).toBe(board);
  });

  it('saves current puzzle into local cache and updates saved badge', async () => {
    const user = userEvent.setup();
    vi.spyOn(Date, 'now').mockReturnValue(3000);

    await renderReady();
    await user.click(screen.getByRole('button', { name: '로컬 캐시에 저장' }));

    expect(screen.getByText('1 saved')).toBeInTheDocument();
    const raw = window.localStorage.getItem('nurikabe:puzzles');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as Array<{ id: string }>;
    expect(parsed[0].id).toContain('3000');
  });

  it('automatically saves a qualified board without duplicates', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    await renderReady();
    expect(screen.getByText('1 saved')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: '새 문제 생성' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '새 문제 생성' })).toBeEnabled());
    expect(screen.getByText('1 saved')).toBeInTheDocument();
  });

  it('does not automatically save a board outside the revised targets', async () => {
    const puzzle = createSeededPuzzle(6, 42, 'normal');
    generationOverride = { puzzle, analysis: { ...analyzePuzzle(combineNurikabeBoard(puzzle.definition, puzzle.solution)), solved: false } };
    await renderReady();
    expect(screen.getByText('0 saved')).toBeInTheDocument();
    expect(screen.getByText(/새 조건을 만족하지 않아 자동 저장하지 않았습니다/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: '로컬 캐시에 저장' }));
    expect(screen.getByText('1 saved')).toBeInTheDocument();
  });

  it('opens a cached board and resets its play state', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    const user = userEvent.setup();
    await renderReady();
    const cell = screen.getAllByRole('button', { name: /미표시/ })[0];
    await user.click(cell);
    expect(cell).toHaveAccessibleName(/바다/);
    await user.click(screen.getByRole('button', { name: /저장 보드 열기/ }));
    await waitFor(() => expect(cell).toHaveAccessibleName(/미표시/));
  });

  it('shows the original generation time in analysis after opening a saved board', async () => {
    const puzzle = createSeededPuzzle(6, 42, 'normal');
    const analysis = analyzePuzzle(combineNurikabeBoard(puzzle.definition, puzzle.solution));
    const clock = vi.spyOn(performance, 'now').mockReturnValue(100);
    holdWorker = true;
    render(<App />);
    expect(screen.queryByText(/생성 시간:/)).not.toBeInTheDocument();

    clock.mockReturnValue(1334);
    act(() => pendingWorker?.onmessage?.(new MessageEvent('message', { data: { puzzle, analysis } })));
    expect(screen.getByText('생성 시간: 1.23초', { selector: 'p' })).toBeVisible();
    clock.mockRestore();

    holdWorker = false;
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /저장 보드 열기/ }));
    await waitFor(() => expect(screen.queryByText(/생성 시간:/, { selector: 'p' })).not.toBeInTheDocument());
    await user.click(screen.getByText('퍼즐 분석 (개발용)'));
    expect(screen.getByText('생성 시간: 1.23초')).toBeVisible();
  });

  it('shows that older saved boards have no generation time', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    const legacy = { ...createSeededPuzzle(6, 42, 'normal'), id: 'legacy', title: 'Untimed board' };
    window.localStorage.setItem('nurikabe:puzzles', JSON.stringify([legacy]));
    await renderReady();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /저장 보드 열기.*Untimed board/ }));
    await screen.findByText('Untimed board');
    await user.click(screen.getByText('퍼즐 분석 (개발용)'));
    expect(screen.getByText('생성 시간: 기록 없음')).toBeVisible();
  });

  it('recomputes saved-board observations separately from quality and hides solution coordinates until requested', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    const puzzle = { ...createSeededPuzzle(6, 42, 'normal'), id: 'trace-sample', title: 'Trace sample' };
    const { solveTrace } = analyzePuzzle(combineNurikabeBoard(puzzle.definition, puzzle.solution));
    window.localStorage.setItem('nurikabe:puzzles', JSON.stringify([puzzle]));
    await renderReady();
    const before = window.localStorage.getItem('nurikabe:puzzles');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /저장 보드 열기.*Trace sample/ }));
    await screen.findByText('Trace sample');
    const sidebar = screen.getByRole('complementary', { name: '풀이 규칙 기록' });
    expect(within(sidebar).getByRole('region', { name: '풀이 관측값' })).toBeVisible();
    expect(within(sidebar).getByRole('table', { name: '규칙별 확정 칸 수' })).toBeVisible();
    await user.click(screen.getByText('퍼즐 분석 (개발용)'));
    expect(screen.getByRole('region', { name: '구조적 품질 지표' })).toBeVisible();
    const observations = screen.getByRole('region', { name: '풀이 관측값' });
    expect(within(observations).getByText(`확정한 칸: ${solveTrace.steps.length}칸 (시작 단서 제외)`)).toBeVisible();
    expect(within(observations).getByRole('table', { name: '규칙별 확정 칸 수' })).toBeVisible();
    const table = within(observations).getByRole('table', { name: '규칙별 확정 칸 수' });
    expect(within(table).getAllByRole('row').slice(1).map((row) =>
      within(row).getAllByRole('cell')[0].textContent
    )).toEqual(['1단계', '1단계', '1단계', '1단계', '1단계', '2단계', '3단계', '3단계', '3단계', '3단계', '3단계', '3단계', '3단계']);
    for (const [label, stage, count] of [
      ['섬 분리', 1, solveTrace.observations.deductions.islandSeparation],
      ['섬 확장', 1, solveTrace.observations.deductions.islandExpansion],
      ['섬 크기 초과 방지', 1, solveTrace.observations.deductions.islandOverflow],
      ['섬 모양 교집합', 3, solveTrace.observations.deductions.islandShapeIntersection],
      ['섬 후보 모양의 공통 경계', 3, solveTrace.observations.deductions.islandShapeBoundary],
      ['흰 칸 연결 통로', 3, solveTrace.observations.deductions.whiteConnection],
      ['두 섬의 공통 공간', 3, solveTrace.observations.deductions.sharedIslandSpace],
      ['가정 모순 검증', 3, solveTrace.observations.deductions.assumptionContradiction]
    ] as const) {
      const cells = within(within(table).getByRole('row', { name: new RegExp(`^${label} ${stage}단계 ${count} `) }))
        .getAllByRole('cell');
      expect(cells[1]).toHaveTextContent(String(count));
    }
    expect(within(observations).getByText(new RegExp(`^최대 검토 범위: ${solveTrace.observations.maxReview?.cells}칸`))).toBeVisible();
    expect(within(observations).getByText(`관측 시점 최소 다음 수 후보: ${solveTrace.observations.minCandidateCells}칸`)).toBeVisible();
    await user.click(within(observations).getByText('다음 수 후보 관측 기록'));
    const checkpoints = within(observations).getByRole('table', { name: '스캔 시작 상태별 후보 수' });
    expect(within(checkpoints).getAllByRole('row')).toHaveLength(
      solveTrace.checkpoints.filter(({ remainingCells }) => remainingCells > 0).length + 1
    );
    expect(screen.queryByRole('list', { name: '풀이 확정 기록' })).not.toBeInTheDocument();
    const cell = screen.getAllByRole('button', { name: /미표시/ })[0];
    await user.click(within(observations).getByRole('button', { name: '풀이 기록 보기 (정답 위치 포함)' }));
    expect(within(screen.getByRole('list', { name: '풀이 확정 기록' })).getAllByRole('listitem')).toHaveLength(solveTrace.steps.length);
    expect(cell).toHaveAccessibleName(/미표시/);
    await user.click(screen.getByRole('button', { name: /저장 보드 열기.*Trace sample/ }));
    await waitFor(() => expect(screen.queryByRole('list', { name: '풀이 확정 기록' })).not.toBeInTheDocument());
    expect(window.localStorage.getItem('nurikabe:puzzles')).toBe(before);
  });

  it('labels every row and column outside the clickable board', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    await renderReady();
    const labels = (name: string) => within(screen.getByRole('group', { name }))
      .getByText('1').parentElement?.textContent;
    expect(labels('열 번호')).toBe('123456');
    expect(labels('행 번호')).toBe('123456789');
    expect(within(screen.getByRole('group', { name: '퍼즐 보드' })).getAllByRole('button')).toHaveLength(54);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('보드 크기'), '8');
    await user.click(screen.getByRole('button', { name: '새 문제 생성' }));
    await waitFor(() => expect(labels('열 번호')).toBe('12345678'));
    expect(labels('행 번호')).toBe('123456789101112');
  });

  it('hides unsupported saved puzzles and samples without deleting cached data', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    const archived = [samplePuzzle, ...hardSamples];
    window.localStorage.setItem('nurikabe:puzzles', JSON.stringify(archived));
    await renderReady();
    const list = screen.getByRole('region', { name: '보드 목록' });
    expect(within(list).getAllByRole('button')).toHaveLength(1);
    expect(within(list).getByRole('button', { name: /normal #42/ })).toBeInTheDocument();
    expect(screen.getByText('1 saved')).toBeInTheDocument();
    const cached = JSON.parse(window.localStorage.getItem('nurikabe:puzzles') ?? '[]');
    expect(cached).toEqual(expect.arrayContaining(archived));
  });

  it('selects a saved board and allows viewing its solution without changing play state', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    const user = userEvent.setup();
    await renderReady();
    await user.click(screen.getByRole('button', { name: /저장 보드 열기/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: '새 문제 생성' })).toBeEnabled());
    const board = screen.getByRole('group', { name: '퍼즐 보드' });
    expect(within(board).getAllByRole('button')).toHaveLength(6 * 9);
    const cell = within(board).getAllByRole('button', { name: /미표시/ })[0];
    await user.click(cell);
    await user.click(screen.getByRole('button', { name: '정답 보기' }));
    expect(within(board).queryAllByRole('button', { name: /미표시/ })).toHaveLength(0);
    expect(cell).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '정답 숨기기' }));
    expect(cell).toHaveAccessibleName(/바다/);
  });

  it('replays deductions forward and backward without changing the player marks', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    const puzzle = createSeededPuzzle(6, 42, 'normal');
    const { solveTrace } = analyzePuzzle(combineNurikabeBoard(puzzle.definition, puzzle.solution));
    await renderReady();
    const user = userEvent.setup();
    const board = screen.getByRole('group', { name: '퍼즐 보드' });
    const cells = within(board).getAllByRole('button');
    const first = solveTrace.steps[0];
    const second = solveTrace.steps[1];
    const firstCell = cells[first.row * puzzle.definition.width + first.col];
    const secondCell = cells[second.row * puzzle.definition.width + second.col];
    const previous = screen.getByRole('button', { name: '이전 풀이 단계' });
    const next = screen.getByRole('button', { name: '다음 풀이 단계' });
    expect(previous).toBeDisabled();
    expect(next).toBeDisabled();
    await user.click(firstCell);
    expect(firstCell).toHaveAccessibleName(/바다/);

    await user.click(screen.getByRole('button', { name: '풀이 보기' }));
    expect(firstCell).toHaveAccessibleName(/미표시/);
    expect(firstCell).toBeDisabled();
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();
    const current = screen.getByRole('region', { name: '현재 풀이 단계' });
    expect(current).toHaveTextContent(`풀이 0 / ${solveTrace.steps.length}`);
    expect(current).toHaveTextContent('시작 상태: 단서만 표시합니다.');

    await user.click(next);
    expect(current).toHaveTextContent(`풀이 1 / ${solveTrace.steps.length}`);
    expect(current).toHaveTextContent(`스캔 ${first.scan}`);
    expect(current).toHaveTextContent(`${first.row + 1}행 ${first.col + 1}열 → ${first.color === 'white' ? '섬' : '바다'}`);
    expect(firstCell).toHaveAccessibleName(first.color === 'white' ? /섬/ : /바다/);
    expect(firstCell).toHaveAttribute('aria-current', 'step');
    expect(secondCell).toHaveAccessibleName(/미표시/);
    await user.click(next);
    expect(secondCell).toHaveAttribute('aria-current', 'step');
    await user.click(previous);
    expect(secondCell).toHaveAccessibleName(/미표시/);
    expect(firstCell).toHaveAttribute('aria-current', 'step');
    await user.click(previous);
    expect(firstCell).toHaveAccessibleName(/미표시/);
    expect(previous).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '풀이 숨기기' }));
    expect(screen.queryByRole('region', { name: '현재 풀이 단계' })).not.toBeInTheDocument();
    expect(firstCell).toHaveAccessibleName(/바다/);
    expect(firstCell).toBeEnabled();
    expect(next).toBeDisabled();
  });

  it('switches between solution and playback views and highlights only the current revealed record', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    await renderReady();
    const user = userEvent.setup();
    const board = screen.getByRole('group', { name: '퍼즐 보드' });
    await user.click(screen.getByRole('button', { name: '정답 보기' }));
    await user.click(screen.getByRole('button', { name: '풀이 보기' }));
    expect(screen.getByRole('button', { name: '정답 보기' })).toBeVisible();
    expect(within(board).getAllByRole('button', { name: /미표시/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('list', { name: '풀이 확정 기록' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '풀이 기록 보기 (정답 위치 포함)' }));
    const records = within(screen.getByRole('list', { name: '풀이 확정 기록' })).getAllByRole('listitem');
    await user.click(screen.getByRole('button', { name: '다음 풀이 단계' }));
    expect(records[0]).toHaveAttribute('aria-current', 'step');
    expect(records[1]).not.toHaveAttribute('aria-current');

    await user.click(screen.getByRole('button', { name: '정답 보기' }));
    expect(screen.queryByRole('region', { name: '현재 풀이 단계' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음 풀이 단계' })).toBeDisabled();
    expect(within(board).queryAllByRole('button', { name: /미표시/ })).toHaveLength(0);
    expect(records[0]).not.toHaveAttribute('aria-current');
  });

  it('stops at the end of a stalled trace without revealing the remaining solution and resets on opening another board', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    const puzzle: Puzzle = {
      id: 'stalled', title: 'Stalled trace', difficulty: 'normal',
      definition: { width: 2, height: 2, clues: [[2, null], [null, null]] },
      solution: { width: 2, height: 2, colors: [['white', 'white'], ['black', 'black']] }
    };
    generationOverride = { puzzle, analysis: analyzePuzzle(combineNurikabeBoard(puzzle.definition, puzzle.solution)) };
    window.localStorage.setItem('nurikabe:puzzles', JSON.stringify([createSeededPuzzle(6, 42, 'normal')]));
    await renderReady();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '풀이 보기' }));
    const next = screen.getByRole('button', { name: '다음 풀이 단계' });
    await user.click(next);
    expect(next).toBeDisabled();
    expect(screen.getByRole('region', { name: '현재 풀이 단계' })).toHaveTextContent('미확정 2칸');
    expect(within(screen.getByRole('group', { name: '퍼즐 보드' })).getAllByRole('button', { name: /미표시/ })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /저장 보드 열기/ }));
    expect(screen.queryByRole('region', { name: '현재 풀이 단계' })).not.toBeInTheDocument();
    expect(next).toBeDisabled();
    expect(screen.getByRole('button', { name: '풀이 보기' })).toBeVisible();
  });

  it('handles a puzzle with no deduction records without enabling playback arrows', async () => {
    const puzzle: Puzzle = {
      id: 'no-steps', title: 'No steps', difficulty: 'normal',
      definition: { width: 1, height: 1, clues: [[1]] },
      solution: { width: 1, height: 1, colors: [['white']] }
    };
    generationOverride = { puzzle, analysis: analyzePuzzle(combineNurikabeBoard(puzzle.definition, puzzle.solution)) };
    await renderReady();
    await userEvent.setup().click(screen.getByRole('button', { name: '풀이 보기' }));
    expect(screen.getByRole('button', { name: '이전 풀이 단계' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 풀이 단계' })).toBeDisabled();
    expect(screen.getByRole('region', { name: '현재 풀이 단계' })).toHaveTextContent('기록된 풀이 단계가 없습니다.');
  });

  it('ignores a stale generation response after selecting a saved board', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    const user = userEvent.setup();
    const saved = { ...createSeededPuzzle(6, 42, 'normal'), id: 'alternate', title: 'Alternate board' };
    window.localStorage.setItem('nurikabe:puzzles', JSON.stringify([saved]));
    await renderReady();
    holdWorker = true;
    await user.click(screen.getByRole('button', { name: '새 문제 생성' }));
    const oldWorker = pendingWorker;
    holdWorker = false;
    await user.click(screen.getByRole('button', { name: /저장 보드 열기.*Alternate board/ }));
    expect(await screen.findByText('Alternate board')).toBeInTheDocument();
    const stale = createSeededPuzzle(6, 42, 'normal');
    oldWorker?.onmessage?.(new MessageEvent('message', {
      data: { puzzle: stale, analysis: analyzePuzzle(combineNurikabeBoard(stale.definition, stale.solution)) }
    }));
    expect(screen.getByText('Alternate board')).toBeInTheDocument();
  });

  it('reports storage failure while keeping the generated board playable', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
    await renderReady();
    expect(screen.getByRole('alert')).toHaveTextContent('quota exceeded');
    expect(screen.getByRole('group', { name: '퍼즐 보드' })).toBeInTheDocument();
  });

  it('reports corrupt cache without overwriting it', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    window.localStorage.setItem('nurikabe:puzzles', '{bad json');
    await renderReady();
    expect(screen.getByRole('alert')).toHaveTextContent('저장');
    expect(window.localStorage.getItem('nurikabe:puzzles')).toBe('{bad json');
  });

  it('generates the selected board size and displays clues instead of the solution', async () => {
    const user = userEvent.setup();
    vi.spyOn(Date, 'now').mockReturnValue(42);

    await renderReady();
    await user.selectOptions(screen.getByLabelText('보드 크기'), '8');
    await user.click(screen.getByRole('button', { name: '새 문제 생성' }));

    expect(await screen.findByText('8x12', { selector: 'span' })).toBeInTheDocument();
    const board = screen.getByRole('group', { name: '퍼즐 보드' });
    expect(within(board).getAllByRole('button')).toHaveLength(8 * 12);
  });

  it('shows analysis metrics for the current puzzle without rating its difficulty', async () => {
    const user = userEvent.setup();
    vi.spyOn(Date, 'now').mockReturnValue(42);
    const puzzle = createSeededPuzzle(6, 42, 'normal');
    const { definition, solution } = puzzle;
    const analysis = analyzePuzzle(combineNurikabeBoard(definition, solution));
    const white = solution.colors.flat().filter((cell) => cell === 'white').length;
    const edgeClues = definition.clues.reduce((total, row, r) =>
      total + row.filter((clue, c) =>
        clue !== null && (r === 0 || r === definition.height - 1 || c === 0 || c === definition.width - 1)
      ).length, 0
    );
    await renderReady();

    await user.click(screen.getByText('퍼즐 분석 (개발용)'));
    expect(screen.getByText(`단서: ${analysis.clueCount}개 / ${analysis.cellCount}칸`)).toBeInTheDocument();
    expect(screen.getByText(`흰 칸 / 검은 칸: ${white}개 / ${analysis.cellCount - white}개 (흰 칸 비율: ${(white / analysis.cellCount * 100).toFixed(1)}%)`)).toBeInTheDocument();
    expect(screen.getByText(`가장자리 단서: ${edgeClues}개`)).toBeInTheDocument();
    expect(screen.getByText(`단서 1: ${analysis.oneClueCount}개`)).toBeInTheDocument();
    expect(screen.getByText(`단서 분포: ${analysis.clueDistribution.map(({ value, count }) => `${value}: ${count}개`).join(', ')}`)).toBeInTheDocument();
    expect(screen.getByText(`가장 큰 단서: ${Math.max(...definition.clues.flat().filter((clue): clue is number => clue !== null))}`)).toBeInTheDocument();
    expect(screen.getByText(`추론 스캔: ${analysis.deductionRounds}회`)).toBeInTheDocument();
    expect(screen.getByText(/사용된 추론 단계:/)).toHaveTextContent(`${analysis.solveTrace.observations.highestStage}단계`);
  });

  it('cycles editable cells and resets them when a new puzzle is generated', async () => {
    const user = userEvent.setup();
    vi.spyOn(Date, 'now').mockReturnValue(42);
    await renderReady();

    const board = screen.getByRole('group', { name: '퍼즐 보드' });
    const clue = within(board).getAllByRole('button', { name: /단서/ })[0];
    expect(clue).toBeDisabled();
    const cell = within(board).getAllByRole('button', { name: /미표시/ })[0];
    expect(cell).toBeEmptyDOMElement();
    await user.click(cell);
    expect(cell).toHaveAccessibleName(/바다/);
    await user.click(cell);
    expect(cell).toHaveAccessibleName(/섬/);
    await user.click(cell);
    expect(cell).toHaveAccessibleName(/미표시/);
    expect(cell).toBeEmptyDOMElement();
    await user.click(cell);
    await user.click(screen.getByRole('button', { name: '새 문제 생성' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '새 문제 생성' })).toBeEnabled());
    expect(within(board).queryAllByRole('button', { name: /섬|바다/ })).toHaveLength(0);
  });

  it('only declares completion for a fully marked valid board', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    const puzzle = createSeededPuzzle(6, 42, 'normal');
    await renderReady();

    for (let row = 0; row < puzzle.definition.height; row += 1) {
      for (let col = 0; col < puzzle.definition.width; col += 1) {
        if (puzzle.definition.clues[row][col] !== null) continue;
        const cell = screen.getByRole('button', { name: `${row + 1}행 ${col + 1}열: 미표시` });
        fireEvent.click(cell);
        if (puzzle.solution.colors[row][col] === 'white') fireEvent.click(cell);
      }
    }

    expect(screen.getByRole('status')).toHaveTextContent('완료');
    const editable = screen.getAllByRole('button', { name: /섬|바다/ })[0];
    fireEvent.click(editable);
    expect(screen.getByRole('status')).not.toHaveTextContent('완료');
  });

  it('shows an initial generation failure and allows retrying', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    generationFailure = 'generation failed';
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('generation failed');
    expect(screen.queryByRole('group', { name: '퍼즐 보드' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로컬 캐시에 저장' })).toBeDisabled();
    generationFailure = null;
    await userEvent.setup().click(screen.getByRole('button', { name: '새 문제 생성' }));
    expect(await screen.findByRole('group', { name: '퍼즐 보드' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the existing puzzle and play state if generation fails', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    const user = userEvent.setup();
    await renderReady();
    const cell = screen.getAllByRole('button', { name: /미표시/ })[0];
    await user.click(cell);
    generationFailure = 'generation failed';
    await user.click(screen.getByRole('button', { name: '새 문제 생성' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('generation failed');
    expect(cell).toHaveAccessibleName(/바다/);
    expect(screen.getByText('Nurikabe normal #42')).toBeInTheDocument();
  });
});
