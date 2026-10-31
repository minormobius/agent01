#include "pf_pluck.h"
#include <math.h>
#include <string.h>
static double sq(double x){return x*x;}
static const double opens[6]={64,59,55,50,45,40};
static const double masses[6]={.00042,.00065,.0011,.0022,.0038,.0062};
/* Kodama et al. AST 44 (2023), tables 1/2: NY1 and FC1 trebles.
 * Wound basses use the 2026 Ducceschi et al. geometry for both sets;
 * their effective bending stiffness/loss are designed, not solid-wire EI. */
static void material_values(int material,int string,double *mu,double *EI,double *loss,double *EA)
{
    static const double d[2][3]={{.718,.839,1.038},{.615,.690,.835}};
    static const double mass[2][3]={{.438,.588,.915},{.549,.682,.999}};
    static const double young[2][3]={{3.74,3.13,2.86},{3.08,3.04,3.00}};
    static const double imag[2][3]={{.09,.07,.08},{.09,.09,.08}};
    int a=material==2,b=string-1;
    if(string<=3){double diameter=d[a][b]*.001,E=young[a][b]*1e9;
        *mu=mass[a][b]*.001;*EI=E*3.141592653589793*pow(diameter,4)/64;
        *loss=imag[a][b]/young[a][b];*EA=E*3.141592653589793*diameter*diameter/4;
    }else{static const double bass_mu[3]={.002206,.003843,.006129};
        *mu=bass_mu[string-4];*EI=2e-5;*loss=.006;*EA=1600;}
}
void pf_pluck_pitch(pf_pluck *s,double midi,int string,double damping)
{
    if(string<1)string=1;if(string>6)string=6;
    /* Static material notes should not re-anchor SAV energy every host block. */
    if(s->material&&s->pitch_ready&&s->last_midi==midi&&s->last_string==string&&s->last_damping==damping)return;
    s->last_midi=midi;s->last_string=string;s->last_damping=damping;s->pitch_ready=1;
    double f=440*pow(2,(midi-69)/12),base=440*pow(2,(opens[string-1]-69)/12);
    double L=.65*base/f,mu=masses[string-1],T=mu*sq(1.3*base);
    double stiff=string<=3?3e-5:1.2e-5;
    double EI=0,loss=0,EA=0;
    if(s->material){material_values(s->material,string,&mu,&EI,&loss,&EA);T=mu*sq(2*L*f)-EI*sq(3.141592653589793/L);}
    for(int j=0;j<s->count;j++){
        double k=(j+1)*3.141592653589793/L,Hz=f*(j+1)*sqrt(1+stiff*sq(.65/L)*sq(j+1));
        if(s->material)Hz=sqrt((T*k*k+EI*pow(k,4))/mu)/(2*3.141592653589793);
        double physical_omega=2*3.141592653589793*Hz;
        double band=Hz<s->sr*.30?1:Hz<s->sr*.35?(s->sr*.35-Hz)/(s->sr*.05):0;
        if(Hz>s->sr*.35)Hz=s->sr*.35;
        double om=2*s->sr*tan(3.141592653589793*Hz/s->sr);
        s->w2[j]=om*om;s->k2[j]=k*k;
        s->sigma[j]=1.3+.000012*Hz*Hz+damping;
        if(s->material)s->sigma[j]=1.4+loss*EI*pow(k,4)/(2*mu*physical_omega)+damping+s->body_loss[j];
        s->rad[j]=T*k*(j%2?1:-1)*exp(-Hz/9000)*band;
    }
    /* Moving boundaries do work; re-anchor the auxiliary potential without
     * clearing displacement or velocity. This is an approximation to contact. */
    double S=0;for(int j=0;j<s->count;j++)S+=s->k2[j]*sq(s->q[j]);
    s->r=sqrt(.25*s->kappa*S*S+s->c0);
}
void pf_pluck_material(pf_pluck *s,double sr,double midi,double velocity,int string,double position,int material)
{
    pf_pluck_string(s,sr,midi,velocity,string,position);s->material=material==2?2:1;s->pitch_ready=0;
    double mu,EI,loss,EA;material_values(s->material,string,&mu,&EI,&loss,&EA);
    s->kappa=EA/(4*mu);pf_pluck_pitch(s,midi,string,0);
}
void pf_pluck_string(pf_pluck *s,double sr,double midi,double velocity,int string,double position)
{
    if(string<1)string=1;if(string>6)string=6;
    if(position<.04)position=.04;if(position>.45)position=.45;
    memset(s,0,sizeof *s);s->sr=sr;s->h=1/sr;s->count=PF_PLUCK_MODES;
    s->kappa=2800/(4*masses[string-1]);s->c0=1e-12;s->release=1;
    double a=.0015*pow(velocity,1.25);
    for(int j=0;j<s->count;j++)s->q[j]=2*a*sin((j+1)*3.141592653589793*position)/(sq(3.141592653589793*(j+1))*position*(1-position));
    pf_pluck_pitch(s,midi,string,0);
}
static double slope_energy(const pf_pluck *s){double z=0;for(int j=0;j<s->count;j++)z+=s->k2[j]*sq(s->q[j]);return z;}
double pf_pluck_energy(const pf_pluck *s){double e=0;for(int j=0;j<s->count;j++)e+=.5*(sq(s->v[j])+s->w2[j]*sq(s->q[j]));return e+s->r*s->r-s->c0;}
void pf_pluck_init(pf_pluck *s,double sr,double midi,double velocity,int nonlinear)
{
    memset(s,0,sizeof *s);s->sr=sr;s->h=1/sr;
    double f=440*pow(2,(midi-69)/12),L=.65,pi=3.141592653589793;
    /* Nylon-like string: fixed length, pitch-dependent tension. A triangular
     * initial displacement at 19% of the length excites measured-form modes. */
    double mu=.0012,EA=2800,T=mu*sq(2*L*f),a=.0032*pow(velocity,1.4),pos=.19;
    s->kappa=nonlinear?EA/(4*mu):0;s->c0=1e-12;s->release=1;
    for(int j=0;j<PF_PLUCK_MODES;j++){
        double n=j+1,k=n*pi/L,Hz=f*n*sqrt(1+2e-5*n*n);
        if(Hz>sr*.35)break;s->count=j+1;s->k2[j]=k*k;
        /* Trapezoidal frequency prewarp prevents audible high-mode flattening. */
        double om=2*sr*tan(pi*Hz/sr);s->w2[j]=om*om;
        s->sigma[j]=1.5+.000015*Hz*Hz;
        s->q[j]=2*a*sin(n*pi*pos)/(pi*pi*n*n*pos*(1-pos));
        s->rad[j]=T*k*(j%2?1:-1)*exp(-Hz/9500);
    }
    double S=slope_energy(s);s->r=sqrt(.25*s->kappa*S*S+s->c0);
}
void pf_pluck_release(pf_pluck *s){s->release=0;}
/* Finger lightly touching the sounding string at `position` (fraction of the speaking
 * length from either end) with normalized damping `rho` = 2R/(mu L) in 1/s, R the
 * finger's mechanical resistance; rho = 0 lifts it. Natural harmonics: modes with a
 * node under the finger ring on, the others are drained within milliseconds. */
