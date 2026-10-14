import type { LimitWindow, ProviderLimits } from '../src/shared/types';
import { timestamp } from './parser';

const DAY = 86_400_000;
export function ageWindow(window: LimitWindow, now: number): LimitWindow {
  const expired = window.resetsAt !== null && window.resetsAt <= now;
  return { ...window, expired, stale: expired || now - window.observedAt > 20 * 60_000 };
}
// Claude desktop history contains percentages, not official reset timestamps.
// A drop brackets a renewal. Its later sample is a conservative estimated anchor.
export function claudeHistoryLimits(data: unknown, now: number): ProviderLimits {
  const result: ProviderLimits = { provider: 'claude', plan: null, windows: [], note: null };
  const d = data as { version?: number; samples?: any[] } | null;
  if (!d || ![1, 2].includes(d.version ?? 0) || !Array.isArray(d.samples)) {
    result.note = 'No compatible Claude desktop usage history found. Session costs still work.';
    return result;
  }
  const samples = d.samples.filter(x => x && timestamp(x.t) > 0 && timestamp(x.t) <= now + 300_000).sort((a, b) => a.t - b.t);
  const latest = samples.at(-1);
  if (!latest) { result.note = 'Open Claude desktop to record your plan usage.'; return result; }
  const history = samples.filter(x => x.org === latest.org);
  const values = (s: any) => d.version === 1 ? s : s.u ?? {};
  const latestValues = values(latest);
  for (const [key, minutes, label] of [['fh', 300, '5-hour window'], ['sd', 10080, 'Weekly window'], ['so', 10080, 'Opus weekly'], ['sn', 10080, 'Sonnet weekly']] as const) {
    if (typeof latestValues[key] !== 'number' || !Number.isFinite(latestValues[key])) continue;
    let anchor: number | null = null;
    for (let i = history.length - 1; i > 0; i--) {
      const before = values(history[i - 1])[key], after = values(history[i])[key];
      if (typeof before === 'number' && typeof after === 'number' && after < before - 1) { anchor = timestamp(history[i].t); break; }
    }
    if (minutes === 300 && anchor === null) {
      // First positive sample after a zero offers an approximate session start.
      for (let i = history.length - 1; i > 0; i--) {
        if (values(history[i - 1])[key] === 0 && values(history[i])[key] > 0) { anchor = timestamp(history[i].t); break; }
      }
    }
    // Never fabricate a future reset by repeatedly rolling an old observation forward.
    const reset = anchor === null ? null : anchor + minutes * 60_000;
    result.windows.push(ageWindow({ id: `claude:${key}`, label, windowMinutes: minutes, usedPercent: Math.min(100, Math.max(0, latestValues[key])), resetsAt: reset, resetEstimated: reset !== null, observedAt: timestamp(latest.t), source: 'claude-desktop', stale: false, expired: false }, now));
  }
  if (now - timestamp(latest.t) > DAY) result.note = 'Claude desktop history is over a day old. Open Claude desktop to update it.';
  else result.note = 'Percentages come from Claude desktop. Resets inferred from usage drops are estimates.';
  return result;
}
