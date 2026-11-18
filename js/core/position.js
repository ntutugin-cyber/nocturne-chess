import {
  WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  F, C, CORNER, KN_OFFS, KG_OFFS, B_OFFS, R_OFFS,
  onBoard, sq, sqName, fromSq, START_FEN,
} from './constants.js';

const FEN_MAP = { p: -PAWN, n: -KNIGHT, b: -BISHOP, r: -ROOK, q: -QUEEN, k: -KING,
  P: PAWN, N: KNIGHT, B: BISHOP, R: ROOK, Q: QUEEN, K: KING };
const FEN_REV = {}; for (const [k, v] of Object.entries(FEN_MAP)) FEN_REV[v] = k;

export class Position {
  constructor(fen = START_FEN) {
    this.board = new Int8Array(128);
    this.turn = WHITE; this.castling = 0; this.ep = -1;
    this.half = 0; this.full = 1;
    this.kings = { [WHITE]: -1, [BLACK]: -1 };
    this.setFen(fen);
  }

  setFen(fen) {
    this.board.fill(0);
    const parts = fen.trim().split(/\s+/);
    const ranks = parts[0].split('/');
    for (let r = 7; r >= 0; r--) {
      let f = 0;
      for (const ch of ranks[7 - r]) {
        if (/\d/.test(ch)) { f += +ch; continue; }
        const p = FEN_MAP[ch];
        const s = sq(f, r);
        this.board[s] = p;
        if (Math.abs(p) === KING) this.kings[Math.sign(p)] = s;
        f++;
      }
    }
    this.turn = parts[1] === 'b' ? BLACK : WHITE;
    this.castling = 0;
    if (parts[2] && parts[2] !== '-') {
      if (parts[2].includes('K')) this.castling |= C.WK;
      if (parts[2].includes('Q')) this.castling |= C.WQ;
      if (parts[2].includes('k')) this.castling |= C.BK;
      if (parts[2].includes('q')) this.castling |= C.BQ;
    }
    this.ep = parts[3] && parts[3] !== '-' ? fromSq(parts[3]) : -1;
    this.half = +(parts[4] || 0); this.full = +(parts[5] || 1);
  }

  fen() {
    const rows = [];
    for (let r = 7; r >= 0; r--) {
      let row = '', empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.board[sq(f, r)];
        if (!p) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        row += FEN_REV[p];
      }
      if (empty) row += empty;
      rows.push(row);
    }
    let c = '';
    if (this.castling & C.WK) c += 'K'; if (this.castling & C.WQ) c += 'Q';
    if (this.castling & C.BK) c += 'k'; if (this.castling & C.BQ) c += 'q';
    return `${rows.join('/')} ${this.turn === WHITE ? 'w' : 'b'} ${c || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.half} ${this.full}`;
  }

  clone() { return new Position(this.fen()); }

  // Ключ для троекратного повторения
  key() {
    let s = '';
    for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } s += this.board[i] + ','; }
    return s + '|' + this.turn + '|' + this.castling + '|' + this.ep;
  }

  // Атаковано ли поле s фигурой цвета by
  attacked(s, by) {
    const b = this.board;
    const pd = by === WHITE ? -16 : 16;
    for (const o of [pd - 1, pd + 1]) { const c = s + o; if (onBoard(c) && b[c] === by * PAWN) return true; }
    for (const o of KN_OFFS) { const c = s + o; if (onBoard(c) && b[c] === by * KNIGHT) return true; }
    for (const o of KG_OFFS) { const c = s + o; if (onBoard(c) && b[c] === by * KING) return true; }
    for (const o of R_OFFS) {
      let c = s + o;
      while (onBoard(c)) { const q = b[c]; if (q) { if (q === by * ROOK || q === by * QUEEN) return true; break; } c += o; }
    }
    for (const o of B_OFFS) {
      let c = s + o;
      while (onBoard(c)) { const q = b[c]; if (q) { if (q === by * BISHOP || q === by * QUEEN) return true; break; } c += o; }
    }
    return false;
  }

  // Все фигуры цвета by, атакующие поле s (для разбора мата)
  attackers(s, by) {
    const b = this.board, res = [];
    const pd = by === WHITE ? -16 : 16;
    for (const o of [pd - 1, pd + 1]) { const c = s + o; if (onBoard(c) && b[c] === by * PAWN) res.push(c); }
    for (const o of KN_OFFS) { const c = s + o; if (onBoard(c) && b[c] === by * KNIGHT) res.push(c); }
    for (const o of KG_OFFS) { const c = s + o; if (onBoard(c) && b[c] === by * KING) res.push(c); }
    for (const [offs, t1] of [[R_OFFS, ROOK], [B_OFFS, BISHOP]]) {
      for (const o of offs) {
        let c = s + o;
        while (onBoard(c)) { const q = b[c]; if (q) { if (q === by * t1 || q === by * QUEEN) res.push(c); break; } c += o; }
      }
    }
    return res;
  }

  inCheck(color = this.turn) { return this.attacked(this.kings[color], -color); }

  make(m) {
    const b = this.board, color = this.turn, piece = b[m.from];
    const u = { piece, captured: 0, capSq: m.to, castling: this.castling, ep: this.ep, half: this.half, full: this.full };
    let captured = b[m.to];
    if (m.flags & F.EP) { u.capSq = m.to - 16 * color; captured = b[u.capSq]; b[u.capSq] = 0; }
    u.captured = captured;
    b[m.to] = m.promo ? m.promo * color : piece;
    b[m.from] = 0;
    if (m.flags & F.CASTLE_K) { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = 0; }
    if (m.flags & F.CASTLE_Q) { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = 0; }
    if (Math.abs(piece) === KING) { this.kings[color] = m.to; this.castling &= color === WHITE ? ~3 : ~12; }
    this.castling &= ~(CORNER[m.from] || 0);
    this.castling &= ~(CORNER[m.to] || 0);
    this.ep = (m.flags & F.DOUBLE) ? m.from + 16 * color : -1;
    this.half = (Math.abs(piece) === PAWN || captured) ? 0 : this.half + 1;
    if (color === BLACK) this.full++;
    this.turn = -color;
    return u;
  }

  unmake(m, u) {
    this.turn = -this.turn;
    const color = this.turn, b = this.board;
    b[m.from] = u.piece; b[m.to] = 0;
    if (u.captured) b[u.capSq] = u.captured;
    if (m.flags & F.CASTLE_K) { b[m.to + 1] = b[m.to - 1]; b[m.to - 1] = 0; }
    if (m.flags & F.CASTLE_Q) { b[m.to - 2] = b[m.to + 1]; b[m.to + 1] = 0; }
    if (Math.abs(u.piece) === KING) this.kings[color] = m.from;
    this.castling = u.castling; this.ep = u.ep; this.half = u.half; this.full = u.full;
  }
}