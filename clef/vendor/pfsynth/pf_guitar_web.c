/* pf_guitar_web.c — the WebAssembly host for pfsynth's classical guitar. OURS, not pfsynth's.
 *
 * host/ and core/pf_pluck.* are John O'Laughlin's (MIT), vendored unmodified. This file only
 * owns memory and hands the guitar a score, the way upstream's pfiwasm.c does for its demo, cut
 * down to the one instrument clef plays: no piano adapter, no MIDI parser, no allocator.
 *
 * The guitar renders the strings' BRIDGE FORCE, mono, and nothing else. The body (a measured
 * guitar's response) and the room are applied by the page, by convolution, as upstream's
 * demo does: see src/pfguitar.js.
 *
 * Protocol (all memory static, so the page writes straight into it):
 *   pgw_notes_ptr()      where to write the notes: pf_note, 48 bytes each (layout in host/pf_score.h)
 *   pgw_max_notes()      how many fit
 *   pgw_set(i, v)        a parameter (host/pf_guitar.h enum), before pgw_begin
 *   pgw_begin(sr, n, duration)   load the score; 0 = ok. Strings and frets are chosen by the
 *                        guitar itself (a search over hand positions) when the notes leave them -1
 *   pgw_render(frames)   up to pgw_block() frames into pgw_out_ptr(); returns frames written,
 *                        0 once `duration` is reached
 */
#include "host/pf_guitar.h"

#define MAX_NOTES PF_GUITAR_MAX_NOTES
#define BLOCK 2048

static pf_guitar G;
static pf_note NOTES[MAX_NOTES];
static pf_score SCORE;
static float OUT[BLOCK];
static double PARAM[PF_GUITAR_NPARAM];
static int PARAM_SET[PF_GUITAR_NPARAM];
static long REMAINING;

__attribute__((export_name("pgw_notes_ptr"))) pf_note *pgw_notes_ptr(void) { return NOTES; }
__attribute__((export_name("pgw_max_notes"))) int pgw_max_notes(void) { return MAX_NOTES; }
__attribute__((export_name("pgw_out_ptr"))) float *pgw_out_ptr(void) { return OUT; }
__attribute__((export_name("pgw_block"))) int pgw_block(void) { return BLOCK; }
__attribute__((export_name("pgw_note_bytes"))) int pgw_note_bytes(void) { return (int)sizeof(pf_note); }

__attribute__((export_name("pgw_set")))
void pgw_set(int i, double v)
{
    if (i < 0 || i >= PF_GUITAR_NPARAM) return;
    PARAM[i] = v; PARAM_SET[i] = 1;
}

__attribute__((export_name("pgw_begin")))
int pgw_begin(double sample_rate, int n, double duration)
{
    const pf_instrument *in = &pf_instrument_guitar;
    if (n < 0 || n > MAX_NOTES) return 1;
    in->init(&G, sample_rate);
    for (int i = 0; i < PF_GUITAR_NPARAM; i++) if (PARAM_SET[i]) in->set(&G, i, PARAM[i]);
    SCORE = (pf_score){ .notes = NOTES, .n_notes = n, .duration = duration };
    REMAINING = (long)(duration * sample_rate + 0.5);
    return in->load(&G, &SCORE);
}

__attribute__((export_name("pgw_render")))
int pgw_render(int frames)
{
    if (frames > BLOCK) frames = BLOCK;
    if (frames > REMAINING) frames = (int)REMAINING;
    if (frames <= 0) return 0;
    pf_instrument_guitar.render(&G, OUT, 0, frames);
    REMAINING -= frames;
    return frames;
}
