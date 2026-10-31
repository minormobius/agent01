/* pf_stream.c — the piano and the guitar as an ENDLESS stream. Ours, not pfsynth's.
 *
 * pf_web.c and pf_guitar_web.c render a finished score: every note is known before the first
 * sample. Generative music (studio/cycle) is composed as it plays, a few seconds ahead, forever,
 * so this host accepts notes WHILE it renders: the page pushes notes for the coming seconds and
 * pulls blocks; strings struck in one push ring on through the next.
 *
 *   piano:  the same signal chain as pf_web.c (core/pf_string voices summed mono, stereo
 *           soundboard, room reverb, master gain, tanh), with its fixed note list replaced by a
 *           queue. Keep the two in step: any divergence is a bug, not a preference.
 *   guitar: six core/pf_pluck strings driven the way upstream's host/pf_guitar.c drives them
 *           (apply_event: a pluck with the pluck position and material, a natural harmonic as a
 *           touch at the node lifted after the touch time, hammer-ons and pull-offs as legato,
 *           palm-muted damping, the per-128-frame pitch update), with upstream's default
 *           parameters taken from its own init. What is not here is upstream's whole-score
 *           planning (hand-position search, let-ring): the composer gives each note its string
 *           and how long it rings, because it knows what comes next and the planner cannot.
 *
 * core/ and host/ are John O'Laughlin's (MIT), unmodified. Times are in SAMPLES as doubles, so
 * the clock never overflows in a session that runs for days.
 *
 * Protocol:
 *   ps_begin(sr, piano_gain)      reset everything; the clock to 0
 *   ps_stage_ptr()                where to write up to ps_stage_max() notes (ps_note, 40 bytes)
 *   ps_push(n)                    take n staged notes into the queues (any order)
 *   ps_render(frames)             up to ps_block() frames: piano stereo into ps_piano_ptr(),
 *                                 guitar bridge force (mono) into ps_guitar_ptr()
 *   ps_clock()                    samples rendered so far; ps_pending() notes not yet struck
 */
#include "core/pf_string.h"
#include "core/pf_board.h"
#include "core/pf_reverb.h"
#include "host/pf_guitar.h"
#include <math.h>
#include <string.h>

#define PS_BLOCK 2048
#define PS_STAGE 1024
#define PS_QUEUE 8192
#define PS_POLY 64
#define RETIRE_LEVEL 1.0e-4                      /* as pf_web.c, for the same reason */

typedef struct {
    double start, end;          /* samples */
    float midi, velocity;       /* piano: velocity 0..1; guitar: MIDI velocity (to 4 × 127) */
    int inst;                   /* 0 piano, 1 guitar */
    int string;                 /* guitar: 1 (high E) … 6 */
    int art;                    /* guitar: PF_ART_* */
    float art_param;            /* guitar: harmonic's touched fret, slur distance (m) */
} ps_note;

typedef struct { pf_string voice; int used, held; double end, level; } p_slot;
typedef struct { double frame; int kind, id; ps_note n; } g_event;   /* kind 0 off, 1 on, 2 lift */

static struct {
    double sr, clock, gain;
    /* piano */
    pf_string_params params;
    p_slot slots[PS_POLY];
    pf_board_stereo board;
    pf_reverb reverb;
    ps_note pq[PS_QUEUE]; int pn;                 /* pending piano notes, sorted by start */
    /* guitar */
    pf_guitar g;                                  /* upstream's struct: its parameters and strings */
    g_event gq[PS_QUEUE]; int gn;                 /* pending guitar events, sorted by frame */
    int owner_id[6]; double owner_end[6];         /* which note holds each string, and when it stops */
    int next_id; float owner_pitch[6]; int owner_art[6]; int used[6];
    int released[6]; double peak_energy[6];       /* a released, rung-out string is skipped */
    /* buffers */
    ps_note stage[PS_STAGE];
    float scratch[PS_BLOCK];
    float piano_out[2 * PS_BLOCK], guitar_out[PS_BLOCK];
} S;

