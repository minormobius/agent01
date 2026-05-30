#include "oligotm.h"
#include <string.h>
/* thin wrapper: avoid returning the tm_ret struct across the wasm boundary */
double tm_of(const char* seq){
  tm_ret r = oligotm(seq, 50.0 /*dna nM*/, 50.0 /*salt mM*/, 1.5 /*divalent*/,
                     0.6 /*dNTP*/, 0.0 /*dmso*/, 0.6 /*dmso_fact*/, 0.0 /*formamide*/,
                     santalucia_auto, santalucia, -10.0 /*annealing*/);
  return r.Tm;
}
#ifdef WASM_BUILD
static char buf[1024];
char* tmbuf(void){ return buf; }
double tm_w(int len){ if(len<0||len>1023) return -1; buf[len]=0; return tm_of(buf); }
#else
#include <stdio.h>
int main(int argc, char**argv){
  const char* s = argc>1?argv[1]:"GTAAAACGACGGCCAGT";
  printf("%.4f\n", tm_of(s));
  return 0;
}
#endif
