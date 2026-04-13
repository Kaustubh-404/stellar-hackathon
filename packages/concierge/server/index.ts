import express, { Request, Response } from 'express';
import cors from 'cors';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { AgentPayClient, BudgetExceededError } from '@agentpay/sdk';

// Load .env from repo root manually (no dotenv dep)
try {
  const envPath = resolve(process.cwd(), '../../.env');
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
} catch {}

const ANTHROPIC_KEY =
  process.env.ANTHROPIC_API_KEY ?? process.env.anthropic_key ?? '';

if (!ANTHROPIC_KEY) {
  console.error('ANTHROPIC_API_KEY (or anthropic_key) must be set in .env');
  process.exit(1);
}

const buyerSecret = process.env.BUYER_SECRET!;
const registryContract = process.env.SERVICE_REGISTRY_CONTRACT!;
const budgetContract = process.env.BUDGET_POLICY_CONTRACT!;
const receiptContract = process.env.RECEIPT_LEDGER_CONTRACT!;

if (!buyerSecret || !registryContract || !budgetContract || !receiptContract) {
  console.error('Missing AgentPay env vars. Check BUYER_SECRET and contract IDs.');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Session management — one streaming session per query
// ---------------------------------------------------------------------------
type Event = { type: string; [k: string]: unknown };

interface Session {
  id: string;
  events: Event[];
  done: boolean;
  clients: Set<Response>;
}

const sessions = new Map<string, Session>();

function emit(session: Session, event: Event) {
  const payload = { ...event, at: Date.now() };
  session.events.push(payload);
  for (const client of session.clients) {
    client.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}

function finish(session: Session) {
  session.done = true;
  for (const client of session.clients) {
    client.write(`event: done\ndata: {}\n\n`);
    client.end();
  }
}

// ---------------------------------------------------------------------------
// Claude tool definitions — map 1:1 onto AgentPay SDK capabilities
// ---------------------------------------------------------------------------
const tools: Anthropic.Tool[] = [
  {
    name: 'discover_services',
    description:
      'Discover all paid AI agent services currently registered on the AgentPay on-chain marketplace. Returns service id, description, category, price per call in USDC, and the provider wallet.',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Optional category filter (e.g. "weather", "research")',
        },
      },
    },
  },
  {
    name: 'get_budget_remaining',
    description:
      'Check how much USDC is still available for spending before the daily/session budget is hit.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'call_service',
    description:
      'Call a paid service from the marketplace. The SDK automatically handles x402 payment on Stellar, verifies settlement, and posts a tamper-proof receipt on-chain. Returns the service response plus a Stellar transaction hash.',
    input_schema: {
      type: 'object',
      properties: {
        service_id: {
          type: 'string',
          description: 'The service id returned by discover_services.',
        },
        params: {
          type: 'object',
          description:
            'Parameters to pass to the service handler. For weather, use {city: "Tokyo"}. For research, use {query: "Tokyo culture"}. For joke, use {category: "Programming"}.',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['service_id'],
    },
  },
  {
    name: 'spending_report',
    description:
      'Get the on-chain spending report — every receipt posted to the ReceiptLedger for this wallet.',
    input_schema: { type: 'object', properties: {} },
  },
];

// ---------------------------------------------------------------------------
// Tool execution — emits events as AgentPay SDK does work
// ---------------------------------------------------------------------------
async function executeTool(
  session: Session,
  client: AgentPayClient,
  name: string,
  input: any,
): Promise<string> {
  emit(session, { type: 'tool_start', tool: name, input });

  try {
    if (name === 'discover_services') {
      const services = await client.discover(
        input?.category ? { category: input.category } : {},
      );
      const mapped = services.map((s) => ({
        id: s.serviceId,
        description: s.description,
        category: s.category,
        pricePerCallUsdc: Number(s.pricePerCall) / 1e7,
        provider: s.provider,
        active: s.active,
      }));
      emit(session, {
        type: 'services_discovered',
        services: mapped,
      });
      return JSON.stringify({ services: mapped });
    }

    if (name === 'get_budget_remaining') {
      const r = await client.getRemaining();
      emit(session, { type: 'budget_remaining', ...r });
      return JSON.stringify(r);
    }

    if (name === 'call_service') {
      const serviceId = input.service_id;
      const params = input.params ?? {};
      // Look up service price for nicer event display
      let price = 0;
      let provider = '';
      try {
        const services = await client.discover();
        const svc = services.find((s) => s.serviceId === serviceId);
        if (svc) {
          price = Number(svc.pricePerCall) / 1e7;
          provider = svc.provider;
        }
      } catch {}
      emit(session, {
        type: 'payment_start',
        service: serviceId,
        price,
        provider,
        params,
      });
      const result = await client.callService(serviceId, params);
      emit(session, {
        type: 'payment_settled',
        service: serviceId,
        price: result.cost,
        transaction: result.transaction,
        receiptId: result.receiptId,
        data: result.data,
      });
      try {
        const r = await client.getRemaining();
        emit(session, { type: 'budget_remaining', ...r });
      } catch {}
      return JSON.stringify(result);
    }

    if (name === 'spending_report') {
      const receipts = await client.getSpendingReport();
      const mapped = receipts.map((r) => ({
        receiptId: r.receiptId,
        serviceId: r.serviceId,
        amountUsdc: Number(r.amount) / 1e7,
        payee: r.payee,
        timestamp: r.timestamp,
      }));
      emit(session, { type: 'spending_report', receipts: mapped });
      return JSON.stringify({ receipts: mapped });
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err: any) {
    if (err instanceof BudgetExceededError) {
      emit(session, {
        type: 'budget_exceeded',
        tool: name,
        message: err.message,
      });
      return JSON.stringify({ error: 'budget_exceeded', message: err.message });
    }
    emit(session, {
      type: 'tool_error',
      tool: name,
      message: err.message ?? String(err),
    });
    return JSON.stringify({ error: err.message ?? String(err) });
  }
}

// ---------------------------------------------------------------------------
// Orchestrator — runs a Claude agentic loop with tool use
// ---------------------------------------------------------------------------
async function runAgent(
  session: Session,
  query: string,
  budgetUsdc: number,
  maxPerCallUsdc: number,
) {
  const client = new AgentPayClient({
    secretKey: buyerSecret,
    network: 'testnet',
    registryContract,
    budgetContract,
    receiptContract,
  });

  emit(session, {
    type: 'wallet_info',
    address: client.address,
    network: 'testnet',
  });

  // Set budget up front — showcases the budget contract
  try {
    await client.setBudget({
      maxPerCall: maxPerCallUsdc,
      maxDaily: budgetUsdc,
    });
    emit(session, {
      type: 'budget_set',
      maxPerCall: maxPerCallUsdc,
      maxDaily: budgetUsdc,
    });
  } catch (err: any) {
    emit(session, { type: 'tool_error', message: `set_budget: ${err.message}` });
  }

  const systemPrompt = `You are the AgentPay Concierge — an autonomous AI assistant that uses a marketplace of paid services on Stellar to help users.

Workflow on every query:
1. Call discover_services to see what is available on the on-chain marketplace.
2. Decide which services are useful for the user's query. Prefer using multiple services when they add value.
3. Before each paid call, optionally check get_budget_remaining so the user can see the guardrail.
4. Call the relevant services in parallel when possible. For weather, pass {city}. For research, pass {query}. For joke, pass {category: "Programming"} or similar.
5. After all tool calls, produce a polished, friendly briefing synthesising the results. Use markdown headings, bullet points, and emphasise the key facts.
6. Finally, call spending_report so the user can see the on-chain audit trail.

IMPORTANT:
- Always call discover_services first — never assume what services exist.
- Use real data from the tool results in your final answer. Never fabricate.
- Keep the final briefing under 300 words but make it genuinely useful.
- You are operating on Stellar testnet with real USDC payments — every call costs real tokens.`;

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: query },
  ];

  let finalText = '';
  for (let iter = 0; iter < 10; iter++) {
    emit(session, { type: 'agent_thinking', iteration: iter });
    let response: Anthropic.Message;
    try {
      response = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 2048,
        system: systemPrompt,
        tools,
        messages,
      });
    } catch (err: any) {
      emit(session, { type: 'agent_error', message: err.message });
      break;
    }

    // Surface any text the model emits along the way
    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        emit(session, { type: 'agent_text', text: block.text });
      }
    }

    if (response.stop_reason === 'end_turn') {
      finalText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      break;
    }

    if (response.stop_reason !== 'tool_use') {
      emit(session, {
        type: 'agent_error',
        message: `Unexpected stop reason: ${response.stop_reason}`,
      });
      break;
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const output = await executeTool(
        session,
        client,
        block.name,
        block.input,
      );
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: output,
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  if (finalText) {
    emit(session, { type: 'final_answer', text: finalText });
  }
  finish(session);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.post('/api/concierge/query', async (req, res) => {
  const { query, budgetUsdc, maxPerCallUsdc } = req.body ?? {};
  if (typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'query is required' });
  }

  const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const session: Session = { id, events: [], done: false, clients: new Set() };
  sessions.set(id, session);

  // Emit initial events so /stream returns something immediately
  emit(session, { type: 'session_started', query });

  // Kick off in background — don't block the HTTP response
  runAgent(
    session,
    query,
    typeof budgetUsdc === 'number' ? budgetUsdc : 1.0,
    typeof maxPerCallUsdc === 'number' ? maxPerCallUsdc : 0.1,
  ).catch((err) => {
    emit(session, { type: 'agent_error', message: err.message ?? String(err) });
    finish(session);
  });

  res.json({ sessionId: id });
});

app.get('/stream/:id', (req: Request, res: Response) => {
  const session = sessions.get(req.params.id as string);
  if (!session) return res.status(404).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Replay any events that already fired before the SSE client connected
  for (const event of session.events) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  if (session.done) {
    res.write(`event: done\ndata: {}\n\n`);
    res.end();
    return;
  }

  session.clients.add(res);
  req.on('close', () => session.clients.delete(res));
});

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', sessions: sessions.size }),
);

const port = Number(process.env.CONCIERGE_PORT ?? 3200);
app.listen(port, () => {
  console.log(`AgentPay Concierge backend running on :${port}`);
  console.log(`  Model: claude-haiku-4-5`);
});
