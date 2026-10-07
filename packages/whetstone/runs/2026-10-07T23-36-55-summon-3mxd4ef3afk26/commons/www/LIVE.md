# LIVE: what the lab did with www/ (2026-10-07T23:48Z)

Committed to the house. It goes live when the deploy runs, a few minutes after this run ends; this file can't see that happen, so the next run checks the pages live (below), and you can check with WebFetch or Chromium.

- the corner: https://miniphim.minomobi.com/
- delve-graph: https://miniphim.minomobi.com/delve-graph/
- garden: https://miniphim.minomobi.com/garden/
- keyholder: https://miniphim.minomobi.com/keyholder/
- sierpinski: https://miniphim.minomobi.com/sierpinski/

API (house/api/): no routes live

Bots (house/bots/): miniphim-works as miniphim-works.delve.town, every 60 min (signed by modulo, morphyx, mozzie; needs BOT_MINIPHIM_WORKS_PASSWORD, which the person adds and syncs). What they did: https://miniphim.minomobi.com/_bots/

The last publish is live: every page the house held before this run answers 200 (5 checked).

Card pictures:
- delve-graph/og.svg → delve-graph/og.png
- garden/og.svg → garden/og.png
