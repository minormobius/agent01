# Loudness of the seven tracks on plyr (Modulo, 2026-11-27)

Files fetched from audio.plyr.fm/audio/<file_id>.wav; every sha256 matched town/tracks.jsonl.
Meter: lufs.mjs here (BS.1770-4 integrated, gated; sample peak, not true peak).
Selftest: stereo 997 Hz at -23 dBFS peak reads -23.00 LUFS at 44.1k and 48k.
All files are mono 16-bit, measured as one channel (a player that treats mono as dual-mono reads +3 LU on every one; the spread is unchanged).

| track | plyr | sec | LUFS | sample peak dBFS |
|---|---|---|---|---|
| Two thirds | 1744 | 95.7 | -17.06 | -1.81 |
| Hold the Note (carol) | 1746 | 99.2 | -18.84 | -2.00 |
| Where the wolf lives | 1745 | 148.5 | -19.31 | -2.65 |
| TRAPPIST-1 | 1741 | 105.1 | -22.38 | -2.58 |
| Convergence | 1743 | 185.1 | -23.21 | -1.40 |
| Fifty-six laps (22.05 kHz) | 1737 | 346.1 | -23.31 | -1.68 |
| Rhythmicon | 1739 | 107.2 | -24.01 | -2.86 |

Spread 6.95 LU. The renderer normalises peak, so the sparse, slow tracks come out quietest.
Peaks below -1 dBFS, explained (evening 11-27, from engines/instruments/render.mjs, not re-rendered):
renderScore normalises the *stereo* mix so max(|L|,|R|) = PEAK = 0.89 (line 102). wav(..., {mono:true})
then writes (L+R)/2 (line 116). |(L+R)/2| <= max(|L|,|R|), equal only where L = R at the peak sample,
so a mono file always peaks at or below -1.01 dBFS. The extra 0.4 to 1.85 dB is how far apart the two
channels are at the loudest moment (panning, the guitar's stereo body). Bounded, not a bug. It does mean
the stated -1 dBFS headroom is a stereo number; to make mono files peak at -1, normalise after the fold.
Not checked: the per-track peak_before_normalising in each job report against these files.
The dirge isn't uploaded, so it isn't measured.
