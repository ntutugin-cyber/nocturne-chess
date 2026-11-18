import { injectDefs, pieceSVG } from './ui/pieces.js';
import { $, $$, initTabs, initModals, injectIcons, icon, toast } from './ui/common.js';
import { sound } from './ui/sound.js';
import { Network } from './nn/network.js';
import { Trainer } from './nn/trainer.js';
import { loadAuto, autosave } from './nn/storage.js';
import { TutorialView } from './ui/tutorial-view.js';
import { GameView } from './ui/game-view.js';
import { TrainingView } from './ui/training-view.js';

// ─── Базовая инициализация ───
injectDefs();
injectIcons();
initModals();
$('#brandMark').innerHTML = pieceSVG(2, 1);

// настройки
let settings = {};
try { settings = JSON.parse(localStorage.getItem('nocturne.settings.v1')) || {}; } catch {}
const saveSettings = () => { try { localStorage.setItem('nocturne.settings.v1', JSON.stringify(settings)); } catch {} };

// звук: включён по умолчанию, одна кнопка глушит всё
sound.enabled = settings.sound !== false;
const renderSound = () => {
  const btn = $('#btnSound');
  btn.innerHTML = icon(sound.enabled ? 'sound' : 'mute');
  btn.classList.toggle('off', !sound.enabled);
  btn.setAttribute('aria-pressed', String(sound.enabled));
  btn.title = sound.enabled ? 'Звук включён — кликните, чтобы выключить' : 'Звук выключен';
};
renderSound();
$('#btnSound').addEventListener('click', () => {
  sound.setEnabled(!sound.enabled);
  settings.sound = sound.enabled;
  saveSettings();
  renderSound();
  if (sound.enabled) sound.play('click');
});
document.addEventListener('pointerdown', () => sound.unlock(), { once: true });

// ─── Нейросеть: восстановление автосохранения ───
const saved = loadAuto();
const net = saved?.net || new Network();
const trainer = new Trainer(net);
if (saved?.meta) {
  trainer.stats.games = saved.meta.games || 0;
  trainer.stats.moves = saved.meta.moves || 0;
  trainer.stats.loss = saved.meta.loss ?? 0.5;
  trainer.stats.time = saved.meta.time || 0;
  trainer.stats.results = saved.meta.results || { w: 0, d: 0, l: 0 };
  trainer.epsilon = saved.meta.epsilon ?? 0.35;
  trainer.series = saved.meta.series || { loss: [], eps: [], win: [] };
}

// ─── Представления ───
let gameView, trainingView, tutorialView;
const tabs = initTabs((name) => {
  trainingView?.deactivate();
  if (name === 'neural') trainingView?.activate();
});

trainingView = new TrainingView({ trainer });
gameView = new GameView({ trainer });
tutorialView = new TutorialView({
  onPlayRequested: () => {
    location.hash = 'play';
    setTimeout(() => {
      gameView.settings.colors = 'white';
      gameView.openNewGame();
      toast('Совет: начните с бота уровня «Новичок».', 'info', 4500);
    }, 150);
  },
});

if (location.hash.replace('#', '') === 'neural') trainingView.activate();
if (saved && saved.meta?.games > 0) {
  setTimeout(() => toast(`Загружена сохранённая нейросеть: ${saved.meta.games} партий обучения.`, 'info', 4000), 800);
}
if (!localStorage.getItem('nocturne.visited')) {
  localStorage.setItem('nocturne.visited', '1');
  setTimeout(() => toast('Добро пожаловать в Ноктюрн! Начните с курса «Обучение» — он объяснит всё с нуля.', 'info', 6000), 500);
}

// ─── Сохранение при уходе ───
window.addEventListener('beforeunload', () => {
  if (trainer.autosave && trainer.stats.games > 0) autosave(trainer.net, trainer.meta());
  saveSettings();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && trainer.autosave && trainer.stats.games > 0) autosave(trainer.net, trainer.meta());
});