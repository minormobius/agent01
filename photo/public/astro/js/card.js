import { symbolicTags } from './astro/analyze.js';

export function renderBeautyCard(photo) {
  const { reading, imageUrl, file } = photo;
  const wrap = document.createElement('div');
  wrap.className = 'beauty-card';

  const photoWrap = document.createElement('div');
  photoWrap.className = 'photo-wrap';
  photoWrap.style.backgroundImage = `url(${imageUrl})`;
  wrap.appendChild(photoWrap);

  const details = document.createElement('div');
  details.className = 'details';

  const stamp = document.createElement('div');
  stamp.className = 'stamp';
  stamp.textContent = formatStamp(reading.date, reading.location);
  details.appendChild(stamp);

  const headline = document.createElement('h2');
  headline.className = 'headline';
  if (reading.planetaryHour) {
    headline.innerHTML = `<span class="glyph">${reading.planetaryHour.planet.glyph}</span>Hour of ${reading.planetaryHour.planet.name}`;
  } else if (reading.planetaryDay) {
    headline.innerHTML = `<span class="glyph">${reading.planetaryDay.glyph}</span>${reading.planetaryDay.name}'s day`;
  } else {
    headline.textContent = 'Reading';
  }
  details.appendChild(headline);

  const pills = document.createElement('div');
  pills.className = 'pills';
  for (const tag of symbolicTags(reading)) {
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = `${tag.glyph} ${tag.label}`;
    pills.appendChild(pill);
  }
  details.appendChild(pills);

  photoWrap.appendChild(details);
  return wrap;
}

export function formatStamp(date, location) {
  if (!date) return '';
  const opts = {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC',
  };
  let s = date.toLocaleString(undefined, opts) + ' UTC';
  if (location) {
    s += ` · ${location.lat.toFixed(2)}, ${location.lon.toFixed(2)}`;
  }
  return s;
}

// Render the card to a canvas and return a Blob.
export async function exportCardPng(photo) {
  const W = 1080;
  const H = 1350; // 4:5 portrait, instagram-friendly
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // Background gradient.
  const bg = ctx.createLinearGradient(0, 0, W * 0.6, H);
  bg.addColorStop(0, '#1a163a');
  bg.addColorStop(1, '#0b0a14');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Image (cover-fit centered).
  const img = await loadImage(photo.imageUrl);
  drawCover(ctx, img, 0, 0, W, H);

  // Bottom gradient overlay.
  const overlay = ctx.createLinearGradient(0, H * 0.5, 0, H);
  overlay.addColorStop(0, 'rgba(11,10,20,0)');
  overlay.addColorStop(0.6, 'rgba(11,10,20,0.85)');
  overlay.addColorStop(1, 'rgba(11,10,20,0.98)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, H * 0.5, W, H * 0.5);

  // Text.
  const reading = photo.reading;
  const padX = 60;
  let cursorY = H - 240;

  ctx.fillStyle = '#9b96b5';
  ctx.font = 'italic 28px Georgia, serif';
  ctx.fillText(formatStamp(reading.date, reading.location), padX, cursorY);

  cursorY += 60;
  ctx.fillStyle = '#e9e6f5';
  ctx.font = '500 64px Georgia, serif';
  let headline;
  if (reading.planetaryHour) {
    headline = `${reading.planetaryHour.planet.glyph}  Hour of ${reading.planetaryHour.planet.name}`;
  } else if (reading.planetaryDay) {
    headline = `${reading.planetaryDay.glyph}  ${reading.planetaryDay.name}'s day`;
  } else {
    headline = 'Reading';
  }
  ctx.fillText(headline, padX, cursorY);

  cursorY += 50;
  ctx.font = 'italic 28px Georgia, serif';
  const tagLine = symbolicTags(reading)
    .filter(t => !t.label.startsWith('hour of') && !t.label.endsWith("'s day"))
    .map(t => `${t.glyph} ${t.label}`)
    .join('  ·  ');
  wrapText(ctx, tagLine, padX, cursorY, W - 2 * padX, 38, '#c9d2e0');

  // Watermark.
  ctx.fillStyle = '#6a728a';
  ctx.font = '20px Georgia, serif';
  ctx.fillText('astrolens · photo.mino.mobi/astro', padX, H - 40);

  return await new Promise(resolve => c.toBlob(resolve, 'image/png', 0.95));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height;
  const dr = w / h;
  let sx, sy, sw, sh;
  if (ir > dr) {
    sh = img.height;
    sw = img.height * dr;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = img.width / dr;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function wrapText(ctx, text, x, y, maxW, lineH, color) {
  ctx.fillStyle = color;
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = w;
      y += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
}
