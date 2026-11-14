import type { TxnStatus } from '@/db/schema';
import { AppError } from '@/lib/errors';

/**
 * initiated -> risk_checked -> (held | confirmed) -> settled
 * plus failed (from any non-final state) and reversed (from settled).
 */
export const TRANSITIONS: Record<TxnStatus, readonly TxnStatus[]> = {
  initiated: ['risk_checked', 'failed'],
  risk_checked: ['held', 'confirmed', 'failed'],
  held: ['confirmed', 'failed'],
  confirmed: ['settled', 'failed'],
  settled: ['reversed'],
  failed: [],
  reversed: [],
};

export const FINAL_STATES: readonly TxnStatus[] = ['failed', 'reversed'];

export function canTransition(from: TxnStatus, to: TxnStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: TxnStatus, to: TxnStatus): void {
  if (!canTransition(from, to)) {
    throw new AppError(409, 'invalid_state', `A ${from} transaction cannot become ${to}.`, {
      status: from,
    });
  }
}
