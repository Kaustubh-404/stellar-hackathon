#!/usr/bin/env node

import { Keypair } from '@stellar/stellar-sdk';
import { AgentPayServer } from './server.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

function usage(): never {
  console.log(`
AgentPay — Turn any AI agent skill into a paid service on Stellar

Usage:
  agentpay serve [options]

Options:
  --skill <name>         Skill name (required)
  --handler <path>       Path to handler file (.ts/.js, default export) (required)
  --price <amount>       Price per call in USDC (required)
  --category <cat>       Service category (default: "general")
  --description <desc>   Human-readable description (default: auto)
  --port <port>          Server port (default: 3001)
  --secret <key>         Stellar secret key (or set STELLAR_SECRET env)
  --network <net>        "testnet" or "mainnet" (default: testnet)
  --registry <id>        ServiceRegistry contract ID (or set SERVICE_REGISTRY_CONTRACT env)
  --receipts <id>        ReceiptLedger contract ID (or set RECEIPT_LEDGER_CONTRACT env)
  --no-register          Skip on-chain registration

Example:
  agentpay serve --skill weather --handler ./weather.ts --price 0.01
  agentpay serve --skill research --handler ./research.js --price 0.05 --port 3002

Handler file format:
  export default async function handler(params: Record<string, string>) {
    return { result: "your data" };
  }
`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help') {
    usage();
  }

  const command = args[0];
  if (command !== 'serve') {
    console.error(`Unknown command: ${command}. Use "agentpay serve".`);
    process.exit(1);
  }

  // Parse args
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };

  const skillName = get('--skill');
  const handlerPath = get('--handler');
  const priceStr = get('--price');
  const category = get('--category') ?? 'general';
  const description = get('--description');
  const port = Number(get('--port') ?? 3001);
  const secretKey =
    get('--secret') ?? process.env.STELLAR_SECRET ?? process.env.SELLER1_SECRET;
  const network = (get('--network') ?? process.env.STELLAR_NETWORK ?? 'testnet') as
    | 'testnet'
    | 'mainnet';
  const registryContract =
    get('--registry') ?? process.env.SERVICE_REGISTRY_CONTRACT;
  const receiptContract =
    get('--receipts') ?? process.env.RECEIPT_LEDGER_CONTRACT;
  const noRegister = args.includes('--no-register');

  if (!skillName) {
    console.error('Error: --skill is required');
    process.exit(1);
  }
  if (!handlerPath) {
    console.error('Error: --handler is required');
    process.exit(1);
  }
  if (!priceStr) {
    console.error('Error: --price is required');
    process.exit(1);
  }

  const price = parseFloat(priceStr);
  if (isNaN(price) || price <= 0) {
    console.error('Error: --price must be a positive number');
    process.exit(1);
  }

  // Generate or use provided secret key
  let effectiveSecret = secretKey;
  if (!effectiveSecret) {
    const kp = Keypair.random();
    effectiveSecret = kp.secret();
    console.log(`\nNo secret key provided — generated new wallet:`);
    console.log(`  Address: ${kp.publicKey()}`);
    console.log(`  Secret:  ${kp.secret()}`);
    console.log(`  Fund it: https://lab.stellar.org/account/fund?addr=${kp.publicKey()}`);
    console.log();
  }

  if (!registryContract) {
    console.error(
      'Error: --registry or SERVICE_REGISTRY_CONTRACT env required',
    );
    process.exit(1);
  }
  if (!receiptContract) {
    console.error('Error: --receipts or RECEIPT_LEDGER_CONTRACT env required');
    process.exit(1);
  }

  // Load handler
  const absPath = resolve(handlerPath);
  let handler: (params: Record<string, string>) => Promise<unknown>;
  try {
    const mod = await import(pathToFileURL(absPath).href);
    handler = mod.default ?? mod.handler;
    if (typeof handler !== 'function') {
      throw new Error('Handler must export a default function');
    }
  } catch (err: any) {
    console.error(`Error loading handler '${handlerPath}': ${err.message}`);
    process.exit(1);
  }

  // Create and start server
  const server = new AgentPayServer({
    secretKey: effectiveSecret,
    network,
    registryContract,
    receiptContract,
  });

  server.skill(skillName, {
    price,
    category,
    description: description ?? `${skillName} service`,
    handler,
  });

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  AgentPay — Seller Toolkit`);
  console.log(`${'='.repeat(50)}`);

  await server.start({
    port,
    registerOnChain: !noRegister,
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
