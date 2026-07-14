// cylinder.js — an iOS-style rotating-drum picker. No deps.
//
//   const cyl = new Cylinder(el, items, { onChange });
//   cyl.setItems(items);           // swap the whole list (e.g. new category)
//   cyl.setIndex(i, { silent });   // select programmatically
//   cyl.index / cyl.value          // current selection
//
// items: [{ label, sym }]. The centered item is the selection. Works by native
// scroll + CSS scroll-snap; a scroll listener applies the 3D rotateX/opacity per
// item (the drum look) and commits the selection when scrolling settles. Click an
// item, drag/scroll, or arrow-key to pick.

const ITEM = 40;          // px, must match .cyl-item height
const VISIBLE = 5;        // rows shown (odd) — must match .cyl height / ITEM
const HALF = (VISIBLE - 1) / 2;
const ANGLE = 20;         // deg per row of tilt

export class Cylinder {
  constructor(el, items, opts = {}) {
    this.el = el;
    this.onChange = opts.onChange || (() => {});
    this.index = 0;
    this._raf = 0;
    this._settle = 0;

    el.classList.add('cyl');
    el.innerHTML = `<div class="cyl-scroll"></div><div class="cyl-center"></div><div class="cyl-mask"></div>`;
    this.scroll = el.querySelector('.cyl-scroll');
    this.pad = HALF * ITEM;

    el.tabIndex = 0;
    el.setAttribute('role', 'listbox');
    this.scroll.addEventListener('scroll', () => this._onScroll(), { passive: true });
    el.addEventListener('keydown', e => this._onKey(e));

    this.setItems(items, { silent: true });
  }

  setItems(items, { silent = false } = {}) {
    this.items = items;
    this.scroll.innerHTML =
      `<div style="height:${this.pad}px"></div>` +
      items.map((it, i) => `<div class="cyl-item" data-i="${i}" role="option"><span class="cn">${it.label}</span>${it.sym ? `<span class="cs">${it.sym}</span>` : ''}</div>`).join('') +
      `<div style="height:${this.pad}px"></div>`;
    this.scroll.querySelectorAll('.cyl-item').forEach(node => {
      node.addEventListener('click', () => this.setIndex(+node.dataset.i));
    });
    this._itemNodes = [...this.scroll.querySelectorAll('.cyl-item')];
    const i = Math.min(this.index, items.length - 1);
    this.index = -1;
    this.setIndex(Math.max(0, i), { silent, instant: true });
  }

  get value() { return this.items[this.index]; }

  setIndex(i, { silent = false, instant = false } = {}) {
    i = Math.max(0, Math.min(i, this.items.length - 1));
    const changed = i !== this.index;
    this.index = i;
    this._suppress = true;
    this.scroll.scrollTo({ top: i * ITEM, behavior: instant ? 'auto' : 'smooth' });
    // if already at position, scroll event may not fire — repaint + release now
    requestAnimationFrame(() => { this._paint(); this._suppress = false; });
    this._mark();
    if (changed && !silent) this.onChange(this.value, i);
  }

  _onScroll() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this._paint(); });
    clearTimeout(this._settle);
    this._settle = setTimeout(() => this._commit(), 90);
  }

  _paint() {
    const mid = this.scroll.scrollTop / ITEM;   // fractional index at center
    for (let k = 0; k < this._itemNodes.length; k++) {
      const off = k - mid;                       // rows from center
      const a = Math.max(-3.4, Math.min(3.4, off));
      const node = this._itemNodes[k];
      const dist = Math.abs(off);
      if (dist > HALF + 1.2) { node.style.opacity = '0'; node.style.transform = 'rotateX(90deg)'; continue; }
      node.style.opacity = String(Math.max(0, 1 - dist / (HALF + 0.6)));
      node.style.transform = `rotateX(${a * ANGLE}deg) scale(${1 - dist * 0.06})`;
    }
  }

  _commit() {
    const i = Math.round(this.scroll.scrollTop / ITEM);
    const clamped = Math.max(0, Math.min(i, this.items.length - 1));
    if (clamped !== this.index) {
      this.index = clamped; this._mark();
      if (!this._suppress) this.onChange(this.value, clamped);
    } else { this._mark(); }
  }

  _mark() {
    this._itemNodes.forEach((n, k) => n.classList.toggle('on', k === this.index));
  }

  _onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); this.setIndex(this.index + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.setIndex(this.index - 1); }
    else if (e.key === 'Home') { e.preventDefault(); this.setIndex(0); }
    else if (e.key === 'End') { e.preventDefault(); this.setIndex(this.items.length - 1); }
  }
}
