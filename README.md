# AgentPay

**Turn any AI agent into a paid service on Stellar — in one command.**

AgentPay is the seller toolkit for the agent economy. While others build "agents that pay," we build the infrastructure that lets agents **get paid**.

```bash
npx agentpay serve --skill weather --handler ./weather.ts --price 0.01
```

That's it. One command gives you:
- A funded Stellar wallet (auto-generated or bring your own)
- An Express server with x402 payment gating
- On-chain service registration (Soroban)
- Automatic USDC payments via the x402 protocol
- On-chain receipts for every transaction
- Real-time revenue dashboard

## Architecture

```
Seller Side (our differentiator)         Buyer Side
┌──────────────────────────┐    ┌──────────────────────────┐
│  agentpay serve          │    │  MCP Server              │
│  --skill research        │    │  ┌────────────────────┐  │
│  --handler ./agent.ts    │    │  │ discover_services   │  │
│  --price 0.05            │    │  │ call_service        │  │
│                          │    │  │ set_budget          │  │
│  ┌────────────────────┐  │    │  │ spending_report     │  │
│  │ x402 Payment Gate  │◄─┼────┼──│ x402_fetch          │  │
│  │ Verify → Settle    │  │    │  └────────────────────┘  │
│  └────────┬───────────┘  │    └──────────────────────────┘
│           │              │              │
│  ┌────────▼───────────┐  │    ┌─────────▼────────────────┐
│  │ Execute Handler    │  │    │ AgentPayClient (SDK)     │
│  └────────┬───────────┘  │    │ - x402 auto-pay          │
│           │              │    │ - Budget enforcement      │
│  ┌────────▼───────────┐  │    │ - Receipt tracking        │
│  │ Post Receipt       │  │    └──────────────────────────┘
│  └────────────────────┘  │
└──────────────────────────┘
            │
   Stellar Testnet (Soroban)
   ┌─────────────────────────────────────┐
   │ ServiceRegistry │ BudgetPolicy │ ReceiptLedger │
   └─────────────────────────────────────┘
```

## What's Inside

| Package | Description |
|---------|------------|
| `contracts/service-registry` | Soroban contract — on-chain catalog of paid agent services |
| `contracts/budget-policy` | Soroban contract — programmable spending limits (per-call, session, daily) |
| `contracts/receipt-ledger` | Soroban contract — on-chain proof of payment + delivery |
| `packages/sdk` | TypeScript SDK — `AgentPayServer` (seller) + `AgentPayClient` (buyer) + CLI |
| `packages/mcp-server` | MCP server — 7 tools for AI agents to discover, pay, and budget |
| `packages/api` | REST API + dashboard — real-time revenue tracking |
| `demo/` | 3 demo seller agents + buyer agent script |

## Quick Start

### Prerequisites

- Node.js 20+
- Rust + `wasm32-unknown-unknown` target (for Soroban contracts)
- Stellar CLI (`stellar`)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Build everything

```bash
# Build Soroban contracts
stellar contract build

# Build TypeScript packages
pnpm -r run build
```

### 3. Deploy contracts to testnet

```bash
bash scripts/deploy.sh
```

This deploys all 3 Soroban contracts, initializes them, and writes contract IDs to `.env`.

### 4. Run a seller agent

Write a handler file:

```typescript
// my-skill.ts
export default async function handler(params: Record<string, string>) {
  const city = params.city ?? 'San Francisco';
  const weather = await fetch(`https://api.open-meteo.com/v1/forecast?...`);
  return { city, temperature: '22C', condition: 'Sunny' };
}
```

Start the agent:

```bash
node packages/sdk/dist/cli.js serve \
  --skill weather \
  --handler ./my-skill.ts \
  --price 0.01 \
  --registry $SERVICE_REGISTRY_CONTRACT \
  --receipts $RECEIPT_LEDGER_CONTRACT
```

### 5. Connect a buyer agent (MCP)

Add to your Claude Desktop / Cursor config:

```json
{
  "mcpServers": {
    "agentpay": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "STELLAR_SECRET": "your-buyer-secret-key",
        "SERVICE_REGISTRY_CONTRACT": "...",
        "BUDGET_POLICY_CONTRACT": "...",
        "RECEIPT_LEDGER_CONTRACT": "..."
      }
    }
  }
}
```

Now your AI agent has 7 new tools:
- **discover_services** — Browse available paid services
- **call_service** — Call and auto-pay for a service
- **set_budget** — Set spending limits
- **get_budget_remaining** — Check remaining budget
- **spending_report** — View on-chain receipts
- **wallet_info** — Check wallet and network
- **x402_fetch** — Raw x402 payment-aware HTTP fetch

### 6. Launch the dashboard

```bash
source .env
node packages/api/dist/index.js
# Open http://localhost:3100
```

## How Payments Work

AgentPay uses the **x402 protocol** for per-request payments on Stellar:

1. Buyer agent calls a seller's endpoint
2. Seller returns HTTP 402 with payment requirements (price, asset, payTo address)
3. Buyer's `@x402/fetch` wrapper automatically creates a Soroban auth entry and signs it
4. Buyer retries the request with the `X-Payment` header containing the signed payment
5. Seller verifies payment via the x402 facilitator, then settles it on-chain
6. Seller executes the handler and returns the result
7. Receipt is posted to the on-chain ReceiptLedger

All payments are in USDC on Stellar. The BudgetPolicy contract enforces spending limits so agents can't overspend.

## Deployed Contracts (Testnet)

| Contract | ID |
|----------|-----|
| ServiceRegistry | `CDMOBDEU534CZGU5EKHD6IYMQDBB3NH76B5RIGCABAOCJYIAKQMM7HJF` |
| BudgetPolicy | `CBKTPZKT35WZECDSBA2CCZGERCUAJFAID32E45O2MYTX4BWIFZBEY2WF` |
| ReceiptLedger | `CA6K7MNVZGO6752N36GX3B5ER3AZQHOIEMVFN4JXRHTCDSVDMFD4KSKL` |

## Tech Stack

- **Blockchain**: Stellar (Soroban smart contracts, soroban-sdk 22.0)
- **Payments**: x402 protocol (`@x402/core`, `@x402/stellar`, `@x402/fetch`)
- **SDK**: TypeScript, Node.js
- **AI Integration**: MCP (Model Context Protocol) server
- **API**: Express.js
- **Asset**: USDC on Stellar testnet

## Why AgentPay?

Every other project in this hackathon builds an agent that *spends* money. We build the infrastructure that lets agents *earn* money. That's the missing piece of the agent economy.

- **For sellers**: One command to monetize any skill. No payment integration, no wallet setup, no server boilerplate.
- **For buyers**: One MCP server to discover and pay for any service. Budget controls prevent overspending.
- **For the ecosystem**: An on-chain registry of paid services, on-chain receipts for every transaction, and programmable spending policies.

## License

MIT
