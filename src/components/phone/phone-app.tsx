'use client';

import { ArrowDownLeft, ArrowLeft, ArrowUpRight, BellRing, Inbox, MessageSquareWarning, Send, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LANGUAGES, LANGUAGE_NAMES, type Lang } from '@/config/app';
import { Badge, Button, Card, EmptyState, Input, Label, ShieldLogo, Spinner, cn } from '@/components/ui';
import { api, parseRupees, rupees, timeAgo } from '@/lib/client/api';
import { t } from '@/lib/client/i18n';
import { CheckMessage } from './check-message';
import { RiskSheet } from './risk-sheet';
import type { PaymentView, Wallet } from './types';

type Screen =
  | { name: 'home' }
  | { name: 'pay' }
  | { name: 'request' }
  | { name: 'check' }
  | { name: 'checking'; label: string }
  | { name: 'risk'; payment: PaymentView; collectRequestId?: string };

export function PhoneApp({ userId, lang, onLang }: { userId: string; lang: Lang; onLang: (l: Lang) => void }) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  const load = useCallback(async () => {
    const res = await api<Wallet>(`/api/wallet?userId=${userId}`);
    if (res.ok) {
      setWallet(res.data);
      setLoadError(null);
    } else setLoadError(res.error.message);
  }, [userId]);

  useEffect(() => {
    setWallet(null);
    setScreen({ name: 'home' });
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('screen') === 'check') {
      setScreen({ name: 'check' });
    }
  }, []);

  const home = () => {
    setScreen({ name: 'home' });
    void load();
  };

  async function approve(requestId: string) {
    setScreen({ name: 'checking', label: t('checking', lang) });
    const res = await api<PaymentView>(`/api/collect/${requestId}/approve`, { body: { userId, lang } });
    if (res.ok) setScreen({ name: 'risk', payment: res.data, collectRequestId: requestId });
    else {
      alert(res.error.message);
      home();
    }
  }

  async function decline(requestId: string) {
    const res = await api(`/api/collect/${requestId}/decline`, { body: { userId } });
    if (!res.ok) alert(res.error.message);
    void load();
  }

  const title =
    screen.name === 'pay'
      ? t('pay', lang)
      : screen.name === 'request'
        ? t('request', lang)
        : screen.name === 'check'
          ? t('check', lang)
          : screen.name === 'risk'
            ? 'Kavach'
            : null;

  return (
    <div className="phone" data-testid="phone">
      <header className="flex items-center gap-2 bg-primary px-4 pb-3 pt-4 text-primary-foreground">
        {title && screen.name !== 'risk' ? (
          <button onClick={home} aria-label={t('back', lang)} className="-ml-1 rounded p-1 hover:bg-white/10">
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <ShieldLogo size={24} />
        )}
        <p className="flex-1 truncate text-base font-bold">{title ?? 'Kavach Pay'}</p>
        <div className="flex rounded-full bg-white/10 p-0.5" role="group" aria-label="Language">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              onClick={() => onLang(l)}
              aria-pressed={lang === l}
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-semibold',
                lang === l ? 'bg-white text-primary' : 'text-white/80 hover:text-white',
              )}
              title={LANGUAGE_NAMES[l]}
              data-testid={`lang-${l}`}
            >
              {l === 'en' ? 'EN' : l === 'hi' ? 'हि' : 'বা'}
            </button>
          ))}
        </div>
      </header>

      {loadError && (
        <div className="m-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {loadError}{' '}
          <button className="underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {!wallet && !loadError && (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      )}

      {wallet && screen.name === 'home' && (
        <Home wallet={wallet} lang={lang} go={setScreen} approve={approve} decline={decline} />
      )}
      {wallet && screen.name === 'pay' && (
        <PayForm
          lang={lang}
          userId={userId}
          balancePaise={wallet.me.balancePaise}
          onChecking={() => setScreen({ name: 'checking', label: t('checking', lang) })}
          onResult={(payment) => setScreen({ name: 'risk', payment })}
          onError={() => setScreen({ name: 'pay' })}
        />
      )}
      {wallet && screen.name === 'request' && <RequestForm lang={lang} userId={userId} onDone={home} />}
      {wallet && screen.name === 'check' && <CheckMessage lang={lang} userId={userId} />}
      {screen.name === 'checking' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center" data-testid="checking">
          <ShieldLogo size={64} className="pulse" />
          <p className="font-medium">{screen.label}</p>
        </div>
      )}
      {screen.name === 'risk' && (
        <RiskSheet
          key={screen.payment.txn.id}
          payment={screen.payment}
          lang={lang}
          userId={userId}
          collectRequestId={screen.collectRequestId}
          onFinished={home}
        />
      )}
    </div>
  );
}

