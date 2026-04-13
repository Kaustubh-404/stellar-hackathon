import { motion } from 'framer-motion';
import { Service, Payment } from '../types';

interface Props {
  services: Service[];
  payments: Payment[];
  remaining: number | null;
  budgetSet: { maxPerCall: number; maxDaily: number } | null;
  walletAddress: string;
  network: string;
}

const CATEGORY_TAG: Record<string, string> = {
  weather: 'tag-sky',
  research: 'tag-lilac',
  entertainment: 'tag-peach',
};

export function DashboardPanel({
  services,
  payments,
  remaining,
  budgetSet,
  walletAddress,
  network,
}: Props) {
  const usedPct =
    budgetSet && remaining !== null
      ? Math.max(0, Math.min(100, ((budgetSet.maxDaily - remaining) / budgetSet.maxDaily) * 100))
      : 0;

  return (
    <div className="flex h-full flex-col gap-5">
      {/* Budget Card */}
      <div className="paper px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="eyebrow">Column III</div>
            <div className="display text-lg">Budget policy</div>
          </div>
          <span className="tag tag-mint">on-chain</span>
        </div>

        {budgetSet ? (
          <>
            <div className="mt-4 flex items-baseline justify-between">
              <div>
                <div className="eyebrow">Remaining</div>
                <div className="display text-3xl font-bold text-ink">
                  {remaining?.toFixed(4) ?? '—'}
                </div>
              </div>
              <div className="text-right">
                <div className="eyebrow">Daily cap</div>
                <div className="mono text-sm font-bold text-ink2">
                  {budgetSet.maxDaily.toFixed(2)}
                </div>
              </div>
            </div>
            <div className="progress-track mt-3 h-2">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${usedPct}%` }}
                transition={{ duration: 0.5 }}
                className="progress-fill"
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="mono text-[10px] uppercase tracking-widest text-ink3">
                per call · {budgetSet.maxPerCall} USDC
              </span>
              <span className="mono text-[10px] uppercase tracking-widest text-ink3">
                {usedPct.toFixed(0)}% used
              </span>
            </div>
          </>
        ) : (
          <div className="mt-3 font-sans text-sm italic text-ink3">Not yet set on-chain.</div>
        )}
      </div>

      {/* Marketplace Card */}
      <div className="paper flex-1 overflow-hidden px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="eyebrow">Marketplace</div>
            <div className="display text-lg">Services</div>
          </div>
          <span className="tag tag-butter">{services.length}</span>
        </div>

        {services.length === 0 ? (
          <div className="mt-4 font-sans text-sm italic text-ink3">
            Awaiting discovery…
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {services.map((s, i) => {
              const calls = payments.filter(
                (p) => p.service === s.id && p.status === 'settled',
              ).length;
              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="rounded-xl border border-rule bg-[#fdfaf4] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="display text-sm font-semibold capitalize text-ink">
                          {s.id}
                        </span>
                        {calls > 0 && (
                          <span className="tag tag-mint">{calls}×</span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate font-sans text-[11px] text-ink2">
                        {s.description}
                      </div>
                      <div className="mt-1.5">
                        <span className={`tag ${CATEGORY_TAG[s.category] ?? 'tag-ink'}`}>
                          {s.category}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="mono text-sm font-bold text-ink">
                        {s.pricePerCallUsdc.toFixed(4)}
                      </div>
                      <div className="mono text-[9px] uppercase text-ink3">USDC</div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Wallet Card */}
      {walletAddress && (
        <div className="paper px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="eyebrow">Correspondent Wallet</div>
            <span className="tag tag-lilac">{network}</span>
          </div>
          <div className="mono mt-2 break-all text-[11px] text-ink">{walletAddress}</div>
          <a
            href={`https://stellar.expert/explorer/testnet/account/${walletAddress}`}
            target="_blank"
            rel="noreferrer"
            className="mono mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-lilacDeep underline decoration-dotted underline-offset-4"
          >
            View on Stellar.expert ↗
          </a>
        </div>
      )}
    </div>
  );
}
