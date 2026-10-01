/* pf_guitar.c - the classical guitar instrument (see pf_guitar.h). */
#include "pf_guitar.h"
#include <math.h>
#include <string.h>

static const signed char STANDARD[6]={64,59,55,50,45,40};

static const pf_param_info PARAMS[PF_GUITAR_NPARAM]={
    {"Output gain","dB","Output",-60,60,0,0},
    {"Treble strings","1 nylon, 2 carbon","Strings",1,2,1,1},
    {"Pluck position","fraction of the vibrating length","Right hand",.04,.45,.19,0},
    {"Hand stays put","1 = pluck point fixed on the string (high notes rounder)","Right hand",0,1,0,1},
    {"Let strings ring","1 = until a hand would stop them; 0 = at each note's end","Left hand",0,1,1,1},
    {"Velocity headroom","x MIDI 127","Right hand",1,4,4,0},
    {"Slur contact time","ms","Left hand",.1,3,.5,0},
    {"Hammer-on clearance","mm","Left hand",0,3,.7,0},
    {"Pull-off distance","mm","Left hand",0,3,.6,0},
    {"Harmonic touch width","mm","Harmonics",0,60,29.25,0},
    {"Harmonic touch damping","1/s","Harmonics",0,2000,424,0},
    {"Harmonic touch time","ms","Harmonics",5,300,60,0},
    {"Harmonic touch offset","mm from the node","Harmonics",0,8,2,0},
    {"Harmonic pluck position","fraction","Harmonics",.04,.45,.12,0},
    {"Palm-mute damping","1/s","Right hand",0,200,25,0},
};

static double hz(double m){return 440*pow(2,(m-69)/12);}
static int iabs(int x){return x<0?-x:x;}

/* ---------- string choice when the score gives none ---------- */
/* Notes starting within 30 ms form a group; each group's candidate assignments use
 * distinct strings and frets 0..19, scored on hand span and position; a Viterbi pass
 * over groups penalises hand movement and cutting off a string that is still sounding. */
