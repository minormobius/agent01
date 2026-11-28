cd /tmp/plc
for y in 2022 2023 2024 2025 2026; do for m in 01 03 05 07 09 11; do
 t="$y-$m-15T12:00:00.000Z"
 curl -s -m 20 "https://plc.directory/export?count=1000&after=$t" -o s.jsonl || continue
 n=$(wc -l < s.jsonl); b=$(wc -c < s.jsonl)
 first=$(head -1 s.jsonl | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).createdAt)}catch{console.log("x")}})')
 last=$(tail -1 s.jsonl | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).createdAt)}catch{console.log("x")}})')
 echo "$t $n $b $first $last"; sleep 1
done; done
