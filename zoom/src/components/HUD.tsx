import { useDataStore } from '../stores/data';

export function HUD() {
  const status = useDataStore((s) => s.status);
  return (
    <div id="hud">
      <span className="title">threads</span>
      <span id="status">{status}</span>
    </div>
  );
}
