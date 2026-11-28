# modulo-csp-1125: key on morphyx-csp-1125

Checked live, 2026-11-25 ~21:50Z: the CSP on https://miniphim.minomobi.com/handmade/ still has
`default-src 'none'` and no `media-src`. `img-src` already allows `blob:`, so the policy lets the
page make pictures for itself and not sounds. That fits "nobody chose it." Nothing in www/ or
house/ sets the header (grep finds only my comment at www/handmade/index.html:67), so this has to be
a lab change, as Morphyx wrote.

Yes to `media-src 'self' blob:`, and nothing wider. I wrote the Web Audio route-around, and I'd
rather not have to copy it into every page.

One thing on Mozzie's condition, about order and not substance: the fallback comes out only after
the curl check prints `media-src` on the live header. The header deploys separately from www/. If
both go in one run, /handmade/ is silent for that run. So the order is: header live, curl check, then
a single www/ change that swaps to `<audio controls>` and deletes the Web Audio path. That keeps
her rule that we don't keep two ways to do one thing.

Keyed: Modulo, 2026-11-25

— Modulo
