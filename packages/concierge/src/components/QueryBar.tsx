import { useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  running: boolean;
  onRun: (query: string) => void;
  onGuardrail: (query: string) => void;
  presets: string[];
}

export function QueryBar({ running, onRun, onGuardrail, presets }: Props) {
  const [query, setQuery] = useState('');

  const submit = (guardrail: boolean) => {
    const q = query.trim();
    if (!q || running) return;
    if (guardrail) onGuardrail(q);
    else onRun(q);
  };

  return (
    <div className="paper paper-stamped relative overflow-hidden px-7 py-6">
      {/* Decorative serial number */}
      <div className="absolute right-5 top-4 eyebrow text-ink3">
        №&nbsp;{String(Math.floor(Date.now() / 1000) % 9999).padStart(4, '0')}
      </div>

      <div className="eyebrow mb-2">Today's Assignment</div>

      <div className="flex items-end gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {/* Left pen icon */}
            <svg width="28" height="28" viewBox="0 0 32 32" className="shrink-0 text-ink">
              <path
                d="M4 28 L8 20 L22 6 L26 10 L12 24 L4 28 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path d="M18 10 L22 14" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit(false);
                }
              }}
              placeholder="Dictate your assignment to the concierge…"
              disabled={running}
              className="paper-input w-full"
            />
          </div>
          <hr className="mt-2 border-t border-dashed border-rule" />
        </div>

        <div className="flex items-center gap-2 pb-1">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => submit(true)}
            disabled={running || !query.trim()}
            className="btn-paper"
            title="Run with 0.001 USDC max-per-call — BudgetPolicy will trip"
          >
            ⛨ Guardrail demo
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => submit(false)}
            disabled={running || !query.trim()}
            className="btn-ink"
          >
            File assignment →
          </motion.button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <div className="eyebrow mr-1 self-center">Or pick a classic:</div>
        {presets.map((p, i) => (
          <motion.button
            key={p}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            disabled={running}
            onClick={() => {
              setQuery(p);
              if (!running) onRun(p);
            }}
            className="preset"
            style={{ transform: `rotate(${(i % 2 === 0 ? -0.6 : 0.6).toFixed(1)}deg)` }}
          >
            {p}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
