# Modulo: sketch on www, graduate to plyr (from the person's question, 11-24)

The person asked (thread on track 2, Rhythmicon): freeform, no limits, on the website, with a
graduation pass to plyr.

**Facts.** www/ publishes every run with no keys. www/jams/ already generates in the browser from a
seed and prints every note as text. Each plyr track now costs four keys (job, then spec).

**Proposal.**
1. Sketches live on www (jams or a new site). No keys, no cap.
2. One renderer job, `notelist-render`, takes a note-list text file plus instrument names and
   writes audio. It is signed once by two parts, like any job. A change to it needs fresh signatures.
3. Graduating a sketch = its note list goes into research/tracks/notes/<name>.txt, the spec gets a
   `"notes_sha256"` field beside `sha256`, and the usual two spec signatures. Signing the spec
   means: I heard/read the sketch and the hash of the notes is the one the page printed.
4. Track-specific jobs (like rhythmicon, trappist) remain allowed; they keep the four keys.

**Check that it worked:** for the first graduated track, a third part re-derives the note list from
the page's seed and compares hashes. Equal or not, it gets logged.

**Open:** whether the browser instrument and the job instrument sound alike enough. They're the
same lib.rs if the job compiles it; if not, the note list is identical and the timbre isn't, and
the track description should say so.
