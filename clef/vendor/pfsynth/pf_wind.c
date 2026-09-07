/* pf_wind.c — a waveguide flute. OURS, not pfsynth's.
 *
 * *** PROTOTYPE. NOT BUILT, NOT SHIPPED, NOT IN THE VOICE PICKER. ***
 * build.sh does not compile this file and pfsynth.wasm does not contain it.
 * It oscillates, it tunes, and it is not yet an instrument — the measured
 * failures are listed at the bottom of this comment. It is here as the honest
 * starting point for a wind voice, not as one.
 *
 * Everything under core/ is John O'Laughlin's, vendored unmodified. This file
 * is clef's, written in the same style and using the same technique, because
 * the technique is the general one: a digital waveguide is a delay line
 * standing in for a medium that carries waves, plus a nonlinear excitation that
 * feeds it. Change the medium and the excitation and you change the instrument.
 *
 * WHAT CARRIES OVER FROM THE PIANO, AND WHAT DOES NOT
 *
 *   carries over  the loop itself: delay line, fractional tuner, one-pole loss,
 *                 DC blocker. Physically: something long that waves bounce
 *                 along, losing high frequencies faster than low ones.
 *   does not      the felt hammer (a flute is not struck), the coupled unison
 *                 strings (one air column, not three wires), the strike-point
 *                 comb (nothing strikes it).
 *   INVERTS       dispersion. A piano string is STIFF, so high partials travel
 *                 faster and the spectrum is stretched — that allpass cascade
 *                 is most of what makes a piano sound like a piano. An air
 *                 column is not stiff. Its partials are harmonic, and putting
 *                 dispersion in a flute would make it sound wrong in exactly
 *                 the way that makes a piano sound right.
 *
 * THE EXCITATION IS THE INSTRUMENT. What replaces the hammer here is an air
 * JET: breath crosses the embouchure hole and flaps in and out of the bore at
 * the rate the bore's own standing wave tells it to. Two things fall out of
 * that which are not programmed anywhere:
 *
 *   - The jet has its own travel time, a fraction of the bore's. Blow harder
 *     and the jet gets faster, that fraction changes, and the tube jumps to its
 *     next mode: OVERBLOWING. A flute plays its second octave with the same
 *     fingering because of this, and here it emerges from the delay ratio
 *     rather than from a rule saying "if loud, go up an octave".
 *   - Breath is turbulent, so the tone is substantially noise. Additive
 *     synthesis has no way to say that; here it is the excitation itself.
 *
 * The jet nonlinearity is the cubic x(x^2 - 1) (saturating, sign-preserving),
 * which is the standard model and the reason the thing oscillates at all: a
 * purely linear loop either decays to nothing or blows up, and never sustains.
 *
 * WHERE IT STANDS, MEASURED (44.1 kHz, autocorrelation periodicity over a
 * 0.4 s steady state, and a harmonic scan against the requested pitch):
 *
 *   works    A4-E6 at velocity ~0.7: periodicity 0.999-1.000, tuning +3..+8
 *            cents. It is a stable, in-tune, periodic oscillation.
 *   fails    Below A4 it will not lock (periodicity 0.32-0.64) — it is at the
 *            right pitch but breathy rather than voiced.
 *   fails    The spectrum is EVEN-HARMONIC dominated: h2/h4/h6 run 33-56 dB
 *            over h1/h3/h5. The tube is speaking an octave above the one it
 *            was asked for. Periodicity alone cannot see this, which is
 *            exactly why it needs the harmonic scan too.
 *   fails    Velocity 0.9 collapses to a subharmonic (62 Hz for a requested
 *            440). Velocity 0.3-0.5 does not speak (periodicity 0.22-0.39).
 *            The usable window is one velocity, not a range.
 *
 * WHAT IS MISSING IS NOT MORE MODEL, IT IS A MEASUREMENT TARGET. pfsynth's
 * piano is good because it was FITTED: upstream carries analyze.c and a set of
 * fitting scripts, and its constants are marked with the instrument they came
 * from. Everything above was hand-searched against a periodicity score with
 * nothing real to aim at, and hand-searching is why it holds in a band and
 * falls over outside it. The next step is a reference recording and a fit, not
 * more parameters.
 */

#include "pf_wind.h"
#include <math.h>
#include <string.h>

/* Bore lengths at the bottom of a flute's range are a few hundred samples;
 * this covers down to about 20 Hz at 96 kHz with room to spare. */
