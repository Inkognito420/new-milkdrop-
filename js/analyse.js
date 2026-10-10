// ===== Track-Analyse (reine Rechenfunktion, ohne Browser-Abhängigkeiten) =====
// env: {low, m1, m2, hi, full} als Float32Arrays mit RMS pro Frame, hopS: Sekunden pro Frame
function analyzeEnvelopes(env, hopS) {
  const N = env.full.length;
  const clamp = v => Math.max(0, Math.min(1, v));
  const mean = (a, s = 0, e = a.length) => { let x = 0; for (let i = s; i < e; i++) x += a[i]; return e > s ? x / (e - s) : 0; };

  // Kick-Onsets aus dem Bassband
  const o = new Float32Array(N);
  for (let i = 1; i < N; i++) o[i] = Math.max(0, env.low[i] - env.low[i - 1]);

  // Tempo: Raster mit der stärksten Kick-Übereinstimmung, 100–200 BPM
  let best = -1, bpm = 140, phase = 0;
  for (let b = 100; b <= 200; b += 0.25) {
    const P = 60 / b / hopS;
    let sc = -1, ph = 0;
    for (let p = 0; p < P; p += P / 16) {
      let s = 0, c = 0;
      for (let x = p; x < N - 1; x += P) { const i = Math.round(x); s += o[i] + 0.5 * ((i > 0 ? o[i - 1] : 0) + o[i + 1]); c++; }
      s /= Math.max(1, c);
      if (s > sc) { sc = s; ph = p; }
    }
    const w = 1 + 0.08 * Math.exp(-(((b - 140) / 25) ** 2));
    if (sc * w > best) { best = sc * w; bpm = b; phase = ph; }
  }
  // Phase fein nachziehen
  let Pf = 60 / bpm / hopS;
  let bestPh = phase, bestS = -1;
  for (let p = phase - Pf / 16; p <= phase + Pf / 16; p += 0.25) {
    let s = 0; for (let x = p; x < N - 1; x += Pf) { const i = Math.round(x); if (i >= 0) s += o[i]; }
    if (s > bestS) { bestS = s; bestPh = p; }
  }
  phase = ((bestPh % Pf) + Pf) % Pf;

  // Feinabgleich: jeden Kick einzeln im 6-ms-Raster suchen und eine Gerade durch alle legen.
  // Ergebnis: Tempo auf ca. 0,01 BPM genau, das Raster driftet bis zum Track-Ende nicht weg.
  if (env.lowF && env.lowF.length > 64) {
    const q = env.lowF.length / N, L = env.lowF.length, of = new Float32Array(L), Pf0 = Pf;
    for (let i = 1; i < L; i++) of[i] = Math.max(0, env.lowF[i] - env.lowF[i - 1]);
    // Startfenster: die 32 Schläge mit dem stärksten Kick; dann Fenster verdoppeln, bis der ganze Track drin ist
    const K0 = Math.floor((L - 2 - phase * q) / (Pf * q));
    let c0 = 0, cBest = -1;
    for (let k = 0; k + 32 <= K0; k += 8) {
      let e = 0; for (let j = k; j < k + 32; j++) { const i = Math.round(phase + j * Pf); if (i > 0 && i < N) e += o[i]; }
      if (e > cBest) { cBest = e; c0 = k + 16; }
    }
    for (let span = 32, it = 0; it < 14; it++, span = Math.min(span * 2, 2 * K0 + 2)) {
      const P4 = Pf * q, ph4 = phase * q, win = P4 * 0.12, pk = [];
      const kLo = Math.max(0, Math.round(c0 - span / 2)), kHi = Math.min(K0, Math.round(c0 + span / 2));
      for (let k = kLo; k < kHi; k++) {
        const c = ph4 + k * P4; let bi = -1, bv = 0;
        for (let i = Math.max(1, Math.ceil(c - win)); i <= Math.min(L - 2, Math.floor(c + win)); i++) if (of[i] > bv) { bv = of[i]; bi = i; }
        if (bi > 0) {
          const a1 = of[bi - 1], a3 = of[bi + 1], den = a1 - 2 * bv + a3;
          const d = den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a1 - a3) / den)) : 0;
          pk.push([k, bi + d, bv]);
        }
      }
      if (pk.length < 16) break;
      const vs = pk.map(p => p[2]).sort((x, y) => x - y), thr = Math.max(vs[Math.floor(vs.length * 0.4)], 0.25 * vs[Math.floor(vs.length * 0.9)]);
      let sw = 0, sk = 0, st = 0, skk = 0, skt = 0;
      for (const [k, tt, v] of pk) if (v >= thr && v > 0) { sw += v; sk += v * k; st += v * tt; skk += v * k * k; skt += v * k * tt; }
      const det = sw * skk - sk * sk;
      if (!(det > 0)) break;
      const slope = (sw * skt - sk * st) / det, icpt = (st - slope * sk) / sw;
      const nP = slope / q;
      if (!isFinite(nP) || Math.abs(nP - Pf0) / Pf0 > 0.012) break;   // Sicherheitsnetz: nur kleine Korrekturen
      Pf = nP; phase = icpt / q;
      if (kLo === 0 && kHi === K0 && it >= 10) break;
    }
    phase = ((phase % Pf) + Pf) % Pf;
    bpm = 60 / (Pf * hopS);
  }
  const beatS = 60 / bpm;

  // Werte pro Schlag
  const K = Math.floor((N - phase) / Pf);
  const bFull = new Float32Array(K), bKick = new Float32Array(K), bHi = new Float32Array(K), bMid = new Float32Array(K);
  for (let k = 0; k < K; k++) {
    const s = Math.round(phase + k * Pf), e = Math.min(N, Math.round(phase + (k + 1) * Pf));
    bFull[k] = mean(env.full, s, e); bHi[k] = mean(env.hi, s, e); bMid[k] = mean(env.m2, s, e);
    let mx = 0; for (let i = Math.max(1, s - 2); i <= Math.min(N - 1, s + 2); i++) mx = Math.max(mx, o[i]);
    bKick[k] = mx;
  }

  // Takt-Eins: dort, wo sich der Klang von Takt zu Takt am deutlichsten ändert (quadriert, damit halbe Übergänge weniger zählen)
  let barPhase = 0, bestBar = -1;
  for (let b = 0; b < 4; b++) {
    let s = 0, c = 0;
    for (let k = b + 4; k + 4 <= K; k += 4) {
      const dd = (mean(bFull, k, k + 4) - mean(bFull, k - 4, k)) / (mean(bFull, k - 4, k + 4) + 1e-9);
      s += dd * dd;
      c++;
    }
    s /= Math.max(1, c);
    if (s > bestBar) { bestBar = s; barPhase = b; }
  }

  // Kick pro Takt
  const nBars = Math.max(0, Math.floor((K - barPhase) / 4));
  const kickness = new Float32Array(nBars), barLow = new Float32Array(nBars);
  for (let j = 0; j < nBars; j++) {
    kickness[j] = mean(bKick, barPhase + 4 * j, barPhase + 4 * j + 4);
    const s = Math.round(phase + (barPhase + 4 * j) * Pf), e = Math.min(N, Math.round(phase + (barPhase + 4 * j + 4) * Pf));
    barLow[j] = mean(env.low, s, e);
  }
  const pct = (arr, q) => { const s = Array.from(arr).sort((a, b) => a - b); return s[Math.floor(s.length * q)] || 0; };
  const p75 = pct(kickness, 0.75), p75Low = pct(barLow, 0.75);
  // Kick-Takt: deutliche Kick-Anschläge und voller Bassdruck. Halbe Takte und einzelne Fill-Kicks zählen nicht.
  const kick = Array.from(kickness, (v, j) => p75 > 0 && v > 0.35 * p75 && barLow[j] > 0.5 * p75Low);
  for (let j = 1; j < nBars - 1; j++) if (!kick[j] && kick[j - 1] && kick[j + 1]) kick[j] = true;
  for (let j = 1; j < nBars - 1; j++) if (kick[j] && !kick[j - 1] && !kick[j + 1]) kick[j] = false;
  const kickShare = kick.filter(Boolean).length / Math.max(1, nBars);
  const grid = nBars >= 8 && kickShare >= 0.2;

  const barT = j => (phase + (barPhase + 4 * j) * Pf) * hopS;
  const types = new Array(nBars).fill('groove');
  const first = kick.indexOf(true), last = kick.lastIndexOf(true);
  if (grid) {
    for (let j = 0; j < nBars; j++) {
      if (j < first) types[j] = 'intro';
      else if (j > last) types[j] = 'outro';
    }
    // Läufe ohne Kick zwischen erstem und letztem Kick
    let j = first;
    while (j <= last) {
      if (!kick[j]) {
        let e = j; while (e <= last && !kick[e]) e++;
        const len = e - j;
        if (len >= 4) {
          for (let x = j; x < e; x++) types[x] = 'break';
          // Build-up: letzte Takte des Breaks, wenn Höhen und Mitten ansteigen
          const n = Math.min(8, Math.floor(len / 2));
          const a = mean(bHi, barPhase + 4 * j, barPhase + 4 * (j + 2)) + mean(bMid, barPhase + 4 * j, barPhase + 4 * (j + 2));
          const z = mean(bHi, barPhase + 4 * (e - 2), barPhase + 4 * e) + mean(bMid, barPhase + 4 * (e - 2), barPhase + 4 * e);
          if (n >= 2 && z > a * 1.15) for (let x = e - n; x < e; x++) types[x] = 'buildup';
          // Drop: die ersten 4 Takte, wenn der Kick zurückkommt
          for (let x = e; x < Math.min(e + 4, last + 1); x++) types[x] = 'drop';
        }
        j = e;
      } else j++;
    }
    // Langes Intro ohne Kick: Einstieg des Kicks zählt als Drop
    if (first >= 8) for (let x = first; x < Math.min(first + 4, nBars); x++) if (types[x] === 'groove') types[x] = 'drop';
  }

  // Abschnitte zusammenfassen
  const sections = [];
  for (let j = 0; j < nBars; j++) {
    const ty = grid ? types[j] : 'groove';
    const s = sections[sections.length - 1];
    if (s && s.type === ty) { s.endBar = j + 1; s.t1 = barT(j + 1); }
    else sections.push({ type: ty, startBar: j, endBar: j + 1, t0: barT(j), t1: barT(j + 1) });
  }
  if (sections.length) { sections[0].t0 = 0; sections[sections.length - 1].t1 = N * hopS; }
  else sections.push({ type: 'groove', startBar: 0, endBar: 0, t0: 0, t1: N * hopS });

  // Stimmung des Tracks aus den Abschnitten mit Kick
  let sl = 0, sm1 = 0, sm2 = 0, shi = 0, sfull = 0, cnt = 0, sweep = 0, swc = 0, mod = 0, modc = 0;
  const beatFrames = Math.max(2, Math.round(Pf));
  for (let j = 0; j < nBars; j++) {
    if (grid && !(types[j] === 'groove' || types[j] === 'drop')) continue;
    const s = Math.round(phase + (barPhase + 4 * j) * Pf), e = Math.min(N, Math.round(phase + (barPhase + 4 * j + 4) * Pf));
    for (let i = s; i < e; i++) {
      sl += env.low[i]; sm1 += env.m1[i]; sm2 += env.m2[i]; shi += env.hi[i]; sfull += env.full[i]; cnt++;
      if (i > s) { const m = env.m1[i] + env.m2[i], mp = env.m1[i - 1] + env.m2[i - 1]; mod += Math.abs(m - mp); modc += m; }
    }
    // Filterfahrten: wie stark sich das Verhältnis hohe/tiefe Mitten innerhalb eines Schlags bewegt
    for (let b = s; b + beatFrames <= e; b += beatFrames) {
      let rs = 0, rq = 0;
      for (let i = b; i < b + beatFrames; i++) { const r = env.m2[i] / (env.m1[i] + env.m2[i] + 1e-9); rs += r; rq += r * r; }
      const mu = rs / beatFrames; sweep += Math.sqrt(Math.max(0, rq / beatFrames - mu * mu)); swc++;
    }
  }
  cnt = Math.max(1, cnt);
  const rmsDb = 20 * Math.log10(sfull / cnt + 1e-9);
  const brightRatio = shi / (sm1 + sm2 + shi + 1e-9);
  const sw = sweep / Math.max(1, swc), md = mod / Math.max(1e-9, modc);
  const mood = {
    energy: clamp(0.5 * clamp((rmsDb + 14) / 10) + 0.5 * clamp((bpm - 118) / 30)),
    bright: clamp((brightRatio - 0.02) / 0.2),
    acid: clamp(clamp((sw - 0.04) / 0.12) * 0.6 + clamp((md - 0.08) / 0.25) * 0.4)
  };
  // Übergangslänge in ganzen Takten, vorab pro Abschnitt festgelegt: laute Grooves 2 Takte, ruhigere und Breaks/Intro/Outro 4 Takte.
  // Kurze Abschnitte bekommen höchstens die Hälfte ihrer Länge, damit der Übergang im Abschnitt fertig wird.
  const baseBars = { intro: 4, groove: mood.energy >= 0.65 ? 2 : 4, break: 4, buildup: 2, drop: 2, outro: 4 };
  for (const s of sections) s.blendBars = Math.max(1, Math.min(baseBars[s.type] || 2, Math.floor((s.endBar - s.startBar) / 2) || 1));
  const drops = sections.filter(s => s.type === 'drop').length;

  // Treffer-Listen für „Instrumente hören“, vorab aus dem Track: Mitten- und Höhen-Anschläge (Zeit in s, Stärke 0..1 im Wechsel)
  // und die Stärke jedes Schlags. So kommen sie punktgenau, die Live-Erkennung käme ca. 60–80 ms später. Gleiche Regel wie die Live-Melder (onsetStep).
  const onsetList = (x, k, tau, minGap, skip) => {
    const out = [], dtm = hopS * 1000, ca = 1 - Math.exp(-dtm / tau), cb = 1 - Math.exp(-dtm / 2500);
    let prev = 0, mean = 0, varr = 0, avg = 0, last = -1e9;
    for (let i = 1; i < x.length; i++) {
      const e = x[i], flux = Math.max(0, e - prev); prev = e;
      mean += (flux - mean) * ca; varr += ((flux - mean) ** 2 - varr) * ca; avg += (e - avg) * cb;
      const thr = mean + k * Math.sqrt(varr), tm = i * dtm;
      if (flux > thr && e > avg * 0.8 && e > 1e-5 && tm - last > minGap && !(skip && skip(tm))) { last = tm; out.push((i + 0.35) * hopS, Math.min(1, flux / (thr * 1.8 + 1e-9))); }
    }
    return Float32Array.from(out);
  };
  const kickMs = []; { const kl = onsetList(env.low, 2.0, 600, 180); for (let i = 0; i < kl.length; i += 2) kickMs.push(kl[i] * 1000); }
  let kp = 0;
  const nearKick = tm => { while (kp < kickMs.length && kickMs[kp] < tm - 45) kp++; return kp < kickMs.length && kickMs[kp] <= tm + 45; };   // Klick des Kicks in den Mitten nicht als Mitten-Anschlag zählen (tm steigt von Aufruf zu Aufruf)
  const midX = new Float32Array(N); for (let i = 0; i < N; i++) midX[i] = Math.hypot(env.m1[i], env.m2[i]);
  const onM = onsetList(midX, 1.6, 500, 80, nearKick), onH = onsetList(env.hi, 1.6, 400, 55);
  const refK = pct(bKick, 0.75) || 1e-9, kA = new Float32Array(K); for (let k = 0; k < K; k++) kA[k] = clamp(bKick[k] / refK);

  // Steckbrief fürs Mitschreiben: pro Takt wenige Zahlen als Hex-Text (kein Ton, ca. 14 Zeichen pro Takt).
  // Pegel 0..255 bezogen auf den 95-%-Wert des Tracks; dazu Abschnittsbuchstabe, Kicks im Takt (0..4) und Zahl der Mitten-/Höhen-Anschläge.
  // Damit lassen sich Scan, Melder und „Instrumente hören“ später am Rechner an echten Tracks nachspielen.
  let fp = null;
  if (grid && nBars > 0) {
    const perBar = get => {
      const a = new Float32Array(nBars);
      for (let j = 0; j < nBars; j++) {
        const s = Math.max(0, Math.round(phase + (barPhase + 4 * j) * Pf)), e = Math.min(N, Math.round(phase + (barPhase + 4 * j + 4) * Pf));
        let x = 0; for (let i = s; i < e; i++) x += get(i);
        a[j] = e > s ? x / (e - s) : 0;
      }
      return a;
    };
    const h2 = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    const lv = a => { const ref = pct(a, 0.95) || 1e-9; let t = ''; for (let j = 0; j < a.length; j++) t += h2(255 * a[j] / ref); return t; };
    const cnt = list => {
      const c = new Array(nBars).fill(0), t0b = barT(0), t1b = barT(nBars); let j = 0;
      for (let i = 0; i < list.length; i += 2) { const t = list[i]; if (t < t0b || t >= t1b) continue; while (j < nBars - 1 && t >= barT(j + 1)) j++; c[j]++; }
      return c.map(h2).join('');
    };
    const letter = { intro: 'i', groove: 'g', break: 'b', buildup: 'u', drop: 'd', outro: 'o' };
    let kc = ''; for (let j = 0; j < nBars; j++) { let n = 0; for (let b = 0; b < 4; b++) { const k = barPhase + 4 * j + b; if (k < K && kA[k] >= 0.35) n++; } kc += n; }
    fp = {
      b0: +(phase * hopS).toFixed(3), bs: +beatS.toFixed(4), bp: barPhase, n: nBars,
      lo: lv(perBar(i => env.low[i])), mi: lv(perBar(i => env.m1[i] + env.m2[i])), hi: lv(perBar(i => env.hi[i])), fu: lv(perBar(i => env.full[i])),
      ty: types.map(t => letter[t] || 'g').join(''), kc, om: cnt(onM), oh: cnt(onH)
    };
  }
  return { grid, bpm, beatS, beat0: phase * hopS, barPhase, sections, mood, drops, duration: N * hopS, onM, onH, kA, fp };
}

