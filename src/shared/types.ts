export type Provider = 'claude' | 'codex';
export type Period = 'today' | 'week' | 'month';
export interface Tokens {
  input: number;
  cached: number;
  cacheWrite: number;
  cacheWriteLong: number;
  output: number;
  reasoning: number;
}
export interface UsageEvent {
  id: string;
  provider: Provider;
  sessionId: string;
  project: string;
  model: string;
  timestamp: number;
  tokens: Tokens;
  fast: boolean;
  serviceTier?: string;
  webSearches?: number;
  domestic?: boolean;
}
export interface Session {
  id: string;
  provider: Provider;
  project: string;
  model: string;
  models: string[];
  startedAt: number;
  lastActivity: number;
  activeMs: number;
  elapsedMs: number;
  status: 'working' | 'idle' | 'completed';
  tokens: Tokens;
  cost: number;
  unpricedTokens: number;
  responses: number;
}
export interface LimitWindow {
  id: string;
  label: string;
  windowMinutes: number;
  usedPercent: number;
  resetsAt: number | null;
  resetEstimated: boolean;
  observedAt: number;
  source: 'codex-log' | 'claude-desktop';
  stale: boolean;
  expired: boolean;
}
export interface ProviderLimits {
  provider: Provider;
  plan: string | null;
  windows: LimitWindow[];
  note: string | null;
}
export interface Totals {
  cost: number;
  tokens: Tokens;
  totalTokens: number;
  cacheSavings: number;
  activeMs: number;
  sessions: number;
  unpricedTokens: number;
}
export interface Breakdown {
  label: string;
  provider?: Provider;
  cost: number;
  tokens: number;
  sessions: number;
  unpricedTokens: number;
}
export interface DayTotal {
  date: string;
  claude: number;
  codex: number;
  tokens: number;
}
export interface SourceStatus {
  id: string;
  label: string;
  path: string;
  state: 'ready' | 'missing' | 'disabled' | 'error';
  files: number;
  message?: string;
}
export interface Price {
  input: number;
  cached: number;
  output: number;
  cacheWrite: number;
  cacheWriteLong: number;
  fastMultiplier?: number;
  longContextAbove?: number;
  longInputMultiplier?: number;
  longOutputMultiplier?: number;
  domesticMultiplier?: number;
}
export interface Settings {
  claudeEnabled: boolean;
  codexEnabled: boolean;
  claudePath: string;
  codexPath: string;
  claudeHistoryPath: string;
  pollSeconds: number;
  retentionDays: number;
  launchAtLogin: boolean;
  notchEnabled: boolean;
  trayCost: boolean;
  notifications: boolean;
  dailyBudget: number;
  priceOverrides: Record<string, Price>;
}
export interface Snapshot {
  version: string;
  collectedAt: number;
  scanning: boolean;
  demo: boolean;
  totals: Record<Period, Totals>;
  daily: DayTotal[];
  sessions: Session[];
  models: Breakdown[];
  projects: Breakdown[];
  limits: ProviderLimits[];
  sources: SourceStatus[];
  settings: Settings;
  pricingUpdatedAt: string;
  prices: Record<string, Price>;
  unknownModels: string[];
  warnings: string[];
}
export interface TokenCalAPI {
  getSnapshot(): Promise<Snapshot>;
  refresh(): Promise<void>;
  updateSettings(settings: Partial<Settings>): Promise<Settings>;
  choosePath(kind: 'claude' | 'codex' | 'history'): Promise<string | null>;
  exportCSV(): Promise<string | null>;
  showDashboard(): Promise<void>;
  setNotchExpanded(expanded: boolean): Promise<void>;
  openPricing(provider: Provider): Promise<void>;
  onSnapshot(callback: (snapshot: Snapshot) => void): () => void;
}
