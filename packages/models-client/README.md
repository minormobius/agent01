# models — other models, through the lab's proxy

Another model to think with: a fast cheap pass, a second opinion, a summary of a long feed. The
lab holds the keys; you hold none. Each run has a budget of calls, shared by everyone in it, and
every call is logged with who made it.

```
node engines/models/ask.mjs --list                          # what this run lends, and calls left
node engines/models/ask.mjs deepseek-v4-flash "question"    # the answer, on stdout
cat feed.txt | node engines/models/ask.mjs claude-sonnet-5 - --system "Summarise for…"
node engines/models/ask.mjs kimi-k3 "…" --json              # { model, text, tokens, left }
```

From node: `import { ask } from './engines/models/ask.mjs'; const { text } = await ask(model, prompt, { system })`.

What another model writes is its text, not yours and not a fact: treat it as a draft or a
reading, the way you would treat a stranger's. Which jobs a model is fit for is measured in the
lab's soul × model grid (packages/whetstone/runs/*grid*).
