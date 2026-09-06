/* pf_wind.h — a waveguide flute. Ours, not pfsynth's; see pf_wind.c.
 *
 * Same shape as pf_string's API on purpose (defaults / init / excite / release
 * / process / active), so the host can drive a wind voice and a struck voice
 * through the same loop without knowing which it has.
 *
 * No dynamic allocation, structs fully defined here, only <math.h>/<string.h> —
 * the rules core/ keeps, kept here too, so this compiles for wasm the same way.
 */
#ifndef PF_WIND_H
#define PF_WIND_H

#define PF_WIND_MAXDELAY 4096

typedef struct {
    double sample_rate;
    double jet_ratio;      /* jet travel time / bore travel time — the register */
    double jet_reflect;    /* returning wave's pull on the jet */
    double end_reflect;    /* reflection at the open end back into the bore */
    double loss;           /* bore loop gain; < 1 or it never stops growing */
    double loss_cut;       /* one-pole coefficient: highs die first, as in a tube */
    double noise_gain;     /* turbulence, as a fraction of breath */
    double vibrato_rate, vibrato_depth;
    double breath_rise, breath_fall;   /* seconds; a flute does not speak instantly */
    double pressure;       /* blowing pressure at A4, velocity 1 */
    double pressure_pitch; /* it scales (f0/440)^this — see pf_wind.c */
    double tune_comp;      /* filter phase delay inside the loop, in samples */
    double out_gain;
} pf_wind_params;

typedef struct {
    pf_wind_params p;
    double sr, f0;

    double bore[PF_WIND_MAXDELAY];
    int    bore_len, bore_pos;
    double bore_frac;

    double jet[PF_WIND_MAXDELAY];
    int    jet_len, jet_pos;
    double jet_frac;

    double loss_y1;
    double dc_x1, dc_y1;

    double breath, target, velocity, pressure_scaled;
    double vib_phase;
    int    blowing;
    unsigned rng;
} pf_wind;

void pf_wind_defaults(pf_wind_params *p, double sample_rate);
void pf_wind_init(pf_wind *w, const pf_wind_params *p, double f0);
void pf_wind_blow(pf_wind *w, double velocity);     /* note on; velocity in (0,1] */
void pf_wind_release(pf_wind *w);                   /* note off: breath stops */
void pf_wind_process(pf_wind *w, float *out, int n);/* ADDS n samples into out */
int  pf_wind_active(const pf_wind *w);

#endif /* PF_WIND_H */
