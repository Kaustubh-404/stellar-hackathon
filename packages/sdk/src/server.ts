import express from 'express';
import cors from 'cors';
import { createHash } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { x402HTTPResourceServer } from '@x402/core/server';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactStellarScheme } from '@x402/stellar/exact/server';
import { RegistryClient } from './registry.js';
import { ReceiptsClient } from './receipts.js';
import { usdcToStroops, stroopsToUsdc } from './types.js';
import type { SkillConfig, AgentPayServerConfig } from './types.js';

interface SkillEntry extends SkillConfig {
  name: string;
}

export class AgentPayServer {
  private config: AgentPayServerConfig;
  private keypair: Keypair;
  private skills: Map<string, SkillEntry> = new Map();
  private registry: RegistryClient;
  private receipts: ReceiptsClient;
  private facilitator: HTTPFacilitatorClient;
  private app: express.Application;

  constructor(config: AgentPayServerConfig) {
    this.config = config;
    this.keypair = Keypair.fromSecret(config.secretKey);
    this.registry = new RegistryClient(
      config.registryContract,
      config.network,
      config.secretKey,
    );
    this.receipts = new ReceiptsClient(
      config.receiptContract,
      config.network,
      config.secretKey,
    );
    this.facilitator = new HTTPFacilitatorClient({
      url: config.facilitatorUrl ?? 'https://x402.org/facilitator',
    });
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());
  }

  get address(): string {
    return this.keypair.publicKey();
  }

  skill(name: string, config: SkillConfig): this {
    this.skills.set(name, { ...config, name });
    return this;
  }

  async start(opts: { port?: number; registerOnChain?: boolean } = {}): Promise<void> {
    const port = opts.port ?? 3001;
    const registerOnChain = opts.registerOnChain ?? true;
    const network = (this.config.network === 'testnet' ? 'stellar:testnet' : 'stellar:pubnet') as `stellar:${'testnet' | 'pubnet'}`;

    // Health endpoint
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        provider: this.address,
        skills: Array.from(this.skills.keys()),
        network: this.config.network,
      });
    });

    // List available skills
    this.app.get('/skills', (_req, res) => {
      const list = Array.from(this.skills.values()).map((s) => ({
        name: s.name,
        price: s.price,
        category: s.category,
        description: s.description,
        endpoint: `/skill/${s.name}`,
      }));
      res.json({ skills: list, provider: this.address });
    });

    // Create x402-gated routes for each skill
    for (const [name, skill] of this.skills) {
      const routePath = `/skill/${name}`;

      this.app.all(routePath, async (req, res) => {
        // Check for x402 v2 payment signature header
        const paymentHeader =
          (req.headers['payment-signature'] as string | undefined) ??
          (req.headers['x-payment'] as string | undefined);

        const usdcAsset = this.config.network === 'testnet'
          ? 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'
          : 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75';

        const paymentRequirements = {
          scheme: 'exact' as const,
          network,
          amount: String(usdcToStroops(skill.price)),
          payTo: this.address,
          maxTimeoutSeconds: 60,
          asset: usdcAsset,
          extra: { areFeesSponsored: true } as Record<string, unknown>,
        };

        if (!paymentHeader) {
          // Return 402 with payment requirements
          const paymentRequired = {
            x402Version: 2,
            resource: { url: routePath, description: skill.description, mimeType: 'application/json' },
            accepts: [paymentRequirements],
          };

          const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');
          res.status(402);
          res.setHeader('PAYMENT-REQUIRED', encoded);
          res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED, PAYMENT-RESPONSE');
          res.json({
            error: 'Payment Required',
            price: `${skill.price} USDC`,
            skill: name,
            ...paymentRequired,
          });
          return;
        }

        // Payment present — verify via facilitator
        try {
          const paymentPayload = JSON.parse(
            Buffer.from(paymentHeader, 'base64').toString('utf-8'),
          );

          // Verify payment
          const verifyResult = await this.facilitator.verify(
            paymentPayload,
            paymentRequirements,
          );

          if (!verifyResult.isValid) {
            res.status(402).json({ error: 'Payment verification failed' });
            return;
          }

          // Settle payment
          const settleResult = await this.facilitator.settle(
            paymentPayload,
            paymentRequirements,
          );

          if (!settleResult.success) {
            res.status(402).json({
              error: 'Payment settlement failed',
              reason: settleResult.errorMessage,
            });
            return;
          }

          // Payment verified + settled — execute skill handler
          const params = { ...req.query, ...req.body } as Record<string, string>;
          const result = await skill.handler(params);

          // Post receipt on-chain (async, don't block response)
          const requestHash = createHash('sha256')
            .update(JSON.stringify(params))
            .digest();
          const responseHash = createHash('sha256')
            .update(JSON.stringify(result))
            .digest();
          const receiptId = createHash('sha256')
            .update(`${settleResult.transaction}:${Date.now()}`)
            .digest('hex')
            .slice(0, 32);

          try {
            await this.receipts.postReceipt(
              settleResult.payer ?? this.address,
              this.address,
              name,
              usdcToStroops(skill.price),
              requestHash,
              responseHash,
              receiptId,
            );
            console.log(`  Receipt ${receiptId.slice(0, 8)}... posted on-chain`);
          } catch (err: any) {
            console.error(`  Receipt posting failed:`, err.message);
          }

          try {
            await this.registry.recordCall(this.address, name, usdcToStroops(skill.price));
            console.log(`  Call recorded in registry for '${name}'`);
          } catch (err: any) {
            console.error(`  recordCall failed:`, err.message);
          }

          // Return result with payment receipt header
          res.setHeader(
            'PAYMENT-RESPONSE',
            Buffer.from(JSON.stringify(settleResult)).toString('base64'),
          );
          res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-RESPONSE');
          res.json({
            data: result,
            payment: {
              amount: `${skill.price} USDC`,
              transaction: settleResult.transaction,
              receiptId,
            },
          });

          console.log(
            `  [${name}] Paid call from ${(settleResult.payer ?? 'unknown').slice(0, 8)}... ` +
            `| ${skill.price} USDC | tx: ${settleResult.transaction.slice(0, 12)}...`,
          );
        } catch (err: any) {
          console.error(`  [${name}] Payment error:`, err.message);
          res.status(402).json({ error: 'Payment processing failed', details: err.message });
        }
      });
    }

    // Register skills on-chain
    if (registerOnChain) {
      const baseUrl = `http://localhost:${port}`;
      for (const [name, skill] of this.skills) {
        let existing = false;
        try {
          await this.registry.getService(name);
          existing = true;
        } catch {
          existing = false;
        }

        if (existing) {
          console.log(`  Skill '${name}' already registered on-chain`);
          continue;
        }

        try {
          await this.registry.registerService(
            this.address,
            name,
            `${baseUrl}/skill/${name}`,
            usdcToStroops(skill.price),
            skill.description,
            skill.category,
          );
          console.log(
            `  Skill '${name}' registered on-chain ` +
            `(${skill.price} USDC/call, category: ${skill.category})`,
          );
        } catch (err: any) {
          console.error(`  Failed to register '${name}':`, err.message);
        }
      }
    }

    // Start server
    this.app.listen(port, () => {
      console.log(`\nAgentPay server running on :${port}`);
      console.log(`  Provider: ${this.address}`);
      console.log(`  Network:  ${this.config.network}`);
      console.log(`  Skills:   ${Array.from(this.skills.keys()).join(', ')}`);
      console.log(`  Registry: ${this.config.registryContract.slice(0, 12)}...`);
      console.log();
    });
  }
}

export { AgentPayServer as default };
