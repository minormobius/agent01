import type { Camera } from '../api/types';

export function w2s(cam: Camera, W: number, H: number, wx: number, wy: number): [number, number] {
  return [(wx - cam.x) * cam.scale + W / 2, (wy - cam.y) * cam.scale + H / 2];
}

export function s2w(cam: Camera, W: number, H: number, sx: number, sy: number): [number, number] {
  return [(sx - W / 2) / cam.scale + cam.x, (sy - H / 2) / cam.scale + cam.y];
}
