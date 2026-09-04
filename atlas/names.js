// names.js — romantic names for regions that emerged from econometrics.
//
// The regions on this map are computed. Their NAMES are not, and pretending
// otherwise would be the dishonest part: no clustering of transfer shares and
// migration rates produces the word "Appalachia". So the naming is a separate,
// clearly-labelled layer — a fixed list of names, each pinned to a point on the
// ground, assigned to whichever region contains or lies nearest that point.
// Change the axes and the borders move; the names follow the ground.
//
// The vocabulary borrows from the long tradition of dividing North America by
// culture rather than by statute — Joel Garreau's *The Nine Nations of North
// America* (1981) and Colin Woodard's *American Nations* (2011) are the two
// obvious ancestors — plus the ordinary regional names people already use.
// None of the boundaries here are theirs; only some of the words are.
//
// Every name is editable in the UI. These are a starting vocabulary, not a
// claim.

/* global globalThis */
(function (root) {
  'use strict';

  // [name, anchor lon, anchor lat, blurb, iso]
  //
  // ORDER IS PRIORITY. Two anchors often land in the same region — Los Angeles
  // and Fresno usually do — and the earlier one claims it, so the sharp
  // metropolitan anchors come first and the broad regional ones after. That is
  // why the list is not in geographic order.
  const NAMES = [
    ['The Empire',       -73.9, 40.8, 'Greater New York. A city-state that happens to have counties.', 'US'],
    ['The Southland',   -118.2, 34.0, 'Los Angeles, the Inland Empire, and San Diego.', 'US'],
    ['The Bay',         -122.3, 37.8, 'Northern California, and the densest concentration of GDP per job in the hemisphere.', 'US'],
    ['Cascadia',        -122.4, 47.6, 'The Pacific Northwest, west of the mountains.', 'US'],
    ['The Gulf',         -95.4, 29.8, 'Houston, the refineries, and the coast that feeds them.', 'US'],
    ['The Peninsula',    -81.4, 28.5, 'Florida, which is not the South and never was.', 'US'],
    ['Yankeedom',        -71.1, 42.4, 'New England: the oldest continuously settled polity on the map, and still the one with the highest share of income arriving as dividends.', 'US'],
    ['Tidewater',        -76.4, 37.3, 'The Chesapeake and the coastal plain running south from it.', 'US'],
    ['The Midlands',      -75.2, 39.95, 'Philadelphia and the mid-Atlantic corridor: the moderate middle, and the region most often left without a name of its own.', 'US'],
    ['The Foundry',      -81.7, 41.5, 'The Great Lakes manufacturing belt: the place the word “rust” got attached to.', 'US'],
    ['Dixie',            -86.8, 33.5, 'The Deep South of the black belt and the piedmont.', 'US'],
    ['Greater Texas',    -97.7, 30.3, 'The Texan interior: its own weather, its own grid, its own idea of itself.', 'US'],
    ['The Front Range', -104.99, 39.7, 'The eastern face of the Rockies, from Cheyenne to Pueblo.', 'US'],
    ['The High Desert', -112.07, 33.4, 'Phoenix, Tucson, and the sun-belt sprawl of the Southwest.', 'US'],
    ['El Norte',        -106.5, 31.8, 'The borderlands, which are one region with a line drawn through them.', 'US'],
    ['Appalachia',       -81.6, 38.3, 'The uplands, from the Alleghenies to the Cumberland Plateau. Where transfer income peaks.', 'US'],
    ['The Piedmont',     -79.8, 35.9, 'The Carolina crescent: textiles, then banking, then research triangles.', 'US'],
    ['The Delta',        -90.9, 33.4, 'The lower Mississippi and its floodplain.', 'US'],
    ['The Breadbasket',  -93.6, 41.6, 'The corn and soy belt of the upper Midwest.', 'US'],
    ['The Ozarks',       -93.3, 37.2, 'The interior highlands between the plains and the delta.', 'US'],
    ['The Northern Plains', -100.8, 46.8, 'High, cold, emptying, and periodically rich in whatever is under it.', 'US'],
    ['The Great Basin',  -116.0, 39.5, 'Nevada, Utah, and the interior west that drains to nowhere.', 'US'],
    ['The Big Open',     -110.4, 46.6, 'Montana, Wyoming, Idaho: the least dense settled land in the lower 48.', 'US'],
    ['The Sierra',       -119.8, 36.7, 'The Central Valley and the mountains that water it.', 'US'],
    ['The Last Frontier',-149.9, 61.2, 'Alaska.', 'US'],
    ['The Islands',     -157.9, 21.3, 'Hawai‘i.', 'US'],
    ['The Antilles',     -66.1, 18.4, 'Puerto Rico and the U.S. Virgin Islands.', 'US'],
    ['New France',       -73.6, 45.5, 'The St Lawrence valley.', 'CA'],
    ['The Maritimes',    -63.6, 44.7, 'Atlantic Canada.', 'CA'],
    ['The Shield',       -85.0, 49.0, 'The Canadian Shield: rock, lakes, and mines.', 'CA'],
    ['The Prairies',    -105.0, 52.1, 'Manitoba through Alberta.', 'CA'],
    ['The Cordillera',  -123.1, 49.3, 'British Columbia and the coast ranges.', 'CA'],
    ['The North',       -114.4, 62.5, 'The territories.', 'CA'],
  ];

  /**
   * Assign names to regions.
   * @param {Int32Array} region     region index per unit
   * @param {string[]} ids
   * @param {object} centroids      id → [lon, lat]
   * @param {number[]} weights      per-unit population, for ordering
   * @returns {string[]}            name per region index
   */
  function nameRegions(region, ids, centroids, weights) {
    const k = Math.max(0, ...region) + 1;
    const out = new Array(k).fill(null);
    const taken = new Set();

    // Pass 1 — an anchor names the region that CONTAINS it. "Which region is
    // Boston in?" is the question a reader actually asks, and it is a different
    // question from "which region's centre is nearest Boston", which is what a
    // nearest-centroid rule answers and why an earlier version put Hawai'i's
    // name on the Pacific Northwest.
    // An anchor only names a region in its OWN country. Montréal's nearest
    // U.S. county is 80 km away in northern New York, so without this "New
    // France" would name the mid-Atlantic on a map that has no Canada in it.
    const regionOfAnchor = NAMES.map(([, alon, alat, , iso]) => {
      let best = -1, bestD = Infinity;
      for (let i = 0; i < ids.length; i++) {
        if (iso && ids[i].slice(0, 2) !== iso) continue;
        const c = centroids[ids[i]];
        if (!c) continue;
        const d = Math.hypot((c[0] - alon) * Math.cos(alat * Math.PI / 180), c[1] - alat);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best >= 0 ? region[best] : -1;
    });
    for (let ni = 0; ni < NAMES.length; ni++) {
      const g = regionOfAnchor[ni];
      if (g < 0 || out[g] || taken.has(ni)) continue;
      out[g] = NAMES[ni][0];
      taken.add(ni);
    }

    // Pass 2 — a region with no anchor inside it takes the nearest unused
    // anchor to its population-weighted centre.
    const cx = new Array(k).fill(0), cy = new Array(k).fill(0), cw = new Array(k).fill(0);
    for (let i = 0; i < ids.length; i++) {
      const c = centroids[ids[i]];
      if (!c) continue;
      const w = (weights && weights[i]) || 1;
      cx[region[i]] += c[0] * w; cy[region[i]] += c[1] * w; cw[region[i]] += w;
    }
    for (let g = 0; g < k; g++) {
      if (out[g]) continue;
      if (!cw[g]) { out[g] = `Region ${g + 1}`; continue; }
      const px = cx[g] / cw[g], py = cy[g] / cw[g];
      const iso0 = ids.length ? ids[0].slice(0, 2) : null;
      let pick = -1, pickD = Infinity;
      for (let ni = 0; ni < NAMES.length; ni++) {
        if (taken.has(ni)) continue;
        if (iso0 && NAMES[ni][4] && NAMES[ni][4] !== iso0) continue;
        const d = Math.hypot((NAMES[ni][1] - px) * Math.cos(py * Math.PI / 180), NAMES[ni][2] - py);
        if (d < pickD) { pickD = d; pick = ni; }
      }
      if (pick >= 0) { taken.add(pick); out[g] = NAMES[pick][0]; } else out[g] = `Region ${g + 1}`;
    }
    return out;
  }

  /** Population-weighted centre of each region, in lon/lat — for map labels. */
  function regionCentroids(region, ids, centroids, weights) {
    const k = Math.max(0, ...region) + 1;
    const cx = new Array(k).fill(0), cy = new Array(k).fill(0), cw = new Array(k).fill(0);
    for (let i = 0; i < ids.length; i++) {
      const c = centroids[ids[i]];
      if (!c) continue;
      const w = (weights && weights[i]) || 1;
      cx[region[i]] += c[0] * w; cy[region[i]] += c[1] * w; cw[region[i]] += w;
    }
    return cx.map((_, g) => (cw[g] ? [cx[g] / cw[g], cy[g] / cw[g]] : null));
  }

  const API = { NAMES, nameRegions, regionCentroids };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ATLAS_NAMES = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
