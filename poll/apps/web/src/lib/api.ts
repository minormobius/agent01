/**
 * API client for ATPolls backend.
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

export const authOAuthStart = (handle: string, returnTo?: string, scope?: string) =>
  apiFetch<{ authUrl: string }>(
    '/api/auth/oauth/start',
    { method: 'POST', body: JSON.stringify({ handle, returnTo, scope }) }
  );

export const authRefresh = (refreshToken: string) =>
  apiFetch<{ success: boolean; session: { did: string; handle: string } }>(
    '/api/auth/refresh',
    { method: 'POST', body: JSON.stringify({ refreshToken }) }
  );

export const authLogout = () =>
  apiFetch<{ success: boolean }>('/api/auth/logout', { method: 'POST' });

export const getMe = () =>
  apiFetch<{ did: string; handle: string; canPost?: boolean }>('/api/me');

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

export const postToBluesky = (id: string) =>
  apiFetch<{ uri: string; cid: string }>(`/api/polls/${id}/post-to-bluesky`, {
    method: 'POST',
  });

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

// Like-based polls
export const syncLikes = (id: string) =>
  apiFetch<{ synced: boolean; totalVotes: number; countsByOption: Record<string, number>; uniqueVoters: number }>(
    `/api/polls/${id}/likes/sync`, { method: 'POST' }
  );

// Surveys
export const createSurvey = (data: {
  title: string;
  description?: string;
  questions: { question: string; options: string[]; required?: boolean }[];
  opensAt: string;
  closesAt: string;
  eligibilityMode?: string;
  eligibilitySource?: string;
  whitelistedDids?: string[];
}) => apiFetch<any>('/api/surveys', { method: 'POST', body: JSON.stringify(data) });

export const listSurveys = (status?: string) =>
  apiFetch<{ surveys: any[] }>(`/api/surveys${status ? `?status=${status}` : ''}`);

export const getSurvey = (id: string) => apiFetch<any>(`/api/surveys/${id}`);

export const openSurvey = (id: string) =>
  apiFetch<any>(`/api/surveys/${id}/open`, { method: 'POST' });

export const closeSurvey = (id: string) =>
  apiFetch<any>(`/api/surveys/${id}/close`, { method: 'POST' });

export const finalizeSurvey = (id: string) =>
  apiFetch<any>(`/api/surveys/${id}/finalize`, { method: 'POST' });

export const deleteSurvey = (id: string) =>
  apiFetch<any>(`/api/surveys/${id}`, { method: 'DELETE' });

export const requestSurveyEligibility = (surveyId: string, blindedMessage?: string) =>
  apiFetch<any>(`/api/surveys/${surveyId}/eligibility/request`, {
    method: 'POST',
    body: JSON.stringify({ blindedMessage }),
  });

export const submitSurveyBallot = (surveyId: string, ballot: {
  choices: number[];
  tokenMessage: string;
  issuerSignature: string;
  nullifier: string;
  ballotVersion: number;
}) => apiFetch<any>(`/api/surveys/${surveyId}/ballots/submit`, {
  method: 'POST',
  body: JSON.stringify(ballot),
});

export const getSurveyTally = (surveyId: string) =>
  apiFetch<any>(`/api/surveys/${surveyId}/tally`);

export const getSurveyBallots = (surveyId: string) =>
  apiFetch<{ ballots: any[] }>(`/api/surveys/${surveyId}/ballots`);

export const getSurveyAudit = (surveyId: string) =>
  apiFetch<{ events: any[] }>(`/api/surveys/${surveyId}/audit`);

export const syncSurveyEligibleDids = (id: string) =>
  apiFetch<any>(`/api/surveys/${id}/eligible/sync`, { method: 'POST' });

export const getSurveyEligibleDids = (id: string) =>
  apiFetch<any>(`/api/surveys/${id}/eligible`);

export const postSurveyToBluesky = (id: string) =>
  apiFetch<{ uri: string; cid: string }>(`/api/surveys/${id}/post-to-bluesky`, {
    method: 'POST',
  });

// Public data
export const getBallots = (pollId: string) =>
  apiFetch<{ ballots: any[] }>(`/api/polls/${pollId}/ballots`);

export const getTally = (pollId: string) => apiFetch<any>(`/api/polls/${pollId}/tally`);

export const getAudit = (pollId: string) =>
  apiFetch<{ events: any[] }>(`/api/polls/${pollId}/audit`);
