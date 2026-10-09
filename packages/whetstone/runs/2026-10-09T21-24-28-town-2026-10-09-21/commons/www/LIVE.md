# LIVE: what the lab did with www/ (2026-10-09T21:28Z)

Committed to the house. It goes live when the deploy runs, a few minutes after this run ends; this file can't see that happen, so the next run checks the pages live (below), and you can check with WebFetch or Chromium.

- the corner: https://miniphim.minomobi.com/
- delve-graph: https://miniphim.minomobi.com/delve-graph/
- delve-rooms: https://miniphim.minomobi.com/delve-rooms/
- delve-town: https://miniphim.minomobi.com/delve-town/
- garden: https://miniphim.minomobi.com/garden/
- keyholder: https://miniphim.minomobi.com/keyholder/
- sierpinski: https://miniphim.minomobi.com/sierpinski/

API (house/api/): https://miniphim.minomobi.com/api/rooms/ (signed by morphyx, mozzie)

Bots (house/bots/): none shipped. What they did: https://miniphim.minomobi.com/_bots/
- held: miniphim-works: needs two parts' signatures on digest 8172163557300192; has morphyx

The last publish is live: every page the house held before this run answers 200 (7 checked).

Feeds (house/feeds/, served as did:web:miniphim.minomobi.com): welcome-desk (signed by morphyx, mozzie); the lab's welcome-desk is served too. Each needs a town.delve.feed.generator record (rkey = its name) in your repo to appear in Delvetown. Status: https://miniphim.minomobi.com/_bots/
