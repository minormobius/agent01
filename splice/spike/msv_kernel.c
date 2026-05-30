/* msv_kernel.c — viability spike for porting HMMER's SIMD core to WebAssembly.
 *
 * Contains a faithful extract of HMMER3's p7_MSVFilter inner loop
 * (src/impl_sse/msvfilter.c) — the hottest, most SIMD-dense kernel in the
 * codebase. The *exact* intrinsic sequence is preserved; only the I/O,
 * profile-loading, and debug plumbing are dropped (that plumbing is plain C
 * that emscripten/wasi handle routinely — it is not the portability risk).
 *
 * Two builds from this one source:
 *   native : real <emmintrin.h> SSE2 on x86-64.
 *   wasm   : SIMDe maps the same _mm_* intrinsics onto WASM SIMD128.
 *
 * Both run the identical deterministic workload and emit a checksum over the
 * MSV scores of N pseudo-random profiles/sequences. Bit-identical checksums =>
 * the hardest code in HMMER survives the trip to WASM. Mismatch => it doesn't.
 */

#ifdef WASM_BUILD
  #define SIMDE_ENABLE_NATIVE_ALIASES
  #include "simde/x86/sse2.h"
#else
  #include <emmintrin.h>
#endif

#include <stdint.h>

/* ---- fixed workload parameters (identical across both builds) ---- */
#define K        20          /* alphabet size (protein)                */
#define MAXM     256         /* max model length                       */
#define MAXQ     ((MAXM-1)/16 + 1)
#define ESL_MAX(a,b) ((a)>(b)?(a):(b))
#define p7O_NQB(M)   ( ESL_MAX(2, ((((M)-1) / 16) + 1)) )

/* striped match-emission score vectors: rbv[residue][q], 16 bytes each */
static uint8_t rbv_store[K][MAXQ][16];
static __m128i dp[MAXQ];
static uint8_t dsq[4096];

/* deterministic PRNG (xorshift32) — identical sequence on every platform */
static uint32_t rng;
static inline uint32_t xr(void){ rng^=rng<<13; rng^=rng>>17; rng^=rng<<5; return rng; }

/* The MSV kernel: faithful to p7_MSVFilter's inner loop. Returns raw xJ
 * (the integer accumulator), or -1 on the overflow/saturation branch. */
static int msv_kernel(int L, int M,
                      uint8_t base_b, uint8_t bias_b,
                      uint8_t tjb_b, uint8_t tbm_b, uint8_t tec_b)
{
  int Q = p7O_NQB(M);
  __m128i mpv, xEv, xBv, sv, biasv, xJv, tjbmv, tecv, basev, ceilingv, tempv;
  __m128i *rsc;
  int i, q, cmp;
  uint8_t xJ;

  biasv = _mm_set1_epi8((int8_t) bias_b);
  for (q = 0; q < Q; q++) dp[q] = _mm_setzero_si128();

  ceilingv = _mm_cmpeq_epi8(biasv, biasv);
  basev    = _mm_set1_epi8((int8_t) base_b);
  tjbmv    = _mm_set1_epi8((int8_t)(tjb_b + tbm_b));
  tecv     = _mm_set1_epi8((int8_t) tec_b);

  xJv = _mm_subs_epu8(biasv, biasv);
  xBv = _mm_subs_epu8(basev, tjbmv);

  for (i = 1; i <= L; i++)
  {
    rsc = (__m128i *) rbv_store[dsq[i]];
    xEv = _mm_setzero_si128();
    mpv = _mm_slli_si128(dp[Q-1], 1);

    for (q = 0; q < Q; q++)
    {
      sv   = _mm_max_epu8(mpv, xBv);
      sv   = _mm_adds_epu8(sv, biasv);
      sv   = _mm_subs_epu8(sv, rsc[q]);
      xEv  = _mm_max_epu8(xEv, sv);
      mpv   = dp[q];
      dp[q] = sv;
    }

    tempv = _mm_adds_epu8(xEv, biasv);
    tempv = _mm_cmpeq_epi8(tempv, ceilingv);
    cmp   = _mm_movemask_epi8(tempv);

    tempv = _mm_shuffle_epi32(xEv, _MM_SHUFFLE(2, 3, 0, 1));
    xEv   = _mm_max_epu8(xEv, tempv);
    tempv = _mm_shuffle_epi32(xEv, _MM_SHUFFLE(0, 1, 2, 3));
    xEv   = _mm_max_epu8(xEv, tempv);
    tempv = _mm_shufflelo_epi16(xEv, _MM_SHUFFLE(2, 3, 0, 1));
    xEv   = _mm_max_epu8(xEv, tempv);
    tempv = _mm_srli_si128(xEv, 1);
    xEv   = _mm_max_epu8(xEv, tempv);
    xEv   = _mm_shuffle_epi32(xEv, _MM_SHUFFLE(0, 0, 0, 0));

    if (cmp != 0x0000) return -1;   /* overflow branch */

    xEv = _mm_subs_epu8(xEv, tecv);
    xJv = _mm_max_epu8(xJv, xEv);
    xBv = _mm_max_epu8(basev, xJv);
    xBv = _mm_subs_epu8(xBv, tjbmv);
  }

  xJ = (uint8_t) _mm_extract_epi16(xJv, 0);
  return (int) xJ;
}

/* Build a deterministic pseudo-random profile + sequence, run the kernel.
 * Ranges are chosen so the uint8 arithmetic stays below the saturation
 * ceiling (we want numeric scores, not the overflow branch, to compare). */
static int one_trial(uint32_t seed, int M, int L)
{
  int x, q, b;
  rng = seed;
  for (x = 0; x < K; x++)
    for (q = 0; q < MAXQ; q++)
      for (b = 0; b < 16; b++)
        rbv_store[x][q][b] = (uint8_t)(xr() % 24);      /* emission cost 0..23 */
  for (int i = 0; i <= L; i++) dsq[i] = (uint8_t)(xr() % K);
  return msv_kernel(L, M, /*base*/120, /*bias*/12, /*tjb*/3, /*tbm*/5, /*tec*/3);
}

/* Run N trials across a spread of model/sequence sizes; fold results into a
 * 32-bit checksum. Returned to the harness for exact cross-platform compare. */
int compute(void)
{
  uint32_t sum = 2166136261u;     /* FNV-ish accumulator */
  for (int t = 0; t < 256; t++)
  {
    int M = 16 + (t * 7) % (MAXM - 16);    /* spread 16..255, hits all Q */
    int L = 50 + (t * 37) % 1024;          /* spread 50..1073            */
    int r = one_trial(0x9E3779B9u ^ (uint32_t)(t * 2654435761u), M, L);
    sum = (sum ^ (uint32_t)(r + 1)) * 16777619u;
  }
  return (int) sum;
}

#ifndef WASM_BUILD
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
int main(int argc, char **argv)
{
  if (argc > 1) {                       /* bench mode: ./msv_native <iters> */
    int n = atoi(argv[1]), acc = 0;
    struct timespec a, b;
    clock_gettime(CLOCK_MONOTONIC, &a);
    for (int i = 0; i < n; i++) acc ^= compute();
    clock_gettime(CLOCK_MONOTONIC, &b);
    double ms = (b.tv_sec-a.tv_sec)*1e3 + (b.tv_nsec-a.tv_nsec)/1e6;
    fprintf(stderr, "native: %d iters in %.1f ms = %.3f ms/iter (acc=%d)\n",
            n, ms, ms/n, acc);
    return 0;
  }
  printf("%d\n", compute());
  return 0;
}
#endif
