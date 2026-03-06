/**
 * API client for the anonymous polls backend.
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    const detail = [data.error, data.message, data.step].filter(Boolean).join(' — ');
    throw new Error(detail || `API error: ${res.status}`);
  }
  return data as T;
}

// Auth
export const authStart = (handle: string, appPassword?: string) =>
  apiFetch<{ success?: boolean; authUrl?: string; session?: { did: string; handle: string }; refreshToken?: string }>(
    '/api/auth/atproto/start',
    { method: 'POST', body: JSON.stringify({ handle, appPassword }) }
  );

export const authRefresh = (refreshToken: string) =>
  apiFetch<{ success: boolean; session: { did: string; handle: string } }>(
    '/api/auth/refresh',
    { method: 'POST', body: JSON.stringify({ refreshToken }) }
  );

export const authLogout = () =>
  apiFetch<{ success: boolean }>('/api/auth/logout', { method: 'POST' });

export const getMe = () =>
  apiFetch<{ did: string; handle: string }>('/api/me');

// Polls
export const createPoll = (data: {
  question: string;
  options: string[];
  opensAt: string;
  closesAt: string;
  mode?: string;
  eligibilityMode?: string;
  eligibilitySource?: string;
  whitelistedDids?: string[];
}) => apiFetch<any>('/api/polls', { method: 'POST', body: JSON.stringify(data) });

export const syncEligibleDids = (id: string) =>
  apiFetch<any>(`/api/polls/${id}/eligible/sync`, { method: 'POST' });

export const getEligibleDids = (id: string) =>
  apiFetch<any>(`/api/polls/${id}/eligible`);

export const listPolls = (status?: string) =>
  apiFetch<{ polls: any[] }>(`/api/polls${status ? `?status=${status}` : ''}`);

export const getPoll = (id: string) => apiFetch<any>(`/api/polls/${id}`);

export const openPoll = (id: string) =>
  apiFetch<any>(`/api/polls/${id}/open`, { method: 'POST' });

export const closePoll = (id: string) =>
  apiFetch<any>(`/api/polls/${id}/close`, { method: 'POST' });

export const finalizePoll = (id: string) =>
  apiFetch<any>(`/api/polls/${id}/finalize`, { method: 'POST' });

export const deletePoll = (id: string) =>
  apiFetch<any>(`/api/polls/${id}`, { method: 'DELETE' });

export const publishPoll = (id: string) =>
  apiFetch<any>(`/api/polls/${id}/publish`, { method: 'POST' });

export const publishTally = (id: string) =>
  apiFetch<any>(`/api/polls/${id}/tally/publish`, { method: 'POST' });

export const publishBallots = (id: string) =>
  apiFetch<any>(`/api/polls/${id}/ballots/publish`, { method: 'POST' });

// Eligibility & voting
export const requestEligibility = (pollId: string, blindedMessage?: string) =>
  apiFetch<any>(`/api/polls/${pollId}/eligibility/request`, {
    method: 'POST',
    body: JSON.stringify({ blindedMessage }),
  });

export const submitBallot = (pollId: string, ballot: {
  choice: number;
  tokenMessage: string;
  issuerSignature: string;
  nullifier: string;
  ballotVersion: number;
}) => apiFetch<any>(`/api/polls/${pollId}/ballots/submit`, {
  method: 'POST',
  body: JSON.stringify(ballot),
});

// Public data
export const getBallots = (pollId: string) =>
  apiFetch<{ ballots: any[] }>(`/api/polls/${pollId}/ballots`);

export const getTally = (pollId: string) => apiFetch<any>(`/api/polls/${pollId}/tally`);

export const getAudit = (pollId: string) =>
  apiFetch<{ events: any[] }>(`/api/polls/${pollId}/audit`);
