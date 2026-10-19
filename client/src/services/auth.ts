import { isBackendConfigured } from '@/config/api';
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, SessionExpiredError } from '@/services/api';
import { getSentTimeZone, setSentTimeZone } from '@/services/preferences';
import { cancelReminders } from '@/services/reminders';
import { clearToken, getToken, saveToken } from '@/services/session';

export type LoginMode = 'email' | 'phone';

export type PasswordLoginInput = {
  mode: LoginMode;
  identifier: string;
  password: string;
};

export type SignUpInput = {
  name: string;
  email: string;
  phone?: string;
  password: string;
};

// GET /api/auth/me, and `user` in the login and sign-up responses.
export type PublicUser = { id: string; name: string; displayName: string | null; email: string; phone: string | null };

type AuthResponse = {
  token: string;
  user: PublicUser;
};

// Thrown when sign-up hits an email or phone that already has an account (409),
// so the screen can show it under that field.
export class TakenFieldError extends Error {
  constructor(readonly field: 'email' | 'phone') {
    super(
      field === 'email'
        ? 'An account with this email already exists.'
        : 'An account with this phone number already exists.',
    );
  }
}

// Signed in means a token is stored. It isn't checked with the server here, so an
// expired token (they last 30 days) shows up as a 401 on the first request instead.
export async function isSignedIn(): Promise<boolean> {
  try {
    return Boolean(await getToken());
  } catch {
    return false;
  }
}

// GET /api/auth/me: the signed-in user, for the Settings profile card and the Account screen.
export function getMe(): Promise<PublicUser> {
  return apiGet<PublicUser>('/api/auth/me');
}

// Also clears outfit reminders, so this account's plans don't notify the next person to sign in.
export async function signOut(): Promise<void> {
  await cancelReminders();
  await clearToken();
}

export type ProfileChanges = {
  name?: string;
  displayName?: string | null;
  phone?: string | null; // E.164, e.g. +13365550123; null removes it
};

// PATCH /api/auth/me { name?, displayName?, phone? } -> the updated user. 409 means another
// account has the phone number; 400 messages (e.g. an invalid phone) are written for the user.
export async function updateProfile(changes: ProfileChanges): Promise<PublicUser> {
  try {
    return await apiPatch<PublicUser>('/api/auth/me', changes);
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) throw new TakenFieldError('phone');
    throw toAuthError(e);
  }
}

// PATCH /api/auth/me { email }. The server doesn't accept email yet (400 "email can't be
// changed here"); see PLAN.md section 9. 409 means another account has the email.
export async function updateEmail(email: string): Promise<PublicUser> {
  try {
    return await apiPatch<PublicUser>('/api/auth/me', { email });
  } catch (e) {
    if (e instanceof ApiError && e.status === 400 && e.serverMessage?.includes("can't be changed")) {
      throw new Error("Changing your email isn't available yet.");
    }
    if (e instanceof ApiError && e.status === 409) throw new TakenFieldError('email');
    throw toAuthError(e);
  }
}

// POST /api/auth/me/password { currentPassword, newPassword } -> 204. Not on the server yet
// (404); see PLAN.md section 9. A wrong current password must be a 400, not a 401, since
// apiRequest treats any 401 as an expired session and signs the user out.
export async function changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
  try {
    await apiPost<void>('/api/auth/me/password', input);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) throw new Error("Changing your password isn't available yet.");
    throw toAuthError(e);
  }
}

// DELETE /api/auth/me -> 204, then signs out. Not on the server yet (404); see PLAN.md section 9.
export async function deleteAccount(): Promise<void> {
  try {
    await apiDelete('/api/auth/me');
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) throw new Error("Deleting your account isn't available yet.");
    throw toAuthError(e);
  }
  await cancelReminders();
  await clearToken();
}

// POST /api/auth/login takes { email, password } or { phone, password }.
export async function loginWithPassword({ mode, identifier, password }: PasswordLoginInput): Promise<void> {
  if (!isBackendConfigured) {
    throw new Error('Login needs EXPO_PUBLIC_API_URL to be set.');
  }

  const body = mode === 'email' ? { email: identifier, password } : { phone: identifier, password };
  try {
    const { token } = await apiPost<AuthResponse>('/api/auth/login', body);
    await saveToken(token);
    void syncTimeZone({ force: true });
  } catch (e) {
    throw toAuthError(e);
  }
}

// Until EXPO_PUBLIC_API_URL is set, this resolves locally so the onboarding flow stays walkable.
export async function signUpWithPassword(input: SignUpInput): Promise<void> {
  if (!isBackendConfigured) return;

  try {
    const { token } = await apiPost<AuthResponse>('/api/auth/signup', input);
    await saveToken(token);
    void syncTimeZone({ force: true });
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      throw new TakenFieldError(e.serverMessage?.toLowerCase().includes('phone') ? 'phone' : 'email');
    }
    throw toAuthError(e);
  }
}

// PATCH /api/auth/me { timeZone }, so the server counts planned outfits as worn at the user's
// own midnight. Sent when the app opens if the device's time zone has changed since it was last
// sent (e.g. after travelling), and always after login, since the device may have been used by
// another account. A failure is ignored and retried next launch.
export async function syncTimeZone({ force = false } = {}): Promise<void> {
  const timeZone = deviceTimeZone();
  if (!isBackendConfigured || !timeZone) return;
  try {
    if (!force && (await getSentTimeZone()) === timeZone) return;
    await apiPatch<void>('/api/auth/me', { timeZone });
    await setSentTimeZone(timeZone);
  } catch (e) {
    if (__DEV__ && !(e instanceof SessionExpiredError)) console.warn('Could not send the time zone:', e);
  }
}

// The device's IANA time zone, e.g. "America/Chicago". No permission or package needed.
function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

// The server's 400/401 messages are written for users ("Incorrect email/phone or password").
function toAuthError(e: unknown): Error {
  if (e instanceof SessionExpiredError) return e;
  if (e instanceof ApiError && (e.status === 400 || e.status === 401) && e.serverMessage) {
    return new Error(e.serverMessage);
  }
  if (e instanceof ApiError) return e;
  return new Error("Couldn't reach StyleMe. Check your connection and try again.");
}
