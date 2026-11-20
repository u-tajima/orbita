/**
 * ORBITA MISSION — 50 Handcrafted Swing-By & Warp Stages
 * Modes:
 * - 'goal': Reach the Goal Portal
 * - 'destroy': Shatter all Crystalline Target Obstacles
 * - 'both': Shatter all Seal Cores to unlock the Goal Portal, then enter the Goal
 */
(function () {
  function makeVerticalDebrisWall(x, yMin, yMax, step, radius = 14) {
    const arr = [];
    for (let y = yMin; y <= yMax; y += step) {
      arr.push({ x, y, r: radius });
    }
    return arr;
  }

  function makeHorizontalDebrisWall(y, xMin, xMax, step, radius = 14) {
    const arr = [];
    for (let x = xMin; x <= xMax; x += step) {
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

  function makeOrbitTargets(cx, cy, orbitR, count, orbitSpeed, radius = 22, phaseOffset = 0) {
    const arr = [];
    for (let k = 0; k < count; k++) {
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

  window.ORBITA_STAGES = [
    // ================= 01–10: Foundations =================
    {
      id: 1, mode: 'goal', spanW: 860, spanH: 580,
      pad: { x: -290, y: 120 }, goal: { x: 260, y: -135, r: 28 },
      bodies: [{ kind: 'star', x: 0, y: 0, r: 26, gm: 3600000, visualR: 175 }],
      debris: [{ x: -80, y: -35, r: 13 }, { x: -40, y: -75, r: 13 }, { x: 10, y: -105, r: 13 }],
      targets: [], warps: []
    },
    {
      id: 2, mode: 'destroy', spanW: 840, spanH: 580,
      pad: { x: -260, y: 145 }, goal: null,
      bodies: [{ kind: 'star', x: 10, y: 0, r: 26, gm: 4100000, visualR: 180 }],
      debris: [],
      targets: [{ x: -5, y: 135, r: 21 }, { x: 112, y: 10, r: 21 }, { x: 10, y: -125, r: 21 }],
      warps: []
    },
    {
      id: 3, mode: 'goal', spanW: 920, spanH: 600,
      pad: { x: -330, y: 135 }, goal: { x: 320, y: 115, r: 28 },
      bodies: [
        { kind: 'star', x: -105, y: 25, r: 25, gm: 3400000, visualR: 165 },
        { kind: 'planet', x: 145, y: -45, r: 18, gm: 1850000, visualR: 130 }
      ],
      debris: [{ x: 20, y: 135, r: 13 }, { x: 75, y: 120, r: 13 }, { x: 130, y: 105, r: 13 }, { x: -105, y: -95, r: 13 }],
      targets: [], warps: []
    },
    {
      id: 4, mode: 'goal', spanW: 920, spanH: 620,
      pad: { x: -310, y: -120 }, goal: { x: 290, y: 125, r: 28 },
      bodies: [
        { kind: 'star', x: -150, y: 15, r: 25, gm: 3300000, visualR: 160 },
        { kind: 'planet', x: 165, y: 15, r: 19, gm: 2200000, visualR: 135 }
      ],
      debris: makeVerticalDebrisWall(0, -560, 560, 44, 14),
      targets: [],
      warps: [{ x1: -150, y1: 155, x2: 120, y2: -150, r: 25, pairIndex: 0 }]
    },
    {
      id: 5, mode: 'both', spanW: 880, spanH: 640,
      pad: { x: -295, y: 135 }, goal: { x: 15, y: -245, r: 29 },
      bodies: [{ kind: 'star', x: 0, y: 0, r: 26, gm: 4100000, visualR: 175 }],
      debris: makeDebrisRing(0, 0, 215, 8, [2, 3, 6, 7], 0.38, 13, 0),
      targets: [{ x: -10, y: 132, r: 22 }, { x: 112, y: 8, r: 22 }],
      warps: []
    },
    {
      id: 6, mode: 'goal', spanW: 940, spanH: 640,
      pad: { x: -330, y: 150 }, goal: { x: 310, y: -165, r: 28 },
      bodies: [
        { kind: 'star', x: -40, y: 0, r: 26, gm: 3600000, visualR: 165 },
        { kind: 'planet', cx: -40, cy: 0, orbitR: 195, orbitPhase: 0.6, orbitSpeed: 0.55, r: 17, gm: 1950000, visualR: 120 }
      ],
      debris: [{ x: -40, y: -95, r: 14 }, { x: 5, y: -85, r: 14 }, { x: 50, y: -70, r: 14 }, { x: 95, y: -55, r: 14 }],
      targets: [], warps: []
    },
    {
      id: 7, mode: 'destroy', spanW: 940, spanH: 600,
      pad: { x: -330, y: 120 }, goal: null,
      bodies: [
        { kind: 'star', x: -155, y: 0, r: 24, gm: 3200000, visualR: 155 },
        { kind: 'star2', x: 155, y: 0, r: 24, gm: 3200000, visualR: 155 }
      ],
      debris: [{ x: 0, y: 0, r: 14 }, { x: 0, y: 52, r: 13 }, { x: 0, y: -52, r: 13 }],
      targets: [{ x: -155, y: 118, r: 22 }, { x: 155, y: 118, r: 22 }, { x: 260, y: 15, r: 22 }],
      warps: [
        { x1: -40, y1: -115, x2: 50, y2: 115, r: 26, pairIndex: 0 },
        { x1: 265, y1: -50, x2: -265, y2: -95, r: 26, pairIndex: 1 }
      ]
    },
    {
      id: 8, mode: 'goal', spanW: 880, spanH: 660,
      pad: { x: 0, y: 245 }, goal: { x: 0, y: -240, r: 28 },
      bodies: [
        { kind: 'star', x: -155, y: 0, r: 25, gm: 3500000, visualR: 155 },
        { kind: 'star2', x: 155, y: 0, r: 25, gm: 3500000, visualR: 155 }
      ],
      debris: [
        { x: 0, y: 0, r: 15 }, { x: -38, y: 25, r: 13 }, { x: 38, y: -25, r: 13 },
        { cx: -155, cy: 0, orbitR: 105, orbitPhase: 0.0, orbitSpeed: 0.65, r: 12 },
        { cx: -155, cy: 0, orbitR: 105, orbitPhase: Math.PI, orbitSpeed: 0.65, r: 12 },
        { cx: 155, cy: 0, orbitR: 105, orbitPhase: Math.PI * 0.5, orbitSpeed: -0.65, r: 12 },
        { cx: 155, cy: 0, orbitR: 105, orbitPhase: Math.PI * 1.5, orbitSpeed: -0.65, r: 12 }
      ],
      targets: [], warps: []
    },
    {
      id: 9, mode: 'destroy', spanW: 940, spanH: 620,
      pad: { x: -340, y: 130 }, goal: null,
      bodies: [
        { kind: 'star', x: 60, y: 0, r: 28, gm: 4500000, visualR: 180 },
        { kind: 'planet', x: -200, y: 10, r: 18, gm: 1800000, visualR: 120 }
      ],
      debris: [
        { cx: 60, cy: 0, orbitR: 215, orbitPhase: 0.0, orbitSpeed: 0.35, r: 13 },
        { cx: 60, cy: 0, orbitR: 215, orbitPhase: 2.094, orbitSpeed: 0.35, r: 13 },
        { cx: 60, cy: 0, orbitR: 215, orbitPhase: 4.188, orbitSpeed: 0.35, r: 13 }
      ],
      targets: makeOrbitTargets(60, 0, 130, 4, -0.42, 22, 0.4),
      warps: [{ x1: -105, y1: -95, x2: 60, y2: 132, r: 26, pairIndex: 0 }]
    },
    {
      id: 10, mode: 'both', spanW: 980, spanH: 660,
      pad: { x: -350, y: 135 }, goal: { x: 165, y: -220, r: 31 },
      bodies: [
        { kind: 'star', x: -165, y: 10, r: 25, gm: 3500000, visualR: 160 },
        { kind: 'star2', x: 165, y: -10, r: 25, gm: 3800000, visualR: 165 },
        { kind: 'moon', cx: 165, cy: -10, orbitR: 155, orbitPhase: 1.8, orbitSpeed: 0.48, r: 14, gm: 1100000, visualR: 95 }
      ],
      debris: [{ x: 0, y: -35, r: 14 }, { x: 0, y: 25, r: 14 }, { x: 0, y: -95, r: 13 }, { x: 0, y: 85, r: 13 }],
      targets: [{ x: -165, y: 132, r: 23 }, { x: 175, y: 112, r: 23 }],
      warps: [{ x1: -40, y1: -115, x2: 45, y2: 120, r: 27, pairIndex: 0 }]
    },

    // ================= 11–20: Gravity Curves & Multi-Body Slaloms =================
    {
      id: 11, mode: 'goal', spanW: 880, spanH: 600,
      pad: { x: -290, y: 130 }, goal: { x: -255, y: -135, r: 29 },
      bodies: [{ kind: 'star', x: 115, y: 0, r: 27, gm: 4500000, visualR: 185 }],
      debris: makeHorizontalDebrisWall(0, -350, -90, 44, 14),
      targets: [], warps: []
    },
    {
      id: 12, mode: 'destroy', spanW: 880, spanH: 600,
      pad: { x: -310, y: -135 }, goal: null,
      bodies: [{ kind: 'star', x: 5, y: -20, r: 26, gm: 3900000, visualR: 175 }],
      debris: [{ x: -45, y: -125, r: 13 }, { x: 5, y: -135, r: 13 }, { x: 55, y: -125, r: 13 }],
      targets: [{ x: -105, y: 85, r: 22 }, { x: 20, y: 118, r: 22 }, { x: 145, y: 45, r: 22 }],
      warps: []
    },
    {
      id: 13, mode: 'goal', spanW: 960, spanH: 620,
      pad: { x: -350, y: 115 }, goal: { x: 340, y: 105, r: 29 },
      bodies: [
        { kind: 'planet', x: -160, y: -65, r: 19, gm: 2150000, visualR: 130 },
        { kind: 'planet', x: 15, y: 75, r: 19, gm: 2150000, visualR: 130 },
        { kind: 'planet', x: 190, y: -60, r: 19, gm: 2150000, visualR: 130 }
      ],
      debris: [{ x: -160, y: 115, r: 13 }, { x: -95, y: 115, r: 13 }, { x: 15, y: -95, r: 13 }, { x: 190, y: 115, r: 13 }],
      targets: [], warps: []
    },
    {
      id: 14, mode: 'both', spanW: 900, spanH: 620,
      pad: { x: -305, y: -130 }, goal: { x: 165, y: -175, r: 29 },
      bodies: [{ kind: 'star', x: 30, y: 10, r: 26, gm: 4200000, visualR: 180 }],
      debris: [{ x: -125, y: -120, r: 13 }, { x: -65, y: -125, r: 13 }, { x: -5, y: -125, r: 13 }],
      targets: [{ x: -20, y: 135, r: 22 }, { x: 150, y: 50, r: 22 }],
      warps: []
    },
    {
      id: 15, mode: 'goal', spanW: 920, spanH: 640,
      pad: { x: -335, y: 135 }, goal: { x: 335, y: -135, r: 29 },
      bodies: [
        { kind: 'star', x: 0, y: -150, r: 24, gm: 3300000, visualR: 155 },
        { kind: 'star2', x: 0, y: 150, r: 24, gm: 3300000, visualR: 155 }
      ],
      debris: [{ x: 0, y: 0, r: 15 }, { x: 0, y: -48, r: 13 }, { x: 0, y: 48, r: 13 }, { x: -180, y: -55, r: 13 }, { x: 180, y: 55, r: 13 }],
      targets: [], warps: []
    },
    {
      id: 16, mode: 'destroy', spanW: 940, spanH: 620,
      pad: { x: -335, y: -115 }, goal: null,
      bodies: [
        { kind: 'star', x: -145, y: 45, r: 24, gm: 3300000, visualR: 155 },
        { kind: 'planet', x: 145, y: -50, r: 19, gm: 2300000, visualR: 135 }
      ],
      debris: [{ x: 0, y: -130, r: 13 }, { x: 0, y: 155, r: 13 }],
      targets: [{ x: -155, y: -75, r: 22 }, { x: -10, y: 15, r: 22 }, { x: 140, y: 80, r: 22 }, { x: 265, y: -15, r: 22 }],
      warps: []
    },
    {
      id: 17, mode: 'goal', spanW: 940, spanH: 620,
      pad: { x: -330, y: 145 }, goal: { x: 310, y: 15, r: 29 },
      bodies: [{ kind: 'star', x: 95, y: 0, r: 27, gm: 4600000, visualR: 185 }],
      debris: [
        { x: 225, y: -35, r: 14 }, { x: 225, y: 15, r: 14 }, { x: 225, y: 65, r: 14 },
        { x: 225, y: 115, r: 14 }, { x: 265, y: 115, r: 14 }, { x: 310, y: 115, r: 14 }
      ],
      targets: [], warps: []
    },
    {
      id: 18, mode: 'both', spanW: 960, spanH: 620,
      pad: { x: -345, y: -135 }, goal: { x: 340, y: 135, r: 29 },
      bodies: [
        { kind: 'star', x: -155, y: 0, r: 24, gm: 3400000, visualR: 155 },
        { kind: 'star2', x: 155, y: 0, r: 24, gm: 3400000, visualR: 155 }
      ],
      debris: [{ x: 0, y: -115, r: 13 }, { x: 0, y: 115, r: 13 }],
      targets: [{ x: -155, y: 118, r: 22 }, { x: 155, y: -118, r: 22 }],
      warps: []
    },
    {
      id: 19, mode: 'destroy', spanW: 940, spanH: 600,
      pad: { x: -345, y: -45 }, goal: null,
      bodies: [
        { kind: 'planet', x: -95, y: 95, r: 19, gm: 2400000, visualR: 135 },
        { kind: 'planet', x: 125, y: 95, r: 19, gm: 2400000, visualR: 135 }
      ],
      debris: [{ x: 15, y: 95, r: 14 }, { x: 15, y: 145, r: 13 }],
      targets: [{ x: -150, y: -75, r: 22 }, { x: -5, y: -35, r: 22 }, { x: 145, y: -35, r: 22 }, { x: 280, y: 65, r: 22 }],
      warps: []
    },
    {
      id: 20, mode: 'both', spanW: 960, spanH: 640,
      pad: { x: -345, y: 165 }, goal: { x: 335, y: 160, r: 30 },
      bodies: [
        { kind: 'star', x: 0, y: 35, r: 26, gm: 4100000, visualR: 175 },
        { kind: 'planet', x: -205, y: -90, r: 17, gm: 1700000, visualR: 120 },
        { kind: 'planet', x: 205, y: -90, r: 17, gm: 1700000, visualR: 120 }
      ],
      debris: [{ x: 0, y: 185, r: 14 }, { x: -50, y: 185, r: 13 }, { x: 50, y: 185, r: 13 }],
      targets: [{ x: -135, y: 95, r: 22 }, { x: 0, y: -105, r: 22 }, { x: 145, y: 90, r: 22 }],
      warps: []
    },

    // ================= 21–30: Warp Hole Engineering =================
    {
      id: 21, mode: 'goal', spanW: 940, spanH: 620,
      pad: { x: -335, y: 150 }, goal: { x: 335, y: -130, r: 29 },
      bodies: [
        { kind: 'star', x: -175, y: 0, r: 25, gm: 3500000, visualR: 160 },
        { kind: 'planet', x: 215, y: 0, r: 19, gm: 2300000, visualR: 135 }
      ],
      debris: makeVerticalDebrisWall(25, -560, 560, 44, 14),
      targets: [],
      warps: [{ x1: -120, y1: -145, x2: 145, y2: 145, r: 26, pairIndex: 0 }]
    },
    {
      id: 22, mode: 'destroy', spanW: 920, spanH: 600,
      pad: { x: -325, y: 115 }, goal: null,
      bodies: [
        { kind: 'star', x: 115, y: 0, r: 27, gm: 4300000, visualR: 180 },
        { kind: 'planet', x: -195, y: -25, r: 17, gm: 1650000, visualR: 115 }
      ],
      debris: [{ x: -35, y: -120, r: 13 }, { x: -35, y: 120, r: 13 }],
      targets: [{ x: 245, y: 0, r: 22 }, { x: 115, y: 130, r: 22 }, { x: -15, y: 0, r: 22 }],
      warps: [{ x1: -120, y1: -115, x2: 115, y2: -130, r: 26, pairIndex: 0 }]
    },
    {
      id: 23, mode: 'goal', spanW: 980, spanH: 640,
      pad: { x: -355, y: 120 }, goal: { x: 350, y: 140, r: 29 },
      bodies: [
        { kind: 'planet', x: -235, y: -20, r: 18, gm: 2150000, visualR: 125 },
        { kind: 'star', x: 0, y: 0, r: 23, gm: 3200000, visualR: 145 },
        { kind: 'planet', x: 245, y: 15, r: 18, gm: 2150000, visualR: 125 }
      ],
      debris: [
        ...makeVerticalDebrisWall(-115, -560, 560, 44, 13),
        ...makeVerticalDebrisWall(115, -560, 560, 44, 13)
      ],
      targets: [],
      warps: [
        { x1: -190, y1: -155, x2: -10, y2: 150, r: 26, pairIndex: 0 },
        { x1: 45, y1: -135, x2: 205, y2: -145, r: 26, pairIndex: 1 }
      ]
    },
    {
      id: 24, mode: 'both', spanW: 960, spanH: 640,
      pad: { x: -335, y: 55 }, goal: { x: 315, y: -130, r: 29 },
      bodies: [
        { kind: 'star', x: -165, y: 20, r: 25, gm: 3600000, visualR: 160 },
        { kind: 'star2', x: 175, y: -10, r: 25, gm: 3600000, visualR: 160 }
      ],
      debris: makeVerticalDebrisWall(0, -560, 560, 44, 14),
      targets: [{ x: -165, y: -105, r: 22 }, { x: 175, y: 115, r: 22 }],
      warps: [{ x1: -75, y1: -145, x2: 90, y2: 140, r: 26, pairIndex: 0 }]
    },
    {
      id: 25, mode: 'destroy', spanW: 940, spanH: 640,
      pad: { x: -330, y: 155 }, goal: null,
      bodies: [
        { kind: 'planet', x: -135, y: 145, r: 19, gm: 2150000, visualR: 130 },
        { kind: 'star', x: 25, y: -155, r: 25, gm: 3600000, visualR: 160 }
      ],
      debris: makeHorizontalDebrisWall(0, -600, 600, 44, 14),
      targets: [{ x: -115, y: 245, r: 22 }, { x: 25, y: -48, r: 22 }, { x: 175, y: -145, r: 22 }, { x: 285, y: -215, r: 22 }],
      warps: [{ x1: 65, y1: 175, x2: -245, y2: -145, r: 26, pairIndex: 0 }]
    },
    {
      id: 26, mode: 'goal', spanW: 920, spanH: 620,
      pad: { x: -325, y: 155 }, goal: { x: -245, y: -130, r: 29 },
      bodies: [{ kind: 'star', x: 25, y: 10, r: 26, gm: 4100000, visualR: 175 }],
      debris: [
        { x: -305, y: -70, r: 13 }, { x: -255, y: -70, r: 13 }, { x: -205, y: -70, r: 13 },
        { x: -305, y: -195, r: 13 }, { x: -255, y: -195, r: 13 }, { x: -205, y: -195, r: 13 },
        { x: -325, y: -130, r: 13 }
      ],
      targets: [],
      warps: [{ x1: 195, y1: -105, x2: -105, y2: -130, r: 26, pairIndex: 0 }]
    },
    {
      id: 27, mode: 'destroy', spanW: 960, spanH: 620,
      pad: { x: -350, y: 145 }, goal: null,
      bodies: [
        { kind: 'star', x: -175, y: 0, r: 25, gm: 3800000, visualR: 160 },
        { kind: 'star2', x: 175, y: 0, r: 25, gm: 3800000, visualR: 160 }
      ],
      debris: [{ x: 0, y: -155, r: 13 }, { x: 0, y: 155, r: 13 }],
      targets: [{ x: -65, y: 0, r: 22 }, { x: 65, y: 0, r: 22 }, { x: 285, y: 0, r: 22 }, { x: -285, y: -25, r: 22 }],
      warps: [
        { x1: -175, y1: -125, x2: 175, y2: -125, r: 26, pairIndex: 0 },
        { x1: 175, y1: 125, x2: -175, y2: 125, r: 26, pairIndex: 1 }
      ]
    },
    {
      id: 28, mode: 'both', spanW: 940, spanH: 640,
      pad: { x: -340, y: 160 }, goal: { x: -10, y: -225, r: 30 },
      bodies: [{ kind: 'star', x: 0, y: 0, r: 26, gm: 3600000, visualR: 165 }],
      debris: [{ x: -65, y: -105, r: 13 }, { x: 65, y: -105, r: 13 }, { x: -65, y: 105, r: 13 }, { x: 65, y: 105, r: 13 }],
      targets: [{ x: -135, y: 45, r: 22 }, { x: 140, y: 105, r: 22 }],
      warps: [
        { x1: -125, y1: -135, x2: 145, y2: -135, r: 26, pairIndex: 0 },
        { x1: 245, y1: 85, x2: -225, y2: -95, r: 26, pairIndex: 1 }
      ]
    },
    {
      id: 29, mode: 'goal', spanW: 960, spanH: 640,
      pad: { x: -345, y: -135 }, goal: { x: 335, y: 155, r: 29 },
      bodies: [
        { kind: 'star', x: -140, y: 10, r: 26, gm: 4000000, visualR: 170 },
        { kind: 'planet', x: 240, y: 15, r: 19, gm: 2400000, visualR: 135 }
      ],
      debris: [
        ...makeVerticalDebrisWall(60, -560, 560, 44, 14),
        { x: -245, y: 85, r: 13 }, { x: -195, y: 115, r: 13 }, { x: -145, y: 145, r: 13 }
      ],
      targets: [],
      warps: [{ x1: -25, y1: 155, x2: 165, y2: -145, r: 26, pairIndex: 0 }]
    },
    {
      id: 30, mode: 'both', spanW: 960, spanH: 640,
      pad: { x: -350, y: 135 }, goal: { x: 315, y: -185, r: 30 },
      bodies: [
        { kind: 'star', x: 100, y: 0, r: 28, gm: 4500000, visualR: 180 },
        { kind: 'planet', x: -200, y: -15, r: 18, gm: 1900000, visualR: 120 }
      ],
      debris: makeDebrisRing(100, 0, 215, 8, [7], 0, 14, 0),
      targets: [{ x: 230, y: 0, r: 22 }, { x: 100, y: -130, r: 22 }, { x: -30, y: 0, r: 22 }],
      warps: [{ x1: -125, y1: -140, x2: 100, y2: 130, r: 26, pairIndex: 0 }]
    },

    // ================= 31–40: Moving Planets & Rotating Debris Gates =================
    {
      id: 31, mode: 'goal', spanW: 940, spanH: 640,
      pad: { x: -335, y: 125 }, goal: { x: 320, y: -125, r: 29 },
      bodies: [
        { kind: 'star', x: 0, y: 0, r: 26, gm: 3600000, visualR: 165 },
        { kind: 'moon', cx: 0, cy: 0, orbitR: 175, orbitPhase: 0.4, orbitSpeed: 0.62, r: 15, gm: 1500000, visualR: 105 }
      ],
      debris: [{ x: -20, y: -92, r: 13 }, { x: 25, y: -86, r: 13 }, { x: 70, y: -76, r: 13 }],
      targets: [], warps: []
    },
    {
      id: 32, mode: 'destroy', spanW: 900, spanH: 620,
      pad: { x: -320, y: 140 }, goal: null,
      bodies: [{ kind: 'star', x: 20, y: 0, r: 26, gm: 4100000, visualR: 175 }],
      debris: makeDebrisRing(20, 0, 210, 8, [0, 1, 4, 5], 0.42, 13, 0),
      targets: [{ x: 20, y: 125, r: 22 }, { x: 145, y: 0, r: 22 }, { x: 20, y: -125, r: 22 }],
      warps: []
    },
    {
      id: 33, mode: 'goal', spanW: 960, spanH: 640,
      pad: { x: -345, y: 155 }, goal: { x: 340, y: -155, r: 29 },
      bodies: [
        { kind: 'star', x: 0, y: 0, r: 25, gm: 3400000, visualR: 160 },
        { kind: 'planet', cx: 0, cy: 0, orbitR: 135, orbitPhase: 0.8, orbitSpeed: 0.65, r: 16, gm: 1400000, visualR: 105 },
        { kind: 'planet', cx: 0, cy: 0, orbitR: 235, orbitPhase: 3.2, orbitSpeed: -0.45, r: 17, gm: 1600000, visualR: 115 }
      ],
      debris: [{ x: -75, y: -35, r: 13 }, { x: 75, y: 35, r: 13 }],
      targets: [], warps: []
    },
    {
      id: 34, mode: 'destroy', spanW: 920, spanH: 620,
      pad: { x: -325, y: 135 }, goal: null,
      bodies: [{ kind: 'star', x: 15, y: 0, r: 26, gm: 4200000, visualR: 175 }],
      debris: makeDebrisRing(15, 0, 215, 4, [1, 3], -0.36, 13, 0.5),
      targets: makeOrbitTargets(15, 0, 132, 4, 0.46, 22, 0.3),
      warps: []
    },
    {
      id: 35, mode: 'both', spanW: 980, spanH: 640,
      pad: { x: -360, y: 145 }, goal: { x: 355, y: -145, r: 30 },
      bodies: [
        { kind: 'star', x: -160, y: 0, r: 24, gm: 3400000, visualR: 155 },
        { kind: 'star2', x: 160, y: 0, r: 24, gm: 3400000, visualR: 155 }
      ],
      debris: [
        ...makeDebrisRing(-160, 0, 145, 4, [], 0.44, 12, 0.2),
        ...makeDebrisRing(160, 0, 145, 4, [], -0.44, 12, 0.9)
      ],
      targets: [{ x: -160, y: 95, r: 22 }, { x: 160, y: -95, r: 22 }],
      warps: []
    },
    {
      id: 36, mode: 'goal', spanW: 960, spanH: 640,
      pad: { x: -345, y: -135 }, goal: { x: 345, y: 135, r: 29 },
      bodies: [
        { kind: 'star', x: -95, y: 20, r: 25, gm: 3500000, visualR: 160 },
        { kind: 'planet', cx: -95, cy: 20, orbitR: 195, orbitPhase: 1.2, orbitSpeed: 0.52, r: 17, gm: 1850000, visualR: 120 },
        { kind: 'planet', x: 205, y: -40, r: 18, gm: 2000000, visualR: 125 }
      ],
      debris: [
        { cx: 55, cy: 0, orbitR: 75, orbitPhase: 0, orbitSpeed: 0.6, r: 13 },
        { cx: 55, cy: 0, orbitR: 75, orbitPhase: Math.PI, orbitSpeed: 0.6, r: 13 }
      ],
      targets: [], warps: []
    },
    {
      id: 37, mode: 'destroy', spanW: 940, spanH: 640,
      pad: { x: -350, y: 125 }, goal: null,
      bodies: [{ kind: 'star', x: 35, y: 0, r: 27, gm: 4300000, visualR: 180 }],
      debris: [
        ...makeDebrisRing(35, 0, 178, 3, [], 0.54, 12, 0),
        ...makeDebrisRing(35, 0, 248, 4, [], -0.36, 13, 0.6)
      ],
      targets: [{ x: 35, y: 115, r: 22 }, { x: 150, y: 0, r: 22 }, { x: 35, y: -115, r: 22 }],
      warps: []
    },
    {
      id: 38, mode: 'both', spanW: 960, spanH: 640,
      pad: { x: -350, y: 150 }, goal: { x: 335, y: 150, r: 30 },
      bodies: [
        { kind: 'star', x: -115, y: 0, r: 25, gm: 3600000, visualR: 165 },
        { kind: 'moon', cx: -115, cy: 0, orbitR: 165, orbitPhase: 2.1, orbitSpeed: 0.55, r: 14, gm: 1300000, visualR: 100 },
        { kind: 'planet', x: 190, y: 20, r: 19, gm: 2150000, visualR: 130 }
      ],
      debris: [{ x: 35, y: 130, r: 13 }, { x: 35, y: 180, r: 13 }],
      targets: [{ x: -115, y: -112, r: 22 }, { x: 190, y: -102, r: 22 }],
      warps: []
    },
    {
      id: 39, mode: 'goal', spanW: 980, spanH: 640,
      pad: { x: -360, y: 150 }, goal: { x: 360, y: -150, r: 29 },
      bodies: [
        { kind: 'star', x: -165, y: 0, r: 24, gm: 3300000, visualR: 155 },
        { kind: 'moon', cx: -165, cy: 0, orbitR: 115, orbitPhase: 0.2, orbitSpeed: 0.72, r: 13, gm: 1100000, visualR: 90 },
        { kind: 'star2', x: 165, y: 0, r: 24, gm: 3300000, visualR: 155 },
        { kind: 'moon', cx: 165, cy: 0, orbitR: 115, orbitPhase: 3.3, orbitSpeed: -0.72, r: 13, gm: 1100000, visualR: 90 }
      ],
      debris: [{ x: 0, y: -65, r: 13 }, { x: 0, y: 0, r: 14 }, { x: 0, y: 65, r: 13 }],
      targets: [], warps: []
    },
    {
      id: 40, mode: 'both', spanW: 960, spanH: 640,
      pad: { x: -350, y: 140 }, goal: { x: 325, y: -165, r: 30 },
      bodies: [{ kind: 'star', x: 0, y: 0, r: 27, gm: 4400000, visualR: 180 }],
      debris: makeDebrisRing(0, 0, 205, 8, [1, 2, 5, 6], 0.42, 13, 0),
      targets: makeOrbitTargets(0, 0, 125, 3, -0.45, 22, 0.4),
      warps: []
    },

    // ================= 41–50: Master Trials =================
    {
      id: 41, mode: 'goal', spanW: 960, spanH: 640,
      pad: { x: -345, y: 130 }, goal: { x: 340, y: -145, r: 29 },
      bodies: [
        { kind: 'star', x: -175, y: 0, r: 25, gm: 3500000, visualR: 160 },
        { kind: 'star2', x: 175, y: 0, r: 25, gm: 3600000, visualR: 160 },
        { kind: 'moon', cx: 175, cy: 0, orbitR: 145, orbitPhase: 1.0, orbitSpeed: 0.62, r: 14, gm: 1200000, visualR: 95 }
      ],
      debris: makeVerticalDebrisWall(0, -560, 560, 44, 14),
      targets: [],
      warps: [{ x1: -125, y1: -145, x2: 110, y2: 145, r: 26, pairIndex: 0 }]
    },
    {
      id: 42, mode: 'destroy', spanW: 960, spanH: 640,
      pad: { x: -355, y: -135 }, goal: null,
      bodies: [
        { kind: 'star', x: 95, y: 0, r: 28, gm: 4500000, visualR: 180 },
        { kind: 'planet', x: -210, y: 25, r: 18, gm: 1900000, visualR: 120 }
      ],
      debris: makeDebrisRing(95, 0, 220, 4, [], 0.44, 13, 0.3),
      targets: makeOrbitTargets(95, 0, 130, 4, 0.48, 22, 0.2),
      warps: [{ x1: -110, y1: 115, x2: 95, y2: -130, r: 26, pairIndex: 0 }]
    },
    {
      id: 43, mode: 'both', spanW: 980, spanH: 640,
      pad: { x: -350, y: 125 }, goal: { x: 340, y: -170, r: 30 },
      bodies: [
        { kind: 'star', x: -175, y: 10, r: 25, gm: 3600000, visualR: 160 },
        { kind: 'star2', x: 185, y: -10, r: 26, gm: 3800000, visualR: 165 }
      ],
      debris: [
        ...makeVerticalDebrisWall(10, -560, 560, 44, 14),
        ...makeDebrisRing(185, -10, 190, 4, [], -0.45, 12, 0.4)
      ],
      targets: [{ x: -175, y: -110, r: 22 }, { x: 185, y: 105, r: 22 }],
      warps: [{ x1: -80, y1: -145, x2: 115, y2: 145, r: 26, pairIndex: 0 }]
    },
    {
      id: 44, mode: 'goal', spanW: 1000, spanH: 640,
      pad: { x: -365, y: 145 }, goal: { x: 365, y: 145, r: 29 },
      bodies: [
        { kind: 'planet', x: -245, y: 10, r: 18, gm: 2100000, visualR: 125 },
        { kind: 'star', x: 0, y: 0, r: 24, gm: 3400000, visualR: 150 },
        { kind: 'planet', x: 245, y: -15, r: 18, gm: 2100000, visualR: 125 }
      ],
      debris: [
        ...makeVerticalDebrisWall(-120, -560, 560, 44, 13),
        ...makeVerticalDebrisWall(120, -560, 560, 44, 13),
        { cx: 0, cy: 0, orbitR: 88, orbitPhase: 0, orbitSpeed: 0.65, r: 11 },
        { cx: 0, cy: 0, orbitR: 88, orbitPhase: Math.PI, orbitSpeed: 0.65, r: 11 }
      ],
      targets: [],
      warps: [
        { x1: -200, y1: -150, x2: -15, y2: 155, r: 26, pairIndex: 0 },
        { x1: 40, y1: -145, x2: 205, y2: -150, r: 26, pairIndex: 1 }
      ]
    },
    {
      id: 45, mode: 'destroy', spanW: 980, spanH: 640,
      pad: { x: -360, y: 135 }, goal: null,
      bodies: [
        { kind: 'star', x: -165, y: 0, r: 25, gm: 3700000, visualR: 160 },
        { kind: 'star2', x: 165, y: 0, r: 25, gm: 3700000, visualR: 160 }
      ],
      debris: [
        { cx: 0, cy: 0, orbitR: 65, orbitPhase: 0, orbitSpeed: 0.6, r: 13 },
        { cx: 0, cy: 0, orbitR: 65, orbitPhase: Math.PI, orbitSpeed: 0.6, r: 13 }
      ],
      targets: [
        { x: -165, y: 118, r: 22 }, { x: -275, y: -15, r: 22 },
        { cx: 165, cy: 0, orbitR: 115, orbitPhase: 0.5, orbitSpeed: -0.45, r: 22 },
        { cx: 165, cy: 0, orbitR: 115, orbitPhase: 0.5 + Math.PI, orbitSpeed: -0.45, r: 22 }
      ],
      warps: [
        { x1: -45, y1: -125, x2: 45, y2: 125, r: 26, pairIndex: 0 },
        { x1: 280, y1: -65, x2: -270, y2: -115, r: 26, pairIndex: 1 }
      ]
    },
    {
      id: 46, mode: 'both', spanW: 980, spanH: 660,
      pad: { x: -360, y: 145 }, goal: { x: 355, y: 155, r: 30 },
      bodies: [
        { kind: 'star', x: -145, y: 15, r: 25, gm: 3600000, visualR: 160 },
        { kind: 'planet', cx: -145, cy: 15, orbitR: 165, orbitPhase: 0.9, orbitSpeed: 0.54, r: 15, gm: 1400000, visualR: 105 },
        { kind: 'star2', x: 175, y: -15, r: 26, gm: 3900000, visualR: 165 }
      ],
      debris: [{ x: 15, y: -15, r: 14 }, { x: 15, y: 40, r: 13 }, { x: 15, y: 95, r: 13 }],
      targets: [{ x: -145, y: 130, r: 22 }, { x: 295, y: -15, r: 22 }, { x: 175, y: -135, r: 22 }],
      warps: [{ x1: 10, y1: -155, x2: 175, y2: 115, r: 27, pairIndex: 0 }]
    },
    {
      id: 47, mode: 'goal', spanW: 960, spanH: 660,
      pad: { x: -350, y: 155 }, goal: { x: 350, y: -155, r: 29 },
      bodies: [
        { kind: 'star', x: 0, y: -150, r: 25, gm: 3600000, visualR: 160 },
        { kind: 'star2', x: 0, y: 150, r: 25, gm: 3600000, visualR: 160 }
      ],
      debris: [
        ...makeDebrisRing(0, -150, 105, 3, [], 0.62, 12, 0),
        ...makeDebrisRing(0, 150, 105, 3, [], -0.62, 12, 1.0),
        { x: 0, y: 0, r: 15 }
      ],
      targets: [],
      warps: [{ x1: -200, y1: -165, x2: 155, y2: 165, r: 26, pairIndex: 0 }]
    },
    {
      id: 48, mode: 'destroy', spanW: 980, spanH: 640,
      pad: { x: -365, y: 145 }, goal: null,
      bodies: [
        { kind: 'star', x: 0, y: 0, r: 27, gm: 4300000, visualR: 180 },
        { kind: 'planet', x: -250, y: -90, r: 17, gm: 1700000, visualR: 115 },
        { kind: 'planet', x: 250, y: 90, r: 17, gm: 1700000, visualR: 115 }
      ],
      debris: makeDebrisRing(0, 0, 222, 3, [], 0.36, 13, 0.4),
      targets: [...makeOrbitTargets(0, 0, 130, 4, -0.4, 22, 0.3), { x: -250, y: 35, r: 22 }],
      warps: [{ x1: -135, y1: 145, x2: 0, y2: -130, r: 26, pairIndex: 0 }]
    },
    {
      id: 49, mode: 'both', spanW: 1000, spanH: 660,
      pad: { x: -360, y: 145 }, goal: { x: -315, y: -175, r: 30 },
      bodies: [
        { kind: 'star', x: -175, y: 0, r: 25, gm: 3700000, visualR: 160 },
        { kind: 'moon', cx: -175, cy: 0, orbitR: 125, orbitPhase: 0.7, orbitSpeed: 0.64, r: 13, gm: 1000000, visualR: 90 },
        { kind: 'star2', x: 175, y: 0, r: 26, gm: 4000000, visualR: 165 }
      ],
      debris: [
        ...makeVerticalDebrisWall(0, -560, 560, 44, 14),
        ...makeDebrisRing(175, 0, 195, 4, [], -0.46, 12, 0.2)
      ],
      targets: [{ x: -175, y: 118, r: 22 }, { x: 295, y: 0, r: 22 }, { x: 175, y: -120, r: 22 }],
      warps: [
        { x1: -75, y1: -145, x2: 175, y2: 120, r: 26, pairIndex: 0 },
        { x1: 285, y1: -95, x2: -225, y2: -140, r: 26, pairIndex: 1 }
      ]
    },
    {
      id: 50, mode: 'both', spanW: 1000, spanH: 660,
      pad: { x: -365, y: 145 }, goal: { x: 350, y: -195, r: 31 },
      bodies: [
        { kind: 'star', x: -175, y: 15, r: 25, gm: 3800000, visualR: 165 },
        { kind: 'star2', x: 175, y: -15, r: 26, gm: 4200000, visualR: 170 },
        { kind: 'moon', cx: 175, cy: -15, orbitR: 165, orbitPhase: 1.6, orbitSpeed: 0.52, r: 14, gm: 1200000, visualR: 95 }
      ],
      debris: makeDebrisRing(0, 0, 82, 3, [], 0.58, 13, 0),
      targets: [{ x: -175, y: 132, r: 23 }, { x: 295, y: -15, r: 23 }, { x: 175, y: -135, r: 23 }],
      warps: [
        { x1: -45, y1: -145, x2: 175, y2: 120, r: 27, pairIndex: 0 },
        { x1: 285, y1: 95, x2: -175, y2: -120, r: 27, pairIndex: 1 }
      ]
    }
  ];
})();
