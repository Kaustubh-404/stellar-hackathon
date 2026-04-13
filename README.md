# AgentPay

**Turn any AI agent into a paid service on Stellar — in one command.**

AgentPay is the **seller toolkit for the agent economy**. While others build "agents that pay," we build the infrastructure that lets agents **get paid**. A developer wraps an async function with our SDK, it auto-registers on Stellar, and from that moment on any other agent in the world can discover it, pay it in USDC, and walk away with a tamper-proof on-chain receipt.

```bash
npx agentpay serve --skill weather --handler ./weather.ts --price 0.01
```

One command gives you:

- A funded Stellar wallet (auto-generated or bring your own)
- An Express server with x402 payment gating
- On-chain service registration (Soroban ServiceRegistry)
- Automatic USDC payments via the x402 protocol
- On-chain receipts for every call (ReceiptLedger)
- Programmable spending caps enforced by BudgetPolicy
- Reputation scoring via AgentRep

---

## Table of Contents

1. [Why AgentPay](#why-agentpay)
2. [Architecture](#architecture)
3. [What's Inside](#whats-inside)
4. [Deployed Contracts (Testnet)](#deployed-contracts-testnet)
5. [Local Setup](#local-setup)
6. [Running the Demo](#running-the-demo)
7. [Seller Quick Start](#seller-quick-start)
8. [Buyer Quick Start](#buyer-quick-start)
9. [MCP Integration](#mcp-integration)
10. [How Payments Work (x402)](#how-payments-work-x402)
11. [Smart Contract Reference](#smart-contract-reference)
12. [Tech Stack](#tech-stack)
13. [Security Model](#security-model)
14. [License](#license)

---

## Why AgentPay

AI agents are becoming autonomous buyers, but the payment rails they need don't exist. Stripe was built for humans — KYC, chargebacks, 2.9% + 30¢ — none of that works for a $0.001 weather call made by a bot at 3am. Builders keep reinventing half-broken billing loops.

AgentPay collapses four missing primitives into one SDK:

- **Discovery** — an on-chain registry every agent can query
- **Payment** — x402 over Stellar, sub-cent fees, near-instant finality
- **Trust** — append-only receipts, verifiable by buyer and seller forever
- **Guardrails** — per-call and per-day caps enforced by a contract, not a JS check

Every other project builds an agent that *spends* money. We build the infrastructure that lets agents *earn* money.

---

## Architecture

```
Seller Side (our differentiator)         Buyer Side
┌──────────────────────────┐    ┌──────────────────────────┐
│  agentpay serve          │    │  MCP Server              │
│  --skill research        │    │  ┌────────────────────┐  │
│  --handler ./agent.ts    │    │  │ discover_services  │  │
│  --price 0.05            │    │  │ call_service       │  │
│                          │    │  │ set_budget         │  │
│  ┌────────────────────┐  │    │  │ spending_report    │  │
│  │ x402 Payment Gate  │◄─┼────┼──│ x402_fetch         │  │
│  │ Verify → Settle    │  │    │  └────────────────────┘  │
│  └────────┬───────────┘  │    └──────────────────────────┘
│           │              │                    │
│  ┌────────▼───────────┐  │    ┌───────────────▼──────────┐
│  │ Execute Handler    │  │    │ AgentPayClient (SDK)     │
│  └────────┬───────────┘  │    │ - x402 auto-pay          │
│           │              │    │ - Budget enforcement     │
│  ┌────────▼───────────┐  │    │ - Receipt tracking       │
│  │ Post Receipt       │  │    └──────────────────────────┘
│  └────────────────────┘  │
└──────────────────────────┘
            │
   Stellar Testnet (Soroban)
   ┌────────────────────────────────────────────────────────┐
   │ ServiceRegistry │ BudgetPolicy │ ReceiptLedger │ AgentRep │
   └────────────────────────────────────────────────────────┘
```

Three layers:

- **On-chain layer (Stellar Soroban).** Four contracts: ServiceRegistry (catalog), BudgetPolicy (spending caps), ReceiptLedger (immutable proof of delivery), AgentRep (reputation scores).
- **Protocol layer (TypeScript SDK).** `AgentPayServer` wraps any async function into an x402-compliant HTTP endpoint. `AgentPayClient` handles discovery, payment signing, settlement, and receipt verification.
- **Agent layer.** The Concierge demo runs a Claude Haiku 4.5 loop with four tools. Claude decides what to buy; the SDK moves the money.

---

## What's Inside

| Package / Contract              | Description                                                                 |
| ------------------------------- | --------------------------------------------------------------------------- |
| `contracts/service-registry`    | Soroban — on-chain catalog of paid agent services                           |
| `contracts/budget-policy`       | Soroban — programmable spending limits (per-call, daily)                    |
| `contracts/receipt-ledger`      | Soroban — on-chain proof of payment + delivery                              |
| `contracts/agent-rep`           | Soroban — reputation scores for buyer and seller agents                     |
| `packages/sdk`                  | TypeScript SDK — `AgentPayServer` + `AgentPayClient` + `agentpay serve` CLI |
| `packages/mcp-server`           | MCP server — 7 tools for AI agents to discover, pay, and budget             |
| `packages/api`                  | REST gateway + real-time revenue dashboard                                  |
| `packages/concierge`            | Live editorial dashboard — Claude Haiku 4.5 spending real USDC              |
| `demo/weather-agent`            | Demo seller — weather forecasts                                             |
| `demo/research-agent`           | Demo seller — Wikipedia topic summarizer                                    |
| `demo/joke-agent`               | Demo seller — programming jokes                                             |
| `demo/buyer-agent`              | Demo buyer — scripted end-to-end test                                       |

---

## Deployed Contracts (Testnet)

| Contract         | Contract ID                                                  |
| ---------------- | ------------------------------------------------------------ |
| ServiceRegistry  | `CDMOBDEU534CZGU5EKHD6IYMQDBB3NH76B5RIGCABAOCJYIAKQMM7HJF`   |
| BudgetPolicy     | `CBKTPZKT35WZECDSBA2CCZGERCUAJFAID32E45O2MYTX4BWIFZBEY2WF`   |
| ReceiptLedger    | `CAPXJFLGSESJV2VNNUZCGQZCMNFYQLNT5QJKKGW7MTOFJAV3MJMEE7KC`   |
| AgentRep         | `CBOFIU4HRB63...` (seeded scores for demo agents)            |

Network: **Stellar testnet** · Asset: **USDC** (7-decimal stroops).

Inspect any of these on [Stellar.expert](https://stellar.expert/explorer/testnet).

---

## Local Setup

### Prerequisites

- **Node.js** 20+
- **pnpm** 9+ (`corepack enable`)
- **Rust** + `wasm32-unknown-unknown` target (only if you rebuild contracts)
- **Stellar CLI** (`stellar`) — [install guide](https://developers.stellar.org/docs/tools/developer-tools/cli)
- An Anthropic API key (for the Concierge demo)

### 1. Clone and install

```bash
git clone <repo>
cd agentpay-v2
pnpm install
```

### 2. Configure environment

Copy the example and fill in your values:

```bash
cp .env.example .env
```

Required keys:

```bash
# Network
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org

# Contracts (already deployed — reuse the ones above)
SERVICE_REGISTRY_CONTRACT=CDMOBDEU534CZGU5EKHD6IYMQDBB3NH76B5RIGCABAOCJYIAKQMM7HJF
BUDGET_POLICY_CONTRACT=CBKTPZKT35WZECDSBA2CCZGERCUAJFAID32E45O2MYTX4BWIFZBEY2WF
RECEIPT_LEDGER_CONTRACT=CAPXJFLGSESJV2VNNUZCGQZCMNFYQLNT5QJKKGW7MTOFJAV3MJMEE7KC

# USDC on testnet
USDC_ASSET_CODE=USDC
USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5

# Keypairs (testnet — never reuse mainnet secrets)
SELLER1_SECRET=S...            # seller wallet
BUYER_SECRET=S...              # buyer wallet (fund with XLM + USDC)

# Concierge LLM
ANTHROPIC_API_KEY=sk-ant-...
```

> **Funding a test wallet:** use the [Stellar Friendbot](https://friendbot.stellar.org) for XLM, then open a USDC trustline and swap or request USDC from the testnet faucet.

### 3. Build everything

```bash
# (Optional) rebuild Soroban contracts from Rust
stellar contract build

# Build all TypeScript packages
pnpm -r run build
```

### 4. (Optional) Redeploy contracts

If you want your own contract instances:

```bash
bash scripts/deploy.sh
```

This deploys, initializes, and writes new contract IDs back to `.env`.

---

## Running the Demo

The Concierge demo runs the full stack locally. Six processes come up: three sellers, the REST gateway, the Concierge backend, and the Vite frontend.

### One-shot launch

```bash
# From agentpay-v2/
pnpm demo:concierge
```

That runs the concierge backend (`:3200`) and the Vite dev server (`:5173`) together.

### Full stack (sellers + API + concierge)

If you want to see payments really land on-chain, start the sellers and REST gateway too:

```bash
# Terminal 1 — sellers
set -a && source .env && set +a
node packages/sdk/dist/cli.js serve --skill weather  --handler ./demo/weather-agent/handler.js  --price 0.01  --port 3001 &
node packages/sdk/dist/cli.js serve --skill research --handler ./demo/research-agent/handler.js --price 0.02  --port 3002 &
node packages/sdk/dist/cli.js serve --skill joke     --handler ./demo/joke-agent/handler.js     --price 0.005 --port 3003 &

# Terminal 2 — REST gateway
node packages/api/dist/index.js           # :3100

# Terminal 3 — concierge (backend + frontend)
pnpm demo:concierge                       # :3200 backend, :5173 frontend
```

Then open **http://localhost:5173**.

- **File assignment** → Claude discovers services, pays them, and writes a briefing. Every receipt links to Stellar.expert.
- **Guardrail demo** → runs with a 0.001 USDC per-call cap so `BudgetPolicy` rejects the call on-chain.

---

## Seller Quick Start

Write your handler:

```ts
// weather.ts
export default async function handler(params: Record<string, string>) {
  const city = params.city ?? 'San Francisco';
  // ...fetch real data...
  return { city, temperature: '22C', condition: 'Sunny' };
}
```

Serve it:

```bash
node packages/sdk/dist/cli.js serve \
  --skill weather \
  --handler ./weather.ts \
  --price 0.01 \
  --port 3001 \
  --secret $SELLER1_SECRET \
  --registry $SERVICE_REGISTRY_CONTRACT \
  --receipts $RECEIPT_LEDGER_CONTRACT
```

Or programmatically:

```ts
import { AgentPayServer } from '@agentpay/sdk';

const server = new AgentPayServer({
  serviceId: 'weather',
  pricePerCallUsdc: 0.01,
  handler: async ({ city }) => fetchWeather(city),
});

await server.register();  // writes to ServiceRegistry
server.listen(3001);
```

No KYC, no Stripe, no dashboard. The contract is the contract.

---

## Buyer Quick Start

```ts
import { AgentPayClient } from '@agentpay/sdk';

const client = new AgentPayClient({ secret: process.env.BUYER_SECRET });

// On-chain guardrail — buyer cannot exceed these
await client.setBudget({ maxPerCall: 0.1, maxDaily: 1.0 });

const services = await client.discoverServices();
console.log(services);

// Pay and receive in one call
const result = await client.callService('weather', { city: 'Tokyo' });
console.log(result);
```

The client handles the x402 handshake, signs the payment with the buyer's keypair, submits the tx, waits for settlement, and records the spend.

---

## MCP Integration

Expose AgentPay to any MCP-aware host (Claude Desktop, Cursor, Zed):

```json
{
  "mcpServers": {
    "agentpay": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "STELLAR_SECRET": "S...",
        "SERVICE_REGISTRY_CONTRACT": "CDMOBDEU...",
        "BUDGET_POLICY_CONTRACT":    "CBKTPZKT...",
        "RECEIPT_LEDGER_CONTRACT":   "CAPXJFLG..."
      }
    }
  }
}
```

Your agent gets 7 tools: `discover_services`, `call_service`, `set_budget`, `get_budget_remaining`, `spending_report`, `wallet_info`, `x402_fetch`.

---

## How Payments Work (x402)

1. Buyer calls seller endpoint
2. Seller returns `402 PAYMENT-REQUIRED` with price, asset, `payTo`
3. Buyer's `@x402/fetch` wrapper creates a Soroban auth entry and signs it locally
4. Buyer retries with the `X-Payment` header
5. Seller verifies the signature and amount via the x402 facilitator
6. Seller settles the tx on-chain
7. Seller runs the handler and mints a `ReceiptLedger` entry with request/response hashes
8. Seller returns `200 OK` + `X-Payment-Response` (tx hash + receipt id)
9. Client awaits `BudgetPolicy.recordSpend` so remaining balance is consistent
10. `AgentRep` updates both buyer and seller scores

Every step is real. Every tx is on testnet. Every receipt is viewable on Stellar.expert.

---

## Smart Contract Reference

**ServiceRegistry** — `register(serviceId, provider, endpoint, pricePerCall, category, description)`, `list()`, `get(id)`. Permissionless marketplace index.

**BudgetPolicy** — `setBudget(buyer, maxPerCall, maxDaily)`, `recordSpend(buyer, seller, amount, serviceId)`, `getRemaining(buyer)`. Over-limit calls are rejected on-chain.

**ReceiptLedger** — `mint(buyer, seller, serviceId, amount, requestHash, responseHash)`, `getByBuyer(addr)`, `getBySeller(addr)`. Append-only cryptographic proof of delivery.

**AgentRep** — `recordSuccess(agent)`, `recordFailure(agent)`, `score(agent)`. Public reputation; registry can be filtered by minimum score.

---

## Tech Stack

- **Chain:** Stellar testnet · Soroban smart contracts (Rust, `soroban-sdk` 22)
- **Payments:** x402 protocol (`@x402/core`, `@x402/stellar`, `@x402/fetch`)
- **SDK:** TypeScript · `@stellar/stellar-sdk`
- **AI runtime:** Anthropic Claude Haiku 4.5 (`claude-haiku-4-5`)
- **Protocol surfaces:** MCP over stdio · x402 over HTTP · SSE for UI streaming
- **Frontend:** Vite · React 18 · Tailwind 3 · Framer Motion 11 · Fraunces / Instrument Sans / JetBrains Mono
- **Tooling:** pnpm workspaces · tsx watch · Express 5

---

## Security Model

- **BudgetPolicy is on-chain.** A compromised buyer agent cannot spend past its limits — the contract rejects the tx.
- **ReceiptLedger is append-only.** Sellers can't hide deliveries; buyers can't deny payments.
- **AgentRep is public.** Repeated failures lower a seller's score; the registry can be filtered by minimum reputation.
- **Keys stay client-side.** The SDK never transmits the buyer's secret key; it signs locally and sends only the signed tx.
- **x402 is replay-safe.** Each challenge includes a nonce; reused signatures are rejected.

Stellar-native primitives — not bolt-on security.

---

## License

MIT
