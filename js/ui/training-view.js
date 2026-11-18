import { Trainer } from '../nn/trainer.js';
import { Network } from '../nn/network.js';
import { Position } from '../core/position.js';
import { saveToFile, readFromFile, autosave, clearAuto } from '../nn/storage.js';
import { BoardView } from './board-view.js';
import { $, $$, toast, confirmDialog, bindSwitch, fmtTime, icon, clamp } from './common.js';
import { sound } from './sound.js';

export class TrainingView {
  constructor({ trainer }) {
    this.trainer = trainer;
    this.active = false;
    this.inited = false;
    this._chartTimer = null;
  }

  activate() {
    this.active = true;
    if (!this.inited) { this.inited = true; this._init(); }
    this._resizeCharts();
    this._renderStats();
    this._drawCharts();
    this._renderLive();
  }
  deactivate() { this.active = false; }

  _init() {
    const t = this.trainer;
    this.board = new BoardView($('#trainBoard'), { interactive: false });
    this.board.setCoords(false);
    this.board.setPosition(t.game.pos, { animate: false });
    this._buildArch();

    $('#btnTrain').addEventListener('click', () => {
      sound.play('click');
      t.running ? t.pause() : t.start();
    });
    $('#rngSpeed').addEventListener('input', (e) => { t.speed = +e.target.value; $('#valSpeed').textContent = t.speed + ' ход/с'; });
    $('#rngEps').addEventListener('input', (e) => { t.epsilon = +e.target.value; $('#valEps').textContent = t.epsilon.toFixed(2); $('#stEps').textContent = t.epsilon.toFixed(2); });
    $('#rngLr').addEventListener('input', (e) => { t.lr = +e.target.value; $('#valLr').textContent = t.lr.toFixed(4); });
    bindSwitch($('#tglAutoEps'), true, (v) => { t.autoEps = v; });
    bindSwitch($('#tglAutosave'), true, (v) => { t.autosave = v; });

    $('#btnSaveNet').addEventListener('click', () => {
      saveToFile(t.net, t.meta());
      toast('Веса сохранены в JSON-файл.', 'success');
    });
    $('#btnLoadNet').addEventListener('click', () => $('#fileNet').click());
    $('#fileNet').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const { net, meta } = await readFromFile(file);
        t.pause();
        t.setNetwork(net, meta);
        this._renderStats(); this._drawCharts(); this._renderLive();
        toast(`Веса загружены: ${meta?.games || 0} партий обучения.`, 'success');
        sound.play('success');
      } catch (err) { toast('Ошибка загрузки: ' + err.message, 'error', 5000); sound.play('error'); }
    });
    $('#btnResetNet').addEventListener('click', async () => {
      if (await confirmDialog('Стереть обученные веса и начать с чистой сети? Весь прогресс обучения будет потерян (сохранённые JSON-файлы останутся).', 'Сброс нейросети')) {
        t.pause();
        clearAuto();
        t.setNetwork(new Network());
        this._renderStats(); this._drawCharts(); this._renderLive();
        toast('Сеть сброшена к случайным весам.', 'info');
      }
    });
    $('#btnBenchBot').addEventListener('click', async () => {
      const btn = $('#btnBenchBot');
      btn.disabled = true;
      $('#benchBotResult').textContent = 'идёт тест…';
      const score = await t.benchmarkBot((g, ply) => { $('#benchBotResult').textContent = `партия ${g + 1}/2, ход ${ply}`; });
      $('#benchBotResult').textContent = `результат: ${score} / 2`;
      btn.disabled = false;
      toast(`Тест против бота-новичка: ${score} из 2 очков.`, score >= 1.5 ? 'success' : 'info');
    });

    t.on('state', (on) => {
      $('#trainState').textContent = on ? 'обучается' : 'пауза';
      $('#trainState').classList.toggle('on', on);
      $('#btnTrain').innerHTML = on ? `${icon('pause')}<span>Пауза</span>` : `${icon('play')}<span>Начать обучение</span>`;
      $('#archSvg').classList.toggle('training', on);
      if (!on && t.autosave) autosave(t.net, t.meta());
    });
    t.on('tick', () => { if (this.active) this._renderLive(); });
    t.on('stats', () => {
      if (!this.active) return;
      this._renderStats();
      if (!this._chartTimer) this._chartTimer = setTimeout(() => { this._chartTimer = null; this._drawCharts(); }, 600);
    });
    t.on('autosave', () => { if (t.autosave) autosave(t.net, t.meta()); });
    t.on('bench', (rate) => { if (this.active) toast(`Контроль: винрейт против случайного игрока — ${rate}%`, 'info', 2200); });

    window.addEventListener('resize', () => { if (this.active) { this._resizeCharts(); this._drawCharts(); } });
    this._renderStats();
  }

  _renderLive() {
    const t = this.trainer;
    const last = t.game.history[t.game.history.length - 1];
    this.board.setPosition(t.game.pos, { move: last?.move || null, animate: !!last });
    $('#trainGameInfo').textContent = t.mode === 'bench'
      ? `Контрольная партия · сеть играет ${t.benchNNColor === 1 ? 'белыми' : 'чёрными'}`
      : `Партия ${t.stats.games + 1} · ход ${Math.ceil(t.game.history.length / 2) + 1}`;
    $('#resultChips').innerHTML = t.lastResults.map((k) =>
      `<span class="res-chip ${k}">${k === 'w' ? 'Б' : k === 'l' ? 'Ч' : '='}</span>`).join('');
  }

  _renderStats() {
    const s = this.trainer.stats;
    $('#stGames').textContent = s.games;
    $('#stMoves').textContent = s.moves > 9999 ? (s.moves / 1000).toFixed(1) + 'k' : s.moves;
    $('#stLoss').textContent = s.moves ? s.loss.toFixed(3) : '—';
    const wins = this.trainer.series.win;
    $('#stWin').textContent = wins.length ? wins[wins.length - 1].r + '%' : '—';
    $('#stEps').textContent = this.trainer.epsilon.toFixed(2);
    $('#stTime').textContent = fmtTime(s.time);
    $('#rngEps').value = this.trainer.epsilon;
    $('#valEps').textContent = this.trainer.epsilon.toFixed(2);
    const total = s.results.w + s.results.d + s.results.l || 1;
    $('#resW').style.width = (s.results.w / total * 100) + '%';
    $('#resD').style.width = (s.results.d / total * 100) + '%';
    $('#resL').style.width = (s.results.l / total * 100) + '%';
    $('#cntW').textContent = s.results.w;
    $('#cntD').textContent = s.results.d;
    $('#cntL').textContent = s.results.l;
  }

  _resizeCharts() {
    for (const id of ['chartLoss', 'chartWin']) {
      const c = $('#' + id);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth || 300, h = 150;
      c.width = w * dpr; c.height = h * dpr;
      c.style.height = h + 'px';
      c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  _drawCharts() {
    this._lineChart($('#chartLoss'), [
      { data: this.trainer.series.loss, color: '#e8b64c', fill: true },
      { data: this.trainer.series.eps, color: '#a78bfa', dash: [5, 4] },
    ], 0, 1);
    this._lineChart($('#chartWin'), [
      { data: this.trainer.series.win.map((p) => p.r / 100), color: '#39d0ff', fill: true },
    ], 0, 1, true);
  }

  _lineChart(canvas, series, yMin, yMax, pct = false) {
    const ctx = canvas.getContext('2d');
    const w = canvas.clientWidth || 300, h = 150;
    ctx.clearRect(0, 0, w, h);
    const padL = 34, padR = 10, padT = 10, padB = 18;
    const iw = w - padL - padR, ih = h - padT - padB;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#6f6694';
    ctx.strokeStyle = 'rgba(59,52,104,.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + ih - (i / 4) * ih;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      const v = yMin + (i / 4) * (yMax - yMin);
      ctx.fillText(pct ? Math.round(v * 100) + '%' : v.toFixed(2), 2, y + 3);
    }
    const maxLen = Math.max(...series.map((s) => s.data.length), 2);
    for (const s of series) {
      if (s.data.length < 2) continue;
      const pts = s.data.map((v, i) => [
        padL + (i / (maxLen - 1)) * iw,
        padT + ih - clamp((v - yMin) / (yMax - yMin), 0, 1) * ih,
      ]);
      if (s.fill) {
        const grad = ctx.createLinearGradient(0, padT, 0, padT + ih);
        grad.addColorStop(0, s.color + '44'); grad.addColorStop(1, s.color + '00');
        ctx.beginPath();
        ctx.moveTo(pts[0][0], padT + ih);
        pts.forEach((p) => ctx.lineTo(p[0], p[1]));
        ctx.lineTo(pts[pts.length - 1][0], padT + ih);
        ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
      }
      ctx.beginPath();
      ctx.setLineDash(s.dash || []);
      pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.stroke();
      ctx.setLineDash([]);
      const last = pts[pts.length - 1];
      ctx.beginPath(); ctx.arc(last[0], last[1], 3.4, 0, Math.PI * 2);
      ctx.fillStyle = s.color; ctx.fill();
    }
    if (!series.some((s) => s.data.length >= 2)) {
      ctx.fillStyle = '#6f6694';
      ctx.font = '12px Manrope, sans-serif';
      ctx.fillText('Нажмите «Начать обучение» — график оживёт', padL + 8, padT + ih / 2);
    }
  }

  _buildArch() {
    const layers = [
      { n: 773, label: 'Вход', color: '#39d0ff', show: 6 },
      { n: 128, label: 'Скрытый 1', color: '#a78bfa', show: 5 },
      { n: 64, label: 'Скрытый 2', color: '#ff4d8d', show: 4 },
      { n: 1, label: 'Оценка', color: '#e8b64c', show: 1 },
    ];
    const W = 400, H = 190, xs = [50, 150, 250, 350];
    let edges = '', nodes = '', labels = '';
    const pos = layers.map((l, li) => {
      const arr = [];
      for (let i = 0; i < l.show; i++) {
        const y = H / 2 - 20 + (i - (l.show - 1) / 2) * 24;
        arr.push([xs[li], y]);
      }
      return arr;
    });
    for (let li = 0; li < 3; li++)
      for (const [x1, y1] of pos[li])
        for (const [x2, y2] of pos[li + 1])
          edges += `<line class="arch-edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    layers.forEach((l, li) => {
      for (const [x, y] of pos[li]) nodes += `<circle class="arch-node" cx="${x}" cy="${y}" r="9" stroke="${l.color}" style="color:${l.color}"/>`;
      labels += `<text class="arch-count" x="${xs[li]}" y="${H - 26}" text-anchor="middle">${l.n}</text>
                 <text class="arch-label" x="${xs[li]}" y="${H - 10}" text-anchor="middle">${l.label}</text>`;
    });
    $('#archSvg').innerHTML = `<svg viewBox="0 0 ${W} ${H}">${edges}${nodes}${labels}</svg>`;
  }
}