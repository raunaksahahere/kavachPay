import { ArrowRight, BadgeCheck, Bot, FileCheck2, FlaskConical, Languages, LayoutDashboard, Lock, Network, ShieldAlert, Smartphone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EditorialArt, type EditorialArtKind } from '@/components/editorial-art';
import { HomeAuthNav } from '@/components/home-auth-nav';

export const metadata: Metadata = {
  title: 'Kavach Pay — Stop the scam before money leaves',
};

const STEPS: { kind: EditorialArtKind; step: string; title: string; body: string }[] = [
  {
    kind: 'payment',
    step: '01',
    title: 'You pay or approve a request',
    body: 'Every payment and collect request passes through the shield before any money moves. Nothing settles until it is checked.',
  },
  {
    kind: 'risk',
    step: '02',
    title: 'Rules score the risk',
    body: 'Deterministic rules look at direction mismatch, new payees, unusual amounts, velocity, young accounts and mule patterns, each with a stated reason.',
  },
  {
    kind: 'activity',
    step: '03',
    title: 'Allow, warn or hold',
    body: 'Low risk goes through. Medium risk asks you to confirm actively. High risk is held with a cooling period and a plain-language explanation.',
  },
];

const FEATURES = [
  { Icon: ShieldAlert, title: 'Collect-request guard', body: 'Catches "refund" and "prize" requests that would actually send money out of your account.' },
  { Icon: Languages, title: 'Warnings in your language', body: 'Explanations in English, Hindi and Bengali, grounded in the exact facts that triggered them.' },
  { Icon: Bot, title: 'Gemini scam-message check', body: 'Paste a message or screenshot to spot impersonation, urgency and PIN/OTP requests. AI can only add caution, never approve.' },
  { Icon: Network, title: 'Mule-ring detection', body: 'Fan-in and pass-through patterns surface accounts that collect from many first-time senders.' },
  { Icon: Lock, title: 'Ledger you can trust', body: 'Double-entry bookkeeping, idempotent payments and row-level locking: no double debits, no negative balances.' },
  { Icon: FileCheck2, title: 'Tamper-evident audit', body: 'A hash-chained audit log that analysts can verify end to end with one click.' },
];

