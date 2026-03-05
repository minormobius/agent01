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
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return data as T;
}

// Auth
export const authStart = (handle: string) =>
  apiFetch<{ success?: boolean; authUrl?: string; session?: { did: string; handle: string } }>(
    '/api/auth/atproto/start',
    { method: 'POST', body: JSON.stringify({ handle }) }
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
}) => apiFetch<any>('/api/polls', { method: 'POST', body: JSON.stringify(data) });

export const getPoll = (id: string) => apiFetch<any>(`/api/polls/${id}`);

export const openPoll = (id: string) =>
  apiFetch<any>(`/api/polls/${id}/open`, { method: 'POST' });

export const closePoll = (id: string) =>
  apiFetch<any>(`/api/polls/${id}/close`, { method: 'POST' });

export const reopenPoll = (id: string) =>
  apiFetch<any>(`/api/polls/${id}/reopen`, { method: 'POST' });

export const publishPoll = (id: string) =>
  apiFetch<any>(`/api/polls/${id}/publish`, { method: 'POST' });

export const publishTally = (id: string) =>
  apiFetch<any>(`/api/polls/${id}/tally/publish`, { method: 'POST' });

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
