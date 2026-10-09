import { BadRequestException } from '@nestjs/common';
import { normalizePhone } from './auth.utils';

// Checks and cleans the body of PATCH /api/auth/me. Every field is optional,
// but at least one must be sent. Throws a 400 with a message the app can show.

export type ProfileChanges = {
  name?: string;
  displayName?: string | null;
  phone?: string | null; // E.164, e.g. +13365550123
  timeZone?: string;
};

const EDITABLE = ['name', 'displayName', 'phone', 'timeZone'];
const NAME_MAX_LENGTH = 50;

export function parseProfileChanges(body: unknown): ProfileChanges {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Nothing to update');
  const input = body as Record<string, unknown>;

  // Email, password and the like can't be changed through this route.
  const other = Object.keys(input).find((key) => !EDITABLE.includes(key));
  if (other) throw bad(`${other} can't be changed here`);

  const changes: ProfileChanges = {};
  if (input.name !== undefined) changes.name = readName(input.name, 'Name') ?? undefined;
  if (input.displayName !== undefined) changes.displayName = readName(input.displayName, 'Display name', { allowEmpty: true });
  if (input.phone !== undefined) changes.phone = readPhone(input.phone);
  if (input.timeZone !== undefined) {
    if (!isValidTimeZone(input.timeZone)) throw bad('Unknown time zone');
    changes.timeZone = input.timeZone;
  }

  if (Object.keys(changes).length === 0) throw bad('Nothing to update');
  return changes;
}

// Trimmed, 1-50 characters. With allowEmpty, null or "" clears it (returns null).
function readName(value: unknown, label: string, { allowEmpty = false } = {}): string | null {
  if (value === null && allowEmpty) return null;
  if (typeof value !== 'string') throw bad(`${label} must be text`);
  const name = value.replace(/\s+/g, ' ').trim();
  if (!name) {
    if (allowEmpty) return null;
    throw bad(`${label} is required`);
  }
  if (name.length > NAME_MAX_LENGTH) throw bad(`${label} can be at most ${NAME_MAX_LENGTH} characters`);
  return name;
}

// null or "" removes the phone number; anything else must be a valid US number.
function readPhone(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw bad('Enter a valid US phone number');
  return normalizePhone(value); // 400 "Enter a valid US phone number" if it isn't one
}

// An IANA name like "America/Chicago" that Intl recognizes. Raw offsets like
// "+05:00" are rejected: Postgres reads their sign the opposite way.
const TIME_ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 100 || !TIME_ZONE_NAME.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }); // throws RangeError if unknown
    return true;
  } catch {
    return false;
  }
}

function bad(message: string) {
  return new BadRequestException(message);
}