export type ConciergeEvent =
  | { type: 'session_started'; query: string; at: number }
  | { type: 'wallet_info'; address: string; network: string; at: number }
  | { type: 'budget_set'; maxPerCall: number; maxDaily: number; at: number }
  | { type: 'agent_thinking'; iteration: number; at: number }
  | { type: 'agent_text'; text: string; at: number }
  | { type: 'tool_start'; tool: string; input: any; at: number }
  | {
      type: 'services_discovered';
      services: Array<{
        id: string;
        description: string;
        category: string;
        pricePerCallUsdc: number;
        provider: string;
        active: boolean;
      }>;
      at: number;
    }
  | { type: 'budget_remaining'; daily: number; session: number; at: number }
  | {
      type: 'payment_start';
      service: string;
      price: number;
      provider: string;
      params: Record<string, string>;
      at: number;
    }
  | {
      type: 'payment_settled';
      service: string;
      price: number;
      transaction?: string;
      receiptId?: string;
      data: unknown;
      at: number;
    }
  | {
      type: 'spending_report';
      receipts: Array<{
        receiptId: string;
        serviceId: string;
        amountUsdc: number;
        payee: string;
        timestamp: number;
      }>;
      at: number;
    }
  | { type: 'budget_exceeded'; tool: string; message: string; at: number }
  | { type: 'tool_error'; tool?: string; message: string; at: number }
  | { type: 'agent_error'; message: string; at: number }
  | { type: 'final_answer'; text: string; at: number };

export interface Service {
  id: string;
  description: string;
  category: string;
  pricePerCallUsdc: number;
  provider: string;
  active: boolean;
}

export interface Payment {
  id: string;
  service: string;
  price: number;
  provider: string;
  params: Record<string, string>;
  status: 'pending' | 'settled' | 'failed';
  transaction?: string;
  receiptId?: string;
  startedAt: number;
  settledAt?: number;
}
