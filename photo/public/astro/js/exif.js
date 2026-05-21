import exifr from 'exifr';

// Try, in order: DateTimeOriginal, CreateDate, ModifyDate. Returns a Date or null.
// Also returns GPS lat/lon if present.
export async function readPhotoMeta(file) {
  let parsed = null;
  try {
    parsed = await exifr.parse(file, {
      pick: [
        'DateTimeOriginal', 'CreateDate', 'ModifyDate',
        'OffsetTimeOriginal', 'OffsetTime',
        'GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef',
        'latitude', 'longitude',
        'Make', 'Model',
      ],
    });
  } catch (err) {
    // Some files just don't have EXIF — that's fine.
    parsed = null;
  }

  let date = null;
  if (parsed) {
    date = parsed.DateTimeOriginal || parsed.CreateDate || parsed.ModifyDate || null;
    if (date && !(date instanceof Date)) date = new Date(date);
    // EXIF DateTimeOriginal is typically local time without TZ info; exifr
    // parses it as if it were in the *local* JS timezone. If we have an
    // OffsetTime field, prefer reconstructing UTC from those parts.
    const offset = parsed.OffsetTimeOriginal || parsed.OffsetTime;
    if (date && offset && typeof offset === 'string') {
      const m = offset.match(/^([+-])(\d{2}):?(\d{2})$/);
      if (m) {
        const sign = m[1] === '+' ? 1 : -1;
        const offsetMin = sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
        // exifr returned the date interpreted in the JS local TZ. Convert it
        // back to "wall clock" components, then assemble a UTC date from
        // those + the explicit offset.
        const y = date.getFullYear();
        const mo = date.getMonth();
        const d = date.getDate();
        const h = date.getHours();
        const mi = date.getMinutes();
        const s = date.getSeconds();
        const utcMs = Date.UTC(y, mo, d, h, mi, s) - offsetMin * 60 * 1000;
        date = new Date(utcMs);
      }
    }
  }

  let location = null;
  if (parsed && Number.isFinite(parsed.latitude) && Number.isFinite(parsed.longitude)) {
    location = { lat: parsed.latitude, lon: parsed.longitude };
  }

  return {
    date,
    location,
    camera: parsed ? [parsed.Make, parsed.Model].filter(Boolean).join(' ').trim() : '',
    hasExif: !!parsed,
  };
}