#define WIND_MAXDELAY PF_WIND_MAXDELAY

void pf_wind_defaults(pf_wind_params *p, double sample_rate)
{
    p->sample_rate  = sample_rate;
    /* The jet's travel time as a fraction of the bore's. This one number is
     * the register: near 0.3 the tube speaks its fundamental, and as the jet
     * speeds up with breath the effective ratio falls and it overblows. */
    p->jet_ratio    = 0.32;
    p->jet_reflect  = 0.52;   /* how much of the returning wave bends the jet */
    p->end_reflect  = 0.50;   /* reflection at the open end, back into the bore */
    p->loss         = 0.86;   /* bore loop gain: <1 or it never stops growing */
    p->loss_cut     = 0.62;   /* one-pole: high partials die first, as in a tube */
    p->noise_gain   = 0.031;  /* turbulence — a flute is substantially breath */
    p->vibrato_rate = 5.2;
    p->vibrato_depth= 0.008;
    p->breath_rise  = 0.028;  /* seconds to speak. A flute does not start instantly */
    p->breath_fall  = 0.055;
    p->pressure     = 0.90;   /* blowing pressure at A4 and velocity 1 */
    /* Blowing pressure has to be GRADUATED ACROSS THE RANGE, the same way
     * pfsynth graduates its hammers. One pressure for the whole flute does not
     * work and fails in both directions at once: too much air for a long tube
     * and it overblows to the octave, too little for a short one and it never
     * speaks. Measured with a single pressure: clean at A4-D5, an octave sharp
     * at C4-F4, and barely sounding at G5 and above. */
    p->pressure_pitch = 0.30;  /* pressure scales (f0/440)^this */
    /* Filter phase delay inside the loop, in samples. The one-pole loss and the
     * DC blocker each add a fraction of a sample, which is a fixed offset and
     * therefore a bigger share of a short period than a long one. Left out, the
     * whole instrument is flat by tens of cents. */
    p->tune_comp    = 1.9;
    p->out_gain     = 0.35;
}

/* One-pole lowpass, used as the bore's frequency-dependent loss. */
static double onepole(double x, double a, double *y1)
{
    double y = (1.0 - a) * x + a * (*y1);
    *y1 = y;
    return y;
}

/*
 * The jet's response to the pressure difference across it.
 *
 * x(x^2 - 1), with the OUTPUT limited to [-1, 1]. The cubic is what makes this
 * an oscillator rather than a filter: it has a region of negative slope, which
 * is energy returned to the loop in phase, and beyond it a limit that stops the
 * growth. A linear jet gives silence or a blow-up and nothing in between.
 *
 * THE LIMIT MUST BE ON THE OUTPUT. Clamping the INPUT to +/-1 first looks like
 * the same guard and is not: x(x^2-1) is ZERO at x = +/-1, so a hard-driven jet
 * would return nothing at all, and the harder you blew the less you would get.
 * That fold-back has no stable operating point, and the model answered every
 * parameter in a wide sweep with the same chaotic hiss pinned at the cubic's
 * extremum (0.385) — a tell, since a real change in loop gain has to change the
 * amplitude of something.
 */
static double jet_table(double x)
{
    double y = x * (x * x - 1.0);
    if (y > 1.0) return 1.0;
    if (y < -1.0) return -1.0;
    return y;
}

void pf_wind_init(pf_wind *w, const pf_wind_params *p, double f0)
{
    memset(w, 0, sizeof *w);
    w->p  = *p;
    w->sr = p->sample_rate;
    w->f0 = f0;

    /* A flute is open at both ends, so a round trip is one wavelength: the loop
     * delay is the period. (A clarinet is closed at the reed end and would want
     * half this with an odd-harmonic spectrum — the same code, one constant.) */
    double period = w->sr / f0;

    /* THE JET DELAY IS INSIDE THE FEEDBACK LOOP. The wave goes bore -> loss ->
     * jet -> nonlinearity -> bore, so what sets the pitch is bore + jet, not
     * bore. Setting the bore to the whole period tunes the instrument flat by
     * (1 + jet_ratio) — and because the jet then finds a mode that fits, it
     * overblows instead, landing a fifth SHARP. Measured: 647 Hz for a
     * requested 440. Divide the period between the two parts that carry it. */
    double target = period - p->tune_comp;
    if (target < 4.0) target = 4.0;
    double loop = target / (1.0 + p->jet_ratio);
    if (loop < 8.0) loop = 8.0;
    if (loop > WIND_MAXDELAY - 4) loop = WIND_MAXDELAY - 4;

    w->bore_len  = (int)loop;
    w->bore_frac = loop - (double)w->bore_len;

    double jet = loop * p->jet_ratio;
    if (jet < 2.0) jet = 2.0;
    w->jet_len  = (int)jet;
    w->jet_frac = jet - (double)w->jet_len;

    w->pressure_scaled = p->pressure * pow(f0 / 440.0, p->pressure_pitch);
    w->breath = 0.0;
    w->target = 0.0;
    w->rng = 0x2545F491u ^ (unsigned)(f0 * 977.0);
}

