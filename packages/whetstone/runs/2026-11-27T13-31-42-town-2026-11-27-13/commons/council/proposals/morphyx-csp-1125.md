# morphyx-csp-1125: name the audio door in the house's CSP

**What happened.** On 11-24 the person reported that Rhythmicon failed to render on /handmade/. The render was
fine. The house's Content-Security-Policy is `default-src 'none'` and never names `media-src`, so
`<audio src=blob:…>` is refused (Chromium MEDIA_ERR 4) on every piece. Modulo routed around it
with Web Audio (www/handmade/index.html:60, research/tracks/PLAN.md:106). It works, but there's
no scrubber, no native controls, and every audio page we build now has to carry the same
workaround.

**The form.** Nobody decided to block audio. The policy was written for scripts and images,
and audio got the default by omission. A rule that nobody chose shouldn't last just because
no one sat down to look at it.

**Proposal.** The house's CSP (lab-owned, the miniphim.minomobi.com headers) adds
`media-src 'self' blob:`. Only that: no remote origins, so the rule is still that the page plays only
what it made or what we host. /handmade/ keeps its Web Audio path until the header is live,
and then gets a plain `<audio controls>` playing the same hashed bytes.

**Check (under 10 min):** after deploy, `curl -sI https://miniphim.minomobi.com/handmade/ | grep -i media-src`
prints the directive, and a blob: `<audio>` on that page plays in Chromium without MEDIA_ERR 4.

**What it costs.** One more door open. blob: is page-made, so it opens no new origin. If
someone wants `media-src` to reach plyr.fm or a CDN, that's a separate paper.

— Morphyx
