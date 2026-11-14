'use client';

import { Bot, CheckCircle2, FileCheck2, Gauge, Network, ShieldAlert, ShieldX, Wrench, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { TopBar } from '@/components/top-bar';
import { Badge, Button, Card, EmptyState, Spinner, Textarea, cn } from '@/components/ui';
import { api, rupees, timeAgo } from '@/lib/client/api';
import { NetworkGraph, type GraphEdge, type GraphNode } from './network-graph';

type Tab = 'flagged' | 'network' | 'audit' | 'eval' | 'copilot';
const TABS: { key: Tab; label: string; Icon: typeof Gauge }[] = [
  { key: 'flagged', label: 'Flagged payments', Icon: ShieldAlert },
  { key: 'network', label: 'Mule network', Icon: Network },
  { key: 'audit', label: 'Audit log', Icon: FileCheck2 },
  { key: 'eval', label: 'Evaluation', Icon: Gauge },
  { key: 'copilot', label: 'AI copilot', Icon: Bot },
];

export function AnalystDashboard() {
  const [tab, setTab] = useState<Tab>('flagged');
  const [networkFor, setNetworkFor] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (fromUrl && TABS.some((t) => t.key === fromUrl)) setTab(fromUrl);
  }, []);

  function go(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url);
  }

  return (
    <div className="min-h-dvh">
      <TopBar active="analyst" />
      <main className="mx-auto max-w-7xl px-4 py-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Fraud analyst dashboard</h1>
            <p className="text-sm text-muted-foreground">Synthetic data. Every number here is read from the database.</p>
          </div>
        </div>
        <Stats />
        <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-border" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => go(t.key)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium',
                tab === t.key ? 'border-accent text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
              data-testid={`tab-${t.key}`}
            >
              <t.Icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </nav>
        <div className="pt-4">
          {tab === 'flagged' && (
            <Flagged
              onNetwork={(id) => {
                setNetworkFor(id);
                go('network');
              }}
            />
          )}
          {tab === 'network' && <MuleNetwork initial={networkFor} />}
          {tab === 'audit' && <Audit />}
          {tab === 'eval' && <Evaluation />}
          {tab === 'copilot' && <Copilot />}
        </div>
      </main>
    </div>
  );
}

type StatsData = { transactions: number; warned: number; held: number; stoppedPaise: number; onHoldNow: number; auditRows: number };

function Stats() {
  const [s, setS] = useState<StatsData | null>(null);
  useEffect(() => {
    void api<StatsData>('/api/analyst/stats').then((r) => r.ok && setS(r.data));
  }, []);
  const tiles = s
    ? [
        { label: 'Payments scored', value: s.transactions.toLocaleString('en-IN') },
        { label: 'Warned', value: s.warned.toLocaleString('en-IN') },
        { label: 'Held', value: s.held.toLocaleString('en-IN') },
        { label: 'On hold right now', value: s.onHoldNow.toLocaleString('en-IN') },
        { label: 'Audit rows', value: s.auditRows.toLocaleString('en-IN') },
      ]
    : null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles
        ? tiles.map((t) => (
            <Card key={t.label} className="p-3">
              <p className="text-xs text-muted-foreground">{t.label}</p>
              <p className="text-2xl font-bold tabular">{t.value}</p>
            </Card>
          ))
        : Array.from({ length: 5 }, (_, i) => <Card key={i} className="h-[68px] animate-pulse bg-muted" />)}
    </div>
  );
}

type FlaggedRow = {
  id: string;
  type: string;
  status: string;
  amountPaise: number;
  note: string;
  createdAt: string;
  riskScore: number;
  riskDecision: 'warn' | 'hold';
  payer: { accountId: string; name: string; vpa: string };
  payee: { accountId: string; name: string; vpa: string; ageDays: number };
  rules: string[];
  label: { isFraud: boolean; scenario: string } | null;
};

