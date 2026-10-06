import { isBackendConfigured } from '@/config/api';
import { ApiError, apiPost } from '@/services/api';
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
  marketingOptIn: boolean;
};

type AuthResponse = {
  token: string;
  user: { id: string; name: string; displayName: string | null; email: string; phone: string | null };
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

export async function signOut(): Promise<void> {
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
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      throw new TakenFieldError(e.serverMessage?.toLowerCase().includes('phone') ? 'phone' : 'email');
    }
    throw toAuthError(e);
  }
}

// The server's 400/401 messages are written for users ("Incorrect email/phone or password").
function toAuthError(e: unknown): Error {
  if (e instanceof ApiError && (e.status === 400 || e.status === 401) && e.serverMessage) {
    return new Error(e.serverMessage);
  }
  if (e instanceof ApiError) return e;
  return new Error("Couldn't reach StyleMe. Check your connection and try again.");
}

export async function continueWithGoogle(): Promise<void> {
  throw new Error('Sign in with Google is not wired up to a backend yet.');
}
