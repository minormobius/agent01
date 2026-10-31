/* pf_score.h - one performance format for every pfsynth instrument (see API.md).
 *
 * Portable C, no allocation: the arrays belong to the host and must stay valid while an
 * instrument uses them. A performance is notes (start + end, so techniques and ringing
 * can see both ends of a note), controls (pedals) and optional pitch curves. An
 * instrument reads what it understands and ignores the rest. */
#ifndef PF_SCORE_H
#define PF_SCORE_H

enum {                    /* pf_note.articulation */
    PF_ART_NORMAL=0,      /* struck / plucked */
    PF_ART_HAMMER_ON=1,   /* left-hand slur up: no pluck; art_param = finger clearance (m), 0 = default */
    PF_ART_PULL_OFF=2,    /* left-hand slur down: no pluck; art_param = pull distance (m), 0 = default */
    PF_ART_SLIDE=3,       /* arrived by sliding from the previous note on the string: no pluck */
    PF_ART_HARMONIC=4,    /* natural harmonic; art_param = touched fret (12, 7, 5, 4); pitch = sounding pitch */
    PF_ART_MUTED=5,       /* palm-muted */
    PF_ART_TIE=6          /* continues the previous note on the string: no new attack */
};

/* 48 bytes, laid out for writing from JavaScript (offsets in API.md). */
typedef struct {
    double start, end;       /* seconds. `end` = when the player stops the sound (key up, string
                                damped); an instrument may ring past it only through its own
                                physics (pedals) or an explicit option (guitar "let ring") */
    float  pitch;            /* MIDI note number; fractions are cents (60.5 = C4 + 50 cents) */
    float  velocity;         /* MIDI scale, 1..127 nominal; > 127 where the model has headroom */
    float  art_param;        /* see PF_ART_* */
    float  slide_to;         /* > 0: the note slides fret by fret to this pitch over its last 28% */
    int    bend_first, bend_count;   /* this note's points in pf_score.bends */
    signed char string, fret, finger;/* -1 = not given (the instrument chooses) */
    unsigned char articulation;      /* PF_ART_* */
    int    reserved;
} pf_note;

enum { PF_CTL_SUSTAIN=0, PF_CTL_SOSTENUTO=1, PF_CTL_SOFT=2 };   /* pf_control.kind */
typedef struct { double t; float value; int kind; } pf_control;  /* value 0..1 */

typedef struct { double t; float semitones; int reserved; } pf_bend_point; /* t: seconds after the note's start */

typedef struct {
    const pf_note *notes; int n_notes;            /* sorted by start */
    const pf_control *controls; int n_controls;   /* sorted by t */
    const pf_bend_point *bends; int n_bends;
    const signed char *tuning; int n_strings;     /* open strings as MIDI notes, string 1 first; NULL = instrument default */
    double duration;                              /* seconds, including any ring-out */
} pf_score;

#endif