type Detail = FlaggedRow & {
  holdUntil: string | null;
  failureReason: string | null;
  assessment: {
    rulesScore: number;
    aiPoints: number;
    aiStatus: string;
    aiSignals: Record<string, unknown> | null;
    firedRules: { id: string; points: number; facts: Record<string, unknown> }[];
    explanation: { headline: string; reasons: string[]; source: string; lang: string };
  } | null;
};

function Flagged({ onNetwork }: { onNetwork: (accountId: string) => void }) {
  const [decision, setDecision] = useState<'' | 'warn' | 'hold'>('');
  const [rows, setRows] = useState<FlaggedRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const r = await api<{ items: FlaggedRow[] }>(`/api/analyst/flagged?limit=100${decision ? `&decision=${decision}` : ''}`);
    setRows(r.ok ? r.data.items : []);
  }, [decision]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border p-3">
          {(['', 'hold', 'warn'] as const).map((d) => (
            <Button key={d || 'all'} size="sm" variant={decision === d ? 'primary' : 'outline'} onClick={() => setDecision(d)}>
              {d === '' ? 'All flagged' : d === 'hold' ? 'Held' : 'Warned'}
            </Button>
          ))}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
        {!rows ? (
          <div className="flex justify-center p-10">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Nothing flagged" hint="Seed the database or make a risky payment in the user app." />
          </div>
        ) : (
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-sm" data-testid="flagged-table">
              <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Payee</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="hidden px-3 py-2 md:table-cell">Rules</th>
                  <th className="hidden px-3 py-2 xl:table-cell">Label</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r.id)}
                    className={cn('cursor-pointer border-t border-border hover:bg-muted/60', selected === r.id && 'bg-accent-soft')}
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{timeAgo(r.createdAt)}</td>
                    <td className="max-w-[180px] px-3 py-2">
                      <p className="truncate font-medium">{r.payee.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.type} · from {r.payer.name}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right tabular">{rupees(r.amountPaise)}</td>
                    <td className="px-3 py-2">
                      <Badge tone={r.riskDecision === 'hold' ? 'danger' : 'warn'}>{r.riskScore}</Badge>
                    </td>
                    <td className="hidden px-3 py-2 font-mono text-[11px] text-muted-foreground md:table-cell">
                      {r.rules.map((x) => x.split('_')[0]).join(' ')}
                    </td>
                    <td className="hidden px-3 py-2 text-xs xl:table-cell">
                      {r.label ? (
                        <span className={r.label.isFraud ? 'text-danger' : 'text-muted-foreground'}>{r.label.scenario}</span>
                      ) : (
                        <span className="text-muted-foreground">live</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <TxnDetail id={selected} onNetwork={onNetwork} />
    </div>
  );
}

