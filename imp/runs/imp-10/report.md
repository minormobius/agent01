# Imp bench `imp-10`

trec and era again with an 8,192-token reply budget. Hypothesis under test: the DeepSeek 'parse errors' (trec baseline 64/80 and 31/80 in imp-04; era 95/120 in imp-06) are not format failures but replies whose whole 2,048-token budget went to hidden reasoning, leaving no answer — the failure mega/jev recorded for Kimi. If errors collapse here, the imp-04 and imp-06 baselines were measuring the budget, not the models.

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
| ds4-flash (`deepseek-v4-flash`) | — | — | — | — | — | 46.3% | 95% | 5683s |
| ds4-pro (`deepseek-v4-pro`) | — | — | — | — | — | 28.8% | 100% | 5993s |

## ds4-flash

probe: `ok: "Blue"`


**trec** (80 held out, rows from deepfates/imp@49a635d3): baseline 46.3% (9 errors) → GEPA 95%, optimizing took 695s
> baseline error: `%{index: 10, reason: %Imp.AdapterParseError{kind: :missing_fields, message: "The response is missing required output fields: route.", reason: [:route], completion_index: nil, trace: %{messages: [%{rol`
> baseline error: `%{index: 15, reason: %Imp.AdapterParseError{kind: :missing_fields, message: "The response is missing required output fields: route.", reason: [:route], completion_index: nil, trace: %{messages: [%{rol`
> baseline error: `%{index: 25, reason: %Imp.AdapterParseError{kind: :missing_fields, message: "The response is missing required output fields: route.", reason: [:route], completion_index: nil, trace: %{messages: [%{rol`

GEPA (reflection `ds4-pro`, max_metric_calls 200): rewrote 1 parameter(s).

<details><summary>"predictor/main/instruction"</summary>

**before**

```
Route the question to exactly one opaque code. Return only the required structured route.
```

**after**

```
You are given a natural language question as plain text.

Route the question to exactly one opaque code indicating the type of information the question is asking for. Return only the required structured route in this format:

### route
<CODE>

Routing rules:
- Use route `K11` if the question asks for a description, definition, reason, or manner.
  - Example: "What is a drought ?" -> `K11`
- Use route `K47` if the question asks for an entity, such as an animal, product, substance, or other thing.
  - Example: "What D.H. Lawrence novel was originally titled Tenderness ?" -> `K47`

Important:
- Do not answer the question.
- Do not add explanations or extra text.
- Do not assign `K11` to an entity-seeking question even when it begins with "What".
```

</details>

**era** — 120 held-out posts by minormobius.bsky.social, four years (chance 25%):

| arm | exact | within one year | errors |
|---|---|---|---|
| baseline | 23.3% | 64.2% | 11 |
| few_shot_k16 | 29.2% | 53.3% | 1 |
| gepa | 15.8% | 30% | 59 |

GEPA (reflection `ds4-pro`, max_metric_calls 200): rewrote 1 parameter(s).

<details><summary>"predictor/main/instruction"</summary>

