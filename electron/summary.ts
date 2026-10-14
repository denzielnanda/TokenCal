import { addTokens, estimateCost, PRICES, PRICING_UPDATED, tokenCount, zeroTokens } from '../src/shared/pricing';
import type { Breakdown, DayTotal, Period, ProviderLimits, Session, Settings, Snapshot, SourceStatus, Totals, UsageEvent } from '../src/shared/types';
import type { FileState, Activity } from './parser';
import { ageWindow } from './limits';

export const dayKey = (date: number) => { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const midnight = (n: number) => { const d = new Date(n); d.setHours(0,0,0,0); return d.getTime(); };
const emptyTotals = (): Totals => ({ cost: 0, tokens: zeroTokens(), totalTokens: 0, cacheSavings: 0, activeMs: 0, sessions: 0, unpricedTokens: 0 });
// Merge overlapping turns so a duplicated transcript or parallel file cannot inflate time.
export function activeDuration(activities: Activity[], now: number, since = 0): number {
  const intervals = activities.map(a => [Math.max(a.startedAt, since), Math.min(a.endedAt ?? now, now)]).filter(([start,end]) => end > start).sort((a,b) => a[0]-b[0]);
  let total=0, start=0, end=0;
  for (const [a,b] of intervals) { if (a > end) { total += Math.max(0,end-start); start=a; end=b; } else end=Math.max(end,b); }
  return total + Math.max(0,end-start);
}
export function buildSnapshot(states: FileState[], settings: Settings, sources: SourceStatus[], claudeLimits: ProviderLimits, now = Date.now(), warnings: string[] = []): Snapshot {
  const starts: Record<Period,number> = { today: midnight(now), week: now - 7*86_400_000, month: now - 30*86_400_000 };
  const cutoff = now - settings.retentionDays * 86_400_000;
  const totals = { today: emptyTotals(), week: emptyTotals(), month: emptyTotals() };
  const unique = new Map<string,UsageEvent>();
  const activity = new Map<string,Activity>();
  const meta = new Map<string,FileState>();
  for (const state of states) {
    if (!settings[`${state.provider}Enabled`]) continue;
    const sessionKey = state.provider + ':' + state.sessionId;
    const previous = meta.get(sessionKey);
    if (!previous || state.lastAt > previous.lastAt) meta.set(sessionKey,state);
    for (const e of Object.values(state.events)) {
      if (e.timestamp < cutoff || e.timestamp > now + 300_000) continue;
      const old = unique.get(e.id);
      if (!old || tokenCount(e.tokens) >= tokenCount(old.tokens)) unique.set(e.id,e);
    }
    Object.values(state.activities).forEach(a => {
      if (a.startedAt < cutoff) return;
      const old = activity.get(a.id);
      if (!old || old.endedAt === null || (a.endedAt ?? 0) > (old.endedAt ?? 0)) activity.set(a.id,a);
    });
  }
  const sessions = new Map<string, Session>();
  const models = new Map<string,Breakdown>(), projects = new Map<string,Breakdown>();
  const unknownModels = new Set<string>();
  const daily = new Map<string,DayTotal>();
  for (let i=29;i>=0;i--) { const d=new Date(now); d.setDate(d.getDate()-i); const date=dayKey(d.getTime()); daily.set(date,{date,claude:0,codex:0,tokens:0}); }
  const periodSessionIDs: Record<Period,Set<string>> = { today:new Set(),week:new Set(),month:new Set() };
  for (const e of unique.values()) {
    const priced = estimateCost(e, settings.priceOverrides);
    const cost = priced.cost ?? 0, count = tokenCount(e.tokens), unpriced = priced.cost === null ? count : 0;
    if (unpriced) unknownModels.add(e.model);
    const key = e.provider + ':' + e.sessionId;
    let s = sessions.get(key);
    if (!s) { s={id:e.sessionId,provider:e.provider,project:e.project,model:e.model,models:[],startedAt:e.timestamp,lastActivity:e.timestamp,activeMs:0,elapsedMs:0,status:'idle',tokens:zeroTokens(),cost:0,unpricedTokens:0,responses:0}; sessions.set(key,s); }
    s.startedAt=Math.min(s.startedAt,e.timestamp); s.lastActivity=Math.max(s.lastActivity,e.timestamp);
    s.model=e.timestamp>=s.lastActivity?e.model:s.model;
    if (!s.models.includes(e.model)) s.models.push(e.model);
    s.tokens=addTokens(s.tokens,e.tokens); s.cost+=cost; s.unpricedTokens+=unpriced; s.responses++;
    for (const p of Object.keys(starts) as Period[]) if (e.timestamp>=starts[p]) {
      totals[p].cost+=cost; totals[p].tokens=addTokens(totals[p].tokens,e.tokens); totals[p].cacheSavings+=priced.savings;
      totals[p].unpricedTokens+=unpriced; periodSessionIDs[p].add(key);
    }
    const day=daily.get(dayKey(e.timestamp)); if(day) { day[e.provider]+=cost; day.tokens+=count; }
    if (e.timestamp>=starts.month) for(const [map,label] of [[models,e.model],[projects,e.project]] as const) {
      const id=label+':'+e.provider;
      const b=map.get(id)??{label,provider:e.provider,cost:0,tokens:0,sessions:0,unpricedTokens:0};
      b.cost+=cost; b.tokens+=count; b.unpricedTokens+=unpriced; map.set(id,b);
    }
  }
  for (const [key,state] of meta) {
    if (state.lastAt < cutoff) continue;
    if (!sessions.has(key)) sessions.set(key,{id:state.sessionId,provider:state.provider,project:state.project,model:state.model,models:[state.model],startedAt:state.firstAt,lastActivity:state.lastAt,activeMs:0,elapsedMs:0,status:'idle',tokens:zeroTokens(),cost:0,unpricedTokens:0,responses:0});
    const s=sessions.get(key)!;
    const own=[...activity.values()].filter(a => Object.hasOwn(state.activities,a.id));
    // Open turns that stopped writing are bounded by last activity after a grace period.
    const bounded=own.map(a => a.endedAt===null && now-state.lastAt>180_000 ? {...a,endedAt:state.lastAt}:a);
    s.startedAt=Math.min(s.startedAt,state.firstAt||s.startedAt); s.lastActivity=Math.max(s.lastActivity,state.lastAt);
    s.activeMs=activeDuration(bounded,now); s.elapsedMs=Math.max(0,s.lastActivity-s.startedAt);
    s.status=state.turnStart!==null && now-state.lastAt<180_000?'working':state.turnStart===null?'completed':'idle';
    for(const p of Object.keys(starts) as Period[]) totals[p].activeMs+=activeDuration(bounded,now,starts[p]);
  }
  for(const p of Object.keys(starts) as Period[]) { totals[p].totalTokens=tokenCount(totals[p].tokens);totals[p].sessions=periodSessionIDs[p].size; }
  const codexWindows=new Map(); let codexPlan:string|null=null, planAt=0;
  for (const state of states.filter(s=>s.provider==='codex')) {
    for(const w of state.limits) if (!codexWindows.has(w.id)||codexWindows.get(w.id).observedAt<w.observedAt) codexWindows.set(w.id,ageWindow(w,now));
    if(state.plan&&state.lastAt>planAt) {codexPlan=state.plan;planAt=state.lastAt;}
  }
  const sortedSessions=[...sessions.values()].sort((a,b)=>b.lastActivity-a.lastActivity);
  for (const s of sortedSessions.filter(s=>s.lastActivity>=starts.month)) {
    for(const model of s.models) { const b=models.get(model+':'+s.provider);if(b)b.sessions++; }
    const b=projects.get(s.project+':'+s.provider);if(b)b.sessions++;
  }
  return {version:'0.1.0',collectedAt:now,scanning:false,demo:false,totals,daily:[...daily.values()],sessions:sortedSessions.slice(0,2000),models:[...models.values()].sort((a,b)=>b.cost-a.cost),projects:[...projects.values()].sort((a,b)=>b.cost-a.cost),limits:[settings.claudeEnabled?claudeLimits:{provider:'claude',plan:null,windows:[],note:'Claude tracking is disabled.'},{provider:'codex',plan:codexPlan,windows:settings.codexEnabled?[...codexWindows.values()]:[],note:settings.codexEnabled?(codexWindows.size?null:'Start a Codex session to record usage limits.'):'Codex tracking is disabled.'}],sources,settings,pricingUpdatedAt:PRICING_UPDATED,prices:{...PRICES,...settings.priceOverrides},unknownModels:[...unknownModels].sort(),warnings};
}
