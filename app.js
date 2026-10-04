const BC = window.butterchurn && (window.butterchurn.default || window.butterchurn);

const canvas = document.getElementById('stage');
const audio = document.getElementById('audio');
const nextBtn = document.getElementById('nextPreset');
const playBtn = document.getElementById('playBtn');
const fileInput = document.getElementById('fileInput');
const presetNameEl = document.getElementById('presetName');
const stateInfoEl = document.getElementById('stateInfo');

if (!BC || !BC.createVisualizer) {
  stateInfoEl.textContent = 'Butterchurn failed to load.';
  throw new Error('Butterchurn not available.');
}

const ctx = new (window.AudioContext || window.webkitAudioContext)();
const analyser = ctx.createAnalyser();
analyser.fftSize = 2048;
analyser.smoothingTimeConstant = 0.0;

const masterGain = ctx.createGain();
masterGain.gain.value = 0.85;

const sourceNode = ctx.createGain();
sourceNode.connect(masterGain);
masterGain.connect(analyser);
analyser.connect(ctx.destination);

const audioReactive = new AudioReactiveController(analyser, {
  numBands: 24,
  minHz: 35,
  maxHz: 18000,
  smoothing: 0.18
});

const presets = Object.assign(
  {},
  window.butterchurnPresets.getPresets(),
  window.butterchurnPresetsExtra ? window.butterchurnPresetsExtra.getPresets() : {}
);

const presetNames = Object.keys(presets);
let activePresetName = presetNames[0] || null;

const visualizer = BC.createVisualizer(ctx, canvas, {
  width: window.innerWidth,
  height: window.innerHeight,
  pixelRatio: window.devicePixelRatio || 1,
  textureRatio: 1
});

visualizer.connectAudio(sourceNode);

const blender = new AdaptivePresetBlender(visualizer, {
  defaultBlendDuration: 1400,
  minBlendDuration: 450,
  maxBlendDuration: 2800,
  easing: 'smoothstep',
  mutualInfluenceStrength: 0.42,
  audioResponse: 0.65
});

function loadPresetByName(name) {
  if (!name || !presets[name]) return;
  activePresetName = name;
  presetNameEl.textContent = 'Preset: ' + name;
  try {
    visualizer.loadPreset(presets[name], 0.2);
  } catch (e) {
    console.error('Preset load failed:', e);
  }
}

function pickNextPreset() {
  const pool = presetNames.filter(name => name !== activePresetName);
  const name = pool[Math.floor(Math.random() * pool.length)] || activePresetName;
  return name;
}

function triggerAdaptiveTransition(nextPresetName) {
  if (!nextPresetName || !presets[nextPresetName]) return;
  if (blender.state && blender.state.active) return;

  const currentPreset = presets[activePresetName];
  const nextPreset = presets[nextPresetName];
  if (!currentPreset || !nextPreset) return;

  const audioState = audioReactive.update();
  blender.startTransition(currentPreset, nextPreset, audioState);
  activePresetName = nextPresetName;
  presetNameEl.textContent = 'Preset: ' + nextPresetName;
}

function resizeCanvas() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * (window.devicePixelRatio || 1);
  canvas.height = h * (window.devicePixelRatio || 1);
  if (visualizer && typeof visualizer.setRendererSize === 'function') {
    visualizer.setRendererSize(w, h);
  }
}

function attachAudioFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  audio.src = url;
  audio.loop = true;
  stateInfoEl.textContent = 'State: ready';

  audio.play().then(() => {
    stateInfoEl.textContent = 'State: playing';
  }).catch(() => {
    stateInfoEl.textContent = 'State: browser blocked autoplay';
  });
}

fileInput.addEventListener('change', (event) => {
  const file = event.target.files && event.target.files[0];
  attachAudioFile(file);
});

playBtn.addEventListener('click', () => {
  if (!audio.src) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 120;
    gain.gain.value = 0.02;
    oscillator.connect(gain);
    gain.connect(sourceNode);
    oscillator.start();
    stateInfoEl.textContent = 'State: demo tone';
    setTimeout(() => oscillator.stop(), 1200);
    return;
  }

  audio.play().then(() => {
    stateInfoEl.textContent = 'State: playing';
  }).catch(() => {
    stateInfoEl.textContent = 'State: browser blocked play';
  });
});

nextBtn.addEventListener('click', () => {
  const nextPreset = pickNextPreset();
  triggerAdaptiveTransition(nextPreset);
});

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
loadPresetByName(activePresetName);

function renderLoop() {
  requestAnimationFrame(renderLoop);

  const audioState = audioReactive.update();
  const blendState = blender.update(audioState, performance.now());

  const { x, y, scale, rotation } = blendState.deformed;
  canvas.style.transform = `translate(${x * 100}px, ${y * 100}px) scale(${scale}) rotate(${rotation}deg)`;
  canvas.style.filter = `saturate(${1.2 + blendState.audioInfluence * 1.3}) contrast(${1.05 + blendState.audioInfluence}) brightness(${1 + blendState.audioInfluence * 0.25})`;

  try {
    visualizer.render();
  } catch (e) {
    console.warn('visualizer render error', e);
  }
}

requestAnimationFrame(renderLoop);
