// Planetary day + planetary hour (Chaldean order).
//
// Days of the week, in order, are ruled by:
//   Sun (Sunday), Moon (Monday), Mars (Tuesday), Mercury (Wednesday),
//   Jupiter (Thursday), Venus (Friday), Saturn (Saturday).
//
// Planetary hours run the Chaldean sequence (Saturn, Jupiter, Mars, Sun,
// Venus, Mercury, Moon) repeating. The first hour of the day (the hour
// starting at sunrise) is ruled by the day's planet.

export const PLANETS = {
  sun:     { name: 'Sun',     glyph: '☉', color: 'sun',     keywords: ['vitality','ego','radiance'] },
  moon:    { name: 'Moon',    glyph: '☽', color: 'moon',    keywords: ['memory','tides','intuition'] },
  mars:    { name: 'Mars',    glyph: '♂', color: 'mars',    keywords: ['action','heat','edge'] },
  mercury: { name: 'Mercury', glyph: '☿', color: 'mercury', keywords: ['signal','wit','message'] },
  jupiter: { name: 'Jupiter', glyph: '♃', color: 'jupiter', keywords: ['expansion','luck','feast'] },
  venus:   { name: 'Venus',   glyph: '♀', color: 'venus',   keywords: ['beauty','accord','ease'] },
  saturn:  { name: 'Saturn',  glyph: '♄', color: 'saturn',  keywords: ['form','limit','craft'] },
};

// Weekday index (UTC 0=Sun) -> planet key.
const DAY_RULERS = ['sun','moon','mars','mercury','jupiter','venus','saturn'];

// Chaldean sequence used for the marching planetary hours.
const CHALDEAN = ['saturn','jupiter','mars','sun','venus','mercury','moon'];

export function planetaryDayKey(date, lon = null) {
  // Days of the planetary week begin at LOCAL sunrise. For grouping purposes,
  // approximate "local" with a longitude-derived offset (no DST). Callers that
  // already know the correct sunrise can also use planetaryDayKeyFromSunrise.
  let local = date;
  if (lon != null) {
    const offsetMs = (lon / 15) * 3600 * 1000;
    local = new Date(date.getTime() + offsetMs);
  }
  return DAY_RULERS[local.getUTCDay()];
}

export function planetaryDay(date, lon = null) {
  return PLANETS[planetaryDayKey(date, lon)];
}

// The hour-finder. Caller supplies the segment the moment falls in:
//   - segStart, segEnd: the daylight or nighttime span this moment is inside
//   - dayPlanetKey:     planet ruling the planetary day this segment belongs to
//   - isNight:          whether segment is the night half
// Returns { planet, planetKey, indexInDay, isNight, fraction }.
export function planetaryHourFromSegment({ segStart, segEnd, dayPlanetKey, isNight, t }) {
  if (segStart == null || segEnd == null || segEnd <= segStart) return null;
  const span = segEnd - segStart;
  const hourLen = span / 12;
  const hourIdx = Math.min(11, Math.max(0, Math.floor((t - segStart) / hourLen)));
  const chaldeanStart = CHALDEAN.indexOf(dayPlanetKey);
  if (chaldeanStart < 0) return null;
  const totalHourIdx = isNight ? hourIdx + 12 : hourIdx;
  const planetKey = CHALDEAN[((chaldeanStart + totalHourIdx) % 7 + 7) % 7];
  return {
    planet: PLANETS[planetKey],
    planetKey,
    indexInDay: totalHourIdx,
    isNight,
    fraction: ((t - segStart) % hourLen) / hourLen,
  };
}

export function weekdayPlanetKey(date) {
  return DAY_RULERS[date.getUTCDay()];
}
