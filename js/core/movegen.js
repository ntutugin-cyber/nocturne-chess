import {
  WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  F, C, KN_OFFS, KG_OFFS, B_OFFS, R_OFFS,
  onBoard, fileOf, rankOf, sqName, LETTERS, VALUES, isLight,
} from './constants.js';

const PROMOS = [QUEEN, ROOK, BISHOP, KNIGHT];

export function pseudoMoves(pos, capturesOnly = false) {
  const b = pos.board, color = pos.turn, out = [];
  const push = (from, to, flags = 0, promo = 0, captured = 0) =>
    out.push({ from, to, promo, flags, piece: b[from], captured: captured || b[to] });

  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = b[s];
    if (!p || Math.sign(p) !== color) continue;
    const t = Math.abs(p);

    if (t === PAWN) {
      const dir = 16 * color, start = color === WHITE ? 1 : 6, last = color === WHITE ? 7 : 0;
      const f1 = s + dir;
      if (onBoard(f1) && !b[f1]) {
        if ((f1 >> 4) === last) { for (const pr of PROMOS) push(s, f1, 0, pr); }
        else if (!capturesOnly) {
          push(s, f1);
          const f2 = s + 2 * dir;
          if ((s >> 4) === start && !b[f2]) push(s, f2, F.DOUBLE);
        }
      }
      for (const d of [dir - 1, dir + 1]) {
        const c = s + d;
        if (!onBoard(c)) continue;
        if (b[c] && Math.sign(b[c]) !== color) {
          if ((c >> 4) === last) { for (const pr of PROMOS) push(s, c, 0, pr, b[c]); }
          else push(s, c);
        } else if (c === pos.ep && !b[c]) push(s, c, F.EP, 0, -color * PAWN);
      }
    } else if (t === KNIGHT || t === KING) {
      for (const o of (t === KNIGHT ? KN_OFFS : KG_OFFS)) {
        const c = s + o;
        if (!onBoard(c)) continue;
        const q = b[c];
        if (!q) { if (!capturesOnly) push(s, c); }
        else if (Math.sign(q) !== color) push(s, c);
      }
      if (t === KING && !capturesOnly) {
        if (color === WHITE && s === 0x04) {
          if ((pos.castling & C.WK) && !b[0x05] && !b[0x06] && !pos.attacked(0x04, BLACK) && !pos.attacked(0x05, BLACK)) push(s, 0x06, F.CASTLE_K);
          if ((pos.castling & C.WQ) && !b[0x03] && !b[0x02] && !b[0x01] && !pos.attacked(0x04, BLACK) && !pos.attacked(0x03, BLACK)) push(s, 0x02, F.CASTLE_Q);
        } else if (color === BLACK && s === 0x74) {
          if ((pos.castling & C.BK) && !b[0x75] && !b[0x76] && !pos.attacked(0x74, WHITE) && !pos.attacked(0x75, WHITE)) push(s, 0x76, F.CASTLE_K);
          if ((pos.castling & C.BQ) && !b[0x73] && !b[0x72] && !b[0x71] && !pos.attacked(0x74, WHITE) && !pos.attacked(0x73, WHITE)) push(s, 0x72, F.CASTLE_Q);
        }
      }
    } else {
      const dirs = t === BISHOP ? B_OFFS : t === ROOK ? R_OFFS : KG_OFFS;
      for (const o of dirs) {
        let c = s + o;
        while (onBoard(c)) {
          const q = b[c];
          if (!q) { if (!capturesOnly) push(s, c); }
          else { if (Math.sign(q) !== color) push(s, c); break; }
          c += o;
        }
      }
    }
  }
  return out;
}

export function legalMoves(pos, from = -1) {
  const color = pos.turn, res = [];
  for (const m of pseudoMoves(pos)) {
    if (from !== -1 && m.from !== from) continue;
    const u = pos.make(m);
    if (!pos.attacked(pos.kings[color], -color)) res.push(m);
    pos.unmake(m, u);
  }
  return res;
}

export function legalCaptures(pos) {
  const color = pos.turn, res = [];
  for (const m of pseudoMoves(pos, true)) {
    const u = pos.make(m);
    if (!pos.attacked(pos.kings[color], -color)) res.push(m);
    pos.unmake(m, u);
  }
  return res;
}

export function hasLegalMoves(pos) {
  const color = pos.turn;
  for (const m of pseudoMoves(pos)) {
    const u = pos.make(m);
    const ok = !pos.attacked(pos.kings[color], -color);
    pos.unmake(m, u);
    if (ok) return true;
  }
  return false;
}

// Алгебраическая нотация (SAN)
export function san(pos, move) {
  let str;
  if (move.flags & F.CASTLE_K) str = 'O-O';
  else if (move.flags & F.CASTLE_Q) str = 'O-O-O';
  else {
    const t = Math.abs(move.piece);
    const capture = move.captured !== 0 || (move.flags & F.EP);
    if (t === PAWN) {
      str = (capture ? 'abcdefgh'[fileOf(move.from)] : '') + (capture ? 'x' : '') + sqName(move.to);
      if (move.promo) str += '=' + LETTERS[move.promo];
    } else {
      let dis = '';
      const others = legalMoves(pos).filter((m) => m.piece === move.piece && m.to === move.to && m.from !== move.from);
      if (others.length) {
        const sameFile = others.some((m) => fileOf(m.from) === fileOf(move.from));
        const sameRank = others.some((m) => rankOf(m.from) === rankOf(move.from));
        if (!sameFile) dis = 'abcdefgh'[fileOf(move.from)];
        else if (!sameRank) dis = String(rankOf(move.from) + 1);
        else dis = sqName(move.from);
      }
      str = LETTERS[t] + dis + (capture ? 'x' : '') + sqName(move.to);
    }
  }
  const u = pos.make(move);
  if (pos.inCheck(pos.turn)) str += hasLegalMoves(pos) ? '+' : '#';
  pos.unmake(move, u);
  return str;
}

export function insufficientMaterial(pos) {
  const minors = [];
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = pos.board[s];
    if (!p) continue;
    const t = Math.abs(p);
    if (t === KING) continue;
    if (t === PAWN || t === ROOK || t === QUEEN) return false;
    minors.push({ t, color: Math.sign(p), light: isLight(s) });
  }
  if (minors.length <= 1) return true;
  if (minors.length === 2 && minors[0].t === BISHOP && minors[1].t === BISHOP
    && minors[0].color !== minors[1].color && minors[0].light === minors[1].light) return true;
  return false;
}

// Статус партии. repetition — сколько раз встречалась текущая позиция.
export function gameStatus(pos, repetition = 1) {
  if (!hasLegalMoves(pos)) {
    if (pos.inCheck(pos.turn)) {
      const winner = -pos.turn;
      return { over: true, reason: 'checkmate', winner, result: winner === WHITE ? '1-0' : '0-1' };
    }
    return { over: true, reason: 'stalemate', winner: 0, result: '1/2-1/2' };
  }
  if (pos.half >= 100) return { over: true, reason: 'fifty', winner: 0, result: '1/2-1/2' };
  if (repetition >= 3) return { over: true, reason: 'repetition', winner: 0, result: '1/2-1/2' };
  if (insufficientMaterial(pos)) return { over: true, reason: 'material', winner: 0, result: '1/2-1/2' };
  return { over: false };
}

export function materialOf(pos, color) {
  let sum = 0;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = pos.board[s];
    if (p && Math.sign(p) === color) sum += VALUES[Math.abs(p)];
  }
  return sum;
}