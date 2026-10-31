# mediabunny, vendored

- `mediabunny.min.mjs`: mediabunny 1.59.1 (npm), `dist/bundles/mediabunny.min.mjs`, unmodified.
- `mediabunny-aac-encoder.min.mjs`: @mediabunny/aac-encoder 1.59.1, `dist/bundles/mediabunny-aac-encoder.min.mjs`.
  ONE modification: its two `from"mediabunny"` imports are rewritten to
  `from"./mediabunny.min.mjs"`, because a static site cannot resolve a bare package
  name. The original is on npm at that version.

Both are by Vanilagy, MPL-2.0 (`LICENSE`); https://github.com/Vanilagy/mediabunny.
The AAC encoder is a WebAssembly build of FFmpeg's (libavcodec, LGPL-2.1+) AAC
encoder. Source: https://github.com/Vanilagy/mediabunny/tree/main/packages/aac-encoder

Why: the video export (`lib/export.js`) must write H.264 + AAC, the one pairing
Apple's Photos is known to take, and Firefox and Safari have no native AAC
encoder in WebCodecs. With this, every browser that can encode H.264 can make it.
Both files load only when someone taps Export.
