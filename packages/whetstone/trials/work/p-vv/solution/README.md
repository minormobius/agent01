# vv (reference)

The lab's reference implementation of SPEC.md, used only by the checker to know the right answers.
It loads and lints requirements, traces them to the checks that verify them, works out each
requirement's verification status from evidence (latest result per check, rolled up from shall
children to parents), watches technical performance measures with margins, trends and projected
breach dates, and computes earned value in which only verified requirements earn anything, with
earned schedule interpolated on the planned-value curve. Its own requirements are in
requirements.json, traced in links.json to the checks in test.mjs, which writes evidence.json, so
`node cli.mjs .` reports the tool's own coverage. A project would keep the same six files.
