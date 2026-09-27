import { API_BASE_URL } from '@/config/api';
import { getToken } from '@/services/session';

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Adds the stored session token as a Bearer header when there is one, so routes behind
// the server's AuthGuard work without each caller handling it.
async function apiRequest<T>(path: string, init: RequestInit): Promise<T> {
  const token = await getToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    throw new ApiError(response.status, await readServerMessage(response));
  }
  return (await response.json()) as T;
}

// `message` stays generic so it's safe to show anywhere. Callers that know a route's
// errors (e.g. auth) can check `status` and show `serverMessage` instead.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly serverMessage: string | null,
  ) {
    super('Something went wrong. Please try again.');
  }
}

// NestJS error bodies look like { statusCode, message, error }, where message can be a list.
async function readServerMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string') return body.message;
    if (Array.isArray(body.message)) return body.message.join(' ');
  } catch {
    // Not JSON.
  }
  return null;
}
