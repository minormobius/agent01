import { useSelectionStore } from '../stores/selection';

export function HoverInfo() {
  const hovered = useSelectionStore((s) => s.hovered);

  if (!hovered) return <div id="hover-info" />;

  const p = hovered._post;
  const depthTag = p.threadDepth > 0 ? ` \u00b7 depth ${p.threadDepth}` : '';
  const comTag = p.primaryCommunityLabel ? ` \u00b7 ${p.primaryCommunityLabel}` : '';
  const text = `@${p.authorHandle} \u00b7 ${p.replyCount} replies \u00b7 ${p.likeCount} likes${depthTag}${comTag}`;

  return (
    <div id="hover-info" className="visible">
      {text}
    </div>
  );
}
