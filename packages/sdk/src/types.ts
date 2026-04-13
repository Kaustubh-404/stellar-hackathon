export interface ServiceInfo {
  serviceId: string;
  provider: string;
  endpointUrl: string;
  pricePerCall: bigint;
  description: string;
  category: string;
  active: boolean;
  totalCalls: number;
  totalEarned: bigint;
  registeredAt: number;
}

export interface BudgetConfig {
  agent: string;
  maxPerCall: bigint;
  maxPerSession: bigint;
  maxDaily: bigint;
  spentSession: bigint;
  spentDaily: bigint;
  dailyResetAt: number;
  sessionId: number;
  totalSpent: bigint;
  totalCalls: number;
}

export interface Receipt {
  receiptId: string;
  payer: string;
  payee: string;
  serviceId: string;
  amount: bigint;
  requestHash: string;
  responseHash: string;
  timestamp: number;
  status: number;
}

export interface SkillConfig {
  price: number;
  category: string;
  description: string;
  handler: (params: Record<string, string>) => Promise<unknown>;
}

export interface AgentPayServerConfig {
  secretKey: string;
  network: 'testnet' | 'mainnet';
  registryContract: string;
  receiptContract: string;
  facilitatorUrl?: string;
}

export interface AgentPayClientConfig {
  secretKey: string;
  network: 'testnet' | 'mainnet';
  registryContract: string;
  budgetContract: string;
  receiptContract: string;
}

export class BudgetExceededError extends Error {
  constructor(
    public readonly agent: string,
    public readonly requested: bigint,
    public readonly remaining: bigint,
  ) {
    super(`Budget exceeded: requested ${requested} stroops, remaining ${remaining} stroops`);
    this.name = 'BudgetExceededError';
  }
}

export class ServiceNotFoundError extends Error {
  constructor(public readonly serviceId: string) {
    super(`Service not found: ${serviceId}`);
    this.name = 'ServiceNotFoundError';
  }
}

export const USDC_DECIMALS = 7;
export const STROOPS_PER_USDC = 10_000_000n;

export function usdcToStroops(usdc: number): bigint {
  return BigInt(Math.round(usdc * Number(STROOPS_PER_USDC)));
}

export function stroopsToUsdc(stroops: bigint): number {
  return Number(stroops) / Number(STROOPS_PER_USDC);
}
