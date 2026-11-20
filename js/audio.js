/**
 * Procedural Web Audio Engine — "Cosmic Music Box" (宇宙のオルゴール)
 * Uses Db Major Pentatonic (Db, Eb, F, Ab, Bb) across 5 octaves with
 * synthesized stereo convolution reverb and gentle feedback delay.
 */
(function () {
  // MIDI notes for Db Major Pentatonic across octaves 2..6
  // Db2=37, Eb2=39, F2=41, Ab2=44, Bb2=46 ...
  const PENTATONIC_MIDI = [
    37, 39, 41, 44, 46, // Oct 2: Deep bass
    49, 51, 53, 56, 58, // Oct 3: Warm low marimba
    61, 63, 65, 68, 70, // Oct 4: Mid marimba / kalimba
    73, 75, 77, 80, 82, // Oct 5: Bright celesta
    85, 87, 89, 92, 94  // Oct 6: Sparkling swing-by arpeggio
  ];

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  class CosmicAudio {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.masterGain = null;
      this.filterNode = null;
      this.dryGain = null;
      this.reverbNode = null;
      this.reverbGain = null;
      this.delayNode = null;
      this.delayFeedback = null;
      this.lastNoteTime = 0;
      this.arpCounter = 0;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
        return;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();

      // Master chain: Filter -> MasterGain -> Destination
      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.value = 18000;
      this.filterNode.Q.value = 0.7;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.72;

      this.dryGain = this.ctx.createGain();
      this.dryGain.gain.value = 0.75;

      // Algorithmic Convolution Reverb (2.3s lush cosmic tail)
      this.reverbNode = this.ctx.createConvolver();
      this.reverbNode.buffer = this._createImpulseResponse(2.3, 2.6);
      this.reverbGain = this.ctx.createGain();
      this.reverbGain.gain.value = 0.48;

      // Subtle Dotted Delay
      this.delayNode = this.ctx.createDelay(1.0);
      this.delayNode.delayTime.value = 0.28;
      this.delayFeedback = this.ctx.createGain();
      this.delayFeedback.gain.value = 0.24;
      const delayFilter = this.ctx.createBiquadFilter();
      delayFilter.type = 'lowpass';
      delayFilter.frequency.value = 2600;

      this.delayNode.connect(delayFilter);
      delayFilter.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayNode);

      const delayWet = this.ctx.createGain();
      delayWet.gain.value = 0.22;
      this.delayNode.connect(delayWet);

      this.dryGain.connect(this.filterNode);
      this.reverbNode.connect(this.reverbGain);
      this.reverbGain.connect(this.filterNode);
      delayWet.connect(this.filterNode);

      this.filterNode.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }

    _createImpulseResponse(duration, decay) {
      const rate = this.ctx.sampleRate;
      const length = Math.floor(rate * duration);
      const impulse = this.ctx.createBuffer(2, length, rate);
      for (let ch = 0; ch < 2; ch++) {
        const data = impulse.getChannelData(ch);
        let prev = 0;
        for (let i = 0; i < length; i++) {
          const t = i / length;
          // Gently low-passed white noise with exponential decay
          const white = Math.random() * 2 - 1;
          prev = prev * 0.68 + white * 0.32;
          data[i] = prev * Math.pow(1 - t, decay);
        }
      }
      return impulse;
    }

    toggleMute() {
      this.init();
      this.muted = !this.muted;
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(
          this.muted ? 0 : 0.72,
          this.ctx.currentTime,
          0.05
        );
      }
      return this.muted;
    }

    setBulletTime(active) {
      if (!this.ctx || !this.filterNode) return;
      const targetFreq = active ? 850 : 18000;
      this.filterNode.frequency.setTargetAtTime(
        targetFreq,
        this.ctx.currentTime,
        0.08
      );
    }

    /**
     * Core marimba / celesta / bass voice
     */
    _playVoice(midiNote, options = {}) {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime + (options.delay || 0);
      const freq = midiToFreq(midiNote);
      const volume = options.volume ?? 0.22;
      const duration = options.duration ?? 0.85;
      const brightness = options.brightness ?? 0.16; // 4th harmonic marimba overtone
      const pan = options.pan ?? 0;

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(volume, now + (options.attack ?? 0.008));
      env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      // Main sine body
      const osc1 = this.ctx.createOscillator();
      osc1.type = options.wave || 'sine';
      osc1.frequency.setValueAtTime(freq, now);

      // Marimba / Music-box harmonic overtone
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * (options.harmonicRatio ?? 4), now);

      const overtoneGain = this.ctx.createGain();
      overtoneGain.gain.setValueAtTime(volume * brightness, now);
      overtoneGain.gain.exponentialRampToValueAtTime(0.0001, now + Math.min(0.22, duration * 0.4));

      osc1.connect(env);
      osc2.connect(overtoneGain);

      let outNode = env;
      if (this.ctx.createStereoPanner) {
        const panner = this.ctx.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-0.85, Math.min(0.85, pan)), now);
        env.connect(panner);
        overtoneGain.connect(panner);
        outNode = panner;
      } else {
        overtoneGain.connect(env);
      }

      outNode.connect(this.dryGain);
      outNode.connect(this.reverbNode);
      if (options.echo !== false) {
        outNode.connect(this.delayNode);
      }

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + duration + 0.05);
      osc2.stop(now + duration + 0.05);
    }

    /**
     * Drag aiming subtle music-box click
     */
    playAimTick(powerNorm, pan = 0) {
      if (!this.ctx || this.muted) return;
      if (this.ctx.currentTime - this.lastNoteTime < 0.09) return;
      this.lastNoteTime = this.ctx.currentTime;
      const idx = Math.min(19, Math.max(5, Math.floor(6 + powerNorm * 10)));
      this._playVoice(PENTATONIC_MIDI[idx], {
        volume: 0.06,
        duration: 0.22,
        brightness: 0.1,
        pan,
        echo: false
      });
    }

    /**
     * Launch satellite: warm upward 2-note marimba gesture
     */
    playLaunch(speedNorm, colorIndex = 0, pan = 0) {
      const baseIdx = 7 + (colorIndex % 3) * 2 + Math.floor(speedNorm * 4);
      const idx1 = Math.min(18, baseIdx);
      const idx2 = Math.min(21, baseIdx + 2);
      this._playVoice(PENTATONIC_MIDI[idx1], {
        volume: 0.2,
        duration: 0.65,
        brightness: 0.2,
        pan
      });
      this._playVoice(PENTATONIC_MIDI[idx2], {
        volume: 0.16,
        duration: 0.75,
        brightness: 0.25,
        delay: 0.065,
        pan
      });
    }

    /**
     * Slow orbit resonance -> Warm low bass note (遅い軌道 ＝ 低いベース音)
     */
    playSlowOrbitBass(speedNorm, pan = 0) {
      const idx = Math.max(0, Math.min(6, Math.floor(speedNorm * 6)));
      this._playVoice(PENTATONIC_MIDI[idx], {
        wave: 'triangle',
        volume: 0.15,
        attack: 0.04,
        duration: 1.45,
        brightness: 0.04,
        harmonicRatio: 2,
        pan,
        echo: false
      });
    }

    /**
     * High-speed Swing-by -> Sparkling ascending pentatonic arpeggio!
     * (高速スイングバイ ＝ 高くきらびやかなアルペジオ)
     */
    playSwingByArpeggio(intensity = 0.7, pan = 0) {
      const count = intensity > 0.75 ? 4 : 3;
      const startIdx = Math.min(18, 13 + Math.floor(intensity * 5) + (this.arpCounter++ % 2));
      for (let i = 0; i < count; i++) {
        const noteIdx = Math.min(PENTATONIC_MIDI.length - 1, startIdx + i);
        this._playVoice(PENTATONIC_MIDI[noteIdx], {
          volume: 0.15 - i * 0.018,
          duration: 0.95 + i * 0.15,
          brightness: 0.35,
          harmonicRatio: 3,
          delay: i * 0.058,
          pan: pan + (i - 1.5) * 0.12
        });
      }
    }

    /**
     * Observation point pass / progress chime
     */
    playObservationPass(progressNorm, colorIndex = 0, pan = 0) {
      const base = 10 + (colorIndex % 3) * 2 + Math.floor(progressNorm * 5);
      const idx = Math.min(PENTATONIC_MIDI.length - 2, base);
      this._playVoice(PENTATONIC_MIDI[idx], {
        volume: 0.22,
        duration: 0.8,
        brightness: 0.24,
        pan
      });
    }

    /**
     * Observation point completed: lush 3-note pentatonic chord bloom
     */
    playTaskComplete(colorIndex = 0, pan = 0) {
      const root = 10 + (colorIndex % 3) * 2;
      const chord = [root, root + 2, root + 4];
      chord.forEach((idx, i) => {
        const clamped = Math.min(PENTATONIC_MIDI.length - 1, idx);
        this._playVoice(PENTATONIC_MIDI[clamped], {
          volume: 0.2 - i * 0.025,
          duration: 1.35 + i * 0.2,
          brightness: 0.28,
          delay: i * 0.055,
          pan
        });
      });
      // Warm bass anchor
      this._playVoice(PENTATONIC_MIDI[root % 5], {
        wave: 'triangle',
        volume: 0.16,
        attack: 0.02,
        duration: 1.6,
        brightness: 0.05,
        harmonicRatio: 2,
        pan: pan * 0.4,
        echo: false
      });
    }

    /**
     * Micro-thruster burst
     */
    playThruster(pan = 0) {
      this._playVoice(PENTATONIC_MIDI[12], {
        volume: 0.16,
        duration: 0.42,
        brightness: 0.18,
        pan
      });
    }

    /**
     * Controlled self-destruct (clean dissolve)
     */
    playScuttle(pan = 0) {
      this._playVoice(PENTATONIC_MIDI[16], {
        volume: 0.14,
        duration: 0.35,
        brightness: 0.2,
        pan
      });
      this._playVoice(PENTATONIC_MIDI[11], {
        volume: 0.12,
        duration: 0.45,
        brightness: 0.1,
        delay: 0.05,
        pan
      });
    }

    /**
     * Close Grazing Flyby ("すれすれ交差") between two intertwining satellites!
     * Sparkling harmonic pentatonic fifth duet.
     */
    playNearMissHarmony(pan = 0) {
      const base = 15 + (this.arpCounter++ % 4);
      const idx1 = Math.min(PENTATONIC_MIDI.length - 1, base);
      const idx2 = Math.min(PENTATONIC_MIDI.length - 1, base + 3);
      this._playVoice(PENTATONIC_MIDI[idx1], {
        volume: 0.14,
        duration: 0.75,
        brightness: 0.34,
        harmonicRatio: 3,
        pan: pan - 0.12
      });
      this._playVoice(PENTATONIC_MIDI[idx2], {
        volume: 0.13,
        duration: 0.85,
        brightness: 0.38,
        harmonicRatio: 3,
        delay: 0.045,
        pan: pan + 0.12
      });
    }

    /**
     * Interstellar Transit ("恒星間トランジット"):
     * Shimmering 3-note ascending octave/fifth chime when a satellite bridges into a new star's gravity domain!
     */
    playInterstellarTransit(pan = 0) {
      const notes = [12, 15, 19];
      notes.forEach((idx, i) => {
        this._playVoice(PENTATONIC_MIDI[idx], {
          volume: 0.14 - i * 0.015,
          duration: 0.95 + i * 0.15,
          brightness: 0.34,
          harmonicRatio: 3,
          delay: i * 0.052,
          pan: pan + (i - 1) * 0.1
        });
      });
    }

    /**
     * Phase-shield deflection chime
     */
    playShieldPass(pan = 0) {
      this._playVoice(PENTATONIC_MIDI[18], {
        volume: 0.15,
        duration: 0.5,
        brightness: 0.3,
        harmonicRatio: 2,
        pan
      });
    }

    /**
     * Wormhole wrap shimmer
     */
    playWormhole(pan = 0) {
      this._playVoice(PENTATONIC_MIDI[14], {
        volume: 0.1,
        attack: 0.03,
        duration: 0.55,
        brightness: 0.22,
        pan
      });
    }

    /**
     * Kessler collision crunch + alarm undertone
     */
    playCollision(pan = 0, heavy = false) {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      // Filtered noise burst
      const bufLen = Math.floor(this.ctx.sampleRate * (heavy ? 0.45 : 0.22));
      const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 1.8);
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buf;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(heavy ? 320 : 680, now);
      bp.Q.value = 1.4;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(heavy ? 0.42 : 0.26, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.44 : 0.21));

      noise.connect(bp);
      bp.connect(gain);
      gain.connect(this.dryGain);
      gain.connect(this.reverbNode);
      noise.start(now);

      // Low dissonant thud
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(heavy ? 92 : 138, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + (heavy ? 0.4 : 0.2));

      const oscGain = this.ctx.createGain();
      oscGain.gain.setValueAtTime(heavy ? 0.28 : 0.16, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.42 : 0.22));

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;

      osc.connect(lp);
      lp.connect(oscGain);
      oscGain.connect(this.dryGain);
      osc.start(now);
      osc.stop(now + (heavy ? 0.45 : 0.24));
    }

    /**
     * Cosmic year / Upgrade chime
     */
    playYearComplete() {
      const notes = [10, 12, 14, 17, 19];
      notes.forEach((idx, i) => {
        this._playVoice(PENTATONIC_MIDI[idx], {
          volume: 0.18,
          duration: 1.5,
          brightness: 0.25,
          delay: i * 0.08,
          pan: (i - 2) * 0.2
        });
      });
    }

    /**
     * Puzzle Sub-Game: Crystalline target obstacle shatter (ascends with combo!)
     */
    playTargetShatter(comboIdx = 0, pan = 0) {
      const base = Math.min(18, 11 + comboIdx * 2);
      this._playVoice(PENTATONIC_MIDI[base], {
        volume: 0.22,
        duration: 0.85,
        brightness: 0.36,
        harmonicRatio: 3,
        pan
      });
      this._playVoice(PENTATONIC_MIDI[Math.min(24, base + 4)], {
        volume: 0.17,
        duration: 1.05,
        brightness: 0.42,
        harmonicRatio: 4,
        delay: 0.045,
        pan: pan * 0.7
      });
    }

    /**
     * Puzzle Sub-Game: Lush Stage Clear music-box fanfare
     */
    playStageClear(stars = 3) {
      const seq = stars >= 3 ? [10, 12, 14, 15, 17, 20] : [10, 12, 14, 15, 17];
      seq.forEach((idx, i) => {
        this._playVoice(PENTATONIC_MIDI[idx], {
          volume: 0.20 - i * 0.012,
          duration: 1.55 + i * 0.12,
          brightness: 0.32,
          harmonicRatio: 3,
          delay: i * 0.072,
          pan: (i - (seq.length - 1) * 0.5) * 0.16
        });
      });
      this._playVoice(PENTATONIC_MIDI[0], {
        wave: 'triangle',
        volume: 0.18,
        attack: 0.02,
        duration: 2.0,
        brightness: 0.05,
        harmonicRatio: 2,
        pan: 0,
        echo: false
      });
    }

    /**
     * Danger heartbeat pulse when observation ring is close to timeout
     */
    playDangerPulse(pan = 0) {
      this._playVoice(PENTATONIC_MIDI[2], {
        wave: 'triangle',
        volume: 0.14,
        attack: 0.01,
        duration: 0.28,
        brightness: 0.08,
        pan,
        echo: false
      });
    }
  }

  window.CosmicAudio = new CosmicAudio();
})();