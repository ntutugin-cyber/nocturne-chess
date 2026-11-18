import { INPUT_SIZE } from './features.js';

// MLP с ДВУМЯ скрытыми слоями: 773 → 128 → 64 → 1, tanh, Adam.
export class Network {
  constructor(sizes = [INPUT_SIZE, 128, 64, 1]) {
    this.sizes = sizes.slice();
    const [n0, n1, n2] = sizes;
    const xav = (fanIn) => Math.sqrt(2 / (fanIn + 1));
    const rand = (n, s) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * s; return a; };
    this.W1 = rand(n0 * n1, xav(n0)); this.b1 = new Float32Array(n1);
    this.W2 = rand(n1 * n2, xav(n1)); this.b2 = new Float32Array(n2);
    this.W3 = rand(n2, xav(n2)); this.b3 = new Float32Array(1);
    this._h1 = new Float32Array(n1); this._h2 = new Float32Array(n2);
    // Adam
    this.t = 0;
    const z = (a) => new Float32Array(a.length);
    this.mW1 = z(this.W1); this.vW1 = z(this.W1); this.mb1 = z(this.b1); this.vb1 = z(this.b1);
    this.mW2 = z(this.W2); this.vW2 = z(this.W2); this.mb2 = z(this.b2); this.vb2 = z(this.b2);
    this.mW3 = z(this.W3); this.vW3 = z(this.W3); this.mb3 = z(this.b3); this.vb3 = z(this.b3);
  }

  // Разреженный первый слой: считаем только ненулевые входы (~36 из 773)
  forward(x, active, cache = false) {
    const [n0, n1, n2] = this.sizes;
    const h1 = this._h1, h2 = this._h2;
    for (let j = 0; j < n1; j++) {
      let s = this.b1[j]; const row = j * n0;
      for (let k = 0; k < active.length; k++) { const i = active[k]; s += this.W1[row + i] * x[i]; }
      h1[j] = Math.tanh(s);
    }
    for (let j = 0; j < n2; j++) {
      let s = this.b2[j]; const row = j * n1;
      for (let k = 0; k < n1; k++) s += this.W2[row + k] * h1[k];
      h2[j] = Math.tanh(s);
    }
    let o = this.b3[0];
    for (let k = 0; k < n2; k++) o += this.W3[k] * h2[k];
    o = Math.tanh(o);
    if (cache) return { value: o, active: active.slice(), x, h1: h1.slice(), h2: h2.slice() };
    return o;
  }

  _adam(w, m, v, i, g, lr, c1, c2) {
    m[i] = 0.9 * m[i] + 0.1 * g;
    v[i] = 0.999 * v[i] + 0.001 * g * g;
    w[i] -= lr * (m[i] * c1) / (Math.sqrt(v[i] * c2) + 1e-8);
  }

  // MSE-градиент к цели target; возвращает |ошибка|
  backward(c, target, lr = 0.001) {
    this.t++;
    const c1 = 1 / (1 - Math.pow(0.9, this.t)), c2 = 1 / (1 - Math.pow(0.999, this.t));
    const [n0, n1, n2] = this.sizes;
    const err = c.value - target;
    const dO = err * (1 - c.value * c.value);
    const dH2 = new Float32Array(n2), dH1 = new Float32Array(n1);
    for (let j = 0; j < n2; j++) dH2[j] = dO * this.W3[j] * (1 - c.h2[j] * c.h2[j]);
    for (let j = 0; j < n2; j++) {
      const row = j * n1, g = dH2[j];
      for (let k = 0; k < n1; k++) dH1[k] += g * this.W2[row + k];
    }
    for (let k = 0; k < n1; k++) dH1[k] *= 1 - c.h1[k] * c.h1[k];
    // применяем обновления (градиенты посчитаны по старым весам)
    for (let j = 0; j < n2; j++) {
      this._adam(this.W3, this.mW3, this.vW3, j, dO * c.h2[j], lr, c1, c2);
      const row = j * n1, g = dH2[j];
      for (let k = 0; k < n1; k++) this._adam(this.W2, this.mW2, this.vW2, row + k, g * c.h1[k], lr, c1, c2);
      this._adam(this.b2, this.mb2, this.vb2, j, g, lr, c1, c2);
    }
    this._adam(this.b3, this.mb3, this.vb3, 0, dO, lr, c1, c2);
    for (let j = 0; j < n1; j++) {
      const g = dH1[j];
      if (Math.abs(g) > 1e-9) {
        const row = j * n0;
        for (const i of c.active) this._adam(this.W1, this.mW1, this.vW1, row + i, g * c.x[i], lr, c1, c2);
      }
      this._adam(this.b1, this.mb1, this.vb1, j, g, lr, c1, c2);
    }
    return Math.abs(err);
  }

  serialize(meta = {}) {
    const r = (a) => Array.from(a, (v) => Math.round(v * 1e6) / 1e6);
    return {
      format: 'nocturne-nn', version: 1, sizes: this.sizes, activation: 'tanh',
      weights: [r(this.W1), r(this.W2), r(this.W3)],
      biases: [r(this.b1), r(this.b2), r(this.b3)],
      adamStep: this.t, meta, savedAt: new Date().toISOString(),
    };
  }

  static deserialize(json) {
    if (!json || json.format !== 'nocturne-nn') throw new Error('Это не файл весов Ноктюрна.');
    const sizes = json.sizes;
    if (!Array.isArray(sizes) || sizes.length !== 4 || sizes[0] !== INPUT_SIZE || sizes[3] !== 1 || sizes[1] < 2 || sizes[2] < 2)
      throw new Error('Неподдерживаемая архитектура (нужно 773 → ≥2 → ≥2 → 1).');
    const net = new Network(sizes);
    const layers = [['W1', 'b1'], ['W2', 'b2'], ['W3', 'b3']];
    layers.forEach(([w, b], i) => {
      const W = json.weights?.[i], B = json.biases?.[i];
      if (!Array.isArray(W) || W.length !== net[w].length || !Array.isArray(B) || B.length !== net[b].length)
        throw new Error(`Повреждён слой ${i + 1}: неверное число параметров.`);
      net[w].set(W); net[b].set(B);
    });
    net.t = json.adamStep || 0;
    return net;
  }
}