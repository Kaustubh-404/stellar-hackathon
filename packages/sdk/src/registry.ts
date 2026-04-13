import { SorobanHelper } from './soroban.js';
import type { ServiceInfo } from './types.js';

export class RegistryClient {
  private soroban: SorobanHelper;

  constructor(
    private contractId: string,
    network: 'testnet' | 'mainnet',
    secretKey: string,
  ) {
    this.soroban = new SorobanHelper(network, secretKey);
  }

  get publicKey(): string {
    return this.soroban.publicKey;
  }

  async initialize(admin: string): Promise<void> {
    await this.soroban.invoke(this.contractId, 'initialize', [
      SorobanHelper.addr(admin),
    ]);
  }

  async registerService(
    provider: string,
    serviceId: string,
    endpointUrl: string,
    pricePerCall: bigint,
    description: string,
    category: string,
  ): Promise<void> {
    await this.soroban.invoke(this.contractId, 'register_service', [
      SorobanHelper.addr(provider),
      SorobanHelper.str(serviceId),
      SorobanHelper.str(endpointUrl),
      SorobanHelper.i128(pricePerCall),
      SorobanHelper.str(description),
      SorobanHelper.str(category),
    ]);
  }

  async getService(serviceId: string): Promise<ServiceInfo> {
    const result = await this.soroban.query(this.contractId, 'get_service', [
      SorobanHelper.str(serviceId),
    ]);
    return this.parse(SorobanHelper.native(result));
  }

  async listServices(category: string, limit = 10): Promise<ServiceInfo[]> {
    const result = await this.soroban.query(this.contractId, 'list_services', [
      SorobanHelper.str(category),
      SorobanHelper.u32(limit),
    ]);
    const raw = SorobanHelper.native(result);
    return Array.isArray(raw) ? raw.map((r: any) => this.parse(r)) : [];
  }

  async listAllServices(limit = 20): Promise<ServiceInfo[]> {
    const result = await this.soroban.query(this.contractId, 'list_all_services', [
      SorobanHelper.u32(limit),
    ]);
    const raw = SorobanHelper.native(result);
    return Array.isArray(raw) ? raw.map((r: any) => this.parse(r)) : [];
  }

  async recordCall(caller: string, serviceId: string, amount: bigint): Promise<void> {
    await this.soroban.invoke(this.contractId, 'record_call', [
      SorobanHelper.addr(caller),
      SorobanHelper.str(serviceId),
      SorobanHelper.i128(amount),
    ]);
  }

  async getServiceCount(): Promise<number> {
    const result = await this.soroban.query(this.contractId, 'get_service_count', []);
    return Number(SorobanHelper.native(result));
  }

  private parse(raw: any): ServiceInfo {
    return {
      serviceId: String(raw.service_id ?? ''),
      provider: String(raw.provider ?? ''),
      endpointUrl: String(raw.endpoint_url ?? ''),
      pricePerCall: BigInt(raw.price_per_call ?? 0),
      description: String(raw.description ?? ''),
      category: String(raw.category ?? ''),
      active: Boolean(raw.active),
      totalCalls: Number(raw.total_calls ?? 0),
      totalEarned: BigInt(raw.total_earned ?? 0),
      registeredAt: Number(raw.registered_at ?? 0),
    };
  }
}
