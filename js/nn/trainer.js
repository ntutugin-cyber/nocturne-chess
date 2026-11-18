import { Emitter } from '../core/events.js';
import { Game } from '../core/game.js';
import { Position } from '../core/position.js';
import { legalMoves, materialOf } from '../core/movegen.js';
import { encode } from './features.js';
import { WHITE, BLACK } from '../core/constants.js';
import { Bot } from '../engine/bot.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Жадный выбор хода сетью (для игры против человека)
export function nnChoose(pos, net, epsilon = 0.05) {
  const moves = legalMoves(pos);
  if (!moves.length) return null;
  if (Math.random() < epsilon) return { move: moves[Math.floor(Math.random() * moves.length)], value: 0 };
  let best = null, bestScore = -Infinity, bestVal = 0;
  for (const m of moves) {
    const u = pos.make(m);
    const { x, active } = encode(pos);
    const v = net.forward(x, active);
    pos.unmake(m, u);
    const score = v * pos.turn + Math.random() * 1e-4;
    if (score > bestScore) { bestScore = score; best = m; bestVal = v; }
  }
  return { move: best, value: bestVal };
}

export class Trainer extends Emitter {
  constructor(net) {
    super();
    this.net = net;
    this.running = false;
    this.speed = 40; this.epsilon = 0.35; this.lr = 0.001;
    this.autoEps = true; this.autosave = true;
    this.stats = { games: 0, moves: 0, loss: 0.5, time: 0, results: { w: 0, d: 0, l: 0 } };
    this.series = { loss: [], eps: [], win: [] };
    this.lastResults = [];
    this.mode = 'train'; this.benchGame = 0; this.benchNNColor = WHITE; this.benchScore = 0;
    this.game = new Game();
    this.pending = { [WHITE]: null, [BLACK]: null };
    this._timer = null;
  }

  setNetwork(net, meta = null) {
    this.net = net;
    if (meta) {
      this.stats.games = meta.games || 0; this.stats.moves = meta.moves || 0;
      this.stats.loss = meta.loss ?? 0.5; this.stats.time = meta.time || 0;
      this.stats.results = meta.results || { w: 0, d: 0, l: 0 };
      this.epsilon = meta.epsilon ?? this.epsilon;
      this.series = meta.series || { loss: [], eps: [], win: [] };
    } else {
      this.stats = { games: 0, moves: 0, loss: 0.5, time: 0, results: { w: 0, d: 0, l: 0 } };
      this.series = { loss: [], eps: [], win: [] };
      this.lastResults = [];
    }
    this._newGame();
    this.emit('stats');
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.emit('state', true);
    this._loop();
  }
  pause() {
    this.running = false;
    clearTimeout(this._timer);
    this.emit('state', false);
    this.emit('stats');
  }

  _loop() {
    if (!this.running) return;
    const t0 = performance.now();
    const n = clamp(Math.round(this.speed * 0.04), 1, 24);
    for (let i = 0; i < n; i++) {
      this.step();
      if (performance.now() - t0 > 26) break;
    }
    this.stats.time += performance.now() - t0;
    this.emit('tick', { fen: this.game.pos.fen(), last: this.game.history[this.game.history.length - 1]?.move || null });
    this._timer = setTimeout(() => this._loop(), 40);
  }

  _newGame() {
    this.game = new Game();
    this.pending = { [WHITE]: null, [BLACK]: null };
  }

  step() {
    if (this.game.result) { this._finish(); return; }
    const pos = this.game.pos, color = pos.turn;
    const moves = legalMoves(pos);
    if (!moves.length) { this._finish(); return; }

    // Контрольная партия: соперник сети ходит случайно
    if (this.mode === 'bench' && color !== this.benchNNColor) {
      this.game.play(moves[Math.floor(Math.random() * moves.length)]);
      return;
    }

    const eps = this.mode === 'bench' ? 0 : this.epsilon;
    let chosen = null, val = 0;
    if (Math.random() < eps) {
      chosen = moves[Math.floor(Math.random() * moves.length)];
      const u = pos.make(chosen);
      const { x, active } = encode(pos);
      val = this.net.forward(x, active);
      pos.unmake(chosen, u);
    } else {
      let bestScore = -Infinity;
      for (const m of moves) {
        const u = pos.make(m);
        const { x, active } = encode(pos);
        const v = net_fwd(this.net, x, active);
        pos.unmake(m, u);
        const score = v * color + Math.random() * 1e-4;
        if (score > bestScore) { bestScore = score; chosen = m; val = v; }
      }
    }

    if (this.mode === 'train') {
      // TD(0): прогноз прошлой своей позиции → к прогнозу новой (+ шейпинг за материал)
      const prev = this.pending[color];
      const matNow = materialOf(pos, color);
      if (prev) {
        const shaping = 0.06 * Math.tanh((matNow - prev.mat) / 400);
        const target = clamp(val + shaping, -1, 1);
        const err = this.net.backward(prev.cache, target, this.lr);
        this.stats.loss = this.stats.loss * 0.98 + err * 0.02;
        this.stats.moves++;
      }
      const u = pos.make(chosen);
      const { x, active } = encode(pos);
      const cache = this.net.forward(x, active, true);
      pos.unmake(chosen, u);
      this.pending[color] = { cache, mat: materialOf(pos, color) - (chosen.captured ? Math.abs(chosen.captured) * 0 : 0) };
      // материал снимем после хода
      this.game.play(chosen);
      this.pending[color].mat = materialOf(this.game.pos, color);
    } else {
      this.game.play(chosen);
    }
  }

