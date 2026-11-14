#!/usr/bin/env node
// Builds Kavach-Pay-Idea.pdf from docs/idea-brief.md.
//
//   node scripts/build-idea-pdf.mjs                # writes to the Desktop
//   node scripts/build-idea-pdf.mjs --out ./x.pdf  # custom output path
//   node scripts/build-idea-pdf.mjs --html-only    # also keep the intermediate HTML
//
// No npm dependencies: a small Markdown-subset renderer plus headless Chrome
// for printing. Set CHROME_PATH if Chrome/Chromium is not on PATH.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = join(root, 'docs');
const sourcePath = join(docsDir, 'idea-brief.md');

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const keepHtml = args.includes('--html-only') || args.includes('--keep-html');

function desktopDir() {
  try {
    const dir = execFileSync('xdg-user-dir', ['DESKTOP'], { encoding: 'utf8' }).trim();
    if (dir && existsSync(dir)) return dir;
  } catch {
    // xdg-user-dir is missing on macOS and Windows; fall through.
  }
  return join(homedir(), 'Desktop');
}

const outPath =
  outFlag >= 0 && args[outFlag + 1]
    ? resolve(args[outFlag + 1])
    : join(desktopDir(), 'Kavach-Pay-Idea.pdf');

// ---------- Markdown subset ----------

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(text) {
  let s = esc(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  // Citation markers such as [2] or [2][7] become superscripts.
  s = s.replace(/(?:\s?\[\d{1,2}\])+/g, (m) => {
    const nums = [...m.matchAll(/\[(\d{1,2})\]/g)].map((x) => x[1]);
    return `<sup class="cite">${nums.join(',')}</sup>`;
  });
  // Bare URLs (used in the sources list).
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, '$1<a href="$2">$2</a>');
  return s;
}

function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { meta: {}, body: md };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: md.slice(m[0].length) };
}

function renderTable(rows) {
  const cells = (line) =>
    line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  return (
    '<table><thead><tr>' +
    head.map((c) => `<th>${inline(c)}</th>`).join('') +
    '</tr></thead><tbody>' +
    body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
    '</tbody></table>'
  );
}

function renderBody(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  let sectionOpen = false;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trim() === '<!-- pagebreak -->') {
      out.push('<div class="pagebreak"></div>');
      i++;
      continue;
    }
    if (line.startsWith(':::stats')) {
      const cards = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(':::')) {
        const [value, label] = lines[i].split('|').map((x) => x.trim());
        if (value && label) {
          cards.push(
            `<div class="stat"><div class="stat-value">${esc(value)}</div><div class="stat-label">${inline(label)}</div></div>`,
          );
        }
        i++;
      }
      i++;
      out.push(`<div class="stats">${cards.join('')}</div>`);
      continue;
    }
    if (line.startsWith('# ')) {
      if (sectionOpen) out.push('</section>');
      const title = line.slice(2).trim();
      const cls = title.toLowerCase() === 'sources' ? 'sources' : '';
      out.push(`<section class="${cls}"><h1>${inline(title)}</h1>`);
      sectionOpen = true;
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      out.push(`<h2>${inline(line.slice(3).trim())}</h2>`);
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      out.push(`<h3>${inline(line.slice(4).trim())}</h3>`);
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      out.push(renderTable(rows));
      continue;
    }
    if (line.startsWith('> ')) {
      const parts = [];
      while (i < lines.length && lines[i].startsWith('> ')) parts.push(lines[i++].slice(2));
      out.push(`<div class="callout">${inline(parts.join(' '))}</div>`);
      continue;
    }
    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (img) {
      const file = join(docsDir, img[2]);
      const svg = readFileSync(file, 'utf8').replace(/<\?xml[^>]*\?>/, '');
      out.push(`<figure>${svg}<figcaption>${inline(img[1])}</figcaption></figure>`);
      i++;
      continue;
    }
    if (/^- /.test(line)) {
      const items = [];
      while (i < lines.length && /^- /.test(lines[i])) items.push(lines[i++].slice(2));
      out.push('<ul>' + items.map((x) => `<li>${inline(x)}</li>`).join('') + '</ul>');
      continue;
    }
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i++].replace(/^\d+\. /, ''));
      }
      out.push('<ol>' + items.map((x) => `<li>${inline(x)}</li>`).join('') + '</ol>');
      continue;
    }
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3} |\||> |- |\d+\. |:::|!\[|<!--)/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  if (sectionOpen) out.push('</section>');
  return out.join('\n');
}

// ---------- Page template ----------

const shield = `<svg viewBox="0 0 64 64" width="92" height="92" aria-hidden="true">
  <path d="M32 4 56 12v18c0 16-10 26-24 30C18 56 8 46 8 30V12z" fill="#14b8a6"/>
  <path d="M32 9.5 51 16v14c0 13-8 21.5-19 25z" fill="#0f766e"/>
  <path d="m21 31 8 8 15-16" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function cover(meta) {
  const rows = [
    ['Hackathon', meta.hackathon],
    ['Track', meta.track],
    ['Team', meta.team],
    ['Members', meta.members],
    ['AI', meta.ai],
    ['Date', meta.date],
  ].filter(([, v]) => v);
  return `<div class="cover">
  <div class="cover-top">
    ${shield}
    <div class="cover-kicker">Idea brief</div>
    <h1 class="cover-title">${esc(meta.title ?? '')}</h1>
    <p class="cover-tagline">${esc(meta.tagline ?? '')}</p>
  </div>
  <dl class="cover-meta">
    ${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('\n    ')}
  </dl>
