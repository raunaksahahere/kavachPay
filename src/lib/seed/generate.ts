/**
 * Deterministic synthetic dataset. Everything here is invented: names, VPAs,
 * phone numbers, amounts and notes. The same seed always yields the same
 * users, transactions and labels; only the timestamps shift with `anchor`
 * so that "the last 24 hours" is real at demo time.
 */

export type Scenario =
  | 'legit_everyday'
  | 'legit_p2p'
  | 'legit_collect'
  | 'legit_collect_tricky_note'
  | 'legit_high_value'
  | 'legit_burst'
  | 'mule_ring'
  | 'mule_layering'
  | 'refund_collect'
  | 'refund_collect_paraphrased'
  | 'takeover_burst';

/** Older relationship payments that give the rules something to compare against. Not evaluated. */
export type Unlabelled = 'funding' | 'history';

export const FRAUD_SCENARIOS: Scenario[] = [
  'mule_ring',
  'mule_layering',
  'refund_collect',
  'refund_collect_paraphrased',
  'takeover_burst',
];

export type SeedUser = {
  id: string;
  name: string;
  phone: string;
  kind: 'person' | 'merchant';
  language: 'en' | 'hi' | 'bn';
  isDemo: boolean;
  demoBlurb: string | null;
};

export type SeedAccount = {
  id: string;
  userId: string | null;
  vpa: string;
  kind: 'user' | 'system';
  openedAt: Date;
};

export type SeedTxn = {
  id: string;
  type: 'pay' | 'collect' | 'funding';
  payerAccountId: string;
  payeeAccountId: string;
  amountPaise: number;
  note: string;
  createdAt: Date;
  isFraud: boolean;
  scenario: Scenario | Unlabelled;
};

export type SeedCollect = {
  id: string;
  requesterAccountId: string;
  payerAccountId: string;
  amountPaise: number;
  note: string;
  createdAt: Date;
};

export type Dataset = {
  seed: number;
  anchor: Date;
  users: SeedUser[];
  accounts: SeedAccount[];
  txns: SeedTxn[];
  pendingCollects: SeedCollect[];
  ring: { hubAccountId: string; muleAccountIds: string[]; cashoutAccountId: string; victimAccountIds: string[] };
  counts: Record<string, number>;
};

/** Payments in the evaluated window: everything except opening balances and pre-history. */
export const isLabelled = (t: SeedTxn) => t.scenario !== 'funding' && t.scenario !== 'history';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const HISTORY_DAYS = 30;
/** Days of older, unlabelled relationship history before the evaluated window. */
export const PRE_HISTORY_DAYS = 30;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  'Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Sai', 'Rohan', 'Kabir', 'Ishaan', 'Karan', 'Nikhil',
  'Ananya', 'Diya', 'Isha', 'Kavya', 'Meenal', 'Neha', 'Pooja', 'Riya', 'Sneha', 'Tanvi',
  'Imran', 'Farhan', 'Zoya', 'Ayesha', 'Harpreet', 'Gurleen', 'Joseph', 'Mary', 'Debjani', 'Sourav',
  'Lakshmi', 'Venkat', 'Priya', 'Suresh', 'Kiran', 'Deepa', 'Manoj', 'Sunita', 'Rakesh', 'Geeta',
];
const LAST = [
  'Sharma', 'Verma', 'Iyer', 'Nair', 'Reddy', 'Patel', 'Shah', 'Gupta', 'Singh', 'Khan',
  'Das', 'Banerjee', 'Mukherjee', 'Pillai', 'Joshi', 'Kulkarni', 'Mehta', 'Chopra', 'Fernandes', 'Yadav',
];
const SHOPS = [
  'Sharma Kirana Store', 'Annapurna Sweets', 'City Medicals', 'Fresh Basket', 'Metro Mobile Recharge',
  'Lakshmi Tiffin Centre', 'Green Leaf Vegetables', 'Royal Bakery', 'Quick Cab Services', 'Balaji Stationers',
  'Sri Krishna Dairy', 'Urban Laundry', 'Spice Route Restaurant', 'Book Nook', 'Star Electricals',
  'Daily Needs Mart', 'Chai Point Corner', 'Ganesh Hardware', 'Bright Opticals', 'PowerGrid Bill Desk',
  'FiberNet Broadband', 'Indane Gas Agency', 'Pet Care Clinic', 'Style Cuts Salon', 'Fit Zone Gym',
  'Kolkata Fish Market', 'Mumbai Vada Pav', 'Delhi Chaat House', 'Chennai Filter Coffee', 'Kerala Stores',
];
const HIGH_VALUE_PAYEES = [
  'Greenfield School Fees', 'Sunrise Hostel', 'Landlord R Iyer', 'Landlord S Kapoor',
  'Bright Minds Tuition', 'Market Complex Shop Rent',
];

