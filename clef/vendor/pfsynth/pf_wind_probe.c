/* pf_wind_probe.c — the measurement harness for pf_wind.c. Ours; not built.
 *
 * A wind waveguide either speaks or it does not, and the difference is not
 * visible in the code. This renders one note and scores it two ways:
 *
 *   periodicity  the best normalised autocorrelation over a musical range of
 *                lags. 1.0 is a perfectly repeating waveform; below ~0.9 the
 *                thing is hissing rather than sounding a pitch.
 *   cents        how far the lag that won is from the note that was asked for.
 *
 * Every parameter is overridable from the environment so the search can be a
 * shell loop rather than a recompile. Build:
 *
 *   clang -O2 -I. pf_wind_probe.c pf_wind.c -o /tmp/probe -lm
 *   PR=0.9 PP=0.3 /tmp/probe 440 0.7
 *
 * NOTE the trap this harness walked into and that a successor should not:
 * periodicity 1.000 is necessary and NOT sufficient. A tube speaking one
 * octave above the note it was given is perfectly periodic. Check the harmonic
 * balance as well — if h2/h4/h6 tower over h1/h3/h5, it is overblowing.
 */
#include "pf_wind.h"
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
static double envd(const char*k,double d){const char*v=getenv(k);return v?atof(v):d;}
int main(int argc,char**argv){
  double sr=44100,f0=argc>1?atof(argv[1]):440.0,vel=argc>2?atof(argv[2]):0.7;
  static pf_wind w; pf_wind_params p; pf_wind_defaults(&p,sr);
  p.jet_ratio =envd("JR",p.jet_ratio);
  p.jet_reflect=envd("JX",p.jet_reflect);
  p.end_reflect=envd("EX",p.end_reflect);
  p.loss      =envd("LO",p.loss);
  p.loss_cut  =envd("LC",p.loss_cut);
  p.pressure  =envd("PR",p.pressure);
  p.noise_gain=envd("NG",p.noise_gain);
  p.pressure_pitch=envd("PP",p.pressure_pitch);
  p.tune_comp=envd("TC",p.tune_comp);
  p.vibrato_depth=envd("VD",p.vibrato_depth);
  pf_wind_init(&w,&p,f0); pf_wind_blow(&w,vel);
  int N=(int)(sr*1.2); float*b=calloc(N,sizeof(float)); pf_wind_process(&w,b,N);
  /* steady state only */
  int s0=(int)(sr*0.7), M=(int)(sr*0.4);
  double mean=0; for(int i=0;i<M;i++)mean+=b[s0+i]; mean/=M;
  double e0=0; for(int i=0;i<M;i++){double v=b[s0+i]-mean; e0+=v*v;}
  if(e0<1e-12){printf("SILENT\n");return 0;}
  /* autocorrelation: best lag in a musical range, and how periodic it is */
  int lo=(int)(sr/2000.0), hi=(int)(sr/60.0); if(hi>M/2)hi=M/2;
  double best=-2; int bl=0;
  for(int L=lo;L<=hi;L++){
    double num=0,d1=0,d2=0;
    for(int i=0;i<M-L;i++){double a=b[s0+i]-mean,c=b[s0+i+L]-mean; num+=a*c; d1+=a*a; d2+=c*c;}
    double r=num/sqrt(d1*d2+1e-30);
    if(r>best){best=r;bl=L;}
  }
  double hz=sr/bl;
  int nan=0; double pk=0; for(int i=0;i<N;i++){if(!isfinite(b[i]))nan++;double a=fabs(b[i]);if(a>pk)pk=a;}
  printf("hz=%.1f cents=%+.0f periodicity=%.3f peak=%.3f nan=%d\n",
         hz, 1200*log2(hz/f0), best, pk, nan);
  return 0;
}
