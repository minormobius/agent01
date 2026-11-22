// lecture.js — what the lecturer says on each slide in autopilot, and what it does to the
// widget while it says it. One array per slide, in deck order.
//
//   say    what the formant voice speaks: words only, numbers spelled out, symbols named
//          ("pi of x", "one half"). Every word must be in narration.js's lexicon:
//          build-narration.mjs fails on a word the CMU dictionary lacks (add it to EXTRA there).
//   text   the subtitle, as a reader would write it (defaults to say)
//   drive  [inputId, from, to]: sweep a slider for as long as the line takes to say
//   click  a selector, pressed as the line starts
//   hover  [fx, fy]: put the chart's cursor at that fraction of the chart, as the line starts
//   wait   ms of silence after the line (a beat to think, after a question)
//
// Autopilot never marks a slide's task done and never answers a prediction for you.

export const LECTURE = [
  [ // 1 Count the primes
    { say: "Let's start by counting primes.", drive: ['kx', 10, 100] },
    { say: 'The staircase climbs one step at every prime, and there is no formula for where the next step is.', hover: [0.55, 0.5] },
    { say: 'Before I go on, guess how many primes there are below one hundred.', wait: 2500 },
    { say: 'Twenty five. A quarter of the numbers.', text: '25. A quarter of the numbers.' },
    { say: 'Now watch the steps spread out as we go to one thousand.', drive: ['kx', 100, 1000] },
    { say: 'One hundred and sixty eight. Ten times as far, and less than seven times as many primes.', text: '168. Ten times as far, and less than seven times as many primes.', hover: [0.92, 0.2] },
  ],
  [ // 2 Primes thin out like 1/log x
    { say: 'Gauss guessed that near x, about one number in log x is prime.', text: 'Gauss guessed that near x, about one number in log x is prime.' },
    { say: 'Add that up, and you get the logarithmic integral, l i of x, the orange curve.', text: 'Add that up, and you get the logarithmic integral, li(x), the orange curve.', drive: ['kx', 3, 4.5] },
    { say: 'Now slide out to a million.', drive: ['kx', 4.5, 6] },
    { say: 'The count and the guess differ by less than one part in five hundred. That they agree in the limit is the prime number theorem, proved in eighteen ninety six.', text: 'The count and the guess differ by less than one part in five hundred. That they agree in the limit is the prime number theorem, proved in 1896.', hover: [0.9, 0.2] },
  ],
  [ // 3 The error π(x) − li(x)
    { say: 'So how far off is the guess? The blue line is the error: the count, minus the guess.', text: 'So how far off is the guess? The blue line is the error: π(x) − li(x).' },
    { say: 'The green band is how far the error may wander if the Riemann hypothesis is true. About the square root of x, times log x.', text: 'The green band is how far the error may wander if the Riemann hypothesis is true: about √x · log x.', drive: ['kx', 4, 6] },
    { say: 'Here the guess is always too high. Littlewood proved that this flips, infinitely often, though nobody has ever seen it happen.' },
  ],
  [ // 4 Euler's product
    { say: 'Now the primes go into an equation.' },
    { say: 'Add one over n squared for every whole number, or multiply one factor for every prime. Both reach pi squared over six.', text: 'Add 1/n² for every whole number, or multiply one factor for every prime. Both reach π²/6.', drive: ['kn', 2, 200] },
    { say: 'The product, in blue, gets there faster, because every number is built from primes in exactly one way.', hover: [0.5, 0.3] },
  ],
  [ // 5 ζ in the complex plane
    { say: 'Riemann let the input be a complex number.' },
    { say: 'On this map, orange curves are where the real part of zeta is zero, and blue curves are where the imaginary part is zero.', text: 'On this map, orange curves are where Re ζ = 0, and blue curves are where Im ζ = 0.' },
    { say: 'Where they cross, zeta is zero. The first crossing is at one half, plus fourteen point one three i.', text: 'Where they cross, ζ is zero. The first crossing is at ½ + 14.13i.', hover: [0.5, 0.596] },
    { say: 'Every crossing on this map sits on the same line.', hover: [0.5, 0.283] },
  ],
  [ // 6 The trivial zeros
    { say: 'Zeta is also zero at minus two, minus four, minus six, and so on.', text: 'ζ is also zero at −2, −4, −6, and so on.', drive: ['ks', -1, -12] },
    { say: 'These are the trivial zeros. They come from a sine in the functional equation, and the Riemann hypothesis is about all the others.' },
  ],
  [ // 7 Every computed zero is on Re s = ½
    { say: 'Here is the hypothesis. Every zero that is not trivial has real part exactly one half.', text: 'Here is the hypothesis. Every zero that is not trivial has real part exactly ½.' },
    { say: 'Each dot is a zero your browser found. Let us raise the height to one thousand.', text: 'Each dot is a zero your browser found. Let us raise the height to 1000.', drive: ['kt', 60, 1000] },
    { say: 'Six hundred and forty nine zeros, all on the line. Computers have checked trillions more, and none has ever been off it.', text: '649 zeros, all on the line. Computers have checked trillions more, and none has ever been off it.' },
  ],
  [ // 8 Hunt a zero by hand
    { say: "On the line, zeta can be turned into a real function, Hardy's Z.", text: "On the line, ζ can be turned into a real function, Hardy's Z." },
    { say: 'Where Z changes sign, there is a zero, exactly on the line. Let us hunt the first one.', drive: ['kt', 12, 14] },
    { say: 'Closer.', drive: ['kt', 14, 14.135] },
    { say: 'Fourteen point one three five. Riemann found this one by hand.', text: '14.135. Riemann found this one by hand.' },
  ],
  [ // 9 Counting zeros up to height T
    { say: 'How do we know none are off the line? We count them.' },
    { say: 'A formula predicts how many zeros the whole strip holds up to a height. If the sign changes on the line add up to the same number, none can be anywhere else.', drive: ['kt', 100, 1000] },
    { say: 'The staircase of zeros hugs the predicted curve. Turing made this into a proof, in nineteen fifty three.', text: 'The staircase of zeros hugs the predicted curve. Turing made this into a proof, in 1953.' },
  ],
  [ // 10 Zeros repel
    { say: 'The gaps between zeros are not random.' },
    { say: 'If they were, small gaps would be the most common, like the dashed curve.', click: '#bP' },
    { say: 'Instead the zeros push each other apart, exactly like the energy levels of heavy atoms, or the eigenvalues of a random matrix.', click: '#bG' },
    { say: 'Nobody knows why.' },
  ],
  [ // 11 Rebuilding ψ(x) from the zeros
    { say: 'Now the payoff. Each zero adds one wave. Start with a straight line, and add the waves one by one.', click: '#play' },
    { say: 'The corners of the staircase appear at exactly the primes.', wait: 1500 },
    { say: 'These waves know where the primes are, and they were made without using a single prime.' },
  ],
  [ // 12 The effect of one zero off the line
    { say: 'Here is what one zero off the line would do. A zero at real part beta adds a wave that grows like x to the beta.', text: 'Here is what one zero off the line would do. A zero at real part β adds a wave that grows like x^β.', drive: ['kb', 0.75, 0.9] },
    { say: 'Move it back toward one half, and its effect is pushed out past ten to the hundred.', text: 'Move it back toward ½, and its effect is pushed out past 10¹⁰⁰.', drive: ['kb', 0.9, 0.52] },
    { say: 'That is why checking zeros by computer can never settle the question.' },
  ],
  [ // 13 Zero-free half-planes compared
    { say: 'Each step toward one half shrinks the error in counting primes.', text: 'Each step toward ½ shrinks the error in counting primes.' },
    { say: 'Knowing there are no zeros on the line real part one gave the prime number theorem.', text: 'Knowing there are no zeros on Re s = 1 gave the prime number theorem.', click: '[data-s="1"]' },
    { say: 'A claim from September pushes the zero free region to seven eighths. It is not yet confirmed.', text: 'A claim from September 2026 pushes the zero-free region to 7/8. It is not yet confirmed.', click: '[data-s="0.875"]' },
    { say: 'The Riemann hypothesis would bring the error down to about the square root.', click: '[data-s="0.5"]' },
  ],
  [ // 14 RH for elliptic curves mod p
    { say: 'There is a world where the Riemann hypothesis is a theorem.' },
    { say: 'Take an equation like y squared equals x cubed plus a x plus b, and count its solutions modulo a prime.', text: 'Take an equation like y² = x³ + ax + b, and count its solutions modulo a prime.', click: '#add' },
    { say: 'Every count lands within two root p of p plus one. Hasse proved it in nineteen thirty three. Weil and Deligne proved far more.', text: 'Every count lands within 2√p of p + 1. Hasse proved it in 1933. Weil and Deligne proved far more.', click: '#add' },
  ],
  [ // 15 Stepanov's method
    { say: 'Stepanov found a short proof of that.' },
    { say: 'Build a polynomial that vanishes to high order at every point you want to count.', drive: ['km', 1, 5] },
    { say: 'High order costs degree, and a bound on the degree caps the count.' },
    { say: 'Over the whole numbers there was no way to do this. The November claim says it found one.' },
  ],
  [ // 16 The 2026 claim and its Lean archive
    { say: 'On November twentieth, a mathematician announced a proof of the Riemann hypothesis, found with Claude.', text: 'On 20 November 2026, a mathematician announced a proof of the Riemann hypothesis, found with Claude.' },
    { say: 'The proof is a Lean project of seventeen million lines. Its statement is the right one, and a text search finds no shortcuts.', text: 'The proof is a Lean project of 17 million lines. Its statement is the right one, and a text search finds no shortcuts.' },
    { say: 'But nobody has yet reported building it. Until then, it is unverified.' },
  ],
  [ // 17 Recall quiz
    { say: "That's the lecture. Try the five questions from memory, and tap ask if anything was unclear." },
  ],
];
