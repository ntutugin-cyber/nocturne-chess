import { LESSONS, CHAPTERS } from '../data/lessons.js';
import { Game } from '../core/game.js';
import { fromSq, sqName, KING, WHITE } from '../core/constants.js';
import { BoardView } from './board-view.js';
import { pieceChip } from './pieces.js';
import { $, $$, toast, confirmDialog, icon } from './common.js';
import { sound } from './sound.js';

const KEY = 'nocturne.tutorial.v1';

export class TutorialView {
  constructor({ onPlayRequested }) {
    this.onPlayRequested = onPlayRequested;
    this.progress = this._load();
    this.lessonIdx = 0;
    this.stepIdx = 0;
    this.taskDone = false;
    this.marks = new Set();
    this.game = new Game();
    this._autoTimer = null;

    this.board = new BoardView($('#learnBoard'), {
      interactive: true,
      canMove: () => this._canMoveNow(),
      legalProvider: (from) => this.game.moves(from),
      onMove: (m) => this._onMove(m),
      onSquare: (s) => this._onSquare(s),
    });

    this._renderSidebar();
    $('#btnHint').addEventListener('click', () => this._hint());
    $('#btnRestartStep').addEventListener('click', () => this._loadStep());
    $('#btnPrevStep').addEventListener('click', () => this._prev());
    $('#btnNextStep').addEventListener('click', () => this._next());
    $('#btnNextLesson').addEventListener('click', () => this._openLesson(this.lessonIdx + 1));
    $('#btnResetProgress').addEventListener('click', async () => {
      if (await confirmDialog('Стереть весь прогресс обучения?', 'Сброс прогресса')) {
        this.progress = { done: [], current: null };
        this._save(); this._renderSidebar(); this._openLesson(0);
        toast('Прогресс сброшен', 'info');
      }
    });

    const cur = this.progress.current;
    const idx = cur ? LESSONS.findIndex((l) => l.id === cur.lesson) : 0;
    this._openLesson(idx >= 0 ? idx : 0, cur?.step || 0);
  }

