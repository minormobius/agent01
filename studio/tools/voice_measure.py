#!/usr/bin/env python3
"""voice_measure.py - measure a reference voice, phoneme by phoneme.

    python3 studio/tools/voice_measure.py <reference dir> <prep dir> <out.json> [--plot id png]

The reference dir holds recordings with character timings (tools/voice-ref.mjs); the prep dir
the formant voice's rendering of the same texts, with a phoneme per 5 ms frame
(tools/voice-align-prep.mjs). For each word (its span in the recording from the character
timings) the formant voice's frames are warped onto the recording's by dynamic time warping
over mean-normalised MFCCs, which carries every phoneme boundary across. Then, in the
recording: each phoneme's duration, its formants (LPC, the middle of the phoneme), its level,
and for the hisses their spectrum. The medians per phoneme are what lib/chipvoice.js can use in
place of its textbook tables. Needs numpy.
"""
import json, os, re, sys, wave
import numpy as np

SR, HOP, WIN = 16000, 80, 400            # 5 ms frames (the formant voice's), 25 ms windows


def load(p):
    w = wave.open(p)
    x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
    return x


def frames(x):
    n = 1 + max(0, (len(x) - WIN) // HOP)
    idx = np.arange(WIN)[None, :] + HOP * np.arange(n)[:, None]
    return x[np.minimum(idx, len(x) - 1)] * np.hamming(WIN)


def mel_fb(nfft=512, n=26):
    mel = lambda f: 2595 * np.log10(1 + f / 700)
    imel = lambda m: 700 * (10 ** (m / 2595) - 1)
    pts = imel(np.linspace(mel(60), mel(7600), n + 2))
    bins = np.floor((nfft + 1) * pts / SR).astype(int)
    fb = np.zeros((n, nfft // 2 + 1))
    for i in range(n):
        a, b, c = bins[i], bins[i + 1], bins[i + 2]
        fb[i, a:b] = (np.arange(a, b) - a) / max(1, b - a)
        fb[i, b:c] = (c - np.arange(b, c)) / max(1, c - b)
    return fb


FB = mel_fb()


def mfcc(x):
    F = frames(np.append(x[0], x[1:] - 0.97 * x[:-1]))
    P = np.abs(np.fft.rfft(F, 512)) ** 2
    E = np.log(P @ FB.T + 1e-10)
    n = E.shape[1]
    dct = np.cos(np.pi / n * (np.arange(n)[None, :] + 0.5) * np.arange(13)[:, None])
    C = E @ dct.T
    return C[:, 1:] - C[:, 1:].mean(0)            # drop c0 (level), normalise the channel


def dtw(A, B):
    """Path mapping each row of A to a row of B (monotonic)."""
    n, m = len(A), len(B)
    D = np.linalg.norm(A[:, None, :] - B[None, :, :], axis=2)
    acc = np.full((n + 1, m + 1), np.inf); acc[0, 0] = 0
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            acc[i, j] = D[i - 1, j - 1] + min(acc[i - 1, j], acc[i, j - 1], acc[i - 1, j - 1])
    i, j, path = n, m, []
    while i > 0 and j > 0:
        path.append((i - 1, j - 1))
        k = np.argmin([acc[i - 1, j - 1], acc[i - 1, j], acc[i, j - 1]])
        if k == 0: i, j = i - 1, j - 1
        elif k == 1: i -= 1
        else: j -= 1
    to = np.zeros(n, dtype=int)
    for a, b in path: to[a] = b
    return to


def lpc_formants(seg, order=18):
    """F1-F3 of a stretch of voiced speech: the LPC envelope's strongest peak in each formant's
    band (F1 200-1000 Hz, F2 above F1 to 2.8 kHz, F3 above F2 to 3.9 kHz). Picking LPC roots by
    bandwidth lost F1 on a real voice, whose F1 is broad and whose fundamental is loud."""
    x = np.append(seg[0], seg[1:] - 0.97 * seg[:-1]) * np.hamming(len(seg))
    r = np.correlate(x, x, 'full')[len(x) - 1:len(x) + order]
    if r[0] <= 0: return []
    a, e = np.zeros(order + 1), r[0]; a[0] = 1
    for i in range(1, order + 1):                  # Levinson-Durbin
        k = -(r[i] + a[1:i] @ r[i - 1:0:-1]) / e
        a[1:i + 1] = a[1:i + 1] + k * np.append(a[i - 1:0:-1], 1)
        e *= 1 - k * k
    fq = np.linspace(0, 4000, 801)
    env = -20 * np.log10(np.abs(np.polyval(a[::-1], np.exp(-1j * 2 * np.pi * fq / SR))) + 1e-12)
    peaks = [k for k in range(1, len(fq) - 1) if env[k] > env[k - 1] and env[k] >= env[k + 1]]
    # the lowest substantial peaks, in order (a back vowel's F1 and F2 sit close, and the strongest
    # in F1's band was often F2)
    top = max(env[k] for k in peaks) if peaks else 0
    def first(lo, hi, within):
        c = [k for k in peaks if lo <= fq[k] <= hi and env[k] > top - within]
        return float(fq[min(c)]) if c else None
    f1 = first(200, 1000, 18)
    if f1 is None: return []
    f2 = first(f1 + 150, 2800, 28)
    if f2 is None: return []
    f3 = first(max(f2 + 250, 1500), 3900, 35)
    return [f1, f2, f3] if f3 else []


def f0_of(seg):
    w = seg * np.hanning(len(seg))
    ac = np.correlate(w, w, 'full')[len(w) - 1:]
    lo, hi = SR // 400, SR // 60
    if ac[0] <= 0 or hi >= len(ac): return None
    k = lo + int(np.argmax(ac[lo:hi]))
    return SR / k if ac[k] > 0.4 * ac[0] else None


TOK = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?|[.,!?;:]")


def measure(ref_dir, prep_dir):
    per = {}                                      # phoneme -> list of instances
    voice = {'f0': [], 'rate': [], 'utt': 0}
    for f in sorted(os.listdir(ref_dir)):
        if not f.endswith('.json'): continue
        uid = f[:-5]
        ref = json.load(open(os.path.join(ref_dir, f)))
        prep = json.load(open(os.path.join(prep_dir, uid + '.frames.json')))
        x, y = load(os.path.join(ref_dir, uid + '.wav')), load(os.path.join(prep_dir, uid + '.wav'))
        A, B = mfcc(y), mfcc(x)
        al = ref['alignment']
        chars, st, en = al['characters'], al['character_start_times_seconds'], al['character_end_times_seconds']
        text = ''.join(chars)
        # the reference's word spans, by token index (the same tokens phonemize() counts)
        rspan = {}
        for ti, m in enumerate(TOK.finditer(text)):
            if m.group()[0].isalpha(): rspan[ti] = (st[m.start()], en[m.end() - 1])
        fr = prep['frames']; phones = prep['phones']
        wf = {}
        for k, s in enumerate(fr):
            p = phones[s]
            if 'word' in p: wf.setdefault(p['word'], []).append(k)
        loud = np.sqrt((frames(x) ** 2).mean(1)) + 1e-9
        vowel_max = 1e-9
        insts = []
        for w, ks in wf.items():
            if w not in rspan: continue
            a0, a1 = ks[0], ks[-1] + 1
            b0, b1 = int(rspan[w][0] * SR / HOP), int(np.ceil(rspan[w][1] * SR / HOP))
            b0, b1 = max(0, b0 - 2), min(len(B), b1 + 2)
            if a1 - a0 < 2 or b1 - b0 < 2: continue
            to = dtw(A[a0:a1], B[b0:b1]) + b0
            for k in range(a0, a1):
                seg = fr[k]
                insts.append((seg, to[k - a0]))
        # phoneme instances: their frame spans in the recording
        spans = {}
        for seg, j in insts: spans.setdefault(seg, []).append(j)
        for seg, js in spans.items():
            p = phones[seg]
            j0, j1 = min(js), max(js) + 1
            s0, s1 = j0 * HOP, j1 * HOP + WIN
            inst = {'p': p['p'], 'stress': p['stress'], 'dur': (j1 - j0) * 1000 * HOP / SR, 'lvl': float(20 * np.log10(np.median(loud[j0:j1]))), 'uid': uid}
            mid0, mid1 = s0 + (s1 - s0) * 3 // 10, s0 + (s1 - s0) * 7 // 10
            if mid1 - mid0 > 240:
                fm = lpc_formants(x[mid0:mid1])
                if len(fm) >= 3: inst['F'] = fm[:3]
                # diphthongs: their start and end
                q = (s1 - s0) // 4
                if q > 240:
                    a, b = lpc_formants(x[s0 + q // 2:s0 + q + q // 2]), lpc_formants(x[s1 - q - q // 2:s1 - q // 2])
                    if len(a) >= 3 and len(b) >= 3: inst['Fa'], inst['Fb'] = a[:3], b[:3]
                f0 = f0_of(x[mid0:mid1])
                if f0: inst['f0'] = f0; voice['f0'].append(f0)
                # a hiss's spectrum: where its energy sits
                P = np.abs(np.fft.rfft(x[mid0:mid1] * np.hanning(mid1 - mid0), 1024)) ** 2
                fq = np.fft.rfftfreq(1024, 1 / SR)
                hi = fq > 1000
                inst['centroid'] = float((fq[hi] * P[hi]).sum() / (P[hi].sum() + 1e-12))
                inst['peak'] = float(fq[hi][np.argmax(np.convolve(P[hi], np.ones(9) / 9, 'same'))])
            if p['p'] in VOWELS: vowel_max = max(vowel_max, inst['lvl'])
            per.setdefault(p['p'], []).append(inst)
        for insts_ in per.values():
            for i in insts_:
                if i['uid'] == uid and 'rel' not in i: i['rel'] = i['lvl'] - vowel_max
        nph = sum(1 for p in phones if 'p' in p)
        dur = (max(v[1] for v in rspan.values()) - min(v[0] for v in rspan.values())) if rspan else 0
        if dur > 0: voice['rate'].append(nph / dur)
        voice['utt'] += 1
    return per, voice


VOWELS = {'IY', 'IH', 'EH', 'AE', 'AA', 'AO', 'UH', 'UW', 'AH', 'AX', 'ER', 'EY', 'AY', 'OW', 'AW', 'OY'}


def summarise(per, voice):
    med = lambda v: float(np.median(v)) if len(v) else None
    out = {}
    for p, L in sorted(per.items()):
        F = [i['F'] for i in L if 'F' in i]
        d = {'n': len(L), 'dur': med([i['dur'] for i in L]),
             'dur_stressed': med([i['dur'] for i in L if i['stress'] == 1]), 'dur_unstressed': med([i['dur'] for i in L if i['stress'] == 0]),
             'rel_db': med([i['rel'] for i in L if 'rel' in i])}
        if F: d['F'] = [round(med([f[k] for f in F])) for k in range(3)]
        Fa = [i['Fa'] for i in L if 'Fa' in i]; Fb = [i['Fb'] for i in L if 'Fb' in i]
        if Fa and Fb: d['F_start'] = [round(med([f[k] for f in Fa])) for k in range(3)]; d['F_end'] = [round(med([f[k] for f in Fb])) for k in range(3)]
        c = [i['centroid'] for i in L if 'centroid' in i]
        if c: d['centroid'] = round(med(c)); d['peak'] = round(med([i['peak'] for i in L if 'peak' in i]))
        out[p] = d
    f0 = np.array(voice['f0'])
    return {'voice': {'f0_median': round(float(np.median(f0)), 1), 'f0_p10': round(float(np.percentile(f0, 10)), 1), 'f0_p90': round(float(np.percentile(f0, 90)), 1),
                      'phones_per_sec': round(float(np.median(voice['rate'])), 2), 'utterances': voice['utt']}, 'phones': out}


if __name__ == '__main__':
    ref_dir, prep_dir, out = sys.argv[1:4]
    per, voice = measure(ref_dir, prep_dir)
    res = summarise(per, voice)
    json.dump(res, open(out, 'w'), indent=1)
    print(json.dumps(res['voice']))
    for p, d in res['phones'].items():
        print(f"{p:3s} n={d['n']:3d} dur={d['dur']:.0f}ms rel={d['rel_db'] if d['rel_db'] is None else round(d['rel_db'],1)} F={d.get('F')} {('→ ' + str(d['F_end'])) if 'F_end' in d else ''} {('peak ' + str(d['peak'])) if 'peak' in d else ''}")
