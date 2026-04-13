import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConciergeEvent } from '../types';

interface Props {
  thinking: boolean;
  events: ConciergeEvent[];
  finalAnswer: string;
}

/* --------------------------- tiny markdown --------------------------- */
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const out: JSX.Element[] = [];
  let listBuf: string[] = [];
  const inline = (s: string) =>
    s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  const flushList = (key: string) => {
    if (!listBuf.length) return;
    out.push(
      <ul key={key}>
        {listBuf.map((li, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: inline(li) }} />
        ))}
      </ul>,
    );
    listBuf = [];
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (line.startsWith('### ')) {
      flushList(`l${i}`);
      out.push(<h3 key={i} dangerouslySetInnerHTML={{ __html: inline(line.slice(4)) }} />);
    } else if (line.startsWith('## ')) {
      flushList(`l${i}`);
      out.push(<h2 key={i} dangerouslySetInnerHTML={{ __html: inline(line.slice(3)) }} />);
    } else if (line.startsWith('# ')) {
      flushList(`l${i}`);
      out.push(<h2 key={i} dangerouslySetInnerHTML={{ __html: inline(line.slice(2)) }} />);
    } else if (/^\s*[-*]\s+/.test(line)) {
      listBuf.push(line.replace(/^\s*[-*]\s+/, ''));
    } else if (!line.trim()) {
      flushList(`l${i}`);
    } else {
      flushList(`l${i}`);
      out.push(<p key={i} dangerouslySetInnerHTML={{ __html: inline(line) }} />);
    }
  });
  flushList('end');
  return out;
}

/* --------------------------- glyph per event --------------------------- */
function Glyph({ kind }: { kind: string }) {
  const base =
    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ink/15 font-mono text-[10px] font-bold';
  switch (kind) {
    case 'think':
      return <div className={`${base} bg-lilac text-[#3a2a78]`}>◊</div>;
    case 'tool':
      return <div className={`${base} bg-sky text-[#124a73]`}>◇</div>;
    case 'pay':
      return <div className={`${base} bg-butter text-[#6a4c00]`}>¤</div>;
    case 'settled':
      return <div className={`${base} bg-mint text-[#0f5f3f]`}>✓</div>;
    case 'wallet':
      return <div className={`${base} bg-peach text-[#7a3a12]`}>◉</div>;
    case 'error':
      return <div className={`${base} bg-rose text-[#7a1f36]`}>!</div>;
    case 'info':
    default:
      return <div className={`${base} bg-[#efeaf7] text-ink`}>·</div>;
  }
}

function Row({
  glyph,
  title,
  children,
}: {
  glyph: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-3"
    >
      <Glyph kind={glyph} />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="font-sans text-[13px] font-semibold text-ink">{title}</div>
        {children && <div className="mt-0.5 font-sans text-[12px] text-ink2">{children}</div>}
      </div>
    </motion.div>
  );
}

function EventRow({ ev }: { ev: ConciergeEvent }) {
  switch (ev.type) {
    case 'session_started':
      return (
        <Row glyph="info" title="Assignment received">
          <span className="italic">"{ev.query}"</span>
        </Row>
      );
    case 'wallet_info':
      return (
        <Row glyph="wallet" title="Wallet loaded">
          <span className="mono text-[11px]">
            {ev.address.slice(0, 8)}…{ev.address.slice(-6)}
          </span>
          <span className="tag tag-lilac ml-2">{ev.network}</span>
        </Row>
      );
    case 'budget_set':
      return (
        <Row glyph="settled" title="Budget posted on-chain">
          {ev.maxPerCall} USDC / call · {ev.maxDaily} USDC / day
        </Row>
      );
    case 'agent_thinking':
      return (
        <Row glyph="think" title={`Claude deliberating · iter ${ev.iteration}`}>
          <span className="text-ink3">calling claude-haiku-4-5…</span>
        </Row>
      );
    case 'agent_text':
      return (
        <Row glyph="think" title="Reasoning">
          <span className="italic text-ink">{ev.text}</span>
        </Row>
      );
    case 'tool_start':
      return (
        <Row glyph="tool" title={`tool: ${ev.tool}`}>
          <span className="mono text-[11px] text-ink3">
            {JSON.stringify(ev.input).slice(0, 120)}
          </span>
        </Row>
      );
    case 'services_discovered':
      return (
        <Row glyph="settled" title="Marketplace discovered">
          {ev.services.length} services on registry
        </Row>
      );
    case 'budget_remaining':
      return (
        <Row glyph="info" title="Budget checked">
          {ev.daily.toFixed(4)} USDC remaining
        </Row>
      );
    case 'payment_start':
      return (
        <Row glyph="pay" title={`paying ${ev.service}`}>
          <span className="mono text-[11px]">{ev.price.toFixed(4)} USDC</span>
        </Row>
      );
    case 'payment_settled':
      return (
        <Row glyph="settled" title={`${ev.service} settled`}>
          {ev.transaction && (
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${ev.transaction}`}
              target="_blank"
              rel="noreferrer"
              className="mono text-[11px]"
            >
              {ev.transaction.slice(0, 10)}…
            </a>
          )}
        </Row>
      );
    case 'spending_report':
      return (
        <Row glyph="settled" title="On-chain receipts">
          {ev.receipts.length} receipts in ledger
        </Row>
      );
    case 'budget_exceeded':
      return (
        <Row glyph="error" title="Budget guardrail tripped">
          <span className="text-roseDeep">{ev.message}</span>
        </Row>
      );
    case 'tool_error':
    case 'agent_error':
      return (
        <Row glyph="error" title="Error">
          <span className="text-roseDeep">{ev.message}</span>
        </Row>
      );
    default:
      return null;
  }
}

export function AgentPanel({ thinking, events, finalAnswer }: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [events.length]);

  return (
    <div className="paper flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-rule px-6 py-4">
        <div>
          <div className="eyebrow">Column I</div>
          <div className="display text-xl">Field dispatch</div>
        </div>
        <AnimatePresence>
          {thinking && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
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
              <span className="eyebrow text-lilacDeep">thinking</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
        {events.length === 0 && !finalAnswer && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <svg width="60" height="60" viewBox="0 0 64 64" className="text-rule">
              <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
              <path d="M22 32 L42 32 M32 22 L32 42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <div className="font-sans text-sm text-ink3">
              File an assignment to begin the dispatch.
            </div>
          </div>
        )}
        {events.map((ev, i) => (
          <EventRow key={i} ev={ev} />
        ))}
      </div>

      <AnimatePresence>
        {finalAnswer && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-t border-rule bg-[#fdfaf4] px-6 py-5"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="tag tag-butter">Final briefing</span>
              <hr className="dashed-rule flex-1" />
            </div>
            <div className="prose-paper max-h-[32vh] overflow-y-auto pr-2">
              {renderMarkdown(finalAnswer)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
