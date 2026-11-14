import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Menu, X } from 'lucide-react';
import { ShieldLogo, cn } from '@/components/ui';

export type WorkspaceNavigationItem = {
  key: string;
  label: string;
  icon: ReactNode;
  badge?: string;
};

type WorkspaceShellProps = {
  children: ReactNode;
  navigation: WorkspaceNavigationItem[];
  activeKey: string;
  onNavigate?: (key: string) => void;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
  header?: ReactNode;
  footer?: ReactNode;
};

/**
 * Presentation-only responsive shell for future workspace screens. Route and
 * authorization decisions stay in their callers and on the server.
 */
export function WorkspaceShell({
  children,
  navigation,
  activeKey,
  onNavigate,
  mobileOpen = false,
  onMobileOpenChange,
  header,
  footer,
}: WorkspaceShellProps) {
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    const wasOpenBefore = wasOpen.current;
    wasOpen.current = mobileOpen;
    if (mobileOpen) {
      const oldOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      closeButton.current?.focus();
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') onMobileOpenChange?.(false);
      };
      window.addEventListener('keydown', onKeyDown);
      return () => {
        document.body.style.overflow = oldOverflow;
        window.removeEventListener('keydown', onKeyDown);
      };
    }
    if (wasOpenBefore) menuButton.current?.focus();
  }, [mobileOpen, onMobileOpenChange]);

  return (
    <div className="kavach-workspace">
      {mobileOpen && <button type="button" className="kavach-workspace__scrim" aria-label="Close navigation" onClick={() => onMobileOpenChange?.(false)} />}
      <aside className={cn('kavach-workspace__sidebar', mobileOpen && 'is-open')} aria-label="Workspace navigation" aria-modal={mobileOpen || undefined} role={mobileOpen ? 'dialog' : undefined}>
        <div className="kavach-workspace__brand">
          <ShieldLogo size={32} />
          <span>
            <strong>Kavach Pay</strong>
            <small>Fraud intelligence</small>
          </span>
          <button ref={closeButton} type="button" className="kavach-workspace__close" aria-label="Close navigation" onClick={() => onMobileOpenChange?.(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="kavach-workspace__nav">
          {navigation.map((item) => (
            <button
              key={item.key}
              type="button"
              className={cn('kavach-workspace__nav-item', activeKey === item.key && 'is-active')}
              aria-current={activeKey === item.key ? 'page' : undefined}
              onClick={() => {
                onNavigate?.(item.key);
                onMobileOpenChange?.(false);
              }}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge && <em>{item.badge}</em>}
            </button>
          ))}
        </nav>
        {footer && <div className="kavach-workspace__footer">{footer}</div>}
      </aside>
      <div className="kavach-workspace__main">
        <header className="kavach-workspace__header">
          <button ref={menuButton} type="button" className="kavach-workspace__menu" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => onMobileOpenChange?.(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">{header}</div>
        </header>
        {children}
      </div>
    </div>
  );
}