```
You are an expert at dating Bluesky posts from text alone.

Input: a single post from Bluesky, provided as plain text with no timestamp.
Task: predict the calendar year the post was written.

Output: four-digit year only (e.g., 2023).

Background:
Bluesky (bsky.app) was invite-only during most of 2023. Its early user base was heavily tech/community-focused, and posts often discussed platform mechanics, invite codes, "skeets," missing features, and comparisons to Twitter. The app opened to the public in February 2024, leading to more mainstream topics, media, and celebrities. In mid-to-late 2024, features such as direct messages, starter packs, and video were added, and events like the August 2024 Brazil ban on X drove waves of new users. In 2025, Bluesky grew further, especially after the January 2025 U.S. TikTok shutdown/outage, with an even more mainstream user base and newer discussions about algorithmic reach and platform culture.

Dating clues:
- 2023 markers: invite codes, "finally got in," "skeet(s)," early-platform meta-discussion, missing basic features, small-community tone, tech-heavy references.
- 2024 markers: starter packs, direct messages, video, large news/media presence, election aftermath, Brazil/X ban mentions, poll-style posts using third-party poll tools (e.g., "📊 Show results").
- 2025 markers: TikTok refugee mentions, algorithmic "bump" or reach strategy discussions, platform maturity, modern mainstream slang, and features or cultural references that postdate the early-beta era.
- Use current events, slang, named features, and the cultural maturity of the post to decide.

Important calibration pitfalls:
- A question about how Bluesky works is not automatically from 2023. For example, "Should I reply to posts or quote them? ... bump on bsky rn?" was from 2025.
- A poll-style post with "Show results" can be from 2024; do not assume native polls or an early date.
- A mundane personal post with typos or odd phrasing may still be from 2023; do not automatically place it later.
- When no single strong clue exists, prefer the year that best matches the overall platform era and language style.

If forced to choose, give the single most likely year and return it as a four-digit integer.
```

</details>

## ds4-pro

probe: `ok: "blue"`


**trec** (80 held out, rows from deepfates/imp@49a635d3): baseline 28.8% (26 errors) → GEPA 100%, optimizing took 1320s
> baseline error: `%{index: 7, reason: {:evaluation_task_exit, :timeout}}`
> baseline error: `%{index: 8, reason: {:evaluation_task_exit, :timeout}}`
> baseline error: `%{index: 15, reason: {:evaluation_task_exit, :timeout}}`

GEPA (reflection `ds4-pro`, max_metric_calls 200): rewrote 1 parameter(s).

<details><summary>"predictor/main/instruction"</summary>

**before**

```
Route the question to exactly one opaque code. Return only the required structured route.
```

**after**

```
You are a routing classifier. You will receive a natural-language question as input, typically in a field called `text`. Route the question to exactly one opaque route code based on the type of answer required. Return only the route code.

Known route codes:
- K11: Use when the question asks for a description, definition, reason, explanation, comparison, origin, or manner.
- K47: Use when the question asks for a specific entity or set of entities/things, such as an animal, product, substance, named object/title, method, technique, or other particular thing.

Classification guidance:
- Determine the expected answer type, not just the surface wording of the question.
- If the expected answer is an explanation, description, definition, reason, comparison, origin, or account of how something happens, use K11.
- If the expected answer is a specific named entity or a list/set of specific things, use K47.
- "What is X?" may be K11 if it asks for a definition/description, e.g., "What is a drought?"
- "What is X?" may be K47 if it asks for a specific named entity/thing, e.g., "What D.H. Lawrence novel was originally titled Tenderness?"
- "Why ..." and "How come ..." questions are usually K11.
- "How ..." questions are usually K11 if they ask for a manner/process/explanation, but K47 if they ask for a specific entity/thing.
- Questions that ask for a particular named thing from a category are usually K47.
- Questions asking for particular methods, techniques, types, or other specific things/entities are K47, not K11. For example, "What are common methods used to regulate monopolies ?" -> K47.
- Questions asking for differences or origins are K11. For example, "What is the difference between terry cloth and French terry ?" -> K11, and "What is the origin of U.S. Army sergeant 's stripes ?" -> K11.

Examples:
- "How do I increase my biceps ' size ?" -> K11, because it asks for a manner/process/explanation, not a specific entity.
- "What do flatfish eat ?" -> K47, because it asks for specific food entities.
- "What future movie treat was introduced to American colonists in 1603 by Native Americans ?" -> K47, because it asks for a specific named thing.

Output only the route code, with no extra text or explanation.
```

</details>

**era** — 120 held-out posts by minormobius.bsky.social, four years (chance 25%):

| arm | exact | within one year | errors |
|---|---|---|---|
| baseline | 10.8% | 35.8% | 62 |
| few_shot_k16 | 0% | 0% | 120 |
| gepa | 0% | 0% | 120 |

GEPA (reflection `ds4-pro`, max_metric_calls 200): kept the original program.
