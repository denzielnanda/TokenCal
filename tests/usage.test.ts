import { describe, it, expect } from 'vitest';
import { consumeLine, initialState, extractTokens, codexLimits } from '../electron/parser';
import { estimateCost, tokenCount, zeroTokens } from '../src/shared/pricing';
import { claudeHistoryLimits, ageWindow } from '../electron/limits';
import { buildSnapshot, activeDuration } from '../electron/summary';
import { defaultSettings, validateSettings } from '../electron/settings';

const at = new Date('2026-10-14T18:00:00Z').getTime();
const line = (type: string, payload: object, time = at) =>
  JSON.stringify({ timestamp: new Date(time).toISOString(), type, payload });
const record = (id = 'response-1', time = at) =>
  line(
    'token_usage_record',
    {
      response_id: id,
      usage: {
        input_tokens: 1000,
        cached_input_tokens: 600,
        cache_write_input_tokens: 100,
        output_tokens: 200,
        reasoning_output_tokens: 50,
      },
    },
    time,
  );
function codex(time = at) {
  const s = initialState('codex', 'session.jsonl');
  consumeLine(s, line('session_meta', { id: 's1', cwd: '/work/project' }, time));
  consumeLine(s, line('turn_context', { model: 'gpt-6.1-sol' }, time));
  return s;
}
function claudeChunk(output: number) {
  return JSON.stringify({
    timestamp: new Date(at).toISOString(),
    sessionId: 's1',
    cwd: '/work/project',
    message: {
      id: 'msg1',
      type: 'message',
      model: 'claude-sonnet-5',
      content: [{ type: 'text', text: 'PRIVATE SENTINEL' }],
      usage: {
        input_tokens: 20,
        cache_read_input_tokens: 600,
        cache_creation_input_tokens: 100,
        cache_creation: { ephemeral_1h_input_tokens: 40 },
        output_tokens: output,
      },
    },
    requestId: 'req1',
    type: 'assistant',
  });
}
describe('usage extraction', () => {
  it('separates Codex input, cached and written tokens; reasoning is included in output', () => {
    const t = extractTokens('codex', {
      input_tokens: 1000,
      cached_input_tokens: 600,
      cache_write_input_tokens: 100,
      output_tokens: 200,
      reasoning_output_tokens: 50,
    });
    expect(t).toEqual({
      input: 300,
      cached: 600,
      cacheWrite: 100,
      cacheWriteLong: 0,
      output: 200,
      reasoning: 50,
    });
    expect(tokenCount(t)).toBe(1200);
  });
  it('reads Claude records when the nested message type precedes the top-level type', () => {
    const s = initialState('claude', 's1.jsonl');
    consumeLine(s, claudeChunk(20));
    consumeLine(s, claudeChunk(80));
    consumeLine(s, claudeChunk(80));
    expect(Object.values(s.events)).toHaveLength(1);
    expect(Object.values(s.events)[0].tokens.output).toBe(80);
    expect(JSON.stringify(s)).not.toContain('PRIVATE SENTINEL');
  });
  it('prefers response records and never also counts the cumulative event', () => {
    const s = codex();
    consumeLine(s, record());
    consumeLine(s, record());
    consumeLine(
      s,
      line('event_msg', {
        type: 'token_count',
        info: {
          total_token_usage: { input_tokens: 1000, output_tokens: 200 },
          last_token_usage: { input_tokens: 1000, output_tokens: 200 },
        },
      }),
    );
    expect(Object.values(s.events)).toHaveLength(1);
    expect(tokenCount(Object.values(s.events)[0].tokens)).toBe(1200);
  });
  it('handles old cumulative logs, repeats, and context compaction counter decreases', () => {
    const s = codex();
    const total = (input: number, last = 100) =>
      line('event_msg', {
        type: 'token_count',
        info: {
          total_token_usage: { input_tokens: input, output_tokens: 10 },
          last_token_usage: { input_tokens: last, output_tokens: 10 },
        },
      });
    consumeLine(s, total(500));
    consumeLine(s, total(500));
    consumeLine(s, total(100));
    consumeLine(s, total(200));
    expect(Object.values(s.events)).toHaveLength(2);
    expect(Object.values(s.events).reduce((n, e) => n + tokenCount(e.tokens), 0)).toBe(220);
  });
  it('counts a new response when an old cumulative total is reused after a reset', () => {
    const s = codex(at - 3000);
    for (const [input, time] of [
      [500, at - 3000],
      [100, at - 2000],
      [500, at - 1000],
    ]) {
      consumeLine(
        s,
        line(
          'event_msg',
          {
            type: 'token_count',
            info: {
              total_token_usage: { input_tokens: input },
              last_token_usage: { input_tokens: 100 },
            },
          },
          time,
        ),
      );
    }
    expect(Object.values(s.events)).toHaveLength(2);
    expect(Object.values(s.events).reduce((n, e) => n + tokenCount(e.tokens), 0)).toBe(200);
  });
  it('keeps rate-limit windows with the same duration but different buckets distinct', () => {
    const s = codex();
    for (const id of ['codex', 'model-a'])
      consumeLine(
        s,
        line('event_msg', {
          type: 'token_count',
          rate_limits: {
            limit_id: id,
            primary: { used_percent: 42, window_minutes: 10080, resets_at: at / 1000 + 3600 },
          },
        }),
      );
    expect(s.limits).toHaveLength(2);
    expect(s.limits[0].label).toBe('Weekly window');
    expect(s.limits[0].resetsAt).toBe(at + 3600000);
  });
  it('clamps malformed token values and ignores irrelevant content', () => {
    expect(
      extractTokens('codex', { input_tokens: 10, cached_input_tokens: 100, output_tokens: -20 }),
    ).toEqual({ ...zeroTokens(), cached: 10 });
    const s = codex();
    consumeLine(s, line('response_item', { type: 'message', content: 'PRIVATE SENTINEL' }));
    consumeLine(s, '{"type":"token_usage_record",');
    expect(s.malformed).toBe(1);
    expect(JSON.stringify(s)).not.toContain('PRIVATE');
  });
});
describe('pricing', () => {
  it('prices cache reads and both write durations without double-counting reasoning', () => {
    const s = initialState('claude', 's1.jsonl');
    consumeLine(s, claudeChunk(80));
    const e = Object.values(s.events)[0];
    expect(estimateCost(e).cost).toBeCloseTo(
      (20 * 2 + 600 * 0.2 + 60 * 2.5 + 40 * 4 + 80 * 10) / 1e6,
    );
  });
  it('applies fast and long-context rates at the documented 272k threshold', () => {
    const e = {
      id: 'e',
      provider: 'codex' as const,
      sessionId: 's',
      project: 'p',
      model: 'gpt-6.1-sol',
      timestamp: at,
      tokens: { ...zeroTokens(), input: 300000, output: 1000 },
      fast: true,
    };
    expect(estimateCost(e).cost).toBeCloseTo(2.43);
    expect(
      estimateCost({ ...e, fast: false, tokens: { ...e.tokens, input: 200001 } }).cost,
    ).toBeCloseTo(0.410002);
  });
  it('does not guess unknown family variants or future models', () => {
    const s = codex();
    s.model = 'gpt-future-99';
    consumeLine(s, record());
    const e = Object.values(s.events)[0];
    expect(estimateCost(e).cost).toBeNull();
    expect(
      estimateCost(e, {
        'gpt-future-99': { input: 1, cached: 0, output: 2, cacheWrite: 1, cacheWriteLong: 1 },
      }).cost,
    ).toBeCloseTo(0.0008);
  });
});
describe('quota observations', () => {
  it('does not invent a weekly reset without a drop in Claude history', () => {
    const l = claudeHistoryLimits(
      { version: 2, samples: [{ t: at - 60000, org: 'A', u: { fh: 20, sd: 30 } }] },
      at,
    );
    expect(l.windows[1].resetsAt).toBeNull();
    expect(l.windows[1].usedPercent).toBe(30);
  });
  it('keeps account histories separate and labels inferred resets', () => {
    const l = claudeHistoryLimits(
      {
        version: 2,
        samples: [
          { t: at - 600000, org: 'A', u: { sd: 90 } },
          { t: at - 300000, org: 'B', u: { sd: 10 } },
          { t: at, org: 'B', u: { sd: 15 } },
        ],
      },
      at,
    );
    expect(l.windows[0].resetsAt).toBeNull();
    const renewed = claudeHistoryLimits(
      {
        version: 1,
        samples: [
          { t: at - 600000, sd: 90 },
          { t: at, sd: 10 },
        ],
      },
      at,
    );
    expect(renewed.windows[0].resetEstimated).toBe(true);
    expect(renewed.windows[0].resetsAt).toBe(at + 7 * 86400000);
  });
  it('marks expired observations as stale without showing a made-up zero percent', () => {
    const [w] = codexLimits(
      { primary: { window_minutes: 300, used_percent: 99, resets_at: at / 1000 - 1 } },
      at - 60000,
    );
    expect(ageWindow(w, at)).toMatchObject({ usedPercent: 99, expired: true, stale: true });
  });
});
describe('session summaries', () => {
  it('deduplicates shared response IDs across copied rollouts', () => {
    const a = codex(),
      b = codex();
    consumeLine(a, record());
    consumeLine(b, record());
    const summary = buildSnapshot(
      [a, b],
      defaultSettings('/tmp/test'),
      [],
      { provider: 'claude', plan: null, windows: [], note: null },
      at,
    );
    expect(summary.totals.today.totalTokens).toBe(1200);
    expect(summary.totals.today.sessions).toBe(1);
  });
  it('measures active turns without including idle gaps', () => {
    const s = codex(at - 600000);
    consumeLine(s, line('event_msg', { type: 'task_started', turn_id: 't1' }, at - 600000));
    consumeLine(s, record('r1', at - 580000));
    consumeLine(s, line('event_msg', { type: 'task_complete' }, at - 540000));
    consumeLine(s, line('event_msg', { type: 'task_started', turn_id: 't2' }, at - 120000));
    consumeLine(s, record('r2', at - 90000));
    consumeLine(s, line('event_msg', { type: 'task_complete' }, at - 60000));
    const summary = buildSnapshot(
      [s],
      defaultSettings('/tmp/test'),
      [],
      { provider: 'claude', plan: null, windows: [], note: null },
      at,
    );
    expect(summary.sessions[0].activeMs).toBe(120000);
    expect(summary.sessions[0].elapsedMs).toBe(540000);
    expect(summary.sessions[0].status).toBe('completed');
  });
  it('preserves work time when a session is split across multiple log files', () => {
    const a = codex(at - 600000),
      b = codex(at - 120000);
    consumeLine(a, line('event_msg', { type: 'task_started', turn_id: 'old' }, at - 600000));
    consumeLine(a, record('older-response', at - 580000));
    consumeLine(a, line('event_msg', { type: 'task_complete' }, at - 540000));
    consumeLine(b, line('event_msg', { type: 'task_started', turn_id: 'new' }, at - 120000));
    consumeLine(b, record('newer-response', at - 90000));
    consumeLine(b, line('event_msg', { type: 'task_complete' }, at - 60000));
    const summary = buildSnapshot(
      [a, b],
      defaultSettings('/tmp/test'),
      [],
      { provider: 'claude', plan: null, windows: [], note: null },
      at,
    );
    expect(summary.sessions).toHaveLength(1);
    expect(summary.sessions[0].activeMs).toBe(120000);
    expect(summary.sessions[0].elapsedMs).toBe(540000);
  });
  it('merges overlapping work intervals and clips period boundaries', () => {
    expect(
      activeDuration(
        [
          { id: '1', startedAt: 100, endedAt: 300 },
          { id: '2', startedAt: 200, endedAt: 400 },
        ],
        500,
        250,
      ),
    ).toBe(150);
  });
  it('separates unknown token amounts from priced cost', () => {
    const s = codex();
    s.model = 'unknown';
    consumeLine(s, record());
    const summary = buildSnapshot(
      [s],
      defaultSettings('/tmp/test'),
      [],
      { provider: 'claude', plan: null, windows: [], note: null },
      at,
    );
    expect(summary.totals.today.cost).toBe(0);
    expect(summary.totals.today.unpricedTokens).toBe(1200);
    expect(summary.unknownModels).toEqual(['unknown']);
  });
});
describe('settings validation', () => {
  it('rejects invalid paths, thresholds, prices, and prototype keys', () => {
    const s = defaultSettings('/tmp/test');
    for (const patch of [
      { claudePath: 'relative' },
      { pollSeconds: 0 },
      { dailyBudget: NaN },
      { notifications: 'yes' },
      { priceOverrides: JSON.parse('{"__proto__":{"input":1}}') },
    ])
      expect(() => validateSettings(patch, s)).toThrow();
  });
  it('preserves existing preferences when updating one option', () => {
    const s = defaultSettings('/tmp/test');
    expect(validateSettings({ notifications: true }, s)).toEqual({ ...s, notifications: true });
  });
});
