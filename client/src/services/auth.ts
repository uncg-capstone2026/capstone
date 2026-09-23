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

// TODO: point these at the Next.js auth API once it exists. No persistence yet.

export async function loginWithPassword(_input: PasswordLoginInput): Promise<void> {
  throw new Error('Email/phone login is not wired up to a backend yet.');
}

// Resolves for now so the post-sign-up onboarding flow is reachable.
export async function signUpWithPassword(_input: SignUpInput): Promise<void> {}

export async function continueWithApple(): Promise<void> {
  throw new Error('Sign in with Apple is not wired up to a backend yet.');
}

export async function continueWithGoogle(): Promise<void> {
  throw new Error('Sign in with Google is not wired up to a backend yet.');
}
