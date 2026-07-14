// reef.mino.mobi — API for the species-judging deck. Stores only votes;
// specimens are (species, seed) pairs regenerated deterministically from
// reef/js/species.js on every client.

const SPECIES = ['fish', 'eel', 'ray', 'jellyfish', 'turtle', 'coral', 'anemone'];
const GEN_VERSION = 1;
const POOL = 800;               // judging universe: seeds 0..POOL-1 per species
const SPECIMEN_RE = new RegExp(`^(${SPECIES.join('|')}):(\\d{1,4})$`);

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
        },
      });
    }

    try {
      if (pathname === '/api/reef/health') {
        const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM reef_votes').first('n');
        return json({ ok: true, votes: n, gen: GEN_VERSION, pool: POOL });
      }

      if (pathname === '/api/reef/next' && request.method === 'GET') {
        const voter = (url.searchParams.get('voter') || '').slice(0, 64);
        if (!voter) return json({ error: 'voter required' }, 400);
        const want = Math.min(24, Math.max(1, +(url.searchParams.get('n') || 12)));

        // what this voter has already judged
        const seen = new Set(
          (await env.DB.prepare('SELECT specimen FROM reef_votes WHERE voter = ?').bind(voter).all())
            .results.map((r) => r.specimen)
        );

        // "hot" specimens: partially judged (1..4 votes), so verdicts converge
        const hot = (await env.DB.prepare(
          `SELECT specimen, COUNT(*) AS n FROM reef_votes WHERE gen = ?
           GROUP BY specimen HAVING n BETWEEN 1 AND 4 ORDER BY RANDOM() LIMIT 40`
        ).bind(GEN_VERSION).all()).results
          .map((r) => r.specimen)
          .filter((s) => !seen.has(s))
          .slice(0, Math.floor(want / 2));

        // fresh random specimens fill the rest
        const out = [...hot];
        let guard = 0;
        while (out.length < want && guard++ < 200) {
          const sp = Math.floor(Math.random() * SPECIES.length);
          const seed = Math.floor(Math.random() * POOL);
          const id = `${SPECIES[sp]}:${seed}`;
          if (!seen.has(id) && !out.includes(id)) out.push(id);
        }
        return json({
          gen: GEN_VERSION,
          specimens: out.map((id) => {
            const m = SPECIMEN_RE.exec(id);
            return { id, species: SPECIES.indexOf(m[1]), seed: +m[2] };
          }),
        });
      }

      if (pathname === '/api/reef/vote' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        if (!body) return json({ error: 'bad json' }, 400);
        const voter = String(body.voter || '').slice(0, 64);
        const specimen = String(body.specimen || '');
        const vote = body.vote === 1 || body.vote === true ? 1 : body.vote === 0 || body.vote === false ? 0 : null;
        const m = SPECIMEN_RE.exec(specimen);
        if (!voter || !m || vote === null || +m[2] >= POOL) return json({ error: 'bad vote' }, 400);
        await env.DB.prepare(
          'INSERT OR IGNORE INTO reef_votes (specimen, voter, vote, gen, voted_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(specimen, voter, vote, GEN_VERSION, Date.now()).run();
        const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM reef_votes WHERE voter = ?')
          .bind(voter).first('n');
        return json({ ok: true, judged: count });
      }

      if (pathname === '/api/reef/stats') {
        const totals = await env.DB.prepare(
          `SELECT COUNT(*) AS votes, COUNT(DISTINCT voter) AS voters,
                  COUNT(DISTINCT specimen) AS specimens FROM reef_votes WHERE gen = ?`
        ).bind(GEN_VERSION).first();
        const perSpecies = (await env.DB.prepare(
          `SELECT substr(specimen, 1, instr(specimen, ':') - 1) AS species,
                  COUNT(*) AS votes, AVG(vote) AS yes_ratio
           FROM reef_votes WHERE gen = ? GROUP BY species`
        ).bind(GEN_VERSION).all()).results;
        return json({ ...totals, perSpecies });
      }

      // aggregates for the trainer: every specimen with >= 3 votes
      if (pathname === '/api/reef/export') {
        const rows = (await env.DB.prepare(
          `SELECT specimen, SUM(vote) AS yes, COUNT(*) - SUM(vote) AS no
           FROM reef_votes WHERE gen = ? GROUP BY specimen HAVING COUNT(*) >= 3`
        ).bind(GEN_VERSION).all()).results;
        return json({ gen: GEN_VERSION, minVotes: 3, specimens: rows });
      }

      if (pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: String(e) }, 500);
    }

    return env.ASSETS.fetch(request);
  },
};
