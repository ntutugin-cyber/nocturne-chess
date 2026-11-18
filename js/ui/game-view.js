import { Game } from '../core/game.js';
import { Position } from '../core/position.js';
import { Bot } from '../engine/bot.js';
import { evaluate } from '../engine/evaluate.js';
import { nnChoose } from '../nn/trainer.js';
import { detectOpening } from '../data/openings.js';
import { BoardView } from './board-view.js';
import { pieceSVG, pieceChip } from './pieces.js';
import { buildAnalysis, renderAnalysis, analysisHeader } from './analysis.js';
import { $, $$, toast, openModal, closeModal, confirmDialog, bindSwitch, copyText, clamp, fmtTime, icon, sleep } from './common.js';
import { sound } from './sound.js';
import { WHITE, BLACK, VALUES, START_FEN } from '../core/constants.js';

const BOT_NAMES = { 1: 'Бот · Новичок', 2: 'Бот · Любитель', 3: 'Бот · Мастер' };
const TIPS = [
  'Захвати центр пешками e/d, выведи коней и слонов, рокируйся.',
  'Перед ходом спроси: что угрожает соперник после его последнего хода?',
  'Конь на краю доски — позор и срам: кони сильны в центре.',
  'Две ладьи на открытой линии — страшная сила.',
  'Не меняй ферзя на коня: 9 против 3 — плохая сделка.',
  'В эндшпиле король — боец: веди его к центру.',
  'Ищи вилки: конь, атакующий две фигуры сразу, выигрывает материал.',
];

export class GameView {
  constructor({ trainer }) {
    this.trainer = trainer;
    this.game = new Game();
    this.bot = new Bot(2);
    this.mode = 'bot';
    this.playerColor = WHITE;
    this.botLevel = 2;
    this.nnEps = 0.08;
    this.nnLearn = false;
    this.thinking = false;
    this.token = 0;
    this.reviewPly = null;
    this.startedAt = null;
    this.settings = { colors: 'white', mode: 'bot', level: 2 };

    this.board = new BoardView($('#playBoard'), {
      interactive: true,
      canMove: (c) => this._canMove(c),
      legalProvider: (from) => this.game.moves(from),
      onMove: (m) => this._playerMove(m),
    });

    this._bindUI();
    this._renderAll();
    setInterval(() => { $('#playTip').textContent = TIPS[Math.floor(Date.now() / 15000) % TIPS.length]; }, 15000);
  }

