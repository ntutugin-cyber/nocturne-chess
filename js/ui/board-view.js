import { WHITE, F, onBoard, fileOf, rankOf, fromSq, sqName, isLight, PAWN } from '../core/constants.js';
import { pieceSVG } from './pieces.js';
import { $ } from './common.js';

// ═══ Универсальная доска: клик + drag, анимации, стрелки, превращение ═══
export class BoardView {
  constructor(root, opts = {}) {
    this.root = root;
    this.orientation = opts.orientation || 'white';
    this.interactive = opts.interactive ?? false;
    this.canMove = opts.canMove || (() => true);
    this.legalProvider = opts.legalProvider || (() => []);
    this.onMove = opts.onMove || (() => {});
    this.onSquare = opts.onSquare || null;
    this.showDots = true;
    this.pos = null;
    this.pieceEls = new Map(); // sq → element
    this.squareEls = new Map();
    this.selected = -1;
    this.legal = [];
    this.lastMove = null;
    this.drag = null;
    this._promo = null;

    root.classList.add('nc-board');
    root.innerHTML = `
      <div class="board-frame"><div class="board-inner">
        <div class="squares"></div>
        <div class="pieces"></div>
        <svg class="arrows" viewBox="0 0 800 800"></svg>
      </div></div>`;
    this.frame = $('.board-frame', root);
    this.inner = $('.board-inner', root);
    this.squaresEl = $('.squares', root);
    this.piecesEl = $('.pieces', root);
    this.arrowsEl = $('.arrows', root);
    this._buildSquares();
    this._bind();
  }

  visual(sqIdx) {
    const f = fileOf(sqIdx), r = rankOf(sqIdx);
    return this.orientation === 'white' ? { col: f, row: 7 - r } : { col: 7 - f, row: r };
  }
  sqFromVisual(col, row) {
    return this.orientation === 'white' ? (7 - row) * 16 + col : row * 16 + (7 - col);
  }

