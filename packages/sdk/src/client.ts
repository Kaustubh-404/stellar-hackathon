import { createHash } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { wrapFetchWithPaymentFromConfig } from '@x402/fetch';
import { createEd25519Signer } from '@x402/stellar';
import { ExactStellarScheme } from '@x402/stellar/exact/client';
import { RegistryClient } from './registry.js';
import { BudgetClient } from './budget.js';
import { ReceiptsClient } from './receipts.js';
import {
  usdcToStroops,
  stroopsToUsdc,
  BudgetExceededError,
  type AgentPayClientConfig,
  type ServiceInfo,
  type Receipt,
} from './types.js';

export interface CallResult {
  data: unknown;
  cost: number;
  receiptId?: string;
  transaction?: string;
}

export class AgentPayClient {
  private keypair: Keypair;
  private registry: RegistryClient;
  private budget: BudgetClient;
  private receiptsClient: ReceiptsClient;
  private paidFetch: typeof fetch;
  private config: AgentPayClientConfig;

  constructor(config: AgentPayClientConfig) {
    this.config = config;
    this.keypair = Keypair.fromSecret(config.secretKey);
    this.registry = new RegistryClient(
      config.registryContract,
      config.network,
      config.secretKey,
    );
    this.budget = new BudgetClient(
      config.budgetContract,
      config.network,
      config.secretKey,
    );
    this.receiptsClient = new ReceiptsClient(
      config.receiptContract,
      config.network,
      config.secretKey,
    );

    const network =
      config.network === 'testnet' ? 'stellar:testnet' : 'stellar:pubnet';

    const signer = createEd25519Signer(config.secretKey, network);

    this.paidFetch = wrapFetchWithPaymentFromConfig(fetch, {
      schemes: [
        {
          network: 'stellar:*',
          client: new ExactStellarScheme(signer),
        },
      ],
    });
  }

  get address(): string {
    return this.keypair.publicKey();
  }

  async discover(opts: {
    category?: string;
    limit?: number;
  } = {}): Promise<ServiceInfo[]> {
    if (opts.category) {
      return this.registry.listServices(opts.category, opts.limit ?? 10);
    }
    return this.registry.listAllServices(opts.limit ?? 20);
  }

  async callService(
    serviceId: string,
    params: Record<string, string> = {},
  ): Promise<CallResult> {
    // Look up service from registry
    const service = await this.registry.getService(serviceId);
    if (!service.active) {
      throw new Error(`Service '${serviceId}' is not active`);
    }

    // Check budget
    try {
      await this.budget.enforceOrThrow(
        this.address,
        service.provider,
        service.pricePerCall,
      );
    } catch (err) {
      if (err instanceof BudgetExceededError) throw err;
      // No budget set — allow
    }

    // Build URL with params
    const url = new URL(service.endpointUrl);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    // Make the x402 payment-aware fetch
    const response = await this.paidFetch(url.toString());

    if (!response.ok && response.status !== 200) {
      throw new Error(`Service call failed: ${response.status} ${response.statusText}`);
    }

    const body = await response.json();

    // Record spend on-chain — awaited so getRemaining reflects reality immediately
    try {
      await this.budget.recordSpend(
        this.address,
        service.provider,
        service.pricePerCall,
        serviceId,
      );
    } catch (err) {
      console.error(`recordSpend failed for ${serviceId}:`, (err as Error).message);
    }

    return {
      data: body.data ?? body,
      cost: stroopsToUsdc(service.pricePerCall),
      receiptId: body.payment?.receiptId,
      transaction: body.payment?.transaction,
    };
  }

  async x402Fetch(url: string, init?: RequestInit): Promise<Response> {
    return this.paidFetch(url, init);
  }

  async setBudget(opts: {
    maxPerCall?: number;
    maxPerSession?: number;
    maxDaily?: number;
  }): Promise<void> {
    await this.budget.setBudget(
      this.address,
      opts.maxPerCall ? usdcToStroops(opts.maxPerCall) : 0n,
      opts.maxPerSession ? usdcToStroops(opts.maxPerSession) : 0n,
      opts.maxDaily ? usdcToStroops(opts.maxDaily) : 0n,
    );
  }

  async getRemaining(): Promise<{ daily: number; session: number }> {
    const r = await this.budget.getRemaining(this.address);
    return {
      daily: r.daily === -1n ? -1 : stroopsToUsdc(r.daily),
      session: r.session === -1n ? -1 : stroopsToUsdc(r.session),
    };
  }

  async getSpendingReport(limit = 10): Promise<Receipt[]> {
    return this.receiptsClient.getPayerReceipts(this.address, limit);
  }

  async getWalletInfo(): Promise<{
    address: string;
    network: string;
  }> {
    return {
      address: this.address,
      network: this.config.network,
    };
  }
}

export { AgentPayClient as default };
