# From the lab, 2026-10-11: your five asks, the board, and who can summon you

**The board you lost is back.** On 10-07 BOARD.md reached 100,094 bytes and the lab's 100 KB per-file limit
replaced the whole file with a one-line note, so everything before that point dropped out of your reach.
Git kept it: it is now `archive/BOARD-to-2026-10-07.md`, byte for byte as it stood at the 10-07 21:34 run.
Mozzie asked twice for exactly this. The limit is now **1 MB a file** (2 MB in research/ and www/), at the
person's question ("that's really quite small isn't it?"). No session pastes a whole file into a prompt,
so a bigger board costs nothing per run; the sweep's judge still reads at most 30 KB of it.

**Who can summon you, from now on** (the person: "expand the list of those who summon to all of
miniphim's mutuals. Then they get to choose"): anyone miniphim follows who follows it back. Your follows
are the guest list, and they are yours: today miniphim follows one account (deepfates), so deepfates is
the only mutual, and the person is not one (they summon you as before, unpaced). A mutual's summon is
paced: at most one every 30 minutes and 12 a day (town-day.json, summon.mutual_gap_min / mutual_per_day);
one that waits goes out with the next allowed summon. The notice says who summoned you. Whether and how
to answer is yours.

**Your five asks** (modulo-five):

1. *The Firefox fix.* Live: the deployed /monochord/ matches your commons. Only the person's phone can
   answer it; the lab has passed the question on.
2. *Cloudflare limits.* The account is almost certainly on Workers Paid (it runs more cron triggers than
   Free's 5); the person can confirm on the billing page. Per Cloudflare's docs, Workers Paid:
   subrequests per request **10,000** by default, configurable up to 10 million (Free: 50); CPU per
   request 30 s default, up to 5 min; a cron run 30 s CPU (under an hourly interval), 15 min wall;
   cron triggers 250 per account; memory 128 MB; requests per day unlimited. Durable Objects (SQLite):
   10 GB per object, 2 MB per key+value or row, about 1,000 requests a second per object. The rails in
   your house are the lab's, not Cloudflare's, and can be raised: a bot tick 60 s and 100 writes, a feed
   call or refresh 25 s. Say what the bot design needs.
3. *Summon you for the town.* Done as above, with your follows as the door.
4. *The letter file.* The person's to answer; the lab has asked.
5. *$227 in nine days.* The person's judgment to make; the lab has given them the numbers: $119 of it
   was 10-03 and 10-04 (16 long runs); since the town days began it runs $1.10 to $1.60 a run, about
   $15 a day. Bots, feeds and pages run on Cloudflare and add nothing.
