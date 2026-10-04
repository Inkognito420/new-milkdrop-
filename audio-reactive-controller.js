(function (global) {
  'use strict';

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const lerp = (a, b, t) => a + (b - a) * t;

  class AudioReactiveController {
    constructor(analyser, options = {}) {
      if (!analyser || typeof analyser.getFloatFrequencyData !== 'function') {
        throw new Error('AudioReactiveController requires an analyser node-like object.');
      }

      this.analyser = analyser;
      const sampleRate = analyser.context ? analyser.context.sampleRate : 44100;
      const nyquist = sampleRate / 2;

      this.options = Object.assign({
        numBands: 24,
        minHz: 35,
        maxHz: nyquist,
        smoothing: 0.18,
        outputMin: 0,
        outputMax: 1
      }, options);

      this.numBands = Math.max(8, this.options.numBands);
      this.minHz = Math.max(20, this.options.minHz || 35);
      this.maxHz = Math.min(nyquist * 0.9, this.options.maxHz || nyquist);
      this.smoothing = clamp(this.options.smoothing, 0, 0.9);

      this.bandFreqs = this.buildBandFreqs();
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

    buildBandFreqs() {
      const bands = [];
      const logMin = Math.log(this.minHz);
      const logMax = Math.log(this.maxHz);

      for (let i = 0; i < this.numBands; i++) {
        const t0 = i / this.numBands;
        const t1 = (i + 1) / this.numBands;
        const start = Math.exp(lerp(logMin, logMax, t0));
        const end = Math.exp(lerp(logMin, logMax, t1));
        bands.push({ start, end });
      }

      return bands;
    }

    toBinIndex(frequencyHz, sampleRate) {
      return Math.max(0, Math.min(this.analyser.frequencyBinCount - 1, Math.round((frequencyHz / sampleRate) * this.analyser.frequencyBinCount * 2)));
    }

    bandEnergy(freqData, startHz, endHz) {
      const sampleRate = this.analyser.context ? this.analyser.context.sampleRate : 44100;
      const startBin = this.toBinIndex(startHz, sampleRate);
      const endBin = Math.max(startBin + 1, this.toBinIndex(endHz, sampleRate));

      let sum = 0;
      let total = 0;

      for (let i = startBin; i <= endBin && i < this.analyser.frequencyBinCount; i++) {
        const db = freqData[i];
        const normalized = clamp((db + 110) / 110, 0, 1);
        const power = normalized * normalized;
        sum += power;
        total += 1;
      }

      return total > 0 ? sum / total : 0;
    }

    computeBandValues(freqData) {
      const sampleRate = this.analyser.context ? this.analyser.context.sampleRate : 44100;
      const nyquist = sampleRate / 2;
      const values = new Float32Array(this.numBands);

      for (let i = 0; i < this.numBands; i++) {
        const band = this.bandFreqs[i];
        const start = Math.max(this.minHz, Math.min(nyquist * 0.95, band.start));
        const end = Math.max(start + 10, Math.min(nyquist * 0.95, band.end));
        values[i] = this.bandEnergy(freqData, start, end);
      }

      return values;
    }

    smooth(v, prev) {
      return lerp(prev, v, 1 - this.smoothing);
    }

    averageRange(bands, startIndex, endIndex) {
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

    update() {
      const freqData = new Float32Array(this.analyser.frequencyBinCount);
      this.analyser.getFloatFrequencyData(freqData);

      const bands = this.computeBandValues(freqData);
      const bass = this.averageRange(bands, 0, 6);
      const lowMid = this.averageRange(bands, 6, 12);
      const mid = this.averageRange(bands, 12, 18);
      const highMid = this.averageRange(bands, 18, 22);
      const treble = this.averageRange(bands, 22, this.numBands);

      const total = bands.reduce((sum, v) => sum + v, 0);
      const brightness = (highMid + treble) / Math.max(0.0001, total + bass + lowMid + mid + highMid + treble);

      let weighted = 0;
      for (let i = 0; i < bands.length; i++) {
        const freq = this.bandFreqs[i];
        const center = (freq.start + freq.end) / 2;
        weighted += bands[i] * center;
      }
      const centroid = total > 0 ? weighted / total : 0;

      let flux = 0;
      for (let i = 0; i < bands.length; i++) {
        flux += Math.abs(bands[i] - this.prevSpectrum[i]);
      }
      flux = flux / this.numBands;

      const beat = Math.max(0, bass - this.prevBass) * 1.4;
      const motion = Math.max(0, flux * 2.4 + beat * 0.8);

      const smoothedBands = new Float32Array(this.numBands);
      for (let i = 0; i < this.numBands; i++) {
        smoothedBands[i] = this.smooth(bands[i], this.prevValues[i]);
        this.prevValues[i] = smoothedBands[i];
        this.prevSpectrum[i] = bands[i];
      }

      const energy = clamp((bass * 0.42 + lowMid * 0.22 + mid * 0.18 + highMid * 0.1 + treble * 0.08) * 1.45, 0, 1);
      const smoothedBass = this.smooth(bass, this.prevBass);
      const smoothedCentroid = this.smooth(centroid, this.prevCentroid);
      const smoothedEnergy = this.smooth(energy, this.prevEnergy);

      this.prevBass = smoothedBass;
      this.prevCentroid = smoothedCentroid;
      this.prevEnergy = smoothedEnergy;

      this.state.bands = smoothedBands;
      this.state.bass = smoothedBass;
      this.state.lowMid = this.smooth(lowMid, this.state.lowMid);
      this.state.mid = this.smooth(mid, this.state.mid);
      this.state.highMid = this.smooth(highMid, this.state.highMid);
      this.state.treble = this.smooth(treble, this.state.treble);
      this.state.energy = smoothedEnergy;
      this.state.brightness = this.smooth(brightness, this.state.brightness);
      this.state.centroid = smoothedCentroid;
      this.state.flux = this.smooth(flux, this.state.flux);
      this.state.beat = this.smooth(Math.max(0, beat), this.state.beat);
      this.state.motion = this.smooth(Math.max(0, motion), this.state.motion);

      const hueBase = 205 + (smoothedCentroid / 3000) * 140 - (smoothedEnergy * 30);
      const hue = ((hueBase % 360) + 360) % 360;
      const saturation = clamp(0.45 + smoothedEnergy * 0.55 + this.state.brightness * 0.2, 0, 1);
      const lightness = clamp(0.38 + smoothedEnergy * 0.25 + bass * 0.3, 0.2, 0.8);

      this.state.color = { h: hue, s: saturation, l: lightness };
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
  }

  global.AudioReactiveController = AudioReactiveController;
})(window);
