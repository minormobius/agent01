import { toJulianDay, sunLongitude, moonLongitude, moonPhaseAngle, moonIllumination } from './ephemeris.js';
import { signFromLongitude, phaseFromAngle } from './zodiac.js';
import {
  PLANETS,
  planetaryDay,
  planetaryHourFromSegment,
  weekdayPlanetKey,
} from './planetary.js';
import { bracketingSunTimes, isSunUp } from './sun-times.js';

// Given a Date (UTC) and optional {lat, lon}, return a full reading.
export function analyze(date, location) {
  const jd = toJulianDay(date);
  const sunLon = sunLongitude(jd);
  const moonLon = moonLongitude(jd);
  const phaseAng = moonPhaseAngle(jd);
  const illum = moonIllumination(jd);
  const sunSign  = signFromLongitude(sunLon);
  const moonSign = signFromLongitude(moonLon);
  const phase = phaseFromAngle(phaseAng);

  let pDay, pHour, sunUp, sunTimes;
  if (location && Number.isFinite(location.lat) && Number.isFinite(location.lon)) {
    sunTimes = bracketingSunTimes(date, location.lat, location.lon);
    pHour = resolvePlanetaryHour(date, sunTimes);
    pDay  = resolvePlanetaryDay(date, sunTimes);
    sunUp = isSunUp(date, location.lat, location.lon);
  } else {
    pDay = planetaryDay(date);
    pHour = null;
    sunUp = null;
  }

  return {
    date,
    julianDay: jd,
    sunLongitude: sunLon,
    moonLongitude: moonLon,
    sunSign,
    moonSign,
    moonPhase: phase,
    moonIllumination: illum,
    planetaryDay: pDay,
    planetaryHour: pHour,
    sunUp,
    sunTimes,
    location: location || null,
  };
}

// Decide which sunrise/sunset segment `date` lives in, then dispatch.
function resolvePlanetaryHour(date, st) {
  if (st.polar || st.sunrise == null || st.sunset == null) return null;
  const t = date.getTime();

  // Daylight (today's sunrise -> today's sunset). Day belongs to today.
  if (t >= st.sunrise && t < st.sunset) {
    const dayKey = weekdayPlanetKey(new Date(st.sunrise));
    return planetaryHourFromSegment({
      segStart: st.sunrise, segEnd: st.sunset,
      dayPlanetKey: dayKey, isNight: false, t,
    });
  }

  // Night after today's sunset (today's sunset -> tomorrow's sunrise).
  // Still ruled by today's planetary day (the day that began at today's sunrise).
  if (st.nextSunrise != null && t >= st.sunset && t < st.nextSunrise) {
    const dayKey = weekdayPlanetKey(new Date(st.sunrise));
    return planetaryHourFromSegment({
      segStart: st.sunset, segEnd: st.nextSunrise,
      dayPlanetKey: dayKey, isNight: true, t,
    });
  }

  // Night before today's sunrise (yesterday's sunset -> today's sunrise).
  // Ruled by yesterday's planetary day.
  if (st.prevSunset != null && t >= st.prevSunset && t < st.sunrise) {
    const dayKey = weekdayPlanetKey(new Date(st.prevSunset));
    return planetaryHourFromSegment({
      segStart: st.prevSunset, segEnd: st.sunrise,
      dayPlanetKey: dayKey, isNight: true, t,
    });
  }

  return null;
}

// Planetary day spans sunrise-to-sunrise. If we're in the night before
// today's sunrise, the day belongs to yesterday.
function resolvePlanetaryDay(date, st) {
  const t = date.getTime();
  if (st.sunrise != null && t < st.sunrise && st.prevSunset != null) {
    return PLANETS[weekdayPlanetKey(new Date(st.prevSunset))];
  }
  if (st.sunrise != null) {
    return PLANETS[weekdayPlanetKey(new Date(st.sunrise))];
  }
  return planetaryDay(date);
}

// Symbolic tag list — short, evocative, suitable for cards.
export function symbolicTags(reading) {
  const tags = [];
  if (reading.planetaryHour) {
    const p = reading.planetaryHour.planet;
    tags.push({ label: `hour of ${p.name}`, glyph: p.glyph, color: p.color });
  }
  if (reading.planetaryDay) {
    const p = reading.planetaryDay;
    tags.push({ label: `${p.name}'s day`, glyph: p.glyph, color: p.color });
  }
  if (reading.moonSign) {
    tags.push({
      label: `moon in ${reading.moonSign.name}`,
      glyph: reading.moonSign.glyph,
      color: 'moon',
    });
  }
  if (reading.sunSign) {
    tags.push({
      label: `sun in ${reading.sunSign.name}`,
      glyph: reading.sunSign.glyph,
      color: 'sun',
    });
  }
  if (reading.moonPhase) {
    tags.push({
      label: reading.moonPhase.name.toLowerCase(),
      glyph: reading.moonPhase.glyph,
      color: 'moon',
    });
  }
  if (reading.sunUp != null) {
    tags.push({
      label: reading.sunUp ? 'sun above horizon' : 'sun below horizon',
      glyph: reading.sunUp ? '☀' : '★',
      color: reading.sunUp ? 'sun' : 'moon',
    });
  }
  return tags;
}