function Home({
  wallet,
  lang,
  go,
  approve,
  decline,
}: {
  wallet: Wallet;
  lang: Lang;
  go: (s: Screen) => void;
  approve: (id: string) => void;
  decline: (id: string) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="bg-primary px-4 pb-6 text-primary-foreground">
        <p className="text-sm text-white/70">{wallet.me.name}</p>
        <p className="text-xs text-white/60">{wallet.me.vpa}</p>
        <p className="mt-3 text-xs uppercase tracking-wide text-white/60">{t('balance', lang)}</p>
        <p className="text-3xl font-bold tabular" data-testid="balance">
          {rupees(wallet.me.balancePaise)}
        </p>
      </div>

      <div className="-mt-4 grid grid-cols-3 gap-2 px-4">
        {[
          { key: 'pay', icon: Send, label: t('pay', lang), screen: { name: 'pay' } as Screen },
          { key: 'request', icon: ArrowDownLeft, label: t('request', lang), screen: { name: 'request' } as Screen },
          { key: 'check', icon: MessageSquareWarning, label: t('check', lang), screen: { name: 'check' } as Screen },
        ].map((a) => (
          <button
            key={a.key}
            onClick={() => go(a.screen)}
            className="flex flex-col items-center gap-1 rounded-xl bg-card p-3 text-center text-xs font-semibold shadow-sm hover:bg-muted"
            data-testid={`action-${a.key}`}
          >
            <a.icon className="h-5 w-5 text-accent" />
            {a.label}
          </button>
        ))}
      </div>

      <section className="px-4 pt-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
          <Inbox className="h-4 w-4" /> {t('requests', lang)}
          {wallet.inbox.length > 0 && <Badge tone="danger">{wallet.inbox.length}</Badge>}
        </h2>
        {wallet.inbox.length === 0 ? (
          <EmptyState title={t('noRequests', lang)} />
        ) : (
          <div className="space-y-2">
            {wallet.inbox.map((r) => (
              <Card key={r.id} className="p-3" data-testid="collect-request">
                <div className="flex items-start gap-2">
                  <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <strong>{r.requesterName ?? r.requesterVpa}</strong> {t('wantsMoney', lang)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.requesterVpa} · {timeAgo(r.createdAt)}
                    </p>
                    {r.note && <p className="mt-1 text-sm italic">“{r.note}”</p>}
                  </div>
                  <p className="text-lg font-bold tabular">{rupees(r.amountPaise)}</p>
                </div>
                {r.status === 'blocked' && (
                  <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-danger">
                    <ShieldAlert className="h-3.5 w-3.5" /> On hold by Kavach
                  </p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => decline(r.id)} data-testid="decline-request">
                    {t('decline', lang)}
                  </Button>
                  <Button size="sm" onClick={() => approve(r.id)} data-testid="approve-request">
                    {t('approve', lang)}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="px-4 pb-6 pt-5">
        <h2 className="mb-2 text-sm font-bold">{t('history', lang)}</h2>
        {wallet.history.length === 0 ? (
          <EmptyState title={t('noHistory', lang)} />
        ) : (
          <ul className="divide-y divide-border rounded-lg bg-card shadow-sm" data-testid="history">
            {wallet.history.map((h) => {
              const counterparty = h.direction === 'out' ? (h.payeeName ?? h.payeeVpa) : (h.payerName ?? h.payerVpa);
              const failed = h.status === 'failed' || h.status === 'reversed';
              return (
                <li key={h.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      h.direction === 'out' ? 'bg-muted' : 'bg-ok-soft',
                    )}
                  >
                    {h.direction === 'out' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4 text-ok" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{counterparty}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {timeAgo(h.createdAt)}
                      {h.note ? ` · ${h.note}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn('text-sm font-semibold tabular', failed && 'text-muted-foreground line-through', h.direction === 'in' && !failed && 'text-ok')}>
                      {h.direction === 'out' ? '−' : '+'}
                      {rupees(h.amountPaise)}
                    </p>
                    {h.status !== 'settled' && (
                      <Badge tone={h.status === 'held' ? 'danger' : failed ? 'neutral' : 'warn'} className="text-[10px]">
                        {h.status === 'held' ? 'on hold' : h.status === 'risk_checked' ? 'pending' : h.status}
                      </Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function useVpaLookup(vpa: string) {
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setName(null);
    setError(null);
    const v = vpa.trim().toLowerCase();
    if (!/^[a-z0-9._-]+@[a-z0-9]+$/.test(v)) return;
    const id = setTimeout(async () => {
      const res = await api<{ name: string }>(`/api/vpa?vpa=${encodeURIComponent(v)}`);
      if (res.ok) setName(res.data.name);
      else setError(res.error.message);
    }, 350);
    return () => clearTimeout(id);
  }, [vpa]);
  return { name, error };
}

function PayForm({
  lang,
  userId,
  balancePaise,
  onChecking,
  onResult,
  onError,
}: {
  lang: Lang;
  userId: string;
  balancePaise: number;
  onChecking: () => void;
  onResult: (p: PaymentView) => void;
  onError: () => void;
}) {
  const [vpa, setVpa] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const lookup = useVpaLookup(vpa);
  const amountPaise = useMemo(() => parseRupees(amount), [amount]);
  const valid = lookup.name && amountPaise && amountPaise > 0;

  async function submit() {
    if (!valid) return;
    setError(null);
    onChecking();
    const res = await api<PaymentView>('/api/payments', {
      body: {
        userId,
        payeeVpa: vpa.trim().toLowerCase(),
        amountPaise,
        note,
        lang,
        ...(message.trim() ? { message: { text: message.trim() } } : {}),
      },
      idempotent: true,
    });
    if (res.ok) onResult(res.data);
    else {
      onError();
      alert(res.error.message);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div>
        <Label htmlFor="vpa">{t('payTo', lang)}</Label>
        <Input id="vpa" placeholder="name@kavach" autoCapitalize="none" value={vpa} onChange={(e) => setVpa(e.target.value)} data-testid="pay-vpa" />
        {lookup.name && <p className="mt-1 text-sm font-medium text-ok" data-testid="payee-name">✓ {lookup.name}</p>}
        {lookup.error && <p className="mt-1 text-sm text-danger">{lookup.error}</p>}
      </div>
      <div>
        <Label htmlFor="amount">{t('amount', lang)}</Label>
        <Input id="amount" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="pay-amount" />
        <p className="mt-1 text-xs text-muted-foreground">
          {t('balance', lang)}: {rupees(balancePaise)}
        </p>
      </div>
      <div>
        <Label htmlFor="note">{t('note', lang)}</Label>
        <Input id="note" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} data-testid="pay-note" />
      </div>
      <div>
        <Label htmlFor="msg">{t('messageAbout', lang)}</Label>
        <textarea
          id="msg"
          rows={3}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-lg border border-border bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          data-testid="pay-message"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button size="lg" className="mt-auto w-full" disabled={!valid} onClick={submit} data-testid="pay-continue">
        {t('continue', lang)}
      </Button>
    </div>
  );
}

function RequestForm({ lang, userId, onDone }: { lang: Lang; userId: string; onDone: () => void }) {
  const [vpa, setVpa] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lookup = useVpaLookup(vpa);
  const amountPaise = parseRupees(amount);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await api('/api/collect', {
      body: { userId, payerVpa: vpa.trim().toLowerCase(), amountPaise, note },
      idempotent: true,
    });
    setBusy(false);
    if (res.ok) setSent(true);
    else setError(res.error.message);
  }

  if (sent) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-xl font-bold">{t('requestSent', lang)}</p>
        <p className="text-sm text-muted-foreground">
          {rupees(amountPaise ?? 0)} · {lookup.name}
        </p>
        <Button className="w-full" onClick={onDone}>
          {t('done', lang)}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div>
        <Label htmlFor="rvpa">{t('requestFrom', lang)}</Label>
        <Input id="rvpa" placeholder="name@kavach" autoCapitalize="none" value={vpa} onChange={(e) => setVpa(e.target.value)} data-testid="request-vpa" />
        {lookup.name && <p className="mt-1 text-sm font-medium text-ok">✓ {lookup.name}</p>}
        {lookup.error && <p className="mt-1 text-sm text-danger">{lookup.error}</p>}
      </div>
      <div>
        <Label htmlFor="ramount">{t('amount', lang)}</Label>
        <Input id="ramount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="request-amount" />
      </div>
      <div>
        <Label htmlFor="rnote">{t('note', lang)}</Label>
        <Input id="rnote" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} data-testid="request-note" />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button size="lg" className="mt-auto w-full" disabled={!lookup.name || !amountPaise} loading={busy} onClick={submit} data-testid="request-send">
        {t('sendRequest', lang)}
      </Button>
    </div>
  );
}