export default function HomePage() {
  return (
    <div className="kavach-home">
      <header className="kavach-home-nav">
        <div className="kavach-home-nav__inner">
          <Link href="/" className="kavach-home-nav__brand" aria-label="Kavach Pay home">
            <ShieldMark size={30} />
            <span>
              <strong>Kavach Pay</strong>
              <small>Fraud intelligence</small>
            </span>
          </Link>
          <nav className="kavach-home-nav__links" aria-label="Main">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <Link href="/demo">Demo</Link>
          </nav>
          <div className="kavach-home-nav__auth">
            <HomeAuthNav />
          </div>
        </div>
      </header>

      <main className="kavach-home-main">
        <section className="kavach-analyst-hero kavach-home-hero">
          <div className="kavach-hero-copy">
            <span className="kavach-eyebrow">
              <i /> KAVACH / PAYMENT PROTECTION
            </span>
            <h1>
              The moment before money leaves.
              <br />
              <em>That is where we stop the scam.</em>
            </h1>
            <p>
              A UPI-style payment app with a fraud shield built in. Every payment and collect request is risk-checked first, and when something looks
              wrong you get a clear reason, in your language, before you approve.
            </p>
            <div className="kavach-home-hero__actions">
              <Link href="/sign-up" className="kavach-home-btn kavach-home-btn--accent">
                Get started <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/demo" className="kavach-home-btn kavach-home-btn--ghost">
                <FlaskConical className="h-4 w-4" /> Try a demo account
              </Link>
            </div>
            <div className="kavach-hero-note">
              <span className="kavach-hero-pulse" /> Rules engine decides <b>·</b> AI signals are advisory
            </div>
          </div>
          <div className="kavach-hero-art" aria-hidden="true">
            <div className="kavach-orbit orbit-one" />
            <div className="kavach-orbit orbit-two" />
            <div className="kavach-shield-illustration">
              <svg viewBox="0 0 180 190" role="presentation">
                <path d="M90 12 151 34v49c0 43-25 73-61 94C54 156 29 126 29 83V34z" fill="#ffb52e" stroke="#202127" strokeWidth="5" strokeLinejoin="round" />
                <path d="M90 31 133 47v35c0 31-17 54-43 70-26-16-43-39-43-70V47z" fill="#fffdf7" stroke="#202127" strokeWidth="4" />
                <path d="m66 91 16 16 34-39" fill="none" stroke="#58698f" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="143" cy="31" r="13" fill="#ef765f" stroke="#202127" strokeWidth="4" />
                <path d="m139 31 3 3 6-7" fill="none" stroke="#202127" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>
            <span className="kavach-art-label">
              PAYMENT
              <br />
              PROTECTION / 01
            </span>
          </div>
        </section>

        <section className="kavach-home-example" aria-label="Example warning">
          <div>
            <p className="kavach-eyebrow-text">THE CONFUSION SCAMMERS EXPLOIT</p>
            <h2>A &ldquo;refund&rdquo; that takes money instead.</h2>
            <p>
              Collect requests ask you to pay, but scammers dress them up as refunds, cashback or prizes. Kavach Pay checks the direction of money
              against what the note claims and stops you before you enter your PIN.
            </p>
          </div>
          <div className="kavach-home-warning" role="img" aria-label="Illustration of a held collect request">
            <div className="kavach-home-warning__head">
              <span className="kavach-priority-dot hold" /> Held for your safety
              <span className="kavach-home-warning__tag">Illustration</span>
            </div>
            <strong>Approving a collect request sends money OUT of your account.</strong>
            <p>The note says &ldquo;refund&rdquo;, but approving it would debit you. The payee is new to you and was created recently.</p>
            <div className="kavach-home-warning__actions">
              <span className="kavach-home-btn kavach-home-btn--dark">Don&rsquo;t pay</span>
              <span className="kavach-home-warning__muted">Review reasons</span>
            </div>
          </div>
        </section>

        <section id="how" className="kavach-home-section">
          <div className="kavach-overview__heading">
            <div>
              <p className="kavach-eyebrow-text">HOW IT WORKS</p>
              <h2>Three steps, every payment.</h2>
              <p>The decision is made by deterministic code you can audit, not by a black box.</p>
            </div>
          </div>
          <div className="kavach-home-steps">
            {STEPS.map((s) => (
              <article key={s.step} className="kavach-home-card">
                <EditorialArt kind={s.kind} className="kavach-home-card__art" />
                <span className="kavach-home-card__step">{s.step}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="features" className="kavach-home-section">
          <div className="kavach-overview__heading">
            <div>
              <p className="kavach-eyebrow-text">WHAT&rsquo;S INSIDE</p>
              <h2>Built for people and for risk teams.</h2>
              <p>A payment app for everyday users, and an analyst workspace for the teams who protect them.</p>
            </div>
          </div>
          <div className="kavach-home-features">
            {FEATURES.map(({ Icon, title, body }) => (
              <article key={title} className="kavach-home-feature">
                <span className="kavach-home-feature__icon">
                  <Icon className="h-5 w-5" />
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="kavach-home-audiences">
          <Link href="/app" className="kavach-home-audience">
            <Smartphone className="h-6 w-6" />
            <div>
              <h3>For people who pay</h3>
              <p>First-time and less confident users, elderly family members and small merchants.</p>
            </div>
            <ArrowRight className="kavach-home-audience__arrow h-5 w-5" />
          </Link>
          <Link href="/analyst" className="kavach-home-audience kavach-home-audience--dark">
            <LayoutDashboard className="h-6 w-6" />
            <div>
              <h3>For risk analysts</h3>
              <p>Flagged payments, mule networks, audit verification, evaluation metrics and an AI copilot.</p>
            </div>
            <ArrowRight className="kavach-home-audience__arrow h-5 w-5" />
          </Link>
        </section>

        <section className="kavach-home-cta">
          <div>
            <h2>See the shield in action.</h2>
            <p>Create an account, or try a shared demo account with synthetic money.</p>
          </div>
          <div className="kavach-home-cta__actions">
            <Link href="/sign-up" className="kavach-home-btn kavach-home-btn--accent">
              Sign up <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/sign-in" className="kavach-home-btn kavach-home-btn--outline">
              Sign in
            </Link>
          </div>
        </section>
      </main>

      <footer className="kavach-home-footer">
        <span>
          <BadgeCheck className="h-4 w-4" /> Kavach Pay is a prototype on synthetic data. No real money or bank is involved.
        </span>
        <span>HackMatrix · Fintech &amp; Payments</span>
      </footer>
    </div>
  );
}

function ShieldMark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 180 190" width={size} height={size} aria-hidden>
      <path d="M90 12 151 34v49c0 43-25 73-61 94C54 156 29 126 29 83V34z" fill="#ffb52e" stroke="#202127" strokeWidth="9" strokeLinejoin="round" />
      <path d="m62 92 18 18 38-42" fill="none" stroke="#202127" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
