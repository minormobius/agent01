// Dossier — rendered personality profile card
// Shows: tagline, traits, narrative arcs, interests, timeline

import { useMemo } from 'react';

const ARC_TYPE_LABELS = {
  'discovery': 'Discovery',
  'deepening': 'Deepening',
  'disillusionment': 'Disillusionment',
  'transformation': 'Transformation',
  'ongoing-exploration': 'Exploration',
  'mastery': 'Mastery',
  'advocacy': 'Advocacy',
};

const ARC_TYPE_COLORS = {
  'discovery': '#4ecdc4',
  'deepening': '#2a6df0',
  'disillusionment': '#f06292',
  'transformation': '#ff9800',
  'ongoing-exploration': '#ab47bc',
  'mastery': '#66bb6a',
  'advocacy': '#ef5350',
};

const DEPTH_FILLS = {
  'casual': 0.25,
  'engaged': 0.5,
  'passionate': 0.75,
  'obsessed': 1.0,
};

export default function Dossier({ data }) {
  const { handle, temporalStats, themes, arcs, profile, dominantInterests } = data;

  return (
    <div className="dossier">
      {/* Header */}
      <div className="dossier-header">
        <div className="dossier-handle">@{handle}</div>
        <div className="dossier-tagline">{profile.tagline}</div>
        <div className="dossier-meta">
          {temporalStats.totalPosts.toLocaleString()} posts analyzed
          &middot; {temporalStats.firstPost} — {temporalStats.lastPost}
        </div>
      </div>

      {/* Personality Traits */}
      {profile.personality_traits?.length > 0 && (
        <section className="dossier-section">
          <h2>Personality</h2>
          <div className="dossier-traits">
            {profile.personality_traits.map((t, i) => (
              <div key={i} className="dossier-trait">
                <div className="dossier-trait-header">
                  <span className="dossier-trait-name">{t.trait}</span>
                  <span className="dossier-trait-strength">
                    {Math.round((t.strength || 0.5) * 100)}%
                  </span>
                </div>
                <div className="dossier-trait-bar">
                  <div
                    className="dossier-trait-fill"
                    style={{ width: `${(t.strength || 0.5) * 100}%` }}
                  />
                </div>
                <div className="dossier-trait-evidence">{t.evidence}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Narrative Arcs — the killer feature */}
      {arcs?.length > 0 && (
        <section className="dossier-section">
          <h2>Narrative Arcs</h2>
          <div className="dossier-arcs">
            {arcs.map((arc, i) => (
              <ArcCard key={i} arc={arc} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Interests */}
      {profile.interests_ranked?.length > 0 && (
        <section className="dossier-section">
          <h2>Interests</h2>
          <div className="dossier-interests">
            {profile.interests_ranked.map((int, i) => (
              <div key={i} className="dossier-interest">
                <div className="dossier-interest-name">{int.interest}</div>
                <div className="dossier-interest-depth">
                  <div className="dossier-depth-bar">
                    <div
                      className="dossier-depth-fill"
                      style={{ width: `${(DEPTH_FILLS[int.depth] || 0.5) * 100}%` }}
                    />
                  </div>
                  <span className="dossier-depth-label">{int.depth}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Strengths & Blind Spots side by side */}
      <div className="dossier-columns">
        {profile.strengths?.length > 0 && (
          <section className="dossier-section dossier-col">
            <h2>Strengths</h2>
            {profile.strengths.map((s, i) => (
              <div key={i} className="dossier-item">
                <div className="dossier-item-title">{s.strength}</div>
                <div className="dossier-item-detail">{s.evidence}</div>
              </div>
            ))}
          </section>
        )}
        {profile.blind_spots?.length > 0 && (
          <section className="dossier-section dossier-col">
            <h2>Blind Spots</h2>
            {profile.blind_spots.map((b, i) => (
              <div key={i} className="dossier-item">
                <div className="dossier-item-title">{b.area}</div>
                <div className="dossier-item-detail">{b.observation}</div>
              </div>
            ))}
          </section>
        )}
      </div>

      {/* Communication Style */}
      {profile.communication_style && (
        <section className="dossier-section">
          <h2>Communication Style</h2>
          <p className="dossier-comm-style">{profile.communication_style}</p>
        </section>
      )}

      {/* Surprising Finding */}
      {profile.surprising_finding && (
        <section className="dossier-section dossier-surprise">
          <h2>Unexpected</h2>
          <p>{profile.surprising_finding}</p>
        </section>
      )}

      {/* Footer */}
      <div className="dossier-footer">
        Generated {new Date(data.generatedAt).toLocaleDateString()} by Sleuth
        &middot; {themes?.length || 0} themes &middot; {arcs?.length || 0} arcs traced
      </div>
    </div>
  );
}

function ArcCard({ arc, index }) {
  const color = ARC_TYPE_COLORS[arc.arc_type] || '#888';
  const typeLabel = ARC_TYPE_LABELS[arc.arc_type] || arc.arc_type;
  const posts = arc._posts || [];

  // Build citation links
  const cite = (nums) => {
    if (!nums || !Array.isArray(nums)) return null;
    return nums.map(n => {
      const post = posts[n - 1];
      if (!post?.url) return `[${n}]`;
      return (
        <a key={n} href={post.url} target="_blank" rel="noopener noreferrer" className="dossier-cite">
          [{n}]
        </a>
      );
    });
  };

  return (
    <div className="dossier-arc" style={{ borderLeftColor: color }}>
      <div className="dossier-arc-header">
        <span className="dossier-arc-title">{arc.arc_title}</span>
        <span className="dossier-arc-type" style={{ color }}>{typeLabel}</span>
      </div>

      {arc.origin?.summary && (
        <div className="dossier-arc-phase">
          <span className="dossier-arc-label">Origin</span>
          <span>{arc.origin.summary} {cite(arc.origin.citations)}</span>
        </div>
      )}

      {arc.evolution?.summary && (
        <div className="dossier-arc-phase">
          <span className="dossier-arc-label">Evolution</span>
          <span>{arc.evolution.summary} {cite(arc.evolution.citations)}</span>
        </div>
      )}

      {arc.key_shifts?.map((shift, i) => (
        <div key={i} className="dossier-arc-phase dossier-arc-shift">
          <span className="dossier-arc-label">Shift</span>
          <span>{shift.summary} {cite(shift.citations)}</span>
        </div>
      ))}

      {arc.current_state?.summary && (
        <div className="dossier-arc-phase">
          <span className="dossier-arc-label">Now</span>
          <span>{arc.current_state.summary} {cite(arc.current_state.citations)}</span>
        </div>
      )}
    </div>
  );
}
