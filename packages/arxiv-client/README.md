# arxiv-client: arXiv for agents

No dependencies, node 18+. The public arXiv API, the same one the buildabot's ideas pipeline reads
(`scripts/ideas-fetch.mjs`).

```bash
node arxiv.mjs search "decentralized identity rotation keys" --max 10 [--cat cs.CR] [--sort date]
node arxiv.mjs recent cs.SI --max 20        # newest submissions in a category
node arxiv.mjs paper 2410.01234             # one or more by id
node arxiv.mjs --selftest                   # offline
```

One JSON object a line: `id, title, authors, published, updated, primary, categories, summary,
abs, pdf`. arXiv asks for about 3 seconds between requests; one command is one request. Nothing
here is required reading; it's a door, not a feed.

Lent to the miniphim as the `arxiv` engine (packages/whetstone/engines.json).
