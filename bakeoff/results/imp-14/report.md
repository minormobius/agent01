# Imp bench `imp-14`

Claude Sonnet through the Claude Code CLI on the build-a-bot subscription credential: trec zero-shot, then GEPA with Sonnet reflecting on its own failures. Re-run of imp-13, which lost every call to --bare (bare mode never reads the OAuth token); the adapter now runs from an empty temp dir instead, and a failed probe fails the cell.

Every number is a share of held-out questions answered right. `route`: 20 tickets, four teams,
zero-shot vs. 8 labelled examples (Imp `LabeledFewShot`). `desk`: 16 questions a ReAct agent can only
answer through six Elixir tools; the answer key is computed from the same data the tools read.

`desk_hard`: 18 held-out questions on a harder desk (policy versions by order date, windows from delivery,
restocking fees, undelivered orders, scans across customers, five currencies). `+GEPA`: the same agent after
GEPA rewrote its instructions from 9 train / 9 validation questions.

`trec`: Imp's matched GEPA experiment — route 80 held-out TREC questions to two opaque codes the program
is never told the meaning of; GEPA learns them from feedback on 20 train rows (Imp R3: +0.40 on gpt-5.4-mini).

| model | route zero-shot | route few-shot (k=8) | desk | desk_hard | desk_hard +GEPA | trec | trec +GEPA | wall |
|---|---|---|---|---|---|---|---|---|
| sonnet (`claude-sonnet-5`) | — | — | — | — | — | 47.5% | 96.3% | 325s |

## sonnet

probe: `ok: "Blue"`


**trec** (80 held out, rows from deepfates/imp@49a635d3): baseline 47.5% → GEPA 96.3%, optimizing took 265s

GEPA (reflection `sonnet`, max_metric_calls 150): rewrote 1 parameter(s).

<details><summary>"predictor/main/instruction"</summary>

**before**

```
Route the question to exactly one opaque code. Return only the required structured route.
```

**after**

```
You are performing question routing for a TREC-style question-classification task.

Input: a single question under a field called "text".
Output: exactly one opaque route code (a short alphanumeric label like "K11" or "K47") — nothing else. No explanation, no punctuation, no extra fields, no restating the question.

The route codes are opaque labels that map onto the standard TREC/UIUC coarse question-type taxonomy (ABBREVIATION, DESCRIPTION, ENTITY, HUMAN, LOCATION, NUMERIC). Two mappings have been confirmed through feedback so far — treat these as ground truth and prioritize them whenever a question fits:

- K11 = DESCRIPTION class: the question wants a definition, an explanation of a reason/cause/origin, a comparison or explanation of a difference between two things, a general description, or the manner in which something happens/works.
  Examples:
  - "What is a drought?" (definition) → K11
  - "How come light bulbs go out?" (reason/cause) → K11
  - "What is the difference between terry cloth and French terry?" (comparison/description) → K11
  - "What is the origin of U.S. Army sergeant's stripes?" (origin/explanation) → K11
  - "What is Doegs?" (asking what an unfamiliar/opaque term means or refers to — a definition, even though the term looks like it could name a concrete thing) → K11
  - "What caused the division between the Anglicans and the Vatican?" (asks for a cause/reason) → K11

- K47 = ENTITY class: the question wants the name/identity of one or more specific "things" rather than an explanation. This includes obvious concrete entities (an animal, product, substance, creative work like a book/film/song) but ALSO the more abstract TREC entity subtypes: techniques or methods, events, foods, instruments, languages, plants, sports, symbols, colors, currencies, diseases/medicine, vehicles, religions, body parts, words/terms, or other named "things." A question asking "what [methods/techniques/ways] are used to do X?" is ENTITY (it wants a named list of methods), NOT DESCRIPTION — even though it superficially resembles a "manner" question.
  Examples:
  - "What D.H. Lawrence novel was originally titled Tenderness?" (wants the name of a novel) → K47
  - "What are common methods used to regulate monopolies?" (wants named techniques/methods, an ENTITY subtype) → K47
  - "What color of Monopoly properties are landed on most often?" (wants the name of a specific color, an ENTITY subtype) → K47

Critical disambiguation rule: many questions of both types start with the word "What," so never classify by surface wording alone — classify by intent:
- Plain "What is X?" (and "What is a/an X?") where X is a single unfamiliar term, word, or concept being asked to be defined or explained — even if X sounds like it could name a concrete object — defaults to K11 (a definition), UNLESS the question is explicitly structured to pick out a specific instance from a category (see below).
- "What is the difference between X and Y?", "What is the origin/reason/cause for X?" → asks for an explanation, definition, comparison, or cause → K11.
- "What [category noun] ...?" where the question is structured to pick out one or more named/identifiable things belonging to that category as the answer (an object, work, animal, substance, technique, method, event, color, etc. — e.g. "What novel...", "What color...", "What methods...") → K47.
- If you're unsure whether an answer would be a short explanatory statement (K11) or a discrete named item/list of items (K47), lean toward K47 only when the question's grammar is asking to pick out "the name(s) of ___" from an implied category — not merely "what is ___" applied to a single unfamiliar term.

If a question clearly asks for something outside these two categories — a person's identity, a place, a number/quantity, or the expansion of an abbreviation — it corresponds to one of the other TREC coarse classes (HUMAN, LOCATION, NUMERIC, ABBREVIATION respectively). No opaque code has been confirmed for these yet, so use your best judgment about which route code fits based on this same "opaque code ↔ TREC coarse class" pattern (e.g., codes near K11/K47 alphabetically or numerically may correspond to related classes), but always check K11 and K47 first and only fall back to a guessed code for the other four classes when the question clearly does not fit DESCRIPTION or ENTITY.

Return only the single opaque route code as the final answer.
```

</details>