#define K 32
typedef struct { signed char s[6]; float cost, pos; } cand;
static void assign(pf_guitar *g)
{
    const pf_note *N=g->score->notes;int n=g->n,need=0;
    for(int i=0;i<n;i++){
        if(N[i].string>=1&&N[i].string<=6){g->string[i]=N[i].string;
            int base=N[i].articulation==PF_ART_HARMONIC?g->tuning[N[i].string-1]:(int)lrintf(N[i].pitch);
            g->fret[i]=N[i].fret>=0?N[i].fret:(signed char)(base-g->tuning[N[i].string-1]);}
        else{g->string[i]=-1;need=1;}
    }
    if(!need)return;
    /* group starts */
    static int gs[PF_GUITAR_MAX_NOTES+1];int G=0;
    for(int i=0;i<n;i++)if(i==0||N[i].start-N[gs[G-1]].start>.03)gs[G++]=i;
    gs[G]=n;
    static cand C[PF_GUITAR_MAX_NOTES][K];static int nc[PF_GUITAR_MAX_NOTES];static short back[PF_GUITAR_MAX_NOTES][K];static float acc[2][K];
    for(int k=0;k<G;k++){
        int a=gs[k],b=gs[k+1],m=b-a;if(m>6)m=6;
        cand best[K];int nb=0;
        /* depth-first over this group's notes */
        int choice[6]={0},used=0;signed char cur[6];
        int idx=0;cur[0]=0;
        for(;;){
            if(idx==m){
                int lo=99,hi=0,open=0;
                for(int q=0;q<m;q++){int f=(int)lrintf(N[a+q].pitch)-g->tuning[cur[q]-1];if(f>0){if(f<lo)lo=f;if(f>hi)hi=f;}else open++;}
                float cost=lo==99?0:(hi-lo>4?20.f*(hi-lo-4):0)+.15f*lo+(hi>12?.3f*(hi-12):0);
                cost-=.05f*open;
                if(nb<K||cost<best[nb-1].cost){
                    int at=nb<K?nb++:K-1;while(at>0&&best[at-1].cost>cost){best[at]=best[at-1];at--;}
                    for(int q=0;q<6;q++)best[at].s[q]=q<m?cur[q]:0;best[at].cost=cost;best[at].pos=lo==99?-1:lo;
                }
                idx--;if(idx<0)break;used&=~(1<<(cur[idx]-1));
            }
            /* next candidate string for note idx */
            int s=cur[idx]+1,p=(int)lrintf(N[a+idx].pitch);
            while(s<=6&&((used>>(s-1))&1||p-g->tuning[s-1]<0||p-g->tuning[s-1]>19))s++;
            if(s>6){cur[idx]=0;idx--;if(idx<0)break;used&=~(1<<(cur[idx]-1));continue;}
            cur[idx]=(signed char)s;used|=1<<(s-1);idx++;if(idx<m)cur[idx]=0;
        }
        (void)choice;
        if(nb==0){best[0].cost=1e9f;best[0].pos=-1;for(int q=0;q<6;q++)best[0].s[q]=q<m?(signed char)(q+1):0;nb=1;}
        memcpy(C[k],best,sizeof(cand)*nb);nc[k]=nb;
    }
    /* Viterbi */
    for(int j=0;j<nc[0];j++)acc[0][j]=C[0][j].cost;
    for(int k=1;k<G;k++){
        float *pa=acc[(k-1)&1],*na=acc[k&1];
        for(int j=0;j<nc[k];j++){
            float bestv=1e30f;int bj=0;
            for(int i=0;i<nc[k-1];i++){
                float c=pa[i];cand *A=&C[k-1][i],*B=&C[k][j];
                if(A->pos>=0&&B->pos>=0)c+=.6f*fabsf(A->pos-B->pos);
                int a0=gs[k-1],m0=gs[k]-a0;if(m0>6)m0=6;int a1=gs[k],m1=gs[k+1]-a1;if(m1>6)m1=6;
                for(int q=0;q<m1;q++)for(int r=0;r<m0;r++)if(B->s[q]==A->s[r]&&N[a0+r].end>N[a1].start+.02)c+=3;
                if(c<bestv){bestv=c;bj=i;}
            }
            na[j]=bestv+C[k][j].cost;back[k][j]=(short)bj;
        }
    }
    int j=0;float *last=acc[(G-1)&1];for(int i=1;i<nc[G-1];i++)if(last[i]<last[j])j=i;
    for(int k=G-1;k>=0;k--){
        int a=gs[k],m=gs[k+1]-a;
        for(int q=0;q<m;q++)if(g->string[a+q]<0){int s=q<6?C[k][j].s[q]:1;g->string[a+q]=(signed char)s;g->fret[a+q]=(signed char)((int)lrintf(N[a+q].pitch)-g->tuning[s-1]);}
        if(k>0)j=back[k][j];
    }
}
#undef K

/* ---------- strings ring until a hand would stop them (tools/guitar_sustain.py) ---------- */
static void let_ring(pf_guitar *g)
{
    const pf_note *N=g->score->notes;int n=g->n;double duration=g->score->duration;
    for(int k=0;k<n;k++){
        double written=N[k].end,stop=duration;int harmonic=N[k].articulation==PF_ART_HARMONIC;
        for(int j=k+1;j<n;j++){
            if(N[j].start-N[k].start<1e-4)continue;
            if(N[j].start>=stop)break;
            if(g->string[j]==g->string[k]){stop=N[j].start;break;}
            int fretted=g->fret[k]>0&&!harmonic,mf=g->fret[j]>0&&N[j].articulation!=PF_ART_HARMONIC;
            if(fretted&&mf){
                int fn=N[k].finger,fm=N[j].finger,out;
                if(fn>=1&&fn<=4&&fn==fm&&(g->fret[j]!=g->fret[k]||g->string[j]!=g->string[k])){stop=N[j].start;break;}
                if(fn>=1&&fn<=4){int p=g->fret[k]-fn+1;out=!(p-1<=g->fret[j]&&g->fret[j]<=p+4);}
                else out=iabs(g->fret[j]-g->fret[k])>=4;
                if(out){stop=N[j].start;break;}
            }
            if(N[j].start>=written){
                int pc=iabs((int)lrintf(N[j].pitch)-(int)lrintf(N[k].pitch))%12;
                if(pc==1||pc==11||(g->string[k]>=4&&(pc==2||pc==10))){stop=N[j].start;break;}
            }
        }
        g->end[k]=written>stop?written:stop;
    }
}