const NOTES_SHOP = ['groceries', 'milk', 'medicines', 'recharge', 'snacks', 'vegetables', 'tea', ''];
const NOTES_P2P = ['dinner split', 'cab share', 'thanks', 'birthday gift', 'movie tickets', ''];
const NOTES_COLLECT = ['Order #2207 payment', 'Order #3115 payment', 'Electricity bill', 'Broadband bill', 'Gas cylinder booking', 'Monthly subscription'];
const NOTES_COLLECT_TRICKY = ['Refundable security deposit', 'Cashback offer applied - pay balance', 'KYC document courier charge'];
const NOTES_HIGH_VALUE = ['Rent for the month', 'School fees term 2', 'Hostel fees', 'Tuition fees', 'Shop rent'];
const NOTES_MULE_VICTIM = ['Investment plan registration', 'Job joining fee', 'Advance for delivery', 'Loan processing fee', 'Trading account top-up', ''];
const NOTES_REFUND = [
  'Refund for cancelled order',
  'Cashback reward claim',
  'KYC verification refund',
  'Prize money claim - approve to receive',
  'Refund processing - electricity bill',
];
const NOTES_REFUND_PARAPHRASED = [
  'Order cancellation amount - approve to get it back',
  'Paisa wapas for failed recharge',
  'Amount return from customer care',
  'Loyalty points encash - approve now',
  'Double debit correction - accept to get credit',
  'Insurance bonus payout - accept request',
];

