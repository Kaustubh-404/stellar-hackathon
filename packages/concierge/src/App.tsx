import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConciergeEvent, Payment, Service } from './types';
import { AgentPanel } from './components/AgentPanel';
import { PaymentPanel } from './components/PaymentPanel';
import { DashboardPanel } from './components/DashboardPanel';
import { QueryBar } from './components/QueryBar';

const PRESETS = [
  'Plan a weekend in Tokyo',
  "I'm flying to Paris on Friday — brief me",
  'Give me a morning briefing about Reykjavík',
  'Research the Stellar blockchain and tell me about it',
];

export default function App() {
  const [events, setEvents] = useState<ConciergeEvent[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [finalAnswer, setFinalAnswer] = useState<string>('');
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [network, setNetwork] = useState<string>('testnet');
  const [budgetSet, setBudgetSet] = useState<{
    maxPerCall: number;
    maxDaily: number;
  } | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [guardrailMode, setGuardrailMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const reset = useCallback(() => {
    setEvents([]);
    setServices([]);
    setPayments([]);
    setFinalAnswer('');
    setBudgetSet(null);
    setRemaining(null);
    setError(null);
    setThinking(false);
  }, []);

  const onEvent = useCallback((ev: ConciergeEvent) => {
    setEvents((prev) => [...prev, ev]);
    switch (ev.type) {
      case 'wallet_info':
        setWalletAddress(ev.address);
        setNetwork(ev.network);
        break;
      case 'budget_set':
        setBudgetSet({ maxPerCall: ev.maxPerCall, maxDaily: ev.maxDaily });
        setRemaining(ev.maxDaily);
        break;
      case 'budget_remaining':
        setRemaining(ev.daily);
        break;
      case 'agent_thinking':
        setThinking(true);
        break;
      case 'services_discovered':
        setServices(ev.services);
        setThinking(false);
        break;
      case 'payment_start': {
        const id = `${ev.service}-${ev.at}`;
        const newPayment: Payment = {
          id,
          service: ev.service,
          price: ev.price,
          provider: ev.provider,
          params: ev.params,
          status: 'pending',
          startedAt: ev.at,
        };
        setPayments((prev) => [...prev, newPayment]);
        setThinking(false);
        break;
      }
      case 'payment_settled': {
        setPayments((prev) => {
          const idx = [...prev]
            .reverse()
            .findIndex((p) => p.service === ev.service && p.status === 'pending');
          if (idx === -1) return prev;
          const realIdx = prev.length - 1 - idx;
          const next = [...prev];
          next[realIdx] = {
            ...next[realIdx],
            status: 'settled',
            transaction: ev.transaction,
            receiptId: ev.receiptId,
            settledAt: ev.at,
          };
          return next;
        });
        break;
      }
      case 'budget_exceeded': {
        setPayments((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (last.status !== 'pending') return prev;
          const next = [...prev];
          next[next.length - 1] = { ...last, status: 'failed' };
          return next;
        });
        break;
      }
      case 'final_answer':
        setFinalAnswer(ev.text);
        setThinking(false);
        break;
      case 'agent_error':
      case 'tool_error':
        if ('message' in ev) setError(ev.message);
        break;
    }
  }, []);

  const run = useCallback(
    async (query: string, guardrail: boolean) => {
      if (running) return;
      reset();
      setRunning(true);
      setGuardrailMode(guardrail);
      try {
        const res = await fetch('/api/concierge/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            budgetUsdc: 1.0,
            maxPerCallUsdc: guardrail ? 0.001 : 0.1,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { sessionId } = (await res.json()) as { sessionId: string };

        const es = new EventSource(`/stream/${sessionId}`);
        esRef.current = es;
        es.onmessage = (e) => {
          try {
            onEvent(JSON.parse(e.data));
          } catch {}
        };
        es.addEventListener('done', () => {
          es.close();
          setRunning(false);
          setThinking(false);
        });
        es.onerror = () => {
          es.close();
          setRunning(false);
          setThinking(false);
        };
      } catch (err: any) {
        setError(err.message ?? String(err));
        setRunning(false);
      }
    },
    [running, reset, onEvent],
  );

  useEffect(() => {
    return () => {
      esRef.current?.close();
    };
  }, []);

  const totalSpent = payments
    .filter((p) => p.status === 'settled')
    .reduce((sum, p) => sum + p.price, 0);

  return (
    <div className="min-h-screen w-full">
      {/* Header — editorial masthead */}
      <header className="mx-auto max-w-[1500px] px-8 pt-8">
        <div className="flex items-end justify-between gap-6 border-b border-rule pb-5">
          <div className="flex items-end gap-4">
            {/* Stamped logo */}
            <motion.div
              initial={{ rotate: -6, scale: 0.9, opacity: 0 }}
              animate={{ rotate: -3, scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 140, delay: 0.1 }}
              className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-ink bg-butter shadow-[2px_2px_0_#2a2438]"
            >
              <span className="display text-3xl text-ink" style={{ fontWeight: 900 }}>
                A
              </span>
              <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-ink bg-rose" />
            </motion.div>
            <div>
              <div className="eyebrow mb-1">Issue 001 · Stellar Testnet · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              <h1 className="display text-5xl leading-none">
                <span className="inkflow">AgentPay</span>{' '}
                <span className="italic text-ink2" style={{ fontWeight: 400 }}>
                  Concierge
                </span>
              </h1>
              <p className="mt-2 font-sans text-sm text-ink2">
                A live periodical documenting autonomous agents that discover, pay, and settle
                services on Stellar.
              </p>
            </div>
          </div>

          <div className="flex items-end gap-3">
            {walletAddress && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-end"
              >
                <span className="eyebrow mb-1">Buyer Wallet</span>
                <div className="flex items-center gap-2 rounded-full border border-rule bg-paper px-3 py-1.5">
                  <span className="h-2 w-2 rounded-full bg-mintDeep" />
                  <span className="mono text-xs text-ink">
                    {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
                  </span>
                  <span className="tag tag-lilac">{network}</span>
                </div>
              </motion.div>
            )}
            <motion.div
              animate={running ? { scale: [1, 1.06, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1.4 }}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${
                running
                  ? 'border-mintDeep/40 bg-mint text-mintDeep'
                  : 'border-rule bg-paper text-ink3'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  running ? 'bg-mintDeep animate-pulse' : 'bg-ink3'
                }`}
              />
              <span className="mono text-[10px] font-bold uppercase tracking-widest">
                {running ? 'live edition' : 'press idle'}
              </span>
            </motion.div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-8 py-7">
        <QueryBar
          running={running}
          onRun={(q) => run(q, false)}
          onGuardrail={(q) => run(q, true)}
          presets={PRESETS}
        />

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 rounded-2xl border border-roseDeep/30 bg-rose/40 px-5 py-3"
            >
              <div className="eyebrow text-roseDeep">Editorial note</div>
              <div className="mt-0.5 font-sans text-sm text-ink">{error}</div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-6 grid min-h-[72vh] grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-5">
            <AgentPanel
              thinking={thinking && running}
              events={events}
              finalAnswer={finalAnswer}
            />
          </div>
          <div className="col-span-12 lg:col-span-4">
            <PaymentPanel
              payments={payments}
              totalSpent={totalSpent}
              guardrailMode={guardrailMode}
            />
          </div>
          <div className="col-span-12 lg:col-span-3">
            <DashboardPanel
              services={services}
              payments={payments}
              remaining={remaining}
              budgetSet={budgetSet}
              walletAddress={walletAddress}
              network={network}
            />
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-[1500px] px-8 pb-10">
        <hr className="dashed-rule mb-5" />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="font-sans text-xs text-ink3">
            Printed in-browser on Stellar testnet · x402 Protocol · Soroban smart contracts
          </div>
          <div className="eyebrow">
            &copy; AgentPay · <span className="inkflow font-bold">Concierge</span>
          </div>
        </div>
      </footer>

      {/* Guardrail floating toast — stamp style */}
      <AnimatePresence>
        {guardrailMode && payments.some((p) => p.status === 'failed') && (
          <motion.div
            initial={{ y: 80, opacity: 0, rotate: -2 }}
            animate={{ y: 0, opacity: 1, rotate: -1.5 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-2xl border-2 border-roseDeep bg-rose px-6 py-4 shadow-paperLg"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-roseDeep bg-paper">
                <span className="display text-lg font-bold text-roseDeep">!</span>
              </div>
              <div>
                <div className="display text-base font-bold text-roseDeep">
                  Guardrail tripped
                </div>
                <div className="font-sans text-xs text-ink2">
                  BudgetPolicy rejected the call — enforcement happens on-chain.
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
