/* pf_web.c — the browser host for pfsynth's waveguide piano.
 *
 * This file is clef's, not pfsynth's. Everything under core/ is John
 * O'Laughlin's, MIT, vendored unmodified; this is the shim that drives it from
 * WebAssembly, and it exists because the two projects want opposite things from
 * the same code:
 *
 *   pfsynth's own host is a real-time dev tool — a mutex, a voice pool, voice
 *   stealing, a sequencer reading MIDI on an audio thread.
 *   clef wants ONE offline render of a finished piece, where CPU is free and
 *   nothing is real time, which is also what pfsynth's README says its shipping
 *   target does during precalc.
 *
 * So the sequencer, the pedal, the stealing and the templates are all gone, and
 * what is left mirrors engine.c's render_chunk() signal chain EXACTLY — voices
 * summed mono, stereo soundboard, room reverb, master gain, tanh — because the
 * point of using this synth is to sound like this synth. Any divergence here is
 * a bug, not a preference.
 *
 * Blocks, not one buffer: a five-minute stereo render is ~105 MB, which is a
 * silly thing to hold in wasm memory when the caller is going to copy it into
 * an AudioBuffer anyway. The caller pulls PFW_BLOCK frames at a time.
 */

#include "core/pf_string.h"
#include "core/pf_board.h"
#include "core/pf_reverb.h"
#include <math.h>
#include <string.h>

#define PFW_POLY   64      /* simultaneous ringing strings */
#define PFW_BLOCK  4096    /* frames per pull */
#define PFW_MAXNOTES 32768

/*
 * When a decayed voice stops being worth computing.
 *
 * This is the single biggest cost in the render and it is not obvious why: the
 * rondo is 487 short notes, but a struck string goes on ringing long after its
 * damper falls, so the piece holds ~38 voices at once and every one of them is
 * a per-sample Newton solve. Upstream's host uses 1e-7 because it is a
 * real-time dev tool where CPU is spare and cutting a tail early would be a
 * lie about the instrument.
 *
 * Measured on the rondo, against a full 1e-7 render:
 *
 *   1e-7  1.31x real time   (upstream's value)
 *   1e-5  2.16x             tail discarded peaks -144 dB below the piece
 *   1e-4  3.23x             tail discarded peaks -115 dB
 *   1e-3  6.90x             tail discarded peaks  -81 dB
 *
 * Inside the overlap every one of them is identical to the reference to within
 * float32 rounding (-140 dB, zero peak error) — the ONLY thing a higher
 * threshold changes is how much of the final decay is rendered at all.
 *
 * 1e-4 is the principled stop. We write 16-bit WAV and play through a 16-bit
 * path, so -96 dB is the floor of what our own output can represent: a tail
 * peaking at -115 dB cannot be encoded, let alone heard. 1e-3 would be faster
 * again and discards a tail at -81 dB, which IS representable — audible is
 * another question, but "probably inaudible" is not the same claim and this
 * one can be made without hedging.
 */
#ifndef RETIRE_LEVEL
#define RETIRE_LEVEL 1.0e-4
#endif

/* A note as the caller writes it: start and duration in SAMPLES, so the shim
 * never has to agree with JavaScript about tempo or rounding. */
typedef struct {
    int    start, end;      /* sample index of the strike and of the damper */
    float  midi, velocity;
} pfw_note;

typedef struct {
    pf_string voice;
    int  used;
    int  note_index;        /* which note is ringing here, -1 when free */
    int  end;               /* sample index at which to release */
    double level;
} pfw_slot;

static struct {
    double sr;
    pf_string_params params;
    pfw_slot slots[PFW_POLY];
    pf_board_stereo board;
    pf_reverb reverb;
    double master_gain;

    pfw_note notes[PFW_MAXNOTES];
    int n_notes;
    int next_note;          /* notes are sorted by start; this is the cursor */
    int clock;              /* samples rendered so far */

    float scratch[PFW_BLOCK];
    float out[2 * PFW_BLOCK];
} G;

/* ------------------------------------------------------------- exports --- */

/* Where the caller writes notes, and reads rendered frames. Static buffers
 * rather than an allocator: the sizes are fixed and known, and a bump
 * allocator in a module that renders one piece is ceremony. */
__attribute__((export_name("pfw_notes_ptr")))
pfw_note *pfw_notes_ptr(void) { return G.notes; }

__attribute__((export_name("pfw_out_ptr")))
float *pfw_out_ptr(void) { return G.out; }

__attribute__((export_name("pfw_max_notes")))
int pfw_max_notes(void) { return PFW_MAXNOTES; }

__attribute__((export_name("pfw_block")))
int pfw_block(void) { return PFW_BLOCK; }

/*
 * Start a render. `n_notes` notes must already be in the notes buffer, SORTED
 * BY START — the block loop admits notes with a single forward cursor, so an
 * out-of-order note is silently never struck. Sorting in JS, where the events
 * are already being built, is cheaper than sorting 32k structs here.
 */
__attribute__((export_name("pfw_begin")))
void pfw_begin(double sample_rate, int n_notes, double master_gain)
{
    memset(&G.slots, 0, sizeof(G.slots));
    G.sr = sample_rate;
    G.n_notes = n_notes < 0 ? 0 : (n_notes > PFW_MAXNOTES ? PFW_MAXNOTES : n_notes);
    G.next_note = 0;
    G.clock = 0;
    G.master_gain = master_gain > 0 ? master_gain : 110.0;

    pf_string_defaults(&G.params, sample_rate);

    pf_board_params bp;
    pf_board_defaults(&bp, sample_rate);
    pf_board_stereo_init(&G.board, &bp, sample_rate);
    pf_board_stereo_reset(&G.board);

    pf_reverb_init(&G.reverb, sample_rate);
    pf_reverb_reset(&G.reverb);

    for (int i = 0; i < PFW_POLY; i++) G.slots[i].note_index = -1;
}