__attribute__((export_name("ps_stage_ptr"))) ps_note *ps_stage_ptr(void) { return S.stage; }
__attribute__((export_name("ps_stage_max"))) int ps_stage_max(void) { return PS_STAGE; }
__attribute__((export_name("ps_note_bytes"))) int ps_note_bytes(void) { return (int)sizeof(ps_note); }
__attribute__((export_name("ps_piano_ptr"))) float *ps_piano_ptr(void) { return S.piano_out; }
__attribute__((export_name("ps_guitar_ptr"))) float *ps_guitar_ptr(void) { return S.guitar_out; }
__attribute__((export_name("ps_block"))) int ps_block(void) { return PS_BLOCK; }
__attribute__((export_name("ps_clock"))) double ps_clock(void) { return S.clock; }
__attribute__((export_name("ps_pending"))) int ps_pending(void) { return S.pn + S.gn; }

__attribute__((export_name("ps_voices")))
int ps_voices(void) { int n = 0; for (int i = 0; i < PS_POLY; i++) n += S.slots[i].used; return n; }

__attribute__((export_name("ps_begin")))
void ps_begin(double sample_rate, double piano_gain)
{
    memset(&S.slots, 0, sizeof S.slots);
    S.sr = sample_rate; S.clock = 0; S.pn = 0; S.gn = 0;
    S.gain = piano_gain > 0 ? piano_gain : 110.0;
    pf_string_defaults(&S.params, sample_rate);
    pf_board_params bp;
    pf_board_defaults(&bp, sample_rate);
    pf_board_stereo_init(&S.board, &bp, sample_rate);
    pf_board_stereo_reset(&S.board);
    pf_reverb_init(&S.reverb, sample_rate);
    pf_reverb_reset(&S.reverb);
    pf_instrument_guitar.init(&S.g, sample_rate);              /* upstream's defaults */
    for (int s = 0; s < 6; s++) { S.owner_id[s] = -1; S.used[s] = 0; S.released[s] = 0; S.peak_energy[s] = 0; memset(&S.g.str[s], 0, sizeof S.g.str[s]); }
    S.next_id = 0;
}

static void g_insert(double frame, int kind, int id, const ps_note *n)
{
    if (S.gn >= PS_QUEUE) return;
    int i = S.gn++;
    while (i > 0 && S.gq[i - 1].frame > frame) { S.gq[i] = S.gq[i - 1]; i--; }
    S.gq[i].frame = frame; S.gq[i].kind = kind; S.gq[i].id = id; S.gq[i].n = *n;
}

__attribute__((export_name("ps_push")))
int ps_push(int n)
{
    if (n > PS_STAGE) n = PS_STAGE;
    int taken = 0;
    for (int k = 0; k < n; k++) {
        ps_note *nt = &S.stage[k];
        if (nt->start < S.clock) nt->start = S.clock;            /* late: strike at once */
        if (nt->end <= nt->start) nt->end = nt->start + 1;
        if (nt->inst == 0) {
            if (S.pn >= PS_QUEUE) continue;
            int i = S.pn++;
            while (i > 0 && S.pq[i - 1].start > nt->start) { S.pq[i] = S.pq[i - 1]; i--; }
            S.pq[i] = *nt;
        } else {
            if (nt->string < 1 || nt->string > 6) continue;
            int id = S.next_id++;
            g_insert(nt->start, 1, id, nt);
            g_insert(nt->end, 0, id, nt);
            if (nt->art == PF_ART_HARMONIC) g_insert(nt->start + S.g.p[PF_GUITAR_HARM_TIME] / 1000.0 * S.sr, 2, id, nt);
        }
        taken++;
    }
    return taken;
}

static double hz(double m) { return 440.0 * pow(2.0, (m - 69.0) / 12.0); }
static const signed char OPEN[6] = { 64, 59, 55, 50, 45, 40 };

