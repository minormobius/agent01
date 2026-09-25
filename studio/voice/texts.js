// texts.js — what the voice is asked to say, and how it is judged.
//
// PARAGRAPH is the character's own speech (the voice is Claude's). The Harvard sentences
// (IEEE Recommended Practice for Speech Quality Measurements, 1969; lists 1 to 5) are the test:
// phonetically balanced, and unpredictable enough that a listener (or Whisper) cannot guess
// the words from the sense. A score on the paragraph alone would flatter the voice.

export const PARAGRAPH =
  'Hello. I am a voice made of three small waves and a little noise. Nobody recorded me. ' +
  'Every sound you hear is arithmetic, worked out a few thousand times a second. ' +
  'If you can understand these words, then the old machines were right, and a voice is mostly a shape, moving through time.';

export const HARVARD = [
  'The birch canoe slid on the smooth planks.',
  'Glue the sheet to the dark blue background.',
  "It's easy to tell the depth of a well.",
  'These days a chicken leg is a rare dish.',
  'Rice is often served in round bowls.',
  'The juice of lemons makes fine punch.',
  'The box was thrown beside the parked truck.',
  'The hogs were fed chopped corn and garbage.',
  'Four hours of steady work faced us.',
  'A large size in stockings is hard to sell.',
  // list 2
  'The boy was there when the sun rose.',
  'A rod is used to catch pink salmon.',
  'The source of the huge river is the clear spring.',
  'Kick the ball straight and follow through.',
  'Help the woman get back to her feet.',
  'A pot of tea helps to pass the evening.',
  'Smoky fires lack flame and heat.',
  "The soft cushion broke the man's fall.",
  'The salt breeze came across from the sea.',
  'The girl at the booth sold fifty bonds.',
  // list 3
  'The small pup gnawed a hole in the sock.',
  'The fish twisted and turned on the bent hook.',
  'Press the pants and sew a button on the vest.',
  'The swan dive was far short of perfect.',
  'The beauty of the view stunned the young boy.',
  'Two blue fish swam in the tank.',
  'Her purse was full of useless trash.',
  'The colt reared and threw the tall rider.',
  'It snowed, rained, and hailed the same morning.',
  'Read verse out loud for pleasure.',
  // list 4
  'The wide road shimmered in the hot sun.',
  'The lazy cow lay in the cool grass.',
  'Lift the square stone over the fence.',
  'The rope will bind the seven books at once.',
  'Hop over the fence and plunge in.',
  'The friendly gang left the drug store.',
  'Mesh wire keeps chicks inside.',
  'The frosty air passed through the coat.',
  'The crooked maze failed to fool the mouse.',
  'Adding fast leads to wrong sums.',
  // list 5
  'The show was a flop from the very start.',
  'A saw is a tool used for making boards.',
  'The wagon moved on well oiled wheels.',
  'March the soldiers past the next hill.',
  'A cup of sugar makes sweet fudge.',
  'Place a rosebush near the porch steps.',
  'Both lost their lives in the raging storm.',
  'We talked of the side show in the circus.',
  'Use a pen to draw a hard line.',
  'He ordered peach pie with ice cream.',
];

/** The sentences of the paragraph, for scoring one at a time. */
export const PARAGRAPH_SENTENCES = PARAGRAPH.match(/[^.!?]+[.!?]/g).map((s) => s.trim());