/* Equal temperament, A4 = 440. The score has already decided what the pitch
 * is; this is only the conversion the synth needs. */
static double freq_of(double midi) { return 440.0 * pow(2.0, (midi - 69.0) / 12.0); }

/*
 * Claim a voice. Free slot first; failing that, steal the quietest, which is
 * the least audible thing to interrupt. Offline there is no deadline, so the
 * only reason to cap polyphony at all is memory: 64 voices is 2 MB.
 */
static pfw_slot *claim(void)
{
    for (int i = 0; i < PFW_POLY; i++) if (!G.slots[i].used) return &G.slots[i];
    pfw_slot *worst = &G.slots[0];
    for (int i = 1; i < PFW_POLY; i++) if (G.slots[i].level < worst->level) worst = &G.slots[i];
    return worst;
}

/*
 * Render the next `frames` frames as interleaved stereo into the out buffer.
 * Returns the number of frames written (always `frames`; the caller decides
 * when to stop, because the tail rings on past the last note-off).
 */
__attribute__((export_name("pfw_render")))
int pfw_render(int frames)
{
    if (frames > PFW_BLOCK) frames = PFW_BLOCK;
    if (frames < 0) frames = 0;

    const int block_start = G.clock;
    const int block_end = G.clock + frames;

    /* Note-ons landing inside this block. Quantised to the block edge rather
     * than the exact sample: a strike is an impulse into a delay line, and at
     * 4096 frames the worst case is 93 ms — audible. So instead the block is
     * SPLIT at each onset below. */
    for (int j = 0; j < 2 * frames; j++) G.out[j] = 0.0f;

    int pos = 0;
    while (pos < frames) {
        /* How far can we run before something has to happen? */
        int seg_end = frames;
        int at = block_start + pos;

        /* Strike everything due exactly now, before deciding the segment. */
        while (G.next_note < G.n_notes && G.notes[G.next_note].start <= at) {
            pfw_note *nt = &G.notes[G.next_note];
            pfw_slot *s = claim();
            pf_string_init(&s->voice, &G.params, freq_of(nt->midi));
            pf_string_strike(&s->voice, nt->velocity > 0 ? nt->velocity : 0.001);
            s->used = 1;
            s->level = 1.0;
            s->end = nt->end;
            s->note_index = G.next_note;
            G.next_note++;
        }
        /* Damp everything whose time is up. */
        for (int i = 0; i < PFW_POLY; i++) {
            pfw_slot *s = &G.slots[i];
            if (s->used && s->note_index >= 0 && s->end <= at) {
                pf_string_release(&s->voice);
                s->note_index = -1;
            }
        }

        /* Run only as far as the next event, so onsets stay sample-accurate. */
        if (G.next_note < G.n_notes) {
            int until = G.notes[G.next_note].start - block_start;
            if (until > pos && until < seg_end) seg_end = until;
        }
        for (int i = 0; i < PFW_POLY; i++) {
            pfw_slot *s = &G.slots[i];
            if (!s->used || s->note_index < 0) continue;
            int until = s->end - block_start;
            if (until > pos && until < seg_end) seg_end = until;
        }
        if (seg_end <= pos) seg_end = pos + 1;   /* always make progress */
        if (seg_end > frames) seg_end = frames;

        const int n = seg_end - pos;

        /* --- engine.c render_chunk(), voice loop --- */
        for (int i = 0; i < PFW_POLY; i++) {
            pfw_slot *s = &G.slots[i];
            if (!s->used) continue;

            memset(G.scratch, 0, (size_t)n * sizeof(float));
            pf_string_process(&s->voice, G.scratch, n);

            double pk = 0.0;
            for (int j = 0; j < n; j++) {
                float v = G.scratch[j];
                double a = fabs(v);
                if (a > pk) pk = a;
                G.out[2 * (pos + j)]     += v;
                G.out[2 * (pos + j) + 1] += v;
            }
            s->level = (pk > s->level) ? pk : s->level * 0.85 + pk * 0.15;

            /* Retire once the hammer is done and the string has rung out. A
             * voice still holding its note_index is a note whose damper has not
             * fallen yet, so it must not be retired however quiet it is. */
            if (s->note_index < 0 && !s->voice.ham_engaged && s->level < RETIRE_LEVEL) {
                s->used = 0;
            }
        }
        pos = seg_end;
    }

    /* --- engine.c render_chunk(), master chain --- */
    const double g = G.master_gain;
    for (int j = 0; j < frames; j++) {
        double l, r;
        pf_board_stereo_tick(&G.board, G.out[2 * j], &l, &r);
        pf_reverb_tick(&G.reverb, l, r, &l, &r);
        G.out[2 * j]     = (float)tanh(l * g);
        G.out[2 * j + 1] = (float)tanh(r * g);
    }

    G.clock = block_end;
    return frames;
}

/* Are there notes left to strike, or voices still ringing? The caller uses this
 * to know when the tail has died rather than guessing a fixed padding. */
__attribute__((export_name("pfw_active")))
int pfw_active(void)
{
    if (G.next_note < G.n_notes) return 1;
    for (int i = 0; i < PFW_POLY; i++) if (G.slots[i].used) return 1;
    return 0;
}

/* Test-only: how many voice slots are currently in use. Not exported to wasm. */
int pfw_debug_voices(void)
{
    int n = 0;
    for (int i = 0; i < PFW_POLY; i++) if (G.slots[i].used) n++;
    return n;
}
