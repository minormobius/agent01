// NOAA solar position formulas — returns sunrise/sunset/transit (UTC ms)
// for the calendar date the JS Date falls on, at given lat/lon.
// Accurate to ~1 minute for ordinary latitudes.

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

function julianDate(year, month, day) {
  let y = year, m = month;
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716))
    + Math.floor(30.6001 * (m + 1))
    + day + B - 1524.5;
}

function solarEvents(year, month, day, lat, lon) {
  const jd = julianDate(year, month, day);
  const jc = (jd - 2451545.0) / 36525.0;
  const meanLong = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
  const meanAnom = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const eccen = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const eqCtr = Math.sin(meanAnom * DEG) * (1.914602 - jc * (0.004817 + 0.000014 * jc))
    + Math.sin(2 * meanAnom * DEG) * (0.019993 - 0.000101 * jc)
    + Math.sin(3 * meanAnom * DEG) * 0.000289;
  const trueLong = meanLong + eqCtr;
  const omega = 125.04 - 1934.136 * jc;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG);
  const obliq0 = 23 + (26 + ((21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813)))) / 60) / 60;
  const obliq = obliq0 + 0.00256 * Math.cos(omega * DEG);
  const decl = Math.asin(Math.sin(obliq * DEG) * Math.sin(appLong * DEG)) * RAD;
  const y = Math.tan((obliq / 2) * DEG) ** 2;
  const eqTime = 4 * RAD * (
      y * Math.sin(2 * meanLong * DEG)
      - 2 * eccen * Math.sin(meanAnom * DEG)
      + 4 * eccen * y * Math.sin(meanAnom * DEG) * Math.cos(2 * meanLong * DEG)
      - 0.5 * y * y * Math.sin(4 * meanLong * DEG)
      - 1.25 * eccen * eccen * Math.sin(2 * meanAnom * DEG)
  );
  const cosHA = (Math.cos(90.833 * DEG) - Math.sin(lat * DEG) * Math.sin(decl * DEG))
              / (Math.cos(lat * DEG) * Math.cos(decl * DEG));
  let hourAngle = null;
  if (cosHA >= -1 && cosHA <= 1) {
    hourAngle = Math.acos(cosHA) * RAD;
  }
  const solarNoonMin = 720 - 4 * lon - eqTime; // minutes from UTC midnight
  const dayMs = Date.UTC(year, month - 1, day);
  const transit = dayMs + solarNoonMin * 60 * 1000;
  if (hourAngle == null) {
    // Polar day or polar night.
    return { transit, sunrise: null, sunset: null, polar: true };
  }
  const sunriseMin = solarNoonMin - hourAngle * 4;
  const sunsetMin = solarNoonMin + hourAngle * 4;
  return {
    transit,
    sunrise: dayMs + sunriseMin * 60 * 1000,
    sunset: dayMs + sunsetMin * 60 * 1000,
    polar: false,
  };
}

// For a moment `date` at lat/lon, return sunrise/sunset that bracket it.
// Specifically we need: today's sunrise, today's sunset, tomorrow's sunrise,
// and yesterday's sunset — so callers can locate `date` in the right segment.
export function bracketingSunTimes(date, lat, lon) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const today = solarEvents(y, m, d, lat, lon);
  const yesterday = solarEvents(...prevDateParts(y, m, d), lat, lon);
  const tomorrow  = solarEvents(...nextDateParts(y, m, d), lat, lon);
  return {
    sunrise: today.sunrise,
    sunset:  today.sunset,
    prevSunset: yesterday.sunset,
    nextSunrise: tomorrow.sunrise,
    transit: today.transit,
    polar: today.polar || yesterday.polar || tomorrow.polar,
  };
}

function prevDateParts(y, m, d) {
  const t = Date.UTC(y, m - 1, d) - 86400000;
  const x = new Date(t);
  return [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()];
}
function nextDateParts(y, m, d) {
  const t = Date.UTC(y, m - 1, d) + 86400000;
  const x = new Date(t);
  return [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()];
}

// Returns whether the sun is up at `date` for given lat/lon (above horizon).
// Useful for "luminary condition" tagging.
export function isSunUp(date, lat, lon) {
  const b = bracketingSunTimes(date, lat, lon);
  if (b.polar || b.sunrise == null || b.sunset == null) return null;
  const t = date.getTime();
  return t >= b.sunrise && t < b.sunset;
}
