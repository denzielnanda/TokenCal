import path from 'node:path';
import { tokenCount, zeroTokens } from '../src/shared/pricing';
import type { Provider, Tokens, UsageEvent, LimitWindow } from '../src/shared/types';

type Obj = Record<string, any>;
export interface Activity { id: string; startedAt: number; endedAt: number | null }
export interface FileState {
  provider: Provider; sessionId: string; project: string; model: string;
  firstAt: number; lastAt: number; turnStart: number | null; turnId: string;
  activities: Record<string, Activity>; events: Record<string, UsageEvent>;
  previousTotal: Tokens | null; sawRecords: boolean; fast: boolean; serviceTier: string;
  limits: LimitWindow[]; plan: string | null; malformed: number;
}
export const number = (x: unknown) => typeof x === 'number' && Number.isFinite(x) ? Math.max(0, x) : 0;
export const timestamp = (x: unknown): number => {
  if (typeof x === 'number' && Number.isFinite(x)) return x < 1e11 ? x * 1000 : x;
  const n = typeof x === 'string' ? Date.parse(x) : NaN;
  return Number.isFinite(n) ? n : 0;
};
export const projectName = (cwd: unknown) => typeof cwd === 'string' ? cwd.replace(/\\/g, '/').split('/').filter(Boolean).pop()?.slice(0, 120) ?? 'Unknown project' : 'Unknown project';
const safeText = (v: unknown, fallback = '') => typeof v === 'string' ? v.slice(0, 160) : fallback;
export function initialState(provider: Provider, file: string): FileState {
  return { provider, sessionId: path.basename(file, '.jsonl'), project: 'Unknown project', model: 'unknown', firstAt: 0, lastAt: 0, turnStart: null, turnId: '', activities: {}, events: {}, previousTotal: null, sawRecords: false, fast: false, serviceTier: '', limits: [], plan: null, malformed: 0 };
}
export function extractTokens(provider: Provider, u: Obj): Tokens {
  const t = zeroTokens();
  t.output = number(u.output_tokens);
  t.reasoning = Math.min(t.output, number(u.reasoning_output_tokens ?? u.output_tokens_details?.thinking_tokens));
  if (provider === 'codex') {
    const input = number(u.input_tokens);
    t.cached = Math.min(input, number(u.cached_input_tokens));
    t.cacheWrite = Math.min(input - t.cached, number(u.cache_write_input_tokens));
    t.input = input - t.cached - t.cacheWrite;
  } else {
    t.input = number(u.input_tokens);
    t.cached = number(u.cache_read_input_tokens);
    t.cacheWrite = number(u.cache_creation_input_tokens);
    t.cacheWriteLong = Math.min(t.cacheWrite, number(u.cache_creation?.ephemeral_1h_input_tokens));
  }
  return t;
}
function begin(s: FileState, at: number, id: string) {
  if (s.turnStart !== null) end(s, at);
  s.turnStart = at; s.turnId = id;
  s.activities[id] = { id, startedAt: at, endedAt: null };
}
function end(s: FileState, at: number) {
  if (s.turnStart !== null && s.activities[s.turnId]) s.activities[s.turnId].endedAt = Math.max(s.turnStart, at);
  s.turnStart = null;
}
function event(s: FileState, at: number, id: string, tokens: Tokens, extra: Partial<UsageEvent> = {}) {
  if (!tokenCount(tokens)) return;
  const old = s.events[id];
  // Claude streams multiple chunks of the same message. Keep the largest counters.
  const merged = old && s.provider === 'claude'
    ? Object.fromEntries(Object.keys(tokens).map(k => [k, Math.max(tokens[k as keyof Tokens], old.tokens[k as keyof Tokens])])) as unknown as Tokens
    : tokens;
  s.events[id] = { id, provider: s.provider, sessionId: s.sessionId, project: s.project, model: s.model, timestamp: old?.timestamp ?? at, tokens: merged, fast: s.fast, serviceTier: s.serviceTier, ...extra };
}
export function codexLimits(raw: Obj, at: number): LimitWindow[] {
  const windows: LimitWindow[] = [];
  for (const key of ['primary', 'secondary']) {
    const w = raw[key];
    if (!w || typeof w.used_percent !== 'number' || !Number.isFinite(w.used_percent)) continue;
    const minutes = number(w.window_minutes ?? w.window_duration_mins);
    if (!minutes) continue;
    const bucket = safeText(raw.limit_id, 'codex');
    const scope = bucket === 'codex' ? '' : `${safeText(raw.limit_name, bucket)} · `;
    windows.push({ id: `codex:${bucket}:${minutes}`, label: scope + (minutes === 300 ? '5-hour window' : minutes === 10080 ? 'Weekly window' : `${Math.round(minutes / 60)}-hour window`), windowMinutes: minutes, usedPercent: Math.min(100, Math.max(0, w.used_percent)), resetsAt: timestamp(w.resets_at) || null, resetEstimated: false, observedAt: at, source: 'codex-log', stale: false, expired: false });
  }
  return windows;
}
export function consumeLine(s: FileState, line: string) {
  // Ignore transcript bodies and large tool outputs without decoding them.
  const type = s.provider === 'claude'
    ? /"type"\s*:\s*"(assistant|user|system)"/.exec(line)?.[1]
    : /"type"\s*:\s*"([a-z_-]+)"/.exec(line.slice(0, 1200))?.[1];
  const allowed = s.provider === 'codex'
    ? ['session_meta', 'turn_context', 'token_usage_record', 'event_msg']
    : ['assistant', 'user', 'system'];
  if (!type || !allowed.includes(type)) return;
  if (s.provider === 'codex' && type === 'event_msg' && !/"type"\s*:\s*"(token_count|task_started|task_complete|turn_aborted|thread_settings_applied)"/.test(line.slice(0, 1600))) return;
  let r: Obj;
  try { r = JSON.parse(line); } catch { s.malformed++; return; }
  if (!r || typeof r !== 'object' || r.type !== type) return;
  const at = timestamp(r.timestamp);
  if (!at) return;
  s.firstAt = s.firstAt ? Math.min(s.firstAt, at) : at;
  s.lastAt = Math.max(s.lastAt, at);
  if (s.provider === 'claude') {
    if (typeof r.sessionId === 'string') s.sessionId = safeText(r.sessionId);
    if (r.cwd) s.project = projectName(r.cwd);
    if (r.type === 'assistant' && r.message?.usage) {
      const m = r.message;
      if (typeof m.model === 'string' && !m.model.startsWith('<')) s.model = safeText(m.model);
      const id = `claude:${safeText(m.id) || safeText(r.uuid) || s.sessionId + ':' + at}:${safeText(r.requestId)}`;
      event(s, at, id, extractTokens('claude', m.usage), { fast: m.usage.speed === 'fast', webSearches: number(m.usage.server_tool_use?.web_search_requests), domestic: m.usage.inference_geo === 'us' });
      if (['end_turn', 'stop_sequence'].includes(m.stop_reason) && !r.isSidechain) end(s, at);
    } else if (r.type === 'user' && !r.isSidechain && !r.isMeta) {
      const content = r.message?.content;
      const isTool = Array.isArray(content) && content.some((p: Obj) => p.type === 'tool_result');
      if (r.toolEndsTurn === true || typeof content === 'string' && content.startsWith('[Request interrupted by user')) end(s, at);
      else if (!isTool) begin(s, at, `claude-turn:${safeText(r.uuid) || at}`);
    } else if (r.type === 'system' && r.subtype === 'turn_duration') end(s, at);
    return;
  }
  const p = r.payload;
  if (!p || typeof p !== 'object') return;
  if (r.type === 'session_meta') {
    s.sessionId = safeText(p.id ?? p.session_id, s.sessionId);
    if (p.cwd) s.project = projectName(p.cwd);
  } else if (r.type === 'turn_context') {
    s.model = safeText(p.model, s.model);
    if (p.cwd) s.project = projectName(p.cwd);
    if (p.service_tier) { s.serviceTier = safeText(p.service_tier); s.fast = ['fast', 'priority'].includes(s.serviceTier); }
  } else if (r.type === 'token_usage_record' && p.usage) {
    s.sawRecords = true;
    event(s, at, `codex:${safeText(p.response_id) || s.sessionId + ':' + at}`, extractTokens('codex', p.usage));
    if (p.thread_token_usage) s.previousTotal = extractTokens('codex', p.thread_token_usage);
  } else if (r.type === 'event_msg') {
    if (p.type === 'task_started') begin(s, timestamp(p.started_at) || at, `codex-turn:${safeText(p.turn_id) || at}`);
    else if (p.type === 'task_complete' || p.type === 'turn_aborted') end(s, timestamp(p.completed_at) || at);
    else if (p.type === 'thread_settings_applied' && p.thread_settings?.service_tier) {
      s.serviceTier = safeText(p.thread_settings.service_tier); s.fast = ['fast', 'priority'].includes(s.serviceTier);
    } else if (p.type === 'token_count') {
      if (p.rate_limits) {
        const limits = Array.isArray(p.rate_limits) ? p.rate_limits : [p.rate_limits];
        for (const raw of limits) {
          const incoming = codexLimits(raw, at);
          const byId = new Map(s.limits.map(w => [w.id, w]));
          incoming.forEach(w => byId.set(w.id, w)); s.limits = [...byId.values()];
          if (typeof raw.plan_type === 'string') s.plan = safeText(raw.plan_type);
        }
      }
      if (!s.sawRecords && p.info?.total_token_usage) {
        const total = extractTokens('codex', p.info.total_token_usage);
        if (tokenCount(total) > tokenCount(s.previousTotal ?? zeroTokens())) {
          const prev = s.previousTotal ?? zeroTokens();
          const delta = p.info.last_token_usage ? extractTokens('codex', p.info.last_token_usage)
            : Object.fromEntries(Object.keys(total).map(k => [k, Math.max(0, total[k as keyof Tokens] - prev[k as keyof Tokens])])) as unknown as Tokens;
          event(s, at, `codex:${s.sessionId}:total:${tokenCount(total)}`, delta);
        }
        s.previousTotal = total;
      }
    }
  }
}
