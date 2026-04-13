import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RegistryClient, ReceiptsClient } from '@agentpay/sdk';

dotenv.config();

const registryContract = process.env.SERVICE_REGISTRY_CONTRACT!;
const receiptContract = process.env.RECEIPT_LEDGER_CONTRACT!;
const secretKey = process.env.STELLAR_SECRET ?? process.env.DEPLOYER_SECRET ?? process.env.SELLER1_SECRET!;
const network = (process.env.STELLAR_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
const port = Number(process.env.API_PORT ?? 3100);

if (!registryContract || !receiptContract || !secretKey) {
  console.error('Missing env vars. Set SERVICE_REGISTRY_CONTRACT, RECEIPT_LEDGER_CONTRACT, and a secret key.');
  process.exit(1);
}

const registry = new RegistryClient(registryContract, network, secretKey);
const receipts = new ReceiptsClient(receiptContract, network, secretKey);

const app = express();
app.use(cors());
app.use(express.json());

// Dashboard: list all registered services
app.get('/api/services', async (_req, res) => {
  try {
    const services = await registry.listAllServices(50);
    res.json({
      services: services.map(s => ({
        serviceId: s.serviceId,
        provider: s.provider,
        endpointUrl: s.endpointUrl,
        description: s.description,
        category: s.category,
        active: s.active,
        registeredAt: s.registeredAt,
        pricePerCall: s.pricePerCall.toString(),
        priceUsdc: Number(s.pricePerCall) / 1e7,
        totalCalls: Number(s.totalCalls),
        totalEarned: s.totalEarned.toString(),
        totalRevenue: (Number(s.totalCalls) * Number(s.pricePerCall)) / 1e7,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard: get service details
app.get('/api/services/:id', async (req, res) => {
  try {
    const s = await registry.getService(req.params.id);
    res.json({
      serviceId: s.serviceId,
      provider: s.provider,
      endpointUrl: s.endpointUrl,
      description: s.description,
      category: s.category,
      active: s.active,
      registeredAt: s.registeredAt,
      pricePerCall: s.pricePerCall.toString(),
      priceUsdc: Number(s.pricePerCall) / 1e7,
      totalCalls: Number(s.totalCalls),
      totalEarned: s.totalEarned.toString(),
    });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// Dashboard: recent receipts
app.get('/api/receipts', async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 20);
    const recent = await receipts.getRecentReceipts(limit);
    res.json({
      receipts: recent.map(r => ({
        receiptId: r.receiptId,
        payer: r.payer,
        payee: r.payee,
        serviceId: r.serviceId,
        amount: r.amount.toString(),
        amountUsdc: Number(r.amount) / 1e7,
        timestamp: new Date(r.timestamp * 1000).toISOString(),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard: receipt count
app.get('/api/receipts/count', async (_req, res) => {
  try {
    const count = await receipts.getReceiptCount();
    res.json({ count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard: receipts by provider
app.get('/api/receipts/provider/:address', async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 20);
    const providerReceipts = await receipts.getPayeeReceipts(req.params.address, limit);
    res.json({
      receipts: providerReceipts.map(r => ({
        ...r,
        amountUsdc: Number(r.amount) / 1e7,
        timestamp: new Date(r.timestamp * 1000).toISOString(),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard: stats summary
app.get('/api/stats', async (_req, res) => {
  try {
    const [services, receiptCount] = await Promise.all([
      registry.listAllServices(50),
      receipts.getReceiptCount(),
    ]);

    const totalRevenue = services.reduce(
      (sum, s) => sum + (Number(s.totalCalls) * Number(s.pricePerCall)) / 1e7,
      0,
    );
    const totalCalls = services.reduce((sum, s) => sum + Number(s.totalCalls), 0);

    res.json({
      totalServices: services.length,
      totalCalls,
      totalRevenue: `${totalRevenue.toFixed(4)} USDC`,
      totalReceipts: receiptCount,
      network,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Serve dashboard static files
const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardPath = resolve(__dirname, '../../dashboard');
app.use(express.static(dashboardPath));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', network });
});

app.listen(port, () => {
  console.log(`AgentPay API running on :${port}`);
  console.log(`  Network: ${network}`);
  console.log(`  Registry: ${registryContract.slice(0, 12)}...`);
});
