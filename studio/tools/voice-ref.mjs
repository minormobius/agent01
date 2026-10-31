#!/usr/bin/env node
// voice-ref.mjs — ElevenLabs as the voice lab's reference: design a voice for Claude, save the
// one the owner picks, and have it read the test set with character timings, so the formant
// voice (lib/chipvoice.js) can be measured against real speech in the voice it is meant to have.
//
// Runs in GitHub Actions (.github/workflows/voice-ref.yml), where ELEVENLABS_API_KEY is a
// secret; the key never reaches the repo or the sandbox. The workflow runs when
// studio/tools/voice-ref/request.json changes on the owning branch, and commits what it made.
//
//   request.json: { "step": "design", "designs": [{ "description": "…", "seed": 1 }] }
//                 { "step": "save", "generated_voice_id": "…", "name": "…", "description": "…" }
//                 { "step": "speak", "voice_id": "…", "model_id": "eleven_multilingual_v2" }
//
// design → studio/voice/candidates/<n>.mp3 + candidates.json (served: the voice page plays them)
// save   → studio/tools/voice-ref/voice.json
// speak  → studio/tools/voice-ref/<voice_id>/<id>.wav + <id>.json (the alignment), not served
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PARAGRAPH, PARAGRAPH_SENTENCES, HARVARD } from '../voice/texts.js';
import { wav } from '../lib/chipvoice.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..');
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('ELEVENLABS_API_KEY is not set'); process.exit(1); }
const request = JSON.parse(readFileSync(join(here, 'voice-ref', 'request.json'), 'utf8'));
// one step, or several in order ({ "steps": ["save", "speak"], … }): the speak step reads the voice the save step wrote
for (const step of request.steps || [request.step]) await run({ ...request, step });

async function api(path, body) {
  const r = await fetch(`https://api.elevenlabs.io${path}`, { method: 'POST', headers: { 'xi-api-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function run(req) {
if (req.step === 'design') {
  const dir = join(root, 'voice', 'candidates');
  mkdirSync(dir, { recursive: true });
  const out = [];
  for (const [di, d] of req.designs.entries()) {
    const j = await api('/v1/text-to-voice/design', { voice_description: d.description, text: d.text || PARAGRAPH, model_id: d.model_id || 'eleven_multilingual_ttv_v2', seed: d.seed, guidance_scale: d.guidance_scale ?? 5, loudness: 0.5 });
    for (const [pi, p] of j.previews.entries()) {
      const n = `${di + 1}${'abc'[pi] || pi}`;
      writeFileSync(join(dir, `${n}.mp3`), Buffer.from(p.audio_base_64, 'base64'));
      out.push({ n, description: d.description, generated_voice_id: p.generated_voice_id, seconds: p.duration_secs });
      console.log(`candidate ${n}: ${p.generated_voice_id} (${p.duration_secs?.toFixed?.(1)} s)`);
    }
  }
  writeFileSync(join(dir, 'candidates.json'), JSON.stringify({ text: req.designs[0].text || PARAGRAPH, date: new Date().toISOString().slice(0, 10), candidates: out }, null, 1));
} else if (req.step === 'save') {
  const j = await api('/v1/text-to-voice', { voice_name: req.name, voice_description: req.description, generated_voice_id: req.generated_voice_id });
  writeFileSync(join(here, 'voice-ref', 'voice.json'), JSON.stringify({ voice_id: j.voice_id, name: req.name, description: req.description, generated_voice_id: req.generated_voice_id, saved: new Date().toISOString().slice(0, 10) }, null, 1));
  console.log(`saved: ${j.voice_id}`);
} else if (req.step === 'speak') {
  const voice = req.voice_id || JSON.parse(readFileSync(join(here, 'voice-ref', 'voice.json'), 'utf8')).voice_id;
  const dir = join(here, 'voice-ref', voice);
  mkdirSync(dir, { recursive: true });
  const set = [...PARAGRAPH_SENTENCES.map((t, i) => [`p${i + 1}`, t]), ...HARVARD.map((t, i) => [`h${i + 1}`, t]), ...(req.extra || []).map((t, i) => [`x${i + 1}`, t])];
  for (const [id, text] of set) {
    if (existsSync(join(dir, `${id}.json`)) && !req.force) continue;
    const j = await api(`/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=pcm_16000`, {
      text, model_id: req.model_id || 'eleven_multilingual_v2',
      voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0, use_speaker_boost: true },
    });
    // raw 16-bit PCM at 16 kHz: Whisper's rate, and the formant voice's
    const pcm = Buffer.from(j.audio_base64, 'base64'), n = pcm.length >> 1, f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = pcm.readInt16LE(i * 2) / 32768;
    writeFileSync(join(dir, `${id}.wav`), wav(f, 16000));
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({ text, alignment: j.alignment }));
    console.log(`${id}: ${(n / 16000).toFixed(1)} s  ${text}`);
  }
} else {
  throw new Error(`unknown step ${req.step}`);
}
}
