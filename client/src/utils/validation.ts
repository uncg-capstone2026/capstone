// Client-side checks for the auth forms. The server must enforce the same rules;
// these only catch mistakes early.

export function isValidEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text.trim());
}

// Phone numbers are US-only for now: shown as (336) 555-0123, sent as +13365550123.

export function phoneDigits(text: string): string {
  let digits = text.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

// Formats progressively while typing, so backspacing through ")" and "-" works naturally.
export function formatPhone(text: string): string {
  const digits = phoneDigits(text);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function isValidPhone(text: string): boolean {
  const digits = phoneDigits(text);
  return digits.length === 0 || digits.length === 10;
}

export function toE164(text: string): string | undefined {
  const digits = phoneDigits(text);
  return digits.length === 10 ? `+1${digits}` : undefined;
}

export const PASSWORD_RULES: { label: string; test: (password: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'An uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'A lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { label: 'A number', test: (pw) => /\d/.test(pw) },
];

export function meetsPasswordRules(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too weak' | 'Weak' | 'Fair' | 'Good' | 'Strong';
};

const STRENGTH_LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'] as const;

// Meeting the rules earns "Fair"; extra length and a symbol push it higher.
// Containing the user's name or email handle knocks it down a level.
export function getPasswordStrength(
  password: string,
  personal: { name?: string; email?: string } = {},
): PasswordStrength {
  let score: number;
  if (!meetsPasswordRules(password)) {
    score = password.length >= 8 ? 1 : 0;
  } else {
    score = 2;
    if (password.length >= 12) score += 1;
    if (password.length >= 16 || /[^A-Za-z0-9]/.test(password)) score += 1;

    const lower = password.toLowerCase();
    const personalWords = [
      ...(personal.name ?? '').toLowerCase().split(/\s+/),
      (personal.email ?? '').toLowerCase().split('@')[0],
    ].filter((word) => word.length >= 3);
    if (personalWords.some((word) => lower.includes(word))) score -= 1;
  }

  const clamped = Math.max(0, Math.min(4, score)) as PasswordStrength['score'];
  return { score: clamped, label: STRENGTH_LABELS[clamped] };
}