/* ---------- events ---------- */
static int ev_cmp(const pf_guitar_event *a,const pf_guitar_event *b)
{
    if(a->frame!=b->frame)return a->frame<b->frame?-1:1;
    if(a->kind!=b->kind)return a->kind-b->kind;
    return a->note-b->note;
}
static void sort_events(pf_guitar_event *e,int n)      /* insertion sort on nearly sorted input */
{
    for(int i=1;i<n;i++){pf_guitar_event x=e[i];int j=i-1;while(j>=0&&ev_cmp(&e[j],&x)>0){e[j+1]=e[j];j--;}e[j+1]=x;}
}
static long frame_of(const pf_guitar *g,double t){return lrint(t*g->sr);}

static size_t gsize(void){return sizeof(pf_guitar);}
static void ginit(void *self,double sr)
{
    pf_guitar *g=self;memset(g,0,sizeof *g);g->sr=sr;
    for(int i=0;i<PF_GUITAR_NPARAM;i++)g->p[i]=PARAMS[i].def;
    for(int s=0;s<6;s++){g->owner[s]=-1;g->tuning[s]=STANDARD[s];}
}
static int gpcount(void){return PF_GUITAR_NPARAM;}
static const pf_param_info *gpinfo(int i){return i>=0&&i<PF_GUITAR_NPARAM?&PARAMS[i]:0;}
static double gget(const void *self,int i){const pf_guitar *g=self;return i>=0&&i<PF_GUITAR_NPARAM?g->p[i]:0;}
static void gset(void *self,int i,double v)
{
    pf_guitar *g=self;if(i<0||i>=PF_GUITAR_NPARAM)return;
    if(v<PARAMS[i].min)v=PARAMS[i].min;if(v>PARAMS[i].max)v=PARAMS[i].max;
    if(PARAMS[i].integer)v=floor(v+.5);
    g->p[i]=v;
}
static void reset_strings(pf_guitar *g)
{
    for(int s=0;s<6;s++){g->owner[s]=-1;memset(&g->str[s],0,sizeof g->str[s]);}
    g->n_order=0;
}
static int gload(void *self,const pf_score *sc)
{
    pf_guitar *g=self;g->score=sc;g->n=sc->n_notes;
    if(g->n>PF_GUITAR_MAX_NOTES)return 1;
    for(int s=0;s<6;s++)g->tuning[s]=sc->tuning&&sc->n_strings>s?sc->tuning[s]:STANDARD[s];
    assign(g);
    if(g->p[PF_GUITAR_RING]>.5)let_ring(g);else for(int i=0;i<g->n;i++)g->end[i]=sc->notes[i].end;
    int e=0;
    for(int i=0;i<g->n;i++){
        const pf_note *N=&sc->notes[i];
        g->ev[e++]=(pf_guitar_event){frame_of(g,N->start),1,i};
        g->ev[e++]=(pf_guitar_event){frame_of(g,g->end[i]),0,i};
        if(N->articulation==PF_ART_HARMONIC)g->ev[e++]=(pf_guitar_event){frame_of(g,N->start+g->p[PF_GUITAR_HARM_TIME]/1000),2,i};
    }
    g->nev=e;sort_events(g->ev,e);
    g->total=lrint(sc->duration*g->sr);g->pos=0;g->cursor=0;reset_strings(g);
    return 0;
}
static void gseek(void *self,double t)
{
    pf_guitar *g=self;long f=frame_of(g,t);if(f<0)f=0;
    reset_strings(g);g->pos=f;g->cursor=0;
    while(g->cursor<g->nev&&g->ev[g->cursor].frame<f)g->cursor++;
}
static int connected_art(int a){return a==PF_ART_HAMMER_ON||a==PF_ART_PULL_OFF||a==PF_ART_SLIDE||a==PF_ART_TIE;}

