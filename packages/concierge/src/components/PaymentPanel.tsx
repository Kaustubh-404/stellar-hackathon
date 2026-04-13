import { motion, AnimatePresence } from 'framer-motion';
import { Payment } from '../types';

interface Props {
  payments: Payment[];
  totalSpent: number;
  guardrailMode: boolean;
}

function StatusGlyph({ status }: { status: Payment['status'] }) {
  if (status === 'pending') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18">
        <circle
          cx="9"
          cy="9"
          r="7"
          fill="none"
          stroke="var(--lilacDeep)"
          strokeWidth="2"
          strokeDasharray="8 8"
          strokeLinecap="round"
          className="animate-dash"
        />
      </svg>
    );
  }
  if (status === 'settled') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18">
        <circle cx="9" cy="9" r="8" fill="var(--mint)" stroke="var(--mintDeep)" strokeWidth="1.5" />
        <path
          d="M5 9 L8 12 L13 6"
          fill="none"
          stroke="var(--mintDeep)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <circle cx="9" cy="9" r="8" fill="var(--rose)" stroke="var(--roseDeep)" strokeWidth="1.5" />
      <path d="M5 5 L13 13 M13 5 L5 13" stroke="var(--roseDeep)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PaymentPanel({ payments, totalSpent, guardrailMode }: Props) {
  const settled = payments.filter((p) => p.status === 'settled').length;
  const pending = payments.filter((p) => p.status === 'pending').length;
  const failed = payments.filter((p) => p.status === 'failed').length;

  return (
    <div className="paper flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-rule px-6 py-4">
        <div>
          <div className="eyebrow">Column II</div>
          <div className="display text-xl">Ledger, live</div>
        </div>
        {guardrailMode && <span className="tag tag-rose">Guardrail</span>}
      </div>

      {/* Hero total — big serif number */}
      <div className="border-b border-rule px-6 py-6">
        <div className="eyebrow">Total spent this edition</div>
        <div className="mt-1 flex items-baseline gap-3">
          <motion.div
            key={totalSpent}
            initial={{ scale: 1.15 }}
            animate={{ scale: 1 }}
            className="display text-[3.2rem] font-bold leading-none text-ink"
          >
            {totalSpent.toFixed(4)}
          </motion.div>
          <span className="mono text-xs font-bold uppercase tracking-widest text-ink3">
            USDC
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          <span className="tag tag-mint">{settled} settled</span>
          {pending > 0 && <span className="tag tag-lilac">{pending} pending</span>}
          {failed > 0 && <span className="tag tag-rose">{failed} failed</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {payments.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <svg width="60" height="60" viewBox="0 0 64 64" className="text-rule">
              <rect x="10" y="14" width="44" height="36" rx="4" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" />
              <path d="M10 26 L54 26" stroke="currentColor" strokeWidth="2" />
              <circle cx="18" cy="38" r="2" fill="currentColor" />
            </svg>
            <div className="font-sans text-sm text-ink3">
              Ledger entries will be stamped here as payments clear.
            </div>
          </div>
        )}

        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {payments.map((p, idx) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="relative rounded-2xl border border-rule bg-[#fdfaf4] p-4"
                style={{ transform: `rotate(${idx % 2 === 0 ? -0.3 : 0.3}deg)` }}
              >
                {/* Ticket notches */}
                <span className="absolute left-[-6px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-rule bg-cream" />
                <span className="absolute right-[-6px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-rule bg-cream" />

                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <StatusGlyph status={p.status} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="display text-base font-semibold capitalize text-ink">
                          {p.service}
                        </span>
                        <span
                          className={`tag ${
                            p.service === 'weather'
                              ? 'tag-sky'
                              : p.service === 'research'
                              ? 'tag-lilac'
                              : 'tag-peach'
                          }`}
                        >
                          {p.service}
                        </span>
                      </div>
                      {Object.keys(p.params).length > 0 && (
                        <div className="mono mt-1 truncate text-[11px] text-ink3">
                          {Object.entries(p.params)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="mono text-lg font-bold text-ink">{p.price.toFixed(4)}</div>
                    <div className="mono text-[9px] uppercase tracking-widest text-ink3">
                      USDC
                    </div>
                  </div>
                </div>

                {p.status === 'settled' && p.transaction && (
                  <div className="mt-3 flex items-center justify-between border-t border-dashed border-rule pt-2">
                    <div className="eyebrow">Settled on Stellar</div>
                    <a
                      href={`https://stellar.expert/explorer/testnet/tx/${p.transaction}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mono text-[11px] text-lilacDeep underline decoration-dotted underline-offset-4"
                    >
                      {p.transaction.slice(0, 10)}… ↗
                    </a>
                  </div>
                )}

                {p.status === 'settled' && p.receiptId && (
                  <div className="mono mt-1 text-[10px] text-ink3">
                    receipt #{p.receiptId.slice(0, 14)}…
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
