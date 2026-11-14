'use client';

import { ImagePlus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Lang } from '@/config/app';
import { Badge, Button, Card, Textarea } from '@/components/ui';
import { api } from '@/lib/client/api';
import { SCAM_TYPE_TEXT, t } from '@/lib/client/i18n';

type Result = {
  aiStatus: string;
  latencyMs?: number;
  signals: {
    scam_type: string;
    claimed_purpose: string;
    money_direction_claimed: 'receive' | 'pay' | 'unclear';
    urgency_cues: string[];
    impersonated_entity: string | null;
    asks_for_pin_or_otp: boolean;
    extracted_vpa: string | null;
    extracted_amount: number | null;
    confidence: number;
  } | null;
  r8: { points: number } | null;
  reason: string | null;
  basic: { findings: string[]; keyword: string | null };
};

const MAX_BYTES = 4 * 1024 * 1024;

const BASIC_TEXT: Record<string, string> = {
  receive_keyword: 'Talks about receiving money (refund, cashback, prize…). On UPI, approving or entering a PIN always SENDS money.',
  mentions_pin_or_otp: 'Mentions a PIN or OTP. Never share them with anyone.',
  remote_access_app: 'Mentions a screen-sharing or remote-access app.',
};

/** G1: paste a message or attach a screenshot; Gemini extracts signals, fixed rules score them. */
export function CheckMessage({ lang, userId }: { lang: Lang; userId: string }) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<{ mimeType: string; dataBase64: string; name: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Use a PNG, JPEG or WebP screenshot.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Screenshot is larger than 4 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setImage({ mimeType: file.type, dataBase64: url.split(',')[1] ?? '', name: file.name, preview: url });
    };
    reader.readAsDataURL(file);
  }

  async function analyse() {
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await api<Result>('/api/check-message', {
      body: {
        userId,
        lang,
        message: {
          ...(text.trim() ? { text: text.trim() } : {}),
          ...(image ? { image: { mimeType: image.mimeType, dataBase64: image.dataBase64 } } : {}),
        },
      },
    });
    setBusy(false);
    if (res.ok) setResult(res.data);
    else setError(res.error.message);
  }

  const s = result?.signals;
  const aiUnavailable = result && !s;

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" data-testid="check-message">
      <p className="text-sm text-muted-foreground">{t('messageHint', lang)}</p>
      <Textarea
        rows={5}
        placeholder="e.g. Your refund of Rs 4,999 is ready. Approve the request to receive it…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        data-testid="message-text"
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
        data-testid="message-image"
      />
      {image ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.preview} alt="Attached screenshot" className="h-14 w-14 rounded object-cover" />
          <span className="flex-1 truncate text-sm">{image.name}</span>
          <button aria-label="Remove screenshot" onClick={() => setImage(null)} className="rounded p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <ImagePlus className="h-4 w-4" /> {t('attach', lang)}
        </Button>
      )}
      <Button size="lg" onClick={analyse} loading={busy} disabled={!text.trim() && !image} data-testid="analyse-button">
        {t('analyse', lang)}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}

      {result && (
        <Card className="space-y-3 p-4" data-testid="check-result">
          {s ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <p className={`font-bold ${s.scam_type === 'none' ? 'text-ok' : 'text-danger'}`} data-testid="scam-type">
                  {SCAM_TYPE_TEXT[s.scam_type] ?? s.scam_type}
                </p>
                <Badge tone={result.aiStatus === 'cached' ? 'neutral' : 'accent'}>
                  Gemini{result.aiStatus === 'cached' ? ' · cached' : ''}
                </Badge>
              </div>
              {result.reason && <p className="text-sm">{result.reason}</p>}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Says you will</dt>
                <dd className="font-medium">
                  {s.money_direction_claimed === 'receive' ? 'RECEIVE money' : s.money_direction_claimed === 'pay' ? 'pay money' : 'unclear'}
                </dd>
                <dt className="text-muted-foreground">Asks for PIN/OTP</dt>
                <dd className={s.asks_for_pin_or_otp ? 'font-semibold text-danger' : ''}>{s.asks_for_pin_or_otp ? 'Yes' : 'No'}</dd>
                {s.impersonated_entity && (
                  <>
                    <dt className="text-muted-foreground">Claims to be</dt>
                    <dd>{s.impersonated_entity}</dd>
                  </>
                )}
                {s.extracted_vpa && (
                  <>
                    <dt className="text-muted-foreground">UPI ID</dt>
                    <dd className="font-mono text-xs">{s.extracted_vpa}</dd>
                  </>
                )}
                {s.extracted_amount !== null && (
                  <>
                    <dt className="text-muted-foreground">Amount</dt>
                    <dd>₹{s.extracted_amount.toLocaleString('en-IN')}</dd>
                  </>
                )}
                {s.urgency_cues.length > 0 && (
                  <>
                    <dt className="text-muted-foreground">Pressure</dt>
                    <dd>{s.urgency_cues.slice(0, 3).map((c) => `“${c}”`).join(', ')}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Confidence</dt>
                <dd>{Math.round(s.confidence * 100)}%</dd>
              </dl>
              <p className="rounded bg-muted p-2 text-xs text-muted-foreground" data-testid="r8-points">
                If you paid because of this message, Kavach would add <strong>+{result.r8?.points ?? 0}</strong> risk points
                (fixed rules, max +25). Gemini describes the message; it never decides on a payment.
              </p>
            </>
          ) : (
            <p className="text-sm font-medium text-warn" data-testid="ai-unavailable">
              {t('aiOff', lang)}
            </p>
          )}
          {(aiUnavailable || result.basic.findings.length > 0) && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Basic check (no AI)</p>
              {result.basic.findings.length === 0 ? (
                <p className="text-sm">No warning keywords found. That does not prove the message is safe.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {result.basic.findings.map((f) => (
                    <li key={f}>{BASIC_TEXT[f]}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