function TxnDetail({ id, onNetwork }: { id: string | null; onNetwork: (accountId: string) => void }) {
  const [d, setD] = useState<Detail | null>(null);
  useEffect(() => {
    if (!id) return;
    setD(null);
    void api<Detail>(`/api/analyst/txn/${id}`).then((r) => r.ok && setD(r.data));
  }, [id]);

  if (!id) return <EmptyState title="Select a payment" hint="See exactly which rules fired and why." />;
  if (!d) return <Card className="flex justify-center p-10"><Spinner /></Card>;
  const a = d.assessment;
  return (
    <Card className="space-y-3 p-4 text-sm" data-testid="txn-detail">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold tabular">{rupees(d.amountPaise)}</p>
          <p className="text-xs text-muted-foreground">
            {d.payer.vpa} → {d.payee.vpa}
          </p>
        </div>
        <Badge tone={d.riskDecision === 'hold' ? 'danger' : 'warn'}>
          {d.riskDecision} · {d.riskScore}
        </Badge>
      </div>
      {d.note && <p className="italic text-muted-foreground">“{d.note}”</p>}
      <p className="text-xs text-muted-foreground">
        Status <strong>{d.status}</strong> · payee account {d.payee.ageDays} days old · {new Date(d.createdAt).toLocaleString('en-IN')}
      </p>
      {a && (
        <>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rule trace</p>
            <table className="w-full text-xs">
              <tbody>
                {a.firedRules.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="py-1.5 pr-2 font-mono font-semibold">{r.id}</td>
                    <td className="py-1.5 pr-2 text-right font-semibold">+{r.points}</td>
                    <td className="py-1.5 font-mono text-muted-foreground">
                      {Object.entries(r.facts)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(', ') || '—'}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td className="py-1.5 font-semibold">Rules score</td>
                  <td className="py-1.5 text-right font-semibold">{a.rulesScore}</td>
                  <td />
                </tr>
                <tr>
                  <td className="py-1.5 font-semibold">AI points (R8)</td>
                  <td className="py-1.5 text-right font-semibold">+{a.aiPoints}</td>
                  <td className="py-1.5 text-muted-foreground">AI status: {a.aiStatus}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Shown to the user ({a.explanation.lang}, {a.explanation.source === 'ai' ? 'Gemini, grounded' : 'template'})
            </p>
            <p className="mt-1 font-medium">{a.explanation.headline}</p>
            <ul className="mt-1 list-disc pl-5">
              {a.explanation.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </>
      )}
      {d.label && (
        <p className="text-xs">
          Ground-truth label (synthetic data, never seen by the engine):{' '}
          <strong className={d.label.isFraud ? 'text-danger' : ''}>{d.label.isFraud ? 'fraud' : 'legitimate'}</strong> ·{' '}
          {d.label.scenario}
        </p>
      )}
      <Button variant="outline" size="sm" onClick={() => onNetwork(d.payee.accountId)} data-testid="open-network">
        <Network className="h-4 w-4" /> Show payee network
      </Button>
    </Card>
  );
}

type Suspect = { accountId: string; vpa: string; name: string; ageDays: number; held: number; flagged: number; senders: number; amountPaise: number };
type NetworkData = {
  profile: {
    accountId: string;
    vpa: string;
    name: string;
    ageDays: number;
    last24h: { distinctSenders: number; receivedPaise: number; sentPaise: number };
    received: { count: number; totalPaise: number };
    sent: { count: number; totalPaise: number };
    flaggedIncoming: number;
    heldIncoming: number;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
};

function MuleNetwork({ initial }: { initial: string | null }) {
  const [suspects, setSuspects] = useState<Suspect[] | null>(null);
  const [accountId, setAccountId] = useState<string | null>(initial);
  const [data, setData] = useState<NetworkData | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'graph' | 'table'>('graph');

  useEffect(() => {
    void api<{ items: Suspect[] }>('/api/analyst/suspects').then((r) => {
      if (!r.ok) return setSuspects([]);
      setSuspects(r.data.items);
      setAccountId((cur) => cur ?? r.data.items[0]?.accountId ?? null);
    });
  }, []);

  useEffect(() => {
    if (!accountId) return;
    setLoading(true);
    void api<NetworkData>(`/api/analyst/network?accountId=${accountId}&hops=3`).then((r) => {
      setLoading(false);
      if (r.ok) setData(r.data);
    });
  }, [accountId]);

  const p = data?.profile;
  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Card className="overflow-hidden">
        <p className="border-b border-border p-3 text-sm font-semibold">Payees receiving flagged money (14 days)</p>
        {!suspects ? (
          <div className="flex justify-center p-6"><Spinner /></div>
        ) : suspects.length === 0 ? (
          <div className="p-3"><EmptyState title="No suspicious payees" /></div>
        ) : (
          <ul className="max-h-[520px] overflow-auto">
            {suspects.map((s) => (
              <li key={s.accountId}>
                <button
                  onClick={() => setAccountId(s.accountId)}
                  className={cn('w-full border-t border-border px-3 py-2 text-left hover:bg-muted', accountId === s.accountId && 'bg-accent-soft')}
                  data-testid="suspect"
                >
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.ageDays}d old · {s.senders} senders · {s.held} held · {rupees(s.amountPaise)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="space-y-3">
        {p && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Account', `${p.name}`, p.vpa],
              ['Account age', `${p.ageDays} days`, ''],
              ['Last 24 h', `${p.last24h.distinctSenders} senders`, `in ${rupees(p.last24h.receivedPaise)} · out ${rupees(p.last24h.sentPaise)}`],
              ['Flagged incoming', `${p.flaggedIncoming}`, `${p.heldIncoming} held`],
            ].map(([k, v, sub]) => (
              <Card key={k} className="p-3">
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="truncate font-bold">{v}</p>
                {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
              </Card>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button size="sm" variant={view === 'graph' ? 'primary' : 'outline'} onClick={() => setView('graph')}>Graph</Button>
          <Button size="sm" variant={view === 'table' ? 'primary' : 'outline'} onClick={() => setView('table')}>Table</Button>
          {data && (
            <span className="text-xs text-muted-foreground">
              {data.nodes.length} accounts · {data.edges.length} money flows · last 7 days{data.truncated ? ' · truncated' : ''}
            </span>
          )}
          {loading && <Spinner className="h-4 w-4" />}
        </div>
        {!accountId ? (
          <EmptyState title="Pick a payee to see its network" />
        ) : data && view === 'graph' ? (
          <NetworkGraph nodes={data.nodes} edges={data.edges} onSelect={(n) => setAccountId(n.id)} />
        ) : data ? (
          <Card className="max-h-[460px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2">From</th><th className="px-3 py-2">To</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Payments</th></tr>
              </thead>
              <tbody>
                {[...data.edges].sort((a, b) => b.amountPaise - a.amountPaise).map((e) => {
                  const from = data.nodes.find((n) => n.id === e.source);
                  const to = data.nodes.find((n) => n.id === e.target);
                  return (
                    <tr key={`${e.source}-${e.target}`} className="border-t border-border">
                      <td className="px-3 py-1.5">{from?.name} <span className="text-xs text-muted-foreground">({from?.ageDays}d)</span></td>
                      <td className="px-3 py-1.5">{to?.name} <span className="text-xs text-muted-foreground">({to?.ageDays}d)</span></td>
                      <td className="px-3 py-1.5 text-right tabular">{rupees(e.amountPaise)}</td>
                      <td className="px-3 py-1.5 text-right">{e.count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        ) : (
          <Card className="flex h-[460px] items-center justify-center"><Spinner /></Card>
        )}
      </div>
    </div>
  );
}

type AuditRow = { seq: number; at: string; actor: string; action: string; entityType: string; entityId: string; payload: string; prevHash: string; hash: string };
type Verify =
  | { ok: true; count: number; headHash: string; durationMs: number; verifiedAt: string }
  | { ok: false; count: number; brokenAtSeq: number; reason: string; detail: string; durationMs: number; verifiedAt: string };

function Audit() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [result, setResult] = useState<Verify | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<{ items: AuditRow[] }>('/api/audit?limit=40').then((r) => setRows(r.ok ? r.data.items : []));
  }, []);

  async function verify() {
    setBusy(true);
    const r = await api<Verify>('/api/audit/verify', { method: 'POST' });
    setBusy(false);
    if (r.ok) setResult(r.data);
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <div className="flex-1">
          <p className="font-semibold">Hash-chained, append-only audit log</p>
          <p className="text-sm text-muted-foreground">
            Every state change is written with the SHA-256 hash of the row before it. Verifying recomputes the whole chain;
            editing or deleting any row breaks it at that row. The database also rejects UPDATE and DELETE on this table.
          </p>
        </div>
        <Button onClick={verify} loading={busy} data-testid="verify-chain">
          Verify chain
        </Button>
      </Card>
      {result && (
        <Card
          className={cn('flex items-start gap-3 p-4', result.ok ? 'border-ok/30 bg-ok-soft' : 'border-danger-border bg-danger-soft')}
          data-testid="verify-result"
        >
          {result.ok ? <CheckCircle2 className="h-6 w-6 text-ok" /> : <XCircle className="h-6 w-6 text-danger" />}
          <div className="text-sm">
            {result.ok ? (
              <>
                <p className="font-semibold text-ok">Chain intact: {result.count.toLocaleString('en-IN')} rows verified in {result.durationMs} ms</p>
                <p className="break-all font-mono text-xs text-muted-foreground">head {result.headHash}</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-danger">Tampering detected at row {result.brokenAtSeq}</p>
                <p>{result.detail}</p>
              </>
            )}
          </div>
        </Card>
      )}
      <Card className="overflow-auto">
        {!rows ? (
          <div className="flex justify-center p-6"><Spinner /></div>
        ) : rows.length === 0 ? (
          <div className="p-4"><EmptyState title="No audit rows yet" /></div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">When</th><th className="px-3 py-2">Actor</th><th className="px-3 py-2">Action</th><th className="hidden px-3 py-2 md:table-cell">Payload</th><th className="px-3 py-2">Hash</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.seq} className="border-t border-border align-top">
                  <td className="px-3 py-1.5 font-mono">{r.seq}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">{timeAgo(r.at)}</td>
                  <td className="px-3 py-1.5 font-mono">{r.actor.slice(0, 18)}</td>
                  <td className="px-3 py-1.5 font-semibold">{r.action}</td>
                  <td className="hidden max-w-[360px] truncate px-3 py-1.5 font-mono text-muted-foreground md:table-cell">{r.payload}</td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.hash.slice(0, 12)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

type Metrics = {
  transactions: number; fraud: number; legit: number; truePositives: number; falsePositives: number; falseNegatives: number;
  precision: number | null; recall: number | null; falsePositiveRate: number | null; holdRecall: number | null; holdFalsePositiveRate: number | null;
  scenarios: { scenario: string; isFraud: boolean; total: number; flagged: number; held: number }[];
};
type EvalData = {
  rules: { generatedAt: string; metrics: Metrics } | null;
  ai: {
    generatedAt: string;
    models: { live: string };
    extractor: { messages: number; answered: number; failed: number; fields: Record<string, { correct: number; total: number; accuracy: number | null }>; medianLatencyMs: number | null };
    endToEnd: { notesAnalysed: number; notesFailed: number; rulesOnly: Metrics; withAi: Metrics };
    grounding: { attempted: number; answered: number; grounded: number; passRate: number | null };
  } | null;
};

const pct = (v: number | null | undefined) => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(1)}%`);

function Evaluation() {
  const [data, setData] = useState<EvalData | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    void api<EvalData>('/api/eval').then((r) => (r.ok ? setData(r.data) : setError(true)));
  }, []);
  if (error) return <EmptyState title="Could not load evaluation results" />;
  if (!data) return <div className="flex justify-center p-10"><Spinner /></div>;

  const rules = data.rules?.metrics;
  const ai = data.ai;
  return (
    <div className="space-y-5" data-testid="eval-page">
      <p className="text-sm text-muted-foreground">
        These numbers are written by <code>npm run eval:rules</code> and <code>npm run eval:ai</code> on the labelled synthetic dataset. They
        describe this dataset only. &quot;Flagged&quot; means warn or hold.
      </p>
      {!rules ? (
        <EmptyState title="Rules evaluation not run yet" hint="Run npm run eval:rules" />
      ) : (
        <section>
          <h2 className="mb-2 font-bold">Rules only (R1–R7) · {rules.transactions.toLocaleString('en-IN')} payments, {rules.fraud} fraud</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ['Recall', pct(rules.recall)],
              ['Precision', pct(rules.precision)],
              ['False-positive rate', pct(rules.falsePositiveRate)],
              ['Fraud held outright', pct(rules.holdRecall)],
              ['Legit held outright', pct(rules.holdFalsePositiveRate)],
            ].map(([k, v]) => (
              <Card key={k} className="p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="text-xl font-bold tabular">{v}</p></Card>
            ))}
          </div>
          <ScenarioTable metrics={rules} />
          <p className="mt-1 text-xs text-muted-foreground">Run at {new Date(data.rules!.generatedAt).toLocaleString('en-IN')}</p>
        </section>
      )}
      {!ai ? (
        <EmptyState title="AI evaluation not run yet" hint="Set GEMINI_API_KEY and run npm run eval:ai" />
      ) : (
        <section className="space-y-4">
          <h2 className="font-bold">What Gemini adds (R8, capped at +25) · model {ai.models.live}</h2>
          <Card className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2">Metric</th><th className="px-3 py-2 text-right">Rules only</th><th className="px-3 py-2 text-right">Rules + Gemini</th></tr>
              </thead>
              <tbody>
                {([
                  ['Recall', pct(ai.endToEnd.rulesOnly.recall), pct(ai.endToEnd.withAi.recall)],
                  ['Precision', pct(ai.endToEnd.rulesOnly.precision), pct(ai.endToEnd.withAi.precision)],
                  ['False-positive rate', pct(ai.endToEnd.rulesOnly.falsePositiveRate), pct(ai.endToEnd.withAi.falsePositiveRate)],
                  ['Fraud caught', ai.endToEnd.rulesOnly.truePositives, ai.endToEnd.withAi.truePositives],
                  ['Legitimate flagged', ai.endToEnd.rulesOnly.falsePositives, ai.endToEnd.withAi.falsePositives],
                ] as const).map(([k, a, b]) => (
                  <tr key={k} className="border-t border-border"><td className="px-3 py-2">{k}</td><td className="px-3 py-2 text-right tabular">{a}</td><td className="px-3 py-2 text-right font-semibold tabular">{b}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
          <ScenarioTable metrics={ai.endToEnd.withAi} />
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="p-4">
              <p className="font-semibold">Extractor accuracy (G1)</p>
              <p className="text-xs text-muted-foreground">{ai.extractor.messages} labelled synthetic messages · {ai.extractor.answered} answered · median {ai.extractor.medianLatencyMs ? Math.round(ai.extractor.medianLatencyMs) : 'n/a'} ms</p>
              <ul className="mt-2 space-y-1 text-sm">
                {Object.entries(ai.extractor.fields).map(([f, v]) => (
                  <li key={f} className="flex justify-between"><code>{f}</code><span className="tabular">{v.correct}/{v.total} · <strong>{pct(v.accuracy)}</strong></span></li>
                ))}
              </ul>
            </Card>
            <Card className="p-4">
              <p className="font-semibold">Grounding check (G2)</p>
              <p className="mt-2 text-3xl font-bold tabular">{pct(ai.grounding.passRate)}</p>
              <p className="text-xs text-muted-foreground">{ai.grounding.grounded} of {ai.grounding.answered} answered explanations used only numbers from the rule facts ({ai.grounding.attempted} requested in English, Hindi and Bengali). Failures fall back to templates.</p>
            </Card>
          </div>
          <p className="text-xs text-muted-foreground">Run at {new Date(ai.generatedAt).toLocaleString('en-IN')}</p>
        </section>
      )}
    </div>
  );
}

function ScenarioTable({ metrics }: { metrics: Metrics }) {
  return (
    <Card className="mt-3 overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left text-xs text-muted-foreground">
          <tr><th className="px-3 py-2">Scenario</th><th className="px-3 py-2">Label</th><th className="px-3 py-2 text-right">Payments</th><th className="px-3 py-2 text-right">Flagged</th><th className="px-3 py-2 text-right">Held</th><th className="px-3 py-2 text-right">Rate</th></tr>
        </thead>
        <tbody>
          {metrics.scenarios.map((s) => (
            <tr key={s.scenario} className="border-t border-border">
              <td className="px-3 py-1.5 font-mono text-xs">{s.scenario}</td>
              <td className="px-3 py-1.5"><Badge tone={s.isFraud ? 'danger' : 'neutral'}>{s.isFraud ? 'fraud' : 'legit'}</Badge></td>
              <td className="px-3 py-1.5 text-right tabular">{s.total}</td>
              <td className="px-3 py-1.5 text-right tabular">{s.flagged}</td>
              <td className="px-3 py-1.5 text-right tabular">{s.held}</td>
              <td className={cn('px-3 py-1.5 text-right font-semibold tabular', s.isFraud ? 'text-ok' : s.flagged ? 'text-warn' : '')}>
                {pct(s.flagged / s.total)} <span className="text-xs font-normal text-muted-foreground">{s.isFraud ? 'caught' : 'false +'}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

type CopilotAnswer = {
  status: string;
  answer: string;
  model: string;
  steps: number;
  trace: { step: number; tool: string; args: unknown; ok: boolean; summary: string }[];
};

const SUGGESTIONS = [
  'Which held payments in the last 24 hours went to the newest accounts? Is the top payee part of a ring?',
  'Investigate the account refund.helpdesk@kavach: who pays it and where does the money go?',
  'Why was the most recent held payment held? Walk through the rule trace.',
];

function Copilot() {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ q: string; a: CopilotAnswer }[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    const r = await api<CopilotAnswer>('/api/copilot', { body: { question: q } });
    setBusy(false);
    if (r.ok) {
      setHistory((h) => [{ q, a: r.data }, ...h]);
      setQuestion('');
    } else setError(r.error.message);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <Card className="space-y-2 p-3">
          <Textarea rows={3} placeholder="Ask about a payment, a payee or a suspected ring…" value={question} onChange={(e) => setQuestion(e.target.value)} data-testid="copilot-input" />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => ask(question)} loading={busy} disabled={!question.trim()} data-testid="copilot-ask">
              <Bot className="h-4 w-4" /> Investigate
            </Button>
            <span className="text-xs text-muted-foreground">Read-only tools · at most 6 steps · cannot change any data</span>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </Card>
        {history.length === 0 && !busy && <EmptyState title="Ask the copilot a question" hint="It investigates with read-only tools and shows every step it took." />}
        {busy && <Card className="flex items-center gap-2 p-4 text-sm"><Spinner className="h-4 w-4" /> Investigating…</Card>}
        {history.map(({ q, a }, i) => (
          <Card key={i} className="space-y-3 p-4" data-testid="copilot-answer">
            <p className="text-sm font-semibold">{q}</p>
            {a.status !== 'ok' && (
              <Badge tone={a.status === 'disabled' ? 'warn' : 'danger'}>{a.status === 'disabled' ? 'AI unavailable' : a.status}</Badge>
            )}
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{a.answer}</div>
            {a.trace.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Wrench className="h-3 w-3" /> Tool trace ({a.model}, {a.steps} model turns)</p>
                <ol className="space-y-1 text-xs" data-testid="copilot-trace">
                  {a.trace.map((tr, j) => (
                    <li key={j} className="rounded bg-muted px-2 py-1 font-mono">
                      <span className={tr.ok ? 'text-accent' : 'text-danger'}>{tr.ok ? '✓' : '✗'}</span> {tr.step}. {tr.tool}({JSON.stringify(tr.args)}) → {tr.summary}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </Card>
        ))}
      </div>
      <Card className="h-fit space-y-2 p-4 text-sm">
        <p className="font-semibold">Try asking</p>
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => ask(s)} disabled={busy} className="block w-full rounded-md border border-border p-2 text-left text-xs hover:bg-muted">
            {s}
          </button>
        ))}
        <p className="pt-2 text-xs text-muted-foreground">
          Tools: get_transaction, get_rule_trace, get_account_profile, get_payee_network, list_flagged. There is no tool that can approve,
          block, reverse or relabel anything.
        </p>
        <p className="flex items-center gap-1 pt-1 text-xs text-muted-foreground"><ShieldX className="h-3 w-3" /> Decisions stay with the rules engine and the analyst.</p>
      </Card>
    </div>
  );
}
