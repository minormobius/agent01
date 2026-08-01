// catalogue.js — every tool on this surface, in one list.
//
// `photo.mino.mobi/` is an index, not an app: the surface grew a wing of
// image tools that were only ever reachable if you already knew the URL
// (`#/sleuth` was linked from nowhere at all). This is the hand-written list
// behind the landing page.
//
// Hand-edited on purpose, the same way the repo's root `index.html` keeps a
// curated `var P` — the blurbs are the point, and a generated one-liner would
// say less than the file it was generated from. `photo.selftest.mjs` checks the
// mechanical part instead: every `static` entry must point at a directory that
// exists under `public/`, so a tool cannot be listed here and 404 in production.
//
// Two entries carry `featured` and a shorter `lede`: they head the page as
// "start here" cards, and repeating the full blurb there and again in the group
// listing below just reads as a stutter.
//
// `needs` is the honest bit. Half of these want something the browser might not
// give them — a camera, WebGPU, a sign-in, an API key — and finding that out
// after a click is worse than reading it before one.

export const GROUPS = [
  {
    id: 'darkroom',
    label: 'the darkroom',
    note: 'a photograph goes in and something else comes out',
  },
  {
    id: 'archive',
    label: 'the archive',
    note: 'everything a Bluesky account has ever posted, made searchable',
  },
  {
    id: 'instruments',
    label: 'the instruments',
    note: 'optics, sensors, and things that read a picture back to you',
  },
];

export const TOOLS = [
  // ───────────────────────────────────────────────────────── darkroom ──
  {
    id: 'shop',
    name: 'shop',
    href: '/shop/',
    kind: 'static',
    group: 'darkroom',
    tag: 'editor',
    blurb: 'The whole workbench. Fifty-seven manipulations — levels, curves, blurs, '
      + 'halftones, plus every warp, glitch operator and projection from the tools below — '
      + 'stacked non-destructively over layers, each aimed by a lasso or a wand.',
    featured: true,
    lede: 'A layered editor with every manipulation on this surface in one stack.',
  },
  {
    id: 'glass',
    name: 'glass',
    href: '/glass/',
    kind: 'static',
    group: 'darkroom',
    tag: 'projection',
    blurb: 'The stained-glass window of best fit: the closest picture buildable from flat '
      + 'pieces and lead, with the error reported honestly. Exports a glazier’s cutting plan.',
  },
  {
    id: 'glitch',
    name: 'glitch',
    href: '/glitch/',
    kind: 'static',
    group: 'darkroom',
    tag: 'damage',
    blurb: 'Steerable damage. Pixel sort, PNG predictors, real JPEG databending, tape and '
      + 'composite-video artefacts — each aimed by a mask, all of it seeded, so any result '
      + 'comes back exactly.',
  },
  {
    id: 'lens',
    name: 'lens',
    href: '/lens/',
    kind: 'static',
    group: 'darkroom',
    tag: 'geometry',
    blurb: 'Tiny planets, Droste spirals and funhouse mirrors built as functions of a complex '
      + 'variable — so most of them preserve angles exactly, and the tool measures whether '
      + 'each one really does.',
  },
  {
    id: 'fractal',
    name: 'fractal',
    href: '/fractal/',
    kind: 'static',
    group: 'darkroom',
    tag: 'GPU',
    blurb: 'Your photograph orbit-trapped into an endlessly zooming fractal of itself, '
      + 'rendered on the GPU.',
  },

  // ────────────────────────────────────────────────────────── archive ──
  {
    id: 'explore',
    name: 'explore',
    href: '#/explore',
    kind: 'react',
    group: 'archive',
    tag: 'gallery',
    blurb: 'Every image a Bluesky account has ever posted, as a masonry grid. Downloads the '
      + 'whole repo, parses it in the browser, and queries it with DuckDB — filter by ratio, '
      + 'colour, alt text or date, sort by likes.',
    featured: true,
    lede: 'Every image a Bluesky account has ever posted, as one filterable grid.',
  },
  {
    id: 'thread',
    name: 'thread',
    href: '#/thread',
    kind: 'react',
    group: 'archive',
    tag: 'reader',
    blurb: 'Paste a post URL and read the whole conversation tree, with a gallery view of '
      + 'every picture and quote in it.',
  },
  {
    id: 'sleuth',
    name: 'sleuth',
    href: '#/sleuth',
    kind: 'react',
    group: 'archive',
    tag: 'search',
    needs: 'key',
    blurb: 'Search a thousand of anyone’s posts instantly, then ask questions about them — '
      + 'or generate a dossier: themes, arcs, and a personality read, cited back to the posts.',
  },
  {
    id: 'orb',
    name: 'orb',
    href: '/orb/',
    kind: 'static',
    group: 'archive',
    tag: 'WebGPU',
    needs: 'webgpu',
    blurb: 'A thread’s images wrapped onto a sphere you can spin.',
  },

  // ────────────────────────────────────────────────────── instruments ──
  {
    id: 'prism',
    name: 'prism',
    href: '/prism/',
    kind: 'static',
    group: 'instruments',
    tag: 'live',
    needs: 'camera',
    blurb: 'Your camera, live, through a prismatic cornea.',
  },
  {
    id: 'juice',
    name: 'juice',
    href: '/juice/',
    kind: 'static',
    group: 'instruments',
    tag: 'optics',
    blurb: 'A liquid-glass optics lab — refraction you can push around with a finger.',
  },
  {
    id: 'astro',
    name: 'astro',
    href: '/astro/',
    kind: 'static',
    group: 'instruments',
    tag: 'EXIF',
    blurb: 'Reads the timestamp and GPS out of a photograph and paints the sky exactly as it '
      + 'stood over the shot — planets, houses, the lot.',
  },
  {
    id: 'codescan',
    name: 'codescan',
    href: '#/codescan',
    kind: 'react',
    group: 'instruments',
    tag: 'OCR',
    blurb: 'Pull the text off a picture — an activation code, a receipt, a sign — with OCR '
      + 'that runs entirely in the tab.',
  },
  {
    id: 'dm',
    name: 'dm',
    href: '/dm/',
    kind: 'static',
    group: 'instruments',
    tag: 'social',
    needs: 'login',
    blurb: 'Send a picture straight into the group chats you share with morphyx.',
  },
];

/** What a `needs` tag means, said once. */
export const NEEDS = {
  camera: 'needs camera access',
  webgpu: 'needs WebGPU',
  login: 'needs sign-in',
  key: 'needs your own API key',
};

export const toolsInGroup = (groupId) => TOOLS.filter((t) => t.group === groupId);

export const toolById = (id) => TOOLS.find((t) => t.id === id) || null;

/** Routes the React app owns. Everything else is a static page under `public/`. */
export const REACT_ROUTES = TOOLS.filter((t) => t.kind === 'react').map((t) => t.href);
