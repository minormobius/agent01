// shell.js: the drawer in split.css. The grip opens and closes it; touching the picture closes it.
(function () {
  const sheet = document.querySelector('.sheet'), grip = sheet && sheet.querySelector('.grip');
  if (!grip) return;
  const set = (open) => { sheet.classList.toggle('open', open); grip.setAttribute('aria-expanded', String(open)); if (!open) sheet.scrollTop = 0; };
  grip.addEventListener('click', () => set(!sheet.classList.contains('open')));
  const stage = document.querySelector('.stage');
  if (stage) stage.addEventListener('pointerdown', (e) => { if (!e.target.closest('.bar')) set(false); });
})();
