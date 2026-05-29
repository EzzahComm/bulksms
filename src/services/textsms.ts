import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../lib/logger';

/**
 * TextSMS Kenya provider client (https://sms.textsms.co.ke).
 *
 * Endpoints used:
 *   POST /api/services/sendsms/    single message
 *   POST /api/services/sendbulk/   batched messages
 *   POST /api/services/getbalance/ account balance
 *
 * Set SMS_DRY_RUN=true to simulate sends without contacting the provider
 * (useful before live credentials are configured).
 */

export interface ProviderResult {
  phone: string;
  success: boolean;
  providerMessageId?: string;
  responseCode?: number | string;
  error?: string;
  clientRef?: string;
}

interface TextSmsResponseItem {
  'response-code'?: number;
  'response-description'?: string;
  messageid?: string | number;
  mobile?: string | number;
  clientsmsid?: string | number;
  networkid?: string;
}

const SUCCESS_CODES = new Set([200, 201, 1000]);

export class TextSmsService {
  private readonly baseUrl = env.sms.baseUrl.replace(/\/$/, '');

  get dryRun(): boolean {
    return env.sms.dryRun || !env.sms.apiKey || !env.sms.partnerId;
  }

  /** Send one message. */
  async sendSingle(phone: string, message: string, shortcode?: string): Promise<ProviderResult> {
    const results = await this.sendBulk([{ phone, message }], shortcode);
    return results[0];
  }

  /**
   * Send a batch. TextSMS caps batch size; we chunk to 100 per request.
   * Each item may carry a clientRef echoed back for reconciliation.
   */
  async sendBulk(
    items: Array<{ phone: string; message: string; clientRef?: string }>,
    shortcode?: string,
  ): Promise<ProviderResult[]> {
    const sender = shortcode || env.sms.defaultShortcode;

    if (this.dryRun) {
      return items.map((it) => ({
        phone: it.phone,
        success: true,
        providerMessageId: `dry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        responseCode: 200,
        clientRef: it.clientRef,
      }));
    }

    const out: ProviderResult[] = [];
    const chunks = chunk(items, 100);

    for (const batch of chunks) {
      const smslist = batch.map((it, idx) => ({
        partnerID: env.sms.partnerId,
        apikey: env.sms.apiKey,
        mobile: it.phone,
        message: it.message,
        shortcode: sender,
        clientsmsid: it.clientRef ?? `${Date.now()}_${idx}`,
      }));

      try {
        const { data } = await axios.post(
          `${this.baseUrl}/api/services/sendbulk/`,
          { count: smslist.length, smslist },
          { timeout: 30000, headers: { 'Content-Type': 'application/json' } },
        );

        const responses: TextSmsResponseItem[] = data?.responses ?? data?.SMSLeopardResponse ?? [];
        out.push(...this.mapResponses(batch, responses));
      } catch (err) {
        logger.error({ err, size: batch.length }, 'TextSMS bulk request failed');
        out.push(
          ...batch.map((it) => ({
            phone: it.phone,
            success: false,
            error: err instanceof Error ? err.message : 'provider_request_failed',
            clientRef: it.clientRef,
          })),
        );
      }
    }
    return out;
  }

  async getBalance(): Promise<{ balance?: number; raw?: unknown; error?: string }> {
    if (this.dryRun) return { balance: undefined, raw: { dryRun: true } };
    try {
      const { data } = await axios.post(
        `${this.baseUrl}/api/services/getbalance/`,
        { apikey: env.sms.apiKey, partnerID: env.sms.partnerId },
        { timeout: 15000, headers: { 'Content-Type': 'application/json' } },
      );
      return { balance: Number(data?.credit ?? data?.balance), raw: data };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'balance_failed' };
    }
  }

  private mapResponses(
    batch: Array<{ phone: string; clientRef?: string }>,
    responses: TextSmsResponseItem[],
  ): ProviderResult[] {
    // Match provider responses back to inputs by mobile (fallback to order).
    return batch.map((it, idx) => {
      const r =
        responses.find((x) => String(x.mobile) === it.phone) ?? responses[idx] ?? {};
      const code = r['response-code'];
      const success = code !== undefined && SUCCESS_CODES.has(Number(code));
      return {
        phone: it.phone,
        success,
        providerMessageId: r.messageid !== undefined ? String(r.messageid) : undefined,
        responseCode: code,
        error: success ? undefined : r['response-description'] ?? 'send_failed',
        clientRef: it.clientRef,
      };
    });
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const textSms = new TextSmsService();