  _buildSquares() {
    this.squaresEl.innerHTML = '';
    this.squareEls.clear();
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const s = this.sqFromVisual(col, row);
        const d = document.createElement('div');
        d.className = 'square ' + (isLight(s) ? 'light' : 'dark');
        d.dataset.sq = s;
        if (row === 7) d.insertAdjacentHTML('beforeend', `<span class="coord file">${'abcdefgh'[fileOf(s)]}</span>`);
        if (col === 0) d.insertAdjacentHTML('beforeend', `<span class="coord rank">${rankOf(s) + 1}</span>`);
        this.squaresEl.appendChild(d);
        this.squareEls.set(s, d);
      }
    }
    this._reapplyHighlights();
  }

  _place(el, sqIdx) {
    const { col, row } = this.visual(sqIdx);
    el.style.transform = `translate(${col * 100}%, ${row * 100}%)`;
  }

  _makePiece(p, sqIdx) {
    const el = document.createElement('div');
    el.className = 'piece';
    el.dataset.sq = sqIdx;
    el.innerHTML = pieceSVG(Math.abs(p), Math.sign(p));
    this._place(el, sqIdx);
    this.piecesEl.appendChild(el);
    this.pieceEls.set(sqIdx, el);
    return el;
  }

  _rebuild() {
    this.piecesEl.innerHTML = '';
    this.pieceEls.clear();
    if (!this.pos) return;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = this.pos.board[s];
      if (p) this._makePiece(p, s);
    }
  }

  setPosition(pos, { move = null, animate = true } = {}) {
    this.pos = pos;
    this._cancelPromo();
    if (move && animate && this.pieceEls.size) {
      const mover = -pos.turn;
      const el = this.pieceEls.get(move.from);
      const capSq = (move.flags & F.EP) ? move.to - 16 * mover : move.to;
      const capEl = this.pieceEls.get(capSq);
      if (capEl && capSq !== move.from) {
        this.pieceEls.delete(capSq);
        capEl.classList.add('captured');
        setTimeout(() => capEl.remove(), 220);
      }
      if (el) {
        this.pieceEls.delete(move.from);
        this.pieceEls.set(move.to, el);
        el.dataset.sq = move.to;
        el.classList.remove('dragging');
        this._place(el, move.to);
        if (move.promo) setTimeout(() => { el.innerHTML = pieceSVG(move.promo, mover); }, 190);
      }
      if (move.flags & F.CASTLE_K) this._slideRook(move.to + 1, move.to - 1);
      if (move.flags & F.CASTLE_Q) this._slideRook(move.to - 2, move.to + 1);
      this.lastMove = move;
    } else {
      this.lastMove = move;
      this._rebuild();
    }
    this.clearSelection();
    this._reapplyHighlights();
    this._applyCheck();
  }

  _slideRook(from, to) {
    const el = this.pieceEls.get(from);
    if (!el) return;
    this.pieceEls.delete(from);
    this.pieceEls.set(to, el);
    el.dataset.sq = to;
    this._place(el, to);
  }

  _applyCheck() {
    this.squareEls.forEach((d) => d.classList.remove('hl-check'));
    if (this.pos && this.pos.inCheck(this.pos.turn)) {
      this.squareEls.get(this.pos.kings[this.pos.turn])?.classList.add('hl-check');
    }
  }

  _reapplyHighlights() {
    this.squareEls.forEach((d) => d.classList.remove('hl-last', 'hl-selected', 'can-move', 'can-capture', 'hl-hover'));
    if (this.lastMove) {
      this.squareEls.get(this.lastMove.from)?.classList.add('hl-last');
      this.squareEls.get(this.lastMove.to)?.classList.add('hl-last');
    }
    if (this.selected >= 0) {
      this.squareEls.get(this.selected)?.classList.add('hl-selected');
      if (this.showDots) for (const m of this.legal) {
        this.squareEls.get(m.to)?.classList.add(m.captured ? 'can-capture' : 'can-move');
      }
    }
  }

  select(sqIdx) {
    this.selected = sqIdx;
    this.legal = this.legalProvider(sqIdx);
    this._reapplyHighlights();
  }
  clearSelection() {
    this.selected = -1; this.legal = [];
    this._reapplyHighlights();
  }

  // ─── Ввод ───
  _bind() {
    this.piecesEl.addEventListener('pointerdown', (e) => this._down(e));
    this.squaresEl.addEventListener('pointerdown', (e) => {
      const d = e.target.closest('.square');
      if (!d) return;
      const s = +d.dataset.sq;
      this.onSquare?.(s);
      if (!this.interactive || this._promo) return;
      if (this.selected >= 0 && this.legal.some((m) => m.to === s)) this._attempt(this.selected, s);
      else this.clearSelection();
    });
    window.addEventListener('pointermove', (e) => this._moveDrag(e));
    window.addEventListener('pointerup', (e) => this._up(e));
    window.addEventListener('pointercancel', (e) => this._up(e, true));
  }

  _down(e) {
    if (!this.interactive || !this.pos || this._promo) return;
    const el = e.target.closest('.piece');
    if (!el) return;
    const s = +el.dataset.sq;
    this.onSquare?.(s);
    const p = this.pos.board[s];
    // клик по вражеской фигуре = попытка взятия
    if (this.selected >= 0 && this.legal.some((m) => m.to === s)) {
      this._attempt(this.selected, s);
      return;
    }
    if (!p || Math.sign(p) !== this.pos.turn || !this.canMove(this.pos.turn)) return;
    if (this.selected === s) { this.clearSelection(); return; }
    this.select(s);
    this.drag = { el, sq: s, x0: e.clientX, y0: e.clientY, moved: false, id: e.pointerId };
    try { el.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  }

  _moveDrag(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    d.moved = true;
    d.el.classList.add('dragging');
    const rect = this.inner.getBoundingClientRect();
    const size = rect.width / 8;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    d.el.style.transform = `translate(${x}px, ${y}px)`;
    const col = Math.floor((e.clientX - rect.left) / size);
    const row = Math.floor((e.clientY - rect.top) / size);
    this.squareEls.forEach((sq) => sq.classList.remove('hl-hover'));
    if (col >= 0 && col < 8 && row >= 0 && row < 8) {
      const s = this.sqFromVisual(col, row);
      if (this.legal.some((m) => m.to === s)) this.squareEls.get(s)?.classList.add('hl-hover');
    }
  }

  _up(e, cancelled = false) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    d.el.classList.remove('dragging');
    this.squareEls.forEach((sq) => sq.classList.remove('hl-hover'));
    if (!d.moved) { this._place(d.el, d.sq); return; } // просто клик — фигура выбрана
    if (cancelled) { this._place(d.el, d.sq); return; }
    const rect = this.inner.getBoundingClientRect();
    const size = rect.width / 8;
    const col = Math.floor((e.clientX - rect.left) / size);
    const row = Math.floor((e.clientY - rect.top) / size);
    if (col >= 0 && col < 8 && row >= 0 && row < 8) {
      const s = this.sqFromVisual(col, row);
      if (this.legal.some((m) => m.to === s)) { this._attempt(d.sq, s); return; }
    }
    this._place(d.el, d.sq);
  }

  _attempt(from, to) {
    const candidates = this.legal.filter((m) => m.to === to);
    if (!candidates.length) return;
    if (candidates[0].promo) {
      this._showPromo(to, Math.sign(this.pos.board[from])).then((pr) => {
        if (pr) {
          const m = candidates.find((c) => c.promo === pr);
          this.clearSelection();
          this.onMove(m);
        } else {
          const el = this.pieceEls.get(from);
          if (el) this._place(el, from);
        }
      });
    } else {
      this.clearSelection();
      this.onMove(candidates[0]);
    }
  }

  _showPromo(to, color) {
    this._cancelPromo();
    return new Promise((resolve) => {
      const { col, row } = this.visual(to);
      const overlay = document.createElement('div');
      overlay.className = 'promo-overlay';
      const colEl = document.createElement('div');
      colEl.className = 'promo-col';
      colEl.style.width = '12.5%';
      colEl.style.left = col * 12.5 + '%';
      colEl.style.top = row <= 3 ? '0' : 'auto';
      colEl.style.bottom = row > 3 ? '0' : 'auto';
      for (const t of [5, 4, 3, 2]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = pieceSVG(t, color);
        b.addEventListener('click', (e) => { e.stopPropagation(); finish(t); });
        colEl.appendChild(b);
      }
      overlay.appendChild(colEl);
      overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) finish(null); });
      const finish = (v) => { overlay.remove(); this._promo = null; resolve(v); };
      this._promo = { overlay, finish };
      this.inner.appendChild(overlay);
    });
  }
  _cancelPromo() { if (this._promo) this._promo.finish(null); }

  // ─── Публичные подсветки ───
  setHighlights({ pulse = [], arrows = [] } = {}) {
    this.squareEls.forEach((d) => d.classList.remove('hl-target'));
    for (const name of pulse) this.squareEls.get(fromSq(name))?.classList.add('hl-target');
    this._arrows = arrows;
    this._drawArrows();
  }
  _drawArrows() {
    const arrows = this._arrows || [];
    this.arrowsEl.innerHTML = arrows.map((a) => {
      const f = this.visual(fromSq(a.from)), t = this.visual(fromSq(a.to));
      const x1 = f.col * 100 + 50, y1 = f.row * 100 + 50, x2 = t.col * 100 + 50, y2 = t.row * 100 + 50;
      const color = a.color === 'violet' ? '#a78bfa' : a.color === 'cyan' ? '#39d0ff' : '#e8b64c';
      const marker = a.color === 'violet' ? 'ncArrowViolet' : a.color === 'cyan' ? 'ncArrowCyan' : 'ncArrowGold';
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      const ex = x2 - (dx / len) * 26, ey = y2 - (dy / len) * 26;
      return `<line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" stroke="${color}" stroke-width="14" stroke-linecap="round" opacity=".8" marker-end="url(#${marker})"/>`;
    }).join('');
  }
  mark(sqIdx, on) { this.squareEls.get(sqIdx)?.classList.toggle('marked', on); }
  clearMarks() { this.squareEls.forEach((d) => d.classList.remove('marked')); }
  shake() { this.root.classList.remove('shake'); void this.root.offsetWidth; this.root.classList.add('shake'); }

  setOrientation(o) {
    if (this.orientation === o) return;
    this.orientation = o;
    this._buildSquares();
    this.pieceEls.forEach((el, s) => this._place(el, s));
    this._applyCheck();
    this._drawArrows();
  }
  setInteractive(v) { this.interactive = v; this.root.classList.toggle('locked', !v); if (!v) this.clearSelection(); }
  setShowDots(v) { this.showDots = v; this.root.classList.toggle('no-dots', !v); }
  setCoords(v) { this.root.classList.toggle('no-coords', !v); }
}