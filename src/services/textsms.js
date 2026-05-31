import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Bulk SMS gateway client for TextSMS Kenya and Advanta Africa.
 *
 * Both providers expose an identical API (same payload + endpoints); only the
 * base host differs, selected via SMS_PROVIDER / SMS_BASE_URL (see config/env).
 *   POST /api/services/sendsms/    single message
 *   POST /api/services/sendbulk/   batched messages
 *   POST /api/services/getbalance/ account balance
 *
 * Set SMS_DRY_RUN=true to simulate sends without contacting the provider.
 *
 * @typedef {Object} ProviderResult
 * @property {string} phone
 * @property {boolean} success
 * @property {string} [providerMessageId]
 * @property {number|string} [responseCode]
 * @property {string} [error]
 * @property {string} [clientRef]
 */

const SUCCESS_CODES = new Set([200, 201, 1000]);

// Gateway response codes (shared by TextSMS + Advanta) → human-readable reason.
const ERROR_CODES = {
  1001: 'Invalid sender ID / shortcode',
  1002: 'Network not allowed',
  1003: 'Invalid mobile number',
  1004: 'Low bulk credits',
  1005: 'Failed — system error',
  1006: 'Invalid credentials (API key or partner ID)',
  1007: 'Delivery failed',
  1008: 'No delivery report',
  1009: 'Unsupported data type',
  1010: 'Unsupported request type',
  4090: 'Internal error — retry after 5 minutes',
  4091: 'No partner ID set',
  4092: 'No API key provided',
  4093: 'Account details not found',
};

export class TextSmsService {
  constructor() {
    this.baseUrl = env.sms.baseUrl.replace(/\/$/, '');
  }

  get dryRun() {
    return env.sms.dryRun || !env.sms.apiKey || !env.sms.partnerId;
  }

  /**
   * Send one message.
   * @returns {Promise<ProviderResult>}
   */
  async sendSingle(phone, message, shortcode, options = {}) {
    const results = await this.sendBulk([{ phone, message }], shortcode, options);
    return results[0];
  }

  /**
   * Send a batch (chunked to 100 per request).
   * @param {Array<{ phone: string, message: string, clientRef?: string, timeToSend?: string }>} items
   * @param {string} [shortcode]
   * @param {{ timeToSend?: string }} [options]  optional provider-side schedule
   *        (date string / Unix timestamp) applied to items without their own.
   * @returns {Promise<ProviderResult[]>}
   */
  async sendBulk(items, shortcode, options = {}) {
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

    const out = [];
    const chunks = chunk(items, 100);

    for (const batch of chunks) {
      const smslist = batch.map((it, idx) => {
        const entry = {
          partnerID: env.sms.partnerId,
          apikey: env.sms.apiKey,
          mobile: it.phone,
          message: it.message,
          shortcode: sender,
          clientsmsid: it.clientRef ?? `${Date.now()}_${idx}`,
        };
        // Optional provider-side scheduling (date string or Unix timestamp).
        const when = it.timeToSend ?? options.timeToSend;
        if (when) entry.timeToSend = when;
        return entry;
      });

      try {
        const { data } = await axios.post(
          `${this.baseUrl}/api/services/sendbulk/`,
          { count: smslist.length, smslist },
          { timeout: 30000, headers: { 'Content-Type': 'application/json' } },
        );

        const responses = data?.responses ?? data?.SMSLeopardResponse ?? [];
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

  async getBalance() {
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

  mapResponses(batch, responses) {
    return batch.map((it, idx) => {
      const r = responses.find((x) => String(x.mobile) === it.phone) ?? responses[idx] ?? {};
      const code = r['response-code'];
      const success = code !== undefined && SUCCESS_CODES.has(Number(code));
      return {
        phone: it.phone,
        success,
        providerMessageId: r.messageid !== undefined ? String(r.messageid) : undefined,
        responseCode: code,
        error: success
          ? undefined
          : (ERROR_CODES[Number(code)] ?? r['response-description'] ?? 'send_failed'),
        clientRef: it.clientRef,
      };
    });
  }
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const textSms = new TextSmsService();
