(function (global) {
  'use strict';

  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const average = (arr) => arr.reduce((sum, v) => sum + v, 0) / Math.max(1, arr.length);

  class AdaptivePresetBlender {
    constructor(visualizer, options = {}) {
      if (!visualizer || typeof visualizer.loadPreset !== 'function') {
        throw new Error('AdaptivePresetBlender requires a Butterchurn visualizer instance.');
      }

      this.viz = visualizer;
      this.options = Object.assign({
        historySize: 12,
        minBlendDuration: 450,
        maxBlendDuration: 2800,
        defaultBlendDuration: 1400,
        audioResponse: 0.65,
        mutualInfluenceStrength: 0.42,
        deformationBias: 0.5,
        easing: 'smoothstep'
      }, options);

      this.buffer = [];
      this.state = {
        active: false,
        startTime: 0,
        blendDuration: this.options.defaultBlendDuration,
        progress: 0,
        mix: 0,
        deformed: { x: 0, y: 0, scale: 1, rotation: 0 },
        audioInfluence: 0,
        transitionWindow: null
      };

      this.presetA = null;
      this.presetB = null;
      this.transitionStarted = false;
      this.lastAudioSample = null;
    }

    pushAudioSample(audioState) {
      if (!audioState) return;

      const sample = {
        t: performance.now(),
        energy: clamp(audioState.energy || 0, 0, 1),
        flux: clamp(audioState.flux || 0, 0, 1),
        bass: clamp(audioState.bass || 0, 0, 1),
        mid: clamp(audioState.mid || 0, 0, 1),
        treble: clamp(audioState.treble || 0, 0, 1),
        beat: clamp(audioState.beat || 0, 0, 1),
        brightness: clamp(audioState.brightness || 0, 0, 1),
        centroid: clamp(audioState.centroid || 0, 0, 1)
      };

      this.buffer.push(sample);
      while (this.buffer.length > this.options.historySize) this.buffer.shift();
      this.lastAudioSample = sample;
    }

    analyzeWindow() {
      if (!this.buffer.length) {
        return {
          energy: 0,
          flux: 0,
          bass: 0,
          mid: 0,
          treble: 0,
          beat: 0,
          brightness: 0,
          centroid: 0,
          smoothness: 0.5
        };
      }

      const current = this.buffer;
      const values = {
        energy: average(current.map(v => v.energy)),
        flux: average(current.map(v => v.flux)),
        bass: average(current.map(v => v.bass)),
        mid: average(current.map(v => v.mid)),
        treble: average(current.map(v => v.treble)),
        beat: average(current.map(v => v.beat)),
        brightness: average(current.map(v => v.brightness)),
        centroid: average(current.map(v => v.centroid))
      };

      values.smoothness = 1 - clamp(values.flux * 1.5 + values.beat * 0.35, 0, 1);
      return values;
    }

    computeBlendDuration(audioWindow) {
      let duration = this.options.defaultBlendDuration;
      const energy = audioWindow.energy || 0;
      const flux = audioWindow.flux || 0;
      const bass = audioWindow.bass || 0;
      const beat = audioWindow.beat || 0;
      const smoothness = audioWindow.smoothness || 0.5;

      if (energy > 0.75 && beat > 0.38) {
        duration = 600 + (1 - energy) * 350;
      } else if (energy < 0.28 && smoothness > 0.72) {
        duration = 1800 + (1 - energy) * 1200;
      } else if (flux > 0.52) {
        duration = 900;
      } else if (energy > 0.55) {
        duration = 1000;
      }

      if (bass > 0.68) duration *= 0.78;
      if (flux > 0.7) duration *= 0.8;

      return clamp(duration, this.options.minBlendDuration, this.options.maxBlendDuration);
    }

    easing(t) {
      if (this.options.easing === 'cubic') return easeOutCubic(t);
      if (this.options.easing === 'linear') return t;
      return smoothstep(t);
    }

    startTransition(presetA, presetB, audioWindow = null) {
      if (!presetA || !presetB) {
        throw new Error('Both presets are required.');
      }

      this.presetA = presetA;
      this.presetB = presetB;
      this.transitionStarted = false;
      this.state.active = true;
      this.state.progress = 0;
      this.state.mix = 0;
      this.state.audioInfluence = 0;
      this.state.deformed = { x: 0, y: 0, scale: 1, rotation: 0 };

      const windowData = audioWindow || this.analyzeWindow();
      this.state.blendDuration = this.computeBlendDuration(windowData);
      this.state.startTime = performance.now();
      this.state.transitionWindow = windowData;

      try {
        this.viz.loadPreset(presetA, 0.0);
      } catch (e) {
        console.error('Failed to load preset A:', e);
      }

      return this;
    }

    update(audioState = null, now = performance.now()) {
      if (audioState) this.pushAudioSample(audioState);

      const windowData = this.analyzeWindow();
      if (!this.state.active) {
        return this.state;
      }

      const elapsed = now - this.state.startTime;
      const progress = clamp(elapsed / this.state.blendDuration, 0, 1);
      const eased = this.easing(progress);

      this.state.progress = progress;
      this.state.mix = eased;
      this.state.audioInfluence = clamp((windowData.energy || 0) * this.options.audioResponse, 0, 1);

      if (!this.transitionStarted && progress > 0.5) {
        this.transitionStarted = true;
        try {
          this.viz.loadPreset(this.presetB, 2.6);
        } catch (e) {
          console.error('Failed to load preset B during transition:', e);
        }
      }

      const midpoint = 1 - Math.abs(this.state.mix - 0.5) * 2;
      const influence = this.options.mutualInfluenceStrength;

      const x = ((windowData.bass || 0) * 0.5 + (windowData.flux || 0) * 0.35) * midpoint * influence;
      const y = ((windowData.mid || 0) * 0.5 + (windowData.brightness || 0) * 0.35) * midpoint * influence;
      const scale = 1 + ((windowData.energy || 0) * 0.24 + (windowData.beat || 0) * 0.12) * midpoint * influence;
      const rotation = ((windowData.treble || 0) * 18 + (windowData.centroid || 0) * 12) * midpoint * influence;

      this.state.deformed = {
        x: x * 2,
        y: y * 2,
        scale,
        rotation
      };

      if (progress >= 1) {
        this.state.active = false;
        this.state.progress = 1;
        this.state.mix = 1;
        try {
          this.viz.loadPreset(this.presetB, 1.6);
        } catch (e) {
          console.error('Failed to finalize preset B:', e);
        }
      }

      return this.state;
    }

    getBlendState() {
      return {
        progress: this.state.progress,
        mix: this.state.mix,
        deformed: this.state.deformed,
        audioInfluence: this.state.audioInfluence,
        blendDuration: this.state.blendDuration
      };
    }
  }

  global.AdaptivePresetBlender = AdaptivePresetBlender;
})(window);
