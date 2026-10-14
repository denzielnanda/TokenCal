import type { Price, Tokens, UsageEvent } from './types';

export const PRICING_UPDATED = '2026-10-14';
const claude = (input: number, output: number, cached = input / 10): Price => ({
  input,
  output,
  cached,
  cacheWrite: input * 1.25,
  cacheWriteLong: input * 2,
});
const openai = (input: number, cached: number, output: number, cacheWrite = input): Price => ({
  input,
  cached,
  output,
  cacheWrite,
  cacheWriteLong: cacheWrite,
});
// USD / million tokens, standard API rates. Sources and assumptions: docs/accuracy.md.
// Unknown models intentionally remain unpriced rather than inheriting a family's price.
export const PRICES: Record<string, Price> = {
  'claude-fable-5-1': claude(10, 50, 0.25),
  'claude-fable-5': claude(10, 50),
  'claude-mythos-5-1': claude(10, 50, 0.25),
  'claude-mythos-5': claude(10, 50),
  'claude-opus-5-5': { ...claude(4, 20, 0.2), fastMultiplier: 2 },
  'claude-opus-5': { ...claude(5, 25), fastMultiplier: 2 },
  'claude-opus-4-8': { ...claude(5, 25), fastMultiplier: 2 },
  'claude-opus-4-7': claude(5, 25),
  'claude-opus-4-6': claude(5, 25),
  'claude-opus-4-5': claude(5, 25),
  'claude-opus-4-1': claude(15, 75),
  'claude-opus-4': claude(15, 75),
  'claude-sonnet-5-5': claude(2, 10, 0.1),
  'claude-sonnet-5': claude(2, 10),
  'claude-sonnet-4-6': claude(3, 15),
  'claude-sonnet-4-5': claude(3, 15),
  'claude-sonnet-4': claude(3, 15),
  'claude-haiku-4-5': claude(1, 5),
  'claude-haiku-3-5': claude(0.8, 4),
  'gpt-6.1-sol': {
    ...openai(2, 0.1, 10, 2.5),
    fastMultiplier: 2,
    longContextAbove: 272_000,
    longInputMultiplier: 2,
    longOutputMultiplier: 1.5,
  },
  'gpt-6-sol': {
    ...openai(2, 0.2, 10, 2.5),
    fastMultiplier: 2,
    longContextAbove: 272_000,
    longInputMultiplier: 2,
    longOutputMultiplier: 1.5,
  },
  'gpt-5.6-sol': {
    ...openai(4, 0.4, 20, 5),
    fastMultiplier: 2,
    longContextAbove: 272_000,
    longInputMultiplier: 2,
    longOutputMultiplier: 1.5,
  },
  'gpt-5.6': {
    ...openai(4, 0.4, 20, 5),
    fastMultiplier: 2,
    longContextAbove: 272_000,
    longInputMultiplier: 2,
    longOutputMultiplier: 1.5,
  },
  'gpt-5.6-terra': {
    ...openai(2, 0.2, 12, 2.5),
    fastMultiplier: 2,
    longContextAbove: 272_000,
    longInputMultiplier: 2,
    longOutputMultiplier: 1.5,
  },
  'gpt-5.5': {
    ...openai(5, 0.5, 30, 6.25),
    fastMultiplier: 2,
    longContextAbove: 272_000,
    longInputMultiplier: 2,
    longOutputMultiplier: 1.5,
  },
  'gpt-6-astra': {
    ...openai(10, 1, 50, 12.5),
    fastMultiplier: 2,
    longContextAbove: 272_000,
    longInputMultiplier: 2,
    longOutputMultiplier: 1.5,
  },
  'gpt-6-luna': {
    ...openai(0.1, 0.01, 0.5, 0.125),
    fastMultiplier: 2,
    longContextAbove: 272_000,
    longInputMultiplier: 2,
    longOutputMultiplier: 1.5,
  },
  'gpt-5.3-codex': { ...openai(1.75, 0.175, 14), fastMultiplier: 2 },
};
export const zeroTokens = (): Tokens => ({
  input: 0,
  cached: 0,
  cacheWrite: 0,
  cacheWriteLong: 0,
  output: 0,
  reasoning: 0,
});
export const tokenCount = (t: Tokens) => t.input + t.cached + t.cacheWrite + t.output;
export const addTokens = (a: Tokens, b: Tokens): Tokens =>
  Object.fromEntries(
    Object.keys(a).map((k) => [k, a[k as keyof Tokens] + b[k as keyof Tokens]]),
  ) as unknown as Tokens;
export const normalizedModel = (model: string) =>
  model
    .toLowerCase()
    .trim()
    .replace(/^.*\//, '')
    .replace(/-\d{4}-\d{2}-\d{2}$|-\d{8}$/, '')
    .replace(/^(claude-(?:opus|sonnet|haiku|fable|mythos)-\d+)\.(\d+)$/, '$1-$2');
export function priceFor(model: string, overrides: Record<string, Price> = {}) {
  const id = normalizedModel(model);
  return overrides[model] ?? overrides[id] ?? PRICES[id];
}
export function estimateCost(
  event: UsageEvent,
  overrides: Record<string, Price> = {},
): { cost: number | null; savings: number } {
  const price = priceFor(event.model, overrides);
  if (!price) return { cost: null, savings: 0 };
  const t = event.tokens;
  const prompt = t.input + t.cached + t.cacheWrite;
  const long = price.longContextAbove !== undefined && prompt > price.longContextAbove;
  let multiplier = event.fast ? (price.fastMultiplier ?? 1) : 1;
  if (event.serviceTier === 'batch' || event.serviceTier === 'flex') multiplier *= 0.5;
  if (event.serviceTier === 'ultrafast') multiplier *= 6;
  if (event.domestic) multiplier *= price.domesticMultiplier ?? 1.1;
  const inputMultiplier = multiplier * (long ? (price.longInputMultiplier ?? 1) : 1);
  const outputMultiplier = multiplier * (long ? (price.longOutputMultiplier ?? 1) : 1);
  const writeLong = Math.min(t.cacheWrite, t.cacheWriteLong);
  const cost =
    ((t.input * price.input +
      t.cached * price.cached +
      (t.cacheWrite - writeLong) * price.cacheWrite +
      writeLong * price.cacheWriteLong) *
      inputMultiplier +
      t.output * price.output * outputMultiplier) /
      1e6 +
    (event.webSearches ?? 0) * 0.01;
  return {
    cost,
    savings: (t.cached * Math.max(0, price.input - price.cached) * inputMultiplier) / 1e6,
  };
}
