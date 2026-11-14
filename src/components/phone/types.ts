import type { Lang } from '@/config/app';

export type DemoUser = {
  userId: string;
  name: string;
  language: Lang;
  blurb: string | null;
  kind: 'person' | 'merchant';
  vpa: string;
};

export type Wallet = {
  me: { userId: string; name: string; language: Lang; accountId: string; vpa: string; balancePaise: number };
  history: {
    id: string;
    type: 'pay' | 'collect' | 'funding';
    status: string;
    amountPaise: number;
    note: string;
    createdAt: string;
    riskDecision: 'allow' | 'warn' | 'hold' | null;
    riskScore: number | null;
    holdUntil: string | null;
    direction: 'in' | 'out';
    payerVpa: string;
    payerName: string | null;
    payeeVpa: string;
    payeeName: string | null;
  }[];
  inbox: {
    id: string;
    amountPaise: number;
    note: string;
    status: 'pending' | 'blocked';
    createdAt: string;
    requesterVpa: string;
    requesterName: string | null;
    openTxnId: string | null;
  }[];
};

export type PaymentView = {
  txn: {
    id: string;
    type: 'pay' | 'collect';
    status: string;
    amountPaise: number;
    note: string;
    holdUntil: string | null;
  };
  payee: { name: string; vpa: string };
  assessment: {
    score: number;
    rulesScore: number;
    aiPoints: number;
    decision: 'allow' | 'warn' | 'hold';
    aiStatus: string;
    rules: { id: string; points: number }[];
    explanation: { lang: Lang; headline: string; reasons: string[]; source: 'template' | 'ai'; cached?: boolean };
  };
};