  _load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { done: [], current: null }; }
    catch { return { done: [], current: null }; }
  }
  _save() {
    this.progress.current = { lesson: LESSONS[this.lessonIdx].id, step: this.stepIdx };
    try { localStorage.setItem(KEY, JSON.stringify(this.progress)); } catch {}
  }

  _renderSidebar() {
    const box = $('#lessonSidebar');
    box.innerHTML = '';
    for (const ch of CHAPTERS) {
      const wrap = document.createElement('div');
      wrap.className = 'chapter';
      wrap.innerHTML = `<p class="chapter-name">${ch.name}</p>`;
      LESSONS.forEach((l, i) => {
        if (l.ch !== ch.id) return;
        const b = document.createElement('button');
        b.className = 'lesson-item' + (this.progress.done.includes(l.id) ? ' done' : '') + (i === this.lessonIdx ? ' on' : '');
        b.innerHTML = `<span class="li-check">${this.progress.done.includes(l.id) ? icon('check') : ''}</span><span>${i + 1}. ${l.title}</span>`;
        b.addEventListener('click', () => this._openLesson(i));
        wrap.appendChild(b);
      });
      box.appendChild(wrap);
    }
    $('#lessonProgressLabel').textContent = `${this.progress.done.length} / ${LESSONS.length}`;
  }

  _openLesson(idx, step = 0) {
    if (idx < 0 || idx >= LESSONS.length) {
      toast('Курс полностью пройден! Пора играть 🏆', 'success');
      this.onPlayRequested?.();
      return;
    }
    this.lessonIdx = idx;
    this.stepIdx = Math.min(step, LESSONS[idx].steps.length - 1);
    const l = LESSONS[idx];
    $('#lessonChapter').textContent = CHAPTERS.find((c) => c.id === l.ch).name;
    $('#lessonTitle').textContent = `${idx + 1}. ${l.title}`;
    $('#lessonDoneCard').hidden = true;
    this._renderSidebar();
    this._loadStep();
  }

  _step() { return LESSONS[this.lessonIdx].steps[this.stepIdx]; }

  _canMoveNow() {
    const t = this._step().task;
    if (!t || this.taskDone) return false;
    return ['move', 'capture', 'mate', 'moveSet', 'kingEscape'].includes(t.type);
  }

  _loadStep() {
    clearTimeout(this._autoTimer);
    const st = this._step();
    this.taskDone = !st.task;
    this.marks.clear();
    this.game = new Game(st.fen);
    this.board.setOrientation('white');
    this.board.setPosition(this.game.pos, { animate: false });
    this.board.clearMarks();
    this.board.setInteractive(true);
    this.board.setHighlights(st.hl || {});

    const textEl = $('#stepText');
    textEl.innerHTML = st.text;
    $$('[data-piece]', textEl).forEach((el) => { el.outerHTML = pieceChip(el.dataset.piece); });

    // прогресс-точки
    const dots = $('#stepDots');
    dots.innerHTML = LESSONS[this.lessonIdx].steps.map((_, i) =>
      `<i class="${i < this.stepIdx ? 'done' : i === this.stepIdx ? 'on' : ''}"></i>`).join('');

    // задание
    const banner = $('#taskBanner');
    const quiz = $('#quizBox');
    quiz.hidden = true; quiz.innerHTML = '';
    if (st.task) {
      if (st.task.type === 'quiz') {
        banner.hidden = true;
        quiz.hidden = false;
        quiz.innerHTML = `<p class="quiz-q">${st.task.question}</p>`;
        st.task.options.forEach((opt) => {
          const b = document.createElement('button');
          b.className = 'quiz-opt';
          b.textContent = opt.t;
          b.addEventListener('click', () => this._quizAnswer(b, opt));
          quiz.appendChild(b);
        });
      } else {
        banner.hidden = false;
        banner.className = 'task-banner';
        banner.innerHTML = `${icon('target')}<span>${st.task.prompt}</span>`;
      }
    } else {
      banner.hidden = true;
      if (st.final) this._showDone(true);
    }

    $('#btnHint').disabled = !st.task || st.task.type === 'quiz';
    $('#btnPrevStep').disabled = this.stepIdx === 0 && this.lessonIdx === 0;
    $('#btnNextStep').disabled = !!st.task && !this.taskDone;
    this._save();
  }

  _quizAnswer(btn, opt) {
    if (this.taskDone) return;
    const why = document.createElement('p');
    why.className = 'quiz-why';
    why.textContent = opt.why || '';
    if (opt.correct) {
      btn.classList.add('right');
      $$('.quiz-opt', $('#quizBox')).forEach((b) => { b.disabled = true; });
      $('#quizBox').appendChild(why);
      this._success('Верно! ' + (opt.why || ''));
    } else {
      btn.classList.add('wrong');
      btn.disabled = true;
      $('#quizBox').appendChild(why);
      sound.play('error');
    }
  }

  _onSquare(s) {
    const t = this._step().task;
    if (!t || this.taskDone) return;
    if (t.type === 'select') {
      if (sqName(s) === t.square) this._success(t.success);
      else { sound.play('error'); this.board.shake(); toast(t.wrong || 'Не то поле, попробуй ещё.', 'error'); }
    } else if (t.type === 'multiSelect') {
      const name = sqName(s);
      if (this.marks.has(name)) { this.marks.delete(name); this.board.mark(s, false); }
      else { this.marks.add(name); this.board.mark(s, true); sound.play('click'); }
      const target = new Set(t.squares);
      if (this.marks.size === target.size && [...this.marks].every((x) => target.has(x))) this._success(t.success);
      else if (this.marks.size > target.size) toast('Отмечено лишнее — сними неверные отметки повторным кликом.', 'info');
    }
  }

  _onMove(m) {
    const t = this._step().task;
    if (!t || this.taskDone) return;
    const rec = this.game.play(m);
    this.board.setPosition(this.game.pos, { move: m });
    sound.play(m.captured ? 'capture' : 'move');

    let ok = false;
    const from = sqName(m.from), to = sqName(m.to);
    switch (t.type) {
      case 'move': ok = from === t.from && to === t.to; break;
      case 'capture': ok = !!m.captured && to === t.target; break;
      case 'moveSet': ok = t.moves.some(([f, tt]) => f === from && tt === to); break;
      case 'mate': ok = this.game.result?.reason === 'checkmate' && this.game.result.winner === WHITE; break;
      case 'kingEscape': ok = Math.abs(m.piece) === KING && !this.game.pos.inCheck(WHITE); break;
      default: ok = true;
    }
    if (ok) {
      if (this.game.result?.reason === 'checkmate') sound.play('win');
      this._success(t.success);
    } else {
      sound.play('error');
      this.board.shake();
      toast(t.wrong || 'Этот ход не решает задание. Попробуй ещё!', 'error');
      setTimeout(() => {
        this.game.undo();
        this.board.setPosition(this.game.pos, { animate: false });
      }, 700);
    }
  }

  _success(msg) {
    this.taskDone = true;
    sound.play('success');
    const banner = $('#taskBanner');
    banner.hidden = false;
    banner.className = 'task-banner success';
    banner.innerHTML = `${icon('check')}<span>${msg || 'Верно!'}</span>`;
    $('#btnNextStep').disabled = false;
    $('#btnHint').disabled = true;
    const last = this.stepIdx === LESSONS[this.lessonIdx].steps.length - 1;
    if (last) this._showDone();
    else this._autoTimer = setTimeout(() => this._next(), 1800);
  }

  _showDone(final = false) {
    const l = LESSONS[this.lessonIdx];
    if (!this.progress.done.includes(l.id)) {
      this.progress.done.push(l.id);
      this._save();
      this._renderSidebar();
    }
    const card = $('#lessonDoneCard');
    card.hidden = false;
    $('#doneText').textContent = final
      ? 'Курс завершён! Теперь ты знаешь все правила шахмат. Вперёд, к первой партии!'
      : 'Отличная работа. Двигаемся дальше.';
    $('#btnNextLesson').innerHTML = final
      ? `${icon('knight')}Сыграть первую партию`
      : `Следующий урок${icon('chevR')}`;
    if (final) $('#btnNextLesson').onclick = () => this.onPlayRequested?.();
    else $('#btnNextLesson').onclick = () => this._openLesson(this.lessonIdx + 1);
  }

  _hint() {
    const st = this._step(), t = st.task;
    if (!t) return;
    sound.play('click');
    if (t.type === 'move' || t.type === 'moveSet') {
      const [f, to] = t.type === 'move' ? [t.from, t.to] : t.moves[0];
      this.board.setHighlights({ ...(st.hl || {}), arrows: [{ from: f, to }], pulse: [to] });
      toast(`Подсказка: ${f} → ${to}`, 'info');
    } else if (t.type === 'capture' || t.type === 'select') {
      this.board.setHighlights({ ...(st.hl || {}), pulse: [t.target || t.square] });
    } else if (t.type === 'multiSelect') {
      toast('Буква «Г»: две клетки прямо + одна вбок. Отметь все 8 вариантов.', 'info');
    } else if (t.type === 'mate') {
      toast('Ищи шах, от которого королю некуда деться — обычно по последней горизонтали или по слабому полю.', 'info', 4500);
    } else if (t.type === 'kingEscape') {
      this.board.setHighlights({ pulse: ['d1', 'f1', 'e2'] });
    }
  }

  _prev() {
    clearTimeout(this._autoTimer);
    if (this.stepIdx > 0) { this.stepIdx--; this._loadStep(); }
    else if (this.lessonIdx > 0) {
      this.lessonIdx--;
      this.stepIdx = LESSONS[this.lessonIdx].steps.length - 1;
      const l = LESSONS[this.lessonIdx];
      $('#lessonChapter').textContent = CHAPTERS.find((c) => c.id === l.ch).name;
      $('#lessonTitle').textContent = `${this.lessonIdx + 1}. ${l.title}`;
      this._renderSidebar();
      this._loadStep();
    }
  }
  _next() {
    clearTimeout(this._autoTimer);
    const st = this._step();
    if (st.task && !this.taskDone) return;
    if (this.stepIdx < LESSONS[this.lessonIdx].steps.length - 1) { this.stepIdx++; this._loadStep(); }
    else this._openLesson(this.lessonIdx + 1);
  }
}