/* upstream's apply_event, for one streamed note */
static void g_apply(const g_event *e)
{
    const ps_note *N = &e->n; int id = e->id;
    int s = N->string; pf_pluck *st = &S.g.str[s - 1]; const double *p = S.g.p;
    if (e->kind == 2) { if (S.owner_id[s - 1] == id) pf_pluck_touch(st, 0, 0); return; }
    if (e->kind == 1) {
        int art = N->art, connected = art == PF_ART_HAMMER_ON || art == PF_ART_PULL_OFF || art == PF_ART_SLIDE || art == PF_ART_TIE;
        if (!(connected && S.used[s - 1])) {
            int harmonic = art == PF_ART_HARMONIC;
            double open = OPEN[s - 1], midi = harmonic ? open : N->midi, vel = N->velocity / 127.0;
            if (vel > p[PF_GUITAR_HEADROOM]) vel = p[PF_GUITAR_HEADROOM];
            double pos = harmonic ? p[PF_GUITAR_HARM_PLUCK] : p[PF_GUITAR_PLUCK];
            pf_pluck_material(st, S.sr, midi, vel, s, pos, (int)p[PF_GUITAR_TREBLES]);
            if (harmonic) {
                int fret = N->art_param > 0 ? (int)lrintf(N->art_param) : 12;
                int node = fret == 12 ? 2 : fret == 7 ? 3 : fret == 5 ? 4 : fret == 4 ? 5 : (int)lrint(1 / (1 - pow(2, -fret / 12.)));
                double length = .65 * hz(OPEN[s - 1]) / hz(open);
                double position = 1. / node + p[PF_GUITAR_HARM_OFFSET] * 1e-3 / length, width = p[PF_GUITAR_HARM_WIDTH] / 650.;
                if (width > 0) pf_pluck_touch_width(st, position, p[PF_GUITAR_HARM_RHO], width);
                else pf_pluck_touch(st, position, p[PF_GUITAR_HARM_RHO]);
            }
        } else if (art == PF_ART_HAMMER_ON || art == PF_ART_PULL_OFF) {
            double amount = N->art_param > 0 ? N->art_param : (art == PF_ART_HAMMER_ON ? p[PF_GUITAR_HAMMER_MM] : p[PF_GUITAR_PULL_MM]) / 1000;
            pf_pluck_legato(st, N->midi, s, amount, p[PF_GUITAR_SLUR_CONTACT] / 1000);
        }
        S.used[s - 1] = 1; S.released[s - 1] = 0; S.peak_energy[s - 1] = 0;
        S.owner_id[s - 1] = id; S.owner_pitch[s - 1] = art == PF_ART_HARMONIC ? OPEN[s - 1] : N->midi; S.owner_art[s - 1] = art;
        return;
    }
    if (S.owner_id[s - 1] != id) return;                       /* a later note took the string */
    pf_pluck_release(st);
    S.released[s - 1] = 1;
}

static p_slot *claim(void)
{
    for (int i = 0; i < PS_POLY; i++) if (!S.slots[i].used) return &S.slots[i];
    p_slot *worst = &S.slots[0];
    for (int i = 1; i < PS_POLY; i++) if (S.slots[i].level < worst->level) worst = &S.slots[i];
    return worst;
}

