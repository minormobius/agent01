// Compact colormaps for intensity display. Each returns [r,g,b] for t∈[0,1].

// Coarse viridis control points (perceptually-uniform), linearly interpolated.
const VIRIDIS = [
  [68,1,84],[72,40,120],[62,74,137],[49,104,142],[38,130,142],
  [31,158,137],[53,183,121],[110,206,88],[181,222,43],[253,231,37]
];
function lerpLUT(lut, t){
  t = Math.max(0, Math.min(1, t));
  const x = t*(lut.length-1), i = Math.floor(x), f = x-i;
  const a = lut[i], b = lut[Math.min(i+1, lut.length-1)];
  return [a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f, a[2]+(b[2]-a[2])*f];
}
const FIRE = [[0,0,0],[60,0,0],[140,10,0],[210,60,0],[245,140,10],[255,210,90],[255,255,220]];

export const COLORMAPS = {
  gray:    t => { const v=t*255; return [v,v,v]; },
  green:   t => [t*40, t*255, t*60],            // fluorescence-style
  magenta: t => [t*255, t*30, t*220],
  viridis: t => lerpLUT(VIRIDIS, t),
  fire:    t => lerpLUT(FIRE, t),
};

// Render a Float32 grayscale buffer (0..255 scale) into ImageData with a
// display window [lo,hi] and a named colormap.
export function toImageData(gray, w, h, cmapName, lo, hi){
  const cmap = COLORMAPS[cmapName] || COLORMAPS.gray;
  const out = new ImageData(w, h);
  const d = out.data;
  const span = (hi - lo) || 1;
  for (let i=0;i<gray.length;i++){
    const t = (gray[i]-lo)/span;
    const c = cmap(t<0?0:t>1?1:t);
    const j = i*4;
    d[j]=c[0]; d[j+1]=c[1]; d[j+2]=c[2]; d[j+3]=255;
  }
  return out;
}

// A small horizontal colorbar canvas for the given colormap.
export function colorbar(canvas, cmapName){
  const cmap = COLORMAPS[cmapName] || COLORMAPS.gray;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const img = ctx.createImageData(w,h);
  for (let x=0;x<w;x++){
    const c = cmap(x/(w-1));
    for (let y=0;y<h;y++){ const j=(y*w+x)*4; img.data[j]=c[0];img.data[j+1]=c[1];img.data[j+2]=c[2];img.data[j+3]=255;}
  }
  ctx.putImageData(img,0,0);
}
