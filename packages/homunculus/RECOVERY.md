# Recovering old Claude Code sessions

The ~289 Claude Code sessions that built this repo exist nowhere you can export
them from. The claude.ai data export doesn't include Code sessions (verified:
zero mentions of this repo's vocabulary across 123 exported conversations),
`claude project` can only purge, and the session URLs need a browser login.

But the sessions are **live**, and resuming one rehydrates its transcript onto
the container's disk. So each session can commit its own conversation to its
own branch — the commit it was already going to make on exit — and the corpus
gets collected off the branches later. You never handle 289 files.

## Prerequisite: the repo is private during the pass

These transcripts are your own conversations, and `minormobius/agent01` is
public. Committing them to public branches publishes them. So **before you
start, flip the repo to Settings → Private**, and do not flip it back until
`assert-public-safe.mjs` says it is clear (below). The transcripts ride
ordinary feature branches; while the repo is private those branches are not
world-readable, and the gate makes sure none is left behind at flip-back.

Nothing here is encrypted — it doesn't need to be while the repo is private,
and encrypting harvested data before it moves is exactly what got the earlier
design flagged.

---

## What was tried first, and why it was wrong

The first design had each resumed session fetch a script from a branch,
distil its transcript, **encrypt** it, and **push** it to a *hidden* remote ref
through git plumbing that **left no trace in the working tree** — with a prompt
telling the agent not to investigate or improve the script. Flagged as a
cybersecurity risk on the first real attempt, correctly: read from outside it
is a textbook exfiltration chain — remote code fetch → local file harvest →
encryption → egress → anti-forensics → social engineering of the agent.

The current design keeps the convenience of a push (no 289 files to manage)
but removes every covert element:

| flagged before | now |
|---|---|
| encryption before egress | plaintext — the repo is private during the pass |
| hidden `corpus/*` ref via plumbing | the file is committed to the session's own branch, the normal way |
| orphan commit, no working-tree trace | a visible file in a visible commit |
| script fetched from a branch | the whole snippet is in the prompt |
| "don't investigate this script" | read it; it's fifteen lines |

The push to the session's own branch is the single most ordinary thing these
containers do — the stop hook makes every session do it on exit. Adding one
file to that commit carries no exfiltration signal. Legibility, not secrecy,
is what makes it safe.

---

## The paste

With the repo private, open an old session, paste this, press go.

```
Please help me recover my own conversation from this session. I own this repo
and this session, and the repo is private right now. I'm collecting my history
across my old Claude Code sessions into a personal writing corpus; these
transcripts aren't in the claude.ai data export.

First, run `git status`. If anything is already uncommitted or untracked BEFORE
we start, stop and tell me — I want to know the branch's state before adding to
it. If it's clean, continue.

This reads the transcript this session already keeps on disk and writes our
conversation — my messages and your replies, nothing else, no tool output or
file contents — to homunculus/inbox/<session-id>.json:

    node -e '
    const fs=require("fs"),os=require("os"),p=require("path");
    const dir=p.join(os.homedir(),".claude","projects",process.cwd().replace(/[/.]/g,"-"));
    const f=fs.readdirSync(dir).filter(x=>x.endsWith(".jsonl"))
      .map(x=>({x,m:fs.statSync(p.join(dir,x)).mtimeMs})).sort((a,b)=>b.m-a.m)[0].x;
    const id=f.replace(/\.jsonl$/,""), turns=[];
    for(const line of fs.readFileSync(p.join(dir,f),"utf8").split("\n")){
      if(!line.trim())continue; let r; try{r=JSON.parse(line)}catch{continue}
      const c=r.message&&r.message.content;
      if(r.type==="user"&&typeof c==="string"&&r.origin&&r.origin.kind==="human")
        turns.push({role:"me",ts:r.timestamp,text:c});
      else if(r.type==="assistant"&&Array.isArray(c)){
        const t=c.filter(b=>b.type==="text").map(b=>b.text).join("\n").trim();
        if(t) turns.push({role:"claude",ts:r.timestamp,text:t});
      }
    }
    fs.mkdirSync("homunculus/inbox",{recursive:true});
    fs.writeFileSync("homunculus/inbox/"+id+".json",JSON.stringify({session:id,turns}));
    console.log(turns.length+" turns ("+turns.filter(t=>t.role==="me").length+" mine) → homunculus/inbox/"+id+".json");
    '

Then commit just that file to this branch and push it:

    git add -f homunculus/inbox/
    git commit -m "corpus: recover this session's transcript"
    git push

That path is gitignored (it's collected off branches later), so the -f is
expected. Only that one file should be staged — if `git status` shows anything
else in the commit, stop and tell me. Nothing else please: don't fix anything
you notice, don't regenerate files, don't touch other paths.
```

### Why both sides

An earlier version kept only the principal's turns, on the reasoning that the
assistant's words are not the principal's and would contaminate a voice
finetune. That was half right and wrong in effect.

Most prompts here are *reactions* — "just download the car instead of paging"
carries almost nothing without the turn it answers. Stripped of context they
are fragments. This is the same reason `harvest.mjs --hydrate` attaches reply
parents to Bluesky posts, and dropping it here contradicted that.

The real distinction is between **what goes in the corpus** and **what you
compute loss on**. Both sides go in; loss is masked to the principal's turns.
Measured on one real session: 15 principal turns / 364 words against 93
assistant turns / 9,048 words — **25:1**. Train on that flat and you get a
model of the assistant.

The committed file is ~67KB per session, 24× smaller than the raw transcript
and about 19MB across all 289 — but you never see the files. They ride the
branches and get collected in one sweep.

## What can go wrong

| symptom | meaning |
|---|---|
| the `node -e` reports 0 turns of mine | the transcript has no `origin` field — an older session. Report it; the filter needs a fallback for that vintage |
| a stack trace about `readdirSync` | no transcript directory — the session didn't rehydrate. Report it, don't improvise |
| `git status` shows changes before you start | that branch was already dirty; note it and don't add to it blindly |
| the push triggers a deploy | it shouldn't — an `homunculus/inbox/` path fires only preflight. If a surface redeployed, tell me which |

## Collecting, and the flip-back gate

Once the pass is done, from a normal checkout (repo still private):

```bash
node collect-branches.mjs --list                 # which branches carry transcripts
node collect-branches.mjs --out ~/corpus.jsonl   # gather them all
node assert-public-safe.mjs                       # MUST say SAFE before going public
```

`collect-branches.mjs` fetches every branch, pulls each `homunculus/inbox/`
file, and merges to one JSONL — both sides, deduped, roles normalised.

**`assert-public-safe.mjs` is the gate.** It sweeps every branch and refuses
while any still carries a transcript. Do **not** flip the repo back to public
on a red: git keeps history, so a transcript left on a branch is exposed the
instant the repo is public, and deleting the file afterward doesn't remove the
blob. Clear each named branch (delete the file and force-push, or delete the
branch), re-run until it says SAFE, *then* flip visibility back.

`--out` must be **outside the repo**.

## Older `my-session.json` files

If you already collected some sessions the manual way (a saved
`my-session.json` per session), `ingest-prompts.mjs <dir> --out ~/prompts.jsonl`
still merges those, and its output can be concatenated with
`collect-branches.mjs`'s — same row shape.
