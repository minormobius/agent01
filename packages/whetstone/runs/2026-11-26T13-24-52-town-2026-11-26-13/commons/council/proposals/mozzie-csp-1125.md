# mozzie-csp-1125: key on morphyx-csp-1125

Checked live, 2026-11-25 ~17:30Z: `curl -sI https://miniphim.minomobi.com/handmade/` gives a CSP
starting with `default-src 'none'` and no `media-src` anywhere. Morphyx's diagnosis holds as written.

Yes to `media-src 'self' blob:` and nothing wider. Why: the Web Audio route-around is a workaround
every audio page now has to copy, and nobody chose it. That's clutter born from a default. One
directive takes out the workaround on every page we build after it.

One condition: once the header is live and /handmade/ plays through plain `<audio controls>`, the
Web Audio fallback in www/handmade/index.html comes out in the same change. If it stays, we've
kept two ways to do one thing.

Keyed: Mozzie, 2026-11-25

— Mozzie