void pf_wind_blow(pf_wind *w, double velocity)
{
    if (velocity < 0.0) velocity = 0.0;
    if (velocity > 1.0) velocity = 1.0;
    w->velocity = velocity;
    /* Breath pressure rises with velocity, and a little faster than linearly —
     * a loud flute is not just a louder quiet flute, it is also brighter and
     * closer to overblowing. */
    w->target = w->pressure_scaled * (0.55 + 0.65 * velocity);
    w->blowing = 1;
}

void pf_wind_release(pf_wind *w)
{
    w->target = 0.0;
    w->blowing = 0;
}

/* xorshift: a deterministic breath so two renders of a score are identical. */
static double wind_noise(pf_wind *w)
{
    w->rng ^= w->rng << 13;
    w->rng ^= w->rng >> 17;
    w->rng ^= w->rng << 5;
    return ((double)(w->rng & 0xFFFFFF) / 8388608.0) - 1.0;
}

static double delay_read(const double *buf, int pos, int len, double frac)
{
    int i0 = pos - len;    if (i0 < 0) i0 += WIND_MAXDELAY;
    int i1 = i0 - 1;       if (i1 < 0) i1 += WIND_MAXDELAY;
    return buf[i0] + frac * (buf[i1] - buf[i0]);
}

void pf_wind_process(pf_wind *w, float *out, int n)
{
    const pf_wind_params *p = &w->p;
    const double rise = 1.0 - exp(-1.0 / (p->breath_rise * w->sr));
    const double fall = 1.0 - exp(-1.0 / (p->breath_fall * w->sr));
    const double vib_inc = 2.0 * M_PI * p->vibrato_rate / w->sr;

    for (int i = 0; i < n; i++) {
        /* --- breath: envelope, turbulence, and a little vibrato --- */
        double k = (w->target > w->breath) ? rise : fall;
        w->breath += k * (w->target - w->breath);
        w->vib_phase += vib_inc;
        if (w->vib_phase > 2.0 * M_PI) w->vib_phase -= 2.0 * M_PI;

        double pressure = w->breath
            * (1.0 + p->vibrato_depth * sin(w->vib_phase))
            + p->noise_gain * w->breath * wind_noise(w);

        /* --- the bore, read at the far end and reflected --- */
        double bore_out = delay_read(w->bore, w->bore_pos, w->bore_len, w->bore_frac);
        double refl = -onepole(bore_out, p->loss_cut, &w->loss_y1) * p->loss;
        /* DC blocker: the cubic jet has an asymmetric response, so without this
         * the loop accumulates an offset and eventually latches to one rail. */
        double dc = refl - w->dc_x1 + 0.9995 * w->dc_y1;
        w->dc_x1 = refl; w->dc_y1 = dc;
        refl = dc;

        /* --- the jet: pressure difference across it, delayed by its own
         * travel time, through the cubic --- */
        double diff = pressure - p->jet_reflect * refl;
        w->jet[w->jet_pos] = diff;
        double jet_in = delay_read(w->jet, w->jet_pos, w->jet_len, w->jet_frac);
        if (++w->jet_pos >= WIND_MAXDELAY) w->jet_pos = 0;

        double excite = jet_table(jet_in) + p->end_reflect * refl;

        w->bore[w->bore_pos] = excite;
        if (++w->bore_pos >= WIND_MAXDELAY) w->bore_pos = 0;

        out[i] += (float)(p->out_gain * bore_out);
    }
}

int pf_wind_active(const pf_wind *w)
{
    return w->blowing || w->breath > 1.0e-4 || fabs(w->dc_y1) > 1.0e-5;
}
