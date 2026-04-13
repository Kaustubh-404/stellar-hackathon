#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AgentPayClient } from '@agentpay/sdk';
import { z } from 'zod';

const secretKey = process.env.STELLAR_SECRET ?? process.env.BUYER_SECRET;
const registryContract = process.env.SERVICE_REGISTRY_CONTRACT;
const budgetContract = process.env.BUDGET_POLICY_CONTRACT;
const receiptContract = process.env.RECEIPT_LEDGER_CONTRACT;
const network = (process.env.STELLAR_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';

if (!secretKey || !registryContract || !budgetContract || !receiptContract) {
  console.error(
    'Missing env vars. Required: STELLAR_SECRET (or BUYER_SECRET), SERVICE_REGISTRY_CONTRACT, BUDGET_POLICY_CONTRACT, RECEIPT_LEDGER_CONTRACT',
  );
  process.exit(1);
}

const client = new AgentPayClient({
  secretKey,
  network,
  registryContract,
  budgetContract,
  receiptContract,
});

const server = new McpServer({
  name: 'agentpay',
  version: '0.1.0',
});

// --- Tool: discover services ---
server.tool(
  'discover_services',
  'Discover available paid AI agent services on the Stellar network. Browse by category or list all.',
  {
    category: z.string().optional().describe('Filter by category (e.g. "weather", "research", "general")'),
    limit: z.number().optional().describe('Max results to return (default 20)'),
  },
  async ({ category, limit }) => {
    const services = await client.discover({ category, limit });
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              services: services.map((s) => ({
                id: s.serviceId,
                provider: s.provider,
                endpoint: s.endpointUrl,
                price: `${Number(s.pricePerCall) / 1e7} USDC`,
                category: s.category,
                description: s.description,
                active: s.active,
                totalCalls: Number(s.totalCalls),
              })),
              count: services.length,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// --- Tool: call a paid service ---
server.tool(
  'call_service',
  'Call a paid AI agent service. Automatically handles x402 payment on Stellar. Returns the service response and payment receipt.',
  {
    service_id: z.string().describe('The service ID to call (from discover_services)'),
    params: z.record(z.string(), z.string()).optional().describe('Parameters to pass to the service'),
  },
  async ({ service_id, params }) => {
    const result = await client.callService(service_id, params ?? {});
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              data: result.data,
              cost: `${result.cost} USDC`,
              receiptId: result.receiptId,
              transaction: result.transaction,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// --- Tool: set spending budget ---
server.tool(
  'set_budget',
  'Set spending limits for paid service calls. Protects against overspending.',
  {
    max_per_call: z.number().optional().describe('Max USDC per single call'),
    max_per_session: z.number().optional().describe('Max USDC per session'),
    max_daily: z.number().optional().describe('Max USDC per day'),
  },
  async ({ max_per_call, max_per_session, max_daily }) => {
    await client.setBudget({
      maxPerCall: max_per_call,
      maxPerSession: max_per_session,
      maxDaily: max_daily,
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            budget: {
              maxPerCall: max_per_call ? `${max_per_call} USDC` : 'unlimited',
              maxPerSession: max_per_session ? `${max_per_session} USDC` : 'unlimited',
              maxDaily: max_daily ? `${max_daily} USDC` : 'unlimited',
            },
          }, null, 2),
        },
      ],
    };
  },
);

// --- Tool: check remaining budget ---
server.tool(
  'get_budget_remaining',
  'Check how much spending budget remains for the current session and day.',
  {},
  async () => {
    const remaining = await client.getRemaining();
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            daily: remaining.daily === -1 ? 'unlimited' : `${remaining.daily} USDC`,
            session: remaining.session === -1 ? 'unlimited' : `${remaining.session} USDC`,
          }, null, 2),
        },
      ],
    };
  },
);

// --- Tool: get spending report ---
server.tool(
  'spending_report',
  'Get a report of recent payments made to AI agent services, with on-chain receipts.',
  {
    limit: z.number().optional().describe('Number of recent transactions (default 10)'),
  },
  async ({ limit }) => {
    const receipts = await client.getSpendingReport(limit ?? 10);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            receipts: receipts.map((r) => ({
              receiptId: r.receiptId,
              service: r.serviceId,
              amount: `${Number(r.amount) / 1e7} USDC`,
              payee: r.payee,
              timestamp: new Date(r.timestamp * 1000).toISOString(),
              status: r.status === 0 ? 'confirmed' : 'disputed',
            })),
            total: receipts.length,
          }, null, 2),
        },
      ],
    };
  },
);

// --- Tool: wallet info ---
server.tool(
  'wallet_info',
  'Get the current wallet address and network info for AgentPay.',
  {},
  async () => {
    const info = await client.getWalletInfo();
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(info, null, 2),
        },
      ],
    };
  },
);

// --- Tool: x402 fetch ---
server.tool(
  'x402_fetch',
  'Make an HTTP request with automatic x402 payment. Use this to access any 402-gated endpoint on Stellar.',
  {
    url: z.string().describe('The URL to fetch'),
    method: z.string().optional().describe('HTTP method (default GET)'),
    body: z.string().optional().describe('Request body (for POST/PUT)'),
  },
  async ({ url, method, body }) => {
    const init: RequestInit = {};
    if (method) init.method = method;
    if (body) {
      init.body = body;
      init.headers = { 'Content-Type': 'application/json' };
    }
    const response = await client.x402Fetch(url, init);
    const text = await response.text();
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            status: response.status,
            data: tryParseJson(text),
          }, null, 2),
        },
      ],
    };
  },
);

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
