#!/usr/bin/env npx tsx

/**
 * AgentPay Buyer Agent Demo
 *
 * Demonstrates an AI agent discovering and paying for services on Stellar.
 * This script shows the full buyer-side flow:
 *   1. Discover available services
 *   2. Set spending budget
 *   3. Call paid services with automatic x402 payment
 *   4. Get spending report with on-chain receipts
 */

import { AgentPayClient } from '../../packages/sdk/dist/index.js';

const secretKey = process.env.BUYER_SECRET ?? process.env.STELLAR_SECRET;
const registryContract = process.env.SERVICE_REGISTRY_CONTRACT;
const budgetContract = process.env.BUDGET_POLICY_CONTRACT;
const receiptContract = process.env.RECEIPT_LEDGER_CONTRACT;

if (!secretKey || !registryContract || !budgetContract || !receiptContract) {
  console.error('Missing env vars. Copy .env.example to .env and fill in values.');
  process.exit(1);
}

const client = new AgentPayClient({
  secretKey,
  network: 'testnet',
  registryContract,
  budgetContract,
  receiptContract,
});

async function main() {
  console.log('\n=== AgentPay Buyer Agent Demo ===\n');
  console.log(`Wallet: ${client.address}`);
  console.log(`Network: testnet\n`);

  // Step 1: Discover services
  console.log('--- Step 1: Discovering available services ---');
  const services = await client.discover();
  console.log(`Found ${services.length} services:`);
  for (const s of services) {
    console.log(`  • ${s.serviceId} (${Number(s.pricePerCall) / 1e7} USDC) — ${s.description}`);
  }

  // Step 2: Set budget
  console.log('\n--- Step 2: Setting spending budget ---');
  await client.setBudget({
    maxPerCall: 0.10,
    maxDaily: 1.00,
  });
  console.log('  Budget set: max $0.10/call, max $1.00/day');

  const remaining = await client.getRemaining();
  console.log(`  Remaining: daily=${remaining.daily === -1 ? 'unlimited' : remaining.daily + ' USDC'}, session=${remaining.session === -1 ? 'unlimited' : remaining.session + ' USDC'}`);

  // Step 3: Call weather service
  if (services.find(s => s.serviceId.includes('weather'))) {
    console.log('\n--- Step 3a: Calling weather service ---');
    try {
      const weather = await client.callService('weather', { city: 'Tokyo' });
      console.log('  Weather result:', JSON.stringify(weather.data, null, 2));
      console.log(`  Cost: ${weather.cost} USDC`);
      console.log(`  Receipt: ${weather.receiptId}`);
    } catch (err: any) {
      console.log(`  Weather call failed: ${err.message}`);
    }
  }

  // Step 3b: Call research service
  if (services.find(s => s.serviceId.includes('research'))) {
    console.log('\n--- Step 3b: Calling research service ---');
    try {
      const research = await client.callService('research', { query: 'Stellar blockchain' });
      console.log('  Research result:', JSON.stringify(research.data, null, 2));
      console.log(`  Cost: ${research.cost} USDC`);
      console.log(`  Receipt: ${research.receiptId}`);
    } catch (err: any) {
      console.log(`  Research call failed: ${err.message}`);
    }
  }

  // Step 4: Spending report
  console.log('\n--- Step 4: Spending Report ---');
  const receipts = await client.getSpendingReport();
  console.log(`Total receipts: ${receipts.length}`);
  for (const r of receipts) {
    console.log(`  • ${r.serviceId}: ${Number(r.amount) / 1e7} USDC (${new Date(r.timestamp * 1000).toISOString()})`);
  }

  console.log('\n=== Demo Complete ===\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
