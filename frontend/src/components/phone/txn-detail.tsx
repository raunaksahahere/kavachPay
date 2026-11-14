'use client';

import { ArrowDownLeft, ArrowUpRight, Download, ExternalLink, FileText, Flag, Phone } from 'lucide-react';
import { useState } from 'react';
import { REPORTING_CHANNELS, type Lang } from '@/config/app';
import { Badge, Button, cn } from '@/components/ui';
import { apiFile, rupees } from '@/lib/client/api';
import { DECISION_TEXT, t } from '@/lib/client/i18n';
import { ListenButton } from './listen-button';
import type { Wallet } from './types';

type HistoryItem = Wallet['history'][number];

function statusText(h: HistoryItem, lang: Lang) {
  if (h.status === 'settled') return t('stCompleted', lang);
  if (h.status === 'held') return t('stOnHold', lang);
  if (h.status === 'failed') return t('stNotCompleted', lang);
  if (h.status === 'reversed') return t('stReversed', lang);
  return t('stPending', lang);
}

/**
 * One transaction from the history: its details, a PDF of every transaction
 * with the same account, and official places to report it.
 */
export function TxnDetail({ item, userId, lang }: { item: HistoryItem; userId: string; lang: Lang }) {
  const out = item.direction === 'out';
  const otherName = out ? (item.payeeName ?? item.payeeVpa) : (item.payerName ?? item.payerVpa);
  const otherVpa = out ? item.payeeVpa : item.payerVpa;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  async function download() {
    setBusy(true);
    setMessage(null);
    const res = await apiFile(`/api/transactions/${item.id}/statement?userId=${userId}`);
    setBusy(false);
    if (!res.ok) {
      setMessage({ tone: 'error', text: res.error.message });
      return;
    }
    const url = URL.createObjectURL(res.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.filename ?? `kavach-transactions-${otherVpa}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setMessage({ tone: 'ok', text: t('downloaded', lang) });
  }

  return (
    <div className="flex-1 overflow-y-auto" data-testid="txn-detail">
      <div className="flex flex-col items-center gap-2 px-4 pb-5 pt-6 text-center">
        <span className={cn('flex h-12 w-12 items-center justify-center rounded-full', out ? 'bg-muted' : 'bg-ok-soft')}>
          {out ? <ArrowUpRight className="h-6 w-6" /> : <ArrowDownLeft className="h-6 w-6 text-ok" />}
        </span>
        <p className="text-sm text-muted-foreground">{out ? t('youSent', lang) : t('youReceived', lang)}</p>
        <p className="text-3xl font-bold tabular">{rupees(item.amountPaise)}</p>
        <p className="font-semibold">{otherName}</p>
        <p className="font-mono text-xs text-muted-foreground" data-testid="txn-counterparty">
          {otherVpa}
        </p>
      </div>

      <dl className="mx-4 divide-y divide-border rounded-lg bg-card text-sm shadow-sm">
        <div className="flex justify-between gap-3 px-3 py-2.5">
          <dt className="text-muted-foreground">{t('when', lang)}</dt>
          <dd className="text-right">
            {new Date(item.createdAt).toLocaleString(lang === 'en' ? 'en-IN' : lang === 'hi' ? 'hi-IN' : 'bn-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </dd>
        </div>
        <div className="flex justify-between gap-3 px-3 py-2.5">
          <dt className="text-muted-foreground">{t('status', lang)}</dt>
          <dd className="text-right">{statusText(item, lang)}</dd>
        </div>
        {item.riskDecision && (
          <div className="flex justify-between gap-3 px-3 py-2.5">
            <dt className="text-muted-foreground">Kavach</dt>
            <dd>
              <Badge tone={item.riskDecision === 'allow' ? 'ok' : item.riskDecision === 'warn' ? 'warn' : 'danger'}>
                {DECISION_TEXT[item.riskDecision][lang]} · {item.riskScore}/100
              </Badge>
            </dd>
          </div>
        )}
        {item.note && (
          <div className="flex justify-between gap-3 px-3 py-2.5">
            <dt className="text-muted-foreground">{t('note', lang).replace(/\s*\(.*\)$/, '')}</dt>
            <dd className="text-right italic">“{item.note}”</dd>
          </div>
        )}
      </dl>

      {out && (item.riskDecision === 'warn' || item.riskDecision === 'hold') && (
        <div className="mx-4">
          <ListenButton txnId={item.id} userId={userId} lang={lang} />
        </div>
      )}

      <div className="space-y-3 p-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex gap-2">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <p className="text-xs text-muted-foreground">{t('downloadHint', lang)}</p>
          </div>
          <Button className="mt-3 h-auto min-h-10 w-full py-2 text-left leading-snug" variant="outline" loading={busy} onClick={download} data-testid="download-statement">
            <Download className="h-4 w-4 shrink-0" /> <span>{t('downloadPdf', lang)}</span>
          </Button>
          {message && (
            <p role={message.tone === 'error' ? 'alert' : 'status'} className={cn('mt-2 text-xs font-medium', message.tone === 'error' ? 'text-danger' : 'text-ok')} data-testid="download-status">
              {message.text}
            </p>
          )}
        </div>

        <Button className="h-auto min-h-10 w-full py-2 leading-snug" variant="danger" onClick={() => setReportOpen((v) => !v)} aria-expanded={reportOpen} data-testid="report-button">
          <Flag className="h-4 w-4" /> {t('report', lang)}
        </Button>
        {reportOpen && (
          <div className="rounded-lg border border-danger-border bg-danger-soft/60 p-3" data-testid="report-options">
            <p className="mb-2 text-xs text-muted-foreground">{t('reportHint', lang)}</p>
            <ul className="space-y-2">
              {REPORTING_CHANNELS.map((ch) => {
                const tel = ch.url.startsWith('tel:');
                return (
                  <li key={ch.id}>
                    <a
                      href={ch.url}
                      {...(tel ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                      className="flex items-start gap-2 rounded-lg bg-card p-2.5 shadow-sm hover:bg-muted"
                      data-testid={`report-${ch.id}`}
                    >
                      {tel ? <Phone className="mt-0.5 h-4 w-4 shrink-0 text-danger" /> : <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{ch.name}</span>
                        <span className="block text-xs text-muted-foreground">{t(ch.hint, lang)}</span>
                        <span className="block truncate font-mono text-[11px] text-accent">{ch.label}</span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
