import { BadRequestException } from '@nestjs/common';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && EMAIL_PATTERN.test(email.trim());
}

// Same rule as the sign-up screen: trim + lowercase.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// US only for now. Accepts "(336) 555-0123", "336-555-0123", "+13365550123", etc.
// Always returns E.164: +13365550123
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  throw new BadRequestException('Enter a valid US phone number');
}

// Same rule as the sign-up screen: 8+ chars, an uppercase, a lowercase and a number.
export function assertStrongPassword(password: unknown): asserts password is string {
  const ok =
    typeof password === 'string' &&
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password);
  if (!ok) {
    throw new BadRequestException(
      'Password must be at least 8 characters and include an uppercase letter, a lowercase letter and a number',
    );
  }
}