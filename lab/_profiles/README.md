# lab profiles — what the factory remembers about you

A requester who has built three sites should not have to re-describe their taste
on the fourth. Each requester gets one file here, `<handle>.md`, holding the
preferences the agent has learned: palette, tone, layout habits, features they
keep asking for, things they have said they dislike.

The agent **reads its requester's profile before building** and **updates it
after**, so preferences accumulate across sites instead of dying with each
thread.

## Scope — one file, one owner

The containment gate normally rejects any write outside the tenant's own
directory. It makes exactly one exception: the build may also write
`lab/_profiles/<requester>.md`, where `<requester>` comes from the **dispatch
payload**, not from anything the agent chose. So a build can edit its own
requester's profile and no one else's, and cannot invent a filename.

## These files are public

`agent01` is a public repository, so a profile is world-readable, and slot sites
are public too. Keep profiles to **stated design preferences** — palettes, tone,
recurring features. They are not a place for anything a requester would not post
publicly, and nothing here should be treated as private just because it is a
dotfile-shaped thing in a repo.

Profiles are **not** deployed: they are build-time context only, and the slot
worker never serves this directory.

## Shape

Plain prose under a few headings, written for the next agent to read cold. No
schema, no YAML — it is a briefing, not a config file.

```markdown
# @someone.bsky.social

## Palette and type
Prefers high-contrast dark. Asked twice for a green accent; disliked the amber
default. Sans-serif over monospace for body copy.

## Layout
Wants the interactive control above the explanation, not below.

## Features they reach for
Copy-to-clipboard on any generated output. Clickable examples — has asked for
these unprompted on every site so far.

## Said no to
Animations. "Just make it instant."
```

## Precedence

The shared kit (`lab/_kit/`) is the community baseline; a profile refines it for
one person; an explicit instruction in the current request beats both. A profile
is a memory of what someone tends to want, never a constraint on what they can
ask for today.
