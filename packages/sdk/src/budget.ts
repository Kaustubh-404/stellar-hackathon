import { SorobanHelper } from './soroban.js';
import type { BudgetConfig } from './types.js';
import { BudgetExceededError } from './types.js';

export class BudgetClient {
  private soroban: SorobanHelper;

  constructor(
    private contractId: string,
    network: 'testnet' | 'mainnet',
    secretKey: string,
  ) {
    this.soroban = new SorobanHelper(network, secretKey);
  }

  async initialize(admin: string): Promise<void> {
    await this.soroban.invoke(this.contractId, 'initialize', [
      SorobanHelper.addr(admin),
    ]);
  }

  async setBudget(
    agent: string,
    maxPerCall: bigint,
    maxPerSession: bigint,
    maxDaily: bigint,
  ): Promise<void> {
    await this.soroban.invoke(this.contractId, 'set_budget', [
      SorobanHelper.addr(agent),
      SorobanHelper.i128(maxPerCall),
      SorobanHelper.i128(maxPerSession),
      SorobanHelper.i128(maxDaily),
    ]);
  }

  async checkAllowed(agent: string, provider: string, amount: bigint): Promise<boolean> {
    const result = await this.soroban.query(this.contractId, 'check_allowed', [
      SorobanHelper.addr(agent),
      SorobanHelper.addr(provider),
      SorobanHelper.i128(amount),
    ]);
    return Boolean(SorobanHelper.native(result));
  }

  async recordSpend(
    agent: string,
    provider: string,
    amount: bigint,
    serviceId: string,
  ): Promise<void> {
    await this.soroban.invoke(this.contractId, 'record_spend', [
      SorobanHelper.addr(agent),
      SorobanHelper.addr(provider),
      SorobanHelper.i128(amount),
      SorobanHelper.str(serviceId),
    ]);
  }

  async getBudget(agent: string): Promise<BudgetConfig> {
    const result = await this.soroban.query(this.contractId, 'get_budget', [
      SorobanHelper.addr(agent),
    ]);
    return this.parse(SorobanHelper.native(result));
  }

  async getRemaining(agent: string): Promise<{ daily: bigint; session: bigint }> {
    const result = await this.soroban.query(this.contractId, 'get_remaining', [
      SorobanHelper.addr(agent),
    ]);
    const raw = SorobanHelper.native(result);
    return { daily: BigInt(raw[0]), session: BigInt(raw[1]) };
  }

  async enforceOrThrow(agent: string, provider: string, amount: bigint): Promise<void> {
    const allowed = await this.checkAllowed(agent, provider, amount);
    if (!allowed) {
      let remaining = { daily: 0n, session: 0n };
      try {
        remaining = await this.getRemaining(agent);
      } catch { /* no budget set */ }
      throw new BudgetExceededError(agent, amount, remaining.daily);
    }
  }

  async resetSession(agent: string): Promise<void> {
    await this.soroban.invoke(this.contractId, 'reset_session', [
      SorobanHelper.addr(agent),
    ]);
  }

  private parse(raw: any): BudgetConfig {
    return {
      agent: String(raw.agent ?? ''),
      maxPerCall: BigInt(raw.max_per_call ?? 0),
      maxPerSession: BigInt(raw.max_per_session ?? 0),
      maxDaily: BigInt(raw.max_daily ?? 0),
      spentSession: BigInt(raw.spent_session ?? 0),
      spentDaily: BigInt(raw.spent_daily ?? 0),
      dailyResetAt: Number(raw.daily_reset_at ?? 0),
      sessionId: Number(raw.session_id ?? 0),
      totalSpent: BigInt(raw.total_spent ?? 0),
      totalCalls: Number(raw.total_calls ?? 0),
    };
  }
}
