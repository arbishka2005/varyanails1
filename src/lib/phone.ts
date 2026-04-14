export const PHONE_PREFIX = "+7";
const PHONE_LOCAL_DIGITS = 10;

function stripToDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function getPhoneNationalDigits(value: string) {
  const digits = stripToDigits(value);

  if (!digits) {
    return "";
  }

  if (digits.startsWith("7") || digits.startsWith("8")) {
    return digits.slice(1, PHONE_LOCAL_DIGITS + 1);
  }

  return digits.slice(0, PHONE_LOCAL_DIGITS);
}

export function normalizePhoneInput(value: string) {
  const nationalDigits = getPhoneNationalDigits(value);
  const parts: string[] = [];

  if (nationalDigits.length > 0) {
    parts.push(nationalDigits.slice(0, 3));
  }

  if (nationalDigits.length > 3) {
    parts.push(nationalDigits.slice(3, 6));
  }

  if (nationalDigits.length > 6) {
    parts.push(nationalDigits.slice(6, 8));
  }

  if (nationalDigits.length > 8) {
    parts.push(nationalDigits.slice(8, 10));
  }

  return [PHONE_PREFIX, ...parts].join(" ").trim();
}

export function isPhoneComplete(value: string) {
  return getPhoneNationalDigits(value).length === PHONE_LOCAL_DIGITS;
}

export function toStoredPhone(value: string) {
  const nationalDigits = getPhoneNationalDigits(value);
  return nationalDigits ? `${PHONE_PREFIX}${nationalDigits}` : PHONE_PREFIX;
}
