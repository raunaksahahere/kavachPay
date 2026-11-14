import path from 'node:path';
import PDFDocument from 'pdfkit';
import { formatRupees } from '@/config/app';
import { REPORTING_CHANNELS } from '@/config/reporting';
import type { CounterpartyStatement, StatementRow } from './counterparty';

/** Noto fonts (SIL OFL 1.1, see assets/fonts/OFL.txt) so Hindi and Bengali notes render correctly. */
const FONT_DIR = process.env.FONTS_DIR ?? path.resolve(process.cwd(), 'assets/fonts');
const FONTS = {
  latin: 'NotoSans-Regular.ttf',
  bold: 'NotoSans-Bold.ttf',
  deva: 'NotoSansDevanagari-Regular.ttf',
  beng: 'NotoSansBengali-Regular.ttf',
} as const;
type FontName = keyof typeof FONTS;

const INK = '#202127';
const MUTED = '#70717a';
const BORDER = '#dedbd4';
const BRAND = '#58698f';
const DANGER = '#c65b4b';
const WARN = '#a56c13';

const ist = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const istDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
export const formatIst = (d: Date) => `${ist.format(d)} IST`;

function scriptOf(ch: string, current: FontName): FontName {
  const cp = ch.codePointAt(0)!;
  if (cp === 0x0964 || cp === 0x0965 || cp === 0x200c || cp === 0x200d || ch === ' ') return current;
  if (cp >= 0x0900 && cp <= 0x097f) return 'deva';
  if (cp >= 0x0980 && cp <= 0x09ff) return 'beng';
  return current === 'bold' ? 'bold' : 'latin';
}

/** Splits text into runs that one font can draw (Latin, Devanagari, Bengali). */
export function scriptRuns(text: string, base: 'latin' | 'bold' = 'latin'): { font: FontName; text: string }[] {
  const runs: { font: FontName; text: string }[] = [];
  let current: FontName = base;
  for (const ch of text) {
    const next = scriptOf(ch, current === 'deva' || current === 'beng' ? current : base);
    const font = next === 'latin' && base === 'bold' ? 'bold' : next;
    const last = runs.at(-1);
    if (last && last.font === font) last.text += ch;
    else runs.push({ font, text: ch });
    current = font;
  }
  return runs;
}

function statusLabel(r: StatementRow): string {
  if (r.status === 'settled') return 'Completed';
  if (r.status === 'held') return 'On hold';
  if (r.status === 'failed') return r.failureReason === 'cancelled_by_user' ? 'Cancelled' : 'Failed';
  if (r.status === 'reversed') return 'Reversed';
  if (r.status === 'risk_checked') return 'Awaiting confirmation';
  if (r.status === 'confirmed') return 'Processing';
  return 'Started';
}

const COLS = [
  { key: 'when', label: 'Date & time', width: 92 },
  { key: 'dir', label: 'Direction', width: 74 },
  { key: 'amount', label: 'Amount', width: 66, align: 'right' as const },
  { key: 'status', label: 'Status', width: 78 },
  { key: 'risk', label: 'Kavach check', width: 70 },
  { key: 'note', label: 'Note', width: 135 },
] as const;

