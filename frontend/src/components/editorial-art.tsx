import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/components/ui';

export type EditorialArtKind = 'risk' | 'network' | 'audit' | 'copilot' | 'payment' | 'activity';

type EditorialArtProps = ComponentPropsWithoutRef<'div'> & {
  kind: EditorialArtKind;
  compact?: boolean;
};

/**
 * Small, decorative illustrations from the approved visual language.
 * They deliberately contain no application data or controls, so live screens
 * can compose them without coupling visual decoration to API state.
 */
export function EditorialArt({ kind, compact = false, className, ...props }: EditorialArtProps) {
  const shared = {
    fill: 'none',
    stroke: '#202127',
    strokeWidth: 3.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <div className={cn('kavach-editorial-art', compact && 'kavach-editorial-art--compact', className)} aria-hidden {...props}>
      <svg viewBox="0 0 260 190" role="presentation">
        <circle cx="130" cy="96" r="75" fill="#ffb52e" />
        <circle cx="130" cy="96" r="57" fill="#7e8fc8" opacity=".75" />
        {kind === 'risk' && (
          <g {...shared}>
            <path d="M91 142c-4-18 0-37 13-47l12-9 29 2 19 19 4 34" fill="#fffdf5" />
            <path d="M112 88l-8-22 11-17 20-5 18 13 1 19-13 13" fill="#fffdf5" />
            <circle cx="126" cy="70" r="2" fill="#202127" />
            <circle cx="143" cy="69" r="2" fill="#202127" />
            <path d="M130 78q8 7 15-1M108 104l-20 17-10-8m68-18 20-18 13 7" />
            <path d="M177 115l24-13 13 15-24 13z" fill="#ef765f" />
            <path d="m188 119 8 5 9-11" stroke="#fffdf5" />
          </g>
        )}
        {kind === 'network' && (
          <g {...shared}>
            <path d="M58 89 105 47 158 54 204 94 166 144 103 145z" />
            <path d="M105 47l-2 98m55-91 8 90M58 89l146 5" strokeDasharray="5 7" opacity=".6" />
            <circle cx="58" cy="89" r="13" fill="#fffdf5" />
            <circle cx="105" cy="47" r="15" fill="#fffdf5" />
            <circle cx="158" cy="54" r="18" fill="#ef765f" />
            <circle cx="204" cy="94" r="13" fill="#fffdf5" />
            <circle cx="166" cy="144" r="17" fill="#ffb52e" />
          </g>
        )}
        {kind === 'audit' && (
          <g {...shared}>
            <path d="M85 36h76l24 24v91H85z" fill="#fffdf5" />
            <path d="M161 36v25h24M101 81h65m-65 18h65m-65 18h38" />
            <circle cx="174" cy="132" r="23" fill="#ffb52e" />
            <path d="m162 132 8 8 16-18" />
          </g>
        )}
        {kind === 'copilot' && (
          <g {...shared}>
            <path d="M85 78q0-38 42-38t43 38v39q0 29-43 29t-42-29z" fill="#fffdf5" />
            <path d="M99 87q28-19 57 0" />
            <circle cx="111" cy="99" r="4" fill="#202127" />
            <circle cx="147" cy="99" r="4" fill="#202127" />
            <path d="M117 116q12 10 24 0M130 39V23m-12 8 12-8 12 8" />
          </g>
        )}
        {kind === 'payment' && (
          <g {...shared}>
            <rect x="77" y="49" width="108" height="72" rx="10" fill="#fffdf5" />
            <path d="M77 70h108M93 91h34m-34 13h23" />
            <circle cx="163" cy="103" r="12" fill="#ffb52e" />
            <path d="m157 103 5 5 8-10M113 133l17 17 18-17M130 150v-27" />
          </g>
        )}
        {kind === 'activity' && (
          <g {...shared}>
            <path d="M78 130V60h105v70z" fill="#fffdf5" />
            <path d="M92 111l18-19 17 9 24-29 19 10M92 143h88" />
            <circle cx="110" cy="92" r="5" fill="#ffb52e" />
            <circle cx="151" cy="72" r="5" fill="#ef765f" />
          </g>
        )}
      </svg>
    </div>
  );
}
