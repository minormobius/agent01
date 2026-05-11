import { navigate } from "../router";

// SPA link — same anchor semantics (cmd-click, middle-click, etc. work)
// but plain clicks navigate via pushState without a full reload.
// External links (http(s)://, mailto:) and explicit non-SPA paths
// (/stocks/, /bogo/, /mort/ — static pages outside the SPA) get treated
// as regular anchors so the browser does a real navigation.
const STATIC_PREFIXES = ["/stocks/", "/bogo/", "/lexicons/"];

export default function Link({ to, children, ...rest }) {
  const isExternal = /^(https?:|mailto:|tel:)/.test(to);
  const isStatic = STATIC_PREFIXES.some((p) => to === p || to.startsWith(p));
  return (
    <a
      href={to}
      onClick={(e) => {
        if (isExternal || isStatic) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
