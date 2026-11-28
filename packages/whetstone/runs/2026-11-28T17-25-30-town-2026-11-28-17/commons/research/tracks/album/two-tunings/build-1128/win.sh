R=../../../../../engines/instruments/render.mjs
for spec in "piano 52" "piano 64" "piano 76" "guitar 52" "guitar 64" "guitar 76"; do set -- $spec
echo "{ \"parts\": [ { \"instrument\": \"$1\", \"events\": [ { \"at\": 0.0, \"dur\": 8.0, \"midi\": $2, \"velocity\": 0.6 } ] } ] }" > t.json
node $R t.json --out t.wav --mono >/dev/null
f=$(node -e "console.log(440*2**(($2-69)/12))")
echo "$1 $2 ($f Hz): $(node env.mjs t.wav $f | tr ' ' '\n' | awk -F: 'NR==1{a=$2} {if(!d && $2<a-40){print "-40dB at " $1 " s"; d=1}}')"
done
