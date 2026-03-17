import { useLocation } from 'react-router-dom';

type SiteMode = 'all' | 'public_like' | 'anon_credential_v2';

/** Derive site mode from the current URL path */
export function useSiteMode(): SiteMode {
  const { pathname } = useLocation();
  if (pathname.startsWith('/public')) return 'public_like';
  return 'all';
}

/** Returns the base path for the current site mode */
export function useBasePath(): string {
  const mode = useSiteMode();
  return mode === 'public_like' ? '/public' : '';
}