static double note_pitch(const pf_guitar *g,int i,double t)
{
    const pf_note *N=&g->score->notes[i];
    int s=g->string[i];
    double pitch=N->articulation==PF_ART_HARMONIC?g->tuning[s-1]:N->pitch;
    double length=g->end[i]-N->start,phase=length>0?(t-N->start)/length:1;
    if(phase<0)phase=0;if(phase>1)phase=1;
    if(N->bend_count>0&&g->score->bends){
        const pf_bend_point *B=g->score->bends+N->bend_first;int m=N->bend_count;double x=t-N->start,y;
        if(x<=B[0].t)y=B[0].semitones;else if(x>=B[m-1].t)y=B[m-1].semitones;
        else{int k=1;while(B[k].t<x)k++;y=B[k-1].semitones+(B[k].semitones-B[k-1].semitones)*(x-B[k-1].t)/(B[k].t-B[k-1].t);}
        pitch+=y;
    }
    if(N->slide_to>0&&phase>.72){
        double amount=(phase-.72)/.28,delta=N->slide_to-N->pitch,step=floor(fabs(delta)*amount+.5);
        if(step>fabs(delta))step=fabs(delta);
        pitch=N->pitch+(delta>0?step:delta<0?-step:0);
    }
    return pitch;
}

static void apply_event(pf_guitar *g,const pf_guitar_event *e)
{
    const pf_note *N=&g->score->notes[e->note];int i=e->note,s=g->string[i];
    if(s<1||s>6)return;
    pf_pluck *st=&g->str[s-1];
    if(e->kind==2){if(g->owner[s-1]==i)pf_pluck_touch(st,0,0);return;}
    if(e->kind==1){
        int used=0;for(int k=0;k<g->n_order;k++)if(g->order[k]==s)used=1;
        int art=N->articulation;
        if(!(connected_art(art)&&used)){
            int harmonic=art==PF_ART_HARMONIC;
            double open=g->tuning[s-1],midi=harmonic?open:N->pitch,vel=N->velocity/127.;
            if(vel>g->p[PF_GUITAR_HEADROOM])vel=g->p[PF_GUITAR_HEADROOM];
            double pos=harmonic?g->p[PF_GUITAR_HARM_PLUCK]:g->p[PF_GUITAR_PLUCK];
            if(!harmonic&&g->p[PF_GUITAR_HAND_FIXED]>.5){pos*=pow(2,g->fret[i]/12.);if(pos>.45)pos=.45;}
            pf_pluck_material(st,g->sr,midi,vel,s,pos,(int)g->p[PF_GUITAR_TREBLES]);
            if(harmonic){
                int fret=N->art_param>0?(int)lrintf(N->art_param):12;
                int node=fret==12?2:fret==7?3:fret==5?4:fret==4?5:(int)lrint(1/(1-pow(2,-fret/12.)));
                double length=.65*hz(STANDARD[s-1])/hz(open);
                double position=1./node+g->p[PF_GUITAR_HARM_OFFSET]*1e-3/length,width=g->p[PF_GUITAR_HARM_WIDTH]/650.;
                if(width>0)pf_pluck_touch_width(st,position,g->p[PF_GUITAR_HARM_RHO],width);
                else pf_pluck_touch(st,position,g->p[PF_GUITAR_HARM_RHO]);
            }
        }else if(art==PF_ART_HAMMER_ON||art==PF_ART_PULL_OFF){
            double amount=N->art_param>0?N->art_param:(art==PF_ART_HAMMER_ON?g->p[PF_GUITAR_HAMMER_MM]:g->p[PF_GUITAR_PULL_MM])/1000;
            pf_pluck_legato(st,N->pitch,s,amount,g->p[PF_GUITAR_SLUR_CONTACT]/1000);
        }
        if(!used)g->order[g->n_order++]=s;
        g->owner[s-1]=i;return;
    }
    if(g->owner[s-1]!=i)return;
    /* A slurred or tied successor at this frame keeps the string fretted, as does a slur
     * that starts within 150 ms of this note's end (aligned MIDI may leave a gap). */
    for(int k=g->cursor;k<g->nev&&g->ev[k].frame==e->frame;k++){
        const pf_guitar_event *x=&g->ev[k];
        if(x->kind==1&&g->string[x->note]==s){if(g->score->notes[x->note].articulation!=PF_ART_NORMAL&&g->score->notes[x->note].articulation!=PF_ART_HARMONIC&&g->score->notes[x->note].articulation!=PF_ART_MUTED)return;break;}
    }
    for(int k=i+1;k<g->n;k++){
        const pf_note *M=&g->score->notes[k];double gap=M->start-g->end[i];
        if(g->string[k]==s&&(M->articulation==PF_ART_HAMMER_ON||M->articulation==PF_ART_PULL_OFF)&&gap>=0&&gap<.15)return;
    }
    pf_pluck_release(st);
}