/** Renders the statement as a PDF. Every value printed comes from the database query. */
export function renderStatementPdf(s: CounterpartyStatement): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 48, bottom: 56, left: 40, right: 40 },
    bufferPages: true,
    info: {
      Title: `Kavach Pay transaction record: ${s.me.vpa} and ${s.counterparty.vpa}`,
      Author: 'Kavach Pay (prototype)',
      Subject: 'Transactions between two accounts, for a fraud complaint',
    },
  });
  for (const [name, file] of Object.entries(FONTS)) doc.registerFont(name, path.join(FONT_DIR, file));

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;

  /** Draws text that may mix scripts, wrapping inside `w`. Returns the height used. */
  function mixed(text: string, x: number, y: number, w: number, opts: { size?: number; bold?: boolean; color?: string; align?: 'left' | 'right' } = {}) {
    const runs = scriptRuns(text || ' ', opts.bold ? 'bold' : 'latin');
    doc.fillColor(opts.color ?? INK).fontSize(opts.size ?? 9);
    const dominant = runs.find((r) => r.font === 'deva' || r.font === 'beng')?.font ?? (opts.bold ? 'bold' : 'latin');
    const h = doc.font(dominant).heightOfString(text || ' ', { width: w });
    runs.forEach((run, i) => {
      doc.font(run.font);
      const last = i === runs.length - 1;
      if (i === 0) doc.text(run.text, x, y, { width: w, continued: !last, align: opts.align ?? 'left' });
      else doc.text(run.text, { continued: !last });
    });
    doc.y = y + h;
    return h;
  }

  function ensure(space: number) {
    if (doc.y + space > bottom()) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      return true;
    }
    return false;
  }

  // ---- Header
  doc.rect(0, 0, doc.page.width, 6).fill(BRAND);
  mixed('KAVACH PAY', left, 26, width, { size: 9, bold: true, color: BRAND });
  mixed('Transaction record between two accounts', left, 40, width, { size: 18, bold: true });
  mixed(`Generated ${formatIst(s.generatedAt)}`, left, 66, width, { size: 9, color: MUTED });
  doc.y = 84;

  const notice =
    'Prototype notice: Kavach Pay is a demonstration app. Payments are simulated on synthetic data and no real bank or money is involved. ' +
    'This document is not a bank statement.';
  const nh = doc.font('latin').fontSize(8.5).heightOfString(notice, { width: width - 20 }) + 14;
  const noticeY = doc.y;
  doc.roundedRect(left, noticeY, width, nh, 6).fill('#fff2d8');
  mixed(notice, left + 10, noticeY + 7, width - 20, { size: 8.5, color: '#6b4a10' });
  doc.y = noticeY + nh + 14;

  // ---- Parties
  const half = (width - 12) / 2;
  const partyBox = (x: number, title: string, p: CounterpartyStatement['me']) => {
    const y = doc.y;
    doc.roundedRect(x, y, half, 64, 6).lineWidth(0.8).strokeColor(BORDER).stroke();
    mixed(title, x + 10, y + 8, half - 20, { size: 7.5, bold: true, color: MUTED });
    mixed(p.name, x + 10, y + 20, half - 20, { size: 11, bold: true });
    mixed(p.vpa, x + 10, y + 36, half - 20, { size: 9, color: BRAND });
    mixed(`Account opened ${istDate.format(p.openedAt)}`, x + 10, y + 49, half - 20, { size: 7.5, color: MUTED });
  };
  const py = doc.y;
  partyBox(left, 'YOUR ACCOUNT', s.me);
  doc.y = py;
  partyBox(left + half + 12, 'OTHER PARTY', s.counterparty);
  doc.y = py + 76;

  // ---- Summary
  const t = s.totals;
  const stats: [string, string][] = [
    ['Transactions', String(t.count)],
    ['You sent (completed)', formatRupees(t.sentPaise)],
    ['You received (completed)', formatRupees(t.receivedPaise)],
    ['Held by Kavach', String(t.held)],
    ['Warned by Kavach', String(t.warned)],
    ['Failed or cancelled', String(t.failedOrCancelled)],
  ];
  const sw = width / stats.length;
  const sy = doc.y;
  stats.forEach(([label, value], i) => {
    mixed(value, left + i * sw, sy, sw - 6, { size: 12, bold: true });
    mixed(label, left + i * sw, sy + 17, sw - 6, { size: 7.5, color: MUTED });
  });
  doc.y = sy + 42;

  // ---- Table
  const drawHead = () => {
    const y = doc.y;
    doc.rect(left, y, width, 18).fill('#f8f6f1');
    let x = left;
    for (const c of COLS) {
      mixed(c.label.toUpperCase(), x + 4, y + 5, c.width - 8, { size: 7, bold: true, color: MUTED, align: 'align' in c ? c.align : 'left' });
      x += c.width;
    }
    doc.y = y + 20;
  };
  mixed('All transactions between these two accounts', left, doc.y, width, { size: 11, bold: true });
  doc.y += 6;
  drawHead();

  if (s.rows.length === 0) {
    mixed('No transactions found.', left + 4, doc.y + 4, width, { size: 9, color: MUTED });
    doc.y += 22;
  }
  for (const r of s.rows) {
    const cells: Record<(typeof COLS)[number]['key'], { text: string; color?: string; bold?: boolean }> = {
      when: { text: formatIst(r.createdAt) },
      dir: { text: `${r.direction === 'sent' ? 'You sent' : 'You received'}${r.type === 'collect' ? ' (collect request)' : ''}` },
      amount: { text: `${r.direction === 'sent' ? '-' : '+'}${formatRupees(r.amountPaise)}`, bold: true },
      status: { text: statusLabel(r), color: r.status === 'held' ? DANGER : undefined },
      risk: {
        text: r.riskDecision ? `${r.riskDecision === 'allow' ? 'Allowed' : r.riskDecision === 'warn' ? 'Warned' : 'Held'} · ${r.riskScore ?? '-'}/100` : 'Not checked',
        color: r.riskDecision === 'hold' ? DANGER : r.riskDecision === 'warn' ? WARN : MUTED,
      },
      note: { text: r.note ? `"${r.note}"` : '-' },
    };
    const heights = COLS.map((c) => {
      const cell = cells[c.key];
      const runs = scriptRuns(cell.text);
      const font = runs.find((x) => x.font !== 'latin')?.font ?? (cell.bold ? 'bold' : 'latin');
      return doc.font(font).fontSize(8.5).heightOfString(cell.text, { width: c.width - 8 });
    });
    const reasons = r.reasons.length ? `Why: ${r.reasons.join(' ')}` : '';
    const reasonH = reasons ? doc.font('latin').fontSize(7.5).heightOfString(reasons, { width: width - COLS[0].width - 8 }) + 4 : 0;
    const rowH = Math.max(...heights) + 10 + reasonH;
    if (ensure(rowH + 4)) drawHead();
    const y = doc.y;
    if (r.id === s.selectedTxnId) doc.rect(left, y, width, rowH).fill('#e9ecfa');
    let x = left;
    for (const c of COLS) {
      const cell = cells[c.key];
      mixed(cell.text, x + 4, y + 5, c.width - 8, { size: 8.5, color: cell.color, bold: cell.bold, align: 'align' in c ? c.align : 'left' });
      x += c.width;
    }
    if (reasons) mixed(reasons, left + COLS[0].width + 4, y + Math.max(...heights) + 7, width - COLS[0].width - 8, { size: 7.5, color: MUTED });
    doc.moveTo(left, y + rowH).lineTo(left + width, y + rowH).lineWidth(0.5).strokeColor(BORDER).stroke();
    doc.y = y + rowH + 1;
  }
  mixed('The highlighted row is the transaction you selected. Times are Indian Standard Time.', left, doc.y + 6, width, { size: 7.5, color: MUTED });
  doc.y += 20;

  // ---- Where to report
  ensure(150);
  mixed('Where to report suspected fraud', left, doc.y, width, { size: 11, bold: true });
  doc.y += 8;
  for (const ch of REPORTING_CHANNELS) {
    ensure(30);
    const y = doc.y;
    mixed(ch.name, left, y, 200, { size: 9, bold: true });
    mixed(ch.url.startsWith('tel:') ? 'Call 1930' : ch.url, left, y + 13, 200, { size: 8.5, color: BRAND });
    if (!ch.url.startsWith('tel:')) doc.link(left, y + 13, 200, 11, ch.url);
    mixed(ch.when, left + 210, y + 2, width - 210, { size: 8.5, color: MUTED });
    doc.y = y + 30;
  }
  mixed('Attach this PDF to your complaint. Keep the original messages, screenshots and payment IDs as well.', left, doc.y + 2, width, { size: 8.5 });

  // ---- Footer on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // the footer sits below the content area; do not trigger a page break
    const y = doc.page.height - 34;
    doc.font('latin').fontSize(7.5).fillColor(MUTED);
    doc.text(`Kavach Pay prototype · synthetic data · ${s.me.vpa} and ${s.counterparty.vpa}`, left, y, { width: width - 60, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, left + width - 60, y, { width: 60, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}
