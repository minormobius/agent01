import { GROUPS, NEEDS, TOOLS, toolsInGroup } from '../lib/catalogue.js';

// Landing.jsx — what photo.mino.mobi/ is now.
//
// The surface had accumulated fourteen tools and no way in: `/` went straight
// to the explorer, and everything else was reachable only if you already knew
// its URL. `#/sleuth` was linked from precisely nowhere.
//
// This is deliberately plain HTML — no data fetching, no WASM, nothing that can
// fail. It is the only route in the eager bundle; every other route is behind
// React.lazy, so the first paint here costs a fraction of what it used to.

export default function Landing({ themeToggle }) {
  const featured = TOOLS.filter((t) => t.featured);

  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-brand">
          <span className="landing-mark" aria-hidden="true">◉</span>
          <h1>photo</h1>
        </div>
        {themeToggle}
      </header>

      <p className="landing-lede">
        A workshop for pictures, built on <a href="https://atproto.com">ATProto</a>.
        Everything here runs in your browser — the photographs are decoded, edited
        and exported inside this tab. Nothing is uploaded unless you ask for it.
      </p>

      <div className="landing-featured">
        {featured.map((tool) => (
          <a key={tool.id} className="landing-feature" href={tool.href}>
            <span className="landing-feature-name">{tool.name}</span>
            <span className="landing-feature-blurb">{tool.lede || tool.blurb}</span>
            <span className="landing-feature-go" aria-hidden="true">→</span>
          </a>
        ))}
      </div>

      {GROUPS.map((group) => (
        <section key={group.id} className="landing-group">
          <h2 className="landing-group-title">
            {group.label}
            <span className="landing-group-note">{group.note}</span>
          </h2>
          <ul className="landing-list">
            {toolsInGroup(group.id).map((tool) => (
              <li key={tool.id} className="landing-item">
                <a href={tool.href} className="landing-item-link">
                  <span className="landing-item-head">
                    <span className="landing-item-name">{tool.name}</span>
                    <span className="landing-item-tag">{tool.tag}</span>
                    {tool.needs && (
                      <span className="landing-item-needs" title={NEEDS[tool.needs]}>
                        {NEEDS[tool.needs]}
                      </span>
                    )}
                  </span>
                  <span className="landing-item-blurb">{tool.blurb}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <footer className="landing-footer">
        <p>
          Part of <a href="https://mino.mobi">mino.mobi</a>. The image tools are
          client-side and need no account; <a href="/explore">explore</a>,{' '}
          <a href="/thread">thread</a> and <a href="/sleuth">sleuth</a> read
          public ATProto data. A sign-in is only needed to upload, or to post
          an edit from <a href="/shop/">shop</a> back to Bluesky — and one
          sign-in covers both.
        </p>
      </footer>
    </div>
  );
}
