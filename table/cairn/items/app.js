// table/cairn/items/app.js — the item study, on a page.
//
// The measurement lives in study.js. This file's only real job is making sure a
// reader can tell the difference between "this item is worth nothing" and "the
// model cannot see this item", because the table shows 0.0000 for both and only
// one of those is a fact about Cairn.

import { rollParty } from '../roll.js';
import { parseItem } from '../roll.js';
import { studyItems, slotCurve, modelSees } from '../study.js';

const $ = (id) => document.getElementById(id);
const state = { seed: 'oak-fen-317', size: 4 };

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmt = (x) => (x === null ? '—' : x.toFixed(4));

function readHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (p.get('s')) state.seed = p.get('s');
  if (p.get('n')) state.size = Math.min(5, Math.max(3, Number(p.get('n')) || 4));
}

function writeHash() {
  history.replaceState(null, '', `#s=${encodeURIComponent(state.seed)}&n=${state.size}`);
}

/** A bar whose width is proportional to the biggest value in the table. */
function bar(value, scale) {
  if (!value) return '';
  const width = Math.min(100, Math.abs(value) / scale * 100);
  return `<span class="bar${value < 0 ? ' neg' : ''}" style="width:${width.toFixed(1)}px"></span>`;
}

function renderTable(results) {
  const scale = Math.max(...results.map((r) => Math.abs(r.perSlot ?? r.averted))) || 1;
  const seen = results.filter((r) => modelSees(r.item));
  const unseen = results.filter((r) => !modelSees(r.item));

  $('table').innerHTML = `
    <table>
      <thead><tr>
        <th>item</th><th>kind</th>
        <th style="text-align:right">slots</th>
        <th style="text-align:right">per slot</th>
        <th style="text-align:right">averted</th>
        <th style="text-align:right">best holder</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${seen.map((r) => `
          <tr>
            <td class="name">${escapeHtml(r.item.name)}</td>
            <td class="kind">${r.item.kind}${r.item.relic ? ' · relic' : ''}</td>
            <td class="num">${r.slots || 'petty'}</td>
            <td class="num">${fmt(r.perSlot)}</td>
            <td class="num">${fmt(r.averted)}</td>
            <td class="num">${fmt(r.best)}</td>
            <td>${bar(r.perSlot ?? r.averted, scale)}</td>
          </tr>`).join('')}
      </tbody>
    </table>

    <p class="caveat" style="margin-top:0.9rem">
      <b>${unseen.length} more items scored exactly zero because the model cannot see them</b> —
      relics whose effect is a conversation, a door, a disguise or a corpse. They still cost a slot,
      which in this model makes them strictly negative and in a real game makes them the reason to
      play Cairn. Listed for completeness:
    </p>
    <table style="margin-top:0.4rem">
      <tbody>
        ${unseen.map((r) => `
          <tr class="unseen">
            <td class="name">${escapeHtml(r.item.name)}</td>
            <td class="kind">${r.item.relic ? 'relic' : r.item.kind}</td>
            <td class="num">${r.slots || 'petty'}</td>
            <td colspan="4" class="kind">${r.item.relic ? escapeHtml(r.item.relic.effect.slice(0, 110)) : ''}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  // the headline finding, computed rather than asserted
  const bestArmour = seen.filter((r) => r.item.armor).sort((a, b) => b.perSlot - a.perSlot)[0];
  const bestWeapon = seen.filter((r) => r.item.damage).sort((a, b) => b.perSlot - a.perSlot)[0];
  if (bestArmour && bestWeapon) {
    // The comparison is computed, so the sentence has to be too — an earlier
    // version asserted that armour dominates weapons and then printed a ratio
    // of 1.1, which is the page arguing with its own table.
    const ratio = bestArmour.perSlot / bestWeapon.perSlot;
    const gloss = ratio >= 1.25
      ? `Cairn subtracts armour from <em>every</em> hit and a swarm of weak attackers is the common
         case, so against this party soaking beats hitting harder.`
      : ratio >= 0.8
        ? `They are within a few percent of each other: with this party's kit, a slot spent on
           armour and a slot spent on a bigger die buy about the same amount of survival.`
        : `Unusually, the die beats the armour here — this party is already armoured, and armour
           does not stack past 3.`;
    $('table').insertAdjacentHTML('afterbegin', `
      <div class="finding">
        Against this party, the best thing per slot is
        <b>${escapeHtml(bestArmour.item.name)}</b> at ${fmt(bestArmour.perSlot)} toll averted per
        slot, against <b>${escapeHtml(bestWeapon.item.name)}</b> at ${fmt(bestWeapon.perSlot)} for
        the best weapon — a ratio of ${ratio.toFixed(2)}. ${gloss}
      </div>`);
  }
}

function renderCurve(curve) {
  const cliff = curve
    .map((c, i) => ({ ...c, jump: i ? c.before - curve[i - 1].before : 0 }))
    .sort((a, b) => b.jump - a.jump)[0];
  $('curve').innerHTML = `
    <table>
      <thead><tr>
        <th>slots of junk carried</th>
        <th style="text-align:right">toll before</th>
        <th style="text-align:right">toll with a shield</th>
        <th style="text-align:right">the shield is worth</th>
      </tr></thead>
      <tbody>${curve.map((c) => `
        <tr>
          <td>${c.ballast}</td>
          <td class="num">${c.before.toFixed(3)}</td>
          <td class="num">${c.after.toFixed(3)}</td>
          <td class="num" ${c.averted < 0 ? 'style="color:var(--ink)"' : ''}>${c.averted >= 0 ? '+' : ''}${c.averted.toFixed(4)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="finding">
      The shield's value does not decline gently — it falls off a cliff. Adding the
      ${cliff.ballast}th slot of junk costs this party ${cliff.jump.toFixed(3)} toll on its own,
      because that is the load at which a full pack starts dropping characters to 0 HP before the
      fight begins. Past that point <b>picking the shield up can be worse than leaving it</b>:
      a slot is not a small price, it is the last one.
    </div>`;
}

function run() {
  const members = rollParty(state.seed, state.size).members;
  $('status').textContent = 'pricing…';
  $('run').disabled = true;
  setTimeout(() => {
    const t0 = performance.now();
    const results = studyItems(members, {
      trials: 200,
      seed: `${state.seed}/study`,
      onProgress: (i, n) => { if (i % 20 === 0) $('status').textContent = `${i}/${n}`; },
    });
    renderTable(results);
    renderCurve(slotCurve(members, { ...parseItem('Shield (+1 Armor)'), kind: 'armor' }, {
      trials: 400, seed: `${state.seed}/curve`,
    }));
    $('status').textContent = `${results.length} items in ${Math.round(performance.now() - t0)}ms`;
    $('run').disabled = false;
    writeHash();
  }, 20);
}

$('seed').addEventListener('change', () => { state.seed = $('seed').value.trim() || state.seed; run(); });
$('size').addEventListener('change', () => { state.size = Number($('size').value); run(); });
$('run').addEventListener('click', run);

readHash();
$('seed').value = state.seed;
$('size').value = String(state.size);
run();