// ===== Schläge und Töne trennen (Build 41) =====
// Nach FitzGerald 2010 „Harmonic/Percussive Separation using Median Filtering“ (DAFx):
// Im Klangbild sind Schläge (Kick, Hats, Claps) kurze senkrechte Striche (kurz, alle Höhen), Töne (303, Synths, Pads)
// lange waagrechte Striche (bleiben auf einer Höhe). Median über die Zeit behält die Töne, Median über die Höhen die
// Schläge. Daraus pro Takt: wie stark Kick (Schlag unter 100 Hz), Töne (150–3000 Hz) und Hats (Schlag ab 6 kHz) sind.
const KLANG_FFT = 1024, KLANG_NB = 64, KLANG_F0 = 40, KLANG_F1 = 10000;
function klangSetup(SR) {
  const N = KLANG_FFT, win = new Float32Array(N), cos = new Float32Array(N / 2), sin = new Float32Array(N / 2), rev = new Uint16Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  for (let i = 0; i < N / 2; i++) { cos[i] = Math.cos(-2 * Math.PI * i / N); sin[i] = Math.sin(-2 * Math.PI * i / N); }
  for (let i = 0, bits = Math.log2(N); i < N; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
  // Bänder 40 Hz … 10 kHz: unten jedes FFT-Fach ein eigenes Band (sonst blieben tiefe Bänder leer), oben je 10 % breiter
  const binHz = SR / N, top = Math.min(KLANG_F1, SR / 2 * 0.95), edges = [KLANG_F0];
  while (edges[edges.length - 1] < top && edges.length <= KLANG_NB) edges.push(Math.max(edges[edges.length - 1] * 1.1, edges[edges.length - 1] + binHz));
  const NB = edges.length - 1, bandOf = new Int16Array(N / 2).fill(-1), fc = new Float32Array(NB);
  for (let k = 1; k < N / 2; k++) { const f = k * binHz; for (let b = 0; b < NB; b++) if (f >= edges[b] && f < edges[b + 1]) { bandOf[k] = b; break; } }
  for (let b = 0; b < NB; b++) fc[b] = Math.sqrt(edges[b] * edges[b + 1]);
  return { N, NB, win, cos, sin, rev, bandOf, fc, re: new Float32Array(N), im: new Float32Array(N) };
}
// Ein Bild: Ausschnitt ab pos (fehlende Proben = 0), Stärke pro Band in out[o..o+NB)
function klangFrame(K, d, pos, out, o) {
  const N = K.N, re = K.re, im = K.im;
  for (let i = 0; i < N; i++) { const j = K.rev[i], p = pos + j; re[i] = p < d.length ? d[p] * K.win[j] : 0; im[i] = 0; }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = N / size;
    for (let s = 0; s < N; s += size) for (let k = 0; k < half; k++) {
      const c = K.cos[k * step], sn = K.sin[k * step], a = s + k, b = a + half;
      const tr = re[b] * c - im[b] * sn, ti = re[b] * sn + im[b] * c;
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
  const NB = K.NB;
  for (let b = 0; b < NB; b++) out[o + b] = 0;
  for (let k = 1; k < N / 2; k++) { const b = K.bandOf[k]; if (b >= 0) out[o + b] += re[k] * re[k] + im[k] * im[k]; }
  for (let b = 0; b < NB; b++) out[o + b] = Math.sqrt(out[o + b]);
}
function median(a, n) {                 // a wird sortiert (Einfügen, n ist klein)
  for (let i = 1; i < n; i++) { const v = a[i]; let j = i - 1; while (j >= 0 && a[j] > v) { a[j + 1] = a[j]; j--; } a[j + 1] = v; }
  return a[n >> 1];
}
// M: Stärke pro Bild und Band (T x NB). Ergebnis pro Bild: Kick (Schlag tief), Töne (150–3000 Hz), Hats (Schlag hoch)
async function klangSplit(M, T, fc, tick) {
  const NB = fc.length, LT = 8, LF = 4, buf = new Float32Array(2 * LT + 1);
  const kick = new Float32Array(T), ton = new Float32Array(T), hat = new Float32Array(T);
  const bK = [], bT = [], bH = [];
  for (let b = 0; b < NB; b++) { if (fc[b] < 100) bK.push(b); if (fc[b] >= 150 && fc[b] <= 3000) bT.push(b); if (fc[b] >= 6000) bH.push(b); }
  const isK = new Uint8Array(NB), isT = new Uint8Array(NB), isH = new Uint8Array(NB);
  bK.forEach(b => isK[b] = 1); bT.forEach(b => isT[b] = 1); bH.forEach(b => isH[b] = 1);
  const H = new Float32Array(NB);
  for (let t = 0; t < T; t++) {
    const o = t * NB;
    for (let b = 0; b < NB; b++) {                                   // Töne: Median über die Zeit
      let n = 0; for (let k = -LT; k <= LT; k++) { const tt = t + k; buf[n++] = M[(tt < 0 ? 0 : tt >= T ? T - 1 : tt) * NB + b]; }
      H[b] = median(buf, n);
    }
    let sk = 0, st = 0, sh = 0;
    for (let b = 0; b < NB; b++) {                                   // Schläge: Median über die Höhen
      let n = 0; for (let k = -LF; k <= LF; k++) { const bb = b + k; if (bb >= 0 && bb < NB) buf[n++] = M[o + bb]; }
      const P = median(buf, n), m = M[o + b], h2 = H[b] * H[b], p2 = P * P, den = h2 + p2 + 1e-12, e = m * m;
      if (isK[b]) sk += e * p2 / den;
      if (isT[b]) st += e * h2 / den;
      if (isH[b]) sh += e * p2 / den;
    }
    kick[t] = Math.sqrt(sk); ton[t] = Math.sqrt(st); hat[t] = Math.sqrt(sh);
    if (tick && (t & 2047) === 2047) await tick();
  }
  return { kick, ton, hat };
}
// Pro Takt: Anteile Kick / Töne / Hats (je Kanal auf den eigenen 90-%-Wert des Tracks bezogen, quadriert, dann Anteile 0..1)
function klangBars(A, S, hopS) {
  if (!A || !A.grid || !S) return null;
  const T = S.kick.length, barS = 4 * A.beatS, t0 = A.beat0 + A.barPhase * A.beatS;
  const nBars = Math.max(1, Math.ceil((T * hopS - t0) / barS));
  const raw = [new Float32Array(nBars), new Float32Array(nBars), new Float32Array(nBars)], cnt = new Float32Array(nBars);
  for (let t = 0; t < T; t++) {
    const j = Math.floor((t * hopS - t0) / barS); if (j < 0 || j >= nBars) continue;
    raw[0][j] += S.kick[t]; raw[1][j] += S.ton[t]; raw[2][j] += S.hat[t]; cnt[j]++;
  }
  for (const r of raw) for (let j = 0; j < nBars; j++) r[j] /= Math.max(1, cnt[j]);
  const p90 = r => { const s = Array.from(r).filter(x => x > 0).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length * 0.9)] : 1; };
  const ref = raw.map(p90), share = new Float32Array(nBars * 3);
  for (let j = 0; j < nBars; j++) {
    if (raw[0][j] + raw[1][j] + raw[2][j] < 1e-6) continue;           // Stille
    const v = raw.map((r, c) => { const x = Math.min(1.5, r[j] / (ref[c] + 1e-9)); return x * x; }), sum = v[0] + v[1] + v[2];   // quadriert: mehr Unterschied zwischen den Teilen
    for (let c = 0; c < 3; c++) share[j * 3 + c] = sum > 0.05 ? v[c] / sum : 0;
  }
  return { t0, barS, n: nBars, share };
}
// Für das Protokoll: mittlere Anteile je Abschnittsart, z. B. „Groove Kick 41 / Töne 33 / Hats 26 % · Break …“
function klangSummary(A) {
  const K = A.klang; if (!K) return '';
  const acc = {}, NAME = { intro: 'Intro', groove: 'Groove', break: 'Break', buildup: 'Aufbau', drop: 'Drop', outro: 'Outro' };
  for (let j = 0; j < K.n; j++) {
    const o = j * 3, sum = K.share[o] + K.share[o + 1] + K.share[o + 2]; if (sum < 0.5) continue;
    const tm = K.t0 + (j + 0.5) * K.barS, s = (A.sections || []).find(x => tm >= x.t0 && tm < x.t1); const k = s ? s.type : 'groove';
    const a = acc[k] || (acc[k] = [0, 0, 0, 0]); a[0] += K.share[o]; a[1] += K.share[o + 1]; a[2] += K.share[o + 2]; a[3]++;
  }
  return Object.keys(acc).map(k => { const a = acc[k], p = x => Math.round(100 * x / a[3]); return (NAME[k] || k) + ' Kick ' + p(a[0]) + ' / Töne ' + p(a[1]) + ' / Hats ' + p(a[2]) + ' %'; }).join(' · ');
}

