'use client';

import { useState } from 'react';
import { LANGUAGES, LANGUAGE_NAMES, type Lang } from '@/config/app';
import { Button, Input, Label, ShieldLogo, cn } from '@/components/ui';
import { api, rupees } from '@/lib/client/api';

const OPENING_BALANCE_PAISE = 10_000_00;

/** First sign-in: create the user's own account (UPI ID, language, UPI PIN). */
export function Onboarding({ suggested, onDone }: { suggested: { name: string; handle: string }; onDone: () => void }) {
  const [name, setName] = useState(suggested.name);
  const [handle, setHandle] = useState(suggested.handle);
  const [language, setLanguage] = useState<Lang>('en');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOk = /^[a-z0-9][a-z0-9._-]{2,29}$/.test(handle);
  const pinOk = /^\d{4,6}$/.test(pin) && pin === pin2;

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await api('/api/onboard', { body: { name, handle, pin, language } });
    setBusy(false);
    if (r.ok) onDone();
    else setError(r.error.message);
  }

  return (
    <div className="phone" data-testid="onboarding">
      <header className="flex items-center gap-2 bg-primary px-4 pb-3 pt-4 text-primary-foreground">
        <ShieldLogo size={24} />
        <p className="text-base font-bold">Set up your account</p>
      </header>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <p className="text-sm text-muted-foreground">
          This is your own Kavach Pay account. It starts with a simulated balance of {rupees(OPENING_BALANCE_PAISE)} so you can try payments.
          No real money is involved.
        </p>
        <div>
          <Label htmlFor="ob-name">Your name</Label>
          <Input id="ob-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ob-handle">Your UPI ID</Label>
          <div className="flex items-center gap-1">
            <Input
              id="ob-handle"
              value={handle}
              autoCapitalize="none"
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              data-testid="onboard-handle"
            />
            <span className="shrink-0 font-mono text-sm text-muted-foreground">@kavach</span>
          </div>
          {!handleOk && <p className="mt-1 text-xs text-danger">3 to 30 letters, numbers, dot, dash or underscore.</p>}
        </div>
        <div>
          <Label>Language for warnings</Label>
          <div className="flex gap-2" role="group" aria-label="Language">
            {LANGUAGES.map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                aria-pressed={language === l}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 text-sm font-medium',
                  language === l ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-card',
                )}
              >
                {LANGUAGE_NAMES[l]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="ob-pin">Set UPI PIN</Label>
            <Input
              id="ob-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              data-testid="onboard-pin"
            />
          </div>
          <div>
            <Label htmlFor="ob-pin2">Confirm PIN</Label>
            <Input
              id="ob-pin2"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
              data-testid="onboard-pin2"
            />
          </div>
        </div>
        {pin2 && pin !== pin2 && <p className="-mt-2 text-xs text-danger">The PINs do not match.</p>}
        <p className="text-xs text-muted-foreground">4 to 6 digits. It is stored only as an Argon2id hash.</p>
        {error && <p className="text-sm font-medium text-danger">{error}</p>}
        <Button size="lg" className="mt-auto w-full" disabled={!name.trim() || !handleOk || !pinOk} loading={busy} onClick={submit} data-testid="onboard-submit">
          Create my account
        </Button>
      </div>
    </div>
  );
}
