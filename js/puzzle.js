/**
 * ORBITA Sub-Game: "MISSION" — 10-Stage Swing-By & Warp Puzzle Mode
 * - Pre-placed Fixed Stars, Stationary Planets, & Orbiting Planets/Moons
 * - Paired Subspace Warp Holes (velocity-preserving teleportation + full preview!)
 * - Red Debris Hazards (static barriers & rotating orbital belts)
 * - Destructible Crystalline Obstacles / Seal Cores & Goal Portals
 * - Deterministic Fixed-Timestep (1/60s) Verlet Physics so live aiming preview matches 100%
 * - Zero text / zero digits rendered on #gameCanvas!
 */
(function () {
  const FIXED_DT = 1 / 60;
  const PREVIEW_STEPS = 360; // 6.0s deterministic lookahead
  const MAX_PROBES_PER_TRY = 3;
  const MAX_FLIGHT_TIME = 16.0;
  const STORAGE_KEY = 'orbita_puzzle_stars_v1';

  const PUZZLE_THEMES = {
    navy: {
      bg: '#080c18',
      grid: 'rgba(110, 155, 230, 0.045)',
      orbitGuide: 'rgba(140, 180, 255, 0.14)',
      fg: '#e8eef8',
      fgSoft: 'rgba(220, 234, 255, 0.56)',
      fgFaint: 'rgba(200, 220, 255, 0.18)',
      starCore: '#ffd982',
      star2Core: '#eef4ff',
      planetCore: '#6ec8ff',
      moonCore: '#c9b3ff',
      starGlow: ['rgba(255, 205, 95, 0.16)', 'rgba(255, 205, 95, 0.0)'],
      planetGlow: ['rgba(95, 190, 255, 0.14)', 'rgba(95, 190, 255, 0.0)'],
      probe: '#38e2ff',
      goal: '#4dffcf',
      goalLocked: '#ffbe3b',
      target: '#ffbe3b',
      targetCore: '#ff5d8f',
      debris: '#ff3b4e',
      warpPairs: ['#b18cff', '#2ee6d6']
    },
    blueprint: {
      bg: '#f1f4f9',
      grid: 'rgba(28, 62, 120, 0.065)',
      orbitGuide: 'rgba(28, 62, 120, 0.15)',
      fg: '#182848',
      fgSoft: 'rgba(24, 40, 72, 0.56)',
      fgFaint: 'rgba(24, 40, 72, 0.16)',
      starCore: '#d98200',
      star2Core: '#1b2d52',
      planetCore: '#0077b6',
      moonCore: '#6a3fb5',
      starGlow: ['rgba(220, 135, 10, 0.13)', 'rgba(220, 135, 10, 0.0)'],
      planetGlow: ['rgba(0, 119, 182, 0.12)', 'rgba(0, 119, 182, 0.0)'],
      probe: '#0088cc',
      goal: '#009e73',
      goalLocked: '#e08600',
      target: '#e08600',
      targetCore: '#d82b68',
      debris: '#e02438',
      warpPairs: ['#6c47d9', '#008b8b']
    }
  };

  function makeVerticalDebrisWall(x, yMin, yMax, step, radius = 14) {
    const arr = [];
    for (let y = yMin; y <= yMax; y += step) {
      arr.push({ x, y, r: radius });
    }
    return arr;
  }

  function makeDebrisRing(cx, cy, orbitR, count, skipIndices, orbitSpeed, radius = 13, phaseOffset = 0) {
    const skip = new Set(skipIndices || []);
    const arr = [];
    for (let k = 0; k < count; k++) {
      if (skip.has(k)) continue;
      arr.push({
        cx,
        cy,
        orbitR,
        orbitPhase: phaseOffset + (k * Math.PI * 2) / count,
        orbitSpeed,
        r: radius
      });
    }
    return arr;
  }

  /**
   * 10 Handcrafted & Mathematically Verified Swing-By Stages
   * Modes:
   * - 'goal': Reach the Goal Portal
   * - 'destroy': Shatter all Crystalline Target Obstacles
   * - 'both': Shatter all Seal Cores to unlock the Goal Portal, then enter the Goal!
   */
  const STAGES = [
    {
      id: 1,
      title: '重力カーブ',
      subtitle: '恒星の引力で軌道を曲げ、ゴールへ到達',
      badge: 'GOAL',
      mode: 'goal',
      spanW: 860,
      spanH: 580,
      pad: { x: -290, y: 120 },
      goal: { x: 260, y: -135, r: 28 },
      bodies: [
        { kind: 'star', x: 0, y: 0, r: 26, gm: 3600000, visualR: 175 }
      ],
      debris: [
        { x: -80, y: -35, r: 13 },
        { x: -40, y: -75, r: 13 },
        { x: 10, y: -105, r: 13 }
      ],
      targets: [],
      warps: []
    },
    {
      id: 2,
      title: '砕氷スイングバイ',
      subtitle: '恒星を回り込む曲線で3つの結晶障害物を粉砕',
      badge: 'DESTROY',
      mode: 'destroy',
      spanW: 840,
      spanH: 580,
      pad: { x: -260, y: 145 },
      goal: null,
      bodies: [
        { kind: 'star', x: 10, y: 0, r: 26, gm: 4100000, visualR: 180 }
      ],
      debris: [],
      targets: [
        { x: -5, y: 135, r: 21 },
        { x: 112, y: 10, r: 21 },
        { x: 10, y: -125, r: 21 }
      ],
      warps: []
    },
    {
      id: 3,
      title: '二重惑星アシスト',
      subtitle: '恒星と惑星の重力場をS字に渡りゴールへ',
      badge: 'GOAL',
      mode: 'goal',
      spanW: 920,
      spanH: 600,
      pad: { x: -330, y: 135 },
      goal: { x: 320, y: 115, r: 28 },
      bodies: [
        { kind: 'star', x: -105, y: 25, r: 25, gm: 3400000, visualR: 165 },
        { kind: 'planet', x: 145, y: -45, r: 18, gm: 1850000, visualR: 130 }
      ],
      debris: [
        { x: 20, y: 135, r: 13 },
        { x: 75, y: 120, r: 13 },
        { x: 130, y: 105, r: 13 },
        { x: -105, y: -95, r: 13 }
      ],
      targets: [],
      warps: []
    },
    {
      id: 4,
      title: 'ワープゲート',
      subtitle: 'デブリ長城をワープホール跳躍と惑星スイングバイで突破',
      badge: 'WARP + GOAL',
      mode: 'goal',
      spanW: 920,
      spanH: 620,
      pad: { x: -310, y: -120 },
      goal: { x: 290, y: 125, r: 28 },
      bodies: [
        { kind: 'star', x: -150, y: 15, r: 25, gm: 3300000, visualR: 160 },
        { kind: 'planet', x: 165, y: 15, r: 19, gm: 2200000, visualR: 135 }
      ],
      debris: makeVerticalDebrisWall(0, -560, 560, 44, 14),
      targets: [],
      warps: [
        { x1: -150, y1: 155, x2: 120, y2: -150, r: 25, pairIndex: 0 }
      ]
    },
    {
      id: 5,
      title: 'デブリベルトの封印',
      subtitle: '回転デブリを抜けて封印結晶をすべて壊しゴールへ',
      badge: 'SEAL + GOAL',
      mode: 'both',
      spanW: 880,
      spanH: 640,
      pad: { x: -295, y: 135 },
      goal: { x: 15, y: -245, r: 29 },
      bodies: [
        { kind: 'star', x: 0, y: 0, r: 26, gm: 4100000, visualR: 175 }
      ],
      debris: makeDebrisRing(0, 0, 215, 8, [2, 3, 6, 7], 0.38, 13, 0),
      targets: [
        { x: -10, y: 132, r: 22 },
        { x: 112, y: 8, r: 22 }
      ],
      warps: []
    },
    {
      id: 6,
      title: '公転惑星の窓',
      subtitle: '公転する巨大惑星の重力アシストでデブリ帯を越えろ',
      badge: 'ORBIT + GOAL',
      mode: 'goal',
      spanW: 940,
      spanH: 640,
      pad: { x: -330, y: 150 },
      goal: { x: 310, y: -165, r: 28 },
      bodies: [
        { kind: 'star', x: -40, y: 0, r: 26, gm: 3600000, visualR: 165 },
        { kind: 'planet', cx: -40, cy: 0, orbitR: 195, orbitPhase: 0.6, orbitSpeed: 0.55, r: 17, gm: 1950000, visualR: 120 }
      ],
      debris: [
        { x: -40, y: -95, r: 14 },
        { x: 5, y: -85, r: 14 },
        { x: 50, y: -70, r: 14 },
        { x: 95, y: -55, r: 14 }
      ],
      targets: [],
      warps: []
    },
    {
      id: 7,
      title: 'ワープ連鎖クラッシュ',
      subtitle: '2組のワープホールを繋ぎ3つの結晶障害物を連続破壊',
      badge: 'WARP + DESTROY',
      mode: 'destroy',
      spanW: 940,
      spanH: 600,
      pad: { x: -330, y: 120 },
      goal: null,
      bodies: [
        { kind: 'star', x: -155, y: 0, r: 24, gm: 3200000, visualR: 155 },
        { kind: 'star2', x: 155, y: 0, r: 24, gm: 3200000, visualR: 155 }
      ],
      debris: [
        { x: 0, y: 0, r: 14 },
        { x: 0, y: 52, r: 13 },
        { x: 0, y: -52, r: 13 }
      ],
      targets: [
        { x: -155, y: 118, r: 22 },
        { x: 155, y: 118, r: 22 },
        { x: 260, y: 15, r: 22 }
      ],
      warps: [
        { x1: -40, y1: -115, x2: 50, y2: 115, r: 26, pairIndex: 0 },
        { x1: 265, y1: -50, x2: -265, y2: -95, r: 26, pairIndex: 1 }
      ]
    },
    {
      id: 8,
      title: '連星カオス回廊',
      subtitle: '双子恒星と逆回転デブリの隙間を縫う8の字スイングバイ',
      badge: 'GOAL',
      mode: 'goal',
      spanW: 880,
      spanH: 660,
      pad: { x: 0, y: 245 },
      goal: { x: 0, y: -240, r: 28 },
      bodies: [
        { kind: 'star', x: -155, y: 0, r: 25, gm: 3500000, visualR: 155 },
        { kind: 'star2', x: 155, y: 0, r: 25, gm: 3500000, visualR: 155 }
      ],
      debris: [
        { x: 0, y: 0, r: 15 },
        { x: -38, y: 25, r: 13 },
        { x: 38, y: -25, r: 13 },
        { cx: -155, cy: 0, orbitR: 105, orbitPhase: 0.0, orbitSpeed: 0.65, r: 12 },
        { cx: -155, cy: 0, orbitR: 105, orbitPhase: Math.PI, orbitSpeed: 0.65, r: 12 },
        { cx: 155, cy: 0, orbitR: 105, orbitPhase: Math.PI * 0.5, orbitSpeed: -0.65, r: 12 },
        { cx: 155, cy: 0, orbitR: 105, orbitPhase: Math.PI * 1.5, orbitSpeed: -0.65, r: 12 }
      ],
      targets: [],
      warps: []
    },
    {
      id: 9,
      title: '軌道要塞へのワープ投入',
      subtitle: 'ワープで重恒星の周回軌道へ直接突入し、公転する4標的を一掃',
      badge: 'WARP + DESTROY',
      mode: 'destroy',
      spanW: 940,
      spanH: 620,
      pad: { x: -340, y: 130 },
      goal: null,
      bodies: [
        { kind: 'star', x: 60, y: 0, r: 28, gm: 4500000, visualR: 180 },
        { kind: 'planet', x: -200, y: 10, r: 18, gm: 1800000, visualR: 120 }
      ],
      debris: [
        { cx: 60, cy: 0, orbitR: 215, orbitPhase: 0.0, orbitSpeed: 0.35, r: 13 },
        { cx: 60, cy: 0, orbitR: 215, orbitPhase: 2.094, orbitSpeed: 0.35, r: 13 },
        { cx: 60, cy: 0, orbitR: 215, orbitPhase: 4.188, orbitSpeed: 0.35, r: 13 }
      ],
      targets: [
        { cx: 60, cy: 0, orbitR: 130, orbitPhase: 0.4, orbitSpeed: -0.42, r: 22 },
        { cx: 60, cy: 0, orbitR: 130, orbitPhase: 1.97, orbitSpeed: -0.42, r: 22 },
        { cx: 60, cy: 0, orbitR: 130, orbitPhase: 3.54, orbitSpeed: -0.42, r: 22 },
        { cx: 60, cy: 0, orbitR: 130, orbitPhase: 5.11, orbitSpeed: -0.42, r: 22 }
      ],
      warps: [
        { x1: -105, y1: -95, x2: 60, y2: 132, r: 26, pairIndex: 0 }
      ]
    },
    {
      id: 10,
      title: '超重力グランドツアー',
      subtitle: '連星・公転衛星・ワープを制し、全封印を砕いて最終ゴールへ',
      badge: 'GRAND FINALE',
      mode: 'both',
      spanW: 980,
      spanH: 660,
      pad: { x: -350, y: 135 },
      goal: { x: 165, y: -220, r: 31 },
      bodies: [
        { kind: 'star', x: -165, y: 10, r: 25, gm: 3500000, visualR: 160 },
        { kind: 'star2', x: 165, y: -10, r: 25, gm: 3800000, visualR: 165 },
        { kind: 'moon', cx: 165, cy: -10, orbitR: 155, orbitPhase: 1.8, orbitSpeed: 0.48, r: 14, gm: 1100000, visualR: 95 }
      ],
      debris: [
        { x: 0, y: -35, r: 14 },
        { x: 0, y: 25, r: 14 },
        { x: 0, y: -95, r: 13 },
        { x: 0, y: 85, r: 13 }
      ],
      targets: [
        { x: -165, y: 132, r: 23 },
        { x: 175, y: 112, r: 23 }
      ],
      warps: [
        { x1: -40, y1: -115, x2: 45, y2: 120, r: 27, pairIndex: 0 }
      ]
    }
  ];

  // =========================================================================
  // Geometry & Deterministic Step Helpers
  // =========================================================================
  function distToSegmentSq(px, py, ax, ay, bx, by) {
    const l2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
    if (l2 === 0) return (px - ax) * (px - ax) + (py - ay) * (py - ay);
    let t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const qx = ax + t * (bx - ax);
    const qy = ay + t * (by - ay);
    return (px - qx) * (px - qx) + (py - qy) * (py - qy);
  }

  function evalOrbitalPos(def, t) {
    if (def.orbitR && def.orbitR > 0) {
      const ang = (def.orbitPhase || 0) + t * (def.orbitSpeed || 0);
      return {
        x: (def.cx || 0) + Math.cos(ang) * def.orbitR,
        y: (def.cy || 0) + Math.sin(ang) * def.orbitR
      };
    }
    return { x: def.x || 0, y: def.y || 0 };
  }

  function computeStageAccel(x, y, stage, t) {
    let ax = 0;
    let ay = 0;
    for (let i = 0; i < stage.bodies.length; i++) {
      const b = stage.bodies[i];
      const pos = evalOrbitalPos(b, t);
      const dx = pos.x - x;
      const dy = pos.y - y;
      const eps = b.r * 0.7;
      const s2 = dx * dx + dy * dy + eps * eps;
      const ag = b.gm / (s2 * Math.sqrt(s2));
      ax += dx * ag;
      ay += dy * ag;
    }
    return { ax, ay };
  }

  // =========================================================================
  // Puzzle Sub-Game Controller
  // =========================================================================
  const Audio = window.CosmicAudio;

  let active = false;
  let themeName = 'navy';
  let pTheme = PUZZLE_THEMES.navy;
  let viewW = window.innerWidth;
  let viewH = window.innerHeight;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  const cam = {
    x: 0,
    y: 0,
    scale: 1,
    shake: 0,
    rotated: false,
    screenCX: viewW * 0.5,
    screenCY: viewH * 0.5
  };
  let safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

  let savedStars = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) savedStars = JSON.parse(raw) || {};
  } catch (_) {}

  function saveStageStars(stageId, stars) {
    const prev = savedStars[stageId] || 0;
    if (stars > prev) {
      savedStars[stageId] = stars;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedStars));
      } catch (_) {}
    }
  }

  let currentStageIdx = 0;
  let pState = null;
  let hudButtons = [];
  let onThemeToggleCallback = null;
  let canvasEl = null;

  // DOM Elements (initialized once DOM is ready)
  let modeOrbitaBtn = null;
  let modeMissionBtn = null;
  let puzzleHudPill = null;
  let stageSelectBtn = null;
  let stageSelectLabel = null;
  let puzzleRetryBtn = null;
  let stageSelectOverlay = null;
  let stageGridEl = null;
  let closeStageSelectBtn = null;
  let stageClearOverlay = null;
  let stageClearStarsEl = null;
  let stageClearTitleEl = null;
  let stageClearRetryBtn = null;
  let stageClearNextBtn = null;
  let helpOverlayEl = null;

  function createStageRuntimeState(stageIdx) {
    const stage = STAGES[stageIdx];
    return {
      stageIdx,
      stage,
      stageTime: 0,
      accumulator: 0,
      probesLeft: MAX_PROBES_PER_TRY,
      shotsUsed: 0,
      probe: null,
      readyDelay: 0,
      autoResetTimer: 0,
      cleared: false,
      pausedForModal: false,
      destroyedTargets: stage.targets.map(() => false),
      targetFlash: stage.targets.map(() => 0),
      goalUnlockFlash: 0,
      drag: null,
      particles: [],
      pulses: []
    };
  }

  /**
   * Portrait (smartphone) support:
   * Stages are authored landscape. On portrait screens the whole stage view is rotated
   * by -90° (world +x -> screen up, world +y -> screen right). A pure rotation keeps
   * all gravity / orbit / warp solutions physically identical, while the launch pad
   * (authored on the left) lands near the bottom of the screen for thumb-friendly play.
   */
  function updateCameraScale() {
    if (!pState) return;
    const st = pState.stage;
    cam.rotated = viewH > viewW * 1.05;
    const compact = viewW <= 600 || cam.rotated;

    const topReserve = safeInsets.top + (compact ? 92 : 64);
    const bottomReserve = safeInsets.bottom + (compact ? 84 : 72);
    const sideReserve = Math.max(safeInsets.left, safeInsets.right) + (compact ? 10 : 24);

    const availW = Math.max(200, viewW - sideReserve * 2);
    const availH = Math.max(200, viewH - topReserve - bottomReserve);
    const onScreenW = cam.rotated ? st.spanH : st.spanW;
    const onScreenH = cam.rotated ? st.spanW : st.spanH;

    cam.scale = Math.min(availW / onScreenW, availH / onScreenH);
    cam.screenCX = viewW * 0.5;
    cam.screenCY = topReserve + availH * 0.5;
    cam.x = 0;
    cam.y = cam.rotated ? 0 : -8;
  }

  function screenToWorld(sx, sy) {
    const du = (sx - cam.screenCX) / cam.scale;
    const dv = (sy - cam.screenCY) / cam.scale;
    if (cam.rotated) {
      // Inverse of (x, y) -> (u, v) = (y, -x)
      return { x: cam.x - dv, y: cam.y + du };
    }
    return { x: cam.x + du, y: cam.y + dv };
  }

  // Converts a screen-space direction into a world-space direction
  function screenDirToWorld(dx, dy) {
    return cam.rotated ? { x: -dy, y: dx } : { x: dx, y: dy };
  }

  function worldXToPan(wx, wy) {
    if (cam.rotated) {
      // Screen horizontal axis corresponds to world +y when rotated
      if (wy === undefined) return 0;
      const halfW = Math.max(200, (viewW * 0.5) / cam.scale);
      return Math.max(-0.85, Math.min(0.85, (wy - cam.y) / halfW));
    }
    const halfW = Math.max(200, (viewW * 0.5) / cam.scale);
    return Math.max(-0.85, Math.min(0.85, (wx - cam.x) / halfW));
  }

  function emitParticles(x, y, color, count = 14, speedScale = 1) {
    if (!pState) return;
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45;
      const spd = (36 + Math.random() * 96) * speedScale;
      pState.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        size: 2.3 + Math.random() * 2.8,
        color,
        life: 0,
        maxLife: 0.48 + Math.random() * 0.42
      });
    }
  }

  function emitPulse(x, y, startR, endR, color, duration = 0.65, lineWidth = 2.2) {
    if (!pState) return;
    pState.pulses.push({
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

  function loadStage(stageIdx) {
    currentStageIdx = Math.max(0, Math.min(STAGES.length - 1, stageIdx));
    pState = createStageRuntimeState(currentStageIdx);
    cam.shake = 0;
    updateCameraScale();
    updateTopBarLabel();
    if (stageClearOverlay) stageClearOverlay.classList.add('hidden');
    if (stageSelectOverlay) stageSelectOverlay.classList.add('hidden');
    emitPulse(pState.stage.pad.x, pState.stage.pad.y, 8, 44, pTheme.probe, 0.55, 2.0);
  }

  function updateTopBarLabel() {
    if (!stageSelectLabel || !pState) return;
    const st = pState.stage;
    const numStr = String(st.id).padStart(2, '0');
    const stars = savedStars[st.id] || 0;
    const starIcons = stars > 0 ? ' ' + '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
    stageSelectLabel.textContent = `STAGE ${numStr} · ${st.title}${starIcons}`;
  }

  function renderStageGrid() {
    if (!stageGridEl) return;
    stageGridEl.innerHTML = '';
    STAGES.forEach((st, idx) => {
      const btn = document.createElement('button');
      btn.className = 'stage-card' + (idx === currentStageIdx ? ' active-stage' : '');
      const stars = savedStars[st.id] || 0;
      let starRow = '';
      for (let s = 1; s <= 3; s++) {
        starRow += `<span class="stage-star ${s <= stars ? 'earned' : ''}">★</span>`;
      }
      btn.innerHTML = `
        <div class="stage-card-top">
          <span class="stage-num">${String(st.id).padStart(2, '0')}</span>
          <span class="stage-badge">${st.badge}</span>
        </div>
        <div class="stage-card-title">${st.title}</div>
        <div class="stage-card-desc">${st.subtitle}</div>
        <div class="stage-card-stars">${starRow}</div>
      `;
      btn.addEventListener('click', () => {
        Audio.init();
        Audio.playAimTick(0.6, 0);
        loadStage(idx);
      });
      stageGridEl.appendChild(btn);
    });
  }

  function openStageSelect() {
    if (!stageSelectOverlay) return;
    renderStageGrid();
    if (pState) {
      pState.drag = null;
      pState.pausedForModal = true;
    }
    stageSelectOverlay.classList.remove('hidden');
  }

  function closeStageSelect() {
    if (!stageSelectOverlay) return;
    stageSelectOverlay.classList.add('hidden');
    if (pState && (!stageClearOverlay || stageClearOverlay.classList.contains('hidden'))) {
      pState.pausedForModal = false;
    }
  }

  function triggerStageClear() {
    if (!pState || pState.cleared) return;
    pState.cleared = true;
    pState.drag = null;

    const stars = pState.shotsUsed <= 1 ? 3 : (pState.shotsUsed === 2 ? 2 : 1);
    saveStageStars(pState.stage.id, stars);
    updateTopBarLabel();

    Audio.playStageClear(stars);

    const fxX = pState.probe ? pState.probe.x : (pState.stage.goal ? pState.stage.goal.x : 0);
    const fxY = pState.probe ? pState.probe.y : (pState.stage.goal ? pState.stage.goal.y : 0);
    emitParticles(fxX, fxY, pTheme.goal, 24, 1.25);
    emitPulse(fxX, fxY, 10, 110, pTheme.goal, 0.85, 3.0);
    pState.probe = null;

    setTimeout(() => {
      if (!active || !pState || !pState.cleared) return;
      pState.pausedForModal = true;
      if (stageClearTitleEl) {
        stageClearTitleEl.textContent = `STAGE ${String(pState.stage.id).padStart(2, '0')} CLEAR`;
      }
      if (stageClearStarsEl) {
        let html = '';
        for (let s = 1; s <= 3; s++) {
          html += `<span class="clear-star ${s <= stars ? 'earned' : ''}">★</span>`;
        }
        stageClearStarsEl.innerHTML = html;
      }
      if (stageClearNextBtn) {
        stageClearNextBtn.textContent = currentStageIdx < STAGES.length - 1 ? 'NEXT STAGE →' : 'ALL STAGES ☰';
      }
      if (stageClearOverlay) {
        stageClearOverlay.classList.remove('hidden');
      }
    }, 560);
  }

  // =========================================================================
  // Slingshot Launch Calculation & Deterministic Preview
  // =========================================================================
  function computeLaunchShot(drag) {
    if (!drag || !pState) return null;
    const pullScreenDx = drag.startScreenX - drag.currScreenX;
    const pullScreenDy = drag.startScreenY - drag.currScreenY;
    const rawPullPx = Math.hypot(pullScreenDx, pullScreenDy);
    if (rawPullPx < 10) return null;

    // Shorter full-power pull on small phone screens so the finger never runs off-screen
    const maxPullPx = Math.max(150, Math.min(235, Math.min(viewW, viewH) * 0.46));
    const clampedPx = Math.min(maxPullPx, rawPullPx);
    const norm = (clampedPx - 10) / (maxPullPx - 10);
    const curvedNorm = Math.pow(norm, 1.08);
    const speed = 95 + curvedNorm * 325; // 95 .. 420 world units/s

    const worldDir = screenDirToWorld(pullScreenDx / rawPullPx, pullScreenDy / rawPullPx);
    const ux = worldDir.x;
    const uy = worldDir.y;

    return {
      x: pState.stage.pad.x,
      y: pState.stage.pad.y,
      vx: ux * speed,
      vy: uy * speed,
      speed,
      powerNorm: norm,
      pullWorldX: pState.stage.pad.x - ux * (clampedPx / cam.scale),
      pullWorldY: pState.stage.pad.y - uy * (clampedPx / cam.scale)
    };
  }

  /**
   * Exact lockstep trajectory preview matching fixed-timestep simulation 100%!
   */
  function predictPuzzleTrajectory(shot) {
    const st = pState.stage;
    const points = [];
    const swingBys = [];
    const warpJumps = [];
    const hitTargetIndices = new Set();
    let willClearGoal = false;
    let crashPoint = null;

    let x = shot.x;
    let y = shot.y;
    let vx = shot.vx;
    let vy = shot.vy;
    let t = pState.stageTime;
    let warpCd = 0;

    const simDestroyed = pState.destroyedTargets.slice();
    let remainingTargets = 0;
    for (let k = 0; k < simDestroyed.length; k++) {
      if (!simDestroyed[k]) remainingTargets++;
    }

    const prevRadDots = new Map();
    points.push({ x, y, breakSegment: false });

    const outBoundW = st.spanW * 0.68 + 180;
    const outBoundH = st.spanH * 0.68 + 180;

    for (let step = 1; step <= PREVIEW_STEPS; step++) {
      const a1 = computeStageAccel(x, y, st, t);
      const nx = x + vx * FIXED_DT + 0.5 * a1.ax * FIXED_DT * FIXED_DT;
      const ny = y + vy * FIXED_DT + 0.5 * a1.ay * FIXED_DT * FIXED_DT;
      const tNext = t + FIXED_DT;
      const a2 = computeStageAccel(nx, ny, st, tNext);
      let nvx = vx + 0.5 * (a1.ax + a2.ax) * FIXED_DT;
      let nvy = vy + 0.5 * (a1.ay + a2.ay) * FIXED_DT;
      if (warpCd > 0) warpCd -= FIXED_DT;

      // 1. Star / Planet surface crash
      let crashed = false;
      for (let i = 0; i < st.bodies.length; i++) {
        const b = st.bodies[i];
        const bPos = evalOrbitalPos(b, tNext);
        if (distToSegmentSq(bPos.x, bPos.y, x, y, nx, ny) <= (b.r + 2) * (b.r + 2)) {
          crashPoint = { x: nx, y: ny };
          crashed = true;
          break;
        }
        const dx = nx - bPos.x;
        const dy = ny - bPos.y;
        const dist = Math.hypot(dx, dy);
        const radDot = dx * nvx + dy * nvy;
        const prevDot = prevRadDots.get(i);
        if (prevDot !== undefined && prevDot < 0 && radDot >= 0) {
          const speed = Math.hypot(nvx, nvy);
          if (dist < b.r * 3.4 && speed > 165 && swingBys.length < 5) {
            swingBys.push({ x: nx, y: ny });
          }
        }
        prevRadDots.set(i, radDot);
      }
      if (crashed) {
        points.push({ x: nx, y: ny, breakSegment: false });
        break;
      }

      // 2. Red Debris crash
      for (let i = 0; i < st.debris.length; i++) {
        const d = st.debris[i];
        const dPos = evalOrbitalPos(d, tNext);
        if (distToSegmentSq(dPos.x, dPos.y, x, y, nx, ny) <= (d.r + 4) * (d.r + 4)) {
          crashPoint = { x: nx, y: ny };
          crashed = true;
          break;
        }
      }
      if (crashed) {
        points.push({ x: nx, y: ny, breakSegment: false });
        break;
      }

      // 3. Destructible Target Obstacles
      for (let k = 0; k < st.targets.length; k++) {
        if (simDestroyed[k]) continue;
        const tg = st.targets[k];
        const tPos = evalOrbitalPos(tg, tNext);
        if (distToSegmentSq(tPos.x, tPos.y, x, y, nx, ny) <= (tg.r + 6) * (tg.r + 6)) {
          simDestroyed[k] = true;
          remainingTargets--;
          hitTargetIndices.add(k);
          nvx *= 0.95;
          nvy *= 0.95;
        }
      }

      if (st.mode === 'destroy' && remainingTargets === 0) {
        points.push({ x: nx, y: ny, breakSegment: false });
        willClearGoal = true;
        break;
      }

      // 4. Goal Portal
      if (st.goal && (st.mode === 'goal' || (st.mode === 'both' && remainingTargets === 0))) {
        if (distToSegmentSq(st.goal.x, st.goal.y, x, y, nx, ny) <= (st.goal.r + 5) * (st.goal.r + 5)) {
          points.push({ x: nx, y: ny, breakSegment: false });
          willClearGoal = true;
          break;
        }
      }

      // 5. Warp Holes
      let warped = false;
      let finalX = nx;
      let finalY = ny;
      if (warpCd <= 0) {
        for (let wIdx = 0; wIdx < st.warps.length; wIdx++) {
          const w = st.warps[wIdx];
          if (distToSegmentSq(w.x1, w.y1, x, y, nx, ny) <= (w.r + 2) * (w.r + 2)) {
            points.push({ x: w.x1, y: w.y1, breakSegment: false });
            const spd = Math.hypot(nvx, nvy);
            finalX = w.x2 + (spd > 1 ? (nvx / spd) * w.r * 0.45 : 0);
            finalY = w.y2 + (spd > 1 ? (nvy / spd) * w.r * 0.45 : 0);
            warpCd = 0.28;
            warped = true;
            warpJumps.push({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, pairIndex: w.pairIndex || 0 });
            break;
          } else if (distToSegmentSq(w.x2, w.y2, x, y, nx, ny) <= (w.r + 2) * (w.r + 2)) {
            points.push({ x: w.x2, y: w.y2, breakSegment: false });
            const spd = Math.hypot(nvx, nvy);
            finalX = w.x1 + (spd > 1 ? (nvx / spd) * w.r * 0.45 : 0);
            finalY = w.y1 + (spd > 1 ? (nvy / spd) * w.r * 0.45 : 0);
            warpCd = 0.28;
            warped = true;
            warpJumps.push({ x1: w.x2, y1: w.y2, x2: w.x1, y2: w.y1, pairIndex: w.pairIndex || 0 });
            break;
          }
        }
      }

      x = finalX;
      y = finalY;
      vx = nvx;
      vy = nvy;
      t = tNext;

      points.push({ x, y, breakSegment: warped });

      if (Math.abs(x) > outBoundW || Math.abs(y) > outBoundH) {
        break;
      }
    }

    return {
      points,
      swingBys,
      warpJumps,
      hitTargetIndices,
      willClearGoal,
      crashPoint
    };
  }

  // =========================================================================
  // Fixed-Timestep Simulation
  // =========================================================================
  function onProbeLost(fxX, fxY, playCrashSound) {
    if (playCrashSound) {
      Audio.playCollision(worldXToPan(fxX, fxY), false);
      cam.shake = Math.max(cam.shake, 6.0);
      emitParticles(fxX, fxY, pTheme.debris, 14, 0.95);
      emitPulse(fxX, fxY, 5, 40, pTheme.debris, 0.5, 2.2);
    } else {
      Audio.playScuttle(worldXToPan(fxX, fxY));
      emitPulse(fxX, fxY, 4, 28, pTheme.probe, 0.4, 1.6);
    }

    pState.probe = null;
    if (pState.probesLeft > 0) {
      pState.readyDelay = 0.28;
    } else {
      pState.autoResetTimer = 0.72;
    }
  }

  function stepFixedSimulation() {
    const st = pState.stage;
    const t = pState.stageTime;
    const tNext = t + FIXED_DT;

    if (!pState.probe) {
      pState.stageTime = tNext;
      return;
    }

    const pr = pState.probe;
    pr.flightTime += FIXED_DT;
    if (pr.warpCd > 0) pr.warpCd -= FIXED_DT;
    if (pr.swingByCd > 0) pr.swingByCd -= FIXED_DT;

    const a1 = computeStageAccel(pr.x, pr.y, st, t);
    const nx = pr.x + pr.vx * FIXED_DT + 0.5 * a1.ax * FIXED_DT * FIXED_DT;
    const ny = pr.y + pr.vy * FIXED_DT + 0.5 * a1.ay * FIXED_DT * FIXED_DT;
    const a2 = computeStageAccel(nx, ny, st, tNext);
    let nvx = pr.vx + 0.5 * (a1.ax + a2.ax) * FIXED_DT;
    let nvy = pr.vy + 0.5 * (a1.ay + a2.ay) * FIXED_DT;

    pState.stageTime = tNext;

    // 1. Star / Planet surface impact
    for (let i = 0; i < st.bodies.length; i++) {
      const b = st.bodies[i];
      const bPos = evalOrbitalPos(b, tNext);
      if (distToSegmentSq(bPos.x, bPos.y, pr.x, pr.y, nx, ny) <= (b.r + 2) * (b.r + 2)) {
        onProbeLost(nx, ny, true);
        return;
      }

      // Close periapsis swing-by arpeggio!
      const dx = nx - bPos.x;
      const dy = ny - bPos.y;
      const dist = Math.hypot(dx, dy);
      const radDot = dx * nvx + dy * nvy;
      const prevDot = pr.prevRadDots.get(i);
      if (prevDot !== undefined && prevDot < 0 && radDot >= 0 && pr.flightTime > 0.18) {
        const speed = Math.hypot(nvx, nvy);
        if (dist < b.r * 3.4 && speed > 165 && pr.swingByCd <= 0) {
          const closeness = 1 - Math.min(1, Math.max(0, dist - b.r) / (b.r * 2.4));
          Audio.playSwingByArpeggio(0.5 + closeness * 0.5, worldXToPan(nx, ny));
          emitPulse(nx, ny, 6, 38 + closeness * 20, pTheme.probe, 0.55, 1.9);
          emitParticles(nx, ny, pTheme.probe, 7, 0.75);
          pr.swingByCd = 0.65;
        }
      }
      pr.prevRadDots.set(i, radDot);
    }

    // 2. Red Debris impact
    for (let i = 0; i < st.debris.length; i++) {
      const d = st.debris[i];
      const dPos = evalOrbitalPos(d, tNext);
      if (distToSegmentSq(dPos.x, dPos.y, pr.x, pr.y, nx, ny) <= (d.r + 4) * (d.r + 4)) {
        onProbeLost(nx, ny, true);
        return;
      }
    }

    // 3. Destructible Target Obstacles
    for (let k = 0; k < st.targets.length; k++) {
      if (pState.destroyedTargets[k]) continue;
      const tg = st.targets[k];
      const tPos = evalOrbitalPos(tg, tNext);
      if (distToSegmentSq(tPos.x, tPos.y, pr.x, pr.y, nx, ny) <= (tg.r + 6) * (tg.r + 6)) {
        pState.destroyedTargets[k] = true;
        pState.targetFlash[k] = 1.0;
        Audio.playTargetShatter(pr.comboCount, worldXToPan(tPos.x, tPos.y));
        pr.comboCount++;
        cam.shake = Math.max(cam.shake, 4.2);
        emitParticles(tPos.x, tPos.y, pTheme.target, 16, 1.05);
        emitParticles(tPos.x, tPos.y, pTheme.targetCore, 8, 0.75);
        emitPulse(tPos.x, tPos.y, 8, 52, pTheme.target, 0.6, 2.4);
        nvx *= 0.95;
        nvy *= 0.95;

        const allDone = pState.destroyedTargets.every(Boolean);
        if (allDone && st.mode === 'both' && st.goal) {
          pState.goalUnlockFlash = 1.0;
          emitPulse(st.goal.x, st.goal.y, st.goal.r * 0.8, st.goal.r * 2.8, pTheme.goal, 0.75, 2.6);
        }
      }
    }

    const allTargetsCleared = pState.destroyedTargets.every(Boolean);
    if (st.mode === 'destroy' && allTargetsCleared) {
      pr.x = nx;
      pr.y = ny;
      triggerStageClear();
      return;
    }

    // 4. Goal Portal capture
    if (st.goal && (st.mode === 'goal' || (st.mode === 'both' && allTargetsCleared))) {
      if (distToSegmentSq(st.goal.x, st.goal.y, pr.x, pr.y, nx, ny) <= (st.goal.r + 5) * (st.goal.r + 5)) {
        pr.x = st.goal.x;
        pr.y = st.goal.y;
        triggerStageClear();
        return;
      }
    }

    // 5. Warp Holes
    let warped = false;
    let finalX = nx;
    let finalY = ny;
    if (pr.warpCd <= 0) {
      for (let wIdx = 0; wIdx < st.warps.length; wIdx++) {
        const w = st.warps[wIdx];
        const warpCol = pTheme.warpPairs[(w.pairIndex || 0) % pTheme.warpPairs.length];
        if (distToSegmentSq(w.x1, w.y1, pr.x, pr.y, nx, ny) <= (w.r + 2) * (w.r + 2)) {
          const spd = Math.hypot(nvx, nvy);
          finalX = w.x2 + (spd > 1 ? (nvx / spd) * w.r * 0.45 : 0);
          finalY = w.y2 + (spd > 1 ? (nvy / spd) * w.r * 0.45 : 0);
          pr.warpCd = 0.28;
          warped = true;
          Audio.playWormhole(worldXToPan(w.x2, w.y2));
          emitPulse(w.x1, w.y1, 6, 40, warpCol, 0.5, 2.2);
          emitPulse(w.x2, w.y2, 6, 46, warpCol, 0.55, 2.4);
          emitParticles(w.x2, w.y2, warpCol, 10, 0.85);
          break;
        } else if (distToSegmentSq(w.x2, w.y2, pr.x, pr.y, nx, ny) <= (w.r + 2) * (w.r + 2)) {
          const spd = Math.hypot(nvx, nvy);
          finalX = w.x1 + (spd > 1 ? (nvx / spd) * w.r * 0.45 : 0);
          finalY = w.y1 + (spd > 1 ? (nvy / spd) * w.r * 0.45 : 0);
          pr.warpCd = 0.28;
          warped = true;
          Audio.playWormhole(worldXToPan(w.x1, w.y1));
          emitPulse(w.x2, w.y2, 6, 40, warpCol, 0.5, 2.2);
          emitPulse(w.x1, w.y1, 6, 46, warpCol, 0.55, 2.4);
          emitParticles(w.x1, w.y1, warpCol, 10, 0.85);
          break;
        }
      }
    }

    pr.x = finalX;
    pr.y = finalY;
    pr.vx = nvx;
    pr.vy = nvy;
    pr.trail.push({ x: pr.x, y: pr.y, breakSegment: warped });
    if (pr.trail.length > 64) pr.trail.shift();

    const outBoundW = st.spanW * 0.68 + 180;
    const outBoundH = st.spanH * 0.68 + 180;
    if (Math.abs(pr.x) > outBoundW || Math.abs(pr.y) > outBoundH || pr.flightTime >= MAX_FLIGHT_TIME) {
      onProbeLost(pr.x, pr.y, false);
    }
  }

  function updateEffects(rawDt) {
    if (cam.shake > 0) {
      cam.shake = Math.max(0, cam.shake - rawDt * 28);
    }
    if (pState.goalUnlockFlash > 0) {
      pState.goalUnlockFlash = Math.max(0, pState.goalUnlockFlash - rawDt * 1.8);
    }
    for (let i = pState.particles.length - 1; i >= 0; i--) {
      const p = pState.particles[i];
      p.life += rawDt;
      if (p.life >= p.maxLife) {
        pState.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * rawDt;
      p.y += p.vy * rawDt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    for (let i = pState.pulses.length - 1; i >= 0; i--) {
      const pl = pState.pulses[i];
      pl.life += rawDt;
      if (pl.life >= pl.maxLife) {
        pState.pulses.splice(i, 1);
      }
    }
  }

  function update(rawDt) {
    if (!active || !pState) return;
    updateEffects(rawDt);

    if (pState.pausedForModal || pState.cleared) return;

    if (pState.readyDelay > 0) {
      pState.readyDelay = Math.max(0, pState.readyDelay - rawDt);
    }

    if (pState.autoResetTimer > 0) {
      pState.autoResetTimer -= rawDt;
      if (pState.autoResetTimer <= 0) {
        loadStage(currentStageIdx);
        return;
      }
    }

    pState.accumulator = Math.min(0.12, pState.accumulator + rawDt);
    while (pState.accumulator >= FIXED_DT) {
      pState.accumulator -= FIXED_DT;
      stepFixedSimulation();
      if (!pState || pState.cleared) break;
    }
  }

  // =========================================================================
  // Rendering (Zero Text / Zero Digits on Canvas!)
  // =========================================================================
  function drawProbeShape(ctx, x, y, angle, color, radius) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(radius * 1.38, 0);
    ctx.lineTo(-radius * 0.95, radius * 0.92);
    ctx.lineTo(-radius * 0.5, 0);
    ctx.lineTo(-radius * 0.95, -radius * 0.92);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawGrid(ctx) {
    const stepWorld = 80;
    const stepPx = stepWorld * cam.scale;
    if (stepPx < 16) return;

    ctx.strokeStyle = pTheme.grid;
    ctx.lineWidth = 1;
    const offX = ((cam.screenCX % stepPx) + stepPx) % stepPx;
    const offY = ((cam.screenCY % stepPx) + stepPx) % stepPx;

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

  function drawOrbitTracks(ctx, st) {
    ctx.save();
    ctx.strokeStyle = pTheme.orbitGuide;
    ctx.lineWidth = 1.1 / cam.scale;
    ctx.setLineDash([4 / cam.scale, 6 / cam.scale]);

    const drawnRings = new Set();
    const addRing = (cx, cy, r) => {
      if (!r || r <= 0) return;
      const key = `${cx}_${cy}_${r}`;
      if (drawnRings.has(key)) return;
      drawnRings.add(key);
      ctx.beginPath();
      ctx.arc(cx || 0, cy || 0, r, 0, Math.PI * 2);
      ctx.stroke();
    };

    for (const b of st.bodies) addRing(b.cx || 0, b.cy || 0, b.orbitR);
    for (const d of st.debris) addRing(d.cx || 0, d.cy || 0, d.orbitR);
    for (const tg of st.targets) addRing(tg.cx || 0, tg.cy || 0, tg.orbitR);

    ctx.restore();
  }

  function drawBodies(ctx, st, nowSec) {
    for (let i = 0; i < st.bodies.length; i++) {
      const b = st.bodies[i];
      const pos = evalOrbitalPos(b, pState.stageTime);
      const isStar = b.kind === 'star' || b.kind === 'star2';
      const fill = b.kind === 'star'
        ? pTheme.starCore
        : (b.kind === 'star2' ? pTheme.star2Core : (b.kind === 'moon' ? pTheme.moonCore : pTheme.planetCore));

      const gRad = b.visualR || b.r * 5.5;
      const glow = isStar ? pTheme.starGlow : pTheme.planetGlow;
      const grad = ctx.createRadialGradient(pos.x, pos.y, b.r * 0.7, pos.x, pos.y, gRad);
      grad.addColorStop(0, glow[0]);
      grad.addColorStop(1, glow[1]);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, gRad, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = pTheme.fgFaint;
      ctx.lineWidth = 1 / cam.scale;
      for (const frac of [0.42, 0.78]) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, b.r + (gRad - b.r) * frac, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (isStar) {
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(nowSec * 0.12);
        ctx.strokeStyle = fill;
        ctx.globalAlpha = 0.48;
        ctx.lineWidth = 1.6 / cam.scale;
        for (let k = 0; k < 8; k++) {
          const a = (Math.PI / 4) * k;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * (b.r + 4), Math.sin(a) * (b.r + 4));
          ctx.lineTo(Math.cos(a) * (b.r + 10), Math.sin(a) * (b.r + 10));
          ctx.stroke();
        }
        ctx.restore();
      } else {
        // Subtle planetary ring accent
        ctx.save();
        ctx.strokeStyle = fill;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1.4 / cam.scale;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, b.r + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWarpHoles(ctx, st, nowSec) {
    for (let i = 0; i < st.warps.length; i++) {
      const w = st.warps[i];
      const col = pTheme.warpPairs[(w.pairIndex || 0) % pTheme.warpPairs.length];

      // Faint subspace link line between paired portals
      ctx.save();
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1.3 / cam.scale;
      ctx.setLineDash([5 / cam.scale, 6 / cam.scale]);
      ctx.lineDashOffset = -(nowSec * 18) / cam.scale;
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
      ctx.restore();

      const portals = [
        { x: w.x1, y: w.y1, dir: 1 },
        { x: w.x2, y: w.y2, dir: -1 }
      ];
      for (const pt of portals) {
        ctx.save();
        ctx.translate(pt.x, pt.y);

        const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, w.r * 1.45);
        grad.addColorStop(0, col);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, w.r * 1.45, 0, Math.PI * 2);
        ctx.fill();

        ctx.rotate(nowSec * 1.6 * pt.dir);
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.88;
        ctx.lineWidth = 2.2 / cam.scale;
        ctx.setLineDash([8 / cam.scale, 5 / cam.scale]);
        ctx.beginPath();
        ctx.arc(0, 0, w.r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.rotate(-nowSec * 2.8 * pt.dir);
        ctx.globalAlpha = 0.65;
        ctx.lineWidth = 1.5 / cam.scale;
        ctx.setLineDash([4 / cam.scale, 4 / cam.scale]);
        ctx.beginPath();
        ctx.arc(0, 0, w.r * 0.56, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
      }
    }
  }

  function drawDebris(ctx, st, nowSec) {
    for (let i = 0; i < st.debris.length; i++) {
      const d = st.debris[i];
      const pos = evalOrbitalPos(d, pState.stageTime);

      ctx.save();
      ctx.translate(pos.x, pos.y);

      ctx.strokeStyle = pTheme.debris;
      ctx.globalAlpha = 0.24;
      ctx.lineWidth = 1.1 / cam.scale;
      ctx.beginPath();
      ctx.arc(0, 0, d.r + 3.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.rotate(nowSec * (i % 2 === 0 ? 1.1 : -1.1) + i * 0.7);
      ctx.fillStyle = pTheme.debris;
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      const spikes = 6;
      for (let k = 0; k < spikes * 2; k++) {
        const rad = k % 2 === 0 ? d.r : d.r * 0.52;
        const ang = (k * Math.PI) / spikes;
        const px = Math.cos(ang) * rad;
        const py = Math.sin(ang) * rad;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawTargetsAndGoal(ctx, st, nowSec, activePred) {
    const aimPulse = Math.sin(nowSec * 9.0) * 0.5 + 0.5;
    const allTargetsCleared = pState.destroyedTargets.every(Boolean);

    // Draw faint seal tether lines from alive targets to locked goal in 'both' mode
    if (st.mode === 'both' && st.goal && !allTargetsCleared) {
      ctx.save();
      ctx.strokeStyle = pTheme.goalLocked;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1.2 / cam.scale;
      ctx.setLineDash([4 / cam.scale, 6 / cam.scale]);
      for (let k = 0; k < st.targets.length; k++) {
        if (pState.destroyedTargets[k]) continue;
        const tPos = evalOrbitalPos(st.targets[k], pState.stageTime);
        ctx.beginPath();
        ctx.moveTo(tPos.x, tPos.y);
        ctx.lineTo(st.goal.x, st.goal.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Draw Destructible Crystalline Target Obstacles
    for (let k = 0; k < st.targets.length; k++) {
      if (pState.destroyedTargets[k]) continue;
      const tg = st.targets[k];
      const pos = evalOrbitalPos(tg, pState.stageTime);
      const isAimHit = activePred && activePred.hitTargetIndices.has(k);

      ctx.save();
      ctx.translate(pos.x, pos.y);

      if (isAimHit) {
        ctx.strokeStyle = pTheme.target;
        ctx.globalAlpha = 0.55 + aimPulse * 0.42;
        ctx.lineWidth = 2.3 / cam.scale;
        ctx.beginPath();
        ctx.arc(0, 0, tg.r + 8 + aimPulse * 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.rotate(nowSec * 0.65 + k);
      ctx.strokeStyle = pTheme.target;
      ctx.fillStyle = pTheme.target;
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      for (let s = 0; s < 6; s++) {
        const a = (s * Math.PI) / 3;
        const hx = Math.cos(a) * tg.r;
        const hy = Math.sin(a) * tg.r;
        if (s === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.92;
      ctx.lineWidth = 2.2 / cam.scale;
      ctx.stroke();

      // Inner coral diamond core
      ctx.rotate(-nowSec * 1.3);
      ctx.fillStyle = pTheme.targetCore;
      ctx.globalAlpha = 0.92;
      const cr = tg.r * 0.46;
      ctx.beginPath();
      ctx.moveTo(0, -cr);
      ctx.lineTo(cr, 0);
      ctx.lineTo(0, cr);
      ctx.lineTo(-cr, 0);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    // Draw Goal Portal Beacon
    if (st.goal) {
      const g = st.goal;
      const isLocked = st.mode === 'both' && !allTargetsCleared;
      const col = isLocked ? pTheme.goalLocked : pTheme.goal;
      const isGoalHit = activePred && activePred.willClearGoal;
      const beat = Math.sin(nowSec * 4.2) * 0.5 + 0.5;

      ctx.save();
      ctx.translate(g.x, g.y);

      const grad = ctx.createRadialGradient(0, 0, 3, 0, 0, g.r * 1.65);
      grad.addColorStop(0, col);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = isLocked ? 0.14 : 0.26 + beat * 0.1;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, g.r * 1.65, 0, Math.PI * 2);
      ctx.fill();

      if (isGoalHit) {
        ctx.strokeStyle = pTheme.goal;
        ctx.globalAlpha = 0.65 + aimPulse * 0.35;
        ctx.lineWidth = 2.6 / cam.scale;
        ctx.beginPath();
        ctx.arc(0, 0, g.r + 10 + aimPulse * 3.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (isLocked) {
        // Hexagonal seal cage around Goal
        ctx.rotate(-nowSec * 0.35);
        ctx.strokeStyle = pTheme.goalLocked;
        ctx.globalAlpha = 0.78;
        ctx.lineWidth = 2.0 / cam.scale;
        ctx.setLineDash([6 / cam.scale, 4 / cam.scale]);
        ctx.beginPath();
        for (let s = 0; s < 6; s++) {
          const a = (s * Math.PI) / 3;
          const hx = Math.cos(a) * (g.r + 5);
          const hy = Math.sin(a) * (g.r + 5);
          if (s === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // Open luminous Goal Portal ring
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.92;
        ctx.lineWidth = 2.8 / cam.scale;
        ctx.beginPath();
        ctx.arc(0, 0, g.r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.rotate(nowSec * 0.9);
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.4 / cam.scale;
        ctx.setLineDash([7 / cam.scale, 5 / cam.scale]);
        ctx.beginPath();
        ctx.arc(0, 0, g.r * 0.68, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Inner 4-point beacon star
      ctx.rotate(nowSec * 0.6);
      ctx.fillStyle = col;
      ctx.globalAlpha = isLocked ? 0.45 : 0.92;
      const sr = g.r * 0.42;
      const ir = sr * 0.34;
      ctx.beginPath();
      for (let p = 0; p < 8; p++) {
        const rad = p % 2 === 0 ? sr : ir;
        const a = (p * Math.PI) / 4;
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }

  function drawLaunchPadAndProbe(ctx, st, nowSec, activeShot, activePred) {
    const pad = st.pad;

    // Launch Pad Compass Dock
    ctx.save();
    ctx.translate(pad.x, pad.y);
    ctx.strokeStyle = pTheme.probe;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.4 / cam.scale;
    ctx.setLineDash([5 / cam.scale, 4 / cam.scale]);
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = 0.72;
    ctx.lineWidth = 1.8 / cam.scale;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Slingshot Drag Band & Deterministic Trajectory Preview
    if (activeShot && activePred && !pState.probe) {
      ctx.save();
      ctx.strokeStyle = pTheme.fgSoft;
      ctx.lineWidth = 1.7 / cam.scale;
      ctx.setLineDash([4 / cam.scale, 4 / cam.scale]);
      ctx.beginPath();
      ctx.moveTo(pad.x, pad.y);
      ctx.lineTo(activeShot.pullWorldX, activeShot.pullWorldY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = pTheme.probe;
      ctx.beginPath();
      ctx.arc(activeShot.pullWorldX, activeShot.pullWorldY, 5 / cam.scale, 0, Math.PI * 2);
      ctx.fill();

      const pts = activePred.points;
      for (let i = 2; i < pts.length; i += 2) {
        if (pts[i].breakSegment || pts[i - 1].breakSegment) continue;
        const alpha = (1 - i / (pts.length + 25)) * 0.9;
        ctx.fillStyle = activePred.willClearGoal ? pTheme.goal : pTheme.probe;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, 2.3 / cam.scale, 0, Math.PI * 2);
        ctx.fill();
      }

      // Swing-by preview rings
      ctx.strokeStyle = pTheme.probe;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1.5 / cam.scale;
      for (const sb of activePred.swingBys) {
        ctx.beginPath();
        ctx.arc(sb.x, sb.y, 7 / cam.scale, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Crash `×` marker if trajectory hits a star, planet, or red debris
      if (activePred.crashPoint) {
        const r = 6.5 / cam.scale;
        ctx.strokeStyle = pTheme.debris;
        ctx.globalAlpha = 0.95;
        ctx.lineWidth = 2.4 / cam.scale;
        ctx.beginPath();
        ctx.moveTo(activePred.crashPoint.x - r, activePred.crashPoint.y - r);
        ctx.lineTo(activePred.crashPoint.x + r, activePred.crashPoint.y + r);
        ctx.moveTo(activePred.crashPoint.x + r, activePred.crashPoint.y - r);
        ctx.lineTo(activePred.crashPoint.x - r, activePred.crashPoint.y + r);
        ctx.stroke();
      }

      ctx.restore();
    }

    // Idle probe ready on Launch Pad
    if (!pState.probe && !pState.cleared && pState.probesLeft > 0 && pState.readyDelay <= 0) {
      const aimAng = activeShot ? Math.atan2(activeShot.vy, activeShot.vx) : -Math.PI * 0.25;
      drawProbeShape(ctx, pad.x, pad.y, aimAng, pTheme.probe, 7.6);

      // Gentle gesture hint before first shot on Stage 1
      if (!activeShot && pState.shotsUsed === 0 && st.id === 1) {
        const cyc = (nowSec * 0.75) % 1;
        const alpha = cyc < 0.75 ? Math.sin((cyc / 0.75) * Math.PI) * 0.55 : 0;
        if (alpha > 0.02) {
          const ease = Math.min(1, cyc / 0.7);
          const hx = pad.x - ease * 82;
          const hy = pad.y + ease * 10;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = pTheme.probe;
          ctx.lineWidth = 1.8 / cam.scale;
          ctx.setLineDash([4 / cam.scale, 4 / cam.scale]);
          ctx.beginPath();
          ctx.moveTo(pad.x, pad.y);
          ctx.lineTo(hx, hy);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(hx, hy, 8 / cam.scale, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Active Flying Probe & Ribbon Trail
    if (pState.probe) {
      const pr = pState.probe;
      if (pr.trail.length > 1) {
        for (let i = 1; i < pr.trail.length; i++) {
          const p0 = pr.trail[i - 1];
          const p1 = pr.trail[i];
          if (p1.breakSegment) continue;
          const frac = i / pr.trail.length;
          ctx.strokeStyle = pTheme.probe;
          ctx.globalAlpha = frac * frac * 0.78;
          ctx.lineWidth = (1.1 + frac * 2.8) / cam.scale;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      drawProbeShape(ctx, pr.x, pr.y, Math.atan2(pr.vy, pr.vx), pTheme.probe, 7.8);
    }
  }

  function drawPulsesAndParticles(ctx) {
    for (const pl of pState.pulses) {
      const t = pl.life / pl.maxLife;
      const ease = 1 - Math.pow(1 - t, 3);
      const r = pl.startR + (pl.endR - pl.startR) * ease;
      ctx.save();
      ctx.strokeStyle = pl.color;
      ctx.globalAlpha = (1 - t) * 0.78;
      ctx.lineWidth = pl.lineWidth / cam.scale;
      ctx.beginPath();
      ctx.arc(pl.x, pl.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    for (const p of pState.particles) {
      const t = p.life / p.maxLife;
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 1 - t;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ((p.size * (1 - t * 0.5)) / cam.scale) * 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPuzzleScreenHUD(ctx) {
    hudButtons = [];
    // Compact (phone) layout: buttons sit on the bottom dock row so the top bar stays clear
    const compactHud = viewW <= 600 || cam.rotated;
    const topY = compactHud ? viewH - safeInsets.bottom - 34 : safeInsets.top + 28;
    let rightX = viewW - safeInsets.right - 28;
    const btnDir = compactHud ? 1 : -1;
    const leftEdge = safeInsets.left + 28;

    const drawBtnFrame = (x, y, r) => {
      ctx.save();
      ctx.strokeStyle = pTheme.fgFaint;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };

    // 1. Help '?' Button
    const helpBtn = {
      x: rightX,
      y: topY,
      r: 15,
      onClick: () => {
        if (helpOverlayEl) helpOverlayEl.classList.remove('hidden');
      }
    };
    hudButtons.push(helpBtn);
    drawBtnFrame(helpBtn.x, helpBtn.y, helpBtn.r);
    ctx.save();
    ctx.strokeStyle = pTheme.fgSoft;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.arc(helpBtn.x, helpBtn.y - 2.5, 4, Math.PI * 1.1, Math.PI * 0.25, false);
    ctx.lineTo(helpBtn.x, helpBtn.y + 3);
    ctx.stroke();
    ctx.fillStyle = pTheme.fgSoft;
    ctx.beginPath();
    ctx.arc(helpBtn.x, helpBtn.y + 6.8, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Audio Mute Button
    rightX -= 40;
    if (compactHud) rightX = leftEdge + 40;
    const audioBtn = {
      x: rightX,
      y: topY,
      r: 15,
      onClick: () => Audio.toggleMute()
    };
    hudButtons.push(audioBtn);
    drawBtnFrame(audioBtn.x, audioBtn.y, audioBtn.r);
    ctx.save();
    ctx.strokeStyle = pTheme.fgSoft;
    ctx.fillStyle = pTheme.fgSoft;
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
      ctx.strokeStyle = pTheme.debris;
      ctx.beginPath();
      ctx.moveTo(audioBtn.x + 4, audioBtn.y - 4);
      ctx.lineTo(audioBtn.x + 9, audioBtn.y + 4);
      ctx.moveTo(audioBtn.x + 9, audioBtn.y - 4);
      ctx.lineTo(audioBtn.x + 4, audioBtn.y + 4);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Theme Toggle Button
    rightX = compactHud ? leftEdge : rightX - 40;
    const themeBtn = {
      x: rightX,
      y: topY,
      r: 15,
      onClick: () => {
        if (onThemeToggleCallback) onThemeToggleCallback();
      }
    };
    hudButtons.push(themeBtn);
    drawBtnFrame(themeBtn.x, themeBtn.y, themeBtn.r);
    ctx.save();
    ctx.strokeStyle = pTheme.fgSoft;
    ctx.fillStyle = pTheme.fgSoft;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(themeBtn.x, themeBtn.y, 6.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(themeBtn.x, themeBtn.y, 6.5, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.fill();
    ctx.restore();

    // 4. Bottom Dock: Remaining Probe Pips (Geometric Triangles ▲ ▲ ▲) & Target Progress Diamonds
    const dockY = viewH - safeInsets.bottom - 34;
    const pipGap = 32;
    const startX = viewW * 0.5 - ((MAX_PROBES_PER_TRY - 1) * pipGap) * 0.5;

    for (let i = 0; i < MAX_PROBES_PER_TRY; i++) {
      const px = startX + i * pipGap;
      const isAvail = i < pState.probesLeft;
      ctx.save();
      ctx.strokeStyle = isAvail ? pTheme.probe : pTheme.fgFaint;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(px, dockY, 11.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = isAvail ? 0.95 : 0.2;
      drawProbeShape(ctx, px, dockY, -Math.PI * 0.5, pTheme.probe, 5.8);
      ctx.restore();
    }

    // Target pips above probe row if stage has destructible obstacles
    const tCount = pState.stage.targets.length;
    if (tCount > 0) {
      const tY = dockY - 30;
      const tGap = 20;
      const tStartX = viewW * 0.5 - ((tCount - 1) * tGap) * 0.5;
      for (let k = 0; k < tCount; k++) {
        const tx = tStartX + k * tGap;
        const done = pState.destroyedTargets[k];
        ctx.save();
        ctx.translate(tx, tY);
        ctx.strokeStyle = done ? pTheme.goal : pTheme.target;
        ctx.fillStyle = done ? pTheme.goal : pTheme.target;
        ctx.lineWidth = 1.6;
        ctx.globalAlpha = done ? 0.9 : 0.65;
        const r = 5.2;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r, 0);
        ctx.lineTo(0, r);
        ctx.lineTo(-r, 0);
        ctx.closePath();
        if (done) ctx.fill();
        else ctx.stroke();
        ctx.restore();
      }
    }
  }

  function render(ctx) {
    if (!active || !pState) return;
    const nowSec = performance.now() * 0.001;
    const st = pState.stage;

    let activeShot = null;
    let activePred = null;
    if (pState.drag && !pState.probe && pState.probesLeft > 0 && pState.readyDelay <= 0) {
      activeShot = computeLaunchShot(pState.drag);
      if (activeShot) {
        activePred = predictPuzzleTrajectory(activeShot);
      }
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = pTheme.bg;
    ctx.fillRect(0, 0, viewW, viewH);

    drawGrid(ctx);

    ctx.save();
    const shakeX = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake : 0;
    const shakeY = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake : 0;
    ctx.translate(cam.screenCX + shakeX, cam.screenCY + shakeY);
    ctx.scale(cam.scale, cam.scale);
    if (cam.rotated) ctx.rotate(-Math.PI * 0.5);
    ctx.translate(-cam.x, -cam.y);

    drawOrbitTracks(ctx, st);
    drawWarpHoles(ctx, st, nowSec);
    drawBodies(ctx, st, nowSec);
    drawDebris(ctx, st, nowSec);
    drawTargetsAndGoal(ctx, st, nowSec, activePred);
    drawLaunchPadAndProbe(ctx, st, nowSec, activeShot, activePred);
    drawPulsesAndParticles(ctx);

    ctx.restore();

    drawPuzzleScreenHUD(ctx);

    ctx.restore();
  }

  // =========================================================================
  // Pointer & Keyboard Input for Puzzle Mode
  // =========================================================================
  function bindEvents(canvas) {
    canvasEl = canvas;

    canvas.addEventListener('contextmenu', (e) => {
      if (!active) return;
      e.preventDefault();
      if (pState && pState.drag) {
        pState.drag = null;
        return;
      }
      if (pState && pState.probe && pState.probe.flightTime > 0.25) {
        onProbeLost(pState.probe.x, pState.probe.y, false);
      }
    });

    canvas.addEventListener('pointerdown', (e) => {
      if (!active || e.button === 2) return;
      Audio.init();
      if (!pState || pState.pausedForModal || pState.cleared) return;

      const sx = e.clientX;
      const sy = e.clientY;

      for (const btn of hudButtons) {
        if (Math.hypot(sx - btn.x, sy - btn.y) <= btn.r + 10) {
          btn.onClick();
          return;
        }
      }

      // If probe is currently flying, tapping/dragging after 0.4s recalls it so player never waits!
      if (pState.probe) {
        if (pState.probe.flightTime > 0.4) {
          onProbeLost(pState.probe.x, pState.probe.y, false);
        }
        return;
      }

      if (pState.probesLeft <= 0 || pState.readyDelay > 0) return;

      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      const w = screenToWorld(sx, sy);
      pState.drag = {
        pointerId: e.pointerId,
        startScreenX: sx,
        startScreenY: sy,
        currScreenX: sx,
        currScreenY: sy,
        startWorldX: w.x,
        startWorldY: w.y,
        moved: false
      };
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!active || !pState || !pState.drag || pState.drag.pointerId !== e.pointerId) return;
      pState.drag.currScreenX = e.clientX;
      pState.drag.currScreenY = e.clientY;
      if (Math.hypot(e.clientX - pState.drag.startScreenX, e.clientY - pState.drag.startScreenY) > 10) {
        pState.drag.moved = true;
      }
      if (pState.drag.moved) {
        const shot = computeLaunchShot(pState.drag);
        if (shot) {
          Audio.playAimTick(shot.powerNorm, worldXToPan(shot.x, shot.y));
        }
      }
    });

    const finishDrag = (e) => {
      if (!active || !pState || !pState.drag || pState.drag.pointerId !== e.pointerId) return;
      const drag = pState.drag;
      pState.drag = null;

      if (!drag.moved || pState.probe || pState.probesLeft <= 0) return;

      const shot = computeLaunchShot(drag);
      if (!shot) return;

      pState.probesLeft -= 1;
      pState.shotsUsed += 1;
      pState.probe = {
        x: shot.x,
        y: shot.y,
        vx: shot.vx,
        vy: shot.vy,
        flightTime: 0,
        warpCd: 0,
        swingByCd: 0,
        comboCount: 0,
        prevRadDots: new Map(),
        trail: [{ x: shot.x, y: shot.y, breakSegment: false }]
      };
      Audio.playLaunch(shot.powerNorm, 0, worldXToPan(shot.x, shot.y));
      emitPulse(shot.x, shot.y, 6, 32, pTheme.probe, 0.45, 2.0);
    };

    canvas.addEventListener('pointerup', finishDrag);
    canvas.addEventListener('pointercancel', finishDrag);

    window.addEventListener('keydown', (e) => {
      if (!active || !pState) return;
      if (e.key === 'r' || e.key === 'R') {
        Audio.init();
        Audio.playAimTick(0.5, 0);
        loadStage(currentStageIdx);
      } else if (e.key === 'Escape') {
        closeStageSelect();
      }
    });
  }

  function initUI(canvas, options = {}) {
    onThemeToggleCallback = options.onThemeToggle || null;
    helpOverlayEl = document.getElementById('helpOverlay');
    modeOrbitaBtn = document.getElementById('modeOrbitaBtn');
    modeMissionBtn = document.getElementById('modeMissionBtn');
    puzzleHudPill = document.getElementById('puzzleHudPill');
    stageSelectBtn = document.getElementById('stageSelectBtn');
    stageSelectLabel = document.getElementById('stageSelectLabel');
    puzzleRetryBtn = document.getElementById('puzzleRetryBtn');
    stageSelectOverlay = document.getElementById('stageSelectOverlay');
    stageGridEl = document.getElementById('stageGrid');
    closeStageSelectBtn = document.getElementById('closeStageSelectBtn');
    stageClearOverlay = document.getElementById('stageClearOverlay');
    stageClearStarsEl = document.getElementById('stageClearStars');
    stageClearTitleEl = document.getElementById('stageClearTitle');
    stageClearRetryBtn = document.getElementById('stageClearRetryBtn');
    stageClearNextBtn = document.getElementById('stageClearNextBtn');

    bindEvents(canvas);

    if (modeOrbitaBtn) {
      modeOrbitaBtn.addEventListener('click', () => {
        Audio.init();
        Audio.playAimTick(0.45, 0);
        exitMode();
        if (options.onExitToOrbita) options.onExitToOrbita();
      });
    }

    if (modeMissionBtn) {
      modeMissionBtn.addEventListener('click', () => {
        Audio.init();
        Audio.playAimTick(0.65, 0);
        if (options.onEnterMission) options.onEnterMission();
        enterMode(currentStageIdx);
      });
    }

    if (stageSelectBtn) {
      stageSelectBtn.addEventListener('click', () => {
        Audio.init();
        Audio.playAimTick(0.55, 0);
        openStageSelect();
      });
    }

    if (puzzleRetryBtn) {
      puzzleRetryBtn.addEventListener('click', () => {
        Audio.init();
        Audio.playAimTick(0.5, 0);
        loadStage(currentStageIdx);
      });
    }

    if (closeStageSelectBtn) {
      closeStageSelectBtn.addEventListener('click', closeStageSelect);
    }
    if (stageSelectOverlay) {
      stageSelectOverlay.addEventListener('click', (e) => {
        if (e.target === stageSelectOverlay) closeStageSelect();
      });
    }

    if (stageClearRetryBtn) {
      stageClearRetryBtn.addEventListener('click', () => {
        Audio.init();
        loadStage(currentStageIdx);
      });
    }

    if (stageClearNextBtn) {
      stageClearNextBtn.addEventListener('click', () => {
        Audio.init();
        stageClearOverlay.classList.add('hidden');
        if (currentStageIdx < STAGES.length - 1) {
          loadStage(currentStageIdx + 1);
        } else {
          openStageSelect();
        }
      });
    }
  }

  function enterMode(stageIdx) {
    active = true;
    if (modeOrbitaBtn) modeOrbitaBtn.classList.remove('active');
    if (modeMissionBtn) modeMissionBtn.classList.add('active');
    if (puzzleHudPill) puzzleHudPill.classList.remove('hidden-pill');
    loadStage(stageIdx !== undefined ? stageIdx : currentStageIdx);
  }

  function exitMode() {
    active = false;
    if (modeOrbitaBtn) modeOrbitaBtn.classList.add('active');
    if (modeMissionBtn) modeMissionBtn.classList.remove('active');
    if (puzzleHudPill) puzzleHudPill.classList.add('hidden-pill');
    if (stageSelectOverlay) stageSelectOverlay.classList.add('hidden');
    if (stageClearOverlay) stageClearOverlay.classList.add('hidden');
  }

  function setTheme(name) {
    themeName = name === 'blueprint' ? 'blueprint' : 'navy';
    pTheme = PUZZLE_THEMES[themeName];
  }

  function resize(w, h, nextDpr, insets) {
    viewW = w;
    viewH = h;
    dpr = nextDpr;
    if (insets) safeInsets = insets;
    updateCameraScale();
  }

  window.PuzzleGame = {
    initUI,
    isActive: () => active,
    enterMode,
    exitMode,
    setTheme,
    resize,
    update,
    render
  };
})();