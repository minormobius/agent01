import { useRef, useEffect } from 'react';
import { useCameraStore } from '../stores/camera';
import { useSelectionStore } from '../stores/selection';
import { useDataStore } from '../stores/data';
import { drawPosts } from './layers/posts';
import { bindCanvas } from './interaction';

export function CanvasRenderer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawIdRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let W = 0;
    let H = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width = W + 'px';
      canvas!.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scheduleDraw();
    }

    function scheduleDraw() {
      cancelAnimationFrame(drawIdRef.current);
      drawIdRef.current = requestAnimationFrame(draw);
    }

    function draw() {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);

      const cam = useCameraStore.getState();
      const data = useDataStore.getState();
      const sel = useSelectionStore.getState();

      if (data.postDots.length === 0) return;

      drawPosts(
        ctx, W, H, cam, data.postDots,
        data.avatarImages, sel.selected, sel.hovered
      );
    }

    // Register draw scheduler so stores can trigger redraws
    useDataStore.getState().setScheduleDraw(scheduleDraw);

    resize();
    window.addEventListener('resize', resize);
    bindCanvas(canvas, scheduleDraw);

    // Start loading data
    useDataStore.getState().loadData().then(() => {
      // Set initial zoom to fit the spiral
      const cam = useCameraStore.getState();
      if (cam.scale === 1) {
        useCameraStore.setState({ scale: Math.min(W, H) * 0.8 });
      }
      scheduleDraw();
    });

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(drawIdRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      id="c"
      style={{ display: 'block', cursor: 'grab' }}
    />
  );
}
