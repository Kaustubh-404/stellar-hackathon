import { SorobanHelper } from './soroban.js';
import { nativeToScVal } from '@stellar/stellar-sdk';
import type { Receipt } from './types.js';

export class ReceiptsClient {
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

  async postReceipt(
    payer: string,
    payee: string,
    serviceId: string,
    amount: bigint,
    requestHash: Buffer,
    responseHash: Buffer,
    receiptId: string,
  ): Promise<void> {
    await this.soroban.invoke(this.contractId, 'post_receipt', [
      SorobanHelper.addr(payer),
      SorobanHelper.addr(payee),
      SorobanHelper.str(serviceId),
      SorobanHelper.i128(amount),
      nativeToScVal(requestHash, { type: 'bytes' }),
      nativeToScVal(responseHash, { type: 'bytes' }),
      SorobanHelper.str(receiptId),
    ]);
  }

  async getReceipt(receiptId: string): Promise<Receipt> {
    const result = await this.soroban.query(this.contractId, 'get_receipt', [
      SorobanHelper.str(receiptId),
    ]);
    return this.parse(SorobanHelper.native(result));
  }

  async getPayerReceipts(payer: string, limit = 10): Promise<Receipt[]> {
    const result = await this.soroban.query(this.contractId, 'get_payer_receipts', [
      SorobanHelper.addr(payer),
      SorobanHelper.u32(limit),
    ]);
    const raw = SorobanHelper.native(result);
    return Array.isArray(raw) ? raw.map((r: any) => this.parse(r)) : [];
  }

  async getPayeeReceipts(payee: string, limit = 10): Promise<Receipt[]> {
    const result = await this.soroban.query(this.contractId, 'get_payee_receipts', [
      SorobanHelper.addr(payee),
      SorobanHelper.u32(limit),
    ]);
    const raw = SorobanHelper.native(result);
    return Array.isArray(raw) ? raw.map((r: any) => this.parse(r)) : [];
  }

  async getRecentReceipts(limit = 10): Promise<Receipt[]> {
    const result = await this.soroban.query(this.contractId, 'get_recent_receipts', [
      SorobanHelper.u32(limit),
    ]);
    const raw = SorobanHelper.native(result);
    return Array.isArray(raw) ? raw.map((r: any) => this.parse(r)) : [];
  }

  async getReceiptCount(): Promise<number> {
    const result = await this.soroban.query(this.contractId, 'get_receipt_count', []);
    return Number(SorobanHelper.native(result));
  }

  async disputeReceipt(disputer: string, receiptId: string, reason: string): Promise<void> {
    await this.soroban.invoke(this.contractId, 'dispute_receipt', [
      SorobanHelper.addr(disputer),
      SorobanHelper.str(receiptId),
      SorobanHelper.str(reason),
    ]);
  }

  private parse(raw: any): Receipt {
    return {
      receiptId: String(raw.receipt_id ?? ''),
      payer: String(raw.payer ?? ''),
      payee: String(raw.payee ?? ''),
      serviceId: String(raw.service_id ?? ''),
      amount: BigInt(raw.amount ?? 0),
      requestHash: String(raw.request_hash ?? ''),
      responseHash: String(raw.response_hash ?? ''),
      timestamp: Number(raw.timestamp ?? 0),
      status: Number(raw.status ?? 0),
    };
  }
}
