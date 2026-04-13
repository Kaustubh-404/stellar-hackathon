#!/usr/bin/env npx tsx
import { AgentPayClient } from '../../packages/sdk/dist/index.js';

const client = new AgentPayClient({
  secretKey: process.env.BUYER_SECRET!,
  network: 'testnet',
  registryContract: process.env.SERVICE_REGISTRY_CONTRACT!,
  budgetContract: process.env.BUDGET_POLICY_CONTRACT!,
  receiptContract: process.env.RECEIPT_LEDGER_CONTRACT!,
});

async function main() {
  const r = await client.callService('joke', { category: 'Programming' });
  console.log('Joke:', JSON.stringify(r.data, null, 2));
  console.log('Cost:', r.cost, 'USDC   tx:', r.transaction);
}
main().catch(e => { console.error(e); process.exit(1); });
