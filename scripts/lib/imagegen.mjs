// imagegen.mjs — one generated image, from Cloudflare Workers AI.
//
// WHY WORKERS AI AND NOT AN IMAGE VENDOR. This account already runs Workers AI
// in production (chat/, rite/, functions/*), so this is a model name on an
// endpoint that is already paid for, already billed to one place, and already
// has a token in CI. The alternative — a second vendor with a second key and a
// second free tier to age out — buys nothing at this size.
//
// WHAT IT COSTS, so nobody has to guess:
//
//   flux-1-schnell  1024x1024, 4 steps   57.6 neurons   ~$0.00063   ~1,600/$
//   sdxl-lightning  1024x1024, 4 steps   unpriced beta  $0          — for now
//
// The complimentary allowance is 10,000 neurons/day ACROSS THE WHOLE ACCOUNT,
// which is ~170 flux images — and it is the same pool chat/ and rite/ draw from.
// A runaway loop here degrades an unrelated surface, which is why the caller is
// expected to cap generations per run rather than trusting the budget to hold.
//
// Pure functions (neuronCost, sanitisePrompt, decodeResult) are separated from
// the network so imagegen.selftest.mjs can drive them on a bare `node` run.

const CF_API = 'https://api.cloudflare.com/client/v4';

/** The models this repo will actually run, with what they cost.
 *
 *  `tile` and `step` are neurons per 512x512 tile and per step, off the Workers
 *  AI pricing table. A 1024x1024 image is four tiles. `beta` models are absent
 *  from that table entirely — free today, and that is a fact with a shelf life,
 *  so a beta model is never the default. */
export const MODELS = {
  'flux-1-schnell': {
    id: '@cf/black-forest-labs/flux-1-schnell',
    tiles: 4, tile: 4.8, step: 9.6, steps: 4, maxSteps: 8,
    encoding: 'base64',
  },
  'sdxl-lightning': {
    id: '@cf/bytedance/stable-diffusion-xl-lightning',
    tiles: 4, tile: 0, step: 0, steps: 4, maxSteps: 8,
    encoding: 'binary', beta: true,
  },
};

export const DEFAULT_MODEL = 'flux-1-schnell';

/** Neurons for one image. $0.011 per 1,000 neurons is the Workers AI rate. */
export function neuronCost(name, { steps } = {}) {
  const m = MODELS[name];
  if (!m) throw new Error(`unknown model: ${name}`);
  // Rounded because this number is printed in logs and posted in cost lines,
  // and 57.599999999999994 reads as a bug in the arithmetic rather than as
  // binary floating point doing what it always does.
  const n = +(m.tiles * m.tile + (steps ?? m.steps) * m.step).toFixed(2);
  return { neurons: n, usd: (n / 1000) * 0.011 };
}

/** THE PROMPT IS DOWNSTREAM OF A STRANGER'S POSTS, AND THE IMAGE IS POSTED BY
 *  THE OPERATOR'S ACCOUNT. Those two facts together are the whole reason this
 *  function exists.
 *
 *  flux-schnell has no safety filter. The account that posts the result is the
 *  same one docs/LAB-FACTORY.md §11.4 already worries about getting reported,
 *  and a moderation strike lands on the factory, not on the person whose posts
 *  steered the prompt. So the prompt is narrowed here, after the model wrote it
 *  and before the image model sees it:
 *
 *   - URLs and @handles stripped. They are not image content; they are how an
 *     instruction survives a rewrite.
 *   - Collapsed to one line. A prompt with newlines is usually a prompt that is
 *     trying to be a conversation.
 *   - 2,000 characters, under the model's 2,048 limit with room for the suffix.
 *   - A refusal list, checked as whole words. It is deliberately SHORT: a long
 *     blocklist reads as thoroughness and behaves as false positives, and the
 *     real control is the template the model writes against, not this.
 *
 *  Returns { prompt, refused }. A refusal is not an error — the caller posts
 *  without a picture, which is the same degradation as a failed upload. */
const REFUSE = [
  'nude', 'nudes', 'naked', 'nsfw', 'porn', 'pornographic', 'explicit', 'erotic',
  'gore', 'gory', 'mutilated', 'corpse', 'beheading',
  'swastika', 'nazi',
  'child', 'children', 'kid', 'kids', 'minor', 'toddler', 'baby', 'infant',
];