static int grender(void *self,float *left,float *right,int frames)
{
    pf_guitar *g=self;int done=0;
    while(done<frames){
        long block_end=(g->pos/PF_GUITAR_BLOCK+1)*PF_GUITAR_BLOCK,stop=g->pos+(frames-done);
        if(block_end<stop)stop=block_end;
        /* events at this frame, then the segment up to the next event */
        int k=g->cursor;
        while(k<g->nev&&g->ev[k].frame<=g->pos){
            if(g->ev[k].frame==g->pos){int c=g->cursor;g->cursor=k;apply_event(g,&g->ev[k]);g->cursor=c;}
            k++;
        }
        g->cursor=k;
        if(g->cursor<g->nev&&g->ev[g->cursor].frame<stop)stop=g->ev[g->cursor].frame;
        int len=(int)(stop-g->pos);
        float *m=g->mono;memset(m,0,sizeof(float)*(size_t)len);
        double t=g->pos/g->sr;
        for(int q=0;q<g->n_order;q++){
            int s=g->order[q],i=g->owner[s-1];if(i<0)continue;
            const pf_note *N=&g->score->notes[i];
            pf_pluck_pitch(&g->str[s-1],note_pitch(g,i,t),s,N->articulation==PF_ART_MUTED?g->p[PF_GUITAR_MUTE_DAMP]:0);
            pf_pluck_process(&g->str[s-1],m,len);
        }
        float gain=g->p[PF_GUITAR_GAIN_DB]==0?1.f:(float)pow(10,g->p[PF_GUITAR_GAIN_DB]/20);
        for(int q=0;q<len;q++){float y=m[q]*gain;left[done+q]=y;if(right)right[done+q]=y;}
        done+=len;g->pos+=len;
    }
    int active=0;for(int s=0;s<6;s++)if(g->owner[s]>=0)active++;
    return active;
}
static double gtime(const void *self){const pf_guitar *g=self;return g->pos/g->sr;}
static int gsounding(const void *self,pf_sounding *out,int max)
{
    const pf_guitar *g=self;int c=0;
    for(int s=0;s<6&&c<max;s++){
        int i=g->owner[s];if(i<0)continue;
        double e=pf_pluck_energy(&g->str[s]);if(!(e>1e-12))continue;
        double level=sqrt(e)*30;if(level>1)level=1;
        out[c++]=(pf_sounding){i,(float)note_pitch(g,i,g->pos/g->sr),(float)level,(signed char)(s+1),g->fret[i]};
    }
    return c;
}

const pf_instrument pf_instrument_guitar={"guitar",gsize,ginit,gpcount,gpinfo,gget,gset,gload,gseek,grender,gtime,gsounding};
