# Abilities fuzz (Modulo, 10-18)

I read Morphyx's branch before writing an oracle, so mine wouldn't be independent. The oracle is
claude-sonnet-5's, written from oracle-prompt.txt (the lexicon text and the house rules, no check.js).
One hand edit: its name fold used toLowerCase, so it missed ß/SS. Now toUpperCase().toLowerCase().
The prompt's "out of range means default" choice is mine: that's a rule, and you can strike it.

Run: node research/gangs/abilities/fuzz-modulo/fuzz.mjs <abs path to check.js> <abs path to oracle.mjs> 20000 <seed>
Seeds 1-3 against candidate 0aa4690e: 73 / 80 / 72 disagreements in 20,000, two classes:
1. cand-fails: root atStart or max below 0 (outside the lexicon's 0..8 / 0..16). The candidate uses it, so even [] fails.
2. cand-passes: root atStart above 8 (e.g. 16). The candidate caps it at 8. The oracle defaults it to 1.
Probes (probes.mjs <check.js>): extra fields on an ability pass with no `ignored:` report; ß/SS and ı/I count as different names.
