(function (global) {
  'use strict';

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const lerp = (a, b, t) => a + (b - a) * t;

  class AudioReactiveController {
    constructor(analyser, options = {}) {
      if (!analyser || typeof analyser.getFloatFrequencyData !== 'function') {
        throw new Error('AudioReactiveController requires an AnalyserNode-like object.');
      }

      this.analyser = analyser;
      const sampleRate = analyser.context ? analyser.context.sampleRate : 44100;
      const nyquist = sampleRate / 2;

      this.options = Object.assign({
        numBands: 24,
        minHz: 35,
        maxHz: nyquist,
        smoothing: 0.18,
        bassWeight: 1.15,
        midWeight: 1.0,
        trebleWeight: 1.2,
        outputMin: 0,
        outputMax: 1
      }, options);

      this.numBands = Math.max(8, this.options.numBands);
      this.minHz = Math.max(20, this.options.minHz || 35);
      this.maxHz = Math.min(nyquist * 0.9, this.options.maxHz || nyquist);
      this.smoothing = clamp(this.options.smoothing, 0, 0.9);

      this.bandFreqs = this._buildBandFrequencies();
      this.prevValues = new Float32Array(this.numBands);
      this.prevSpectrum = new Float32Array(this.numBands);
      this.prevBass = 0;
      this.prevCentroid = 0;
      this.prevEnergy = 0;

      this.state = {
        bands: new Float32Array(this.numBands),
        bass: 0,
        lowMid: 0,
        mid: 0,
        highMid: 0,
        treble: 0,
        energy: 0,
        brightness: 0,
        centroid: 0,
        flux: 0,
        beat: 0,
        motion: 0,
        color: { h: 0, s: 0, l: 0 },
        raw: {
          overall: 0,
          bass: 0,
          lowMid: 0,
          mid: 0,
          highMid: 0,
          treble: 0,
          centroid: 0,
          brightness: 0,
          flux: 0
        }
      };
    }

    _buildBandFrequencies() {
      const { numBands, minHz, maxHz } = this;
      const bands = new Array(numBands);
      const logMin = Math.log(minHz);
      const logMax = Math.log(maxHz);

      for (let i = 0; i < numBands; i++) {
        const t0 = i / numBands;
        const t1 = (i + 1) / numBands;
        const start = Math.exp(lerp(logMin, logMax, t0));
        const end = Math.exp(lerp(logMin, logMax, t1));
        bands[i] = { start, end };
      }

      return bands;
    }

    _toBinIndex(frequencyHz, sampleRate) {
      return Math.max(0, Math.min(this.analyser.frequencyBinCount - 1, Math.round((frequencyHz / sampleRate) * this.analyser.frequencyBinCount * 2)));
    }

    _bandEnergy(freqData, startHz, endHz) {
      const fft = this.analyser.frequencyBinCount;
      const sampleRate = this.analyser.context ? this.analyser.context.sampleRate : 44100;
      const startBin = this._toBinIndex(startHz, sampleRate);
      const endBin = Math.max(startBin + 1, this._toBinIndex(endHz, sampleRate));

      let sum = 0;
      let total = 0;

      for (let i = startBin; i <= endBin && i < fft; i++) {
        const db = freqData[i];
        const normalized = clamp((db + 110) / 110, 0, 1);
        const power = normalized * normalized;
        sum += power;
        total += 1;
      }

      return total > 0 ? sum / total : 0;
    }

    _computeBandValues(freqData) {
      const values = new Float32Array(this.numBands);
      const sampleRate = this.analyser.context ? this.analyser.context.sampleRate : 44100;
      const nyquist = sampleRate / 2;

      for (let i = 0; i < this.numBands; i++) {
        const { start, end } = this.bandFreqs[i];
        const safeStart = Math.max(this.minHz, Math.min(nyquist * 0.95, start));
        const safeEnd = Math.max(safeStart + 10, Math.min(nyquist * 0.95, end));
        values[i] = this._bandEnergy(freqData, safeStart, safeEnd);
      }

      return values;
    }

    _smooth(current, previous) {
      return lerp(previous, current, 1 - this.smoothing);
    }

    update() {
      const freqData = this._freq || (this._freq = new Float32Array(this.analyser.frequencyBinCount));
      this.analyser.getFloatFrequencyData(freqData);

      const bands = this._computeBandValues(freqData);
      const bass = this._averageRange(bands, 0, 6);
      const lowMid = this._averageRange(bands, 6, 12);
      const mid = this._averageRange(bands, 12, 18);
      const highMid = this._averageRange(bands, 18, 22);
      const treble = this._averageRange(bands, 22, this.numBands);

      const total = bands.reduce((sum, v) => sum + v, 0);
      const brightness = (highMid + treble) / Math.max(0.0001, total + bass + lowMid + mid + highMid + treble);
      const weighted = bands.reduce((sum, v, i) => {
        const freq = this.bandFreqs[i];
        const center = (freq.start + freq.end) / 2;
        return sum + v * center;
      }, 0);
      const centroid = total > 0 ? weighted / total : 0;

      const flux = bands.reduce((sum, value, idx) => sum + Math.abs(value - this.prevSpectrum[idx]), 0) / this.numBands;

      const beat = Math.max(0, bass - this.prevBass) * this.options.bassWeight;
      const motion = Math.max(0, flux * 2.4 + beat * 0.65 + (mid - this.prevCentroid * 0.0001));

      const smoothedBands = new Float32Array(this.numBands);
      for (let i = 0; i < this.numBands; i++) {
        smoothedBands[i] = this._smooth(bands[i], this.prevValues[i]);
        this.prevValues[i] = smoothedBands[i];
        this.prevSpectrum[i] = bands[i];
      }

      const energy = clamp((bass * 0.42 + lowMid * 0.22 + mid * 0.18 + highMid * 0.1 + treble * 0.08) * 1.45, 0, 1);
      const smoothedBass = this._smooth(bass, this.prevBass);
      const smoothedCentroid = this._smooth(centroid, this.prevCentroid);
      const smoothedEnergy = this._smooth(energy, this.prevEnergy);

      this.prevBass = smoothedBass;
      this.prevCentroid = smoothedCentroid;
      this.prevEnergy = smoothedEnergy;

      const hueBase = 205 + (smoothedCentroid / 3000) * 140 - (smoothedEnergy * 30);
      const hue = ((hueBase % 360) + 360) % 360;
      const saturation = clamp(0.45 + smoothedEnergy * 0.55 + brightness * 0.2, 0, 1);
      const lightness = clamp(0.38 + smoothedEnergy * 0.25 + bass * 0.3, 0.2, 0.8);

      this.state.bands = smoothedBands;
      this.state.bass = smoothedBass;
      this.state.lowMid = this._smooth(lowMid, this.state.lowMid);
      this.state.mid = this._smooth(mid, this.state.mid);
      this.state.highMid = this._smooth(highMid, this.state.highMid);
      this.state.treble = this._smooth(treble, this.state.treble);
      this.state.energy = smoothedEnergy;
      this.state.brightness = this._smooth(brightness, this.state.brightness);
      this.state.centroid = smoothedCentroid;
      this.state.flux = this._smooth(flux, this.state.flux);
      this.state.beat = this._smooth(Math.max(0, beat), this.state.beat);
      this.state.motion = this._smooth(Math.max(0, motion), this.state.motion);
      this.state.color = {
        h: hue,
        s: saturation,
        l: lightness
      };

      this.state.raw = {
        overall: smoothedEnergy,
        bass: this.state.bass,
        lowMid: this.state.lowMid,
        mid: this.state.mid,
        highMid: this.state.highMid,
        treble: this.state.treble,
        centroid: this.state.centroid,
        brightness: this.state.brightness,
        flux: this.state.flux
      };

      return this.state;
    }

    _averageRange(bands, startIndex, endIndex) {
      const start = Math.max(0, Math.min(startIndex, bands.length));
      const end = Math.max(start + 1, Math.min(endIndex, bands.length));
      let total = 0;
      let count = 0;

      for (let i = start; i < end; i++) {
        total += bands[i];
        count += 1;
      }

      return count > 0 ? total / count : 0;
    }

    getState() {
      return this.state;
    }
  }

  global.AudioReactiveController = AudioReactiveController;
})(window);

/*
  Example usage:

  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.0;

  const audioReactive = new AudioReactiveController(analyser, {
    numBands: 24,
    minHz: 35,
    maxHz: 18000,
    smoothing: 0.18
  });

  function animate() {
    const state = audioReactive.update();

    // state.bands -> Float32Array with 24 values
    // state.bass / state.lowMid / state.mid / state.highMid / state.treble
    // state.energy / state.brightness / state.flux / state.beat / state.motion
    // state.color.h / s / l

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
*/
