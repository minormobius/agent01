# Recovering old Claude Code sessions

The ~289 Claude Code sessions that built this repo exist nowhere you can export
them from. The claude.ai data export doesn't include Code sessions (verified:
zero mentions of this repo's vocabulary across 123 exported conversations),
`claude project` can only purge, and the session URLs need a browser login.

But the sessions are **live**, and resuming one rehydrates its transcript onto
the container's disk. So each session can show you your own messages, and you
save them.

---

## What was tried first, and why it was wrong

The first design had each resumed session fetch a script from a branch,
distil its transcript, **encrypt** it, and **push** it to a remote ref through
git plumbing that **left no trace in the working tree** — with a prompt telling
the agent not to investigate or improve the script.

That was flagged as a cybersecurity risk on the first real attempt, correctly.
Read from outside it is a textbook exfiltration chain: remote code fetch →
local file harvest → encryption → egress → anti-forensics → social engineering
of the agent. The encryption was meant to protect the data from a public repo,
but encrypting harvested data before it leaves is the single strongest signal
in that pattern. Trying to make it safe is what made it look worst.

**Do not reintroduce any of that.** The rules the current approach keeps to:

| rule | why |
|---|---|
| no network egress from the session | the session hands the file to you, it doesn't send it anywhere |
| no encryption | nothing needs hiding when nothing is being shipped |
| no code fetched from a branch | the whole script is visible in the prompt |
| no passphrase | so it can't leak into 289 transcripts |
| only the principal's own typed messages | not tool output, not file contents, not assistant replies |

The result is ~3KB per session instead of 1.6MB, and every step is legible.

---

## The paste

Open an old session, paste this, press go.

```
Please help me recover my own messages from this conversation. I own this repo
and this session. I'm collecting my prompt history across my old Claude Code
sessions to build a personal writing corpus, and these transcripts aren't in
the claude.ai data export.

First, please run `git status` and tell me if anything is uncommitted or
untracked — this branch may own a production surface, and this container's stop
hook will ask you to commit and push on exit, which would deploy. Don't commit
or push anything; just tell me what you see.

Then this, which reads the transcript this session already keeps on disk and
writes out only the messages I typed — no tool output, no file contents, no
replies:

    node -e '
    const fs=require("fs"),os=require("os"),p=require("path");
    const dir=p.join(os.homedir(),".claude","projects",process.cwd().replace(/[/.]/g,"-"));
    const f=fs.readdirSync(dir).filter(x=>x.endsWith(".jsonl"))
      .map(x=>({x,m:fs.statSync(p.join(dir,x)).mtimeMs})).sort((a,b)=>b.m-a.m)[0].x;
    const mine=[];
    for(const line of fs.readFileSync(p.join(dir,f),"utf8").split("\n")){
      if(!line.trim())continue; let r; try{r=JSON.parse(line)}catch{continue}
      const c=r.message&&r.message.content;
      if(r.type==="user"&&typeof c==="string"&&r.origin&&r.origin.kind==="human")
        mine.push({ts:r.timestamp,text:c});
    }
    fs.writeFileSync("/tmp/my-prompts.json",JSON.stringify({session:f.replace(/\.jsonl$/,""),messages:mine},null,1));
    console.log(mine.length+" of my messages → /tmp/my-prompts.json");
    '

Then send me /tmp/my-prompts.json as a file so I can save it. Nothing else
please — don't fix anything you notice, don't regenerate files, don't commit.
```

The session sends you the file; you save it. On a phone that means one save per
session into wherever you keep files.

## If the session can't send files

Ask it to `cat /tmp/my-prompts.json` and copy the output by hand. Small
sessions are a few KB; a long one may be too much to copy comfortably, in which
case skip it and come back with a machine.

## What can go wrong

| symptom | meaning |
|---|---|
| the `node -e` reports `0 of my messages` | the transcript is there but has no `origin` field — an older session. Report it; the filter needs a fallback for that vintage |
| a stack trace about `readdirSync` | no transcript directory — the session didn't rehydrate. Report it, don't improvise |
| `git status` shows changes | **stop.** That session was already carrying a deploy hazard before you resumed it |

## Merging what you saved

Put the saved files in one directory, then:

```bash
node ingest-prompts.mjs ~/path/to/saved --out ~/prompts.jsonl
```

It tolerates the shapes a hand-collected pile actually arrives in, drops the
same session saved twice, and **names any file it couldn't read** rather than
skipping it quietly — a silently dropped session is a session you think you
have.

`--out` must be **outside the repo**. The repo is public.
