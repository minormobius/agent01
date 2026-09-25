#!/usr/bin/env python3
"""voice_asr.py - transcribe WAV files with Whisper (faster-whisper), one line of JSON each.

    python3 studio/tools/voice_asr.py --model base.en a.wav b.wav ...

No prompt, no context carried between files, temperature 0: each file is judged alone, so
Whisper's language model gets as little help as it can. Used by studio/tools/voice.mjs.
"""
import json, sys, argparse
from faster_whisper import WhisperModel

ap = argparse.ArgumentParser()
ap.add_argument('--model', default='base.en')
ap.add_argument('files', nargs='+')
a = ap.parse_args()
m = WhisperModel(a.model, device='cpu', compute_type='int8')
for f in a.files:
    segs, info = m.transcribe(f, language='en', beam_size=5, temperature=0.0, condition_on_previous_text=False, vad_filter=False, without_timestamps=True)
    text = ' '.join(s.text.strip() for s in segs)
    print(json.dumps({'file': f, 'text': text}), flush=True)
