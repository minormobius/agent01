import { useSelectionStore } from '../stores/selection';
import { useDataStore } from '../stores/data';

export function HoverInfo() {
  const hovered = useSelectionStore((s) => s.hovered);
  const threadCache = useDataStore((s) => s.threadCache);
  const activityData = useDataStore((s) => s.activityData);

  if (!hovered) return <div id="hover-info" />;

  let text = '';
  if (hovered._type === 'community') {
    const c = hovered._community;
    const a = activityData[c.id];
    const tag = a
      ? ` \u00b7 ${a.postCount} posts \u00b7 score ${a.totalScore.toFixed(1)}`
      : ' \u00b7 no recent posts';
    text = `${c.label} \u00b7 ${c.coreSize} core \u00b7 ${c.totalSize} total${tag}`;
  } else if (hovered._type === 'post') {
    const p = hovered._post;
    const rkey = p.uri.split('/').pop() || '';
    const tc = threadCache[p.uri];
    const depthTag = tc ? `depth ${tc.maxDepth}` : 'est.';
    text = `${rkey.slice(0, 12)}\u2026 \u00b7 ${p.replyCount || 0} replies \u00b7 ${p.likeCount || 0} likes \u00b7 ${depthTag}`;
  }

  return (
    <div id="hover-info" className={hovered ? 'visible' : ''}>
      {text}
    </div>
  );
}
