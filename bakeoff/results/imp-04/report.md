# Imp bench `imp-04`

The optimizer test the tool tasks could not give: Imp's matched TREC experiment (two opaque codes, meanings only in train feedback) on all three models, GEPA on each with ds4-pro reflecting, Imp's GEPA improper-list crash patched. Imp's own result for comparison: +0.40 held-out on gpt-5.4-mini.

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
| ds4-flash (`deepseek-v4-flash`) | — | — | — | — | — | 6.3% | 93.8% | 1487s |
| ds4-pro (`deepseek-v4-pro`) | — | — | — | — | — | 28.8% | 88.8% | 2736s |
| kimi3 (`kimi-k3`) | — | — | — | — | — | 50% | 93.8% | 3714s |

## ds4-flash

probe: `ok: "Blue"`


**trec** (80 held out, rows from deepfates/imp@49a635d3): baseline 6.3% (64 errors) → GEPA 93.8%, optimizing took 1013s
> baseline error: `%{index: 0, reason: %Imp.AdapterParseError{kind: :missing_fields, message: "The response is missing required output fields: route.", reason: [:route], completion_index: nil, trace: %{messages: [%{role`
> baseline error: `%{index: 1, reason: %Imp.AdapterParseError{kind: :missing_fields, message: "The response is missing required output fields: route.", reason: [:route], completion_index: nil, trace: %{messages: [%{role`
> baseline error: `%{index: 2, reason: %Imp.AdapterParseError{kind: :missing_fields, message: "The response is missing required output fields: route.", reason: [:route], completion_index: nil, trace: %{messages: [%{role`

GEPA (reflection `ds4-pro`, max_metric_calls 200): rewrote 1 parameter(s).

<details><summary>"predictor/main/instruction"</summary>

**before**

```
Route the question to exactly one opaque code. Return only the required structured route.
```

**after**

```
Classify the input question into exactly one opaque route code.

Input format:
### text
<question>

Output format:
### route
<opaque code>

Rules:
- Return only the structured route shown above. Do not answer the question, explain the classification, or add any extra text.
- Choose the route code based on the type of information requested by the question.

Known route code mapping:
- K11: Use for questions that ask for a description, definition, reason, cause, explanation, or manner.
- K47: Use for questions that ask for an entity or thing, such as an animal, product, substance, person, group, object, or other named entity. This includes questions of the form “What are X and Y known as ?” when the expected answer is a name or entity, not a description or explanation.

Disambiguation strategy:
- If the expected answer is a definition, explanation, cause, reason, or manner, classify as K11.
- If the expected answer is a name, entity, object, animal, product, substance, person, or group, classify as K47.
- Do not classify an entity-seeking question as K11 even if it begins with “What is” or “What are”.

Examples:
Input:
### text
What is the secret of the universe ?

Output:
### route
K11

Input:
### text
What caused the division between the Anglicans and the Vatican ?

Output:
### route
K11

Input:
### text
What are John C. Calhoun and Henry Clay known as ?

Output:
### route
K47
```

</details>

## ds4-pro

probe: `ok: "blue"`


**trec** (80 held out, rows from deepfates/imp@49a635d3): baseline 28.8% (31 errors) → GEPA 88.8% (2 errors), optimizing took 1982s
> baseline error: `%{index: 0, reason: %Imp.AdapterParseError{kind: :missing_fields, message: "The response is missing required output fields: route.", reason: [:route], completion_index: nil, trace: %{messages: [%{role`
> baseline error: `%{index: 1, reason: %Imp.AdapterParseError{kind: :missing_fields, message: "The response is missing required output fields: route.", reason: [:route], completion_index: nil, trace: %{messages: [%{role`
> baseline error: `%{index: 2, reason: %Imp.AdapterParseError{kind: :missing_fields, message: "The response is missing required output fields: route.", reason: [:route], completion_index: nil, trace: %{messages: [%{role`

GEPA (reflection `ds4-pro`, max_metric_calls 200): rewrote 1 parameter(s).

<details><summary>"predictor/main/instruction"</summary>

**before**

```
Route the question to exactly one opaque code. Return only the required structured route.
```

**after**

```
You are a router that assigns an input question to exactly one opaque code.

Input format:
- The input contains a field named `text` with a user question.

Output format:
- Return only the opaque route code.
- Do not include explanations, extra text, labels, JSON, or formatting.

Known routing rule:
- Use code `K11` when the question asks for a description, definition, reason, or manner.
  Examples include:
  - questions asking how to do something
  - questions asking why something happens
  - questions asking what something means

For any question matching that rule, output exactly:

K11
```

</details>

## kimi3

probe: `ok: "Blue"`


**trec** (80 held out, rows from deepfates/imp@49a635d3): baseline 50% (7 errors) → GEPA 93.8% (4 errors), optimizing took 3136s
> baseline error: `%{index: 62, reason: {:evaluation_task_exit, :timeout}}`
> baseline error: `%{index: 64, reason: {:evaluation_task_exit, :timeout}}`
> baseline error: `%{index: 69, reason: {:evaluation_task_exit, :timeout}}`

GEPA (reflection `ds4-pro`, max_metric_calls 200): rewrote 1 parameter(s).

<details><summary>"predictor/main/instruction"</summary>

**before**

```
Route the question to exactly one opaque code. Return only the required structured route.
```

**after**

```
You are a question router. Given a natural language question in the `text` field, classify it into exactly one of two route categories.

Route definitions:

- K11: The question asks for a description, definition, reason, or manner. Use this when the expected answer is an explanation, meaning, cause, method, or description.
- K47: The question asks for an entity such as an animal, product, substance, or other concrete or identifiable thing. Use this when the expected answer is a specific object, being, item, or entity.

Strategy:

- Do not rely only on the question starting with “What”.
- Determine whether the answer is an entity/thing or a description/explanation.
- Questions like “What is osmosis ?” or “What is the secret of the universe ?” ask for a definition, description, or explanation, so they should be K11.
- Questions like “What was George Washington afraid of ?” ask for a specific entity or thing, so they should be K47.

Output only the route identifier: `K11` or `K47`.

Examples:

Input:
text: What is osmosis ?
Output:
route: K11

Input:
text: What is the secret of the universe ?
Output:
route: K11

Input:
text: What was George Washington afraid of ?
Output:
route: K47
```

</details>
