/**
 * Kenyan MSISDN normalisation + GSM segment counting.
 */

const GSM_SINGLE_LIMIT = 160;
const GSM_CONCAT_SEGMENT = 153;
const UCS2_SINGLE_LIMIT = 70;
const UCS2_CONCAT_SEGMENT = 67;

// Characters representable in the GSM 03.38 7-bit alphabet (subset check).
// Anything outside forces UCS-2 (unicode) encoding, which shortens segments.
const GSM_7BIT =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = '^{}\\[~]|€';

/**
 * Normalise a Kenyan phone number to the 2547XXXXXXXX / 2541XXXXXXXX form.
 * Returns null if it can't be made valid.
 * @param {string} input
 * @returns {string|null}
 */
export function normalizeKePhone(input) {
  if (!input) return null;
  let s = String(input).replace(/[\s\-()]/g, '');
  if (s.startsWith('+')) s = s.slice(1);

  if (/^0[17]\d{8}$/.test(s)) s = '254' + s.slice(1); // 07.. / 01.. -> 2547.. / 2541..
  else if (/^[17]\d{8}$/.test(s)) s = '254' + s; // 7.. / 1.. (9 digits)

  return /^254[17]\d{8}$/.test(s) ? s : null;
}

/**
 * Count GSM segments for billing.
 * @param {string} message
 * @returns {number}
 */
export function countSegments(message) {
  let unicode = false;
  let length = 0;

  for (const ch of message) {
    if (GSM_7BIT.includes(ch)) {
      length += 1;
    } else if (GSM_EXT.includes(ch)) {
      length += 2; // escape + char
    } else {
      unicode = true;
      break;
    }
  }

  if (unicode) {
    const units = [...message].reduce(
      (acc, ch) => acc + (ch.codePointAt(0) > 0xffff ? 2 : 1),
      0,
    );
    if (units <= UCS2_SINGLE_LIMIT) return 1;
    return Math.ceil(units / UCS2_CONCAT_SEGMENT);
  }

  if (length <= GSM_SINGLE_LIMIT) return 1;
  return Math.ceil(length / GSM_CONCAT_SEGMENT);
}