export function sanitisePrompt(raw, { suffix = '' } = {}) {
  let p = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/https?:\/\/\S+|\bwww\.\S+/gi, ' ')
    .replace(/(^|\s)@[A-Za-z0-9][A-Za-z0-9.-]*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  if (!p) return { prompt: '', refused: 'empty prompt' };

  const words = new Set(p.toLowerCase().match(/[a-z]+/g) || []);
  for (const bad of REFUSE) {
    if (words.has(bad)) return { prompt: '', refused: `prompt contains "${bad}"` };
  }

  if (suffix) p = `${p} ${suffix}`.trim();
  if (p.length > 2000) p = p.slice(0, 2000).replace(/\s+\S*$/, '');
  return { prompt: p, refused: null };
}

/** THE HOUSE STYLE, and it is load-bearing rather than decorative.
 *
 *  "No recognisable real person" is what keeps a portrait of somebody's ACCOUNT
 *  from becoming a portrait of somebody's FACE, generated without their consent
 *  and posted publicly. "No text" is because a four-step model cannot spell and
 *  a misspelt word in an image reads as carelessness rather than as charm. */
export const HOUSE_STYLE =
  'Illustration, no text or lettering anywhere in the image, no recognisable real person, '
  + 'no logos or brand marks, no watermark.';

/** Workers AI returns two shapes and the model decides which. flux returns JSON
 *  with base64 in result.image; the diffusers models return raw image bytes. */
export function decodeResult(contentType, body, encoding) {
  if (encoding === 'binary' || /^image\//.test(contentType || '')) {
    const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
    return { bytes, mime: (contentType || 'image/png').split(';')[0] };
  }
  const json = typeof body === 'string' ? JSON.parse(body) : body;
  if (json?.success === false) {
    throw new Error(`workers-ai: ${JSON.stringify(json.errors ?? json).slice(0, 200)}`);
  }
  const b64 = json?.result?.image;
  if (typeof b64 !== 'string' || !b64) throw new Error('workers-ai returned no image');
  return { bytes: Buffer.from(b64, 'base64'), mime: 'image/jpeg' };
}

/**
 * Generate one image. Never throws for a reason the caller can survive — a
 * refused prompt and a missing credential both come back as { bytes: null }.
 *
 * @param {string} prompt
 * @param {object} opts
 * @param {string} [opts.model]      key of MODELS
 * @param {string} [opts.accountId]  CLOUDFLARE_ACCOUNT_ID
 * @param {string} [opts.token]      CLOUDFLARE_API_TOKEN — needs Workers AI scope
 * @param {number} [opts.steps]
 * @param {Function} [opts.fetchImpl] injected for tests
 */
export async function generateImage(prompt, {
  model = DEFAULT_MODEL,
  accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
  token = process.env.CLOUDFLARE_API_TOKEN,
  steps,
  fetchImpl = fetch,
} = {}) {
  const spec = MODELS[model];
  if (!spec) return { bytes: null, why: `unknown model ${model}` };
  if (!accountId || !token) return { bytes: null, why: 'no Cloudflare credentials' };

  const { prompt: clean, refused } = sanitisePrompt(prompt, { suffix: HOUSE_STYLE });
  if (refused) return { bytes: null, why: refused };

  const n = Math.min(steps ?? spec.steps, spec.maxSteps);
  const res = await fetchImpl(`${CF_API}/accounts/${accountId}/ai/run/${spec.id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: clean, steps: n }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // 403 here is almost always the token, not the account: CLOUDFLARE_API_TOKEN
    // is scoped for `wrangler deploy` and Workers AI is a separate permission.
    // Say that, because the raw 403 sends people to the billing page.
    const hint = res.status === 403
      ? ' — CLOUDFLARE_API_TOKEN probably lacks the "Workers AI: Read" permission'
      : '';
    return { bytes: null, why: `workers-ai ${res.status}${hint}: ${detail.slice(0, 200)}` };
  }

  const ct = res.headers.get('content-type') || '';
  const raw = spec.encoding === 'binary' || /^image\//.test(ct)
    ? new Uint8Array(await res.arrayBuffer())
    : await res.json();
  const { bytes, mime } = decodeResult(ct, raw, spec.encoding);
  const cost = neuronCost(model, { steps: n });

  return { bytes: Buffer.from(bytes), mime, model, steps: n, prompt: clean, ...cost, why: null };
}