  _bindUI() {
    $('#btnNewGame').addEventListener('click', () => this.openNewGame());
    $('#btnFlip').addEventListener('click', () => this.flip());
    $('#btnUndo').addEventListener('click', () => this.undo());
    $('#btnHintMove').addEventListener('click', () => this.hint());
    $('#btnResign').addEventListener('click', async () => {
      if (!this.startedAt || this.game.result) return;
      if (await confirmDialog('Сдаться в этой партии? Сопернику будет засчитана победа.', 'Сдача партии')) {
        this.token++;
        this.game.resign(this.mode === 'human' ? this.game.turn : this.playerColor);
        this._onEnd();
      }
    });
    $('#btnCopyPgn').addEventListener('click', () => this._copyPgn());
    $('#btnCopyPgn2').addEventListener('click', () => this._copyPgn());
    $('#btnAnalysis').addEventListener('click', () => this._openAnalysis());
    $('#btnRematch').addEventListener('click', () => { closeModal('modal-analysis'); this._start(); });
    $('#btnExitReview').addEventListener('click', () => this._exitReview());
    $('#btnPrevPly').addEventListener('click', () => this._reviewStep(-1));
    $('#btnNextPly').addEventListener('click', () => this._reviewStep(1));

    bindSwitch($('#tglDots'), true, (v) => this.board.setShowDots(v));
    bindSwitch($('#tglCoords'), true, (v) => this.board.setCoords(v));

    // форма новой партии
    const form = $('#ngForm');
    $$('input[name="ngMode"]', form).forEach((r) => r.addEventListener('change', () => this._ngModeUI()));
    $$('#ngBotLevel button').forEach((b) => b.addEventListener('click', () => {
      $$('#ngBotLevel button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    }));
    bindSwitch($('#ngNNLearn'), false, (v) => { this.nnLearn = v; });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.mode = form.ngMode.value;
      this.settings.colors = $('#ngColor').value;
      this.botLevel = +($('#ngBotLevel .on')?.dataset.lv || 2);
      this.nnEps = +$('#ngNNEps').value;
      closeModal('modal-newgame');
      this._start();
    });

    document.addEventListener('keydown', (e) => {
      if (!$('#view-play').classList.contains('active')) return;
      if (e.target.matches('input, select, textarea')) return;
      if (e.key === 'ArrowLeft') { this.reviewPly === null ? this._enterReview(this.game.history.length - 1) : this._reviewStep(-1); }
      if (e.key === 'ArrowRight') { if (this.reviewPly !== null) this._reviewStep(1); }
      if (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'а') this.flip();
    });
  }

  _ngModeUI() {
    const mode = $('#ngForm').ngMode.value;
    $('#ngBotOpts').hidden = mode !== 'bot';
    $('#ngNNOpts').hidden = mode !== 'nn';
    const trained = this.trainer.stats.games;
    $('#ngNNNote').textContent = trained > 0
      ? `Сеть обучена на ${trained} партиях самоигры (${this.trainer.stats.moves} обновлений весов).`
      : 'Сеть ещё не обучалась — сыграет почти случайно. Обучите её на вкладке «Нейросеть».';
    $('#ngColor').disabled = mode === 'human';
  }

  openNewGame() { this._ngModeUI(); openModal('modal-newgame'); }

  _start() {
    this.token++;
    this.thinking = false;
    this.reviewPly = null;
    $('#reviewBar').hidden = true;
    $('#btnAnalysis').hidden = true;
    this.game = new Game();
    this.bot.setLevel(this.botLevel);
    const colors = this.settings.colors;
    this.playerColor = this.mode === 'human' ? WHITE
      : colors === 'random' ? (Math.random() < 0.5 ? WHITE : BLACK)
      : colors === 'black' ? BLACK : WHITE;
    this.startedAt = Date.now();
    this.board.setOrientation(this.playerColor === WHITE ? 'white' : 'black');
    $('#evalBar').classList.toggle('flipped', this.playerColor === BLACK);
    this.board.setPosition(this.game.pos, { animate: false });
    this.board.setInteractive(true);
    this._renderAll();
    sound.play('click');
    toast(this.mode === 'human' ? 'Партия вдвоём началась. Ходят белые.' : `Партия началась! Вы играете ${this.playerColor === WHITE ? 'белыми' : 'чёрными'}.`, 'success');
    if (this.mode !== 'human' && this.game.turn !== this.playerColor) this._opponentTurn();
  }

  _canMove(c) {
    if (!this.startedAt || this.game.result || this.reviewPly !== null || this.thinking) return false;
    return this.mode === 'human' || c === this.playerColor;
  }

  _playerMove(m) {
    if (!this._canMove(this.game.turn)) return;
    this.game.play(m);
    this._afterMove(m);
    if (!this.game.result && this.mode !== 'human') this._opponentTurn();
  }

  _afterMove(m) {
    this.board.setPosition(this.game.pos, { move: m });
    if (this.game.result?.reason === 'checkmate') { /* звук ниже */ }
    else if (this.game.pos.inCheck(this.game.turn)) sound.play('check');
    else if (m.flags & 12) sound.play('castle');
    else if (m.promo) sound.play('promote');
    else sound.play(m.captured ? 'capture' : 'move');
    this._renderAll();
    if (this.game.result) this._onEnd();
  }

  async _opponentTurn() {
    const token = ++this.token;
    this.thinking = true;
    this._renderStatus();
    this._renderThinking();
    await sleep(380);
    let move = null;
    if (this.mode === 'bot') move = await this.bot.chooseMove(this.game.pos);
    else if (this.mode === 'nn') move = nnChoose(this.game.pos, this.trainer.net, this.nnEps)?.move;
    if (token !== this.token) return; // отменено (новая партия / отмена хода)
    this.thinking = false;
    if (!move) { this._renderAll(); return; }
    this.game.play(move);
    this._afterMove(move);
  }

  _onEnd() {
    this.thinking = false;
    this.token++;
    const r = this.game.result;
    if (!r) return;
    const iWon = this.mode !== 'human' && r.winner === this.playerColor;
    sound.play(!r.winner ? 'draw' : this.mode === 'human' ? 'win' : iWon ? 'win' : 'lose');
    this._renderAll();
    if (this.mode === 'nn' && this.nnLearn) {
      const n = this.trainer.learnFromGame(this.game);
      if (n) toast(`Сеть дообучена на этой партии: ${n} обновлений весов.`, 'info');
    }
    setTimeout(() => this._openAnalysis(), 900);
  }

  async _openAnalysis() {
    if (!this.game.result) return;
    const names = this._names();
    const ctx = {
      playerColor: this.mode === 'human' ? null : this.playerColor,
      names, duration: this.startedAt ? fmtTime(Date.now() - this.startedAt) : null,
    };
    const head = analysisHeader(this.game, ctx);
    $('#analysisTitle').textContent = head.title;
    $('#analysisSub').textContent = head.sub;
    $('#analysisIcon').className = 'ah-icon ' + head.cls;
    $('#analysisIcon').innerHTML = head.iconHtml;
    $('#analysisBody').innerHTML = '';
    $('#analysisProgress').hidden = false;
    $('#apFill').style.width = '0%';
    openModal('modal-analysis');
    const total = Math.max(1, this.game.history.length);
    const a = await buildAnalysis(this.game, ctx, (i, n) => {
      $('#apFill').style.width = Math.round((i / n) * 100) + '%';
      $('#apText').textContent = `Анализируем ход ${i} из ${n}…`;
    });
    $('#analysisProgress').hidden = true;
    $('#analysisBody').innerHTML = renderAnalysis(a, this.game, ctx);
    $$('#analysisBody .move-cell').forEach((b) => b.addEventListener('click', () => {
      closeModal('modal-analysis');
      this._enterReview(+b.dataset.ply - 1);
    }));
    this._lastAnalysis = a;
  }

  _names() {
    if (this.mode === 'human') return { [WHITE]: 'Белые (игрок 1)', [BLACK]: 'Чёрные (игрок 2)' };
    const opp = this.mode === 'bot' ? BOT_NAMES[this.botLevel] : `Нейросеть · ${this.trainer.stats.games} партий`;
    return { [this.playerColor]: 'Вы', [-this.playerColor]: opp };
  }

  // ─── Просмотр истории ───
  _positions() {
    const arr = [new Position(this.game.startFen)];
    const p = new Position(this.game.startFen);
    for (const rec of this.game.history) { p.make(rec.move); arr.push(p.clone()); }
    return arr;
  }
  _enterReview(ply) {
    if (!this.game.history.length) return;
    this.reviewPly = clamp(ply, -1, this.game.history.length - 1);
    this._renderReview();
  }
  _reviewStep(d) {
    if (this.reviewPly === null) return;
    const next = this.reviewPly + d;
    if (next >= this.game.history.length - 1 && d > 0) { this._exitReview(); return; }
    this.reviewPly = clamp(next, -1, this.game.history.length - 1);
    this._renderReview();
  }
  _renderReview() {
    const positions = this._positions();
    const idx = this.reviewPly + 1;
    this.board.setPosition(positions[idx], { animate: false, move: this.reviewPly >= 0 ? this.game.history[this.reviewPly].move : null });
    this.board.setInteractive(false);
    $('#reviewBar').hidden = false;
    $('#reviewLabel').textContent = this.reviewPly < 0 ? 'Начальная позиция' : `Ход ${Math.ceil((this.reviewPly + 1) / 2)}: ${this.game.history[this.reviewPly].san}`;
    this._renderMoves();
  }
  _exitReview() {
    this.reviewPly = null;
    $('#reviewBar').hidden = true;
    this.board.setPosition(this.game.pos, { animate: false, move: this.game.history[this.game.history.length - 1]?.move || null });
    this.board.setInteractive(true);
    this._renderMoves();
  }

  // ─── Кнопки ───
  flip() {
    this.board.setOrientation(this.board.orientation === 'white' ? 'black' : 'white');
    $('#evalBar').classList.toggle('flipped', this.board.orientation === 'black');
    this._renderPlayers();
    sound.play('click');
  }
  undo() {
    if (!this.startedAt || this.thinking && this.mode === 'human') return;
    if (!this.game.history.length) { toast('Пока нечего отменять.', 'info'); return; }
    this.token++;
    this.thinking = false;
    if (this.reviewPly !== null) this._exitReview();
    this.game.undo();
    if (this.mode !== 'human' && this.game.turn !== this.playerColor && this.game.history.length) this.game.undo();
    $('#btnAnalysis').hidden = true;
    this.board.setPosition(this.game.pos, { animate: false, move: this.game.history[this.game.history.length - 1]?.move || null });
    sound.play('click');
    this._renderAll();
    if (this.mode !== 'human' && this.game.turn !== this.playerColor) this._opponentTurn();
  }
  async hint() {
    if (!this.startedAt || this.game.result || this.thinking || this.reviewPly !== null) return;
    if (this.mode !== 'human' && this.game.turn !== this.playerColor) return;
    const btn = $('#btnHintMove');
    btn.disabled = true;
    const res = await this.bot.search(this.game.pos, { depth: 2, budget: 400 });
    btn.disabled = false;
    if (res?.move) {
      const { sqName } = await import('../core/constants.js');
      this.board.setHighlights({ arrows: [{ from: sqName(res.move.from), to: sqName(res.move.to), color: 'cyan' }] });
      toast(`Подсказка: ${this.game.moves().find((m) => m.from === res.move.from && m.to === res.move.to) ? '' : ''}${sqName(res.move.from)} → ${sqName(res.move.to)}`, 'info');
      setTimeout(() => this.board.setHighlights({}), 3500);
    }
  }
  _copyPgn() {
    const names = this._names();
    copyText(this.game.pgn({ white: names[WHITE], black: names[BLACK] }))
      .then(() => toast('PGN скопирован в буфер обмена.', 'success'))
      .catch(() => toast('Не удалось скопировать.', 'error'));
  }

  // ─── Рендер панелей ───
  _renderAll() {
    this._renderStatus();
    this._renderPlayers();
    this._renderMoves();
    this._renderEval();
    this._renderThinking();
    const ended = !!this.game.result;
    $('#btnAnalysis').hidden = !ended;
    $('#btnResign').disabled = !this.startedAt || ended;
    $('#btnUndo').disabled = !this.game.history.length;
    $('#btnHintMove').disabled = !this.startedAt || ended || this.thinking;
    $('#btnCopyPgn').disabled = !this.game.history.length;
    const opening = detectOpening(this.game.history.map((r) => r.san));
    $('#openingTag').hidden = !opening;
    if (opening) $('#openingTag').textContent = 'Дебют: ' + opening;
  }

  _renderStatus() {
    const el = $('#statusLine');
    el.className = 'status-line';
    if (!this.startedAt) { el.textContent = 'Нажмите «Новая партия», чтобы начать.'; return; }
    const r = this.game.result;
    if (r) {
      if (!r.winner) { el.textContent = 'Ничья — ' + { stalemate: 'пат', fifty: 'правило 50 ходов', repetition: 'повторение', material: 'недостаточно материала' }[r.reason]; el.classList.add('draw'); }
      else if (this.mode === 'human') { el.textContent = `Мат! Победа ${r.winner === WHITE ? 'белых' : 'чёрных'}.`; el.classList.add('win'); }
      else if (r.winner === this.playerColor) { el.textContent = r.reason === 'resign' ? 'Соперник сдался — вы победили!' : 'Мат! Вы победили! 🏆'; el.classList.add('win'); }
      else { el.textContent = r.reason === 'resign' ? 'Вы сдались.' : 'Мат — соперник победил. Разбор покажет почему.'; el.classList.add('lose'); }
      return;
    }
    if (this.thinking) { el.textContent = this.mode === 'bot' ? 'Бот думает…' : 'Нейросеть думает…'; return; }
    if (this.game.pos.inCheck(this.game.turn)) {
      el.textContent = this.mode === 'human' ? `Шах ${this.game.turn === WHITE ? 'белому' : 'чёрному'} королю!` : this.game.turn === this.playerColor ? 'Шах! Защитите короля.' : 'Вы объявили шах!';
      el.classList.add('check');
      return;
    }
    el.textContent = this.mode === 'human' ? `Ход ${this.game.turn === WHITE ? 'белых' : 'чёрных'}.` : 'Ваш ход.';
  }

  _renderPlayers() {
    const names = this._names();
    const flipped = this.board.orientation === 'black';
    const topColor = flipped ? WHITE : BLACK;
    const botColor = flipped ? BLACK : WHITE;
    const set = (side, color) => {
      $(`#name${side}`).textContent = names[color];
      $(`#sub${side}`).textContent = color === WHITE ? 'белые' : 'чёрные';
      const av = $(`#av${side}`);
      if (this.mode !== 'human' && color !== this.playerColor) {
        av.innerHTML = this.mode === 'bot' ? pieceSVG(4, color) : icon('chip');
      } else av.innerHTML = pieceSVG(6, color);
      // взятые фигуры: фигуры цвета color, съеденные соперником → показываем у того, кто взял
      const capturedBy = this.game.history.filter((r) => r.move.captured && Math.sign(r.move.piece) === -color)
        .map((r) => r.move.captured);
      const tray = $(`#cap${side}`);
      const sum = capturedBy.reduce((a, p) => a + VALUES[Math.abs(p)], 0);
      const otherSum = this.game.history.filter((r) => r.move.captured && Math.sign(r.move.piece) === color)
        .reduce((a, r) => a + VALUES[Math.abs(r.move.captured)], 0);
      tray.innerHTML = capturedBy.map((p) => pieceChip((p > 0 ? 'w' : 'b') + 'PNBRQK'[Math.abs(p) - 1])).join('')
        + (sum > otherSum ? `<span class="mat-diff">+${((sum - otherSum) / 100).toFixed(0)}</span>` : '');
      $(`#card${side}`).classList.toggle('winner', !!this.game.result?.winner && this.game.result.winner === color);
    };
    set('Top', topColor);
    set('Bottom', botColor);
    this._topColor = topColor; this._bottomColor = botColor;
  }

  _renderThinking() {
    const oppColor = this.mode === 'human' ? null : -this.playerColor;
    $('#thinkTop').hidden = !(this.thinking && oppColor === this._topColor);
    $('#thinkBottom').hidden = !(this.thinking && oppColor === this._bottomColor);
  }

  _renderMoves() {
    const box = $('#moveList');
    const h = this.game.history;
    if (!h.length) { box.innerHTML = '<p class="empty-note">Ходы появятся здесь. Кликните по ходу, чтобы посмотреть позицию.</p>'; return; }
    let html = '';
    for (let i = 0; i < h.length; i += 2) {
      const cell = (j) => {
        if (j >= h.length) return '<span></span>';
        const on = this.reviewPly === j ? ' on' : '';
        const badge = this._lastAnalysis?.rows[j]?.cls;
        return `<button class="move-cell${on}" data-ply="${j}">${h[j].san}${badge?.sym ? `<span class="badge ${badge.key}">${badge.sym}</span>` : ''}</button>`;
      };
      html += `<div class="move-row"><span class="move-num">${i / 2 + 1}.</span>${cell(i)}${cell(i + 1)}</div>`;
    }
    box.innerHTML = html;
    $$('.move-cell', box).forEach((b) => b.addEventListener('click', () => this._enterReview(+b.dataset.ply)));
    box.scrollTop = box.scrollHeight;
  }

  _renderEval() {
    const cp = evaluate(this.game.pos);
    const pct = 50 + 50 * Math.tanh(cp / 650);
    $('#evalFill').style.height = pct.toFixed(1) + '%';
    $('#evalLabel').textContent = (cp >= 0 ? '+' : '') + (cp / 100).toFixed(1);
  }
}