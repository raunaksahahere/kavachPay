'use client';

import { Square, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LANGUAGES, LANGUAGE_NAMES, type Lang } from '@/config/app';
import { Button, cn } from '@/components/ui';
import { apiFile } from '@/lib/client/api';
import { t } from '@/lib/client/i18n';

/**
 * Reads the reason for a warned or held payment aloud (ElevenLabs, via the
 * backend). The listener picks English, Hindi or Bengali independently of the
 * screen language; the words themselves are built on the server.
 */
export function ListenButton({ txnId, userId, lang }: { txnId: string; userId: string; lang: Lang }) {
  const [voiceLang, setVoiceLang] = useState<Lang>(lang);
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const clips = useRef(new Map<Lang, string>());

  useEffect(() => {
    const urls = clips.current;
    return () => {
      audio.current?.pause();
      for (const url of urls.values()) URL.revokeObjectURL(url);
    };
  }, []);

  function stop() {
    audio.current?.pause();
    setState('idle');
  }

  async function play(l: Lang) {
    stop();
    setError(null);
    let url = clips.current.get(l);
    if (!url) {
      setState('loading');
      const res = await apiFile(`/api/payments/${txnId}/voice?lang=${l}&userId=${userId}`);
      if (!res.ok) {
        setState('idle');
        setError(res.error.message);
        return;
      }
      url = URL.createObjectURL(res.blob);
      clips.current.set(l, url);
    }
    const el = new Audio(url);
    audio.current = el;
    el.onended = () => setState('idle');
    el.onerror = () => setState('idle');
    try {
      await el.play();
      setState('playing');
    } catch {
      setState('idle');
      setError('Your browser blocked audio playback. Tap again to play.');
    }
  }

  return (
    <div className="mt-3 rounded-lg bg-card/70 p-2.5" data-testid="listen">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          loading={state === 'loading'}
          onClick={() => (state === 'playing' ? stop() : void play(voiceLang))}
          data-testid="listen-button"
        >
          {state === 'playing' ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          {state === 'playing' ? t('stopListening', lang) : state === 'loading' ? t('voiceLoading', lang) : t('listen', lang)}
        </Button>
        <div className="flex rounded-full bg-muted p-0.5" role="group" aria-label={t('voiceIn', lang)}>
          {LANGUAGES.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={voiceLang === l}
              title={`${t('voiceIn', lang)} ${LANGUAGE_NAMES[l]}`}
              onClick={() => {
                setVoiceLang(l);
                if (state === 'playing') void play(l);
              }}
              className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', voiceLang === l ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}
              data-testid={`voice-lang-${l}`}
            >
              {l === 'en' ? 'EN' : l === 'hi' ? 'हि' : 'বা'}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-danger" data-testid="listen-error">
          {error}
        </p>
      )}
    </div>
  );
}
