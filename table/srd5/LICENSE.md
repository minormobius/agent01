# Licence — SRD 5.2.1

Everything in `table/srd5/` that reproduces or adapts rules text comes from the
**System Reference Document 5.2.1**, used under **CC BY 4.0**.

## The attribution statement, verbatim

The licence requires this exact statement to appear in any work that uses the
material. It appears in the footer of every page this directory serves, and it
must not be paraphrased, shortened or reworded:

> This work includes material from the System Reference Document 5.2.1 (“SRD
> 5.2.1”) by Wizards of the Coast LLC, available at
> https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative
> Commons Attribution 4.0 International License, available at
> https://creativecommons.org/licenses/by/4.0/legalcode.

## Three rules that bind this directory

1. **No other attribution.** The SRD's own legal page says: *"Please do not
   include any other attribution to Wizards or its parent or affiliates other
   than that provided above."* So the statement above is the whole of it — no
   "thanks to", no logo, no second credit line, nowhere.

2. **No trademarks.** CC BY 4.0 licenses copyright, **not** trademark
   (§2(b)(2) says so explicitly). The game's name, its logo and its product
   branding are not ours to use, which is why this surface is called `srd5`
   and its pages say *SRD 5.2.1* throughout. The one claim the SRD does
   expressly permit is that a work is **"compatible with fifth edition"** or
   **"5E compatible"** — those two phrasings, and nothing more.

3. **Our arithmetic is labelled as ours.** Same rule as `table/cairn/`. The
   simulator, any metric we invent, and any judgement about whether the
   official encounter maths holds up are this site's work, not the SRD's, and
   the pages say so. Grading someone's published numbers is only fair if it is
   obvious whose numbers are whose.

## What CC BY 4.0 gives us that CC BY-SA would not

Cairn is CC BY-SA: adaptations must be shared alike. The SRD is plain CC BY —
attribution only, no share-alike obligation on our code. The two systems on
this surface therefore carry **different** obligations, and the footers differ
accordingly. Do not copy Cairn's footer here or this one there.

## Provenance

The data in this directory is generated from the official PDF:

- `SRD_CC_v5.2.1.pdf`, published 1 May 2025, 364 pages
- fetched from <https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf>
- linked from <https://www.dndbeyond.com/srd>

`tools/scrape-srd.py` turns that file into the `.js` data modules. Re-run it
rather than hand-editing them; and if a later revision (5.2.2, …) is published,
re-run it against that file and re-run the selftests, which is the only way a
silent change in the source becomes visible.