void pf_pluck_touch(pf_pluck *s,double position,double rho)
{
    s->touch_rho=rho>0?rho:0;
    for(int j=0;j<PF_PLUCK_MODES;j++){s->touch[j]=sin((j+1)*3.141592653589793*position);s->touch_sigma[j]=0;}
}
/* A real fingertip touches a few millimetres of string, not a point. Its damping is
 * rho times the mode shape squared averaged over the contact; the point dashpot above
 * keeps the part a point would see (and the coupling between low modes), and the rest
 * goes on the diagonal: per mode, rho/2 * [mean over the width of sin^2 - sin^2 at the
 * centre] = rho/4 * cos(2 pi k x0) * (1 - sinc(pi k w)). It grows with k^2 w^2 for
 * modes with a node under the finger, so the harmonic's own upper partials and the
 * pluck's high-frequency transient drain, as on a real string; low partials do not
 * see the width. Exact for modes much longer or much shorter than the finger. */
void pf_pluck_touch_width(pf_pluck *s,double position,double rho,double width)
{
    pf_pluck_touch(s,position,rho);
    for(int j=0;j<PF_PLUCK_MODES&&width>0;j++){
        double x=3.141592653589793*(j+1)*width,d=.25*s->touch_rho*cos(2*3.141592653589793*(j+1)*position)*(1-sin(x)/x);
        s->touch_sigma[j]=d>0?d:0;
    }
}
/* Left-hand legato on a sounding string: the fretting point moves to `midi` with no
 * right-hand pluck. The bridge end stays put, so the vibration is re-expanded on the
 * new speaking length (x from the bridge; DST on a midpoint grid). Hammer-on (shorter
 * string): the finger drives the string onto the fret, so its end jumps by whatever it
 * held there plus the clearance `amount` (m); `contact` (s) is the fingertip's contact
 * time, which low-passes that jump. Pull-off (longer): the old segment is joined by a
 * still one, and the leaving finger plucks the string sideways by `amount` at its fret.
 * Designed approximation: no fret/finger collision, single polarization. */
