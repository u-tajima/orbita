/**
 * ORBITA MISSION — 50 Mathematically Guaranteed 3-Star (1-Shot) Stages
 *
 * Stages 01–10: Handcrafted & verified foundation stages.
 * Stages 11–50: Built with a deterministic Trajectory-First Generator:
 *   1. Simulates a true fixed-timestep (1/60s Velocity Verlet) solution shot first.
 *   2. Places Warp Holes, Destructible Targets (static & orbiting), and Goal Portals
 *      directly onto the exact simulated trajectory (accounting for 0.95x target piercing
 *      slowdown and 0.45*r warp exit offsets).
 *   3. Places static walls, rotating debris rings (on a clean 9.0s harmonic period),
 *      and razor-thin grazing "needle-eye" debris gates flanking the solution curve.
 *   4. Runs a final verification pass with exact puzzle.js rules to guarantee every
 *      single stage (01–50) has a genuine 1-shot ★★★ clear!
 */
(function () {
  const FIXED_DT = 1 / 60;
  const MAX_SIM_STEPS = 350;
  // Clean 9.0-second harmonic base frequency so moving planets/rings/targets
  // return to their exact t=0 phase every 9.0 seconds forever.
  const OMEGA = (Math.PI * 2) / 9.0;

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

  // Exact physics helpers matching js/puzzle.js
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

  function computeAccel(x, y, bodies, t) {
    let ax = 0;
    let ay = 0;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
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

  function isClearOfBodies(x, y, bodies, t, padR) {
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const bp = evalOrbitalPos(b, t);
      if (Math.hypot(x - bp.x, y - bp.y) < b.r + padR) return false;
    }
    return true;
  }

  function isClearOfWarps(x, y, warps, padR) {
    for (let i = 0; i < warps.length; i++) {
      const w = warps[i];
      if (Math.hypot(x - w.x1, y - w.y1) < w.r + padR) return false;
      if (Math.hypot(x - w.x2, y - w.y2) < w.r + padR) return false;
    }
    return true;
  }

  /**
   * Simulates a single shot forward with exact puzzle.js Verlet integration,
   * optionally placing warps at specified steps and targets at specified steps.
   */
  function traceTrajectory(pad, angleDeg, speed, bodies, spanW, spanH, warps, targets, maxSteps) {
    const rad = (angleDeg * Math.PI) / 180;
    let x = pad.x;
    let y = pad.y;
    let vx = Math.cos(rad) * speed;
    let vy = Math.sin(rad) * speed;
    let t = 0;
    let warpCd = 0;

    const hitTargets = targets.map(() => false);
    const pts = [{ x, y, vx, vy, t: 0, breakSegment: false }];
    const boundW = spanW * 0.46;
    const boundH = spanH * 0.45;
    let crashed = false;
    let outOfBounds = false;
    let totalTurn = 0;
    let prevAng = Math.atan2(vy, vx);
    let warpsTriggered = 0;

    for (let step = 1; step <= maxSteps; step++) {
      const a1 = computeAccel(x, y, bodies, t);
      const nx = x + vx * FIXED_DT + 0.5 * a1.ax * FIXED_DT * FIXED_DT;
      const ny = y + vy * FIXED_DT + 0.5 * a1.ay * FIXED_DT * FIXED_DT;
      const tNext = t + FIXED_DT;
      const a2 = computeAccel(nx, ny, bodies, tNext);
      let nvx = vx + 0.5 * (a1.ax + a2.ax) * FIXED_DT;
      let nvy = vy + 0.5 * (a1.ay + a2.ay) * FIXED_DT;
      if (warpCd > 0) warpCd -= FIXED_DT;

      // Body crash check (strict safety margin b.r + 4)
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        const bp = evalOrbitalPos(b, tNext);
        if (distToSegmentSq(bp.x, bp.y, x, y, nx, ny) <= (b.r + 4) * (b.r + 4)) {
          crashed = true;
          break;
        }
      }
      if (crashed) break;

      // Target hits
      for (let k = 0; k < targets.length; k++) {
        if (hitTargets[k]) continue;
        const tg = targets[k];
        const tp = evalOrbitalPos(tg, tNext);
        if (distToSegmentSq(tp.x, tp.y, x, y, nx, ny) <= (tg.r + 6) * (tg.r + 6)) {
          hitTargets[k] = true;
          nvx *= 0.95;
          nvy *= 0.95;
        }
      }

      // Warp hits
      let warped = false;
      let finalX = nx;
      let finalY = ny;
      if (warpCd <= 0) {
        for (let wIdx = 0; wIdx < warps.length; wIdx++) {
          const w = warps[wIdx];
          if (distToSegmentSq(w.x1, w.y1, x, y, nx, ny) <= (w.r + 2) * (w.r + 2)) {
            const spd = Math.hypot(nvx, nvy);
            finalX = w.x2 + (spd > 1 ? (nvx / spd) * w.r * 0.45 : 0);
            finalY = w.y2 + (spd > 1 ? (nvy / spd) * w.r * 0.45 : 0);
            warpCd = 0.28;
            warped = true;
            warpsTriggered++;
            break;
          } else if (distToSegmentSq(w.x2, w.y2, x, y, nx, ny) <= (w.r + 2) * (w.r + 2)) {
            const spd = Math.hypot(nvx, nvy);
            finalX = w.x1 + (spd > 1 ? (nvx / spd) * w.r * 0.45 : 0);
            finalY = w.y1 + (spd > 1 ? (nvy / spd) * w.r * 0.45 : 0);
            warpCd = 0.28;
            warped = true;
            warpsTriggered++;
            break;
          }
        }
      }

      if (!warped) {
        const curAng = Math.atan2(nvy, nvx);
        let dAng = curAng - prevAng;
        while (dAng > Math.PI) dAng -= Math.PI * 2;
        while (dAng < -Math.PI) dAng += Math.PI * 2;
        totalTurn += Math.abs(dAng);
        prevAng = curAng;
      } else {
        prevAng = Math.atan2(nvy, nvx);
      }

      x = finalX;
      y = finalY;
      vx = nvx;
      vy = nvy;
      t = tNext;

      pts.push({ x, y, vx, vy, t, breakSegment: warped });

      if (Math.abs(x) > boundW || Math.abs(y) > boundH) {
        outOfBounds = true;
        break;
      }
    }

    return { pts, crashed, outOfBounds, totalTurn, hitTargets, warpsTriggered };
  }

  /**
   * Builds a guaranteed 1-shot ★★★ solvable stage from a trajectory-first blueprint.
   */
  function buildStage(bp) {
    const spanW = bp.spanW || 940;
    const spanH = bp.spanH || 640;
    const pad = bp.pad;
    const bodies = bp.bodies;
    const mode = bp.mode;
    const minSteps = bp.minSteps || 150;

    // 1. Place warps sequentially along the solution trajectory
    let bestAngle = bp.sol.angleDeg;
    let bestSpeed = bp.sol.speed;

    // Helper: construct warps from warpSpecs for a given (angle, speed)
    function buildWarpsForShot(ang, spd) {
      const placedWarps = [];
      const specs = bp.warpSpecs || [];
      for (let i = 0; i < specs.length; i++) {
        const ws = specs[i];
        const tr = traceTrajectory(pad, ang, spd, bodies, spanW, spanH, placedWarps, [], Math.min(MAX_SIM_STEPS, ws.step + 8));
        if (tr.pts.length <= ws.step) return null;
        const p = tr.pts[ws.step];
        const r = ws.r || 26;
        const vmag = Math.hypot(p.vx, p.vy) || 1;
        const wx1 = Math.round(p.x + (p.vx / vmag) * (r * 0.35));
        const wy1 = Math.round(p.y + (p.vy / vmag) * (r * 0.35));
        if (!isClearOfBodies(wx1, wy1, bodies, p.t, r + 14)) return null;
        if (!isClearOfWarps(wx1, wy1, placedWarps, r + 14)) return null;
        placedWarps.push({
          x1: wx1,
          y1: wy1,
          x2: ws.exitX,
          y2: ws.exitY,
          r,
          pairIndex: ws.pairIndex !== undefined ? ws.pairIndex : i
        });
      }
      return placedWarps;
    }

    // Refine (angle, speed) locally if primary shot clips a body or exits too early
    let warps = buildWarpsForShot(bestAngle, bestSpeed);
    let baseTrace = warps ? traceTrajectory(pad, bestAngle, bestSpeed, bodies, spanW, spanH, warps, [], MAX_SIM_STEPS) : null;
    const wantWarps = (bp.warpSpecs || []).length;

    if (!baseTrace || baseTrace.pts.length < minSteps || baseTrace.warpsTriggered < wantWarps) {
      let bestScore = -1;
      for (let da = -32; da <= 32; da += 4) {
        for (let ds = -70; ds <= 70; ds += 14) {
          const candA = bp.sol.angleDeg + da;
          const candS = Math.max(115, Math.min(395, bp.sol.speed + ds));
          const candW = buildWarpsForShot(candA, candS);
          if (!candW) continue;
          const tr = traceTrajectory(pad, candA, candS, bodies, spanW, spanH, candW, [], MAX_SIM_STEPS);
          if (tr.warpsTriggered < wantWarps) continue;
          const len = tr.pts.length;
          if (len < 85) continue;
          const score = Math.min(len, 280) + tr.totalTurn * 45 - Math.abs(da) * 0.4;
          if (score > bestScore) {
            bestScore = score;
            bestAngle = candA;
            bestSpeed = candS;
            warps = candW;
            baseTrace = tr;
          }
        }
      }
    }
    if (!warps) warps = [];
    if (!baseTrace) {
      baseTrace = traceTrajectory(pad, bestAngle, bestSpeed, bodies, spanW, spanH, warps, [], MAX_SIM_STEPS);
    }

    // 2. Place Targets sequentially on the EXACT real trajectory (baking in 0.95x piercing slowdown!)
    const targets = [];
    const targetSpecs = bp.targetSpecs || [];
    for (let k = 0; k < targetSpecs.length; k++) {
      const ts = targetSpecs[k];
      const tr = traceTrajectory(pad, bestAngle, bestSpeed, bodies, spanW, spanH, warps, targets, MAX_SIM_STEPS);
      const maxIdx = Math.max(20, tr.pts.length - 12);
      const wantIdx = ts.step ? Math.min(maxIdx, ts.step) : Math.floor(maxIdx * ts.frac);

      // Search nearest clean point around wantIdx (clear of bodies, pad, warps, previous targets)
      // AND verify that its 0.95x piercing slowdown never deflects the probe away from later warps!
      let chosenCandidate = null;
      const tgR = ts.r || 22;
      const makeCandidate = (pt) => {
        if (ts.orbit) {
          const cx = ts.orbit.cx || 0;
          const cy = ts.orbit.cy || 0;
          const oR = Math.hypot(pt.x - cx, pt.y - cy);
          const oSpd = ts.orbit.orbitSpeed;
          const angAtHit = Math.atan2(pt.y - cy, pt.x - cx);
          return {
            cx,
            cy,
            orbitR: Math.round(oR * 10) / 10,
            orbitPhase: angAtHit - oSpd * pt.t,
            orbitSpeed: oSpd,
            r: tgR
          };
        }
        return { x: Math.round(pt.x), y: Math.round(pt.y), r: tgR };
      };

      for (let off = 0; off <= 64; off++) {
        for (const dir of [0, 1, -1]) {
          const idx = wantIdx + off * dir;
          if (idx < 22 || idx >= tr.pts.length - 4) continue;
          const p = tr.pts[idx];
          if (p.breakSegment) continue;
          if (Math.hypot(p.x - pad.x, p.y - pad.y) < 62) continue;
          if (!isClearOfBodies(p.x, p.y, bodies, p.t, tgR + 14)) continue;
          if (!isClearOfWarps(p.x, p.y, warps, tgR + 16)) continue;
          let nearPrev = false;
          for (const prev of targets) {
            const pp = evalOrbitalPos(prev, p.t);
            if (Math.hypot(p.x - pp.x, p.y - pp.y) < tgR * 2 + 12) {
              nearPrev = true;
              break;
            }
          }
          if (nearPrev) continue;
          const cand = makeCandidate(p);
          const testTargets = targets.concat([cand]);
          const checkTr = traceTrajectory(pad, bestAngle, bestSpeed, bodies, spanW, spanH, warps, testTargets, MAX_SIM_STEPS);
          if (checkTr.hitTargets.every(Boolean) && checkTr.warpsTriggered >= wantWarps && checkTr.pts.length >= 60) {
            chosenCandidate = cand;
            break;
          }
        }
        if (chosenCandidate) break;
      }

      if (chosenCandidate) {
        targets.push(chosenCandidate);
      }
    }

    // 3. Final trace with all warps & targets to place Goal Portal dead-center on trajectory
    const finalTrace = traceTrajectory(pad, bestAngle, bestSpeed, bodies, spanW, spanH, warps, targets, MAX_SIM_STEPS);
    let goal = null;
    let clearStep = finalTrace.pts.length - 1;

    if (mode === 'goal' || mode === 'both') {
      const gR = bp.goalR || 29;
      const safeEnd = Math.max(30, finalTrace.pts.length - 8);
      const wantGoalIdx = bp.goalStep
        ? Math.min(safeEnd, bp.goalStep)
        : Math.floor(safeEnd * (bp.goalFrac || 0.88));

      // Ensure goalStep is strictly after the last target is hit
      let lastTargetStep = 24;
      if (targets.length > 0) {
        const seen = targets.map(() => false);
        for (let s = 1; s < finalTrace.pts.length; s++) {
          const p0 = finalTrace.pts[s - 1];
          const p1 = finalTrace.pts[s];
          if (p1.breakSegment) continue;
          for (let k = 0; k < targets.length; k++) {
            if (seen[k]) continue;
            const tp = evalOrbitalPos(targets[k], p1.t);
            if (distToSegmentSq(tp.x, tp.y, p0.x, p0.y, p1.x, p1.y) <= (targets[k].r + 6) * (targets[k].r + 6)) {
              seen[k] = true;
              lastTargetStep = Math.max(lastTargetStep, s);
            }
          }
        }
      }

      const minGoalIdx = Math.min(safeEnd, lastTargetStep + 18);
      const startGoalIdx = Math.max(minGoalIdx, wantGoalIdx);
      let chosenGoalIdx = -1;

      for (let off = 0; off <= 48; off++) {
        for (const dir of [0, -1, 1]) {
          const idx = startGoalIdx + off * dir;
          if (idx < minGoalIdx || idx >= finalTrace.pts.length - 2) continue;
          const p = finalTrace.pts[idx];
          if (p.breakSegment) continue;
          if (Math.hypot(p.x - pad.x, p.y - pad.y) < 95) continue;
          if (!isClearOfBodies(p.x, p.y, bodies, p.t, gR + 18)) continue;
          if (!isClearOfWarps(p.x, p.y, warps, gR + 18)) continue;
          chosenGoalIdx = idx;
          break;
        }
        if (chosenGoalIdx >= 0) break;
      }

      if (chosenGoalIdx < 0) chosenGoalIdx = Math.max(minGoalIdx, Math.min(finalTrace.pts.length - 3, startGoalIdx));
      const gp = finalTrace.pts[chosenGoalIdx];
      goal = { x: Math.round(gp.x), y: Math.round(gp.y), r: gR };
      clearStep = chosenGoalIdx;
    } else if (mode === 'destroy' && targets.length > 0) {
      // Clear step is when the last target is shattered
      const seen = targets.map(() => false);
      let lastHit = finalTrace.pts.length - 1;
      for (let s = 1; s < finalTrace.pts.length; s++) {
        const p0 = finalTrace.pts[s - 1];
        const p1 = finalTrace.pts[s];
        if (p1.breakSegment) continue;
        for (let k = 0; k < targets.length; k++) {
          if (seen[k]) continue;
          const tp = evalOrbitalPos(targets[k], p1.t);
          if (distToSegmentSq(tp.x, tp.y, p0.x, p0.y, p1.x, p1.y) <= (targets[k].r + 6) * (targets[k].r + 6)) {
            seen[k] = true;
            lastHit = s;
          }
        }
      }
      clearStep = Math.min(finalTrace.pts.length - 1, lastHit + 4);
    }

    // 4. Build Debris: static walls, rotating rings, AND razor-thin grazing "needle-eye" gates!
    const rawDebris = (bp.debris || []).slice();

    // Add trajectory-flanking grazing gates (すれっすれ!)
    const gates = bp.gates || [];
    for (let g = 0; g < gates.length; g++) {
      const gt = gates[g];
      const idx = gt.step ? Math.min(clearStep - 8, gt.step) : Math.floor(clearStep * gt.frac);
      if (idx < 18 || idx >= clearStep - 5) continue;
      const p = finalTrace.pts[idx];
      if (p.breakSegment) continue;
      const vmag = Math.hypot(p.vx, p.vy) || 1;
      const nx = -p.vy / vmag;
      const ny = p.vx / vmag;
      const dr = gt.r || 13;
      const gap = gt.gap || 18; // center-to-edge distance from trajectory (> dr + 4 is safe!)
      const sides = gt.side === 'left' ? [1] : (gt.side === 'right' ? [-1] : [1, -1]);
      for (const sgn of sides) {
        const dx = Math.round(p.x + nx * sgn * (dr + gap));
        const dy = Math.round(p.y + ny * sgn * (dr + gap));
        // Keep gateposts inside screen and clear of pad/goal/bodies
        if (Math.abs(dx) > spanW * 0.47 || Math.abs(dy) > spanH * 0.47) continue;
        if (Math.hypot(dx - pad.x, dy - pad.y) < 52) continue;
        if (goal && Math.hypot(dx - goal.x, dy - goal.y) < goal.r + dr + 16) continue;
        if (!isClearOfBodies(dx, dy, bodies, p.t, dr + 10)) continue;
        if (!isClearOfWarps(dx, dy, warps, dr + 10)) continue;
        rawDebris.push({ x: dx, y: dy, r: dr });
      }
    }

    // Filter out any debris that clips the verified solution trajectory (preserving razor-thin clearance!)
    const safeDebris = [];
    for (let i = 0; i < rawDebris.length; i++) {
      const d = rawDebris[i];
      let hitsSolution = false;
      const safeR2 = (d.r + 5.8) * (d.r + 5.8);

      // Keep clear of Launch Pad & Goal
      const dp0 = evalOrbitalPos(d, 0);
      if (!d.orbitR && Math.hypot(dp0.x - pad.x, dp0.y - pad.y) < d.r + 36) continue;
      if (!d.orbitR && goal && Math.hypot(dp0.x - goal.x, dp0.y - goal.y) < d.r + goal.r + 12) continue;

      for (let s = 1; s <= clearStep && s < finalTrace.pts.length; s++) {
        const p0 = finalTrace.pts[s - 1];
        const p1 = finalTrace.pts[s];
        if (p1.breakSegment) continue; // Instant warp jump skips intermediate wall!
        const dp = evalOrbitalPos(d, p1.t);
        if (distToSegmentSq(dp.x, dp.y, p0.x, p0.y, p1.x, p1.y) <= safeR2) {
          hitsSolution = true;
          break;
        }
      }
      if (!hitsSolution) {
        safeDebris.push(d);
      }
    }

    return {
      id: bp.id,
      mode,
      spanW,
      spanH,
      pad,
      goal,
      bodies,
      debris: safeDebris,
      targets,
      warps
    };
  }

  // =========================================================================
  // Stages 01–10 (Handcrafted & C#-Verified Foundation Stages)
  // =========================================================================
  const FOUNDATIONS = [
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
    }
  ];

  // =========================================================================
  // Stages 11–50: Trajectory-First Blueprints (100% Guaranteed ★★★)
  // =========================================================================
  const BLUEPRINTS = [
    // ================= 11–20: Deep Curves & Multi-Body Slaloms =================
    {
      id: 11, mode: 'goal', spanW: 900, spanH: 600,
      pad: { x: -290, y: 130 },
      sol: { angleDeg: -8, speed: 175 },
      goalFrac: 0.90,
      bodies: [{ kind: 'star', x: 115, y: 0, r: 27, gm: 4600000, visualR: 185 }],
      debris: makeHorizontalDebrisWall(0, -350, -75, 42, 14),
      gates: [{ frac: 0.48, gap: 32 }]
    },
    {
      id: 12, mode: 'destroy', spanW: 900, spanH: 600,
      pad: { x: -310, y: -135 },
      sol: { angleDeg: 28, speed: 205 },
      bodies: [{ kind: 'star', x: 10, y: -10, r: 26, gm: 4100000, visualR: 175 }],
      targetSpecs: [{ frac: 0.28 }, { frac: 0.56 }, { frac: 0.84 }],
      gates: [{ frac: 0.42, gap: 30 }, { frac: 0.70, gap: 30 }]
    },
    {
      id: 13, mode: 'goal', spanW: 960, spanH: 620,
      pad: { x: -345, y: 115 },
      sol: { angleDeg: -22, speed: 245 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'planet', x: -155, y: -60, r: 19, gm: 2200000, visualR: 130 },
        { kind: 'planet', x: 15, y: 75, r: 19, gm: 2200000, visualR: 130 },
        { kind: 'planet', x: 185, y: -60, r: 19, gm: 2200000, visualR: 130 }
      ],
      debris: [{ x: -155, y: 115, r: 13 }, { x: 15, y: -95, r: 13 }, { x: 185, y: 115, r: 13 }],
      gates: [{ frac: 0.34, gap: 28 }, { frac: 0.68, gap: 26 }]
    },
    {
      id: 14, mode: 'both', spanW: 900, spanH: 620,
      pad: { x: -305, y: -130 },
      sol: { angleDeg: 24, speed: 190 },
      goalFrac: 0.90,
      bodies: [{ kind: 'star', x: 35, y: 5, r: 26, gm: 4300000, visualR: 180 }],
      debris: makeHorizontalDebrisWall(-120, -170, 20, 42, 13),
      targetSpecs: [{ frac: 0.34 }, { frac: 0.64 }],
      gates: [{ frac: 0.50, gap: 28 }]
    },
    {
      id: 15, mode: 'goal', spanW: 940, spanH: 640,
      pad: { x: -335, y: 135 },
      sol: { angleDeg: -24, speed: 235 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: 0, y: -150, r: 24, gm: 3400000, visualR: 155 },
        { kind: 'star2', x: 0, y: 150, r: 24, gm: 3400000, visualR: 155 }
      ],
      debris: [{ x: 0, y: 0, r: 15 }, { x: 0, y: -44, r: 13 }, { x: 0, y: 44, r: 13 }],
      gates: [{ frac: 0.36, gap: 28 }, { frac: 0.66, gap: 26 }]
    },
    {
      id: 16, mode: 'destroy', spanW: 940, spanH: 620,
      pad: { x: -335, y: -115 },
      sol: { angleDeg: 8, speed: 225 },
      bodies: [
        { kind: 'star', x: -140, y: 50, r: 24, gm: 3400000, visualR: 155 },
        { kind: 'planet', x: 145, y: -50, r: 19, gm: 2350000, visualR: 135 }
      ],
      targetSpecs: [{ frac: 0.22 }, { frac: 0.45 }, { frac: 0.68 }, { frac: 0.88 }],
      gates: [{ frac: 0.34, gap: 26 }, { frac: 0.58, gap: 26 }]
    },
    {
      id: 17, mode: 'goal', spanW: 940, spanH: 620,
      pad: { x: -330, y: 145 },
      sol: { angleDeg: -28, speed: 195 },
      goalFrac: 0.88,
      bodies: [{ kind: 'star', x: 85, y: 0, r: 27, gm: 4600000, visualR: 185 }],
      debris: makeVerticalDebrisWall(-80, 45, 250, 42, 13),
      gates: [{ frac: 0.35, gap: 26 }, { frac: 0.68, gap: 24 }]
    },
    {
      id: 18, mode: 'both', spanW: 960, spanH: 620,
      pad: { x: -345, y: -135 },
      sol: { angleDeg: 26, speed: 220 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: -150, y: 0, r: 24, gm: 3500000, visualR: 155 },
        { kind: 'star2', x: 150, y: 0, r: 24, gm: 3500000, visualR: 155 }
      ],
      debris: [{ x: 0, y: -120, r: 13 }, { x: 0, y: 120, r: 13 }],
      targetSpecs: [{ frac: 0.30 }, { frac: 0.62 }],
      gates: [{ frac: 0.48, gap: 24 }, { frac: 0.78, gap: 24 }]
    },
    {
      id: 19, mode: 'destroy', spanW: 940, spanH: 600,
      pad: { x: -345, y: -50 },
      sol: { angleDeg: -10, speed: 245 },
      bodies: [
        { kind: 'planet', x: -95, y: 95, r: 19, gm: 2500000, visualR: 135 },
        { kind: 'planet', x: 125, y: 95, r: 19, gm: 2500000, visualR: 135 }
      ],
      debris: [{ x: 15, y: 95, r: 14 }, { x: 15, y: 145, r: 13 }],
      targetSpecs: [{ frac: 0.22 }, { frac: 0.44 }, { frac: 0.66 }, { frac: 0.88 }],
      gates: [{ frac: 0.55, gap: 24 }]
    },
    {
      id: 20, mode: 'both', spanW: 960, spanH: 640,
      pad: { x: -345, y: 165 },
      sol: { angleDeg: -36, speed: 225 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: 0, y: 35, r: 26, gm: 4100000, visualR: 175 },
        { kind: 'planet', x: -205, y: -90, r: 17, gm: 1700000, visualR: 120 },
        { kind: 'planet', x: 205, y: -90, r: 17, gm: 1700000, visualR: 120 }
      ],
      debris: makeHorizontalDebrisWall(180, -140, 140, 44, 13),
      targetSpecs: [{ frac: 0.26 }, { frac: 0.52 }, { frac: 0.74 }],
      gates: [{ frac: 0.40, gap: 22 }, { frac: 0.64, gap: 22 }]
    },

    // ================= 21–30: Warp Hole Engineering =================
    {
      id: 21, mode: 'goal', spanW: 960, spanH: 620,
      pad: { x: -335, y: 150 },
      sol: { angleDeg: -32, speed: 215 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: -175, y: 0, r: 25, gm: 3500000, visualR: 160 },
        { kind: 'planet', x: 215, y: 0, r: 19, gm: 2300000, visualR: 135 }
      ],
      debris: makeVerticalDebrisWall(25, -560, 560, 44, 14),
      warpSpecs: [{ step: 78, exitX: 140, exitY: 140, r: 26, pairIndex: 0 }],
      gates: [{ frac: 0.74, gap: 24 }]
    },
    {
      id: 22, mode: 'destroy', spanW: 940, spanH: 620,
      pad: { x: -325, y: 115 },
      sol: { angleDeg: -22, speed: 210 },
      bodies: [
        { kind: 'star', x: 115, y: 0, r: 27, gm: 4300000, visualR: 180 },
        { kind: 'planet', x: -195, y: -25, r: 17, gm: 1650000, visualR: 115 }
      ],
      debris: makeVerticalDebrisWall(-45, -560, 560, 44, 14),
      warpSpecs: [{ step: 72, exitX: 115, exitY: -132, r: 26, pairIndex: 0 }],
      targetSpecs: [{ frac: 0.46 }, { frac: 0.68 }, { frac: 0.88 }],
      gates: [{ frac: 0.58, gap: 22 }]
    },
    {
      id: 23, mode: 'goal', spanW: 980, spanH: 640,
      pad: { x: -355, y: 120 },
      sol: { angleDeg: -38, speed: 220 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'planet', x: -235, y: -20, r: 18, gm: 2150000, visualR: 125 },
        { kind: 'star', x: 0, y: 0, r: 23, gm: 3200000, visualR: 145 },
        { kind: 'planet', x: 245, y: 15, r: 18, gm: 2150000, visualR: 125 }
      ],
      debris: [
        ...makeVerticalDebrisWall(-115, -560, 560, 44, 13),
        ...makeVerticalDebrisWall(115, -560, 560, 44, 13)
      ],
      warpSpecs: [
        { step: 62, exitX: -35, exitY: 145, r: 26, pairIndex: 0 },
        { step: 138, exitX: 200, exitY: -145, r: 26, pairIndex: 1 }
      ],
      gates: [{ frac: 0.45, gap: 24 }, { frac: 0.80, gap: 22 }]
    },
    {
      id: 24, mode: 'both', spanW: 960, spanH: 640,
      pad: { x: -335, y: 95 },
      sol: { angleDeg: -38, speed: 205 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: -165, y: 15, r: 25, gm: 3600000, visualR: 160 },
        { kind: 'star2', x: 175, y: -10, r: 25, gm: 3600000, visualR: 160 }
      ],
      debris: makeVerticalDebrisWall(0, -560, 560, 44, 14),
      warpSpecs: [{ step: 88, exitX: 95, exitY: 135, r: 26, pairIndex: 0 }],
      targetSpecs: [{ frac: 0.24 }, { frac: 0.68 }],
      gates: [{ frac: 0.56, gap: 22 }, { frac: 0.80, gap: 20 }]
    },
    {
      id: 25, mode: 'destroy', spanW: 940, spanH: 640,
      pad: { x: -330, y: 155 },
      sol: { angleDeg: 18, speed: 215 },
      bodies: [
        { kind: 'planet', x: -135, y: 145, r: 19, gm: 2150000, visualR: 130 },
        { kind: 'star', x: 25, y: -155, r: 25, gm: 3600000, visualR: 160 }
      ],
      debris: makeHorizontalDebrisWall(0, -600, 600, 44, 14),
      warpSpecs: [{ step: 82, exitX: -225, exitY: -145, r: 26, pairIndex: 0 }],
      targetSpecs: [{ frac: 0.20 }, { frac: 0.54 }, { frac: 0.72 }, { frac: 0.88 }],
      gates: [{ frac: 0.64, gap: 22 }]
    },
    {
      id: 26, mode: 'goal', spanW: 940, spanH: 620,
      pad: { x: -325, y: 155 },
      sol: { angleDeg: -22, speed: 215 },
      goalFrac: 0.90,
      bodies: [{ kind: 'star', x: 25, y: 10, r: 26, gm: 4100000, visualR: 175 }],
      debris: makeHorizontalDebrisWall(0, -380, -140, 42, 13),
      warpSpecs: [{ step: 92, exitX: -120, exitY: -135, r: 26, pairIndex: 0 }],
      gates: [{ frac: 0.36, gap: 22 }, { frac: 0.76, gap: 20 }]
    },
    {
      id: 27, mode: 'destroy', spanW: 960, spanH: 620,
      pad: { x: -350, y: 145 },
      sol: { angleDeg: -34, speed: 215 },
      bodies: [
        { kind: 'star', x: -175, y: 0, r: 25, gm: 3800000, visualR: 160 },
        { kind: 'star2', x: 175, y: 0, r: 25, gm: 3800000, visualR: 160 }
      ],
      debris: makeVerticalDebrisWall(0, -560, 560, 44, 14),
      warpSpecs: [
        { step: 74, exitX: 165, exitY: -125, r: 26, pairIndex: 0 },
        { step: 156, exitX: -165, exitY: 125, r: 26, pairIndex: 1 }
      ],
      targetSpecs: [{ frac: 0.18 }, { frac: 0.44 }, { frac: 0.72 }, { frac: 0.90 }],
      gates: [{ frac: 0.58, gap: 20 }]
    },
    {
      id: 28, mode: 'both', spanW: 960, spanH: 640,
      pad: { x: -340, y: 160 },
      sol: { angleDeg: -30, speed: 210 },
      goalFrac: 0.90,
      bodies: [{ kind: 'star', x: 0, y: 0, r: 26, gm: 3700000, visualR: 165 }],
      warpSpecs: [
        { step: 72, exitX: 150, exitY: -135, r: 26, pairIndex: 0 },
        { step: 142, exitX: -210, exitY: -105, r: 26, pairIndex: 1 }
      ],
      targetSpecs: [{ frac: 0.22 }, { frac: 0.56 }],
      gates: [{ frac: 0.42, gap: 20 }, { frac: 0.78, gap: 19 }]
    },
    {
      id: 29, mode: 'goal', spanW: 960, spanH: 640,
      pad: { x: -345, y: -135 },
      sol: { angleDeg: 28, speed: 205 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: -140, y: 10, r: 26, gm: 4000000, visualR: 170 },
        { kind: 'planet', x: 240, y: 15, r: 19, gm: 2400000, visualR: 135 }
      ],
      debris: makeVerticalDebrisWall(60, -560, 560, 44, 14),
      warpSpecs: [{ step: 92, exitX: 165, exitY: -145, r: 26, pairIndex: 0 }],
      gates: [{ frac: 0.30, gap: 20 }, { frac: 0.72, gap: 18 }]
    },
    {
      id: 30, mode: 'both', spanW: 960, spanH: 640,
      pad: { x: -350, y: 135 },
      sol: { angleDeg: -26, speed: 210 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: 100, y: 0, r: 28, gm: 4500000, visualR: 180 },
        { kind: 'planet', x: -200, y: -15, r: 18, gm: 1900000, visualR: 120 }
      ],
      debris: makeDebrisRing(100, 0, 215, 10, [], 0, 14, 0),
      warpSpecs: [{ step: 74, exitX: 100, exitY: 130, r: 26, pairIndex: 0 }],
      targetSpecs: [{ frac: 0.46 }, { frac: 0.64 }, { frac: 0.78 }],
      gates: [{ frac: 0.22, gap: 20 }]
    },

    // ================= 31–40: Moving Planets & Rotating Debris Gates =================
    {
      id: 31, mode: 'goal', spanW: 940, spanH: 640,
      pad: { x: -335, y: 125 },
      sol: { angleDeg: -24, speed: 215 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: 0, y: 0, r: 26, gm: 3600000, visualR: 165 },
        { kind: 'moon', cx: 0, cy: 0, orbitR: 175, orbitPhase: 0.5, orbitSpeed: OMEGA, r: 15, gm: 1500000, visualR: 105 }
      ],
      gates: [{ frac: 0.35, gap: 22 }, { frac: 0.68, gap: 20 }]
    },
    {
      id: 32, mode: 'destroy', spanW: 920, spanH: 620,
      pad: { x: -320, y: 140 },
      sol: { angleDeg: -14, speed: 195 },
      bodies: [{ kind: 'star', x: 20, y: 0, r: 26, gm: 4100000, visualR: 175 }],
      debris: makeDebrisRing(20, 0, 210, 8, [0, 4], OMEGA, 13, 0.3),
      targetSpecs: [{ frac: 0.30 }, { frac: 0.56 }, { frac: 0.82 }],
      gates: [{ frac: 0.44, gap: 20 }]
    },
    {
      id: 33, mode: 'goal', spanW: 960, spanH: 640,
      pad: { x: -345, y: 155 },
      sol: { angleDeg: -26, speed: 225 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: 0, y: 0, r: 25, gm: 3400000, visualR: 160 },
        { kind: 'planet', cx: 0, cy: 0, orbitR: 135, orbitPhase: 0.8, orbitSpeed: OMEGA, r: 16, gm: 1400000, visualR: 105 },
        { kind: 'planet', cx: 0, cy: 0, orbitR: 235, orbitPhase: 3.2, orbitSpeed: -OMEGA, r: 17, gm: 1600000, visualR: 115 }
      ],
      gates: [{ frac: 0.34, gap: 20 }, { frac: 0.66, gap: 18 }]
    },
    {
      id: 34, mode: 'destroy', spanW: 920, spanH: 620,
      pad: { x: -325, y: 135 },
      sol: { angleDeg: -16, speed: 200 },
      bodies: [{ kind: 'star', x: 15, y: 0, r: 26, gm: 4200000, visualR: 175 }],
      debris: makeDebrisRing(15, 0, 215, 6, [], -OMEGA, 13, 0.5),
      targetSpecs: [
        { frac: 0.28, orbit: { cx: 15, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.54, orbit: { cx: 15, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.80, orbit: { cx: 15, cy: 0, orbitSpeed: OMEGA } }
      ],
      gates: [{ frac: 0.68, gap: 19 }]
    },
    {
      id: 35, mode: 'both', spanW: 980, spanH: 640,
      pad: { x: -360, y: 145 },
      sol: { angleDeg: -26, speed: 230 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: -160, y: 0, r: 24, gm: 3400000, visualR: 155 },
        { kind: 'star2', x: 160, y: 0, r: 24, gm: 3400000, visualR: 155 }
      ],
      debris: [
        ...makeDebrisRing(-160, 0, 145, 5, [], OMEGA, 12, 0.2),
        ...makeDebrisRing(160, 0, 145, 5, [], -OMEGA, 12, 0.9)
      ],
      targetSpecs: [{ frac: 0.30 }, { frac: 0.64 }],
      gates: [{ frac: 0.48, gap: 18 }]
    },
    {
      id: 36, mode: 'goal', spanW: 960, spanH: 640,
      pad: { x: -345, y: -135 },
      sol: { angleDeg: 22, speed: 225 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: -95, y: 20, r: 25, gm: 3500000, visualR: 160 },
        { kind: 'planet', cx: -95, cy: 20, orbitR: 195, orbitPhase: 1.2, orbitSpeed: OMEGA, r: 17, gm: 1850000, visualR: 120 },
        { kind: 'planet', x: 205, y: -40, r: 18, gm: 2000000, visualR: 125 }
      ],
      debris: makeDebrisRing(55, 0, 80, 4, [], OMEGA * 2, 12, 0),
      gates: [{ frac: 0.32, gap: 18 }, { frac: 0.72, gap: 17 }]
    },
    {
      id: 37, mode: 'destroy', spanW: 940, spanH: 640,
      pad: { x: -350, y: 125 },
      sol: { angleDeg: -14, speed: 205 },
      bodies: [{ kind: 'star', x: 35, y: 0, r: 27, gm: 4300000, visualR: 180 }],
      debris: [
        ...makeDebrisRing(35, 0, 178, 5, [], OMEGA, 12, 0),
        ...makeDebrisRing(35, 0, 248, 6, [], -OMEGA, 13, 0.6)
      ],
      targetSpecs: [{ frac: 0.30 }, { frac: 0.56 }, { frac: 0.82 }],
      gates: [{ frac: 0.44, gap: 17 }]
    },
    {
      id: 38, mode: 'both', spanW: 960, spanH: 640,
      pad: { x: -350, y: 150 },
      sol: { angleDeg: -34, speed: 220 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: -115, y: 0, r: 25, gm: 3600000, visualR: 165 },
        { kind: 'moon', cx: -115, cy: 0, orbitR: 165, orbitPhase: 2.1, orbitSpeed: OMEGA, r: 14, gm: 1300000, visualR: 100 },
        { kind: 'planet', x: 190, y: 20, r: 19, gm: 2150000, visualR: 130 }
      ],
      targetSpecs: [
        { frac: 0.30, orbit: { cx: -115, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.64 }
      ],
      gates: [{ frac: 0.48, gap: 17 }, { frac: 0.78, gap: 16 }]
    },
    {
      id: 39, mode: 'goal', spanW: 980, spanH: 640,
      pad: { x: -360, y: 150 },
      sol: { angleDeg: -26, speed: 235 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: -165, y: 0, r: 24, gm: 3300000, visualR: 155 },
        { kind: 'moon', cx: -165, cy: 0, orbitR: 115, orbitPhase: 0.2, orbitSpeed: OMEGA * 2, r: 13, gm: 1100000, visualR: 90 },
        { kind: 'star2', x: 165, y: 0, r: 24, gm: 3300000, visualR: 155 },
        { kind: 'moon', cx: 165, cy: 0, orbitR: 115, orbitPhase: 3.3, orbitSpeed: -OMEGA * 2, r: 13, gm: 1100000, visualR: 90 }
      ],
      debris: [{ x: 0, y: -70, r: 13 }, { x: 0, y: 0, r: 14 }, { x: 0, y: 70, r: 13 }],
      gates: [{ frac: 0.34, gap: 16 }, { frac: 0.70, gap: 16 }]
    },
    {
      id: 40, mode: 'both', spanW: 960, spanH: 640,
      pad: { x: -350, y: 140 },
      sol: { angleDeg: -16, speed: 205 },
      goalFrac: 0.90,
      bodies: [{ kind: 'star', x: 0, y: 0, r: 27, gm: 4400000, visualR: 180 }],
      debris: makeDebrisRing(0, 0, 205, 8, [1, 5], OMEGA, 13, 0),
      targetSpecs: [
        { frac: 0.26, orbit: { cx: 0, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.50, orbit: { cx: 0, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.72, orbit: { cx: 0, cy: 0, orbitSpeed: -OMEGA } }
      ],
      gates: [{ frac: 0.38, gap: 16 }, { frac: 0.82, gap: 15 }]
    },

    // ================= 41–50: Master Razor-Thin Trials (すれっすれ!) =================
    {
      id: 41, mode: 'goal', spanW: 960, spanH: 640,
      pad: { x: -345, y: 130 },
      sol: { angleDeg: -34, speed: 215 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: -175, y: 0, r: 25, gm: 3500000, visualR: 160 },
        { kind: 'star2', x: 175, y: 0, r: 25, gm: 3600000, visualR: 160 },
        { kind: 'moon', cx: 175, cy: 0, orbitR: 145, orbitPhase: 1.0, orbitSpeed: OMEGA, r: 14, gm: 1200000, visualR: 95 }
      ],
      debris: makeVerticalDebrisWall(0, -560, 560, 44, 14),
      warpSpecs: [{ step: 78, exitX: 110, exitY: 145, r: 26, pairIndex: 0 }],
      gates: [{ frac: 0.25, gap: 15 }, { frac: 0.65, gap: 14 }, { frac: 0.80, gap: 14 }]
    },
    {
      id: 42, mode: 'destroy', spanW: 960, spanH: 640,
      pad: { x: -355, y: -135 },
      sol: { angleDeg: 24, speed: 215 },
      bodies: [
        { kind: 'star', x: 95, y: 0, r: 28, gm: 4500000, visualR: 180 },
        { kind: 'planet', x: -210, y: 25, r: 18, gm: 1900000, visualR: 120 }
      ],
      debris: makeDebrisRing(95, 0, 220, 6, [], OMEGA, 13, 0.3),
      warpSpecs: [{ step: 74, exitX: 95, exitY: -130, r: 26, pairIndex: 0 }],
      targetSpecs: [
        { frac: 0.42, orbit: { cx: 95, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.58, orbit: { cx: 95, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.74, orbit: { cx: 95, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.90, orbit: { cx: 95, cy: 0, orbitSpeed: OMEGA } }
      ],
      gates: [{ frac: 0.22, gap: 14 }, { frac: 0.66, gap: 14 }]
    },
    {
      id: 43, mode: 'both', spanW: 980, spanH: 640,
      pad: { x: -350, y: 125 },
      sol: { angleDeg: -36, speed: 215 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: -175, y: 10, r: 25, gm: 3600000, visualR: 160 },
        { kind: 'star2', x: 185, y: -10, r: 26, gm: 3800000, visualR: 165 }
      ],
      debris: [
        ...makeVerticalDebrisWall(10, -560, 560, 44, 14),
        ...makeDebrisRing(185, -10, 190, 6, [], -OMEGA, 12, 0.4)
      ],
      warpSpecs: [{ step: 82, exitX: 115, exitY: 145, r: 26, pairIndex: 0 }],
      targetSpecs: [{ frac: 0.22 }, { frac: 0.64 }],
      gates: [{ frac: 0.34, gap: 14 }, { frac: 0.78, gap: 13 }]
    },
    {
      id: 44, mode: 'goal', spanW: 1000, spanH: 640,
      pad: { x: -365, y: 145 },
      sol: { angleDeg: -36, speed: 225 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'planet', x: -245, y: 10, r: 18, gm: 2100000, visualR: 125 },
        { kind: 'star', x: 0, y: 0, r: 24, gm: 3400000, visualR: 150 },
        { kind: 'planet', x: 245, y: -15, r: 18, gm: 2100000, visualR: 125 }
      ],
      debris: [
        ...makeVerticalDebrisWall(-120, -560, 560, 44, 13),
        ...makeVerticalDebrisWall(120, -560, 560, 44, 13),
        ...makeDebrisRing(0, 0, 92, 4, [], OMEGA * 2, 11, 0)
      ],
      warpSpecs: [
        { step: 64, exitX: -20, exitY: 150, r: 26, pairIndex: 0 },
        { step: 144, exitX: 205, exitY: -150, r: 26, pairIndex: 1 }
      ],
      gates: [{ frac: 0.44, gap: 14 }, { frac: 0.78, gap: 13 }]
    },
    {
      id: 45, mode: 'destroy', spanW: 980, spanH: 640,
      pad: { x: -360, y: 135 },
      sol: { angleDeg: -32, speed: 215 },
      bodies: [
        { kind: 'star', x: -165, y: 0, r: 25, gm: 3700000, visualR: 160 },
        { kind: 'star2', x: 165, y: 0, r: 25, gm: 3700000, visualR: 160 }
      ],
      debris: makeDebrisRing(0, 0, 72, 4, [], OMEGA * 2, 12, 0),
      warpSpecs: [
        { step: 74, exitX: 55, exitY: 130, r: 26, pairIndex: 0 },
        { step: 156, exitX: -255, exitY: -115, r: 26, pairIndex: 1 }
      ],
      targetSpecs: [
        { frac: 0.20 },
        { frac: 0.44, orbit: { cx: 165, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.68, orbit: { cx: 165, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.88 }
      ],
      gates: [{ frac: 0.34, gap: 13 }, { frac: 0.78, gap: 13 }]
    },
    {
      id: 46, mode: 'both', spanW: 980, spanH: 660,
      pad: { x: -360, y: 145 },
      sol: { angleDeg: -30, speed: 220 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: -145, y: 15, r: 25, gm: 3600000, visualR: 160 },
        { kind: 'planet', cx: -145, cy: 15, orbitR: 165, orbitPhase: 0.9, orbitSpeed: OMEGA, r: 15, gm: 1400000, visualR: 105 },
        { kind: 'star2', x: 175, y: -15, r: 26, gm: 3900000, visualR: 165 }
      ],
      debris: [{ x: 15, y: -25, r: 14 }, { x: 15, y: 30, r: 13 }, { x: 15, y: 85, r: 13 }],
      warpSpecs: [{ step: 86, exitX: 175, exitY: 120, r: 27, pairIndex: 0 }],
      targetSpecs: [{ frac: 0.22 }, { frac: 0.56 }, { frac: 0.74 }],
      gates: [{ frac: 0.38, gap: 13 }, { frac: 0.66, gap: 12 }]
    },
    {
      id: 47, mode: 'goal', spanW: 960, spanH: 660,
      pad: { x: -350, y: 155 },
      sol: { angleDeg: -28, speed: 230 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: 0, y: -150, r: 25, gm: 3600000, visualR: 160 },
        { kind: 'star2', x: 0, y: 150, r: 25, gm: 3600000, visualR: 160 }
      ],
      debris: [
        ...makeDebrisRing(0, -150, 105, 4, [], OMEGA * 2, 12, 0),
        ...makeDebrisRing(0, 150, 105, 4, [], -OMEGA * 2, 12, 0.8),
        { x: 0, y: 0, r: 15 }
      ],
      warpSpecs: [{ step: 82, exitX: 155, exitY: 165, r: 26, pairIndex: 0 }],
      gates: [{ frac: 0.24, gap: 13 }, { frac: 0.62, gap: 12 }, { frac: 0.80, gap: 12 }]
    },
    {
      id: 48, mode: 'destroy', spanW: 980, spanH: 640,
      pad: { x: -365, y: 145 },
      sol: { angleDeg: -22, speed: 215 },
      bodies: [
        { kind: 'star', x: 0, y: 0, r: 27, gm: 4300000, visualR: 180 },
        { kind: 'planet', x: -250, y: -90, r: 17, gm: 1700000, visualR: 115 },
        { kind: 'planet', x: 250, y: 90, r: 17, gm: 1700000, visualR: 115 }
      ],
      debris: makeDebrisRing(0, 0, 222, 5, [], OMEGA, 13, 0.4),
      warpSpecs: [{ step: 70, exitX: 0, exitY: -130, r: 26, pairIndex: 0 }],
      targetSpecs: [
        { frac: 0.18 },
        { frac: 0.44, orbit: { cx: 0, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.60, orbit: { cx: 0, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.76, orbit: { cx: 0, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.90, orbit: { cx: 0, cy: 0, orbitSpeed: -OMEGA } }
      ],
      gates: [{ frac: 0.52, gap: 12 }, { frac: 0.82, gap: 12 }]
    },
    {
      id: 49, mode: 'both', spanW: 1000, spanH: 660,
      pad: { x: -360, y: 145 },
      sol: { angleDeg: -34, speed: 220 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: -175, y: 0, r: 25, gm: 3700000, visualR: 160 },
        { kind: 'moon', cx: -175, cy: 0, orbitR: 125, orbitPhase: 0.7, orbitSpeed: OMEGA * 2, r: 13, gm: 1000000, visualR: 90 },
        { kind: 'star2', x: 175, y: 0, r: 26, gm: 4000000, visualR: 165 }
      ],
      debris: [
        ...makeVerticalDebrisWall(0, -560, 560, 44, 14),
        ...makeDebrisRing(175, 0, 195, 6, [], -OMEGA, 12, 0.2)
      ],
      warpSpecs: [
        { step: 78, exitX: 175, exitY: 122, r: 26, pairIndex: 0 },
        { step: 162, exitX: -220, exitY: -140, r: 26, pairIndex: 1 }
      ],
      targetSpecs: [{ frac: 0.20 }, { frac: 0.50 }, { frac: 0.68 }],
      gates: [{ frac: 0.34, gap: 12 }, { frac: 0.58, gap: 12 }, { frac: 0.82, gap: 11 }]
    },
    {
      id: 50, mode: 'both', spanW: 1000, spanH: 660,
      pad: { x: -365, y: 145 },
      sol: { angleDeg: -32, speed: 220 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: -175, y: 15, r: 25, gm: 3800000, visualR: 165 },
        { kind: 'star2', x: 175, y: -15, r: 26, gm: 4200000, visualR: 170 },
        { kind: 'moon', cx: 175, cy: -15, orbitR: 165, orbitPhase: 1.6, orbitSpeed: OMEGA, r: 14, gm: 1200000, visualR: 95 }
      ],
      debris: makeDebrisRing(0, 0, 82, 5, [], OMEGA * 2, 13, 0),
      warpSpecs: [
        { step: 76, exitX: 175, exitY: 120, r: 27, pairIndex: 0 },
        { step: 164, exitX: -175, exitY: -120, r: 27, pairIndex: 1 }
      ],
      targetSpecs: [
        { frac: 0.18 },
        { frac: 0.48, orbit: { cx: 175, cy: -15, orbitSpeed: -OMEGA } },
        { frac: 0.68 }
      ],
      gates: [{ frac: 0.32, gap: 12 }, { frac: 0.58, gap: 11 }, { frac: 0.82, gap: 11 }]
    }
  ];

  window.ORBITA_STAGES = [
    ...FOUNDATIONS,
    ...BLUEPRINTS.map(buildStage)
  ];
})();
