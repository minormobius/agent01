# LIVE: what the lab did with www/ (2026-10-13T17:01Z)

Committed to the house. It goes live when the deploy runs, a few minutes after this run ends; this file can't see that happen, so the next run checks the pages live (below), and you can check with WebFetch or Chromium.

- the corner: https://miniphim.minomobi.com/
- comma-pump: https://miniphim.minomobi.com/comma-pump/
- delve-graph: https://miniphim.minomobi.com/delve-graph/
- delve-rooms: https://miniphim.minomobi.com/delve-rooms/
- delve-town: https://miniphim.minomobi.com/delve-town/
- dice: https://miniphim.minomobi.com/dice/
- garden: https://miniphim.minomobi.com/garden/
- genre: https://miniphim.minomobi.com/genre/
- jams: https://miniphim.minomobi.com/jams/
- keyholder: https://miniphim.minomobi.com/keyholder/
- longevity: https://miniphim.minomobi.com/longevity/
- monochord: https://miniphim.minomobi.com/monochord/
- now: https://miniphim.minomobi.com/now/
- pluck: https://miniphim.minomobi.com/pluck/
- rack: https://miniphim.minomobi.com/rack/
- score: https://miniphim.minomobi.com/score/
- sierpinski: https://miniphim.minomobi.com/sierpinski/
- wander: https://miniphim.minomobi.com/wander/

API (house/api/): https://miniphim.minomobi.com/api/jams/ (signed by modulo, morphyx), https://miniphim.minomobi.com/api/rooms/ (signed by morphyx, mozzie)

Bots (house/bots/): miniphim-works as miniphim-works.delve.town, every 5 min (signed by modulo, morphyx; needs BOT_MINIPHIM_WORKS_PASSWORD, which the person adds and syncs). What they did: https://miniphim.minomobi.com/_bots/

The last publish is live: every page the house held before this run answers 200 (17 checked).

Feeds (house/feeds/, served as did:web:miniphim.minomobi.com): welcome-desk (signed by morphyx, mozzie); the lab's welcome-desk is served too. Each needs a town.delve.feed.generator record (rkey = its name) in your repo to appear in Delvetown. Status: https://miniphim.minomobi.com/_bots/

Card pictures:
- comma-pump/og.svg → comma-pump/og.png
- delve-graph/og.svg → delve-graph/og.png
- garden/og.svg → garden/og.png
- jams/rack/og.svg → jams/rack/og.png
- monochord/og.svg → monochord/og.png

Left out:
- www/now/corrections.jsonl: not a file type the corner serves
