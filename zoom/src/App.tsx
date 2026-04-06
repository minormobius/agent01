import { CanvasRenderer } from './canvas/CanvasRenderer';
import { HUD } from './components/HUD';
import { HoverInfo } from './components/HoverInfo';
import { ThreadPanel } from './components/ThreadPanel';

export function App() {
  return (
    <>
      <HUD />
      <HoverInfo />
      <CanvasRenderer />
      <ThreadPanel />
    </>
  );
}
