import { useCameraStore } from '../stores/camera';
import { useSelectionStore } from '../stores/selection';
import { useDataStore } from '../stores/data';
import { hitTest } from './hit-test';

interface Size {
  W: number;
  H: number;
}

let dragging = false;
let dragStart = { x: 0, y: 0 };
let dragCamStart = { x: 0, y: 0 };
let dragMoved = false;
let lastTouchDist = 0;
let touchMoved = false;

function getSize(): Size {
  return { W: window.innerWidth, H: window.innerHeight };
}

function doHitTest(sx: number, sy: number) {
  const { W, H } = getSize();
  const cam = useCameraStore.getState();
  const data = useDataStore.getState();
  return hitTest(sx, sy, cam, W, H, data.postDots);
}

let scheduleDraw: (() => void) | null = null;

export function bindCanvas(canvas: HTMLCanvasElement, scheduleDrawFn: () => void) {
  scheduleDraw = scheduleDrawFn;

  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    dragMoved = false;
    dragStart = { x: e.clientX, y: e.clientY };
    const cam = useCameraStore.getState();
    dragCamStart = { x: cam.x, y: cam.y };
    canvas.classList.add('dragging');
  });

  window.addEventListener('mousemove', (e) => {
    if (dragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
      const cam = useCameraStore.getState();
      useCameraStore.setState({
        x: dragCamStart.x - dx / cam.scale,
        y: dragCamStart.y - dy / cam.scale,
      });
      scheduleDraw?.();
    } else {
      const hit = doHitTest(e.clientX, e.clientY);
      useSelectionStore.getState().setHovered(hit);
      scheduleDraw?.();
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (!dragMoved) {
      const hit = doHitTest(e.clientX, e.clientY);
      useSelectionStore.getState().setSelected(hit);
    }
    dragging = false;
    canvas.classList.remove('dragging');
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const { W, H } = getSize();
      const factor = e.deltaY > 0 ? 1 / 1.08 : 1.08;
      useCameraStore.getState().zoom(factor, e.clientX, e.clientY, W, H);
      scheduleDraw?.();
    },
    { passive: false }
  );

  canvas.addEventListener('dblclick', (e) => {
    const hit = doHitTest(e.clientX, e.clientY);
    if (hit) {
      useSelectionStore.getState().setSelected(hit);
      // Fly to: animate is handled in the component
    }
  });

  // Touch support
  canvas.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length === 1) {
        dragging = true;
        touchMoved = false;
        dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        const cam = useCameraStore.getState();
        dragCamStart = { x: cam.x, y: cam.y };
      } else if (e.touches.length === 2) {
        dragging = false;
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        lastTouchDist = Math.sqrt(dx * dx + dy * dy);
      }
      e.preventDefault();
    },
    { passive: false }
  );

  canvas.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length === 1 && dragging) {
        const dx = e.touches[0].clientX - dragStart.x;
        const dy = e.touches[0].clientY - dragStart.y;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) touchMoved = true;
        const cam = useCameraStore.getState();
        useCameraStore.setState({
          x: dragCamStart.x - dx / cam.scale,
          y: dragCamStart.y - dy / cam.scale,
        });
        scheduleDraw?.();
      } else if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const { W, H } = getSize();
        const mid = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
        if (lastTouchDist > 0) {
          const factor = dist / lastTouchDist;
          useCameraStore.getState().zoom(factor, mid.x, mid.y, W, H);
          scheduleDraw?.();
        }
        lastTouchDist = dist;
      }
      e.preventDefault();
    },
    { passive: false }
  );

  canvas.addEventListener('touchend', (e) => {
    if (!touchMoved && e.changedTouches.length === 1) {
      const t = e.changedTouches[0];
      const hit = doHitTest(t.clientX, t.clientY);
      useSelectionStore.getState().setSelected(hit);
    }
    dragging = false;
    touchMoved = false;
    lastTouchDist = 0;
  });
}
