'use client';

import { Download, Smartphone } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { Button, cn } from '@/components/ui';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

// The browser may fire `beforeinstallprompt` before any button mounts, so the
// event is captured once at startup (see register-sw.tsx) and kept here.
let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function captureInstallPrompt() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  const mq = window.matchMedia('(display-mode: standalone)');
  mq.addEventListener('change', cb);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener('change', cb);
  };
};

type State = 'installed' | 'prompt' | 'ios' | 'manual';
const snapshot = (): State => {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (installed || standalone) return 'installed';
  if (deferred) return 'prompt';
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return 'ios';
  return 'manual';
};

/** "Install app" button: the browser's install prompt where supported, instructions elsewhere. */
export function InstallAppButton({ className, compact }: { className?: string; compact?: boolean }) {
  const state = useSyncExternalStore(subscribe, snapshot, () => 'installed' as State);
  const [help, setHelp] = useState(false);
  if (state === 'installed') return null;

  async function install() {
    if (deferred) {
      const event = deferred;
      await event.prompt();
      const choice = await event.userChoice;
      deferred = null;
      if (choice.outcome === 'accepted') installed = true;
      notify();
      return;
    }
    setHelp((h) => !h);
  }

  return (
    <div className={cn('relative', className)}>
      <Button
        variant="outline"
        size={compact ? 'sm' : 'md'}
        className={compact ? '' : 'w-full'}
        onClick={install}
        data-testid="install-app"
        aria-expanded={state === 'prompt' ? undefined : help}
      >
        {compact ? <Download className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
        <span className={compact ? 'hidden sm:inline' : ''}>Install app</span>
      </Button>
      {help && (
        <div
          role="note"
          className={cn(
            'z-30 mt-2 rounded-lg border border-border bg-card p-3 text-left text-xs leading-relaxed shadow-md',
            compact && 'absolute right-0 w-64',
          )}
        >
          {state === 'ios' ? (
            <>
              <strong>On iPhone:</strong> open this site in Safari, tap the <strong>Share</strong> button, then{' '}
              <strong>Add to Home Screen</strong>.
            </>
          ) : (
            <>
              <strong>On Android or desktop:</strong> open the browser menu (⋮) and choose <strong>Install app</strong> or{' '}
              <strong>Add to Home screen</strong>. Installing works on the deployed HTTPS site.
            </>
          )}
        </div>
      )}
    </div>
  );
}
