import type { Tokens } from './types';
export const money = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
export const compactNumber = (n: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
export const fullNumber = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n));
export function duration(ms: number) {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  if (minutes < 1) return '<1m';
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export const modelLabel = (model: string) =>
  model
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '')
    .replace(/^(opus|sonnet|haiku|fable|mythos)-(\d+)-(\d+)/, '$1 $2.$3')
    .replace(/^(opus|sonnet|haiku|fable|mythos)-(\d+)/, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
export const providerLabel = (p: string) => (p === 'claude' ? 'Claude Code' : 'Codex');
export const relativeTime = (timestamp: number, now = Date.now()) => {
  const m = Math.max(0, Math.floor((now - timestamp) / 60000));
  return m < 1
    ? 'Just now'
    : m < 60
      ? `${m}m ago`
      : m < 1440
        ? `${Math.floor(m / 60)}h ago`
        : `${Math.floor(m / 1440)}d ago`;
};
export function resetCountdown(at: number | null, now = Date.now()) {
  if (at === null) return 'Reset time unavailable';
  if (at <= now) return 'Awaiting fresh usage';
  return `Resets in ${duration(at - now)}`;
}
export const tokensTotal = (t: Tokens) => t.input + t.cached + t.cacheWrite + t.output;
