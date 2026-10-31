# Readings beyond SPEC.md's text

Each one is a guess the spec doesn't settle. If a hidden test fails, look here first.

1. **CSV**: cells are trimmed. A UTF-8 BOM is stripped. Header names are matched case-insensitively. Double-quoted fields with `""` escapes are accepted. Extra columns are ignored. A missing required column throws. A short row gives `''` for the cells it lacks. Lone `\r` is also a line break.
2. **Dates before `start`**: `weekOf` floors them, giving week 0, −1, … No error is thrown. `weekly`/`mutes` include those weeks as they come.
3. **`weekly` keys** are strings (JSON object keys), in numeric week order. Handles are in code-unit order. Sorting is everywhere plain `<` on strings, not `localeCompare`.
4. **Self-reports** (reporter = reported) count like any other report. None in the sample.
5. **M4 `minReports`** counts report rows, repeats included, not distinct targets. **`joinedWithinDays`** is inclusive: |Δ| ≤ days. **`minOverlap`** is inclusive and tested as `inter/union >= minOverlap`. A reporter with no residents row has no join date and is never linked.
6. **M5 eligibility** doesn't look at `kind`: agents can judge. The spec says "resident", and agents are residents in residents.csv. *This is the guess I trust least.* With the sample, the week-6 brassmoth appeal goes to `mote`, an agent.
7. **M5**: `reporters` defaults to `[]`. Duplicate residents rows are harmless: same hash, same handle.
8. **M6 `weeks`** = 0 when there are no reports. Its `rings` use the default options. `judges[i].judge` can be `null`.
9. **Ring members still count toward mutes.** The spec doesn't say to discount them, so we don't.
