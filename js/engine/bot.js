import { legalMoves, legalCaptures } from '../core/movegen.js';
import { evaluate, VALUES } from './evaluate.js';
import { QUEEN } from '../core/constants.js';

const MATE = 100000, INF = 1e9, TIMEOUT = Symbol('timeout');
const sleep0 = () => new Promise((r) => setTimeout(r, 0));

function order(moves) {
  for (const m of moves) {
    m._o = (m.captured ? 10 * VALUES[Math.abs(m.captured)] - VALUES[Math.abs(m.piece)] : 0)
      + (m.promo ? VALUES[m.promo] : 0);
  }
  moves.sort((a, b) => b._o - a._o);
  return moves;
}

export class Bot {
  constructor(level = 2) { this.setLevel(level); this.nodes = 0; }
  setLevel(level) {
    this.level = level;
    this.depth = [1, 2, 3][level - 1] || 2;
    this.budget = [150, 550, 1500][level - 1] || 550;
    this.jitter = [45, 10, 0][level - 1] || 0;
  }

  negamax(pos, depth, alpha, beta, ply, start, budget) {
    this.nodes++;
    if ((this.nodes & 1023) === 0 && performance.now() - start > budget) throw TIMEOUT;
    if (depth <= 0) return this.quiesce(pos, alpha, beta, 0, start, budget);
    const moves = order(legalMoves(pos));
    if (!moves.length) return pos.inCheck(pos.turn) ? -(MATE - ply) : 0;
    let best = -INF;
    for (const m of moves) {
      const u = pos.make(m);
      let s;
      try { s = -this.negamax(pos, depth - 1, -beta, -alpha, ply + 1, start, budget); }
      finally { pos.unmake(m, u); }
      if (s > best) best = s;
      if (s > alpha) alpha = s;
      if (alpha >= beta) break;
    }
    return best;
  }

  quiesce(pos, alpha, beta, qd, start, budget) {
    this.nodes++;
    if ((this.nodes & 1023) === 0 && performance.now() - start > budget) throw TIMEOUT;
    const stand = evaluate(pos) * pos.turn;
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (qd >= 4) return alpha;
    for (const m of order(legalCaptures(pos))) {
      if (stand + VALUES[Math.abs(m.captured)] + 200 < alpha && !m.promo) continue;
      const u = pos.make(m);
      let s;
      try { s = -this.quiesce(pos, -beta, -alpha, qd + 1, start, budget); }
      finally { pos.unmake(m, u); }
      if (s >= beta) return beta;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }

  // Возвращает {move, score, all:[{move,score}]} — оценки со стороны ходящего
  async search(pos, { depth = 2, budget = 500, jitter = 0 } = {}) {
    const start = performance.now();
    this.nodes = 0;
    let rootMoves = order(legalMoves(pos));
    if (!rootMoves.length) return null;
    if (rootMoves.length === 1) return { move: rootMoves[0], score: 0, all: [{ move: rootMoves[0], score: 0 }] };
    let best = rootMoves[0], bestScore = -INF, lastAll = null;

    for (let d = 1; d <= depth; d++) {
      let alpha = -INF, iterBest = null, iterScore = -INF;
      const scores = [];
      let completed = true;
      for (const m of rootMoves) {
        const u = pos.make(m);
        let s = null;
        try { s = -this.negamax(pos, d - 1, -INF, -alpha, 1, start, budget); }
        catch (e) { if (e !== TIMEOUT) throw e; completed = false; }
        finally { pos.unmake(m, u); }
        if (s === null) break;
        scores.push({ move: m, score: s });
        if (s > iterScore) { iterScore = s; iterBest = m; }
        if (s > alpha) alpha = s;
        await sleep0();
        if (performance.now() - start > budget && d > 1) { completed = false; break; }
      }
      if (iterBest && (completed || d === 1)) {
        best = iterBest; bestScore = iterScore;
        lastAll = scores;
        rootMoves = scores.slice().sort((a, b) => b.score - a.score).map((x) => x.move);
      }
      if (!completed || performance.now() - start > budget) break;
    }

    if (jitter && lastAll) {
      const top = lastAll.filter((x) => x.score >= bestScore - jitter);
      const pick = top[Math.floor(Math.random() * top.length)];
      return { move: pick.move, score: pick.score, all: lastAll };
    }
    return { move: best, score: bestScore, all: lastAll || [{ move: best, score: bestScore }] };
  }

  async chooseMove(pos) { return (await this.search(pos, { depth: this.depth, budget: this.budget, jitter: this.jitter }))?.move || null; }
}

export const sharedBot = new Bot(2);
export { MATE };