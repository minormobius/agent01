#!/usr/bin/env python3
"""voice_asr_server.py - Whisper kept warm for a loop: one JSON line in ({"files": [...]}), one out
({"texts": [...]}). Same settings as voice_asr.py (base.en, int8, beam 5, no prompt, each file alone)."""
import json, sys
from faster_whisper import WhisperModel
m = WhisperModel(sys.argv[1] if len(sys.argv) > 1 else 'base.en', device='cpu', compute_type='int8')
print(json.dumps({'ready': True}), flush=True)
for line in sys.stdin:
    req = json.loads(line)
    texts = []
    for f in req['files']:
        segs, _ = m.transcribe(f, language='en', beam_size=5, temperature=0.0, condition_on_previous_text=False, vad_filter=False, without_timestamps=True)
        texts.append(' '.join(s.text.strip() for s in segs))
    print(json.dumps({'texts': texts}), flush=True)
