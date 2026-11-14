import type { Transaction } from '@/db/schema';
import type { AccountView } from '@/lib/ledger/payments';
import { findReceiveKeyword } from '@/lib/risk/rules';
import type { Assessment } from '@/lib/risk/types';

/** What the phone app needs to show the risk screen for a payment. */
export function paymentView(txn: Transaction, assessment: Assessment, payee: AccountView) {
  return {
    txn: {
      id: txn.id,
      type: txn.type,
      status: txn.status,
      amountPaise: txn.amountPaise,
      note: txn.note,
      holdUntil: txn.holdUntil,
    },
    payee: { name: payee.name, vpa: payee.vpa },
    assessment: {
      score: assessment.score,
      rulesScore: assessment.rulesScore,
      aiPoints: assessment.aiPoints,
      decision: assessment.decision,
      aiStatus: assessment.aiStatus,
      rules: assessment.fired.map((r) => ({ id: r.id, points: r.points })),
      explanation: assessment.explanation,
    },
  };
}

const PIN_OTP = /\b(otp|o\.t\.p|pin|cvv|password|passcode)\b|ओटीपी|पिन|ওটিপি|পিন/i;
const REMOTE_APPS = /\b(anydesk|teamviewer|quicksupport|screen ?share|rustdesk)\b|स्क्रीन शेयर|স্ক্রিন শেয়ার/i;

/**
 * Deterministic keyword check, shown alongside (or instead of) the AI result.
 * It never needs the network, so the screen is useful even in rules-only mode.
 */
export function basicMessageCheck(text: string) {
  const findings: string[] = [];
  const keyword = findReceiveKeyword(text);
  if (keyword) findings.push('receive_keyword');
  if (PIN_OTP.test(text)) findings.push('mentions_pin_or_otp');
  if (REMOTE_APPS.test(text)) findings.push('remote_access_app');
  return { findings, keyword };
}
