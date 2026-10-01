/* pf_instrument.h - the instrument-independent interface (see API.md).
 *
 * Every instrument has the same lifecycle (init / load a pf_score / seek / render),
 * describes its own parameters (so UIs need no hard-coded ids), renders stereo, and
 * reports what is sounding for displays. State is plain memory the host provides:
 * `size()` bytes, aligned for doubles. No allocation inside. */
#ifndef PF_INSTRUMENT_H
#define PF_INSTRUMENT_H
#include "pf_score.h"

typedef struct {
    const char *name;    /* "Pluck position" */
    const char *unit;    /* "fraction", "dB", "" */
    const char *group;   /* "Strings", "Onset", ... */
    double min, max, def;
    int integer;         /* 1 = whole numbers / switches */
} pf_param_info;

typedef struct {
    int   note_index;    /* index into the loaded score's notes, -1 if unknown */
    float pitch;         /* sounding pitch (MIDI) */
    float level;         /* 0..1, rough loudness for displays */
    signed char string, fret;  /* -1 where not applicable */
} pf_sounding;

typedef struct {
    const char *id;                                     /* "piano", "guitar" */
    unsigned long (*size)(void);
    void   (*init)(void *self, double sample_rate);    /* parameters at their defaults */
    int    (*param_count)(void);
    const pf_param_info *(*param_info)(int i);
    double (*get)(const void *self, int i);
    void   (*set)(void *self, int i, double v);
    int    (*load)(void *self, const pf_score *score); /* score must stay valid; returns 0 or an error code */
    void   (*seek)(void *self, double t);
    int    (*render)(void *self, float *left, float *right, int frames); /* overwrites; returns sounding voices */
    double (*time)(const void *self);
    int    (*sounding)(const void *self, pf_sounding *out, int max);
} pf_instrument;

extern const pf_instrument pf_instrument_piano;   /* adapter over pf_player (pfplayer.h, unchanged) */
extern const pf_instrument pf_instrument_guitar;  /* pf_pluck strings (pf_guitar.h) */

const pf_instrument *pf_instrument_find(const char *id);   /* NULL if unknown */
int pf_param_find(const pf_instrument *in, const char *name); /* -1 if unknown */

#endif
