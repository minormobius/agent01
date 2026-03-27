import { create } from 'zustand';
import type { Camera } from '../api/types';

interface CameraStore extends Camera {
  set: (partial: Partial<Camera>) => void;
  pan: (dx: number, dy: number) => void;
  zoom: (factor: number, pivotSx: number, pivotSy: number, W: number, H: number) => void;
}

export const useCameraStore = create<CameraStore>((set, get) => ({
  x: 0,
  y: 0,
  scale: 1,

  set: (partial) => set(partial),

  pan: (dx, dy) => {
    const { scale } = get();
    set({ x: get().x - dx / scale, y: get().y - dy / scale });
  },

  zoom: (factor, pivotSx, pivotSy, W, H) => {
    const s = get();
    // world coords under pivot before zoom
    const wx = (pivotSx - W / 2) / s.scale + s.x;
    const wy = (pivotSy - H / 2) / s.scale + s.y;
    const newScale = s.scale * factor;
    set({
      scale: newScale,
      x: wx - (pivotSx - W / 2) / newScale,
      y: wy - (pivotSy - H / 2) / newScale,
    });
  },
}));