</div>`;
}

const css = `
@page { size: A4; margin: 17mm 17mm 19mm;
  @bottom-left { content: "Kavach Pay · idea brief"; font: 8pt Inter, "Noto Sans", sans-serif; color: #64748b; }
  @bottom-right { content: "Page " counter(page); font: 8pt Inter, "Noto Sans", sans-serif; color: #64748b; } }
@page cover { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: Inter, "Noto Sans", "DejaVu Sans", sans-serif; font-size: 9.6pt; line-height: 1.48; color: #1e293b; }
a { color: #0f766e; text-decoration: none; overflow-wrap: anywhere; }
code { font-family: "DejaVu Sans Mono", "Liberation Mono", monospace; font-size: 8.4pt; background: #f1f5f9; padding: 0.5pt 3pt; border-radius: 3pt; }
sup.cite { font-size: 6.6pt; color: #0f766e; font-weight: 600; margin-left: 1pt; }

.cover { page: cover; height: 297mm; break-after: page; background: #0f2a4a; color: #fff; padding: 34mm 24mm 26mm; display: flex; flex-direction: column; justify-content: space-between; }
.cover-kicker { margin-top: 16mm; font-size: 10pt; letter-spacing: 0.22em; text-transform: uppercase; color: #5eead4; font-weight: 600; }
.cover-title { font-size: 54pt; line-height: 1.05; margin: 5mm 0 7mm; padding: 0; border: 0; color: #ffffff; font-weight: 800; letter-spacing: -0.02em; }
.cover-tagline { font-size: 16pt; line-height: 1.35; color: #cbd5e1; max-width: 135mm; margin: 0; }
.cover-meta { margin: 0; border-top: 1px solid #334e6f; padding-top: 7mm; display: grid; grid-template-columns: 1fr 1fr; gap: 5mm 10mm; }
.cover-meta dt { font-size: 7.6pt; letter-spacing: 0.16em; text-transform: uppercase; color: #5eead4; margin-bottom: 1mm; }
.cover-meta dd { margin: 0; font-size: 11pt; color: #f1f5f9; }

section { margin-bottom: 6.5mm; }
h1 { font-size: 16pt; line-height: 1.2; color: #0f2a4a; margin: 0 0 3mm; padding-left: 3.4mm; border-left: 1.6mm solid #14b8a6; break-after: avoid; font-weight: 750; letter-spacing: -0.01em; }
h2 { font-size: 11.6pt; color: #0f2a4a; margin: 5mm 0 2mm; break-after: avoid; }
h3 { font-size: 10pt; color: #0f2a4a; margin: 4mm 0 1.5mm; break-after: avoid; }
p { margin: 0 0 2.6mm; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 2.8mm; padding-left: 5.2mm; }
li { margin-bottom: 1.3mm; break-inside: avoid; }
li::marker { color: #0f766e; font-weight: 600; }

.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin: 3.5mm 0 4.5mm; break-inside: avoid; }
.stat { border: 1px solid #cbd5e1; border-top: 1.1mm solid #14b8a6; border-radius: 2mm; padding: 3mm 3mm 2.6mm; background: #f8fafc; }
.stat-value { font-size: 15pt; font-weight: 800; color: #0f2a4a; letter-spacing: -0.01em; line-height: 1.15; }
.stat-label { font-size: 8pt; line-height: 1.35; color: #475569; margin-top: 1.4mm; }

table { width: 100%; border-collapse: collapse; margin: 1mm 0 3.6mm; font-size: 8.6pt; line-height: 1.38; }
tr { break-inside: avoid; }
th { background: #0f2a4a; color: #fff; text-align: left; font-weight: 600; padding: 1.7mm 2.4mm; }
td { padding: 1.7mm 2.4mm; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
tbody tr:nth-child(even) td { background: #f8fafc; }
td:first-child { font-weight: 600; color: #0f2a4a; }

.callout { border-left: 1.4mm solid #f59e0b; background: #fffbeb; padding: 3mm 4mm; margin: 1.5mm 0 3.6mm; border-radius: 0 2mm 2mm 0; break-inside: avoid; }
figure { margin: 3mm 0 4mm; break-inside: avoid; }
figure svg { width: 84%; height: auto; display: block; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 2mm; padding: 2mm; background: #fff; }
figcaption { font-size: 8pt; color: #64748b; margin-top: 1.6mm; text-align: center; }
.pagebreak { break-after: page; }
.sources ol { font-size: 8pt; line-height: 1.4; }
.sources li { margin-bottom: 1mm; }
.sources p { font-size: 8pt; color: #475569; }
`;

// ---------- Build ----------

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const c of candidates) {
    const probe = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (probe.status === 0) return c;
  }
  throw new Error('Chrome or Chromium not found. Install one or set CHROME_PATH.');
}

const { meta, body } = parseFrontmatter(readFileSync(sourcePath, 'utf8'));
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(meta.title ?? 'Idea brief')} — idea brief</title>
<style>${css}</style></head>
<body>
${cover(meta)}
<main>
${renderBody(body)}
</main>
</body></html>`;

const workDir = mkdtempSync(join(tmpdir(), 'kavach-pdf-'));
const htmlPath = join(workDir, 'idea-brief.html');
writeFileSync(htmlPath, html);

const chrome = findChrome();
const run = (extra) =>
  spawnSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      ...extra,
      '--no-pdf-header-footer',
      `--print-to-pdf=${outPath}`,
      pathToFileURL(htmlPath).href,
    ],
    { encoding: 'utf8' },
  );

let result = run([]);
if (result.status !== 0 || !existsSync(outPath)) result = run(['--no-sandbox']);
if (result.status !== 0 || !existsSync(outPath)) {
  console.error(result.stderr);
  throw new Error('Chrome failed to print the PDF.');
}

console.log(`PDF written to ${outPath}`);
if (keepHtml) console.log(`HTML kept at ${htmlPath}`);
