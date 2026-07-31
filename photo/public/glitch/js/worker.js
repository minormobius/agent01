// A full stack is a second or two of typed-array arithmetic, and the panel
// should still drag while it thinks. app.js falls back to running the pipeline
// on the main thread if module workers (or OffscreenCanvas, which the JPEG
// operator needs in here) aren't available.

import { renderAsync } from './pipeline.js';

self.onmessage = async (e) => {
  const { rgba, W, H, recipe, paint, token } = e.data;
  try {
    const result = await renderAsync(rgba, W, H, recipe, { paint });
    self.postMessage(
      { ok: true, token, rgba: result.rgba, width: W, height: H, log: result.log },
      [result.rgba.buffer],
    );
  } catch (err) {
    self.postMessage({ ok: false, token, error: String((err && err.message) || err) });
  }
};