  _finish() {
    const res = this.game.result || { winner: 0, reason: 'stalemate' };
    const matDiff = materialOf(this.game.pos, WHITE) - materialOf(this.game.pos, BLACK);
    const final = res.winner === WHITE ? 1 : res.winner === BLACK ? -1 : clamp(matDiff / 3000, -0.2, 0.2);

    if (this.mode === 'train') {
      for (const c of [WHITE, BLACK]) {
        const p = this.pending[c];
        if (p) {
          const err = this.net.backward(p.cache, final, this.lr);
          this.stats.loss = this.stats.loss * 0.98 + err * 0.02;
          this.stats.moves++;
        }
      }
      this.stats.games++;
      const key = res.winner === WHITE ? 'w' : res.winner === BLACK ? 'l' : 'd';
      this.stats.results[key]++;
      this.lastResults.push(key);
      if (this.lastResults.length > 14) this.lastResults.shift();
      if (this.autoEps) this.epsilon = Math.max(0.05, this.epsilon * 0.997);
      this.series.loss.push(+this.stats.loss.toFixed(4));
      this.series.eps.push(+this.epsilon.toFixed(3));
      if (this.series.loss.length > 240) { this.series.loss.shift(); this.series.eps.shift(); }
      this.emit('gameend', { res, key });
      if (this.stats.games % 10 === 0) {
        this.mode = 'bench'; this.benchGame = 0; this.benchNNColor = WHITE; this.benchScore = 0;
      }
      if (this.autosave && this.stats.games % 5 === 0) this.emit('autosave');
    } else {
      if (res.winner === this.benchNNColor) this.benchScore += 1;
      else if (!res.winner) this.benchScore += 0.5;
      this.benchGame++;
      if (this.benchGame >= 2) {
        const rate = Math.round((this.benchScore / 2) * 100);
        this.series.win.push({ g: this.stats.games, r: rate });
        if (this.series.win.length > 120) this.series.win.shift();
        this.emit('bench', rate);
        this.mode = 'train';
      } else {
        this.benchNNColor = BLACK;
      }
    }
    this._newGame();
    this.emit('stats');
  }

  // Дообучение на партии человека против сети
  learnFromGame(game) {
    if (!game.result) return;
    const pos = new Position(game.startFen);
    const pend = { [WHITE]: null, [BLACK]: null };
    let updates = 0;
    for (const rec of game.history) {
      const color = Math.sign(rec.move.piece);
      pos.make(rec.move);
      const { x, active } = encode(pos);
      const cache = this.net.forward(x, active, true);
      const mat = materialOf(pos, color);
      const prev = pend[color];
      if (prev) {
        const shaping = 0.06 * Math.tanh((mat - prev.mat) / 400);
        this.net.backward(prev.cache, clamp(cache.value + shaping, -1, 1), this.lr);
        updates++;
      }
      pend[color] = { cache, mat };
    }
    const res = game.result;
    const matDiff = materialOf(pos, WHITE) - materialOf(pos, BLACK);
    const final = res.winner === WHITE ? 1 : res.winner === BLACK ? -1 : clamp(matDiff / 3000, -0.2, 0.2);
    for (const c of [WHITE, BLACK]) if (pend[c]) { this.net.backward(pend[c].cache, final, this.lr); updates++; }
    this.stats.moves += updates;
    this.emit('stats');
    return updates;
  }

  // Ручной тест: 2 партии против бота-новичка
  async benchmarkBot(onProgress) {
    const wasRunning = this.running;
    if (wasRunning) this.pause();
    const bot = new Bot(1);
    let score = 0;
    for (let g = 0; g < 2; g++) {
      const nnColor = g === 0 ? WHITE : BLACK;
      const game = new Game();
      let guard = 0;
      while (!game.result && guard++ < 400) {
        let m;
        if (game.turn === nnColor) m = nnChoose(game.pos, this.net, 0)?.move;
        else m = await bot.search(game.pos, { depth: 1, budget: 60 })?.then ? null : null;
        if (!m) {
          const r = await bot.search(game.pos, { depth: 1, budget: 60 });
          m = r?.move;
        }
        if (!m) break;
        game.play(m);
        onProgress?.(g, game.history.length);
        await new Promise((r) => setTimeout(r, 0));
      }
      const res = game.result;
      if (res?.winner === nnColor) score += 1;
      else if (res && !res.winner) score += 0.5;
    }
    if (wasRunning) this.start();
    return score;
  }

  meta() {
    return {
      games: this.stats.games, moves: this.stats.moves, loss: this.stats.loss,
      time: this.stats.time, results: this.stats.results, epsilon: this.epsilon,
      series: this.series,
    };
  }
}

function net_fwd(net, x, active) { return net.forward(x, active); }