// ===== Klangmesser (Build 43) =====
// Messwerte pro Takt: Druck, Hektik, Schärfe, Spannung, Filter und Ton (Grundton). Rechenwege und Skalen stammen aus dem
// eigenständigen Klangmesser (gleiche FFT, gleiche Formeln), laufen aber hier auf dem Raster dieses Scans: Tempo auf 0,01 BPM,
// echte Takt-Eins und Abschnitte. Der Klangmesser hatte ein eigenes grobes Raster (120-160 BPM, Takt-Anfang beliebig).
// Außerdem im selben Durchlauf wie der Scan: keine zweite Dekodierung und kein zweiter Offline-Lauf.
const KM_PULS_LO = 0.12, KM_PULS_HI = 0.42;
const kmMap = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));
function kmFFT(n) {
  const rev = new Uint32Array(n), bits = Math.log2(n) | 0, cs = new Float64Array(n / 2), sn = new Float64Array(n / 2), win = new Float32Array(n);
  for (let i = 0; i < n; i++) { let r = 0, x = i; for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); }
  for (let i = 0; i < n / 2; i++) { cs[i] = Math.cos(-2 * Math.PI * i / n); sn[i] = Math.sin(-2 * Math.PI * i / n); }
  const re = new Float64Array(n), im = new Float64Array(n);
  return {
    n, win, re, im, run() {
      for (let i = 0; i < n; i++) { const j = rev[i]; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let len = 2; len <= n; len <<= 1) {
        const h = len >> 1, step = n / len;
        for (let i = 0; i < n; i += len) for (let k = 0; k < h; k++) {
          const w = k * step, cr = cs[w], ci = sn[w], a = i + k, b = a + h, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
  };
}
// hopA: Schrittweite des Scans in Proben (512 bei 22050 Hz). Feine Bilder: halbe Schrittweite, Fenster 1024 (wie im Klangmesser: 256 / 1024).
// Töne: Fenster 4096, Schritt 2048. totalA: Zahl der Scan-Schritte.
function kmSetup(SR, hopA, totalA) {
  const hopF = hopA >> 1, N = hopA * 2, Nc = N * 4, hopC = Nc >> 1, half = N >> 1, binHz = SR / N, bin = f => Math.round(f / binHz);
  const nF = totalA * 2 + 4, nC = Math.ceil(totalA * hopA / hopC) + 2, f2 = kmFFT(Nc), pcOf = new Int8Array(Nc / 2 + 1), binHzC = SR / Nc;
  // Töne ab 100 Hz: darunter überdeckt der Kick (oft um 55-60 Hz) die Tonart
  for (let k = 0; k <= Nc / 2; k++) { const hz = k * binHzC; pcOf[k] = (hz < 100 || hz > 2000) ? -1 : ((Math.round(12 * Math.log2(hz / 440)) + 69) % 12 + 12) % 12; }
  return {
    SR, hopA, hopF, N, Nc, hopC, half, binHz, nF, nC, f1: kmFFT(N), f2, pcOf, mg: new Float32Array(Nc / 2 + 1),
    bB0: bin(30), bB1: bin(150), bM0: bin(300), bM1: bin(3000), bH0: bin(5000), bH1: Math.min(half, bin(11000)), pM0: bin(600), pM1: bin(3000), pH0: bin(3000),
    lg: new Float32Array(half + 1), prev: new Float32Array(half + 1), first: true,
    fluxM: new Float32Array(nF), fluxH: new Float32Array(nF), cent: new Float32Array(nF), flat: new Float32Array(nF),
    eAll: new Float32Array(nF), eBass: new Float32Array(nF), envM: new Float32Array(nF), envH: new Float32Array(nF),
    chroma: new Float32Array(nC * 12)
  };
}
// Ein feines Bild ab Probe pos (fehlende Proben = 0), Ergebnis an Stelle fi
function kmFrame(M, d, pos, fi) {
  const F = M.f1, N = F.n, half = M.half, re = F.re, im = F.im, win = F.win, L = d.length, binHz = M.binHz;
  let ss = 0;
  for (let i = 0; i < N; i++) { const p = pos + i, v = p >= 0 && p < L ? d[p] : 0; ss += v * v; re[i] = v * win[i]; im[i] = 0; }
  F.run();
  const lg = M.lg, prev = M.prev, bB0 = M.bB0, bB1 = M.bB1, pM0 = M.pM0, pM1 = M.pM1, pH0 = M.pH0, bH1 = M.bH1;
  let sm = 0, sf = 0, lp = 0, sp = 0, eb = 0, em = 0, eh = 0;
  for (let k = 0; k <= half; k++) {
    const p = re[k] * re[k] + im[k] * im[k], m = Math.sqrt(p);
    lg[k] = Math.log(1 + m * 20);
    sm += m; sf += m * k * binHz;
    const pp = p > 1e-10 ? p : 1e-10; lp += Math.log(pp); sp += pp;
    if (k >= bB0 && k < bB1) eb += p;
    if (k >= pM0 && k < pM1) em += p; else if (k >= pH0 && k < bH1) eh += p;
  }
  let dM = 0, dH = 0, x, k;
  for (k = M.bM0; k < M.bM1; k++) { x = lg[k] - prev[k]; if (x > 0) dM += x; }
  for (k = M.bH0; k < bH1; k++) { x = lg[k] - prev[k]; if (x > 0) dH += x; }
  if (M.first) { dM = dH = 0; M.first = false; }
  M.prev = lg; M.lg = prev;
  M.fluxM[fi] = dM; M.fluxH[fi] = dH;
  M.cent[fi] = sm > 1e-9 ? sf / sm : 0; M.flat[fi] = Math.exp(lp / (half + 1)) / (sp / (half + 1));
  M.eAll[fi] = ss / N; M.eBass[fi] = eb; M.envM[fi] = Math.sqrt(em); M.envH[fi] = Math.sqrt(eh);
}
// Ein Ton-Bild (12 Tonhöhen-Klassen), nur Spitzen im Spektrum zählen
function kmChroma(M, d, pos, gi) {
  const F = M.f2, N = F.n, L = d.length, re = F.re, im = F.im, win = F.win, mg = M.mg, pcOf = M.pcOf, o = gi * 12;
  if (gi < 0 || gi >= M.nC) return;
  for (let i = 0; i < N; i++) { const p = pos + i; re[i] = (p >= 0 && p < L ? d[p] : 0) * win[i]; im[i] = 0; }
  F.run();
  for (let k = 0; k <= N / 2; k++) mg[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
  for (let k = 1; k < N / 2; k++) { const pc = pcOf[k]; if (pc >= 0 && mg[k] >= mg[k - 1] && mg[k] >= mg[k + 1]) M.chroma[o + pc] += mg[k]; }
}
// Werte pro Takt auf dem Raster von A. Ergebnis: Felder je Takt (0..1, Spannung 0,5 = neutral), dazu Mittelwerte und 10-/90-%-Werte des Tracks
async function kmBars(A, M, tick) {
  if (!A || !A.grid) return null;
  const SR = M.SR, fps = SR / M.hopF, spb = A.beatS, six = spb / 4, barS = 4 * spb, t0 = A.beat0 + A.barPhase * spb, nF = M.nF - 4, nC = M.nC - 2;
  const nBars = Math.max(0, Math.floor((A.duration - t0) / barS + 1e-6));
  if (nBars < 4) return null;
  const clampI = (x, a, b) => Math.max(a, Math.min(b, x));
  const fx = t => (t * SR - M.N / 2) / M.hopF;                       // Zeit -> Nummer des feinen Bildes (Bildmitte)
  const pct = (arr, q) => { const s = Array.from(arr).sort((a, b) => a - b); return s[Math.floor(s.length * q)] || 0; };
  // Lage des Kick-Klicks in den Mitten (wie im Klangmesser über einen Schlag gefaltet). Der Beginn im Raster kommt aus dem Bass und liegt etwas später.
  const NBn = 64, prof = new Float64Array(NBn), pcn = new Float64Array(NBn);
  for (let f = 0; f < nF; f++) { const t = (f * M.hopF + M.N / 2) / SR, ib = Math.floor((((t - A.beat0) % spb + spb) % spb) / spb * NBn) % NBn; prof[ib] += M.fluxM[f]; pcn[ib]++; }
  let bestI = 0, bestS = -1;
  for (let i = 0; i < NBn; i++) { let s = 0; for (let k = -1; k <= 1; k++) { const j = (i + k + NBn) % NBn; s += prof[j] / Math.max(1, pcn[j]); } if (s > bestS) { bestS = s; bestI = i; } }
  let dl = (bestI + 0.5) / NBn * spb; if (dl > spb / 2) dl -= spb;
  const tc = t0 + dl;                                                  // Klick-Zeit des ersten Schlags im ersten Takt
  // 16tel-Raster: stärkster Einsatz pro Feld
  const n16 = nBars * 16;
  const slotMax = env => {
    const v = new Float32Array(n16);
    for (let s = 0; s < n16; s++) {
      const c = tc + s * six, a = clampI(Math.floor(fx(c - six * 0.25)), 0, nF), b = clampI(Math.ceil(fx(c + six * 0.35)), 0, nF); let mx = 0;
      for (let q = a; q < b; q++) if (env[q] > mx) mx = env[q];
      v[s] = mx;
    }
    return v;
  };
  const SM = slotMax(M.fluxM), SH = slotMax(M.fluxH), rM = pct(SM, 0.95) || 1, rH = pct(SH, 0.95) || 1;
  for (let i = 0; i < n16; i++) { SM[i] = Math.min(1.5, SM[i] / rM); SH[i] = Math.min(1.5, SH[i] / rH); }
  // Puls: wie stark die Lautstärke in Mitten und Höhen im 8tel-, 16tel- oder 32tel-Takt schwingt (Fenster: 4 Takte um den Takt herum)
  const pulse = (env, b) => {
    const c = t0 + (b + 0.5) * barS, a = clampI(Math.floor(fx(c - 2 * barS)), 0, nF), e = clampI(Math.floor(fx(c + 2 * barS)), 0, nF), n = e - a;
    if (n < 32) return [0, 0, 0];
    let mean = 0; for (let q = a; q < e; q++) mean += env[q]; mean /= n;
    const xw = new Float64Array(n); let tot = 0;
    for (let q = 0; q < n; q++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * q / (n - 1)); xw[q] = (env[a + q] - mean) * w; tot += xw[q] * xw[q]; }
    if (tot <= 0) return [0, 0, 0];
    const L = n / fps, res = [];
    for (const sub of [2, 4, 8]) {
      const fz = A.bpm / 60 * sub; let acc = 0;
      for (const dfz of [-1 / L, 0, 1 / L]) {
        const ww = 2 * Math.PI * (fz + dfz) / fps; let cr = 0, ci = 0;
        for (let z = 0; z < n; z++) { cr += xw[z] * Math.cos(ww * z); ci -= xw[z] * Math.sin(ww * z); }
        acc += cr * cr + ci * ci;
      }
      res.push(acc / (n * tot));
    }
    return res;
  };
  const bars = [];
  for (let b = 0; b < nBars; b++) {
    const a16 = b * 16, tb = t0 + b * barS, fa = clampI(Math.round(fx(tb)), 0, nF), fe = clampI(Math.round(fx(tb + barS)), 0, nF);
    let oM = 0, oH = 0;
    for (let i = 1; i < 16; i += 2) { oM += Math.min(1, SM[a16 + i]); oH += Math.min(1, SH[a16 + i]); }
    oM /= 8; oH /= 8;
    let ea = 0, ebs = 0; const cs = [], fl = [];
    for (let f = fa; f < fe; f++) { ea += M.eAll[f]; ebs += M.eBass[f]; cs.push(M.cent[f]); fl.push(M.flat[f]); }
    const nfr = Math.max(1, fe - fa); ea /= nfr; ebs /= nfr;
    cs.sort((x, z) => x - z); fl.sort((x, z) => x - z);
    const cMed = cs[cs.length >> 1] || 0, flMed = fl[fl.length >> 1] || 0;
    let cMean = 0, cVar = 0; for (const v of cs) cMean += v; cMean /= Math.max(1, cs.length);
    for (const v of cs) cVar += (v - cMean) * (v - cMean);
    const cStd = Math.sqrt(cVar / Math.max(1, cs.length));
    // Ton: Mitte des Ton-Bildes liegt bei Probe g*hopC + Nc/2
    const ca = clampI(Math.round((tb * SR - M.Nc / 2) / M.hopC), 0, nC), ce = clampI(Math.round(((tb + barS) * SR - M.Nc / 2) / M.hopC), 0, nC), ch = new Float64Array(12);
    let ct = 0, top = 0;
    for (let g = ca; g < ce; g++) for (let k = 0; k < 12; k++) ch[k] += M.chroma[g * 12 + k];
    for (let k = 0; k < 12; k++) { ct += ch[k]; if (ch[k] > ch[top]) top = k; }
    const pm = pulse(M.envM, b), ph = pulse(M.envH, b);
    bars.push({
      db: 10 * Math.log10(ea + 1e-12), dbB: 10 * Math.log10(ebs + 1e-12), oM, oH, c: cMed, fl: flMed, cb: cStd / (cMean + 1e-6), ton: top, tk: ct > 0 ? ch[top] / ct : 0,
      p8: pm[0] + 0.7 * ph[0], p16: pm[1] + 0.7 * ph[1], p32: pm[2] + 0.7 * ph[2], puls: (0.5 * pm[0] + pm[1] + 1.5 * pm[2]) + 0.7 * (ph[1] + 1.5 * ph[2])
    });
    if (tick && (b & 15) === 15) await tick();
  }
  // Bass-Pegel auf den Track beziehen (das Spektrum ist nicht normiert)
  const dbBref = pct(bars.map(x => x.dbB), 0.9), E = [];
  for (const x of bars) {
    x.druck = 0.6 * kmMap(x.db, -24, -5) + 0.4 * kmMap(x.dbB - dbBref, -18, 0);
    x.hektik = Math.max(0, Math.min(1, 0.75 * kmMap(x.puls, KM_PULS_LO, KM_PULS_HI) + 0.25 * ((x.oM + x.oH) / 2) / 0.75));
    x.raster = x.p32 > 0.8 * x.p16 && x.p32 > x.p8 ? 32 : (x.p16 >= x.p8 ? 16 : 8);
    x.schaerfe = Math.max(0, Math.min(1, 0.75 * kmMap(Math.log2(Math.max(1, x.c)), Math.log2(500), Math.log2(3200)) + 0.25 * kmMap(x.fl, 0.002, 0.08)));
    x.beweg = kmMap(x.cb, 0.25, 0.95);
    E.push((x.druck + x.hektik + x.schaerfe) / 3);
  }
  // Build 53: Filterfahrt über mehrere Takte (die 303-Fahrt): wie sich die Helligkeit (Schwerpunkt, in Oktaven) in den nächsten 2 Takten gegenüber den 2 davor ändert.
  // +1 = Filter öffnet sich schnell, -1 = er schließt sich. 0,2 Oktaven Unterschied gelten als volle Fahrt. ("Filter" = beweg misst dagegen nur das Schwanken innerhalb eines Takts.)
  const lc = bars.map(x => Math.log2(Math.max(50, x.c))), mn = (i0, i1) => { let s = 0, n = 0; for (let j = Math.max(0, i0); j <= Math.min(lc.length - 1, i1); j++) { s += lc[j]; n++; } return n ? s / n : 0; };
  bars.forEach((x, i) => { x.sweep = i < 2 || i > lc.length - 3 ? 0 : Math.max(-1, Math.min(1, (mn(i, i + 1) - mn(i - 2, i - 1)) / 0.2)); });
  bars.forEach((x, i) => {                                             // Spannung: dieser Takt gegen den Schnitt der 8 davor
    let s = 0, n = 0; for (let j = Math.max(0, i - 8); j < i; j++) { s += E[j]; n++; }
    x.spann = n ? Math.max(0, Math.min(1, 0.5 + 2.8 * (E[i] - s / n))) : 0.5;
  });
  const F32 = key => Float32Array.from(bars, x => x[key]);
  const K = { t0, barS, n: nBars, dl, druck: F32('druck'), hektik: F32('hektik'), schaerfe: F32('schaerfe'), beweg: F32('beweg'), spann: F32('spann'), sweep: F32('sweep'), tk: F32('tk'), puls: F32('puls'), db: F32('db'),
    ton: Uint8Array.from(bars, x => x.ton), raster: Uint8Array.from(bars, x => x.raster) };
  // Mittel der vollen Takte (ohne die leisesten 35 %), Tonart und Puls-Raster des Tracks
  const thr = pct(K.db, 0.35), full = []; for (let j = 0; j < nBars; j++) if (K.db[j] >= thr) full.push(j);
  const avg = key => { let s = 0; for (const j of full) s += K[key][j]; return s / Math.max(1, full.length); };
  K.avg = { druck: avg('druck'), hektik: avg('hektik'), schaerfe: avg('schaerfe'), beweg: avg('beweg'), spann: avg('spann') };
  // Eigene Skala des Tracks: 10-%- bis 90-%-Wert der vollen Takte. Damit nutzt ein ruhiger Track die ganze Breite (Anzeige und Bildwahl bleiben aber absolut vergleichbar).
  K.lo = {}; K.hi = {};
  for (const key of ['druck', 'hektik', 'schaerfe', 'beweg']) { const v = full.map(j => K[key][j]); K.lo[key] = pct(v, 0.1); K.hi[key] = pct(v, 0.9); }
  const cnt = new Array(12).fill(0); for (let j = 0; j < nBars; j++) if (K.tk[j] > 0.15) cnt[K.ton[j]]++;
  let key = 0; for (let k = 1; k < 12; k++) if (cnt[k] > cnt[key]) key = k;
  K.key = key; K.keyShare = cnt[key] / Math.max(1, nBars);
  const rc = { 8: 0, 16: 0, 32: 0 }; for (const j of full) rc[K.raster[j]]++;
  let rr = 8; for (const r of [16, 32]) if (rc[r] > rc[rr]) rr = r;
  K.puls16 = rr; K.pulsShare = rc[rr] / Math.max(1, full.length);
  return K;
}
const KM_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// Für das Protokoll: Mittel der vollen Takte
function kmSummary(A) {
  const K = A.km; if (!K) return '';
  const p = x => Math.round(100 * x);
  return 'Druck ' + p(K.avg.druck) + ' · Hektik ' + p(K.avg.hektik) + ' · Schärfe ' + p(K.avg.schaerfe) + ' · Spannung ' + p(K.avg.spann) + ' · Filter ' + p(K.avg.beweg) + ' · Puls ' + K.puls16 + 'tel (' + p(K.pulsShare) + ' %) · Grundton ' + KM_NOTES[K.key] + ' (' + p(K.keyShare) + ' %)';
}
