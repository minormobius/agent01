/* pf_guitar.h - the classical guitar as a pf_instrument (six pf_pluck strings).
 *
 * Portable C, no allocation (the host provides sizeof(pf_guitar) bytes). Renders the
 * strings' bridge force; the body and room responses are applied by the host (the web
 * page uses WebAudio convolution with the measured bodies), as in the listening room.
 *
 * Behaviour matches the offline renderer (tools/string_gesture_audition.py,
 * render_guitar: material strings, no bridge loading) sample for sample on the same
 * notes (tools/test_instrument_api.py). Additions for scores that do not come from our
 * tools: strings/frets are chosen when not given (a Viterbi search over hand positions),
 * and "let strings ring" extends notes to when a hand would stop them
 * (tools/guitar_sustain.py). */
#ifndef PF_GUITAR_H
#define PF_GUITAR_H
#include "pf_instrument.h"
#include "../core/pf_pluck.h"

#define PF_GUITAR_MAX_NOTES 16384
#define PF_GUITAR_BLOCK 128          /* control rate: pitch and gestures update per block */

enum {                               /* parameter indices (pf_guitar_params) */
    PF_GUITAR_GAIN_DB, PF_GUITAR_TREBLES, PF_GUITAR_PLUCK, PF_GUITAR_HAND_FIXED, PF_GUITAR_RING,
    PF_GUITAR_HEADROOM, PF_GUITAR_SLUR_CONTACT, PF_GUITAR_HAMMER_MM, PF_GUITAR_PULL_MM,
    PF_GUITAR_HARM_WIDTH, PF_GUITAR_HARM_RHO, PF_GUITAR_HARM_TIME, PF_GUITAR_HARM_OFFSET,
    PF_GUITAR_HARM_PLUCK, PF_GUITAR_MUTE_DAMP, PF_GUITAR_NPARAM
};

typedef struct { long frame; int kind, note; } pf_guitar_event;  /* kind 0 off, 1 on, 2 lift */

typedef struct {
    double sr, p[PF_GUITAR_NPARAM];
    const pf_score *score; int n;
    signed char tuning[6];
    signed char string[PF_GUITAR_MAX_NOTES], fret[PF_GUITAR_MAX_NOTES];
    double end[PF_GUITAR_MAX_NOTES];                 /* after "let strings ring" */
    pf_guitar_event ev[3*PF_GUITAR_MAX_NOTES]; int nev, cursor;
    long pos, total;
    pf_pluck str[6]; int owner[6], order[6], n_order;  /* order: strings in first-use order */
    float mono[PF_GUITAR_BLOCK];
} pf_guitar;

#endif