/* the piano, as pf_web.c's pfw_render: split at every onset and release, then the master chain */
static void piano_render(int frames)
{
    for (int j = 0; j < 2 * frames; j++) S.piano_out[j] = 0.0f;
    const double t0 = S.clock;
    int pos = 0;
    while (pos < frames) {
        double at = t0 + pos;
        while (S.pn > 0 && S.pq[0].start <= at) {
            ps_note nt = S.pq[0];
            memmove(&S.pq[0], &S.pq[1], (size_t)(S.pn - 1) * sizeof(ps_note)); S.pn--;
            p_slot *s = claim();
            pf_string_init(&s->voice, &S.params, hz(nt.midi));
            pf_string_strike(&s->voice, nt.velocity > 0 ? nt.velocity : 0.001);
            s->used = 1; s->held = 1; s->level = 1.0; s->end = nt.end;
        }
        for (int i = 0; i < PS_POLY; i++) {
            p_slot *s = &S.slots[i];
            if (s->used && s->held && s->end <= at) { pf_string_release(&s->voice); s->held = 0; }
        }
        int seg_end = frames;
        if (S.pn > 0) { double u = S.pq[0].start - t0; if (u > pos && u < seg_end) seg_end = (int)ceil(u); }
        for (int i = 0; i < PS_POLY; i++) {
            p_slot *s = &S.slots[i];
            if (!s->used || !s->held) continue;
            double u = s->end - t0; if (u > pos && u < seg_end) seg_end = (int)ceil(u);
        }
        if (seg_end <= pos) seg_end = pos + 1;
        if (seg_end > frames) seg_end = frames;
        const int n = seg_end - pos;
        for (int i = 0; i < PS_POLY; i++) {
            p_slot *s = &S.slots[i];
            if (!s->used) continue;
            memset(S.scratch, 0, (size_t)n * sizeof(float));
            pf_string_process(&s->voice, S.scratch, n);
            double pk = 0.0;
            for (int j = 0; j < n; j++) {
                float v = S.scratch[j]; double a = fabs(v); if (a > pk) pk = a;
                S.piano_out[2 * (pos + j)] += v; S.piano_out[2 * (pos + j) + 1] += v;
            }
            s->level = (pk > s->level) ? pk : s->level * 0.85 + pk * 0.15;
            if (!s->held && !s->voice.ham_engaged && s->level < RETIRE_LEVEL) s->used = 0;
        }
        pos = seg_end;
    }
    for (int j = 0; j < frames; j++) {
        double l, r;
        pf_board_stereo_tick(&S.board, S.piano_out[2 * j], &l, &r);
        pf_reverb_tick(&S.reverb, l, r, &l, &r);
        S.piano_out[2 * j] = (float)tanh(l * S.gain);
        S.piano_out[2 * j + 1] = (float)tanh(r * S.gain);
    }
}

/* the guitar, as upstream's grender: events at their frame, strings updated every 128 frames */
static void guitar_render(int frames)
{
    const double *p = S.g.p;
    float gain = p[PF_GUITAR_GAIN_DB] == 0 ? 1.f : (float)pow(10, p[PF_GUITAR_GAIN_DB] / 20);
    int done = 0;
    while (done < frames) {
        double now = S.clock + done;
        while (S.gn > 0 && S.gq[0].frame <= now) {
            g_event e = S.gq[0];
            memmove(&S.gq[0], &S.gq[1], (size_t)(S.gn - 1) * sizeof(g_event)); S.gn--;
            g_apply(&e);
        }
        /* to the next 128-frame boundary (absolute, as upstream), or the next event */
        double bend = (floor(now / PF_GUITAR_BLOCK) + 1) * PF_GUITAR_BLOCK;
        int len = frames - done; if (bend - now < len) len = (int)(bend - now);
        if (S.gn > 0) { double u = S.gq[0].frame - now; if (u > 0 && u < len) len = (int)ceil(u); }
        if (len < 1) len = 1;
        float *m = S.g.mono; memset(m, 0, sizeof(float) * (size_t)len);
        for (int s = 0; s < 6; s++) {
            if (!S.used[s]) continue;
            /* An endless stream cannot afford upstream's habit (fine for a finished score) of
             * computing every string once struck, forever: a string that has been released and
             * has rung down 90 dB in energy below its loudest is skipped until it is struck
             * again (a strike re-initialises it, so nothing it held is lost). */
            double en = pf_pluck_energy(&S.g.str[s]);
            if (en > S.peak_energy[s]) S.peak_energy[s] = en;
            if (S.released[s] && en < S.peak_energy[s] * 1e-9) { S.used[s] = 0; continue; }
            pf_pluck_pitch(&S.g.str[s], S.owner_pitch[s], s + 1, S.owner_art[s] == PF_ART_MUTED ? p[PF_GUITAR_MUTE_DAMP] : 0);
            pf_pluck_process(&S.g.str[s], m, len);
        }
        for (int q = 0; q < len; q++) S.guitar_out[done + q] = m[q] * gain;
        done += len;
    }
}

__attribute__((export_name("ps_render")))
int ps_render(int frames)
{
    if (frames > PS_BLOCK) frames = PS_BLOCK;
    if (frames < 1) return 0;
    piano_render(frames);
    guitar_render(frames);
    S.clock += frames;
    return frames;
}
