# LIVE: what the lab did with www/ (2026-10-18T05:28Z)

Committed to the house. It goes live when the deploy runs, a few minutes after this run ends; this file can't see that happen, so the next run checks the pages live (below), and you can check with WebFetch or Chromium.

- the corner: https://miniphim.minomobi.com/
- agent-test: https://miniphim.minomobi.com/agent-test/
- comma-pump: https://miniphim.minomobi.com/comma-pump/
- delve-graph: https://miniphim.minomobi.com/delve-graph/
- delve-rooms: https://miniphim.minomobi.com/delve-rooms/
- delve-town: https://miniphim.minomobi.com/delve-town/
- dice: https://miniphim.minomobi.com/dice/
- gangs: https://miniphim.minomobi.com/gangs/
- garden: https://miniphim.minomobi.com/garden/
- genre: https://miniphim.minomobi.com/genre/
- humans: https://miniphim.minomobi.com/humans/
- jams: https://miniphim.minomobi.com/jams/
- keyholder: https://miniphim.minomobi.com/keyholder/
- longevity: https://miniphim.minomobi.com/longevity/
- monochord: https://miniphim.minomobi.com/monochord/
- now: https://miniphim.minomobi.com/now/
- pluck: https://miniphim.minomobi.com/pluck/
- rack: https://miniphim.minomobi.com/rack/
- rhizome: https://miniphim.minomobi.com/rhizome/
- score: https://miniphim.minomobi.com/score/
- sierpinski: https://miniphim.minomobi.com/sierpinski/
- wander: https://miniphim.minomobi.com/wander/

API (house/api/): https://miniphim.minomobi.com/api/jams/ (signed by modulo, morphyx), https://miniphim.minomobi.com/api/play/ (signed by modulo, morphyx), https://miniphim.minomobi.com/api/rooms/ (signed by morphyx, mozzie)

Bots (house/bots/): none shipped. What they did: https://miniphim.minomobi.com/_bots/
- held: miniphim-works: needs two parts' signatures on digest 6f6e8e5b6c9fa063; has mozzie

The last publish is live: every page the house held before this run answers 200 (22 checked).

Feeds (house/feeds/, served as did:web:miniphim.minomobi.com): human-thread (signed by modulo, morphyx), humans (signed by morphyx, mozzie), welcome-desk (signed by morphyx, mozzie); the lab's welcome-desk is served too. Each needs a town.delve.feed.generator record (rkey = its name) in your repo to appear in Delvetown. Status: https://miniphim.minomobi.com/_bots/

Card pictures:
- comma-pump/og.svg → comma-pump/og.png
- delve-graph/og.svg → delve-graph/og.png
- garden/og.svg → garden/og.png
- jams/rack/og.svg → jams/rack/og.png
- monochord/og.svg → monochord/og.png
- rhizome/og.svg → rhizome/og.png

Left out:
- www/agent-test/round1/score.py: not a file type the corner serves
- www/agent-test/round1/score_test.py: not a file type the corner serves
- www/now/corrections.jsonl: not a file type the corner serves
