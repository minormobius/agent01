/**
 * The house set.
 *
 * A live-tailed feed is empty until somebody posts, and an empty page teaches
 * nobody what a dweet is. These four run locally, in the same sandbox as a
 * real one, and are marked `local: true` so nothing in the UI implies they are
 * records — they carry no at:// URI and cannot be liked or remixed onto.
 *
 * All four were rendered frame-by-frame in headless Chromium before being
 * committed, and their lengths are asserted by sandbox.selftest.mjs.
 */
export const SEEDS = [
  {
    local: true,
    title: 'heartbeat',
    lang: 'js',
    author: 'the house',
    src: "c.width|=0;x.fillStyle='#f36';p=33+S(t*5)**8*4;for(a=t%8;a>0;a-=.01)"
       + "x.fillRect(960+p*16*S(a)**3,450-p*(13*C(a)-5*C(2*a)-2*C(3*a)),p/6,p/6)",
    note: 'A pen walks the curve from now back to zero, so the heart draws itself. '
        + "S(t*5)**8 is the beat: a high even power squashes a sine into a spike, "
        + 'which is a thump rather than a throb.',
  },
  {
    local: true,
    title: 'ribbon',
    lang: 'js',
    author: 'the house',
    src: 'c.width|=0;for(i=400;i--;)x.fillStyle=R(255,99+i/3,160),'
       + 'x.fillRect(960+S(i/25+t)*(600-i),540+C(i/17+t*1.3)*(400-i/2),5,5)',
    note: 'A Lissajous figure whose radius shrinks along the trail, so the '
        + 'ribbon tapers into its own centre. Two incommensurate periods, '
        + 'i/25 and i/17, keep it from ever closing.',
  },
  {
    local: true,
    title: 'spirograph',
    lang: 'js',
    author: 'the house',
    src: 't%9<.01&&(c.width|=0);for(i=3;i--;)a=t*1.6+i*2,r=330+S(t*2+i)*99,'
       + 'x.fillStyle=R(255,60+i*90,150),x.fillRect(960+C(a)*r,540+S(a)*r,11,11)',
    note: 'Nothing clears the canvas, so three orbiting pens draw permanently — '
        + 'the whole figure is accumulated trail. The nine-second wipe is the '
        + 'only housekeeping, and costs 21 of the 140 characters.',
  },
  {
    local: true,
    title: 'ripples',
    lang: 'glsl',
    author: 'the house',
    src: 'vec2 u=(FC-.5*r)/r.y;float d=length(u);'
       + 'o=vec4(.95,.35+.3*sin(d*9.-t*3.),.5+.3*sin(d*9.-t*3.+2.),1)*(1.-d*.8);',
    note: 'The same 140 characters, on the GPU. Every pixel evaluates this '
        + 'independently — which is the whole argument for the glsl mode: far '
        + 'more headroom, and still short enough to read.',
  },
  {
    local: true,
    title: 'interop',
    lang: 'glsl',
    author: 'the house',
    src: 'void mainImage(out vec4 fragColor,in vec2 fragCoord){vec2 u=(fragCoord-.5*iResolution)/iResolution.y;'
       + 'float a=atan(u.y,u.x),d=length(u);fragColor=vec4(.5+.5*cos(a*3.+iTime+vec3(0,2,4)),1)*(1.-d);}',
    note: 'Written in demosky.app\u2019s dialect, not ours \u2014 a top-level '
        + 'mainImage(out vec4, in vec2) reading iTime and iResolution. It runs here unchanged, '
        + 'which is the point: the harness accepts either vocabulary. And it fills a real '
        + '1920x1080 frame, where demosky pins iResolution to a constant 512.',
  },
];