export function generateDataset(seed: number, anchorInput: Date): Dataset {
  const rng = mulberry32(seed);
  const anchor = new Date(Math.floor(anchorInput.getTime() / MIN) * MIN);
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
  const chance = (p: number) => rng() < p;
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rng() * 16).toString(16)).join('');
  const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
  const ago = (ms: number) => new Date(anchor.getTime() - ms);
  const rupees = (lo: number, hi: number) => int(lo, hi) * 100;

  const users: SeedUser[] = [];
  const accounts: SeedAccount[] = [];
  const events: SeedTxn[] = [];
  const usedVpas = new Set<string>();

  function addParty(opts: {
    name: string;
    kind: 'person' | 'merchant';
    ageDays: number;
    vpa?: string;
    language?: 'en' | 'hi' | 'bn';
    demoBlurb?: string;
  }): string {
    const userId = uuid();
    const accountId = uuid();
    let vpa = opts.vpa ?? opts.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
    while (usedVpas.has(vpa)) vpa = `${vpa}${int(1, 99)}`;
    usedVpas.add(vpa);
    users.push({
      id: userId,
      name: opts.name,
      phone: `90000${String(10000 + users.length)}`,
      kind: opts.kind,
      language: opts.language ?? pick(['en', 'en', 'hi', 'hi', 'bn'] as const),
      isDemo: Boolean(opts.demoBlurb),
      demoBlurb: opts.demoBlurb ?? null,
    });
    accounts.push({ id: accountId, userId, vpa: `${vpa}@kavach`, kind: 'user', openedAt: ago(opts.ageDays * DAY) });
    return accountId;
  }

  const treasury = uuid();
  accounts.push({ id: treasury, userId: null, vpa: 'treasury@kavach', kind: 'system', openedAt: ago(2000 * DAY) });

  function txn(
    type: SeedTxn['type'],
    payer: string,
    payee: string,
    amountPaise: number,
    note: string,
    at: Date,
    scenario: SeedTxn['scenario'],
  ) {
    events.push({
      id: uuid(),
      type,
      payerAccountId: payer,
      payeeAccountId: payee,
      amountPaise,
      note,
      createdAt: at,
      isFraud: FRAUD_SCENARIOS.includes(scenario as Scenario),
      scenario,
    });
  }

  // ---------- Population ----------
  const merchants = SHOPS.map((name, i) =>
    addParty({
      name,
      kind: 'merchant',
      ageDays: int(200, 2000),
      vpa: i === 0 ? 'sharmakirana' : undefined,
      language: 'en',
      demoBlurb: i === 0 ? 'Shop owner. Use this account to send a collect request.' : undefined,
    }),
  );
  const highValuePayees = HIGH_VALUE_PAYEES.map((name) => addParty({ name, kind: 'merchant', ageDays: int(400, 2500) }));

  const asha = addParty({
    name: 'Asha Devi',
    kind: 'person',
    ageDays: 900,
    vpa: 'asha',
    language: 'hi',
    demoBlurb: 'Has a "refund" collect request waiting. Explanations in Hindi.',
  });
  const ravi = addParty({
    name: 'Ravi Kumar',
    kind: 'person',
    ageDays: 1200,
    vpa: 'ravi',
    language: 'en',
    demoBlurb: 'Everyday user. Pays rent to a known landlord without friction.',
  });
  const meera = addParty({
    name: 'Meera Das',
    kind: 'person',
    ageDays: 700,
    vpa: 'meera',
    language: 'bn',
    demoBlurb: 'Senior user. Has a suspicious request with no obvious keyword. Explanations in Bengali.',
  });
  const demoPersons = [asha, ravi, meera];

  const persons: string[] = [...demoPersons];
  for (let i = 0; i < 147; i++) {
    persons.push(addParty({ name: `${pick(FIRST)} ${pick(LAST)}`, kind: 'person', ageDays: int(60, 1500) }));
  }
  const ordinary = persons.filter((p) => !demoPersons.includes(p));

  const hub = addParty({ name: 'QuickPay Settlements', kind: 'person', ageDays: 3, language: 'en' });
  const muleNames = ['Refund Helpdesk', 'Easy Jobs Portal', 'Smart Invest Desk', 'Fast Loan Support', 'Parcel Release Desk'];
  const muleAges = [2, 4, 3, 5, 1];
  const mules = muleNames.map((name, i) =>
    addParty({ name, kind: 'person', ageDays: muleAges[i], vpa: i === 0 ? 'refund.helpdesk' : undefined, language: 'en' }),
  );
  const cashout = addParty({ name: 'N Traders', kind: 'person', ageDays: 12, language: 'en' });
  const youngScammers = ['Order Refund Team', 'Cashback Rewards Cell'].map((name, i) =>
    addParty({ name, kind: 'person', ageDays: 6 - i, language: 'en' }),
  );
  const agedScammers = ['Customer Care Desk', 'Billing Support Unit'].map((name) =>
    addParty({ name, kind: 'person', ageDays: int(40, 90), language: 'en' }),
  );
  const drops = ['A K Enterprises', 'S M Trading', 'R P Services'].map((name) =>
    addParty({ name, kind: 'person', ageDays: int(15, 40), language: 'en' }),
  );

  // ---------- Opening balances ----------
  const fundAt = ago((HISTORY_DAYS + PRE_HISTORY_DAYS + 1) * DAY);
  for (const p of persons) txn('funding', treasury, p, rupees(60_000, 180_000), 'opening balance', fundAt, 'funding');
  for (const m of [...merchants, ...highValuePayees]) txn('funding', treasury, m, rupees(15_000, 40_000), 'opening balance', fundAt, 'funding');

  // ---------- Legitimate activity ----------
  const favourites = new Map<string, string[]>();
  const contacts = new Map<string, string[]>();
  for (const p of persons) {
    const favs = new Set<string>();
    while (favs.size < int(4, 6)) favs.add(pick(merchants));
    favourites.set(p, [...favs]);
    const friends = new Set<string>();
    while (friends.size < int(3, 5)) {
      const f = pick(persons);
      if (f !== p) friends.add(f);
    }
    contacts.set(p, [...friends]);
  }
  // Asha's favourite shop is the demo merchant, so its collect request is from a known payee.
  favourites.get(asha)![0] = merchants[0];

  const dayOffset = (day: number) => day * DAY + int(2 * HOUR, 20 * HOUR) + int(0, 59) * MIN;

  // People have paid their usual shops and contacts before the evaluated window starts.
  for (const p of persons) {
    for (const shop of favourites.get(p)!) {
      for (let k = 0; k < int(2, 3); k++) {
        txn('pay', p, shop, rupees(40, 1800), pick(NOTES_SHOP), ago(dayOffset(HISTORY_DAYS + int(1, PRE_HISTORY_DAYS - 1))), 'history');
      }
    }
    for (const friend of contacts.get(p)!) {
      txn('pay', p, friend, rupees(100, 3000), pick(NOTES_P2P), ago(dayOffset(HISTORY_DAYS + int(1, PRE_HISTORY_DAYS - 1))), 'history');
    }
  }

  for (const p of persons) {
    const favs = favourites.get(p)!;
    for (let day = 1; day <= HISTORY_DAYS; day++) {
      if (chance(0.75)) {
        const shop = chance(0.9) ? pick(favs) : pick(merchants);
        txn('pay', p, shop, rupees(40, 1800), pick(NOTES_SHOP), ago(dayOffset(day)), 'legit_everyday');
        if (chance(0.06)) {
          txn('pay', p, pick(favs), rupees(40, 900), pick(NOTES_SHOP), ago(dayOffset(day)), 'legit_everyday');
        }
      }
      if (chance(0.2)) {
        txn('pay', p, pick(contacts.get(p)!), rupees(100, 3000), pick(NOTES_P2P), ago(dayOffset(day)), 'legit_p2p');
      }
      if (chance(0.035)) {
        txn('collect', p, pick(favs), rupees(150, 2500), pick(NOTES_COLLECT), ago(dayOffset(day)), 'legit_collect');
      }
    }
  }

  for (let i = 0; i < 18; i++) {
    const p = pick(ordinary);
    txn('collect', p, pick(favourites.get(p)!), rupees(300, 3000), NOTES_COLLECT_TRICKY[i % 3], ago(dayOffset(int(1, 28))), 'legit_collect_tricky_note');
  }

  // High-value legitimate payments: half to an established payee, half first-time.
  for (let i = 0; i < 70; i++) {
    const p = i === 0 ? ravi : pick(ordinary);
    const payee = pick(highValuePayees);
    const bigDay = int(1, 22);
    if (i % 2 === 0) {
      for (let k = 0; k < int(2, 3); k++) {
        txn('pay', p, payee, rupees(500, 2000), 'Maintenance charge', ago(dayOffset(bigDay + 2 + k * 2)), 'legit_everyday');
      }
    }
    txn('pay', p, payee, rupees(8_000, 40_000), pick(NOTES_HIGH_VALUE), ago(dayOffset(bigDay)), 'legit_high_value');
  }

  // Legitimate bursts: several small shop payments within a few minutes.
  for (let i = 0; i < 6; i++) {
    const p = pick(ordinary);
    const start = dayOffset(int(1, 28));
    const n = int(4, 5);
    for (let k = 0; k < n; k++) {
      txn('pay', p, pick(favourites.get(p)!), rupees(50, 600), pick(NOTES_SHOP), ago(start - k * 100_000), 'legit_burst');
    }
  }

  // ---------- Fraud: mule ring ----------
  const pool = [...ordinary];
  const takeVictim = () => pool.splice(Math.floor(rng() * pool.length), 1)[0];
  const extraFund = (account: string, paise: number) =>
    txn('funding', treasury, account, paise, 'opening balance', fundAt, 'funding');

  const victimsPerMule = [16, 7, 6, 6, 5];
  const ringVictims: string[] = [];
  let hubPending = 0;
  let hubInbound = 0;
  const ringEvents: { at: number; mule: string; victim: string; amount: number; note: string }[] = [];
  victimsPerMule.forEach((count, m) => {
    for (let k = 0; k < count; k++) {
      const victim = takeVictim();
      ringVictims.push(victim);
      const amount = rupees(2_000, 25_000);
      extraFund(victim, amount + 60_000_00);
      ringEvents.push({ at: int(40 * MIN, 22 * HOUR), mule: mules[m], victim, amount, note: pick(NOTES_MULE_VICTIM) });
    }
  });
  ringEvents.sort((a, b) => b.at - a.at);
  for (const e of ringEvents) {
    txn('pay', e.victim, e.mule, e.amount, e.note, ago(e.at), 'mule_ring');
    const forward = Math.floor((e.amount * 0.9) / 100) * 100;
    const forwardAt = e.at - int(4, 18) * MIN;
    txn('pay', e.mule, hub, forward, '', ago(forwardAt), 'mule_layering');
    hubPending += forward;
    hubInbound++;
    if (hubInbound % 3 === 0) {
      const out = Math.floor((hubPending * 0.95) / 100) * 100;
      txn('pay', hub, cashout, out, '', ago(forwardAt - int(5, 15) * MIN), 'mule_layering');
      hubPending -= out;
    }
  }

  // ---------- Fraud: refund collect scams ----------
  for (let i = 0; i < 26; i++) {
    const victim = takeVictim();
    extraFund(victim, 60_000_00);
    txn('collect', victim, youngScammers[i % 2], rupees(999, 9_999), NOTES_REFUND[i % NOTES_REFUND.length], ago(int(2 * HOUR, 5 * DAY)), 'refund_collect');
  }
  for (let i = 0; i < 22; i++) {
    const victim = takeVictim();
    extraFund(victim, 60_000_00);
    txn(
      'collect',
      victim,
      agedScammers[i % 2],
      rupees(999, 9_999),
      NOTES_REFUND_PARAPHRASED[i % NOTES_REFUND_PARAPHRASED.length],
      ago(int(2 * HOUR, 12 * DAY)),
      'refund_collect_paraphrased',
    );
  }

  // ---------- Fraud: account-takeover bursts ----------
  for (let i = 0; i < 4; i++) {
    const victim = takeVictim();
    extraFund(victim, rupees(140_000, 150_000));
    const start = int(6 * HOUR, 5 * DAY);
    for (let k = 0; k < 7; k++) {
      txn('pay', victim, drops[k % drops.length], rupees(3_000, 12_000), '', ago(start - k * int(55_000, 75_000)), 'takeover_burst');
    }
  }

  // ---------- Simulate chronologically so balances never go negative ----------
  events.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1));
  const balance = new Map<string, number>();
  const txns: SeedTxn[] = [];
  for (const e of events) {
    if (e.payerAccountId === e.payeeAccountId) continue;
    const have = balance.get(e.payerAccountId) ?? 0;
    if (e.payerAccountId !== treasury && have < e.amountPaise) continue;
    balance.set(e.payerAccountId, have - e.amountPaise);
    balance.set(e.payeeAccountId, (balance.get(e.payeeAccountId) ?? 0) + e.amountPaise);
    txns.push(e);
  }

  // ---------- Requests waiting in the demo inboxes ----------
  const pendingCollects: SeedCollect[] = [
    { id: uuid(), requesterAccountId: mules[0], payerAccountId: asha, amountPaise: 4_999_00, note: 'Refund for your cancelled order #4471', createdAt: ago(6 * MIN) },
    { id: uuid(), requesterAccountId: merchants[0], payerAccountId: asha, amountPaise: 640_00, note: 'Order #2207 payment', createdAt: ago(40 * MIN) },
    { id: uuid(), requesterAccountId: agedScammers[0], payerAccountId: meera, amountPaise: 2_500_00, note: 'Double debit correction - accept to get credit', createdAt: ago(15 * MIN) },
    { id: uuid(), requesterAccountId: favourites.get(ravi)![0], payerAccountId: ravi, amountPaise: 799_00, note: 'Broadband bill', createdAt: ago(55 * MIN) },
  ];

  const counts: Record<string, number> = {
    users: users.length,
    accounts: accounts.length,
    transactions: txns.filter(isLabelled).length,
    history: txns.filter((t) => t.scenario === 'history').length,
    funding: txns.filter((t) => t.type === 'funding').length,
    fraud: txns.filter((t) => t.isFraud).length,
    pendingCollects: pendingCollects.length,
  };
  for (const t of txns) {
    if (isLabelled(t)) counts[`scenario:${t.scenario}`] = (counts[`scenario:${t.scenario}`] ?? 0) + 1;
  }

  return {
    seed,
    anchor,
    users,
    accounts,
    txns,
    pendingCollects,
    ring: { hubAccountId: hub, muleAccountIds: mules, cashoutAccountId: cashout, victimAccountIds: ringVictims },
    counts,
  };
}
