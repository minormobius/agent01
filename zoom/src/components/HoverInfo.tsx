import { useSelectionStore } from '../stores/selection';

export function HoverInfo() {
  const hovered = useSelectionStore((s) => s.hovered);

  if (!hovered) return <div id="hover-info" />;

  const p = hovered._post;
  const depthTag = p.threadDepth > 0 ? ` \u00b7 depth ${p.threadDepth}` : '';
  const comTag = p.primaryCommunityLabel ? ` \u00b7 ${p.primaryCommunityLabel}` : '';
  const shellTag = p.authorShell === 0 ? ' \u2605 core' : p.authorShell <= 3 ? ` shell ${p.authorShell}` : '';
  const text = `@${p.authorHandle}${shellTag} \u00b7 ${p.replyCount} replies \u00b7 ${p.likeCount} likes${depthTag}${comTag}`;

  return (
    <div id="hover-info" className="visible">
      {text}
    </div>
  );
}
