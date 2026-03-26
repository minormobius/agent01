import { useState, useEffect, useCallback, createContext, useContext } from "react";

/** Minimal client-side router — no dependency needed. */

interface RouterState {
  path: string;
  params: URLSearchParams;
}

function getRouterState(): RouterState {
  return {
    path: window.location.pathname,
    params: new URLSearchParams(window.location.search),
  };
}

const RouterContext = createContext<{
  path: string;
  params: URLSearchParams;
  navigate: (to: string) => void;
}>({
  path: "/",
  params: new URLSearchParams(),
  navigate: () => {},
});

export function useRouter() {
  return useContext(RouterContext);
}

export function Router({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(getRouterState);

  useEffect(() => {
    const onPop = () => setState(getRouterState());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    window.history.pushState(null, "", to);
    setState(getRouterState());
  }, []);

  return (
    <RouterContext.Provider value={{ path: state.path, params: state.params, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}

/** Match a path prefix, e.g. "/pm" matches "/pm" and "/pm/anything" */
export function Route({
  path,
  exact,
  children,
}: {
  path: string;
  exact?: boolean;
  children: React.ReactNode;
}) {
  const { path: current } = useRouter();
  const match = exact ? current === path : current.startsWith(path);
  if (!match) return null;
  return <>{children}</>;
}
