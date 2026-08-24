const PHONE_PATTERN = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const ID_CARD_PATTERN =
  /(?<!\d)[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)/g;
const BANK_CARD_PATTERN = /(?<!\d)\d{16,19}(?!\d)/g;

export function redactSensitiveText(text: string): string {
  return text
    .replace(PHONE_PATTERN, '[PHONE]')
    .replace(ID_CARD_PATTERN, '[ID_CARD]')
    .replace(BANK_CARD_PATTERN, '[BANK_CARD]');
}
