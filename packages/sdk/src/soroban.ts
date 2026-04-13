import {
  Contract,
  Keypair,
  Networks,
  rpc,
  TransactionBuilder,
  xdr,
  nativeToScVal,
  scValToNative,
  Address,
} from '@stellar/stellar-sdk';

const SOROBAN_URLS: Record<string, string> = {
  testnet: 'https://soroban-testnet.stellar.org',
  mainnet: 'https://soroban.stellar.org',
};

const NETWORK_PASSPHRASE: Record<string, string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
};

export class SorobanHelper {
  private server: rpc.Server;
  private keypair: Keypair;
  private networkPassphrase: string;

  constructor(
    private network: 'testnet' | 'mainnet',
    secretKey: string,
    sorobanUrl?: string,
  ) {
    this.server = new rpc.Server(sorobanUrl ?? SOROBAN_URLS[network]);
    this.keypair = Keypair.fromSecret(secretKey);
    this.networkPassphrase = NETWORK_PASSPHRASE[network];
  }

  get publicKey(): string {
    return this.keypair.publicKey();
  }

  async invoke(
    contractId: string,
    method: string,
    args: xdr.ScVal[],
    simulate = false,
  ): Promise<xdr.ScVal> {
    const account = await this.server.getAccount(this.keypair.publicKey());
    const contract = new Contract(contractId);

    const tx = new TransactionBuilder(account, {
      fee: '1000000',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const simResponse = await this.server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResponse)) {
      throw new Error(`Simulation failed: ${JSON.stringify(simResponse)}`);
    }

    if (simulate) {
      const successSim = simResponse as rpc.Api.SimulateTransactionSuccessResponse;
      if (successSim.result) return successSim.result.retval;
      throw new Error('No result from simulation');
    }

    const preparedTx = rpc.assembleTransaction(
      tx,
      simResponse as rpc.Api.SimulateTransactionSuccessResponse,
    ).build();

    preparedTx.sign(this.keypair);

    const sendResponse = await this.server.sendTransaction(preparedTx);
    if (sendResponse.status === 'ERROR') {
      throw new Error(`Send failed: ${JSON.stringify(sendResponse)}`);
    }

    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const getResponse = await this.server.getTransaction(sendResponse.hash);

      if (getResponse.status === 'SUCCESS') {
        const successResp = getResponse as rpc.Api.GetSuccessfulTransactionResponse;
        if (successResp.returnValue) return successResp.returnValue;
        return xdr.ScVal.scvVoid();
      }
      if (getResponse.status === 'FAILED') {
        throw new Error(`Transaction failed: ${JSON.stringify(getResponse)}`);
      }
    }

    throw new Error('Transaction timed out');
  }

  async query(contractId: string, method: string, args: xdr.ScVal[]): Promise<xdr.ScVal> {
    return this.invoke(contractId, method, args, true);
  }

  static addr(address: string): xdr.ScVal {
    return new Address(address).toScVal();
  }

  static str(s: string): xdr.ScVal {
    return nativeToScVal(s, { type: 'string' });
  }

  static i128(n: bigint): xdr.ScVal {
    return nativeToScVal(n, { type: 'i128' });
  }

  static u64(n: number | bigint): xdr.ScVal {
    return nativeToScVal(n, { type: 'u64' });
  }

  static u32(n: number): xdr.ScVal {
    return nativeToScVal(n, { type: 'u32' });
  }

  static bool(b: boolean): xdr.ScVal {
    return nativeToScVal(b, { type: 'bool' });
  }

  static native(val: xdr.ScVal): any {
    return scValToNative(val);
  }
}
