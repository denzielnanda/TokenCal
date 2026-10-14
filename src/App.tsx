import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  Clock3,
  Coins,
  Cpu,
  FolderOpen,
  LayoutDashboard,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import type {
  Breakdown,
  LimitWindow,
  Period,
  Provider,
  Session,
  Settings,
  Snapshot,
} from './shared/types';
import {
  compactNumber,
  duration,
  fullNumber,
  modelLabel,
  money,
  providerLabel,
  relativeTime,
  resetCountdown,
  tokensTotal,
} from './shared/format';
import { demoSnapshot } from './demo';
import SettingsView from './SettingsView';

type View = 'overview' | 'sessions' | 'insights' | 'settings';
const surface = new URLSearchParams(location.search).get('surface') ?? 'dashboard';
const isCompact = surface !== 'dashboard';
function ProviderIcon({ provider, small = false }: { provider: Provider; small?: boolean }) {
  return (
    <span className={`provider-icon ${provider} ${small ? 'small' : ''}`}>
      {provider === 'claude' ? (
        <Sparkles size={small ? 15 : 21} />
      ) : (
        <Terminal size={small ? 15 : 21} />
      )}
    </span>
  );
}
function LimitMeter({ window: w }: { window: LimitWindow }) {
  const now = Date.now(),
    stale = w.stale || now - w.observedAt > 20 * 60000,
    expired = w.expired || (w.resetsAt !== null && w.resetsAt <= now);
  return (
    <div className={`limit-meter ${stale ? 'stale' : ''}`}>
      <div className="limit-label">
        <span>{w.label}</span>
        <strong>
          {expired ? '—' : `${Math.round(w.usedPercent)}%`}{' '}
          <small>{expired ? 'expired' : 'used'}</small>
        </strong>
      </div>
      <div className="meter-track">
        <div
          className={w.usedPercent >= 95 ? 'danger' : w.usedPercent >= 80 ? 'warning' : ''}
          style={{ width: `${expired ? 0 : w.usedPercent}%` }}
        />
      </div>
      <div className="limit-reset">
        <Clock3 size={12} />
        <span title={w.resetsAt ? new Date(w.resetsAt).toLocaleString() : undefined}>
          {w.resetEstimated && !expired ? '~ ' : ''}
          {resetCountdown(w.resetsAt, now)}
        </span>
        {stale && <span className="stale-tag">{expired ? 'refresh needed' : 'stale'}</span>}
      </div>
    </div>
  );
}
function LimitCards({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="provider-grid">
      {snapshot.limits.map((p) => (
        <section className={`card provider-card ${p.provider}`} key={p.provider}>
          <div className="provider-header">
            <ProviderIcon provider={p.provider} />
            <div>
              <h3>{providerLabel(p.provider)}</h3>
              <p>{p.plan ? `${p.plan[0].toUpperCase() + p.plan.slice(1)} plan` : 'Local usage'}</p>
            </div>
            <span className="source-tag">
              {p.provider === 'claude' ? 'Desktop history' : 'Session logs'}
            </span>
          </div>
          {p.windows.length ? (
            p.windows.map((w) => <LimitMeter key={w.id} window={w} />)
          ) : (
            <div className="limit-empty">
              <Activity size={22} />
              <p>{p.note ?? 'Usage limits are not available yet.'}</p>
            </div>
          )}
          <p className="provider-note">
            {p.note ??
              `Last observed ${relativeTime(Math.max(0, ...p.windows.map((w) => w.observedAt)))}`}
          </p>
        </section>
      ))}
    </div>
  );
}
function CostChart({ snapshot, period }: { snapshot: Snapshot; period: Period }) {
  const days = snapshot.daily.slice(period === 'today' ? -7 : period === 'week' ? -7 : -30),
    max = Math.max(1, ...days.map((d) => d.claude + d.codex));
  return (
    <section className="card chart-card">
      <div className="section-row">
        <div>
          <h3>Usage over time</h3>
          <p>API-equivalent cost · {period === 'month' ? 'last 30 days' : 'last 7 days'}</p>
        </div>
        <div className="chart-legend">
          <span>
            <i className="claude-dot" />
            Claude
          </span>
          <span>
            <i className="codex-dot" />
            Codex
          </span>
        </div>
      </div>
      <div className="chart-area">
        <div className="chart-axis">
          <span>{money(max)}</span>
          <span>{money(max / 2)}</span>
          <span>$0</span>
        </div>
        <div className="bars" role="img" aria-label="Daily estimated cost by provider">
          {days.map((d, i) => (
            <div className="bar-column" key={d.date}>
              <div
                className="bar-stack"
                tabIndex={0}
                title={`${d.date} · Claude ${money(d.claude)} · Codex ${money(d.codex)}`}
                aria-label={`${d.date}: ${money(d.claude + d.codex)}`}
              >
                <div className="bar codex-bar" style={{ height: `${(d.codex / max) * 100}%` }} />
                <div className="bar claude-bar" style={{ height: `${(d.claude / max) * 100}%` }} />
              </div>
              <span>
                {days.length < 10 || i % 5 === 0
                  ? new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, {
                      weekday: days.length < 10 ? 'short' : undefined,
                      day: days.length >= 10 ? 'numeric' : undefined,
                    })
                  : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
function SessionTable({
  sessions,
  onSelect,
}: {
  sessions: Session[];
  onSelect: (s: Session) => void;
}) {
  return sessions.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Project / model</th>
            <th>Status</th>
            <th>Active time</th>
            <th>Tokens</th>
            <th>Est. cost</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={`${s.provider}:${s.id}`} onClick={() => onSelect(s)}>
              <td>
                <button className="session-name" onClick={() => onSelect(s)}>
                  <ProviderIcon provider={s.provider} small />
                  <span>
                    <strong>{s.project}</strong>
                    <small>{modelLabel(s.model)}</small>
                  </span>
                </button>
              </td>
              <td>
                <span className={`status ${s.status}`}>
                  <i />
                  {s.status === 'working'
                    ? 'Active'
                    : s.status === 'completed'
                      ? 'Complete'
                      : 'Idle'}
                </span>
              </td>
              <td>{duration(s.activeMs)}</td>
              <td>{compactNumber(tokensTotal(s.tokens))}</td>
              <td className="cost-cell">
                {s.unpricedTokens ? '≥ ' : ''}
                {money(s.cost)}
                <ChevronRight size={14} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="empty-state">
      <Terminal size={30} />
      <h3>No sessions here yet</h3>
      <p>
        Run a Claude Code or Codex session. TokenCal will pick up its local usage automatically.
      </p>
    </div>
  );
}
function BreakdownCard({
  title,
  rows,
  projects = false,
}: {
  title: string;
  rows: Breakdown[];
  projects?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.cost));
  return (
    <section className="card breakdown-card">
      <h3>{title}</h3>
      <p>Last 30 days · estimated USD</p>
      <div className="breakdown-list">
        {rows.length ? (
          rows.slice(0, 8).map((r) => (
            <div key={r.label + ':' + r.provider} className="breakdown-item">
              <div className="section-row">
                <span>
                  {projects ? <FolderOpen size={15} /> : <Cpu size={15} />}{' '}
                  {projects ? r.label : modelLabel(r.label)}
                </span>
                <strong>
                  {r.unpricedTokens ? '≥ ' : ''}
                  {money(r.cost)}
                </strong>
              </div>
              <div className="breakdown-track">
                <div
                  className={r.provider ?? 'claude'}
                  style={{ width: `${(r.cost / max) * 100}%` }}
                />
              </div>
              <small>
                {compactNumber(r.tokens)} tokens · {r.sessions} sessions
              </small>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <p>Your usage breakdown will appear after your first session.</p>
          </div>
        )}
      </div>
    </section>
  );
}
function SessionDetails({ session: s, onClose }: { session: Session; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="icon-button close-modal"
          aria-label="Close session details"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <ProviderIcon provider={s.provider} />
        <h2 id="session-title">{s.project}</h2>
        <p>
          {providerLabel(s.provider)} · {s.models.map(modelLabel).join(', ')}
        </p>
        <div className="detail-cost">
          {s.unpricedTokens ? '≥ ' : ''}
          {money(s.cost)}
          <span>estimated API value</span>
        </div>
        <dl>
          {[
            ['Input', s.tokens.input],
            ['Cache reads', s.tokens.cached],
            ['Cache writes', s.tokens.cacheWrite],
            ['Output', s.tokens.output],
            ['Reasoning (included in output)', s.tokens.reasoning],
          ].map(([label, n]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{fullNumber(n as number)}</dd>
            </div>
          ))}
          <div>
            <dt>Active work</dt>
            <dd>{duration(s.activeMs)}</dd>
          </div>
          <div>
            <dt>Session span</dt>
            <dd>{duration(s.elapsedMs)}</dd>
          </div>
          <div>
            <dt>Responses</dt>
            <dd>{s.responses}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{new Date(s.startedAt).toLocaleString()}</dd>
          </div>
        </dl>
        {s.unpricedTokens > 0 && (
          <p className="inline-warning">
            {compactNumber(s.unpricedTokens)} tokens have no known price. Add a model price in
            Settings.
          </p>
        )}
        <p className="detail-footnote">
          Active work measures logged turns. Session span includes the gaps between them.
        </p>
      </section>
    </div>
  );
}
function CompactView({
  snapshot,
  showDashboard,
}: {
  snapshot: Snapshot;
  showDashboard: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isNotch = surface === 'notch';
  const changeExpanded = (value: boolean) => {
    setExpanded(value);
    void window.tokenCal?.setNotchExpanded(value);
  };
  const active = snapshot.sessions.filter((s) => s.status === 'working');
  return (
    <div
      className={`compact-shell ${isNotch ? 'notch-shell' : ''} ${expanded ? 'expanded' : ''}`}
      onMouseEnter={() => isNotch && changeExpanded(true)}
      onMouseLeave={() => isNotch && changeExpanded(false)}
    >
      {isNotch && (
        <button
          className="notch-strip"
          onClick={() => changeExpanded(!expanded)}
          aria-label="Expand TokenCal widget"
        >
          <span>
            <Leaf size={16} />
            TokenCal
          </span>
          <span>
            <i className="live-dot" />
            {active.length} active
          </span>
          <strong>{money(snapshot.totals.today.cost)}</strong>
        </button>
      )}
      {(!isNotch || expanded) && (
        <div className="compact-content">
          <div className="compact-header">
            <div className="wordmark">
              <Leaf size={22} />
              TokenCal
            </div>
            <button
              className="icon-button"
              aria-label="Open full dashboard"
              onClick={showDashboard}
            >
              <ArrowUpRight size={19} />
            </button>
          </div>
          <div className="compact-today">
            <span>TODAY’S API VALUE</span>
            <h1>
              {snapshot.totals.today.unpricedTokens ? '≥ ' : ''}
              {money(snapshot.totals.today.cost)}
            </h1>
            <p>
              {compactNumber(snapshot.totals.today.totalTokens)} tokens ·{' '}
              {duration(snapshot.totals.today.activeMs)} active work
            </p>
          </div>
          <LimitCards snapshot={snapshot} />
          <div className="section-row compact-section">
            <h3>Recent sessions</h3>
            <span className="live-label">{active.length} active</span>
          </div>
          {snapshot.sessions.slice(0, 3).map((s) => (
            <div className="compact-session" key={s.id + ':' + s.provider}>
              <ProviderIcon provider={s.provider} small />
              <div>
                <strong>{s.project}</strong>
                <small>
                  {modelLabel(s.model)} · {duration(s.activeMs)}
                </small>
              </div>
              <strong>
                {s.unpricedTokens ? '≥ ' : ''}
                {money(s.cost)}
              </strong>
            </div>
          ))}
          {!snapshot.sessions.length && (
            <p className="compact-empty">Start a coding session to see live usage here.</p>
          )}
          <button className="dashboard-button" onClick={showDashboard}>
            Open dashboard <ArrowUpRight size={16} />
          </button>
          <div className="compact-footer">
            <LockKeyhole size={12} />
            Local only
            <span>{snapshot.scanning ? 'Refreshing…' : relativeTime(snapshot.collectedAt)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [view, setView] = useState<View>('overview'),
    [period, setPeriod] = useState<Period>('today');
  const [provider, setProvider] = useState('all'),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState<Session | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [demo, setDemo] = useState(!window.tokenCal);
  const [, setTick] = useState(0);
  useEffect(() => {
    const tick = setInterval(() => setTick((n) => n + 1), 30000);
    if (!window.tokenCal) {
      setSnapshot(demoSnapshot());
      return () => clearInterval(tick);
    }
    let live = true;
    void window.tokenCal
      .getSnapshot()
      .then((s) => live && setSnapshot(s))
      .catch(() => setError('Could not connect to the local collector. Restart TokenCal.'));
    const unsubscribe = window.tokenCal.onSnapshot((s) => setSnapshot(s));
    return () => {
      live = false;
      clearInterval(tick);
      unsubscribe();
    };
  }, []);
  const data = demo ? demoSnapshot() : snapshot;
  async function perform(fn: () => Promise<unknown>, message = '') {
    try {
      await fn();
      if (message) {
        setNotice(message);
        setTimeout(() => setNotice(''), 4000);
      }
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The action could not be completed.');
    }
  }
  const updateSettings = async (patch: Partial<Settings>) => {
    if (!window.tokenCal || demo)
      throw new Error('Exit sample data to change your local settings.');
    await window.tokenCal.updateSettings(patch);
  };
  if (!data)
    return (
      <div className="loading-screen">
        <Leaf size={36} />
        <h2>TokenCal</h2>
        <p>{error || 'Reading your local usage…'}</p>
        <LoaderCircle className="spin" size={20} />
      </div>
    );
  if (isCompact)
    return (
      <CompactView snapshot={data} showDashboard={() => void window.tokenCal?.showDashboard()} />
    );
  const total = data.totals[period],
    active = data.sessions.filter((s) => s.status === 'working').length;
  const since =
    period === 'today'
      ? new Date().setHours(0, 0, 0, 0)
      : Date.now() - (period === 'week' ? 7 : 30) * 86400000;
  const filtered = data.sessions.filter(
    (s) =>
      s.lastActivity >= since &&
      (provider === 'all' || s.provider === provider) &&
      [s.project, s.model, providerLabel(s.provider)].some((x) =>
        x.toLowerCase().includes(query.toLowerCase()),
      ),
  );
  const title = {
    overview: 'Your usage, at a glance.',
    sessions: 'Every session. In one place.',
    insights: 'See where your tokens go.',
    settings: 'Make TokenCal yours.',
  }[view];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="wordmark">
          <span className="brand-icon">
            <Leaf size={23} />
          </span>
          TokenCal
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <nav>
          {(
            [
              ['overview', LayoutDashboard, 'Overview'],
              ['sessions', Terminal, 'Sessions'],
              ['insights', BarChart3, 'Insights'],
              ['settings', Settings2, 'Settings'],
            ] as const
          ).map(([id, Icon, label]) => (
            <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
              <Icon size={18} />
              {label}
              {id === 'sessions' && active > 0 && <span className="nav-count">{active}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <ShieldCheck size={20} />
            <strong>Stays on your device.</strong>
            <p>
              No account. No uploads.
              <br />
              Just your local session logs.
            </p>
          </div>
          <button className="sample-button" onClick={() => setDemo(!demo)}>
            <Sparkles size={14} />
            {demo ? 'Exit sample data' : 'Explore sample data'}
          </button>
          <span className="version">
            v{data.version} <i /> Open source
          </span>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={13} />
            <strong>{view[0].toUpperCase() + view.slice(1)}</strong>
          </span>
          <div>
            <span className="local-badge">
              <i className="live-dot" />
              Local only
            </span>
            <button
              className="icon-button"
              aria-label="Refresh usage"
              disabled={demo || data.scanning}
              onClick={() => perform(() => window.tokenCal!.refresh())}
            >
              <RefreshCw size={17} className={data.scanning ? 'spin' : ''} />
            </button>
          </div>
        </header>
        <div className="page-content">
          {demo && (
            <div className="demo-banner">
              <Sparkles size={16} />
              <span>Sample data · explore how TokenCal works</span>
              {window.tokenCal && (
                <button onClick={() => setDemo(false)}>
                  Back to my usage <ArrowUpRight size={14} />
                </button>
              )}
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                <X size={15} />
              </button>
            </div>
          )}
          {data.warnings.map((w) => (
            <div className="warning-banner" key={w}>
              {w}
            </div>
          ))}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === 'overview'
                  ? new Date().toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'YOUR CODING WORKSPACE'}
              </div>
              <h1>{title}</h1>
              <p>
                {view === 'overview'
                  ? 'A little clarity for your AI coding workflow.'
                  : view === 'sessions'
                    ? 'Token costs and time, without another sign-in.'
                    : view === 'insights'
                      ? 'Understand your spend by model and project.'
                      : 'Preferences, data sources, and transparent pricing.'}
              </p>
            </div>
            {view !== 'settings' && (
              <button
                className="secondary-button"
                disabled={demo}
                onClick={() =>
                  perform(async () => {
                    const saved = await window.tokenCal!.exportCSV();
                    if (saved) setNotice('Session metadata exported.');
                  })
                }
              >
                <ArrowDownToLine size={15} />
                Export CSV
              </button>
            )}
          </div>
          {view !== 'settings' && (
            <div className="period-row">
              <div className="segmented">
                {(
                  [
                    ['today', 'Today'],
                    ['week', '7 days'],
                    ['month', '30 days'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    className={period === id ? 'selected' : ''}
                    onClick={() => setPeriod(id)}
                    key={id}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="updated">
                <span className={`live-dot ${data.scanning ? 'busy' : ''}`} />
                {data.scanning
                  ? 'Reading local logs…'
                  : `Updated ${relativeTime(data.collectedAt)}`}
              </span>
            </div>
          )}
          {view === 'overview' && (
            <>
              <section className="overview-metrics">
                <div className="cost-hero">
                  <div className="metric-label">
                    <Coins size={15} />
                    {period === 'today' ? 'Today’s' : 'Your'} API value{' '}
                    <span className="estimate-tag">ESTIMATED</span>
                  </div>
                  <div className="hero-value">
                    {total.unpricedTokens > 0 && <span className="at-least">≥</span>}
                    {money(total.cost)}
                  </div>
                  <p>Calculated from tokens at published API rates.</p>
                  <div className="hero-foot">
                    <span className="saved-badge">
                      <Leaf size={13} /> {money(total.cacheSavings)} saved by caching
                    </span>
                  </div>
                </div>
                <div className="metric-small">
                  <span>
                    <Cpu size={17} />
                    Tokens processed
                  </span>
                  <strong>{compactNumber(total.totalTokens)}</strong>
                  <small>{compactNumber(total.tokens.cached)} from cache</small>
                </div>
                <div className="metric-small">
                  <span>
                    <Clock3 size={17} />
                    Active work
                  </span>
                  <strong>{duration(total.activeMs)}</strong>
                  <small>Across {total.sessions} sessions</small>
                </div>
                <div className="metric-small">
                  <span>
                    <Activity size={17} />
                    Sessions running
                  </span>
                  <strong>{active.toString().padStart(2, '0')}</strong>
                  <small>
                    <i className="live-dot" />
                    {active ? 'Working right now' : 'Ready when you are'}
                  </small>
                </div>
              </section>
              {total.unpricedTokens > 0 && (
                <div className="warning-banner">
                  {compactNumber(total.unpricedTokens)} tokens have no verified model price. Cost is
                  a partial estimate.{' '}
                  <button onClick={() => setView('settings')}>
                    Set model prices <ChevronRight size={14} />
                  </button>
                </div>
              )}
              <div className="section-heading">
                <h2>Plan usage</h2>
                <span>
                  From your existing local data <LockKeyhole size={13} />
                </span>
              </div>
              <LimitCards snapshot={data} />
              <CostChart snapshot={data} period={period} />
              <section className="card sessions-card">
                <div className="section-row">
                  <div>
                    <h3>Recent sessions</h3>
                    <p>Your latest coding activity</p>
                  </div>
                  <button className="text-button" onClick={() => setView('sessions')}>
                    View all <ArrowUpRight size={15} />
                  </button>
                </div>
                <SessionTable sessions={filtered.slice(0, 5)} onSelect={setSelected} />
              </section>
              <div className="accuracy-note">
                <LockKeyhole size={13} />
                <span>
                  Costs are API-equivalent estimates. Your subscription bill and plan usage are
                  separate.
                </span>
              </div>
            </>
          )}
          {view === 'sessions' && (
            <section className="card sessions-card">
              <div className="session-filters">
                <label className="search-box">
                  <Search size={16} />
                  <input
                    aria-label="Search sessions"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search projects or models…"
                  />
                </label>
                <select
                  aria-label="Filter provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <option value="all">All providers</option>
                  <option value="claude">Claude Code</option>
                  <option value="codex">Codex</option>
                </select>
                <span>{filtered.length} sessions</span>
              </div>
              <SessionTable sessions={filtered} onSelect={setSelected} />
            </section>
          )}
          {view === 'insights' && (
            <>
              <CostChart snapshot={data} period={period} />
              <div className="breakdown-grid">
                <BreakdownCard title="By model" rows={data.models} />
                <BreakdownCard title="By project" rows={data.projects} projects />
              </div>
              <div className="card token-breakdown">
                <h3>
                  Token breakdown ·{' '}
                  {period === 'today'
                    ? 'today'
                    : period === 'week'
                      ? 'last 7 days'
                      : 'last 30 days'}
                </h3>
                <div>
                  {[
                    ['Input', total.tokens.input],
                    ['Cache reads', total.tokens.cached],
                    ['Cache writes', total.tokens.cacheWrite],
                    ['Output', total.tokens.output],
                  ].map(([label, n]) => (
                    <section key={label}>
                      <span>{label}</span>
                      <strong>{compactNumber(n as number)}</strong>
                    </section>
                  ))}
                </div>
              </div>
            </>
          )}
          {view === 'settings' && (
            <SettingsView
              snapshot={data}
              demo={demo}
              onUpdate={updateSettings}
              onError={setError}
              onNotice={setNotice}
            />
          )}
        </div>
        <footer className="page-footer">
          <span>
            <Leaf size={13} /> Thoughtfully local. Always open.
          </span>
          <span>Prices verified {data.pricingUpdatedAt}</span>
        </footer>
      </main>
      {selected && <SessionDetails session={selected} onClose={() => setSelected(null)} />}{' '}
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
          <button aria-label="Dismiss notice" onClick={() => setNotice('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
