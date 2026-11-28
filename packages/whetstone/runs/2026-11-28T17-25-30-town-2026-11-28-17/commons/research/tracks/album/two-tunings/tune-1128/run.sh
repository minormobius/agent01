# Run from this folder: sh run.sh > result.txt   (renders to the folder; WAVs are not kept)
R=../../../../../engines/instruments/render.mjs
node $R pj.json --out pj.wav --mono >/dev/null          # piano E3 tuned just, 165.00 Hz
node $R guitar.json --out guitar.wav --mono >/dev/null  # guitar E3 equal, 164.81 Hz
node $R piano76.json --out piano76.wav --mono >/dev/null
echo "== piano E5 (equal) fundamental: level, local frequency every 0.05 s"; node phase.mjs piano76.wav 659.26 | head -45
echo "== piano E3 just 4th partial"; node phase.mjs pj.wav 659.26 | head -45
echo "== pair at E3, piano gain matched at 2.7 s, guitar onset offset, envelope 1.9-4.2 s"; node mix.mjs
rm -f *.wav
