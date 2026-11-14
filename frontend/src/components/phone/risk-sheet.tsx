'use client';

import { CheckCircle2, Clock, ShieldAlert, ShieldCheck, ShieldX, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Lang } from '@/config/app';
import { Badge, Button, Input, Label, cn } from '@/components/ui';
import { api, parseRupees, rupees } from '@/lib/client/api';
import { DECISION_TEXT, t } from '@/lib/client/i18n';
import type { PaymentView } from './types';

type Props = {
  payment: PaymentView;
  lang: Lang;
  userId: string;
  collectRequestId?: string;
  onFinished: (outcome: 'settled' | 'cancelled' | 'declined') => void;
};

const TONE = {
  allow: { box: 'border-ok/30 bg-ok-soft', text: 'text-ok', Icon: ShieldCheck },
  warn: { box: 'border-warn-border bg-warn-soft', text: 'text-warn', Icon: ShieldAlert },
  hold: { box: 'border-danger-border bg-danger-soft', text: 'text-danger', Icon: ShieldX },
} as const;

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * The fraud shield's moment: the decision, the score, the reasons in the
 * user's language, and the friction that matches the decision.
 */
export function RiskSheet({ payment, lang, userId, collectRequestId, onFinished }: Props) {
  const { txn, payee, assessment } = payment;
  const decision = assessment.decision;
  const tone = TONE[decision];
  const now = useNow();
  const holdUntil = txn.holdUntil ? new Date(txn.holdUntil).getTime() : null;
  const holdActive = decision === 'hold' && holdUntil !== null && holdUntil > now;

  const [pin, setPin] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<null | 'pay' | 'cancel'>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | 'settled' | 'cancelled' | 'declined'>(null);

  const needsTypedAmount = decision !== 'allow';
  const typedPaise = parseRupees(typed);
  const canPay = !holdActive && /^\d{4,6}$/.test(pin) && (!needsTypedAmount || typedPaise !== null);

  async function pay() {
    setBusy('pay');
    setError(null);
    const res = await api<{ txn: { status: string } }>(`/api/payments/${txn.id}/confirm`, {
      body: { userId, pin, ...(needsTypedAmount ? { typedAmountPaise: typedPaise ?? 0 } : {}) },
      idempotent: true,
    });
    setBusy(null);
    if (res.ok) {
      setDone('settled');
      return;
    }
    setPin('');
    setError(res.error.message);
  }

  async function stop() {
    setBusy('cancel');
    setError(null);
    const res = collectRequestId
      ? await api(`/api/collect/${collectRequestId}/decline`, { body: { userId } })
      : await api(`/api/payments/${txn.id}/cancel`, { body: { userId } });
    setBusy(null);
    if (res.ok) setDone(collectRequestId ? 'declined' : 'cancelled');
    else setError(res.error.message);
  }

  if (done) {
    const settled = done === 'settled';
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center" data-testid="payment-finished">
        {settled ? <CheckCircle2 className="h-16 w-16 text-ok" /> : <ShieldCheck className="h-16 w-16 text-accent" />}
        <div>
          <p className="text-xl font-bold">{settled ? t('sent', lang) : t('stopped', lang)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {rupees(txn.amountPaise)} · {payee.name}
          </p>
        </div>
        <Button className="w-full" size="lg" onClick={() => onFinished(done)}>
          {t('done', lang)}
        </Button>
      </div>
    );
  }

  const aiLine =
    assessment.aiStatus === 'ok'
      ? t('aiOk', lang)
      : assessment.aiStatus === 'cached'
        ? t('aiCached', lang)
        : assessment.aiStatus === 'not_run'
          ? null
          : t('aiOff', lang);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto" data-testid="risk-sheet" data-decision={decision}>
      <div className={cn('m-4 rounded-xl border p-4', tone.box)}>
        <div className="flex items-start gap-3">
          <tone.Icon className={cn('mt-0.5 h-8 w-8 shrink-0', tone.text, decision === 'hold' && 'pulse')} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={cn('text-lg font-bold', tone.text)} data-testid="decision-label">
                {DECISION_TEXT[decision][lang]}
              </p>
              <Badge tone={decision === 'allow' ? 'ok' : decision === 'warn' ? 'warn' : 'danger'} data-testid="risk-score">
                {t('riskScore', lang)} {assessment.score}/100
              </Badge>
            </div>
            <p className="mt-2 text-[15px] font-semibold leading-snug" data-testid="risk-headline">
              {assessment.explanation.headline}
            </p>
          </div>
        </div>

        {assessment.explanation.reasons.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('why', lang)}</p>
            <ul className="space-y-2" data-testid="risk-reasons">
              {assessment.explanation.reasons.map((reason, i) => (
                <li key={i} className="flex gap-2 text-sm leading-snug">
                  <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', decision === 'hold' ? 'bg-danger' : 'bg-warn')} />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          {assessment.rules.map((r) => (
            <span key={r.id} className="rounded bg-card/70 px-1.5 py-0.5 font-mono text-muted-foreground">
              {r.id.split('_')[0]} +{r.points}
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {aiLine && <span data-testid="ai-status">{aiLine}</span>}
          {assessment.explanation.source === 'ai' && (
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> {t('aiExplained', lang)}
              {assessment.explanation.cached ? ' (cached)' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="mx-4 mb-4 rounded-lg bg-card p-3 text-sm shadow-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{payee.name}</span>
          <span className="font-bold tabular">{rupees(txn.amountPaise)}</span>
        </div>
        <p className="text-xs text-muted-foreground">{payee.vpa}</p>
        {txn.note && <p className="mt-1 text-xs italic text-muted-foreground">“{txn.note}”</p>}
      </div>

      <div className="mt-auto space-y-3 p-4">
        {holdActive ? (
          <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm" data-testid="hold-timer">
            <Clock className="h-4 w-4 shrink-0 text-danger" />
            <span>
              {t('heldUntil', lang)}{' '}
              <strong className="tabular">
                {new Date(holdUntil!).toLocaleTimeString(lang === 'en' ? 'en-IN' : lang === 'hi' ? 'hi-IN' : 'bn-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </strong>{' '}
              ({Math.max(0, Math.ceil((holdUntil! - now) / 60000))} min)
            </span>
          </div>
        ) : (
          <>
            {decision === 'hold' && <p className="text-sm font-medium text-danger">{t('holdOver', lang)}</p>}
            {needsTypedAmount && (
              <div>
                <Label htmlFor="typed-amount">{t('typeAmount', lang)}</Label>
                <Input
                  id="typed-amount"
                  inputMode="decimal"
                  placeholder={rupees(txn.amountPaise).replace('₹', '')}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  data-testid="typed-amount"
                />
              </div>
            )}
            <div>
              <Label htmlFor="pin">{t('enterPin', lang)}</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="text-center text-xl tracking-[0.6em]"
                data-testid="pin-input"
              />
            </div>
            <Button
              size="lg"
              className="w-full"
              variant={decision === 'allow' ? 'accent' : decision === 'warn' ? 'warn' : 'danger'}
              disabled={!canPay}
              loading={busy === 'pay'}
              onClick={pay}
              data-testid="pay-button"
            >
              {t('payNow', lang)} {rupees(txn.amountPaise)}
            </Button>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-danger" data-testid="pay-error">
            {error}
          </p>
        )}
        <Button
          size="lg"
          variant={decision === 'allow' ? 'ghost' : 'primary'}
          className="w-full"
          loading={busy === 'cancel'}
          onClick={stop}
          data-testid="stop-button"
        >
          {collectRequestId ? t('declineRequest', lang) : t('cancel', lang)}
        </Button>
      </div>
    </div>
  );
}
