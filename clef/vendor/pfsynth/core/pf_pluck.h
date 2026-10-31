/* Sample-free modal plucked string with Kirchhoff-Carrier tension modulation.
 * SAV/trapezoidal update, one rank-one inverse; portable C, no allocation.
 * Related to Ducceschi/Russo/Webb DAFx26; simpler than their geometric model. */
#ifndef PF_PLUCK_H
#define PF_PLUCK_H
#define PF_PLUCK_MODES 80
typedef struct {
    int count;
    double sr,h,kappa,r,c0,release;
    double q[PF_PLUCK_MODES],v[PF_PLUCK_MODES],k2[PF_PLUCK_MODES];
    double w2[PF_PLUCK_MODES],sigma[PF_PLUCK_MODES],rad[PF_PLUCK_MODES];
    int material;
    double body_loss[PF_PLUCK_MODES];
    double last_midi,last_damping;
    int last_string,pitch_ready;
    double touch[PF_PLUCK_MODES],touch_rho;   /* finger touch (harmonics); 0 = none */
    double touch_sigma[PF_PLUCK_MODES];       /* extra per-mode damping of a wide finger */
} pf_pluck;
/* Opt-in experimental fret/string path; existing init stays unchanged. */
void pf_pluck_string(pf_pluck *s,double sr,double midi,double velocity,int string,double position);
void pf_pluck_material(pf_pluck *s,double sr,double midi,double velocity,int string,double position,int material);
void pf_pluck_pitch(pf_pluck *s,double midi,int string,double damping);
void pf_pluck_init(pf_pluck *s,double sr,double midi,double velocity,int nonlinear);
void pf_pluck_release(pf_pluck *s);
/* Opt-in hammer-on / pull-off to `midi` on a sounding string; see pf_pluck.c. */
void pf_pluck_legato(pf_pluck *s,double midi,int string,double amount,double contact);
/* Opt-in finger touch for harmonics (rho = 0 lifts); see pf_pluck.c. */
void pf_pluck_touch(pf_pluck *s,double position,double rho);
/* Opt-in finger of finite width (fraction of the speaking length); see pf_pluck.c. */
void pf_pluck_touch_width(pf_pluck *s,double position,double rho,double width);
void pf_pluck_process(pf_pluck *s,float *out,int frames);
double pf_pluck_energy(const pf_pluck *s);
#endif
