/**
 * ORBITA — Intertwining Orbits & Swing-By Network Game
 * - Legible Existing Orbits: Every active satellite displays its crisp forward orbital loop
 * - Effortless Orbit Placement: Drag anywhere in space (or from any Fixed Star) to weave
 *   circles, tilted ellipses, and multi-star Figure-8 (∞) trajectories
 * - Close Grazing Flybys ("すれすれ交差"): Satellites skimming past each other chime in
 *   pentatonic harmony, recharge thruster fuel, and emit a soothing wave to nearby rings
 * - Clean Collision Consequence (No Debris): Colliding satellites are lost and enter fleet
 *   rebuild cooldown, increasing pressure on keeping Persistent Observation Rings clear
 */
(function () {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const upgradeOverlay = document.getElementById('upgradeOverlay');
  const upgradeCardsEl = document.getElementById('upgradeCards');
  const yearDotsEl = document.getElementById('yearDots');
  const helpOverlay = document.getElementById('helpOverlay');
  const closeHelpBtn = document.getElementById('closeHelpBtn');
  const gameOverOverlay = document.getElementById('gameOverOverlay');
  const gameOverIconEl = document.getElementById('gameOverIcon');
  const gameOverStatsEl = document.getElementById('gameOverStats');
  const restartBtn = document.getElementById('restartBtn');

  const Audio = window.CosmicAudio;
  const Physics = window.OrbitalPhysics;
  const Puzzle = window.PuzzleGame;

  const THEMES = {
    navy: {
      bg: '#080c18',
      grid: 'rgba(110, 155, 230, 0.045)',
      orbitGuide: 'rgba(140, 180, 255, 0.11)',
      bodyHome: '#eef4ff',
      bodyStar2: '#ffd478',
      bodyStar3: '#a8dcff',
      bodyStar4: '#d5b8ff',
      gravityGlow: ['rgba(90, 150, 255, 0.12)', 'rgba(90, 150, 255, 0.0)'],
      star2Glow: ['rgba(255, 200, 90, 0.14)', 'rgba(255, 200, 90, 0.0)'],
      star3Glow: ['rgba(130, 210, 255, 0.13)', 'rgba(130, 210, 255, 0.0)'],
      star4Glow: ['rgba(195, 155, 255, 0.13)', 'rgba(195, 155, 255, 0.0)'],
      fg: '#e8eef8',
      fgSoft: 'rgba(220, 234, 255, 0.54)',
      fgFaint: 'rgba(200, 220, 255, 0.18)',
      colors: ['#38e2ff', '#ffbe3b', '#ff5d8f'],
      danger: '#ff3b4e',
      harmony: '#9effe6',
      shield: '#8cf6ff',
      wormhole: 'rgba(130, 110, 255, 0.42)'
    },
    blueprint: {
      bg: '#f1f4f9',
      grid: 'rgba(28, 62, 120, 0.065)',
      orbitGuide: 'rgba(28, 62, 120, 0.13)',
      bodyHome: '#1b2d52',
      bodyStar2: '#d98200',
      bodyStar3: '#1976b2',
      bodyStar4: '#6a3fb5',
      gravityGlow: ['rgba(30, 85, 175, 0.10)', 'rgba(30, 85, 175, 0.0)'],
      star2Glow: ['rgba(220, 135, 10, 0.12)', 'rgba(220, 135, 10, 0.0)'],
      star3Glow: ['rgba(25, 125, 190, 0.11)', 'rgba(25, 125, 190, 0.0)'],
      star4Glow: ['rgba(106, 63, 181, 0.11)', 'rgba(106, 63, 181, 0.0)'],
      fg: '#182848',
      fgSoft: 'rgba(24, 40, 72, 0.55)',
      fgFaint: 'rgba(24, 40, 72, 0.16)',
      colors: ['#0088cc', '#e08600', '#d82b68'],
      danger: '#e02438',
      harmony: '#009e73',
      shield: '#0077b6',
      wormhole: 'rgba(92, 68, 210, 0.35)'
    }
  };

  const YEAR_DURATION = 52;      // seconds per Cosmic Year
  const REBUILD_DURATION = 9.0;  // cooldown when a satellite is lost in a collision
  const MAX_TRAIL_LEN = 48;

  let themeName = 'navy';
  let theme = THEMES.navy;

  let viewW = window.innerWidth;
  let viewH = window.innerHeight;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  const camera = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    span: 660,
    targetSpan: 660,
    scale: 1,
    shake: 0
  };

  let state = null;
  let hudButtons = [];
  let colorButtons = [];

  function createInitialState() {
    return {
      started: false,
      pausedForModal: false,
      gameOver: false,
      gameOverReason: null,
      simTime: 0,
      year: 1,
      yearProgress: 0,
      completedTasks: [0, 0, 0],
      swingByCount: 0,
      nearMissCount: 0,
      interstellarCount: 0,

      // Tight Finite Satellite Fleet — incentivizes weaving multi-star orbits per satellite!
      fleetMax: 3,
      rebuildTimers: [],
      rebuildDuration: REBUILD_DURATION,

      // Launch & Color selection
      unlockedColors: 2, // Cyan(0), Gold(1); Coral(2) unlocks in Year 2
      selectedColor: 0,
      launchCooldown: 0,
      launchCooldownMax: 0.45,

      // Micro-thruster fuel (for phase & orbit fine-tuning)
      fuel: 6.0,
      maxFuel: 6,
      fuelRegenRate: 0.34,

      // Roguelite upgrades
      upgrades: {
        relay: 0,
        shield: 0,
        anchor: 0,
        wormhole: 0,
        fleet: 0
      },

      // Entities
      bodyDefs: createCelestialDefs(),
      bodiesNow: [],
      satellites: [],
      tasks: [], // Persistent Observation Stations
      anchors: [],
      particles: [],
      pulses: [],
      flybySparks: [],
      relayLinks: [],
      dangerSatIds: new Set(),
      dangerPairs: [],
      previewServicedTaskIds: new Set(),

      // Pairwise tracking for close intertwining flybys ("すれすれ交差") & phase-shield pass-through
      pairPrevRadDot: new Map(),
      pairFlybyCooldowns: new Map(),
      pairPassGrace: new Map(),

      // Station spawning schedule
      nextStationTimer: 13.5,
      dangerCheckTimer: 0,
      dangerAudioTimer: 0,
      nextEntityId: 1,

      drag: null,
      lastTap: { time: 0, satId: null, x: 0, y: 0 }
    };
  }

  /**
   * Procedurally Generated Stationary Fixed-Star Constellation:
   * - All Fixed Stars share CONSTANT size (`radius: 18`), Exclusive Gravity Zone (`r <= 185`),
   *   and gravitational strength (`gm: 3400000`).
   * - Positions of Sol B, Sol C, Sol D are randomized every run while guaranteeing:
   *   1. Pairwise separation `>= 445` (so `r = 185` Exclusive Gravity Rings never overlap!)
   *   2. Open branching angles (`>= 54°`) and compact constellation framing for any screen aspect.
   */
  function createCelestialDefs() {
    const STAR_GM = 3400000;
    const STAR_RADIUS = 18;
    const EXCLUSIVE_R = 185;

    const placed = [{ x: 0, y: 0 }];
    const starMeta = [
      { id: 'star2', kind: 'star2', introDuration: 5.5 },
      { id: 'star3', kind: 'star3', introDuration: 6.0 },
      { id: 'star4', kind: 'star4', introDuration: 6.5 }
    ];

    const generated = [];
    for (let idx = 0; idx < starMeta.length; idx++) {
      let chosen = null;

      for (let attempt = 0; attempt < 120; attempt++) {
        const relaxSpread = attempt >= 80;

        // Prefer branching from stars with fewer close neighbors for organic constellations
        const parentWeights = placed.map((p, pIdx) => {
          let deg = 0;
          for (let j = 0; j < placed.length; j++) {
            if (j !== pIdx && Math.hypot(placed[j].x - p.x, placed[j].y - p.y) < 560) deg++;
          }
          return { p, weight: deg === 0 ? 3.0 : (deg === 1 ? 1.8 : 0.6) };
        });
        const totalW = parentWeights.reduce((acc, item) => acc + item.weight, 0);
        let pick = Math.random() * totalW;
        let parent = placed[0];
        for (const item of parentWeights) {
          pick -= item.weight;
          if (pick <= 0) {
            parent = item.p;
            break;
          }
        }

        const ang = Math.random() * Math.PI * 2;
        const linkDist = 455 + Math.random() * 55; // 455 .. 510 units
        const cx = parent.x + Math.cos(ang) * linkDist;
        const cy = parent.y + Math.sin(ang) * linkDist;

        // 1. Disjoint Exclusive Gravity Zones + comfortable interstellar corridor (>= 445 to ALL stars)
        let ok = true;
        for (let j = 0; j < placed.length; j++) {
          if (Math.hypot(cx - placed[j].x, cy - placed[j].y) < 445) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;

        // 2. Avoid cramped acute angles around the same parent star (>= ~54°)
        const ux = (cx - parent.x) / linkDist;
        const uy = (cy - parent.y) / linkDist;
        for (let j = 0; j < placed.length; j++) {
          if (placed[j] === parent) continue;
          const dx = placed[j].x - parent.x;
          const dy = placed[j].y - parent.y;
          const d = Math.hypot(dx, dy);
          if (d < 580 && d > 1) {
            const dot = (dx / d) * ux + (dy / d) * uy;
            if (dot > 0.59) {
              ok = false;
              break;
            }
          }
        }
        if (!ok) continue;

        // 3. Keep overall constellation compact so camera zoom stays crisp & readable
        if (!relaxSpread) {
          let sumX = cx;
          let sumY = cy;
          for (const p of placed) {
            sumX += p.x;
            sumY += p.y;
          }
          const centX = sumX / (placed.length + 1);
          const centY = sumY / (placed.length + 1);
          let maxRad = Math.hypot(cx - centX, cy - centY);
          for (const p of placed) {
            maxRad = Math.max(maxRad, Math.hypot(p.x - centX, p.y - centY));
          }
          if (maxRad > 635) continue;
        }

        chosen = { x: Math.round(cx), y: Math.round(cy) };
        break;
      }

      // Guaranteed safe fallback if needed
      if (!chosen) {
        const fallbackAngles = [0.2, 2.25, -2.05, 1.15, -1.0, 3.1];
        for (const fa of fallbackAngles) {
          const parent = placed[0];
          const cx = Math.round(parent.x + Math.cos(fa) * 475);
          const cy = Math.round(parent.y + Math.sin(fa) * 475);
          if (placed.every((p) => Math.hypot(cx - p.x, cy - p.y) >= 445)) {
            chosen = { x: cx, y: cy };
            break;
          }
        }
        if (!chosen) {
          chosen = { x: (idx + 1) * 475, y: 0 };
        }
      }

      placed.push(chosen);
      generated.push({
        id: starMeta[idx].id,
        kind: starMeta[idx].kind,
        active: false,
        spawnTime: 0,
        introDuration: starMeta[idx].introDuration,
        baseX: chosen.x,
        baseY: chosen.y,
        orbitRadius: 0,
        gm: STAR_GM,
        radius: STAR_RADIUS,
        exclusiveRadius: EXCLUSIVE_R,
        gravityVisualRadius: EXCLUSIVE_R
      });
    }

    return [
      {
        id: 'home',
        kind: 'home',
        active: true,
        spawnTime: -10,
        introDuration: 0,
        baseX: 0,
        baseY: 0,
        orbitRadius: 0,
        gm: STAR_GM,
        radius: STAR_RADIUS,
        exclusiveRadius: EXCLUSIVE_R,
        gravityVisualRadius: EXCLUSIVE_R
      },
      ...generated
    ];
  }

  function recomputeCameraTargetFromActiveStars() {
    if (!state) return;
    const activeStars = state.bodyDefs.filter((b) => b.active);
    if (activeStars.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const b of activeStars) {
      if (b.baseX < minX) minX = b.baseX;
      if (b.baseX > maxX) maxX = b.baseX;
      if (b.baseY < minY) minY = b.baseY;
      if (b.baseY > maxY) maxY = b.baseY;
    }

    camera.targetX = (minX + maxX) * 0.5;
    camera.targetY = (minY + maxY) * 0.5 + (activeStars.length > 1 ? 18 : 0);

    if (activeStars.length === 1) {
      camera.targetSpan = 660;
      return;
    }

    const reqW = (maxX - minX) + 540;
    const reqH = (maxY - minY) + 575;
    const safeW = Math.max(320, viewW);
    const safeH = Math.max(320, viewH);
    const minDim = Math.min(safeW, safeH);

    camera.targetSpan = Math.max(
      660,
      reqW * (minDim / safeW),
      reqH * (minDim / safeH)
    );
  }

  function getAvailableFleetSlots() {
    return Math.max(0, state.fleetMax - state.satellites.length - state.rebuildTimers.length);
  }

  function triggerSlotRebuild(fraction = 1.0) {
    if (state.satellites.length + state.rebuildTimers.length <= state.fleetMax) {
      state.rebuildTimers.push(state.rebuildDuration * fraction);
    }
  }

  function pairKey(idA, idB) {
    return idA < idB ? `${idA}_${idB}` : `${idB}_${idA}`;
  }

  function refreshSatelliteOrbitPath(sat) {
    sat.orbitPath = Physics.computeOrbitTrack(
      sat,
      state.bodyDefs,
      state.simTime,
      getPhysicsContext(),
      560,
      1 / 52
    );
    const anyIgniting = state.bodyDefs.some(
      (b) => b.active && b.introDuration > 0 && state.simTime - b.spawnTime < b.introDuration
    );
    sat.orbitTrackTimer = anyIgniting ? 0.16 : 0.55;
  }

  function resetGame() {
    state = createInitialState();
    camera.x = 0;
    camera.y = 0;
    camera.targetX = 0;
    camera.targetY = 0;
    camera.span = 660;
    camera.targetSpan = 660;
    camera.shake = 0;
    recomputeCameraTargetFromActiveStars();
    updateScale();
    state.bodiesNow = Physics.evaluateBodiesAtTime(state.bodyDefs, 0);

    // Spawn 2 initial Persistent Observation Stations around Sol A at randomized opposing angles
    const initAng = Math.random() * Math.PI * 2;
    spawnPersistentStation(0, 134, initAng);
    spawnPersistentStation(1, 162, initAng + Math.PI + (Math.random() - 0.5) * 0.7);

    upgradeOverlay.classList.add('hidden');
    gameOverOverlay.classList.add('hidden');
    Audio.setBulletTime(false);
  }

  // =========================================================================
  // Coordinate Transforms & Resize
  // =========================================================================
  function updateScale() {
    const minDim = Math.max(320, Math.min(viewW, viewH));
    camera.scale = minDim / camera.span;
  }

  // Safe-area insets (notch / home indicator) read from CSS env()
  let safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  function readSafeInsets() {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);' +
      'padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    safeInsets = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0
    };
    document.body.removeChild(probe);
  }

  function resize() {
    const vv = window.visualViewport;
    viewW = Math.round(vv ? vv.width : window.innerWidth);
    viewH = Math.round(vv ? vv.height : window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    readSafeInsets();
    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
    canvas.style.width = viewW + 'px';
    canvas.style.height = viewH + 'px';
    if (state) {
      recomputeCameraTargetFromActiveStars();
    }
    updateScale();
    if (Puzzle) {
      Puzzle.resize(viewW, viewH, dpr, safeInsets);
    }
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - viewW * 0.5) / camera.scale + camera.x,
      y: (sy - viewH * 0.5) / camera.scale + camera.y
    };
  }

  function getWorldBounds() {
    return {
      cx: camera.x,
      cy: camera.y,
      halfW: (viewW * 0.5) / camera.scale,
      halfH: (viewH * 0.5) / camera.scale
    };
  }

  function worldXToPan(wx) {
    const halfW = Math.max(200, (viewW * 0.5) / camera.scale);
    return Math.max(-0.85, Math.min(0.85, (wx - camera.x) / halfW));
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  // Block iOS pinch-zoom / double-tap zoom / pull-to-refresh on the game surface
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) =>
    document.addEventListener(n, (e) => e.preventDefault())
  );
  document.addEventListener('touchmove', (e) => {
    if (e.target.closest && e.target.closest('.stage-select-panel, .help-panel, .upgrade-panel')) return;
    e.preventDefault();
  }, { passive: false });

  // =========================================================================
  // Spawning Persistent Observation Stations & Upgrades
  // =========================================================================
  function computeStationFillRate() {
    const countFactor = Math.max(0, state.tasks.length - 2) * 3.0;
    const baseSeconds = 45 + countFactor - Math.min(8, (state.year - 1) * 1.4);
    return 1 / Math.max(33, baseSeconds);
  }

  function spawnPersistentStation(forcedColor, forcedDist, forcedAngle, anchorStar) {
    const bounds = getWorldBounds();

    let colorIndex = forcedColor;
    if (colorIndex === undefined) {
      const counts = [0, 0, 0];
      for (const t of state.tasks) counts[t.colorIndex]++;
      let minCount = Infinity;
      for (let c = 0; c < state.unlockedColors; c++) {
        if (counts[c] < minCount) minCount = counts[c];
      }
      const underRep = [];
      for (let c = 0; c < state.unlockedColors; c++) {
        if (counts[c] <= minCount + 1) underRep.push(c);
      }
      colorIndex = underRep[Math.floor(Math.random() * underRep.length)];
    }

    let x = 0;
    let y = 0;
    let valid = false;

    const minDim = Math.max(320, Math.min(viewW, viewH));
    const targetHalfW = (viewW * 0.5) / (minDim / camera.targetSpan);
    const targetHalfH = (viewH * 0.5) / (minDim / camera.targetSpan);

    const isClearSpot = (cx, cy, checkCamBounds) => {
      if (checkCamBounds) {
        const allowHalfW = Math.max(bounds.halfW, targetHalfW) * 0.84;
        const allowHalfH = Math.max(bounds.halfH, targetHalfH) * 0.80;
        if (
          Math.abs(cx - camera.targetX) > allowHalfW ||
          Math.abs(cy - camera.targetY) > allowHalfH
        ) {
          return false;
        }
      }
      for (const b of state.bodiesNow) {
        if (Math.hypot(cx - b.x, cy - b.y) < b.radius + 50) return false;
      }
      for (const bDef of state.bodyDefs) {
        if (bDef.active && Math.hypot(cx - bDef.baseX, cy - bDef.baseY) < bDef.radius + 50) return false;
      }
      for (const t of state.tasks) {
        if (Math.hypot(cx - t.x, cy - t.y) < 82) return false;
      }
      return true;
    };

    if (forcedDist !== undefined && forcedAngle !== undefined) {
      const ref = anchorStar || { x: 0, y: 0 };
      const offsets = [0, 0.7, -0.7, 1.4, -1.4, 2.2, -2.2, Math.PI];
      for (const off of offsets) {
        const candX = ref.x + Math.cos(forcedAngle + off) * forcedDist;
        const candY = ref.y + Math.sin(forcedAngle + off) * forcedDist;
        if (isClearSpot(candX, candY, false)) {
          x = candX;
          y = candY;
          valid = true;
          break;
        }
      }
      if (!valid) {
        x = ref.x + Math.cos(forcedAngle) * forcedDist;
        y = ref.y + Math.sin(forcedAngle) * forcedDist;
        valid = true;
      }
    } else {
      const fixedStars = state.bodiesNow.filter((b) => b.intro > 0.45);

      // 26% chance to place an L1 Interstellar Corridor Station between two neighboring Fixed Stars!
      if (fixedStars.length >= 2 && Math.random() < 0.26) {
        const pairs = [];
        for (let i = 0; i < fixedStars.length; i++) {
          for (let j = i + 1; j < fixedStars.length; j++) {
            const d = Math.hypot(fixedStars[i].x - fixedStars[j].x, fixedStars[i].y - fixedStars[j].y);
            if (d < 590) pairs.push([fixedStars[i], fixedStars[j], d]);
          }
        }
        if (pairs.length > 0) {
          for (let attempt = 0; attempt < 12; attempt++) {
            const [sA, sB, d] = pairs[Math.floor(Math.random() * pairs.length)];
            const mx = (sA.x + sB.x) * 0.5;
            const my = (sA.y + sB.y) * 0.5;
            const nx = -(sB.y - sA.y) / d;
            const ny = (sB.x - sA.x) / d;
            const lat = (Math.random() - 0.5) * 76;
            const lon = (Math.random() - 0.5) * 44;
            const ux = (sB.x - sA.x) / d;
            const uy = (sB.y - sA.y) / d;
            const candX = mx + nx * lat + ux * lon;
            const candY = my + ny * lat + uy * lon;
            if (isClearSpot(candX, candY, true)) {
              x = candX;
              y = candY;
              valid = true;
              break;
            }
          }
        }
      }

      if (!valid) {
        // Favor stars that currently have fewer nearby stations so all stars require coverage!
        for (let attempt = 0; attempt < 42; attempt++) {
          let host = fixedStars[0] || { x: 0, y: 0, radius: 18 };
          if (fixedStars.length > 1) {
            let bestScore = Infinity;
            for (const st of fixedStars) {
              let localCount = 0;
              for (const t of state.tasks) {
                if (Math.hypot(t.x - st.x, t.y - st.y) < 200) localCount++;
              }
              const score = localCount + Math.random() * 1.15;
              if (score < bestScore) {
                bestScore = score;
                host = st;
              }
            }
          }

          // Place inside the host star's Exclusive Gravity Zone (r <= 170 < 185)
          const r = 74 + Math.random() * 96;
          const ang = Math.random() * Math.PI * 2;
          const candX = host.x + Math.cos(ang) * r;
          const candY = host.y + Math.sin(ang) * r;

          if (isClearSpot(candX, candY, true)) {
            x = candX;
            y = candY;
            valid = true;
            break;
          }
        }
      }
    }

    if (!valid) return;

    state.tasks.push({
      id: state.nextEntityId++,
      x,
      y,
      radius: 22,
      colorIndex,
      demand: 0.14,
      calmTimer: 0,
      spawnAnim: 0,
      serviceFlash: 0,
      hitCooldowns: new Map()
    });
    emitPulse(x, y, 6, 36, theme.colors[colorIndex], 0.65, 2);
  }

  function spawnLagrangeAnchor() {
    const idx = state.anchors.length;
    const ang = -Math.PI * 0.35 + idx * 2.1;
    const dist = 140 + idx * 45;
    const ax = camera.x + Math.cos(ang) * dist;
    const ay = camera.y + Math.sin(ang) * dist;
    state.anchors.push({
      id: state.nextEntityId++,
      x: ax,
      y: ay,
      radius: 46,
      pulse: 0
    });
    emitPulse(ax, ay, 10, 62, theme.fg, 0.7);
    for (const sat of state.satellites) sat.orbitTrackTimer = 0;
  }

  function emitParticles(x, y, color, count = 12, speedScale = 1) {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const spd = (32 + Math.random() * 84) * speedScale;
      state.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        size: 2.2 + Math.random() * 2.6,
        color,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.4
      });
    }
  }

  function emitPulse(x, y, startR, endR, color, duration = 0.65, lineWidth = 2) {
    state.pulses.push({
      x,
      y,
      startR,
      endR,
      color,
      life: 0,
      maxLife: duration,
      lineWidth
    });
  }

  // =========================================================================
  // Effortless Orbit Placement (Free-Space + Fixed-Star Ring Slingshot)
  // =========================================================================
  function findNearestActiveStar(wx, wy) {
    let best = state.bodiesNow[0] || { x: 0, y: 0, radius: 18.5, gm: 3400000, intro: 1 };
    let bestDist = Infinity;
    for (let i = 0; i < state.bodiesNow.length; i++) {
      const b = state.bodiesNow[i];
      if (b.intro < 0.35) continue;
      const d = Math.hypot(wx - b.x, wy - b.y);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return { star: best, dist: bestDist };
  }

  function computeLaunchInitialState(drag) {
    // Mode A: Dragging from on/near any Fixed Star -> clean orbital ring launch around that star!
    if (drag.anchorStarId) {
      const host = state.bodiesNow.find((b) => b.id === drag.anchorStarId) || state.bodiesNow[0];
      const pullDx = host.x - drag.currWorldX;
      const pullDy = host.y - drag.currWorldY;
      const rawPull = Math.hypot(pullDx, pullDy);
      if (rawPull < 12) return null;

      const maxPull = Math.max(155, camera.span * 0.22);
      const clampedPull = Math.min(maxPull, rawPull);
      const powerNorm = (clampedPull - 12) / (maxPull - 12);

      const ux = pullDx / rawPull;
      const uy = pullDy / rawPull;
      const px = -uy;
      const py = ux;

      const touchOffX = drag.startWorldX - host.x;
      const touchOffY = drag.startWorldY - host.y;
      const rawPerp = touchOffX * px + touchOffY * py;
      if (drag.orbitSign === undefined || Math.abs(rawPerp) > 12) {
        drag.orbitSign = rawPerp < -4 ? -1 : 1;
      }

      const ringR = host.radius + 48; // ~66 units: comfortable inner orbital lane
      const startX = host.x + px * (drag.orbitSign * ringR);
      const startY = host.y + py * (drag.orbitSign * ringR);

      const vCirc = Physics.getLocalCircularSpeed(host, ringR);
      // 0.78 vCirc .. 1.38 vCirc (stays bound up to multi-star transfer speed without flying off to infinity)
      let launchSpeed = vCirc * (0.78 + powerNorm * 0.60);
      if (Math.abs(launchSpeed - vCirc) < vCirc * 0.08) {
        launchSpeed = launchSpeed * 0.45 + vCirc * 0.55;
      }

      return {
        x: startX,
        y: startY,
        vx: ux * launchSpeed,
        vy: uy * launchSpeed,
        colorIndex: state.selectedColor,
        powerNorm,
        anchorOriginX: host.x,
        anchorOriginY: host.y
      };
    }

    // Mode B: Free-Space Direct Orbit Placement!
    let startX = drag.launchX;
    let startY = drag.launchY;

    const pullDx = startX - drag.currWorldX;
    const pullDy = startY - drag.currWorldY;
    const rawPull = Math.hypot(pullDx, pullDy);
    if (rawPull < 10) return null;

    const maxPull = Math.max(155, camera.span * 0.22);
    const clampedPull = Math.min(maxPull, rawPull);
    const powerNorm = (clampedPull - 10) / (maxPull - 10);

    const ux = pullDx / rawPull;
    const uy = pullDy / rawPull;

    const { star: nearStar, dist: rStar } = findNearestActiveStar(startX, startY);
    const vCirc = Physics.getLocalCircularSpeed(nearStar, Math.max(38, rStar));

    // Scale pull smoothly around local bound orbital speeds (0.60 .. 1.40 of vCirc)
    let launchSpeed = Math.max(66, vCirc * (0.60 + powerNorm * 0.80));

    // Gentle Circular Assist when pulling nearly perpendicular inside a star's Exclusive Gravity Zone
    if (rStar > 38 && rStar <= 190) {
      const rx = (startX - nearStar.x) / rStar;
      const ry = (startY - nearStar.y) / rStar;
      const radialCos = Math.abs(ux * rx + uy * ry);
      if (radialCos < 0.32 && Math.abs(launchSpeed - vCirc) < vCirc * 0.18) {
        const assist = (1 - radialCos / 0.32) * 0.45;
        launchSpeed = launchSpeed * (1 - assist) + vCirc * assist;
      }
    }

    return {
      x: startX,
      y: startY,
      vx: ux * launchSpeed,
      vy: uy * launchSpeed,
      colorIndex: state.selectedColor,
      powerNorm,
      anchorOriginX: startX,
      anchorOriginY: startY
    };
  }

  function computeThrusterPreviewState(sat, drag) {
    const pullDx = sat.x - drag.currWorldX;
    const pullDy = sat.y - drag.currWorldY;
    const rawPull = Math.hypot(pullDx, pullDy);
    if (rawPull < 10) return null;

    const maxPull = 135;
    const clamped = Math.min(maxPull, rawPull);
    const powerNorm = (clamped - 10) / (maxPull - 10);
    const deltaV = 22 + powerNorm * 138;

    const ux = pullDx / rawPull;
    const uy = pullDy / rawPull;
    const resTier = sat.servicedCount >= 7 ? 2 : (sat.servicedCount >= 3 ? 1 : 0);
    const pickupBonus = resTier === 2 ? 12 : (resTier === 1 ? 6 : 0);

    return {
      x: sat.x,
      y: sat.y,
      vx: sat.vx + ux * deltaV,
      vy: sat.vy + uy * deltaV,
      colorIndex: sat.colorIndex,
      powerNorm,
      anchorImmunity: 1.0,
      ignoreSatId: sat.id,
      lastVisitedStarId: sat.lastVisitedStarId || null,
      interstellarCharge: sat.interstellarCharge || 0,
      pickupBonus
    };
  }

  // =========================================================================
  // Roguelite Upgrades (Cosmic Year End)
  // =========================================================================
  const UPGRADE_POOL = [
    {
      key: 'relay',
      title: '中継リンク',
      desc: '同じ色の衛星が近づくとレーザーで繋がり、その線で観測リングをなぎ払う',
      svg: `
        <svg viewBox="0 0 64 64" width="54" height="54">
          <circle cx="32" cy="32" r="11" fill="none" stroke="#38e2ff" stroke-width="2.2" stroke-opacity="0.6"/>
          <line x1="14" y1="44" x2="50" y2="20" stroke="#38e2ff" stroke-width="2.8"/>
          <polygon points="14,37 20,48 8,48" fill="#38e2ff"/>
          <polygon points="50,13 56,24 44,24" fill="#38e2ff"/>
        </svg>`
    },
    {
      key: 'shield',
      title: '位相シールド',
      desc: '全衛星に自動再チャージ式の位相バリアを付与し、衝突してもすり抜けて軌道を維持',
      svg: `
        <svg viewBox="0 0 64 64" width="54" height="54">
          <circle cx="32" cy="32" r="20" fill="none" stroke="#8cf6ff" stroke-width="2.4" stroke-dasharray="6 4"/>
          <circle cx="32" cy="32" r="13" fill="#8cf6ff" fill-opacity="0.16"/>
          <polygon points="32,21 40,38 24,38" fill="#38e2ff"/>
        </svg>`
    },
    {
      key: 'anchor',
      title: 'ラグランジュ・アンカー',
      desc: '好きな場所へドラッグ移動できる無重力中継エリアを宇宙空間に生成',
      svg: `
        <svg viewBox="0 0 64 64" width="54" height="54">
          <polygon points="32,12 49,22 49,42 32,52 15,42 15,22" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/>
          <circle cx="32" cy="32" r="6" fill="none" stroke="#ffbe3b" stroke-width="2.2"/>
          <circle cx="32" cy="32" r="2.2" fill="#ffbe3b"/>
        </svg>`
    },
    {
      key: 'wormhole',
      title: 'ワームホール',
      desc: '画面の端と端を空間接続し、飛び出した衛星を反対側から出現させる',
      svg: `
        <svg viewBox="0 0 64 64" width="54" height="54">
          <path d="M14,14 L14,50 M50,14 L50,50" stroke="#9d8cff" stroke-width="2.8" stroke-linecap="round" stroke-dasharray="4 4"/>
          <path d="M16,32 L28,32 M36,32 L48,32" stroke="#38e2ff" stroke-width="2.2" stroke-dasharray="2 3"/>
          <polygon points="31,32 23,27 23,37" fill="#38e2ff"/>
          <polygon points="51,32 43,27 43,37" fill="#38e2ff"/>
        </svg>`
    },
    {
      key: 'fleet',
      title: '軌道ドック増設',
      desc: '同時運用できる貴重な衛星枠を＋1機増やし、再建造速度とスラスター燃料も強化',
      svg: `
        <svg viewBox="0 0 64 64" width="54" height="54">
          <circle cx="20" cy="32" r="7" fill="#38e2ff"/>
          <circle cx="44" cy="32" r="7" fill="#ffbe3b"/>
          <circle cx="32" cy="18" r="7" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/>
          <path d="M20,46 L44,46" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
        </svg>`
    }
  ];

  function openUpgradeModal() {
    state.pausedForModal = true;
    state.drag = null;
    Audio.setBulletTime(false);
    Audio.playYearComplete();

    yearDotsEl.innerHTML = '';
    for (let i = 0; i < state.year; i++) {
      const dot = document.createElement('div');
      dot.className = 'year-dot';
      yearDotsEl.appendChild(dot);
    }

    const candidates = UPGRADE_POOL.filter((u) => {
      if (u.key === 'wormhole' && state.upgrades.wormhole >= 1) return false;
      if (u.key === 'fleet' && state.fleetMax >= 8) return false;
      return true;
    });

    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const choices = candidates.slice(0, 3);

    upgradeCardsEl.innerHTML = '';
    choices.forEach((choice) => {
      const btn = document.createElement('button');
      btn.className = 'upgrade-card';
      btn.innerHTML = `
        <div class="upgrade-emblem">${choice.svg}</div>
        <div class="upgrade-title">${choice.title}</div>
        <div class="upgrade-desc">${choice.desc}</div>
      `;
      btn.addEventListener('click', () => applyUpgrade(choice.key));
      upgradeCardsEl.appendChild(btn);
    });

    upgradeOverlay.classList.remove('hidden');
  }

  function applyUpgrade(key) {
    state.upgrades[key] = (state.upgrades[key] || 0) + 1;

    // Satellite fleet stays tightly capped unless 'fleet' (軌道ドック増設) is chosen!
    if (key === 'shield') {
      for (const sat of state.satellites) {
        sat.shieldCooldown = 0;
      }
    } else if (key === 'anchor') {
      spawnLagrangeAnchor();
    } else if (key === 'wormhole') {
      const b = getWorldBounds();
      emitPulse(camera.x, camera.y, 40, Math.max(b.halfW, b.halfH), theme.wormhole, 1.0, 3);
      for (const sat of state.satellites) sat.orbitTrackTimer = 0;
    } else if (key === 'fleet') {
      state.fleetMax = Math.min(8, state.fleetMax + 1);
      state.rebuildDuration = Math.max(5.2, state.rebuildDuration * 0.78);
      state.rebuildTimers = []; // Instantly finish any pending rebuilds!
      state.maxFuel = Math.min(8, state.maxFuel + 1);
      state.fuel = state.maxFuel;
    }

    // Gentle relief on active stations at the start of the new year
    for (const t of state.tasks) {
      t.demand = Math.max(0, t.demand - 0.25);
    }

    state.year += 1;
    state.pausedForModal = false;
    upgradeOverlay.classList.add('hidden');
    Audio.playTaskComplete(0, 0);
  }

  // =========================================================================
  // Game Over Modal (Pure Geometric Constellation Summary)
  // =========================================================================
  function triggerGameOver(reason, focusX = 0, focusY = 0) {
    if (state.gameOver) return;
    state.gameOver = true;
    state.gameOverReason = reason;
    state.drag = null;
    Audio.setBulletTime(false);
    Audio.playCollision(worldXToPan(focusX), true);
    camera.shake = 12;
    emitPulse(focusX, focusY, 12, 180, theme.danger, 1.1, 4);

    gameOverIconEl.innerHTML = `
      <svg viewBox="0 0 72 72" width="68" height="68">
        <circle cx="36" cy="36" r="22" fill="${theme.danger}" fill-opacity="0.22" stroke="${theme.danger}" stroke-width="3"/>
        <circle cx="36" cy="36" r="11" fill="none" stroke="${theme.danger}" stroke-width="2"/>
      </svg>`;

    let yearsHtml = '<div class="stat-row">';
    for (let i = 0; i < state.year; i++) {
      yearsHtml += '<span class="year-dot"></span>';
    }
    yearsHtml += '</div>';

    let shapesHtml = '<div class="stat-row">';
    const maxIcons = 48;
    let totalRendered = 0;
    for (let c = 0; c < 3; c++) {
      const count = state.completedTasks[c];
      const col = theme.colors[c];
      for (let k = 0; k < count && totalRendered < maxIcons; k++, totalRendered++) {
        if (c === 0) {
          shapesHtml += `<svg width="13" height="13" viewBox="0 0 16 16"><polygon points="8,2 14,13 2,13" fill="${col}"/></svg>`;
        } else if (c === 1) {
          shapesHtml += `<svg width="13" height="13" viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" fill="${col}"/></svg>`;
        } else {
          shapesHtml += `<svg width="13" height="13" viewBox="0 0 16 16"><polygon points="8,1 15,8 8,15 1,8" fill="${col}"/></svg>`;
        }
      }
    }
    shapesHtml += '</div>';

    gameOverStatsEl.innerHTML = yearsHtml + shapesHtml;
    setTimeout(() => {
      if (state.gameOver) {
        gameOverOverlay.classList.remove('hidden');
      }
    }, 680);
  }

  restartBtn.addEventListener('click', () => {
    Audio.init();
    resetGame();
  });

  closeHelpBtn.addEventListener('click', () => {
    helpOverlay.classList.add('hidden');
  });
  helpOverlay.addEventListener('click', (e) => {
    if (e.target === helpOverlay) helpOverlay.classList.add('hidden');
  });

  // =========================================================================
  // Simulation Step
  // =========================================================================
  function getPhysicsContext() {
    return {
      anchors: state.anchors,
      tasks: state.tasks,
      wormholeActive: state.upgrades.wormhole > 0,
      hasShieldUpgrade: state.upgrades.shield > 0,
      worldBounds: getWorldBounds()
    };
  }

  function updateSimulation(rawDt) {
    if (state.pausedForModal || state.gameOver) {
      updateVisualEffectsOnly(rawDt);
      return;
    }

    const inBulletTime = state.drag && state.drag.mode === 'thruster';
    const timeScale = inBulletTime ? 0.16 : 1.0;
    const dt = rawDt * timeScale;

    if (state.started) {
      state.simTime += dt;
      state.yearProgress += dt / YEAR_DURATION;

      updateCelestialProgression();

      if (state.yearProgress >= 1.0) {
        state.yearProgress -= 1.0;
        openUpgradeModal();
        return;
      }
    }

    // Smooth camera pan & zoom toward active fixed-star constellation
    const camLerp = Math.min(1, rawDt * 1.15);
    camera.x += (camera.targetX - camera.x) * camLerp;
    camera.y += (camera.targetY - camera.y) * camLerp;
    camera.span += (camera.targetSpan - camera.span) * camLerp;
    updateScale();

    if (camera.shake > 0) {
      camera.shake = Math.max(0, camera.shake - rawDt * 28);
    }

    // Recharge launch pad, thruster fuel & fleet rebuild slots
    if (state.launchCooldown > 0) {
      state.launchCooldown = Math.max(0, state.launchCooldown - rawDt);
    }
    if (state.fuel < state.maxFuel) {
      state.fuel = Math.min(state.maxFuel, state.fuel + state.fuelRegenRate * dt);
    }
    for (let i = state.rebuildTimers.length - 1; i >= 0; i--) {
      state.rebuildTimers[i] -= dt;
      if (state.rebuildTimers[i] <= 0) {
        state.rebuildTimers.splice(i, 1);
        Audio.playAimTick(0.75, worldXToPan(0));
        emitPulse(0, 0, 18, 42, theme.colors[state.selectedColor], 0.45, 1.5);
      }
    }

    // Decay pairwise close-flyby & pass-grace timers
    for (const [k, cd] of state.pairFlybyCooldowns.entries()) {
      if (cd - dt <= 0) state.pairFlybyCooldowns.delete(k);
      else state.pairFlybyCooldowns.set(k, cd - dt);
    }
    for (const [k, gr] of state.pairPassGrace.entries()) {
      if (gr - dt <= 0) state.pairPassGrace.delete(k);
      else state.pairPassGrace.set(k, gr - dt);
    }

    const subSteps = 2;
    const subDt = dt / subSteps;
    const physCtx = getPhysicsContext();

    for (let s = 0; s < subSteps; s++) {
      const tNow = state.simTime - dt + s * subDt;
      const bodiesNow = Physics.evaluateBodiesAtTime(state.bodyDefs, tNow);
      const bodiesNext = Physics.evaluateBodiesAtTime(state.bodyDefs, tNow + subDt);
      state.bodiesNow = bodiesNext;

      // 1. Step Player Satellites
      for (let i = state.satellites.length - 1; i >= 0; i--) {
        const sat = state.satellites[i];
        sat.age += subDt;
        if (sat.sensorWarmup > 0) sat.sensorWarmup -= subDt;
        if (sat.swingByCooldown > 0) sat.swingByCooldown -= subDt;
        if (sat.bassNoteTimer > 0) sat.bassNoteTimer -= subDt;
        if (sat.shieldCooldown > 0) sat.shieldCooldown = Math.max(0, sat.shieldCooldown - subDt);
        if (sat.interstellarCharge > 0) {
          sat.interstellarCharge = Math.max(0, sat.interstellarCharge - subDt);
        }

        const stepRes = Physics.stepVerlet(sat, subDt, bodiesNow, bodiesNext, physCtx);

        // Star impact -> clean loss of satellite (no bouncing!), slot enters Rebuild Cooldown!
        if (stepRes.hitBody) {
          Audio.playCollision(worldXToPan(sat.x), false);
          camera.shake = Math.max(camera.shake, 5.5);
          emitParticles(sat.x, sat.y, theme.colors[sat.colorIndex], 11, 0.9);
          emitPulse(sat.x, sat.y, 4, 36, theme.danger, 0.5, 2.0);
          if (state.drag && state.drag.mode === 'thruster' && state.drag.satId === sat.id) {
            state.drag = null;
            Audio.setBulletTime(false);
          }
          state.satellites.splice(i, 1);
          triggerSlotRebuild(1.0);
          continue;
        }

        if (stepRes.wrapped) {
          sat.trail.push({ x: sat.x, y: sat.y, breakSegment: true });
          Audio.playWormhole(worldXToPan(sat.x));
          emitPulse(sat.x, sat.y, 4, 24, theme.wormhole, 0.45, 1.5);
        }

        // Deep-space escape -> clean loss of satellite if launched beyond escape speed
        if (!physCtx.wormholeActive) {
          const bounds = physCtx.worldBounds;
          const maxEscape = Math.max(bounds.halfW, bounds.halfH) * 1.55 + 240;
          if (Math.hypot(sat.x - camera.targetX, sat.y - camera.targetY) > maxEscape) {
            if (state.drag && state.drag.mode === 'thruster' && state.drag.satId === sat.id) {
              state.drag = null;
              Audio.setBulletTime(false);
            }
            state.satellites.splice(i, 1);
            triggerSlotRebuild(1.0);
            continue;
          }
        }

        const speed = Math.hypot(sat.vx, sat.vy);

        // Interstellar Exclusive-Zone Transit & Star periapsis Swing-by chime
        for (const b of bodiesNext) {
          if (b.intro < 0.4) continue;
          const dx = sat.x - b.x;
          const dy = sat.y - b.y;
          const dist = Math.hypot(dx, dy);

          // Multi-Star Incentive: Entering a different Fixed Star's Exclusive Gravity Zone!
          if (b.intro >= 0.45 && dist <= b.exclusiveRadius) {
            if (sat.lastVisitedStarId && sat.lastVisitedStarId !== b.id) {
              sat.interstellarCharge = 8.5;
              sat.multiStarCount = (sat.multiStarCount || 0) + 1;
              state.interstellarCount++;
              state.fuel = Math.min(state.maxFuel, state.fuel + 0.35);
              Audio.playInterstellarTransit(worldXToPan(sat.x));
              emitPulse(sat.x, sat.y, 6, 48, theme.harmony, 0.65, 2.2);
              emitParticles(sat.x, sat.y, theme.harmony, 8, 0.8);
            }
            sat.lastVisitedStarId = b.id;
          }

          const radDot = dx * sat.vx + dy * sat.vy;
          const prevDot = sat.prevRadDots.get(b.id);
          if (prevDot !== undefined && prevDot < 0 && radDot >= 0 && sat.age > 0.35) {
            if (dist < b.radius * 3.3 && speed > 142 && sat.swingByCooldown <= 0) {
              const closeness = 1 - Math.min(1, Math.max(0, dist - b.radius) / (b.radius * 2.3));
              const intensity = Math.min(1, 0.45 + closeness * 0.55);
              Audio.playSwingByArpeggio(intensity, worldXToPan(sat.x));
              emitPulse(sat.x, sat.y, 6, 36 + closeness * 24, theme.colors[sat.colorIndex], 0.55, 1.8);
              emitParticles(sat.x, sat.y, theme.colors[sat.colorIndex], 6, 0.7);
              state.fuel = Math.min(state.maxFuel, state.fuel + 0.3);
              state.swingByCount++;
              sat.swingByCooldown = 0.95;
            } else if (radDot >= 0 && speed < 148 && sat.bassNoteTimer <= 0) {
              Audio.playSlowOrbitBass(speed / 155, worldXToPan(sat.x));
              sat.bassNoteTimer = 4.5;
            }
          }
          sat.prevRadDots.set(b.id, radDot);
        }

        if (sat.bassNoteTimer <= 0 && sat.age > 2.0 && speed < 155) {
          Audio.playSlowOrbitBass(speed / 160, worldXToPan(sat.x));
          sat.bassNoteTimer = 5.5 + Math.random() * 2.5;
        }
      }

      // 2. Intertwining Flybys ("すれすれ交差") & Clean Satellite Collisions (Zero Debris!)
      handleTrafficInteractions();
    }

    // Record ribbon trails & keep crisp forward orbit tracks refreshed
    for (const sat of state.satellites) {
      sat.trail.push({ x: sat.x, y: sat.y, breakSegment: false });
      if (sat.trail.length > MAX_TRAIL_LEN) sat.trail.shift();

      sat.orbitTrackTimer = (sat.orbitTrackTimer || 0) - rawDt;
      if (!sat.orbitPath || sat.orbitTrackTimer <= 0) {
        refreshSatelliteOrbitPath(sat);
      }
    }

    updateRelayLinksAndStations(dt);

    // Periodically open new Persistent Observation Stations
    if (state.started) {
      state.nextStationTimer -= dt;
      const maxStations = Math.min(9, 2 + state.year * 2);
      if (state.nextStationTimer <= 0 && state.tasks.length < maxStations) {
        spawnPersistentStation();
        state.nextStationTimer = 20.0 + state.tasks.length * 2.2;
      }
    }

    // Imminent collision warning lookahead
    state.dangerCheckTimer -= rawDt;
    if (state.dangerCheckTimer <= 0) {
      state.dangerCheckTimer = 0.14;
      const warn = Physics.detectImminentCollisions(
        state.satellites,
        state.simTime,
        state.bodyDefs,
        physCtx
      );
      state.dangerSatIds = warn.dangerSatIds;
      state.dangerPairs = warn.dangerPairs;
    }

    updateVisualEffectsOnly(rawDt);
  }

  function updateCelestialProgression() {
    const t = state.simTime;
    const star2 = state.bodyDefs[1];
    const star3 = state.bodyDefs[2];
    const star4 = state.bodyDefs[3];

    // Mid-Year 1 (~24s): Companion Fixed Star Sol B ignites at its randomized position!
    if (t >= 24 && !star2.active) {
      star2.active = true;
      star2.spawnTime = t;
      recomputeCameraTargetFromActiveStars();
      for (const sat of state.satellites) sat.orbitTrackTimer = 0;
      const outAng = Math.atan2(star2.baseY, star2.baseX) + (Math.random() - 0.5) * 1.4;
      const colChoice = state.tasks.length > 0 ? state.tasks[0].colorIndex : 0;
      setTimeout(() => {
        if (state && !state.gameOver && star2.active) {
          spawnPersistentStation(colChoice, 118, outAng, { x: star2.baseX, y: star2.baseY });
        }
      }, 2800);
    }

    // Early Year 2 (~58s): Unlock 3rd Satellite Color/Shape (Coral Diamond ◆) + 1 Fleet Slot (`3 -> 4`)!
    if (t >= 58 && state.unlockedColors < 3) {
      state.unlockedColors = 3;
      state.fleetMax = Math.min(8, state.fleetMax + 1);
      emitPulse(0, 0, 22, 115, theme.colors[2], 0.85, 2.5);
    }

    // Mid-Year 2 (~76s): 3rd Fixed Star Sol C ignites -> Random 3-Star Constellation!
    if (t >= 76 && !star3.active) {
      star3.active = true;
      star3.spawnTime = t;
      recomputeCameraTargetFromActiveStars();
      for (const sat of state.satellites) sat.orbitTrackTimer = 0;
      const outAng = Math.atan2(star3.baseY - camera.targetY, star3.baseX - camera.targetX) + (Math.random() - 0.5) * 1.4;
      setTimeout(() => {
        if (state && !state.gameOver && star3.active) {
          spawnPersistentStation(2, 116, outAng, { x: star3.baseX, y: star3.baseY });
        }
      }, 3000);
    }

    // Late Year 3 (~134s): 4th Fixed Star Sol D ignites + 1 Fleet Slot (`4 -> 5`)!
    if (t >= 134 && !star4.active) {
      star4.active = true;
      star4.spawnTime = t;
      state.fleetMax = Math.min(8, state.fleetMax + 1);
      recomputeCameraTargetFromActiveStars();
      for (const sat of state.satellites) sat.orbitTrackTimer = 0;
      const outAng = Math.atan2(star4.baseY - camera.targetY, star4.baseX - camera.targetX) + (Math.random() - 0.5) * 1.4;
      setTimeout(() => {
        if (state && !state.gameOver && star4.active) {
          spawnPersistentStation(1, 118, outAng, { x: star4.baseX, y: star4.baseY });
        }
      }, 3200);
    }
  }

  /**
   * Handles both:
   * 1. Clean Satellite-to-Satellite Collisions (no debris; both satellites enter Fleet Rebuild Cooldown,
   *    unless deflected by an upgraded Phase Shield!)
   * 2. Close Grazing Flybys ("すれすれ交差") when two intertwining orbits skim right past each other
   *    at closest approach (10.8 .. 38 units) -> Pentatonic duet chime, fuel boost, & nearby ring relief!
   */
  function handleTrafficInteractions() {
    const deadSatIds = new Set();
    const hasShieldUpgrade = state.upgrades.shield > 0;

    for (let i = 0; i < state.satellites.length; i++) {
      const a = state.satellites[i];
      if (!a || a.age < 0.38 || deadSatIds.has(a.id)) continue;

      for (let j = i + 1; j < state.satellites.length; j++) {
        const b = state.satellites[j];
        if (!b || b.age < 0.38 || deadSatIds.has(b.id)) continue;

        const pKey = pairKey(a.id, b.id);
        if (state.pairPassGrace.has(pKey)) continue;

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dSq = dx * dx + dy * dy;

        // Direct Satellite Collision!
        if (dSq < 10.6 * 10.6) {
          const mx = (a.x + b.x) * 0.5;
          const my = (a.y + b.y) * 0.5;

          // Phase Shield deflection if upgraded and at least one satellite has a charged shield
          if (hasShieldUpgrade && (a.shieldCooldown <= 0 || b.shieldCooldown <= 0)) {
            const cd = Math.max(7.5, 15.0 - (state.upgrades.shield - 1) * 3.5);
            if (a.shieldCooldown <= 0) a.shieldCooldown = cd;
            else b.shieldCooldown = cd;
            state.pairPassGrace.set(pKey, 0.65);

            Audio.playShieldPass(worldXToPan(mx));
            emitPulse(mx, my, 6, 36, theme.shield, 0.5, 2.2);
            emitParticles(mx, my, theme.shield, 8, 0.7);
            continue;
          }

          // Clean loss of both satellites -> Fleet Slots enter Rebuild Cooldown (no debris!)
          Audio.playCollision(worldXToPan(mx), false);
          camera.shake = Math.max(camera.shake, 5.5);
          emitParticles(a.x, a.y, theme.colors[a.colorIndex], 9, 0.9);
          emitParticles(b.x, b.y, theme.colors[b.colorIndex], 9, 0.9);
          emitPulse(mx, my, 5, 42, theme.danger, 0.55, 2.2);

          if (
            state.drag &&
            state.drag.mode === 'thruster' &&
            (state.drag.satId === a.id || state.drag.satId === b.id)
          ) {
            state.drag = null;
            Audio.setBulletTime(false);
          }

          deadSatIds.add(a.id);
          deadSatIds.add(b.id);
          break;
        }

        // Close Grazing Flyby ("すれすれ交差") detection at relative periapsis!
        const relVx = a.vx - b.vx;
        const relVy = a.vy - b.vy;
        const radDot = dx * relVx + dy * relVy;
        const prevDot = state.pairPrevRadDot.get(pKey);
        state.pairPrevRadDot.set(pKey, radDot);

        if (
          prevDot !== undefined &&
          prevDot < 0 &&
          radDot >= 0 &&
          dSq >= 10.6 * 10.6 &&
          dSq <= 38 * 38 &&
          !state.pairFlybyCooldowns.has(pKey)
        ) {
          state.pairFlybyCooldowns.set(pKey, 2.1);
          state.nearMissCount++;

          const mx = (a.x + b.x) * 0.5;
          const my = (a.y + b.y) * 0.5;

          Audio.playNearMissHarmony(worldXToPan(mx));
          state.fuel = Math.min(state.maxFuel, state.fuel + 0.3);

          state.flybySparks.push({
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            mx,
            my,
            colA: theme.colors[a.colorIndex],
            colB: theme.colors[b.colorIndex],
            life: 0,
            maxLife: 0.6
          });
          emitPulse(mx, my, 4, 34, theme.harmony, 0.5, 1.7);

          // Harmonic Resonance Relief: Grazing intersections soothe nearby Observation Stations!
          for (const task of state.tasks) {
            if (Math.hypot(task.x - mx, task.y - my) <= 115 && task.demand > 0.02) {
              task.demand = Math.max(0, task.demand - 0.22);
              task.serviceFlash = Math.max(task.serviceFlash, 0.7);
              emitPulse(task.x, task.y, task.radius * 0.85, task.radius * 1.4, theme.harmony, 0.4, 1.5);
            }
          }
        }
      }
    }

    if (deadSatIds.size > 0) {
      state.satellites = state.satellites.filter((s) => !deadSatIds.has(s.id));
      for (let k = 0; k < deadSatIds.size; k++) {
        triggerSlotRebuild(1.0);
      }
    }
  }

  function updateRelayLinksAndStations(dt) {
    state.relayLinks = [];
    if (state.upgrades.relay > 0) {
      const maxLinkDist = 205 + (state.upgrades.relay - 1) * 80;
      const maxLinkSq = maxLinkDist * maxLinkDist;
      for (let i = 0; i < state.satellites.length; i++) {
        for (let j = i + 1; j < state.satellites.length; j++) {
          const a = state.satellites[i];
          const b = state.satellites[j];
          if (a.colorIndex !== b.colorIndex) continue;
          const dSq = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
          if (dSq <= maxLinkSq) {
            state.relayLinks.push({
              key: `link_${a.id}_${b.id}`,
              satA: a,
              satB: b,
              x1: a.x,
              y1: a.y,
              x2: b.x,
              y2: b.y,
              colorIndex: a.colorIndex,
              strength: 1 - Math.sqrt(dSq) / maxLinkDist
            });
          }
        }
      }
    }

    const fillRate = computeStationFillRate();
    let anyCriticalDanger = false;

    for (let i = 0; i < state.tasks.length; i++) {
      const task = state.tasks[i];
      task.spawnAnim = Math.min(1, task.spawnAnim + dt * 3.0);
      if (task.serviceFlash > 0) {
        task.serviceFlash = Math.max(0, task.serviceFlash - dt * 2.4);
      }
      if (task.calmTimer > 0) {
        task.calmTimer = Math.max(0, task.calmTimer - dt);
      }

      for (const [k, cd] of task.hitCooldowns.entries()) {
        if (cd - dt <= 0) task.hitCooldowns.delete(k);
        else task.hitCooldowns.set(k, cd - dt);
      }

      let servicingSat = null;
      let triggered = false;

      for (const sat of state.satellites) {
        if (sat.colorIndex !== task.colorIndex) continue;
        if ((sat.sensorWarmup || 0) > 0) continue;
        if (task.hitCooldowns.has(sat.id)) continue;

        const resonanceTier = sat.servicedCount >= 7 ? 2 : (sat.servicedCount >= 3 ? 1 : 0);
        const pickupBonus = resonanceTier === 2 ? 12 : (resonanceTier === 1 ? 6 : 0);
        const chargeBonus = (sat.interstellarCharge || 0) > 0 ? 28 : 0;
        const dist = Math.hypot(sat.x - task.x, sat.y - task.y);

        if (dist <= task.radius + 9 + pickupBonus + chargeBonus) {
          task.hitCooldowns.set(sat.id, 0.9);
          servicingSat = sat;
          triggered = true;
          break;
        }
      }

      if (!triggered && state.relayLinks.length > 0) {
        for (const link of state.relayLinks) {
          if (link.colorIndex !== task.colorIndex) continue;
          if (task.hitCooldowns.has(link.key)) continue;
          const dSq = Physics.distToSegmentSq(task.x, task.y, link.x1, link.y1, link.x2, link.y2);
          if (dSq <= (task.radius + 7) ** 2) {
            task.hitCooldowns.set(link.key, 0.95);
            servicingSat = link.satA;
            triggered = true;
            break;
          }
        }
      }

      if (triggered) {
        const prevDemand = task.demand;
        const wasStarCharged = !!(servicingSat && (servicingSat.interstellarCharge || 0) > 0);
        task.demand = 0;
        task.serviceFlash = 1.0;

        // Multi-Star Incentive: Star-Charged satellites imbue cleared stations with a 9.5s Calm Halo (0.42x refill)!
        if (wasStarCharged) {
          task.calmTimer = 9.5;
          emitPulse(task.x, task.y, task.radius * 0.9, task.radius * 2.35, theme.harmony, 0.65, 2.0);
        }

        if (prevDemand >= 0.1) {
          state.completedTasks[task.colorIndex]++;
          if (servicingSat) {
            servicingSat.servicedCount = (servicingSat.servicedCount || 0) + 1;
            const resTier = servicingSat.servicedCount >= 7 ? 2 : (servicingSat.servicedCount >= 3 ? 1 : 0);
            state.fuel = Math.min(state.maxFuel, state.fuel + 0.24 + resTier * 0.12 + (wasStarCharged ? 0.14 : 0));

            if (servicingSat.servicedCount === 3 || servicingSat.servicedCount === 7) {
              emitPulse(servicingSat.x, servicingSat.y, 6, 44, theme.colors[servicingSat.colorIndex], 0.7, 2.4);
            }
          }
          Audio.playTaskComplete(task.colorIndex, worldXToPan(task.x));
          emitParticles(task.x, task.y, theme.colors[task.colorIndex], 10, 0.9);
          emitPulse(task.x, task.y, task.radius * 0.7, task.radius * 2.1, theme.colors[task.colorIndex], 0.55, 2.2);
        } else {
          Audio.playObservationPass(0.5, task.colorIndex, worldXToPan(task.x));
          emitPulse(task.x, task.y, task.radius * 0.85, task.radius * 1.45, theme.colors[task.colorIndex], 0.35, 1.4);
        }
      }

      if (state.started) {
        const calmMult = task.calmTimer > 0 ? 0.42 : 1.0;
        task.demand += fillRate * calmMult * dt;
        if (task.demand >= 0.75) {
          anyCriticalDanger = true;
        }
        if (task.demand >= 1.0) {
          triggerGameOver('timeout', task.x, task.y);
          return;
        }
      }
    }

    if (anyCriticalDanger) {
      state.dangerAudioTimer -= dt;
      if (state.dangerAudioTimer <= 0) {
        state.dangerAudioTimer = 1.05;
        Audio.playDangerPulse(0);
      }
    } else {
      state.dangerAudioTimer = 0;
    }
  }

  function updateVisualEffectsOnly(rawDt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life += rawDt;
      if (p.life >= p.maxLife) {
        state.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * rawDt;
      p.y += p.vy * rawDt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }

    for (let i = state.pulses.length - 1; i >= 0; i--) {
      const pl = state.pulses[i];
      pl.life += rawDt;
      if (pl.life >= pl.maxLife) {
        state.pulses.splice(i, 1);
      }
    }

    for (let i = state.flybySparks.length - 1; i >= 0; i--) {
      const sp = state.flybySparks[i];
      sp.life += rawDt;
      if (sp.life >= sp.maxLife) {
        state.flybySparks.splice(i, 1);
      }
    }

    for (const anc of state.anchors) {
      anc.pulse += rawDt * 1.8;
    }
  }

  // =========================================================================
  // Voluntary Recall (Double-Tap / Right-Click)
  // Cleanly recalls 1 satellite with a shorter redeploy cooldown (62%)
  // =========================================================================
  function scuttleSatellite(satId) {
    const idx = state.satellites.findIndex((s) => s.id === satId);
    if (idx === -1) return false;
    const sat = state.satellites[idx];
    Audio.playScuttle(worldXToPan(sat.x));
    emitParticles(sat.x, sat.y, theme.colors[sat.colorIndex], 10, 0.7);
    emitPulse(sat.x, sat.y, 4, 28, theme.colors[sat.colorIndex], 0.4, 1.5);
    state.satellites.splice(idx, 1);

    triggerSlotRebuild(0.62);

    if (state.drag && state.drag.satId === satId) {
      state.drag = null;
      Audio.setBulletTime(false);
    }
    return true;
  }

  // =========================================================================
  // Pointer & Keyboard Input
  // =========================================================================
  function findHitSatellite(wx, wy, screenRadiusPx = 28) {
    const hitWorldR = screenRadiusPx / camera.scale;
    let best = null;
    let bestDist = hitWorldR;
    for (const sat of state.satellites) {
      const d = Math.hypot(sat.x - wx, sat.y - wy);
      if (d < bestDist) {
        bestDist = d;
        best = sat;
      }
    }
    return best;
  }

  function findHitAnchor(wx, wy) {
    for (const anc of state.anchors) {
      if (Math.hypot(anc.x - wx, anc.y - wy) < Math.max(anc.radius * 0.65, 24 / camera.scale)) {
        return anc;
      }
    }
    return null;
  }

  canvas.addEventListener('contextmenu', (e) => {
    if (Puzzle && Puzzle.isActive()) return;
    e.preventDefault();
    if (!state || state.pausedForModal || state.gameOver) return;
    const w = screenToWorld(e.clientX, e.clientY);
    const sat = findHitSatellite(w.x, w.y, 32);
    if (sat) {
      scuttleSatellite(sat.id);
    }
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (Puzzle && Puzzle.isActive()) return;
    if (e.button === 2) return;
    Audio.init();

    if (!state || state.pausedForModal || state.gameOver) return;

    const sx = e.clientX;
    const sy = e.clientY;

    for (const btn of hudButtons) {
      if (Math.hypot(sx - btn.x, sy - btn.y) <= btn.r + 6) {
        btn.onClick();
        return;
      }
    }

    for (const cBtn of colorButtons) {
      if (Math.hypot(sx - cBtn.x, sy - cBtn.y) <= cBtn.r + 8) {
        state.selectedColor = cBtn.colorIndex;
        Audio.playAimTick(0.3 + cBtn.colorIndex * 0.25, 0);
        return;
      }
    }

    const w = screenToWorld(sx, sy);
    const nowMs = performance.now();

    // 1. Existing Satellite -> Double-tap to recall OR drag to fine-tune orbit / phase!
    const hitSat = findHitSatellite(w.x, w.y, 28);
    if (hitSat) {
      if (state.lastTap.satId === hitSat.id && nowMs - state.lastTap.time < 340) {
        scuttleSatellite(hitSat.id);
        state.lastTap.satId = null;
        return;
      }
      state.lastTap = { time: nowMs, satId: hitSat.id, x: sx, y: sy };

      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      state.drag = {
        pointerId: e.pointerId,
        mode: 'thruster',
        satId: hitSat.id,
        startScreenX: sx,
        startScreenY: sy,
        currWorldX: w.x,
        currWorldY: w.y,
        moved: false
      };
      Audio.setBulletTime(true);
      return;
    }

    // 2. Lagrange Anchor -> Drag to reposition zero-G zone
    const hitAnchor = findHitAnchor(w.x, w.y);
    if (hitAnchor) {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      state.drag = {
        pointerId: e.pointerId,
        mode: 'anchor',
        anchorId: hitAnchor.id,
        offsetX: hitAnchor.x - w.x,
        offsetY: hitAnchor.y - w.y
      };
      return;
    }

    // 3. Orbit Placement Slingshot!
    //    Start near any Fixed Star -> Star-Ring Launch; Start in open space -> Free-Space Orbit Placement!
    const { star: nearStar, dist: distStar } = findNearestActiveStar(w.x, w.y);
    const starSnapR = Math.max(nearStar.radius + 32, 42 / camera.scale);
    let anchorStarId = null;
    let launchX = w.x;
    let launchY = w.y;

    if (distStar <= starSnapR) {
      anchorStarId = nearStar.id;
    } else {
      // Gently nudge outside any Observation Station ring so launches don't instantly trigger on spawn
      for (const task of state.tasks) {
        const dx = launchX - task.x;
        const dy = launchY - task.y;
        const d = Math.hypot(dx, dy);
        const minClear = task.radius + 15;
        if (d < minClear) {
          const ang = d > 0.1 ? Math.atan2(dy, dx) : -Math.PI * 0.5;
          launchX = task.x + Math.cos(ang) * minClear;
          launchY = task.y + Math.sin(ang) * minClear;
        }
      }
    }

    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    state.drag = {
      pointerId: e.pointerId,
      mode: 'launch',
      anchorStarId,
      launchX,
      launchY,
      startScreenX: sx,
      startScreenY: sy,
      startWorldX: w.x,
      startWorldY: w.y,
      currWorldX: w.x,
      currWorldY: w.y,
      moved: false
    };
  });

  canvas.addEventListener('pointermove', (e) => {
    if (Puzzle && Puzzle.isActive()) return;
    if (!state || !state.drag || state.drag.pointerId !== e.pointerId) return;
    const w = screenToWorld(e.clientX, e.clientY);

    if (state.drag.mode === 'anchor') {
      const anc = state.anchors.find((a) => a.id === state.drag.anchorId);
      if (anc) {
        const b = getWorldBounds();
        anc.x = Math.max(b.cx - b.halfW * 0.88, Math.min(b.cx + b.halfW * 0.88, w.x + state.drag.offsetX));
        anc.y = Math.max(b.cy - b.halfH * 0.84, Math.min(b.cy + b.halfH * 0.84, w.y + state.drag.offsetY));
        for (const sat of state.satellites) sat.orbitTrackTimer = Math.min(sat.orbitTrackTimer || 0, 0.08);
      }
      return;
    }

    state.drag.currWorldX = w.x;
    state.drag.currWorldY = w.y;
    const screenMove = Math.hypot(e.clientX - state.drag.startScreenX, e.clientY - state.drag.startScreenY);
    if (screenMove > 9) {
      state.drag.moved = true;
    }

    if (state.drag.mode === 'launch' && state.drag.moved && getAvailableFleetSlots() > 0) {
      const init = computeLaunchInitialState(state.drag);
      if (init) {
        Audio.playAimTick(init.powerNorm, worldXToPan(init.x));
      }
    }
  });

  function endPointerDrag(e) {
    if (Puzzle && Puzzle.isActive()) return;
    if (!state || !state.drag || state.drag.pointerId !== e.pointerId) return;
    const drag = state.drag;
    state.drag = null;
    Audio.setBulletTime(false);

    if (drag.mode === 'launch') {
      if (!drag.moved) {
        // Quick tap cycles satellite color/shape!
        state.selectedColor = (state.selectedColor + 1) % state.unlockedColors;
        Audio.playAimTick(0.4 + state.selectedColor * 0.2, 0);
        return;
      }

      if (state.launchCooldown > 0 || getAvailableFleetSlots() <= 0) return;

      const init = computeLaunchInitialState(drag);
      if (init) {
        state.started = true;
        state.launchCooldown = state.launchCooldownMax;

        let initialStarId = null;
        for (const b of state.bodiesNow) {
          if (b.intro >= 0.4 && Math.hypot(init.x - b.x, init.y - b.y) <= b.exclusiveRadius) {
            initialStarId = b.id;
            break;
          }
        }

        const newSat = {
          id: state.nextEntityId++,
          x: init.x,
          y: init.y,
          vx: init.vx,
          vy: init.vy,
          colorIndex: init.colorIndex,
          servicedCount: 0,
          multiStarCount: 0,
          lastVisitedStarId: initialStarId,
          interstellarCharge: 0,
          trail: [{ x: init.x, y: init.y, breakSegment: false }],
          orbitPath: null,
          orbitTrackTimer: 0,
          sensorWarmup: 0.28,
          swingByCooldown: 0.4,
          bassNoteTimer: 1.8,
          shieldCooldown: 0,
          age: 0,
          anchored: false,
          anchorImmunity: 0,
          prevRadDots: new Map()
        };
        refreshSatelliteOrbitPath(newSat);
        state.satellites.push(newSat);
        Audio.playLaunch(init.powerNorm, init.colorIndex, worldXToPan(init.x));
        emitPulse(init.x, init.y, 5, 28, theme.colors[init.colorIndex], 0.45, 1.8);
      }
    } else if (drag.mode === 'thruster') {
      const sat = state.satellites.find((s) => s.id === drag.satId);
      if (sat && drag.moved && state.fuel >= 0.99) {
        const preview = computeThrusterPreviewState(sat, drag);
        if (preview) {
          sat.vx = preview.vx;
          sat.vy = preview.vy;
          sat.anchorImmunity = 1.0;
          refreshSatelliteOrbitPath(sat);
          state.fuel = Math.max(0, state.fuel - 1.0);
          Audio.playThruster(worldXToPan(sat.x));
          emitParticles(sat.x, sat.y, theme.colors[sat.colorIndex], 8, 0.65);
          emitPulse(sat.x, sat.y, 4, 24, theme.colors[sat.colorIndex], 0.35, 1.5);
        }
      }
    }
  }

  canvas.addEventListener('pointerup', endPointerDrag);
  canvas.addEventListener('pointercancel', endPointerDrag);

  window.addEventListener('keydown', (e) => {
    if (Puzzle && Puzzle.isActive()) return;
    if (!state || state.pausedForModal) return;
    if (e.key === '1') state.selectedColor = 0;
    else if (e.key === '2' && state.unlockedColors >= 2) state.selectedColor = 1;
    else if (e.key === '3' && state.unlockedColors >= 3) state.selectedColor = 2;
    else if (e.code === 'Space') {
      e.preventDefault();
      state.selectedColor = (state.selectedColor + 1) % state.unlockedColors;
      Audio.playAimTick(0.4, 0);
    }
  });

  // =========================================================================
  // Pure Minimalist Geometric Renderer (Zero Words / Zero Digits on Canvas!)
  // =========================================================================
  function drawSatelliteShape(x, y, angle, colorIndex, radius) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = theme.colors[colorIndex];

    if (colorIndex === 0) {
      ctx.beginPath();
      ctx.moveTo(radius * 1.3, 0);
      ctx.lineTo(-radius * 0.95, radius * 0.92);
      ctx.lineTo(-radius * 0.55, 0);
      ctx.lineTo(-radius * 0.95, -radius * 0.92);
      ctx.closePath();
      ctx.fill();
    } else if (colorIndex === 1) {
      const s = radius * 0.88;
      ctx.fillRect(-s, -s, s * 2, s * 2);
    } else {
      ctx.beginPath();
      ctx.moveTo(radius * 1.28, 0);
      ctx.lineTo(0, radius * 0.92);
      ctx.lineTo(-radius * 1.28, 0);
      ctx.lineTo(0, -radius * 0.92);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function computeActiveDragPreview() {
    state.previewServicedTaskIds = new Set();
    if (!state.drag) return null;
    const physCtx = getPhysicsContext();

    if (state.drag.mode === 'launch') {
      const init = computeLaunchInitialState(state.drag);
      if (!init) return null;
      const hasSlot = getAvailableFleetSlots() > 0;
      let pred = null;
      if (hasSlot) {
        pred = Physics.predictWithTraffic(
          init,
          state.satellites,
          state.simTime,
          state.bodyDefs,
          physCtx,
          540,
          1 / 52
        );
        if (pred.servicedTaskIds) {
          state.previewServicedTaskIds = pred.servicedTaskIds;
        }
      }
      return { mode: 'launch', init, hasSlot, pred };
    }

    if (state.drag.mode === 'thruster') {
      const sat = state.satellites.find((s) => s.id === state.drag.satId);
      if (!sat) return null;
      const hasFuel = state.fuel >= 0.99;
      let preview = null;
      let pred = null;
      if (hasFuel) {
        preview = computeThrusterPreviewState(sat, state.drag);
        if (preview) {
          pred = Physics.predictWithTraffic(
            preview,
            state.satellites,
            state.simTime,
            state.bodyDefs,
            physCtx,
            520,
            1 / 52
          );
          if (pred.servicedTaskIds) {
            state.previewServicedTaskIds = pred.servicedTaskIds;
          }
        }
      }
      return { mode: 'thruster', sat, hasFuel, preview, pred };
    }

    return null;
  }

  function render() {
    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, viewW, viewH);

    drawSubtleGrid();

    ctx.save();
    const shakeX = camera.shake > 0 ? (Math.random() - 0.5) * camera.shake : 0;
    const shakeY = camera.shake > 0 ? (Math.random() - 0.5) * camera.shake : 0;
    ctx.translate(viewW * 0.5 + shakeX, viewH * 0.5 + shakeY);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.x, -camera.y);

    if (state.upgrades.wormhole > 0) {
      drawWormholeFrame();
    }

    const activeDragPreview = computeActiveDragPreview();

    drawFixedStarConstellationLines();
    drawLagrangeAnchors();
    drawExistingOrbitPaths();
    drawCelestialBodies();
    drawObservationStations();
    drawRelayLinks();
    drawFlybySparks();
    drawSatellites();
    drawCollisionWarnings();
    drawDragAndTrajectoryPreview(activeDragPreview);

    if (!state.started && !state.drag) {
      drawFirstLaunchGestureHint();
    }

    drawPulsesAndParticles();

    ctx.restore();

    drawMinimalHUD();

    ctx.restore();
  }

  function drawSubtleGrid() {
    const stepWorld = 80;
    const stepPx = stepWorld * camera.scale;
    if (stepPx < 18) return;

    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    const offX = ((viewW * 0.5 - camera.x * camera.scale) % stepPx + stepPx) % stepPx;
    const offY = ((viewH * 0.5 - camera.y * camera.scale) % stepPx + stepPx) % stepPx;

    ctx.beginPath();
    for (let x = offX; x < viewW; x += stepPx) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, viewH);
    }
    for (let y = offY; y < viewH; y += stepPx) {
      ctx.moveTo(0, y);
      ctx.lineTo(viewW, y);
    }
    ctx.stroke();
  }

  function drawWormholeFrame() {
    const b = getWorldBounds();
    const pad = 6 / camera.scale;
    ctx.save();
    ctx.strokeStyle = theme.wormhole;
    ctx.lineWidth = 3 / camera.scale;
    ctx.setLineDash([10 / camera.scale, 8 / camera.scale]);
    ctx.lineDashOffset = -performance.now() * 0.02 / camera.scale;
    ctx.strokeRect(
      b.cx - b.halfW + pad,
      b.cy - b.halfH + pad,
      (b.halfW - pad) * 2,
      (b.halfH - pad) * 2
    );
    ctx.restore();
  }

  function drawFixedStarConstellationLines() {
    const fixed = state.bodiesNow.filter((b) => b.intro > 0.1);
    if (fixed.length < 2) return;

    ctx.save();
    ctx.strokeStyle = theme.orbitGuide;
    ctx.lineWidth = 1 / camera.scale;
    ctx.setLineDash([3 / camera.scale, 7 / camera.scale]);

    for (let i = 0; i < fixed.length; i++) {
      for (let j = i + 1; j < fixed.length; j++) {
        const a = fixed[i];
        const b = fixed[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        // Connect neighboring stars cleanly so random constellations read like star charts
        if (d > 620) continue;

        ctx.globalAlpha = Math.min(a.intro, b.intro) * 0.65;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        // L1 saddle midpoint dot (Figure-8 crossover sweet spot!)
        const mx = (a.x + b.x) * 0.5;
        const my = (a.y + b.y) * 0.5;
        ctx.fillStyle = theme.fgFaint;
        ctx.beginPath();
        ctx.arc(mx, my, 2.5 / camera.scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * Draws each active satellite's crisp forward orbital path (`sat.orbitPath`)
   * so the player can always read the full geometry of existing orbits and weave new ones!
   */
  function drawExistingOrbitPaths() {
    if (state.satellites.length === 0) return;
    const isAiming = !!state.drag;
    const editingSatId = state.drag && state.drag.mode === 'thruster' ? state.drag.satId : null;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const sat of state.satellites) {
      const pts = sat.orbitPath;
      if (!pts || pts.length < 2) continue;

      const isBeingEdited = sat.id === editingSatId;
      ctx.strokeStyle = theme.colors[sat.colorIndex];
      ctx.globalAlpha = isBeingEdited ? 0.10 : (isAiming ? 0.37 : 0.21);
      ctx.lineWidth = (isAiming && !isBeingEdited ? 1.55 : 1.25) / camera.scale;

      if (isBeingEdited) {
        ctx.setLineDash([4 / camera.scale, 5 / camera.scale]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      let startedSeg = false;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.breakSegment || !startedSeg) {
          ctx.moveTo(p.x, p.y);
          startedSeg = true;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawLagrangeAnchors() {
    for (const anc of state.anchors) {
      ctx.save();
      ctx.translate(anc.x, anc.y);

      const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, anc.radius);
      grad.addColorStop(0, themeName === 'navy' ? 'rgba(255, 190, 59, 0.14)' : 'rgba(224, 134, 0, 0.12)');
      grad.addColorStop(1, 'rgba(255, 190, 59, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, anc.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(anc.pulse * 0.25);
      ctx.strokeStyle = theme.colors[1];
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 1.6 / camera.scale;
      ctx.setLineDash([6 / camera.scale, 5 / camera.scale]);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k;
        const hx = Math.cos(a) * anc.radius;
        const hy = Math.sin(a) * anc.radius;
        if (k === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawCelestialBodies() {
    const nowSec = performance.now() * 0.001;

    for (const b of state.bodiesNow) {
      if (b.intro <= 0.01) continue;

      let fill = theme.bodyHome;
      if (b.kind === 'star2') fill = theme.bodyStar2;
      else if (b.kind === 'star3') fill = theme.bodyStar3;
      else if (b.kind === 'star4') fill = theme.bodyStar4;

      const gRad = b.gravityVisualRadius;
      if (gRad > 5) {
        let glowPalette = theme.gravityGlow;
        if (b.kind === 'star2') glowPalette = theme.star2Glow;
        else if (b.kind === 'star3') glowPalette = theme.star3Glow;
        else if (b.kind === 'star4') glowPalette = theme.star4Glow;

        const grad = ctx.createRadialGradient(b.x, b.y, b.radius * 0.8, b.x, b.y, gRad);
        grad.addColorStop(0, glowPalette[0]);
        grad.addColorStop(1, glowPalette[1]);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, gRad, 0, Math.PI * 2);
        ctx.fill();

        // Inner concentric reference rings
        ctx.strokeStyle = theme.fgFaint;
        ctx.lineWidth = 1 / camera.scale;
        for (const frac of [0.38, 0.68]) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius + (gRad - b.radius) * frac, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Outer Exclusive Gravity Zone Boundary Ring (`r = 185` — zero pull from other stars inside!)
        ctx.save();
        ctx.strokeStyle = fill;
        ctx.globalAlpha = 0.25 * b.intro;
        ctx.lineWidth = 1.35 / camera.scale;
        ctx.setLineDash([7 / camera.scale, 5 / camera.scale]);
        ctx.beginPath();
        ctx.arc(b.x, b.y, gRad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (b.kind !== 'home') {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(nowSec * 0.08);
        ctx.strokeStyle = fill;
        ctx.globalAlpha = 0.45 * b.intro;
        ctx.lineWidth = 1.5 / camera.scale;
        for (let k = 0; k < 8; k++) {
          const a = (Math.PI / 4) * k;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * (b.radius + 3.5), Math.sin(a) * (b.radius + 3.5));
          ctx.lineTo(Math.cos(a) * (b.radius + 8.5), Math.sin(a) * (b.radius + 8.5));
          ctx.stroke();
        }
        ctx.restore();
      }

      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();

      if (b.kind === 'home') {
        const hasSlot = getAvailableFleetSlots() > 0;
        const readyRatio = hasSlot ? (1 - state.launchCooldown / state.launchCooldownMax) : 0;

        ctx.save();
        ctx.strokeStyle = hasSlot ? theme.colors[state.selectedColor] : theme.fgFaint;
        ctx.globalAlpha = hasSlot && readyRatio >= 0.99 ? 0.55 : 0.22;
        ctx.lineWidth = 1.8 / camera.scale;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius + 11, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * (hasSlot ? readyRatio : 1));
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawObservationStations() {
    const nowSec = performance.now() * 0.001;
    const aimPulse = Math.sin(nowSec * 9.0) * 0.5 + 0.5;

    for (const task of state.tasks) {
      const col = theme.colors[task.colorIndex];
      const scale = task.spawnAnim * task.spawnAnim * (3 - 2 * task.spawnAnim);
      const r = task.radius * scale;
      if (r < 1) continue;

      const isUrgent = task.demand > 0.72;
      const urgentPulse = isUrgent ? Math.sin(nowSec * 11) * 0.5 + 0.5 : 0;
      const isPreviewHit = state.previewServicedTaskIds && state.previewServicedTaskIds.has(task.id);

      ctx.save();
      ctx.translate(task.x, task.y);

      // Calm Halo when recently serviced by a Star-Charged multi-star satellite (slow demand fill!)
      if (task.calmTimer > 0) {
        ctx.save();
        ctx.rotate(nowSec * 0.45);
        ctx.strokeStyle = theme.harmony;
        ctx.globalAlpha = Math.min(0.65, 0.22 + (task.calmTimer / 9.5) * 0.42);
        ctx.lineWidth = 1.5 / camera.scale;
        ctx.setLineDash([5 / camera.scale, 5 / camera.scale]);
        ctx.beginPath();
        ctx.arc(0, 0, r + 9.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Live Aiming Confirmation Ring when the aimed trajectory will clear this station!
      if (isPreviewHit) {
        ctx.save();
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.55 + aimPulse * 0.40;
        ctx.lineWidth = 2.2 / camera.scale;
        ctx.beginPath();
        ctx.arc(0, 0, r + 9.5 + aimPulse * 2.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (task.demand > 0.01) {
        ctx.fillStyle = isUrgent ? theme.danger : col;
        ctx.globalAlpha = isUrgent ? 0.26 + urgentPulse * 0.22 : 0.16;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r + 4.5, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * task.demand);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = isUrgent ? theme.danger : col;
        ctx.globalAlpha = isUrgent ? 0.95 : 0.5;
        ctx.lineWidth = (isUrgent ? 3.2 : 2.1) / camera.scale;
        ctx.beginPath();
        ctx.arc(0, 0, r + 5, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * task.demand);
        ctx.stroke();
      }

      ctx.globalAlpha = 0.85 + task.serviceFlash * 0.15;
      ctx.strokeStyle = col;
      ctx.lineWidth = (2.4 + task.serviceFlash * 1.4) / camera.scale;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1.3 / camera.scale;
      for (let k = 0; k < 4; k++) {
        const a = (Math.PI * 0.5) * k + Math.PI * 0.25;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (r - 3), Math.sin(a) * (r - 3));
        ctx.lineTo(Math.cos(a) * (r + 2), Math.sin(a) * (r + 2));
        ctx.stroke();
      }

      ctx.globalAlpha = 0.88;
      drawSatelliteShape(0, 0, -Math.PI * 0.5, task.colorIndex, 5.2 * scale);

      ctx.restore();
    }
  }

  function drawRelayLinks() {
    for (const link of state.relayLinks) {
      ctx.save();
      ctx.strokeStyle = theme.colors[link.colorIndex];
      ctx.globalAlpha = 0.35 + link.strength * 0.45;
      ctx.lineWidth = (1.8 + link.strength * 1.8) / camera.scale;
      ctx.beginPath();
      ctx.moveTo(link.x1, link.y1);
      ctx.lineTo(link.x2, link.y2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Luminous harmonic spark tether & diamond drawn when two satellites graze right past each other!
   */
  function drawFlybySparks() {
    for (const sp of state.flybySparks) {
      const alpha = 1 - sp.life / sp.maxLife;
      ctx.save();
      ctx.strokeStyle = theme.harmony;
      ctx.globalAlpha = alpha * 0.85;
      ctx.lineWidth = (2.2 * alpha) / camera.scale;
      ctx.beginPath();
      ctx.moveTo(sp.x1, sp.y1);
      ctx.lineTo(sp.x2, sp.y2);
      ctx.stroke();

      const d = (6.5 + (1 - alpha) * 4) / camera.scale;
      ctx.fillStyle = theme.harmony;
      ctx.globalAlpha = alpha * 0.9;
      ctx.beginPath();
      ctx.moveTo(sp.mx, sp.my - d);
      ctx.lineTo(sp.mx + d, sp.my);
      ctx.lineTo(sp.mx, sp.my + d);
      ctx.lineTo(sp.mx - d, sp.my);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawSatellites() {
    const hasShieldUpgrade = state.upgrades.shield > 0;
    const nowSec = performance.now() * 0.001;

    for (const sat of state.satellites) {
      const col = theme.colors[sat.colorIndex];
      const resTier = sat.servicedCount >= 7 ? 2 : (sat.servicedCount >= 3 ? 1 : 0);
      const isCharged = (sat.interstellarCharge || 0) > 0;

      if (sat.trail.length > 1) {
        for (let i = 1; i < sat.trail.length; i++) {
          const p0 = sat.trail[i - 1];
          const p1 = sat.trail[i];
          if (p1.breakSegment) continue;
          const frac = i / sat.trail.length;
          ctx.strokeStyle = col;
          ctx.globalAlpha = frac * frac * (0.58 + resTier * 0.14 + (isCharged ? 0.14 : 0));
          ctx.lineWidth = (1.0 + frac * (2.2 + resTier * 0.6 + (isCharged ? 0.5 : 0))) / camera.scale;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Multi-Star Interstellar Charge Wide-Sweep Aura (+28 station pickup radius!)
      if (isCharged) {
        const chargeAlpha = Math.min(1, sat.interstellarCharge / 1.8);
        const pulse = Math.sin(nowSec * 6.5 + sat.id) * 0.5 + 0.5;
        ctx.save();
        ctx.strokeStyle = theme.harmony;
        ctx.fillStyle = theme.harmony;
        ctx.globalAlpha = 0.08 * chargeAlpha;
        ctx.beginPath();
        ctx.arc(sat.x, sat.y, 26 + pulse * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = (0.36 + pulse * 0.20) * chargeAlpha;
        ctx.lineWidth = 1.35 / camera.scale;
        ctx.setLineDash([5 / camera.scale, 4 / camera.scale]);
        ctx.beginPath();
        ctx.arc(sat.x, sat.y, 26 + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (hasShieldUpgrade && sat.shieldCooldown <= 0) {
        ctx.save();
        ctx.strokeStyle = theme.shield;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1.4 / camera.scale;
        ctx.setLineDash([4 / camera.scale, 3 / camera.scale]);
        ctx.beginPath();
        ctx.arc(sat.x, sat.y, 11.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (resTier >= 1) {
        ctx.save();
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.42;
        ctx.lineWidth = 1.3 / camera.scale;
        ctx.beginPath();
        ctx.arc(sat.x, sat.y, 12.8, 0, Math.PI * 2);
        ctx.stroke();
        if (resTier >= 2) {
          ctx.globalAlpha = 0.24;
          ctx.beginPath();
          ctx.arc(sat.x, sat.y, 16.8, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      const ang = Math.atan2(sat.vy, sat.vx);
      drawSatelliteShape(sat.x, sat.y, ang, sat.colorIndex, 6.8 + resTier * 0.5 + (isCharged ? 0.45 : 0));
    }
  }

  function drawCollisionWarnings() {
    if (state.dangerSatIds.size === 0) return;
    const pulse = Math.sin(performance.now() * 0.016) * 0.5 + 0.5;

    ctx.save();
    ctx.strokeStyle = theme.danger;
    ctx.lineWidth = 1.8 / camera.scale;

    for (const sat of state.satellites) {
      if (!state.dangerSatIds.has(sat.id)) continue;
      ctx.globalAlpha = 0.45 + pulse * 0.5;
      ctx.beginPath();
      ctx.arc(sat.x, sat.y, 13 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const pair of state.dangerPairs) {
      ctx.globalAlpha = 0.6 + pulse * 0.35;
      const r = 6 / camera.scale;
      ctx.beginPath();
      ctx.moveTo(pair.hitX - r, pair.hitY - r);
      ctx.lineTo(pair.hitX + r, pair.hitY + r);
      ctx.moveTo(pair.hitX + r, pair.hitY - r);
      ctx.lineTo(pair.hitX - r, pair.hitY + r);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDragAndTrajectoryPreview(activeDragPreview) {
    if (!state.drag || !activeDragPreview) return;

    if (activeDragPreview.mode === 'launch') {
      const { init, hasSlot, pred } = activeDragPreview;
      const col = hasSlot ? theme.colors[init.colorIndex] : theme.danger;

      ctx.save();
      ctx.strokeStyle = hasSlot ? theme.fgSoft : theme.danger;
      ctx.lineWidth = 1.6 / camera.scale;
      ctx.setLineDash([4 / camera.scale, 4 / camera.scale]);
      ctx.beginPath();
      ctx.moveTo(init.x, init.y);
      ctx.lineTo(state.drag.currWorldX, state.drag.currWorldY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(state.drag.currWorldX, state.drag.currWorldY, 5 / camera.scale, 0, Math.PI * 2);
      ctx.fill();

      if (hasSlot && pred) {
        drawSatelliteShape(init.x, init.y, Math.atan2(init.vy, init.vx), init.colorIndex, 6.8);
        drawPredictedCurve(pred, col);
      }
      ctx.restore();
    } else if (activeDragPreview.mode === 'thruster') {
      const { sat, hasFuel, pred } = activeDragPreview;
      const col = hasFuel ? theme.colors[sat.colorIndex] : theme.danger;

      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.8 / camera.scale;
      ctx.beginPath();
      ctx.arc(sat.x, sat.y, 16, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([3 / camera.scale, 4 / camera.scale]);
      ctx.beginPath();
      ctx.moveTo(sat.x, sat.y);
      ctx.lineTo(state.drag.currWorldX, state.drag.currWorldY);
      ctx.stroke();
      ctx.setLineDash([]);

      if (hasFuel && pred) {
        drawPredictedCurve(pred, col);
      }
      ctx.restore();
    }
  }

  function drawPredictedCurve(pred, color) {
    const pts = pred.points;
    for (let i = 2; i < pts.length; i += 2) {
      if (pts[i].breakSegment || pts[i - 1].breakSegment) continue;
      const isCharged = pts[i].charged;
      const alpha = (1 - i / pts.length) * (isCharged ? 0.96 : 0.88);
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, (isCharged ? 2.65 : 2.15) / camera.scale, 0, Math.PI * 2);
      ctx.fill();

      if (isCharged && i % 4 === 0) {
        ctx.fillStyle = theme.harmony;
        ctx.globalAlpha = alpha * 0.65;
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, 1.35 / camera.scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Interstellar Exclusive-Zone Entry Gate Markers (Multi-star orbit confirmation!)
    if (pred.transits && pred.transits.length > 0) {
      ctx.strokeStyle = theme.harmony;
      ctx.lineWidth = 1.7 / camera.scale;
      for (const tr of pred.transits) {
        ctx.globalAlpha = 0.90;
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, 5.5 / camera.scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.42;
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, 9.5 / camera.scale, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Close Star Swing-by rings
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.82;
    ctx.lineWidth = 1.5 / camera.scale;
    for (const sb of pred.swingBys) {
      ctx.beginPath();
      ctx.arc(sb.x, sb.y, 6.8 / camera.scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Predicted Close Intertwining Flybys ("すれすれ交差" Diamond `◇` markers!)
    if (pred.nearMisses && pred.nearMisses.length > 0) {
      const d = 6.2 / camera.scale;
      ctx.strokeStyle = theme.harmony;
      ctx.lineWidth = 1.8 / camera.scale;
      for (const nm of pred.nearMisses) {
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.moveTo(nm.candX, nm.candY);
        ctx.lineTo(nm.otherX, nm.otherY);
        ctx.stroke();

        ctx.globalAlpha = 0.92;
        ctx.beginPath();
        ctx.moveTo(nm.x, nm.y - d);
        ctx.lineTo(nm.x + d, nm.y);
        ctx.lineTo(nm.x, nm.y + d);
        ctx.lineTo(nm.x - d, nm.y);
        ctx.closePath();
        ctx.stroke();
      }
    }

    // Star Surface Crash (`×` impact marker when trajectory hits a star!)
    if (pred.hitBody) {
      const r = 6.5 / camera.scale;
      ctx.strokeStyle = theme.danger;
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 2.4 / camera.scale;
      ctx.beginPath();
      ctx.moveTo(pred.hitBody.x - r, pred.hitBody.y - r);
      ctx.lineTo(pred.hitBody.x + r, pred.hitBody.y + r);
      ctx.moveTo(pred.hitBody.x + r, pred.hitBody.y - r);
      ctx.lineTo(pred.hitBody.x - r, pred.hitBody.y + r);
      ctx.stroke();
    }

    // Predicted Phase Collisions (`×` warning markers!)
    if (pred.collisions && pred.collisions.length > 0) {
      const pulse = Math.sin(performance.now() * 0.018) * 0.5 + 0.5;
      const r = (6.5 + pulse * 1.5) / camera.scale;
      ctx.strokeStyle = theme.danger;
      ctx.lineWidth = 2.4 / camera.scale;
      for (const hit of pred.collisions) {
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.moveTo(hit.x - r, hit.y - r);
        ctx.lineTo(hit.x + r, hit.y + r);
        ctx.moveTo(hit.x + r, hit.y - r);
        ctx.lineTo(hit.x - r, hit.y + r);
        ctx.stroke();

        ctx.globalAlpha = 0.45 + pulse * 0.35;
        ctx.lineWidth = 1.5 / camera.scale;
        ctx.beginPath();
        ctx.arc(hit.x, hit.y, 12 / camera.scale, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
  }

  function drawFirstLaunchGestureHint() {
    const t = (performance.now() * 0.00075) % 1;
    const ease = t < 0.7 ? (t / 0.7) : 1;
    const alpha = t < 0.75 ? Math.sin((t / 0.75) * Math.PI) * 0.65 : 0;
    if (alpha <= 0.02) return;

    const startX = 0;
    const startY = -125;
    const pullX = startX - ease * 78;
    const pullY = startY + ease * 12;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = theme.colors[state.selectedColor];
    ctx.lineWidth = 2 / camera.scale;
    ctx.setLineDash([4 / camera.scale, 4 / camera.scale]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(pullX, pullY);
    ctx.stroke();
    ctx.setLineDash([]);

    drawSatelliteShape(startX, startY, Math.atan2(startY - pullY, startX - pullX), state.selectedColor, 6.2);

    ctx.beginPath();
    ctx.arc(pullX, pullY, 9 / camera.scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPulsesAndParticles() {
    for (const pl of state.pulses) {
      const t = pl.life / pl.maxLife;
      const ease = 1 - Math.pow(1 - t, 3);
      const r = pl.startR + (pl.endR - pl.startR) * ease;
      ctx.save();
      ctx.strokeStyle = pl.color;
      ctx.globalAlpha = (1 - t) * 0.75;
      ctx.lineWidth = pl.lineWidth / camera.scale;
      ctx.beginPath();
      ctx.arc(pl.x, pl.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const p of state.particles) {
      const t = p.life / p.maxLife;
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 1 - t;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ((p.size * (1 - t * 0.5)) / camera.scale) * 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // =========================================================================
  // Minimalist Zero-Text HUD (Screen Space)
  // =========================================================================
  function drawMinimalHUD() {
    hudButtons = [];
    colorButtons = [];

    const compactHud = viewW <= 600;
    const topY = safeInsets.top + (compactHud ? 70 : 28);
    let rightX = viewW - safeInsets.right - 28;

    // 1. Help '?' Button
    const helpBtn = {
      x: rightX,
      y: topY,
      r: 15,
      onClick: () => helpOverlay.classList.remove('hidden')
    };
    hudButtons.push(helpBtn);
    drawCircleButtonFrame(helpBtn.x, helpBtn.y, helpBtn.r);
    ctx.save();
    ctx.strokeStyle = theme.fgSoft;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.arc(helpBtn.x, helpBtn.y - 2.5, 4, Math.PI * 1.1, Math.PI * 0.25, false);
    ctx.lineTo(helpBtn.x, helpBtn.y + 3);
    ctx.stroke();
    ctx.fillStyle = theme.fgSoft;
    ctx.beginPath();
    ctx.arc(helpBtn.x, helpBtn.y + 6.8, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Audio Mute Button
    rightX -= 40;
    const audioBtn = {
      x: rightX,
      y: topY,
      r: 15,
      onClick: () => Audio.toggleMute()
    };
    hudButtons.push(audioBtn);
    drawCircleButtonFrame(audioBtn.x, audioBtn.y, audioBtn.r);
    ctx.save();
    ctx.strokeStyle = theme.fgSoft;
    ctx.fillStyle = theme.fgSoft;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(audioBtn.x - 6, audioBtn.y - 3);
    ctx.lineTo(audioBtn.x - 2.5, audioBtn.y - 3);
    ctx.lineTo(audioBtn.x + 1.5, audioBtn.y - 6.5);
    ctx.lineTo(audioBtn.x + 1.5, audioBtn.y + 6.5);
    ctx.lineTo(audioBtn.x - 2.5, audioBtn.y + 3);
    ctx.lineTo(audioBtn.x - 6, audioBtn.y + 3);
    ctx.closePath();
    ctx.fill();
    if (!Audio.muted) {
      ctx.beginPath();
      ctx.arc(audioBtn.x + 2, audioBtn.y, 5.2, -0.7, 0.7);
      ctx.stroke();
    } else {
      ctx.strokeStyle = theme.danger;
      ctx.beginPath();
      ctx.moveTo(audioBtn.x + 4, audioBtn.y - 4);
      ctx.lineTo(audioBtn.x + 9, audioBtn.y + 4);
      ctx.moveTo(audioBtn.x + 9, audioBtn.y - 4);
      ctx.lineTo(audioBtn.x + 4, audioBtn.y + 4);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Theme Toggle Button (Deep Navy <-> White Blueprint)
    rightX -= 40;
    const themeBtn = {
      x: rightX,
      y: topY,
      r: 15,
      onClick: toggleAppTheme
    };
    hudButtons.push(themeBtn);
    drawCircleButtonFrame(themeBtn.x, themeBtn.y, themeBtn.r);
    ctx.save();
    ctx.strokeStyle = theme.fgSoft;
    ctx.fillStyle = theme.fgSoft;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(themeBtn.x, themeBtn.y, 6.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(themeBtn.x, themeBtn.y, 6.5, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.fill();
    ctx.restore();

    // 4. Cosmic Year Clock Dial
    rightX -= 46;
    const clockX = rightX;
    const clockY = topY;
    const clockR = 14;

    ctx.save();
    ctx.strokeStyle = theme.fgFaint;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(clockX, clockY, clockR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = theme.colors[1];
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(clockX, clockY, clockR, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * state.yearProgress);
    ctx.stroke();

    const handAng = -Math.PI * 0.5 + Math.PI * 2 * state.yearProgress;
    ctx.strokeStyle = theme.fgSoft;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(clockX, clockY);
    ctx.lineTo(clockX + Math.cos(handAng) * (clockR - 4), clockY + Math.sin(handAng) * (clockR - 4));
    ctx.stroke();

    for (let y = 1; y < state.year; y++) {
      ctx.fillStyle = theme.colors[1];
      ctx.beginPath();
      ctx.arc(clockX - 24 - (y - 1) * 11, clockY, 3.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 5. Bottom Dock:
    //    Row 1: Satellite Fleet Slots (Ready = filled dot, Active in orbit = colored ring, Rebuilding = radial arc)
    //    Row 2: Satellite Shape/Color Selector (▲ ■ ◆)
    //    Row 3: Micro-Thruster Fuel Segments
    drawFleetSlotRow();

    const bottomY = viewH - safeInsets.bottom - 44;
    const spacing = 46;
    const startX = viewW * 0.5 - ((state.unlockedColors - 1) * spacing) * 0.5;

    for (let c = 0; c < state.unlockedColors; c++) {
      const bx = startX + c * spacing;
      const by = bottomY;
      const isSelected = state.selectedColor === c;

      colorButtons.push({ x: bx, y: by, r: 18, colorIndex: c });

      ctx.save();
      if (isSelected) {
        ctx.strokeStyle = theme.colors[c];
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(bx, by, 17, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = theme.fgFaint;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(bx, by, 15, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = isSelected ? 1.0 : 0.55;
      drawSatelliteShape(bx, by, -Math.PI * 0.5, c, isSelected ? 7.2 : 6.0);
      ctx.restore();
    }

    const segCount = state.maxFuel;
    const segW = 18;
    const segH = 4.5;
    const segGap = 5;
    const totalW = segCount * segW + (segCount - 1) * segGap;
    const fuelStartX = viewW * 0.5 - totalW * 0.5;
    const fuelY = viewH - safeInsets.bottom - 15;

    const noFuelAlert = state.drag && state.drag.mode === 'thruster' && state.fuel < 0.99;

    for (let i = 0; i < segCount; i++) {
      const sx = fuelStartX + i * (segW + segGap);
      const fillAmt = Math.max(0, Math.min(1, state.fuel - i));

      ctx.save();
      ctx.fillStyle = noFuelAlert ? theme.danger : theme.fgFaint;
      ctx.globalAlpha = noFuelAlert ? 0.55 : 1;
      roundRect(ctx, sx, fuelY, segW, segH, 2.2);
      ctx.fill();

      if (fillAmt > 0.01) {
        ctx.fillStyle = fillAmt >= 0.99 ? theme.colors[0] : theme.fgSoft;
        ctx.globalAlpha = fillAmt >= 0.99 ? 0.9 : 0.45;
        roundRect(ctx, sx, fuelY, segW * fillAmt, segH, 2.2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawFleetSlotRow() {
    const slotY = viewH - safeInsets.bottom - 76;
    const slotGap = 20;
    const totalSlots = state.fleetMax;
    const startX = viewW * 0.5 - ((totalSlots - 1) * slotGap) * 0.5;

    const activeCount = state.satellites.length;
    const rebuildCount = state.rebuildTimers.length;
    const noSlotAlert = state.drag && state.drag.mode === 'launch' && getAvailableFleetSlots() <= 0;
    const alertPulse = noSlotAlert ? Math.sin(performance.now() * 0.018) * 0.5 + 0.5 : 0;

    for (let i = 0; i < totalSlots; i++) {
      const sx = startX + i * slotGap;
      ctx.save();

      if (i < activeCount) {
        const sat = state.satellites[i];
        ctx.strokeStyle = noSlotAlert ? theme.danger : theme.colors[sat.colorIndex];
        ctx.lineWidth = noSlotAlert ? 2.2 : 1.8;
        ctx.globalAlpha = noSlotAlert ? 0.65 + alertPulse * 0.35 : 0.88;
        ctx.beginPath();
        ctx.arc(sx, slotY, 5.2 + (noSlotAlert ? alertPulse * 1.2 : 0), 0, Math.PI * 2);
        ctx.stroke();

        // Subtle inner dot when this satellite is Star-Charged on a multi-star orbit!
        if ((sat.interstellarCharge || 0) > 0 && !noSlotAlert) {
          ctx.fillStyle = theme.harmony;
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.arc(sx, slotY, 2.1, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (i < activeCount + rebuildCount) {
        const rem = state.rebuildTimers[i - activeCount];
        const prog = Math.max(0, Math.min(1, 1 - rem / state.rebuildDuration));
        ctx.strokeStyle = noSlotAlert ? theme.danger : theme.fgFaint;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(sx, slotY, 5.2, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = noSlotAlert ? theme.danger : theme.colors[1];
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.arc(sx, slotY, 5.2, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * prog);
        ctx.stroke();
      } else {
        ctx.fillStyle = theme.fg;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(sx, slotY, 4.4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  function drawCircleButtonFrame(x, y, r) {
    ctx.save();
    ctx.strokeStyle = theme.fgFaint;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(context, x, y, w, h, r) {
    const rad = Math.min(r, w * 0.5, h * 0.5);
    context.beginPath();
    context.moveTo(x + rad, y);
    context.lineTo(x + w - rad, y);
    context.quadraticCurveTo(x + w, y, x + w, y + rad);
    context.lineTo(x + w, y + h - rad);
    context.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    context.lineTo(x + rad, y + h);
    context.quadraticCurveTo(x, y + h, x, y + h - rad);
    context.lineTo(x, y + rad);
    context.quadraticCurveTo(x, y, x + rad, y);
    context.closePath();
  }

  // =========================================================================
  // Theme Sync & Main Loop
  // =========================================================================
  function toggleAppTheme() {
    themeName = themeName === 'navy' ? 'blueprint' : 'navy';
    theme = THEMES[themeName];
    document.body.className = themeName === 'navy' ? 'theme-navy' : 'theme-blueprint';
    if (Puzzle) Puzzle.setTheme(themeName);
  }

  let lastFrameTime = performance.now();

  function loop(now) {
    const rawDt = Math.min(0.05, Math.max(0.001, (now - lastFrameTime) * 0.001));
    lastFrameTime = now;

    if (Puzzle && Puzzle.isActive()) {
      Puzzle.update(rawDt);
      Puzzle.render(ctx);
    } else {
      updateSimulation(rawDt);
      render();
    }
    requestAnimationFrame(loop);
  }

  resize();
  resetGame();

  if (Puzzle) {
    Puzzle.initUI(canvas, {
      onThemeToggle: toggleAppTheme,
      onEnterMission: () => {
        if (state) {
          state.drag = null;
          Audio.setBulletTime(false);
        }
        upgradeOverlay.classList.add('hidden');
        gameOverOverlay.classList.add('hidden');
      },
      onExitToOrbita: () => {
        if (state) {
          if (state.gameOver) {
            gameOverOverlay.classList.remove('hidden');
          } else if (state.pausedForModal) {
            upgradeOverlay.classList.remove('hidden');
          }
        }
      }
    });
    Puzzle.setTheme(themeName);
    Puzzle.resize(viewW, viewH, dpr, safeInsets);
  }

  requestAnimationFrame(loop);
})();