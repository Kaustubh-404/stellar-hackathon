#!/usr/bin/env npx tsx
import { AgentPayClient, BudgetExceededError } from '../../packages/sdk/dist/index.js';

const client = new AgentPayClient({
  secretKey: process.env.BUYER_SECRET!,
  network: 'testnet',
  registryContract: process.env.SERVICE_REGISTRY_CONTRACT!,
  budgetContract: process.env.BUDGET_POLICY_CONTRACT!,
  receiptContract: process.env.RECEIPT_LEDGER_CONTRACT!,
});

async function main() {
  console.log('\n=== Budget Enforcement Test ===\n');

  // Set a max-per-call lower than the weather service price (0.01 USDC)
  await client.setBudget({ maxPerCall: 0.005, maxDaily: 1.0 });
  console.log('Set budget: maxPerCall=0.005 USDC (below weather price of 0.01)');

  try {
    const r = await client.callService('weather', { city: 'London' });
    console.error('FAIL: expected BudgetExceededError but got result:', r);
    process.exit(1);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      console.log(`PASS: BudgetExceededError thrown as expected — ${err.message}`);
    } else {
      console.error('FAIL: wrong error type:', err);
      process.exit(1);
    }
  }

  // Reset to a generous budget for future tests
  await client.setBudget({ maxPerCall: 0.10, maxDaily: 1.0 });
  console.log('\nBudget restored to maxPerCall=0.10 USDC');
}

main().catch(err => { console.error('error:', err); process.exit(1); });
