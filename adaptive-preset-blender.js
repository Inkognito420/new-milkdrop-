(function (global) {
  'use strict';

  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const average = (arr) => arr.reduce((sum, v) => sum + v, 0) / Math.max(1, arr.length);

  /**
   * AdaptivePresetBlender (für den Browser angepasst)
   *
   * Behalten, weil es mit Butterchurn geht:
   *  - Übergangsdauer richtet sich nach dem Klang (laut/hart = kurz, ruhig = lang)
   *  - Analysefenster der letzten Momente
   *  - gegenseitige Verformung während des Übergangs (Verschiebung, Zoom, Drehung), kommt als Zahlen heraus
   *
   * Entfernt, weil es in Butterchurn nicht geht:
   *  - Preset A / B selbst laden, überblenden und zurücksetzen. Butterchurn überblendet über
   *    loadPreset(preset, Sekunden) selbst; mehrfaches Neuladen würde das Bild springen lassen.
   */
  class AdaptivePresetBlender {
    constructor(options = {}) {
      this.options = Object.assign({
        historySize: 60,
        minBlendDuration: 450,
        maxBlendDuration: 2800,
        defaultBlendDuration: 1400,
        audioResponse: 0.65,
        mutualInfluenceStrength: 0.42,
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
        audioInfluence: 0
      };
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
      while (this.buffer.length > this.options.historySize) {
        this.buffer.shift();
      }

      this._lastAudioSample = sample;
    }

    _analyzeWindow() {
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

      const energies = this.buffer.map(v => v.energy);
      const fluxes = this.buffer.map(v => v.flux);
      const basses = this.buffer.map(v => v.bass);
      const mids = this.buffer.map(v => v.mid);
      const treble = this.buffer.map(v => v.treble);
      const beats = this.buffer.map(v => v.beat);
      const brightness = this.buffer.map(v => v.brightness);
      const centroid = this.buffer.map(v => v.centroid);

      const energy = average(energies);
      const flux = average(fluxes);
      const bass = average(basses);
      const mid = average(mids);
      const trebleAvg = average(treble);
      const beat = average(beats);
      const bright = average(brightness);
      const cent = average(centroid);

      const smoothness = 1 - clamp(flux * 1.5 + beat * 0.35, 0, 1);

      return {
        energy,
        flux,
        bass,
        mid,
        treble: trebleAvg,
        beat,
        brightness: bright,
        centroid: cent,
        smoothness
      };
    }

    _computeBlendDuration(audioWindow) {
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

    _getEasing(t) {
      if (this.options.easing === 'cubic') return easeOutCubic(t);
      if (this.options.easing === 'linear') return t;
      return smoothstep(t);
    }

    /** Übergangsdauer in Millisekunden passend zum Klang der letzten Momente. */
    suggestDuration() {
      return this._computeBlendDuration(this._analyzeWindow());
    }

    /** Beginnt einen Übergang, der durationMs dauert (Butterchurn blendet selbst, hier läuft nur die Verformung mit). */
    begin(durationMs, now = performance.now()) {
      this.state.active = true;
      this.state.startTime = now;
      this.state.blendDuration = Math.max(100, durationMs || this.options.defaultBlendDuration);
      this.state.progress = 0;
      this.state.mix = 0;
      return this;
    }

    /** Jedes Bild aufrufen. Liefert die aktuelle Verformung (neutral, wenn kein Übergang läuft). */
    update(audioState = null, now = performance.now()) {
      if (audioState) this.pushAudioSample(audioState);
      const s = this.state;
      if (!s.active) return s;
      const windowData = this._analyzeWindow();
      const progress = clamp((now - s.startTime) / s.blendDuration, 0, 1);
      s.progress = progress;
      s.mix = this._getEasing(progress);
      s.audioInfluence = clamp((windowData.energy || 0) * this.options.audioResponse, 0, 1);

      const midPoint = 1 - Math.abs(s.mix - 0.5) * 2;      // am stärksten in der Mitte des Übergangs
      const influence = this.options.mutualInfluenceStrength;
      const x = ((windowData.bass || 0) * 0.5 + (windowData.flux || 0) * 0.35) * midPoint * influence;
      const y = ((windowData.mid || 0) * 0.5 + (windowData.brightness || 0) * 0.35) * midPoint * influence;
      const scale = 1 + ((windowData.energy || 0) * 0.24 + (windowData.beat || 0) * 0.12) * midPoint * influence;
      const rotation = ((windowData.treble || 0) * 18 + (windowData.centroid || 0) * 12) * midPoint * influence;
      s.deformed = { x: x * 2, y: y * 2, scale, rotation };

      if (progress >= 1) {
        s.active = false;
        s.deformed = { x: 0, y: 0, scale: 1, rotation: 0 };
      }
      return s;
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

/*
  Beispiel:

  const blender = new AdaptivePresetBlender();
  // laufend, jedes Bild:
  blender.pushAudioSample({ energy, flux, bass, mid, treble, beat, brightness, centroid });   // alle 0..1
  // bei einem Presetwechsel:
  const ms = blender.suggestDuration();
  viz.loadPreset(preset, ms / 1000);
  blender.begin(ms);
  // jedes Bild:
  const d = blender.update().deformed;   // x, y, scale, rotation
*/