void pf_pluck_legato(pf_pluck *s,double midi,int string,double amount,double contact)
{
    enum{N=512};
    const double pi=3.141592653589793;
    double u[N],w[N],q[PF_PLUCK_MODES]={0},v[PF_PLUCK_MODES]={0},slam[PF_PLUCK_MODES]={0},ue=0,ve=0;
    if(string<1)string=1;if(string>6)string=6;
    double base=440*pow(2,(opens[string-1]-69)/12),f0=440*pow(2,(midi-69)/12);
    double Lo=.65*base/(440*pow(2,(s->last_midi-69)/12)),Ln=.65*base/f0;
    if(Ln<Lo)for(int j=0;j<s->count;j++){double m=sin((j+1)*pi*Ln/Lo);ue+=s->q[j]*m;ve+=s->v[j]*m;}
    for(int i=0;i<N;i++){
        double x=(i+.5)*Ln/N;u[i]=w[i]=0;
        if(x<Lo)for(int j=0;j<s->count;j++){double m=sin((j+1)*pi*x/Lo);u[i]+=s->q[j]*m;w[i]+=s->v[j]*m;}
        if(Ln>Lo)u[i]+=amount*(x<Lo?x/Lo:(Ln-x)/(Ln-Lo));
        u[i]-=ue*x/Ln;w[i]-=ve*x/Ln;   /* smooth part: zero at the new fret */
    }
    for(int k=0;k<s->count;k++){
        for(int i=0;i<N;i++){double m=sin((k+1)*pi*(i+.5)/N);q[k]+=2*u[i]*m/N;v[k]+=2*w[i]*m/N;}
        if(Ln<Lo){double g=exp(-.5*sq(pi*(k+1)*f0*contact)),r=2*(k&1?-1:1)/((k+1)*pi);
            q[k]+=ue*r*g;v[k]+=ve*r*g;slam[k]=amount*r*g;}
    }
    for(int k=0;k<s->count;k++){s->q[k]=q[k];s->v[k]=v[k];}
    s->release=1;s->pitch_ready=0;pf_pluck_pitch(s,midi,string,0);
    if(Ln<Lo){
        /* The slam drives the string toward the fretboard, roughly orthogonal to the
         * carried (plucked) motion. One polarization cannot hold both, and adding them
         * in-plane cancels or doubles by chance (7-13 dB here), so scale the slam so
         * their energies add as two orthogonal polarizations would. */
        double X=0,S=0,c;
        for(int k=0;k<s->count;k++){X+=s->w2[k]*q[k]*slam[k];S+=s->w2[k]*slam[k]*slam[k];}
        c=S>0?(sqrt(X*X+S*S)-X)/S:0;
        for(int k=0;k<s->count;k++)s->q[k]+=c*slam[k];
        s->pitch_ready=0;pf_pluck_pitch(s,midi,string,0);
    }
}
void pf_pluck_process(pf_pluck *s,float *out,int frames)
{
    const double h=s->h;
    for(int i=0;i<frames;i++){
        double S=0,qstar[PF_PLUCK_MODES],b[PF_PLUCK_MODES],dinv[PF_PLUCK_MODES],z[PF_PLUCK_MODES];
        for(int j=0;j<s->count;j++){qstar[j]=s->q[j]+.5*h*s->v[j];S+=s->k2[j]*sq(qstar[j]);}
        double rstar=sqrt(.25*s->kappa*S*S+s->c0),bz=0,bb=0;
        for(int j=0;j<s->count;j++){
            b[j]=s->kappa*S*s->k2[j]*qstar[j]/rstar;
            double sigma=s->sigma[j]+(s->release?0:65)+(s->touch_rho>0?s->touch_sigma[j]:0);
            dinv[j]=1/(2/(h*h)+2*sigma/h+.5*s->w2[j]);
            z[j]=dinv[j]*(2*s->v[j]/h-s->w2[j]*s->q[j]-b[j]*s->r);
            bz+=b[j]*z[j];bb+=b[j]*b[j]*dinv[j];
        }
        double corr,bd=0,y=0,yb[PF_PLUCK_MODES];
        if(s->touch_rho>0){
            /* A finger lightly touching the string (harmonics): a point dashpot at the
             * touch point, coupling every mode through its shape there. Solved
             * implicitly together with the SAV term (Sherman-Morrison, rank one each). */
            const double *g=s->touch;double a=s->touch_rho/h,gz=0,gy=0,gg=0;
            for(int j=0;j<s->count;j++){gz+=g[j]*z[j];gy+=g[j]*dinv[j]*b[j];gg+=g[j]*g[j]*dinv[j];}
            double k=a/(1+a*gg);bz=bb=0;
            for(int j=0;j<s->count;j++){double dg=dinv[j]*g[j];z[j]-=k*dg*gz;yb[j]=dinv[j]*b[j]-k*dg*gy;bz+=b[j]*z[j];bb+=b[j]*yb[j];}
        }else for(int j=0;j<s->count;j++)yb[j]=dinv[j]*b[j];
        corr=.25*bz/(1+.25*bb);
        for(int j=0;j<s->count;j++){
            double d=z[j]-yb[j]*corr;
            s->q[j]+=d;s->v[j]=2*d/h-s->v[j];bd+=b[j]*d;y+=s->rad[j]*s->q[j];
        }
        s->r+=.5*bd;
        out[i]+=(float)(y*.045);
    }
}
