// prompt-submit-vote — the Quiplash shape.
//
// Phases per round: prompt → vote → reveal.
// After N rounds: final.
//
// State on the room:
//   round            current round index (1..rounds)
//   roundCount       configured rounds
//   assignments      { [did]: promptText }  — set on prompt enter
//   answers          { [did]: string }       — collected during prompt
//   shuffled         [{ did, text }]         — built on vote enter
//   votes            { [voterDid]: answerDid } — collected during vote
//   roundScores      { [did]: number }       — computed on reveal enter

import { parseGameMarkdown } from '../parse-md.js';

const TEMPLATE_ID = 'prompt-submit-vote';

function pickPromptsFor(playerDids, prompts) {
  // Cycle prompts so we never reuse one if avoidable.
  const pool = [...prompts];
  if (pool.length < playerDids.length) {
    // Pad by cycling.
    let i = 0;
    while (pool.length < playerDids.length) pool.push(prompts[i++ % prompts.length]);
  }
  // Shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out = {};
  playerDids.forEach((did, idx) => (out[did] = pool[idx]));
  return out;
}

function shuffleSubmissions(answers) {
  const arr = Object.entries(answers).map(([did, text]) => ({ did, text }));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const template = {
  id: TEMPLATE_ID,

  // ---------- compile time ----------
  // Called once when a room is created from a .md file.
  compile(mdText) {
    const parsed = parseGameMarkdown(mdText);
    const prompts = parsed.sections?.prompts?.items ?? [];
    const copy = parsed.sections?.copy?.map ?? {};
    const scoring = parsed.sections?.scoring?.map ?? {};
    if (prompts.length === 0) {
      throw new Error('prompt-submit-vote: needs at least one prompt under ## prompts');
    }
    return {
      template: TEMPLATE_ID,
      meta: parsed.meta,
      prompts,
      copy: {
        promptTv: copy['prompt.tv'] || 'Answer the prompt on your phone',
        promptPhone: copy['prompt.phone'] || '{{prompt}}',
        voteTv: copy['vote.tv'] || 'Vote for the best answer',
        votePhone: copy['vote.phone'] || 'Tap your favorite',
        revealTv: copy['reveal.tv'] || 'And the winner is…',
      },
      scoring: {
        vote: Number(scoring.vote ?? 100),
        bonus: Number(scoring.bonus ?? 0),
      },
      rounds: Number(parsed.meta.rounds ?? 3),
      minPlayers: 2,
      maxPlayers: 8,
    };
  },

  // ---------- runtime hooks ----------
  // ctx: { game, players, state, phaseState, broadcast, transition, sendPlayer }

  enterPhase(phase, ctx) {
    const { game, players } = ctx;
    const playerDids = Object.keys(players);

    if (phase === 'lobby') {
      ctx.phaseState = {};
      return;
    }
    if (phase === 'prompt') {
      const round = (ctx.state.round || 0) + 1;
      ctx.state.round = round;
      ctx.phaseState = {
        round,
        assignments: pickPromptsFor(playerDids, game.prompts),
        answers: {},
      };
      return;
    }
    if (phase === 'vote') {
      const answers = ctx.state.lastPhase?.answers || {};
      ctx.phaseState = {
        round: ctx.state.round,
        shuffled: shuffleSubmissions(answers),
        votes: {},
      };
      return;
    }
    if (phase === 'reveal') {
      const votes = ctx.state.lastPhase?.votes || {};
      const shuffled = ctx.state.lastPhase?.shuffled || [];
      const voteCount = {};
      for (const target of Object.values(votes)) {
        voteCount[target] = (voteCount[target] || 0) + 1;
      }
      const roundScores = {};
      for (const did of Object.keys(players)) {
        roundScores[did] = (voteCount[did] || 0) * game.scoring.vote;
      }
      // Bonus: most-voted player gets the bonus (ties: all bonus).
      const maxVotes = Math.max(0, ...Object.values(voteCount));
      if (maxVotes > 0 && game.scoring.bonus) {
        for (const [did, n] of Object.entries(voteCount)) {
          if (n === maxVotes) roundScores[did] += game.scoring.bonus;
        }
      }
      for (const [did, pts] of Object.entries(roundScores)) {
        players[did].score = (players[did].score || 0) + pts;
      }
      ctx.phaseState = {
        round: ctx.state.round,
        shuffled,
        voteCount,
        roundScores,
      };
      return;
    }
    if (phase === 'final') {
      const scoreboard = Object.entries(players)
        .map(([did, p]) => ({ did, handle: p.handle, score: p.score || 0 }))
        .sort((a, b) => b.score - a.score);
      ctx.phaseState = { scoreboard };
      return;
    }
  },

  onMessage(phase, msg, player, ctx) {
    if (phase === 'prompt' && msg.type === 'submit') {
      const text = String(msg.value || '').slice(0, 240).trim();
      if (!text) return;
      if (!ctx.phaseState.assignments[player.did]) return; // not assigned a prompt
      ctx.phaseState.answers[player.did] = text;
      const submitted = Object.keys(ctx.phaseState.answers).length;
      const expected = Object.keys(ctx.phaseState.assignments).length;
      if (submitted >= expected) {
        ctx.state.lastPhase = { answers: ctx.phaseState.answers };
        ctx.transition('vote');
      }
      return;
    }
    if (phase === 'vote' && msg.type === 'vote') {
      const target = String(msg.target || '');
      const valid = ctx.phaseState.shuffled.some((s) => s.did === target);
      if (!valid) return;
      if (target === player.did) return; // no self-vote
      ctx.phaseState.votes[player.did] = target;
      const voters = Object.keys(ctx.phaseState.votes).length;
      const eligibleVoters = ctx.phaseState.shuffled.length; // everyone who submitted can vote
      if (voters >= eligibleVoters) {
        ctx.state.lastPhase = {
          votes: ctx.phaseState.votes,
          shuffled: ctx.phaseState.shuffled,
        };
        ctx.transition('reveal');
      }
      return;
    }
  },

  // What the TV sees (public).
  publicState(phase, ctx) {
    const { game, players, state, phaseState } = ctx;
    const playerList = Object.entries(players).map(([did, p]) => ({
      did, handle: p.handle, score: p.score || 0,
    }));
    if (phase === 'lobby') {
      return { phase, game: { name: game.meta.name, rounds: game.rounds }, players: playerList };
    }
    if (phase === 'prompt') {
      return {
        phase, round: state.round, rounds: game.rounds,
        copy: game.copy.promptTv,
        players: playerList,
        submitted: Object.keys(phaseState.answers || {}),
        expecting: Object.keys(phaseState.assignments || {}),
      };
    }
    if (phase === 'vote') {
      return {
        phase, round: state.round, rounds: game.rounds,
        copy: game.copy.voteTv,
        players: playerList,
        shuffled: phaseState.shuffled, // { did, text } — TV may render text only
        voted: Object.keys(phaseState.votes || {}),
      };
    }
    if (phase === 'reveal') {
      return {
        phase, round: state.round, rounds: game.rounds,
        copy: game.copy.revealTv,
        players: playerList,
        shuffled: phaseState.shuffled,
        voteCount: phaseState.voteCount,
        roundScores: phaseState.roundScores,
        finalRound: state.round >= game.rounds,
      };
    }
    if (phase === 'final') {
      return { phase, scoreboard: phaseState.scoreboard };
    }
    return { phase };
  },

  // What this specific phone sees (private).
  playerState(phase, player, ctx) {
    const { game, phaseState } = ctx;
    if (phase === 'lobby') {
      return { phase, isHost: player.did === ctx.state.hostDid };
    }
    if (phase === 'prompt') {
      const assigned = phaseState.assignments?.[player.did];
      const submitted = !!phaseState.answers?.[player.did];
      return {
        phase,
        prompt: assigned,
        copy: game.copy.promptPhone.replace('{{prompt}}', assigned || ''),
        submitted,
      };
    }
    if (phase === 'vote') {
      const options = (phaseState.shuffled || []).filter((s) => s.did !== player.did);
      return {
        phase,
        copy: game.copy.votePhone,
        options,
        voted: phaseState.votes?.[player.did] || null,
      };
    }
    if (phase === 'reveal') return { phase };
    if (phase === 'final') return { phase };
    return { phase };
  },

  // After reveal completes (driven by host:next from worker), what's next?
  nextPhase(currentPhase, ctx) {
    if (currentPhase === 'lobby') return 'prompt';
    if (currentPhase === 'prompt') return 'vote';
    if (currentPhase === 'vote') return 'reveal';
    if (currentPhase === 'reveal') {
      return ctx.state.round >= ctx.game.rounds ? 'final' : 'prompt';
    }
    return null;
  },
};
