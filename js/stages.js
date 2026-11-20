/**
 * ORBITA MISSION — 50 Mathematically Guaranteed 3-Star (1-Shot) Stages
 *
 * - Stages 01–10: Handcrafted & verified foundation stages.
 * - Stages 11–50: Deterministic Trajectory-First Generator:
 *   1. Searches & verifies a high-curvature multi-body swing-by solution shot first
 *      (up to 7 stars/planets/moons interacting simultaneously!).
 *   2. Places Warp Holes, 3–6 Destructible Targets (mixing orbiting constellations &
 *      non-sequential looping positions so they never look like breadcrumb hints),
 *      and Goal Portals directly onto the verified 1/60s Verlet trajectory.
 *   3. Seals off boring direct/cheese shortcuts with automatic line-of-sight blockers
 *      and symmetric/scattered asteroid fields that preserve razor-thin (すれっすれ)
 *      clearance along the true solution while hiding the route naturally.
 *   4. All moving planets, orbiting targets, and rotating rings share a 9.0s harmonic
 *      period (OMEGA = 2π/9) so the exact ★★★ window repeats reliably forever.
 */
(function () {
  const FIXED_DT = 1 / 60;
  const MAX_SIM_STEPS = 345; // Fits 100% inside puzzle.js PREVIEW_STEPS (360)
  const OMEGA = (Math.PI * 2) / 9.0;

  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

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
    const closeBodies = new Set();

    for (let step = 1; step <= maxSteps; step++) {
      const a1 = computeAccel(x, y, bodies, t);
      const nx = x + vx * FIXED_DT + 0.5 * a1.ax * FIXED_DT * FIXED_DT;
      const ny = y + vy * FIXED_DT + 0.5 * a1.ay * FIXED_DT * FIXED_DT;
      const tNext = t + FIXED_DT;
      const a2 = computeAccel(nx, ny, bodies, tNext);
      let nvx = vx + 0.5 * (a1.ax + a2.ax) * FIXED_DT;
      let nvy = vy + 0.5 * (a1.ay + a2.ay) * FIXED_DT;
      if (warpCd > 0) warpCd -= FIXED_DT;

      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        const bp = evalOrbitalPos(b, tNext);
        const d2 = distToSegmentSq(bp.x, bp.y, x, y, nx, ny);
        if (d2 <= (b.r + 4.5) * (b.r + 4.5)) {
          crashed = true;
          break;
        }
        if (d2 <= (b.r * 5.2) * (b.r * 5.2)) {
          closeBodies.add(i);
        }
      }
      if (crashed) break;

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

    return {
      pts,
      crashed,
      outOfBounds,
      totalTurn,
      hitTargets,
      warpsTriggered,
      bodiesVisited: closeBodies.size
    };
  }

  /**
   * Builds a guaranteed 1-shot ★★★ solvable stage from a trajectory-first blueprint:
   * - Selects a richly curved multi-body trajectory (never a boring straight line).
   * - Places warps & targets (orbiting + non-sequential) directly on the verified curve.
   * - Adds anti-cheese direct-line blockers and symmetric/scattered asteroid fields
   *   so targets/debris do NOT telegraph the exact solution line while blocking shortcuts.
   */
  function buildStage(bp) {
    const spanW = bp.spanW || 960;
    const spanH = bp.spanH || 640;
    const pad = bp.pad;
    const bodies = bp.bodies;
    const mode = bp.mode;
    const minSteps = bp.minSteps || 180;
    const wantWarps = (bp.warpSpecs || []).length;
    const rng = makeRng(bp.id * 2654435761 + 17);

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

    // 1. Search local angle/speed neighborhood to pick a richly curved, multi-body solution!
    let bestAngle = bp.sol.angleDeg;
    let bestSpeed = bp.sol.speed;
    let warps = buildWarpsForShot(bestAngle, bestSpeed);
    let baseTrace = warps ? traceTrajectory(pad, bestAngle, bestSpeed, bodies, spanW, spanH, warps, [], MAX_SIM_STEPS) : null;

    const scoreTrace = (tr, da) => {
      if (!tr || tr.warpsTriggered < wantWarps || tr.pts.length < 95) return -1;
      return (
        Math.min(tr.pts.length, 310) * 0.9 +
        tr.totalTurn * 65 +
        tr.bodiesVisited * 55 -
        Math.abs(da) * 0.25
      );
    };

    let bestScore = scoreTrace(baseTrace, 0);
    // Always refine multi-body stages (>= 4 bodies) or when primary shot is short/straight
    if (bestScore < 280 || bodies.length >= 4 || !baseTrace || baseTrace.pts.length < minSteps) {
      for (let da = -30; da <= 30; da += 5) {
        for (let ds = -65; ds <= 65; ds += 13) {
          const candA = bp.sol.angleDeg + da;
          const candS = Math.max(118, Math.min(390, bp.sol.speed + ds));
          const candW = buildWarpsForShot(candA, candS);
          if (!candW) continue;
          const tr = traceTrajectory(pad, candA, candS, bodies, spanW, spanH, candW, [], MAX_SIM_STEPS);
          const sc = scoreTrace(tr, da);
          if (sc > bestScore) {
            bestScore = sc;
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

    // 2. Place Targets sequentially (mixing orbiting constellations & non-sequential positions
    //    so they look symmetric/scattered instead of a breadcrumb trail!)
    const targets = [];
    const targetSpecs = bp.targetSpecs || [];
    for (let k = 0; k < targetSpecs.length; k++) {
      const ts = targetSpecs[k];
      const tr = traceTrajectory(pad, bestAngle, bestSpeed, bodies, spanW, spanH, warps, targets, MAX_SIM_STEPS);
      const maxIdx = Math.max(24, tr.pts.length - 12);
      const wantIdx = ts.step ? Math.min(maxIdx, ts.step) : Math.floor(maxIdx * ts.frac);

      let chosenCandidate = null;
      const tgR = ts.r || 21;

      const makeCandidate = (pt) => {
        if (ts.orbit) {
          let cx = ts.orbit.cx || 0;
          let cy = ts.orbit.cy || 0;
          if (ts.orbit.bodyIdx !== undefined && bodies[ts.orbit.bodyIdx]) {
            const refB = evalOrbitalPos(bodies[ts.orbit.bodyIdx], 0);
            cx = refB.x;
            cy = refB.y;
          }
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

      for (let off = 0; off <= 70; off++) {
        for (const dir of [0, 1, -1]) {
          const idx = wantIdx + off * dir;
          if (idx < 20 || idx >= tr.pts.length - 4) continue;
          const p = tr.pts[idx];
          if (p.breakSegment) continue;
          if (Math.hypot(p.x - pad.x, p.y - pad.y) < 58) continue;
          if (!isClearOfBodies(p.x, p.y, bodies, p.t, tgR + 13)) continue;
          if (!isClearOfWarps(p.x, p.y, warps, tgR + 14)) continue;
          let nearPrev = false;
          for (const prev of targets) {
            const pp = evalOrbitalPos(prev, p.t);
            if (Math.hypot(p.x - pp.x, p.y - pp.y) < tgR * 2 + 10) {
              nearPrev = true;
              break;
            }
          }
          if (nearPrev) continue;
          const cand = makeCandidate(p);
          const testTargets = targets.concat([cand]);
          const checkTr = traceTrajectory(pad, bestAngle, bestSpeed, bodies, spanW, spanH, warps, testTargets, MAX_SIM_STEPS);
          if (checkTr.hitTargets.every(Boolean) && checkTr.warpsTriggered >= wantWarps && checkTr.pts.length >= 65) {
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

    // 3. Final verified trace to place Goal Portal strictly after all targets
    const finalTrace = traceTrajectory(pad, bestAngle, bestSpeed, bodies, spanW, spanH, warps, targets, MAX_SIM_STEPS);
    let goal = null;
    let clearStep = finalTrace.pts.length - 1;

    if (mode === 'goal' || mode === 'both') {
      const gR = bp.goalR || 28;
      const safeEnd = Math.max(30, finalTrace.pts.length - 6);
      const wantGoalIdx = bp.goalStep
        ? Math.min(safeEnd, bp.goalStep)
        : Math.floor(safeEnd * (bp.goalFrac || 0.90));

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

      const minGoalIdx = Math.min(safeEnd, lastTargetStep + 16);
      const startGoalIdx = Math.max(minGoalIdx, wantGoalIdx);
      let chosenGoalIdx = -1;

      for (let off = 0; off <= 54; off++) {
        for (const dir of [0, -1, 1]) {
          const idx = startGoalIdx + off * dir;
          if (idx < minGoalIdx || idx >= finalTrace.pts.length - 2) continue;
          const p = finalTrace.pts[idx];
          if (p.breakSegment) continue;
          if (Math.hypot(p.x - pad.x, p.y - pad.y) < 95) continue;
          if (!isClearOfBodies(p.x, p.y, bodies, p.t, gR + 16)) continue;
          if (!isClearOfWarps(p.x, p.y, warps, gR + 16)) continue;
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

    // 4. Build Debris:
    //    (a) Stage's handcrafted walls / rotating rings
    //    (b) Anti-cheese direct-line blockers between pad and goal (sealing easy shortcuts!)
    //    (c) Symmetric / scattered asteroid field across the whole arena (so obstacles look
    //        organic & balanced instead of telegraphing the solution!)
    //    (d) Optional subtle grazing rocks for late-stage すれっすれ tension
    const rawDebris = (bp.debris || []).slice();

    // (b) Automatic anti-cheese direct-line blockers
    if (goal && bp.blockDirect !== false) {
      const dx = goal.x - pad.x;
      const dy = goal.y - pad.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = -dy / dist;
      const ny = dx / dist;
      const steps = Math.max(4, Math.min(9, Math.floor(dist / 68)));
      for (let i = 1; i < steps; i++) {
        const f = i / steps;
        const bx = Math.round(pad.x + dx * f);
        const by = Math.round(pad.y + dy * f);
        rawDebris.push({ x: bx, y: by, r: 13 });
        if (bp.blockDirect === 'wide' && i % 2 === 1) {
          rawDebris.push({ x: Math.round(bx + nx * 42), y: Math.round(by + ny * 42), r: 12 });
          rawDebris.push({ x: Math.round(bx - nx * 42), y: Math.round(by - ny * 42), r: 12 });
        }
      }
    }

    // (c) Symmetric / scattered asteroid field (deterministic PRNG, looks organic & non-telegraphed!)
    const fieldCount = bp.fieldCount || 0;
    const symMode = bp.symField || 'rot';
    const minSpacing = 48;
    const fieldPlaced = [];
    for (let attempt = 0; attempt < fieldCount * 10 && fieldPlaced.length < fieldCount; attempt++) {
      const fx = Math.round((rng() * 2 - 1) * (spanW * 0.43));
      const fy = Math.round((rng() * 2 - 1) * (spanH * 0.42));
      const fr = 11 + Math.floor(rng() * 4);
      const group = [{ x: fx, y: fy, r: fr }];
      if (symMode === 'rot') {
        group.push({ x: -fx, y: -fy, r: fr });
      } else if (symMode === 'y') {
        group.push({ x: fx, y: -fy, r: fr });
      } else if (symMode === 'xy') {
        group.push({ x: -fx, y: fy, r: fr }, { x: fx, y: -fy, r: fr }, { x: -fx, y: -fy, r: fr });
      }
      for (const pt of group) {
        if (fieldPlaced.length >= fieldCount) break;
        if (!isClearOfBodies(pt.x, pt.y, bodies, 0, pt.r + 18)) continue;
        if (!isClearOfWarps(pt.x, pt.y, warps, pt.r + 22)) continue;
        if (Math.hypot(pt.x - pad.x, pt.y - pad.y) < 62) continue;
        if (goal && Math.hypot(pt.x - goal.x, pt.y - goal.y) < goal.r + pt.r + 22) continue;
        let nearT = false;
        for (const tg of targets) {
          if (!tg.orbitR && Math.hypot(pt.x - tg.x, pt.y - tg.y) < tg.r + pt.r + 18) {
            nearT = true;
            break;
          }
        }
        if (nearT) continue;
        let crowded = false;
        for (const ex of fieldPlaced) {
          if (Math.hypot(pt.x - ex.x, pt.y - ex.y) < minSpacing) {
            crowded = true;
            break;
          }
        }
        if (crowded) continue;
        fieldPlaced.push(pt);
        rawDebris.push(pt);
      }
    }

    // (d) Optional single-sided or tight grazing stones (すれっすれ!)
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
      const gap = gt.gap || 14;
      const sides = gt.side === 'left' ? [1] : (gt.side === 'right' ? [-1] : [1, -1]);
      for (const sgn of sides) {
        const dx = Math.round(p.x + nx * sgn * (dr + gap));
        const dy = Math.round(p.y + ny * sgn * (dr + gap));
        if (Math.abs(dx) > spanW * 0.47 || Math.abs(dy) > spanH * 0.47) continue;
        if (Math.hypot(dx - pad.x, dy - pad.y) < 52) continue;
        if (goal && Math.hypot(dx - goal.x, dy - goal.y) < goal.r + dr + 16) continue;
        if (!isClearOfBodies(dx, dy, bodies, p.t, dr + 10)) continue;
        if (!isClearOfWarps(dx, dy, warps, dr + 10)) continue;
        rawDebris.push({ x: dx, y: dy, r: dr });
      }
    }

    // 5. Final Collision-Free Guarantee Filter against the verified solution trajectory!
    const safeDebris = [];
    const safeMargin = bp.safeMargin || 5.8;
    for (let i = 0; i < rawDebris.length; i++) {
      const d = rawDebris[i];
      let hitsSolution = false;
      const safeR2 = (d.r + safeMargin) * (d.r + safeMargin);

      const dp0 = evalOrbitalPos(d, 0);
      if (!d.orbitR && Math.hypot(dp0.x - pad.x, dp0.y - pad.y) < d.r + 36) continue;
      if (!d.orbitR && goal && Math.hypot(dp0.x - goal.x, dp0.y - goal.y) < d.r + goal.r + 12) continue;

      for (let s = 1; s <= clearStep && s < finalTrace.pts.length; s++) {
        const p0 = finalTrace.pts[s - 1];
        const p1 = finalTrace.pts[s];
        if (p1.breakSegment) continue;
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
  // Stages 11–50: Anti-Cheese, Non-Breadcrumb, Multi-Body (up to 7 bodies!)
  // =========================================================================
  const BLUEPRINTS = [
    // ================= 11–20: Deep Curves & 4–5 Body Slaloms =================
    {
      id: 11, mode: 'both', spanW: 920, spanH: 620,
      pad: { x: -300, y: 135 },
      sol: { angleDeg: -8, speed: 175 },
      goalFrac: 0.90,
      blockDirect: 'wide',
      bodies: [{ kind: 'star', x: 115, y: 0, r: 27, gm: 4600000, visualR: 185 }],
      debris: makeHorizontalDebrisWall(0, -370, -65, 40, 14),
      targetSpecs: [{ frac: 0.34 }, { frac: 0.58 }, { frac: 0.76 }],
      fieldCount: 8, symField: 'y'
    },
    {
      id: 12, mode: 'destroy', spanW: 920, spanH: 620,
      pad: { x: -315, y: -140 },
      sol: { angleDeg: 26, speed: 205 },
      bodies: [
        { kind: 'star', x: 10, y: -10, r: 26, gm: 4200000, visualR: 175 },
        { kind: 'planet', x: -185, y: 95, r: 17, gm: 1550000, visualR: 115 }
      ],
      targetSpecs: [
        { frac: 0.20 },
        { frac: 0.44, orbit: { cx: 10, cy: -10, orbitSpeed: OMEGA } },
        { frac: 0.68, orbit: { cx: 10, cy: -10, orbitSpeed: -OMEGA } },
        { frac: 0.88 }
      ],
      fieldCount: 10, symField: 'rot'
    },
    {
      // 4-Planet Diamond Slalom!
      id: 13, mode: 'both', spanW: 980, spanH: 640,
      pad: { x: -355, y: 120 },
      sol: { angleDeg: -22, speed: 245 },
      goalFrac: 0.91,
      blockDirect: 'wide',
      bodies: [
        { kind: 'planet', x: -165, y: -70, r: 19, gm: 2250000, visualR: 130 },
        { kind: 'planet', x: 0, y: 85, r: 19, gm: 2250000, visualR: 130 },
        { kind: 'planet', x: 0, y: -155, r: 17, gm: 1650000, visualR: 115 },
        { kind: 'planet', x: 175, y: -55, r: 19, gm: 2250000, visualR: 130 }
      ],
      targetSpecs: [{ frac: 0.26 }, { frac: 0.56 }, { frac: 0.78 }],
      fieldCount: 12, symField: 'xy'
    },
    {
      id: 14, mode: 'both', spanW: 920, spanH: 620,
      pad: { x: -310, y: -135 },
      sol: { angleDeg: 24, speed: 192 },
      goalFrac: 0.90,
      blockDirect: 'wide',
      bodies: [
        { kind: 'star', x: 35, y: 5, r: 26, gm: 4300000, visualR: 180 },
        { kind: 'planet', x: 245, y: -95, r: 17, gm: 1700000, visualR: 115 }
      ],
      debris: makeHorizontalDebrisWall(-118, -190, 40, 40, 13),
      targetSpecs: [
        { frac: 0.25 },
        { frac: 0.52, orbit: { cx: 35, cy: 5, orbitSpeed: OMEGA } },
        { frac: 0.74 }
      ],
      fieldCount: 10, symField: 'rot'
    },
    {
      // 4-Body Binary + Flanking Planets
      id: 15, mode: 'both', spanW: 960, spanH: 640,
      pad: { x: -345, y: 140 },
      sol: { angleDeg: -24, speed: 235 },
      goalFrac: 0.91,
      blockDirect: 'wide',
      bodies: [
        { kind: 'star', x: 0, y: -150, r: 24, gm: 3400000, visualR: 155 },
        { kind: 'star2', x: 0, y: 150, r: 24, gm: 3400000, visualR: 155 },
        { kind: 'planet', x: -200, y: -45, r: 17, gm: 1600000, visualR: 110 },
        { kind: 'planet', x: 200, y: 45, r: 17, gm: 1600000, visualR: 110 }
      ],
      debris: [{ x: 0, y: 0, r: 15 }, { x: 0, y: -44, r: 13 }, { x: 0, y: 44, r: 13 }],
      targetSpecs: [{ frac: 0.24 }, { frac: 0.54 }, { frac: 0.76 }],
      fieldCount: 10, symField: 'rot'
    },
    {
      // 4-Body S-Weave Destruction
      id: 16, mode: 'destroy', spanW: 960, spanH: 640,
      pad: { x: -345, y: -120 },
      sol: { angleDeg: 10, speed: 225 },
      bodies: [
        { kind: 'star', x: -145, y: 50, r: 24, gm: 3400000, visualR: 155 },
        { kind: 'planet', x: 145, y: -50, r: 19, gm: 2350000, visualR: 135 },
        { kind: 'planet', x: -145, y: -170, r: 16, gm: 1400000, visualR: 105 },
        { kind: 'planet', x: 145, y: 170, r: 16, gm: 1400000, visualR: 105 }
      ],
      targetSpecs: [
        { frac: 0.18 },
        { frac: 0.38, orbit: { cx: -145, cy: 50, orbitSpeed: OMEGA } },
        { frac: 0.58 },
        { frac: 0.76, orbit: { cx: 145, cy: -50, orbitSpeed: -OMEGA } },
        { frac: 0.90 }
      ],
      fieldCount: 12, symField: 'rot'
    },
    {
      id: 17, mode: 'both', spanW: 940, spanH: 620,
      pad: { x: -335, y: 145 },
      sol: { angleDeg: -28, speed: 198 },
      goalFrac: 0.90,
      blockDirect: 'wide',
      bodies: [
        { kind: 'star', x: 90, y: 0, r: 27, gm: 4600000, visualR: 185 },
        { kind: 'planet', x: -175, y: -105, r: 17, gm: 1600000, visualR: 115 },
        { kind: 'planet', x: -175, y: 105, r: 17, gm: 1600000, visualR: 115 }
      ],
      debris: makeVerticalDebrisWall(-75, 35, 260, 40, 13),
      targetSpecs: [{ frac: 0.28 }, { frac: 0.58 }, { frac: 0.78 }],
      fieldCount: 10, symField: 'y'
    },
    {
      // 4-Body Binary Figure-8 + 4 Seals
      id: 18, mode: 'both', spanW: 980, spanH: 640,
      pad: { x: -355, y: -140 },
      sol: { angleDeg: 26, speed: 225 },
      goalFrac: 0.91,
      blockDirect: 'wide',
      bodies: [
        { kind: 'star', x: -155, y: 0, r: 24, gm: 3500000, visualR: 155 },
        { kind: 'star2', x: 155, y: 0, r: 24, gm: 3500000, visualR: 155 },
        { kind: 'planet', x: 0, y: -185, r: 16, gm: 1500000, visualR: 105 },
        { kind: 'planet', x: 0, y: 185, r: 16, gm: 1500000, visualR: 105 }
      ],
      targetSpecs: [
        { frac: 0.20 },
        { frac: 0.42, orbit: { cx: -155, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.64, orbit: { cx: 155, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.80 }
      ],
      fieldCount: 12, symField: 'xy'
    },
    {
      // 4-Planet Staggered Corridor
      id: 19, mode: 'destroy', spanW: 960, spanH: 620,
      pad: { x: -355, y: -55 },
      sol: { angleDeg: -10, speed: 245 },
      bodies: [
        { kind: 'planet', x: -175, y: 95, r: 18, gm: 2200000, visualR: 125 },
        { kind: 'planet', x: -30, y: -95, r: 18, gm: 2200000, visualR: 125 },
        { kind: 'planet', x: 115, y: 95, r: 18, gm: 2200000, visualR: 125 },
        { kind: 'planet', x: 255, y: -85, r: 18, gm: 2200000, visualR: 125 }
      ],
      targetSpecs: [{ frac: 0.16 }, { frac: 0.36 }, { frac: 0.56 }, { frac: 0.74 }, { frac: 0.90 }],
      fieldCount: 12, symField: 'rot'
    },
    {
      // 5-Body Crown (1 Star + 4 Corner Planets)
      id: 20, mode: 'both', spanW: 980, spanH: 660,
      pad: { x: -355, y: 165 },
      sol: { angleDeg: -36, speed: 230 },
      goalFrac: 0.91,
      blockDirect: 'wide',
      bodies: [
        { kind: 'star', x: 0, y: 0, r: 26, gm: 4000000, visualR: 170 },
        { kind: 'planet', x: -210, y: -125, r: 17, gm: 1700000, visualR: 115 },
        { kind: 'planet', x: 210, y: -125, r: 17, gm: 1700000, visualR: 115 },
        { kind: 'planet', x: -210, y: 125, r: 17, gm: 1700000, visualR: 115 },
        { kind: 'planet', x: 210, y: 125, r: 17, gm: 1700000, visualR: 115 }
      ],
      targetSpecs: [
        { frac: 0.22 },
        { frac: 0.44, orbit: { cx: 0, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.64 },
        { frac: 0.80, orbit: { cx: 0, cy: 0, orbitSpeed: -OMEGA } }
      ],
      fieldCount: 14, symField: 'xy'
    },

    // ================= 21–30: Warp Engineering + Multi-Body Fields =================
    {
      id: 21, mode: 'both', spanW: 960, spanH: 620,
      pad: { x: -340, y: 150 },
      sol: { angleDeg: -32, speed: 215 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: -175, y: 0, r: 25, gm: 3500000, visualR: 160 },
        { kind: 'planet', x: 215, y: 0, r: 19, gm: 2300000, visualR: 135 },
        { kind: 'planet', x: 215, y: -165, r: 16, gm: 1400000, visualR: 105 }
      ],
      debris: makeVerticalDebrisWall(25, -560, 560, 44, 14),
      warpSpecs: [{ step: 78, exitX: 140, exitY: 140, r: 26, pairIndex: 0 }],
      targetSpecs: [{ frac: 0.20 }, { frac: 0.58 }, { frac: 0.78 }],
      fieldCount: 10, symField: 'rot'
    },
    {
      id: 22, mode: 'destroy', spanW: 960, spanH: 640,
      pad: { x: -335, y: 120 },
      sol: { angleDeg: -22, speed: 210 },
      bodies: [
        { kind: 'star', x: 115, y: 0, r: 27, gm: 4300000, visualR: 180 },
        { kind: 'planet', x: -195, y: -25, r: 17, gm: 1650000, visualR: 115 },
        { kind: 'planet', x: 275, y: -150, r: 16, gm: 1400000, visualR: 105 },
        { kind: 'planet', x: 275, y: 150, r: 16, gm: 1400000, visualR: 105 }
      ],
      debris: makeVerticalDebrisWall(-45, -560, 560, 44, 14),
      warpSpecs: [{ step: 72, exitX: 115, exitY: -132, r: 26, pairIndex: 0 }],
      targetSpecs: [
        { frac: 0.20 },
        { frac: 0.44, orbit: { cx: 115, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.62, orbit: { cx: 115, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.78, orbit: { cx: 115, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.90 }
      ],
      fieldCount: 12, symField: 'y'
    },
    {
      // 4-Body 3-Chamber Double-Warp Maze
      id: 23, mode: 'both', spanW: 1000, spanH: 640,
      pad: { x: -360, y: 125 },
      sol: { angleDeg: -38, speed: 222 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'planet', x: -240, y: -20, r: 18, gm: 2150000, visualR: 125 },
        { kind: 'star', x: 0, y: -25, r: 23, gm: 3200000, visualR: 145 },
        { kind: 'planet', x: 0, y: 165, r: 15, gm: 1250000, visualR: 95 },
        { kind: 'planet', x: 245, y: 15, r: 18, gm: 2150000, visualR: 125 }
      ],
      debris: [
        ...makeVerticalDebrisWall(-118, -560, 560, 44, 13),
        ...makeVerticalDebrisWall(118, -560, 560, 44, 13)
      ],
      warpSpecs: [
        { step: 62, exitX: -35, exitY: 140, r: 26, pairIndex: 0 },
        { step: 140, exitX: 200, exitY: -145, r: 26, pairIndex: 1 }
      ],
      targetSpecs: [{ frac: 0.16 }, { frac: 0.44 }, { frac: 0.76 }],
      fieldCount: 10, symField: 'rot'
    },
    {
      id: 24, mode: 'both', spanW: 960, spanH: 640,
      pad: { x: -340, y: 95 },
      sol: { angleDeg: -38, speed: 208 },
      goalFrac: 0.91,
      bodies: [
        { kind: 'star', x: -165, y: 15, r: 25, gm: 3600000, visualR: 160 },
        { kind: 'star2', x: 175, y: -10, r: 25, gm: 3600000, visualR: 160 },
        { kind: 'planet', x: -165, y: -175, r: 16, gm: 1350000, visualR: 105 },
        { kind: 'planet', x: 175, y: 175, r: 16, gm: 1350000, visualR: 105 }
      ],
      debris: makeVerticalDebrisWall(0, -560, 560, 44, 14),
      warpSpecs: [{ step: 86, exitX: 95, exitY: 135, r: 26, pairIndex: 0 }],
      targetSpecs: [
        { frac: 0.22 },
        { frac: 0.50, orbit: { cx: 175, cy: -10, orbitSpeed: OMEGA } },
        { frac: 0.74 }
      ],
      fieldCount: 12, symField: 'rot'
    },
    {
      // 4-Body Horizontal Divide + 5 Targets
      id: 25, mode: 'destroy', spanW: 960, spanH: 650,
      pad: { x: -340, y: 155 },
      sol: { angleDeg: 18, speed: 215 },
      bodies: [
        { kind: 'planet', x: -145, y: 145, r: 19, gm: 2150000, visualR: 130 },
        { kind: 'planet', x: 165, y: 155, r: 18, gm: 1900000, visualR: 120 },
        { kind: 'star', x: 25, y: -155, r: 25, gm: 3600000, visualR: 160 },
        { kind: 'planet', x: -230, y: -165, r: 17, gm: 1550000, visualR: 110 }
      ],
      debris: makeHorizontalDebrisWall(0, -600, 600, 44, 14),
      warpSpecs: [{ step: 82, exitX: -200, exitY: -130, r: 26, pairIndex: 0 }],
      targetSpecs: [{ frac: 0.16 }, { frac: 0.44 }, { frac: 0.62 }, { frac: 0.76 }, { frac: 0.90 }],
      fieldCount: 12, symField: 'xy'
    },
    {
      id: 26, mode: 'both', spanW: 960, spanH: 640,
      pad: { x: -335, y: 155 },
      sol: { angleDeg: -22, speed: 218 },
      goalFrac: 0.90,
      blockDirect: 'wide',
      bodies: [
        { kind: 'star', x: 25, y: 10, r: 26, gm: 4100000, visualR: 175 },
        { kind: 'planet', x: 245, y: -120, r: 17, gm: 1700000, visualR: 115 },
        { kind: 'planet', x: -215, y: -110, r: 17, gm: 1700000, visualR: 115 }
      ],
      debris: makeHorizontalDebrisWall(0, -390, -130, 40, 13),
      warpSpecs: [{ step: 92, exitX: -115, exitY: -135, r: 26, pairIndex: 0 }],
      targetSpecs: [{ frac: 0.24 }, { frac: 0.56 }, { frac: 0.76 }],
      fieldCount: 12, symField: 'y'
    },
    {
      // 4-Body Dual-Warp Twin Orbit + 5 Targets
      id: 27, mode: 'destroy', spanW: 980, spanH: 640,
      pad: { x: -355, y: 145 },
      sol: { angleDeg: -34, speed: 215 },
      bodies: [
        { kind: 'star', x: -175, y: 0, r: 25, gm: 3800000, visualR: 160 },
        { kind: 'star2', x: 175, y: 0, r: 25, gm: 3800000, visualR: 160 },
        { kind: 'planet', x: -295, y: -150, r: 16, gm: 1450000, visualR: 105 },
        { kind: 'planet', x: 295, y: 150, r: 16, gm: 1450000, visualR: 105 }
      ],
      debris: makeVerticalDebrisWall(0, -560, 560, 44, 14),
      warpSpecs: [
        { step: 74, exitX: 165, exitY: -125, r: 26, pairIndex: 0 },
        { step: 156, exitX: -165, exitY: 125, r: 26, pairIndex: 1 }
      ],
      targetSpecs: [
        { frac: 0.16 },
        { frac: 0.38, orbit: { cx: 175, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.54 },
        { frac: 0.74, orbit: { cx: -175, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.90 }
      ],
      fieldCount: 12, symField: 'rot'
    },
    {
      // 5-Body Star + 4 Planets + Dual Warp + 4 Seals
      id: 28, mode: 'both', spanW: 980, spanH: 650,
      pad: { x: -350, y: 160 },
      sol: { angleDeg: -30, speed: 212 },
      goalFrac: 0.91,
      blockDirect: 'wide',
      bodies: [
        { kind: 'star', x: 0, y: 0, r: 26, gm: 3700000, visualR: 165 },
        { kind: 'planet', x: -225, y: -115, r: 16, gm: 1450000, visualR: 105 },
        { kind: 'planet', x: 225, y: -115, r: 16, gm: 1450000, visualR: 105 },
        { kind: 'planet', x: -225, y: 115, r: 16, gm: 1450000, visualR: 105 },
        { kind: 'planet', x: 225, y: 115, r: 16, gm: 1450000, visualR: 105 }
      ],
      warpSpecs: [
        { step: 72, exitX: 145, exitY: -135, r: 26, pairIndex: 0 },
        { step: 144, exitX: -200, exitY: -105, r: 26, pairIndex: 1 }
      ],
      targetSpecs: [{ frac: 0.18 }, { frac: 0.44 }, { frac: 0.64 }, { frac: 0.80 }],
      fieldCount: 14, symField: 'xy'
    },
    {
      // 4-Body Gravity-Assisted Warp Snipe
      id: 29, mode: 'both', spanW: 980, spanH: 640,
      pad: { x: -350, y: -135 },
      sol: { angleDeg: 28, speed: 208 },
      goalFrac: 0.90,
      bodies: [
        { kind: 'star', x: -145, y: 10, r: 26, gm: 4000000, visualR: 170 },
        { kind: 'planet', x: -265, y: 145, r: 16, gm: 1400000, visualR: 105 },
        { kind: 'planet', x: 235, y: 15, r: 19, gm: 2400000, visualR: 135 },
        { kind: 'planet', x: 235, y: -165, r: 16, gm: 1450000, visualR: 105 }
      ],
      debris: makeVerticalDebrisWall(55, -560, 560, 44, 14),
      warpSpecs: [{ step: 92, exitX: 165, exitY: -135, r: 26, pairIndex: 0 }],
      targetSpecs: [{ frac: 0.22 }, { frac: 0.56 }, { frac: 0.76 }],
      fieldCount: 12, symField: 'rot',
      gates: [{ frac: 0.70, gap: 16, side: 'left' }]
    },
    {
      // 5-Body Warp Fortress
      id: 30, mode: 'both', spanW: 980, spanH: 650,
      pad: { x: -355, y: 135 },
      sol: { angleDeg: -26, speed: 212 },
      goalFrac: 0.91,
      bodies: [
        { kind: 'star', x: 105, y: 0, r: 28, gm: 4500000, visualR: 180 },
        { kind: 'planet', x: -205, y: -15, r: 18, gm: 1900000, visualR: 120 },
        { kind: 'planet', x: -205, y: -175, r: 15, gm: 1200000, visualR: 95 },
        { kind: 'planet', x: 285, y: -155, r: 15, gm: 1250000, visualR: 95 },
        { kind: 'planet', x: 285, y: 155, r: 15, gm: 1250000, visualR: 95 }
      ],
      debris: makeDebrisRing(105, 0, 215, 10, [], 0, 14, 0),
      warpSpecs: [{ step: 74, exitX: 105, exitY: 130, r: 26, pairIndex: 0 }],
      targetSpecs: [
        { frac: 0.20 },
        { frac: 0.44, orbit: { cx: 105, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.62, orbit: { cx: 105, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.78 }
      ],
      fieldCount: 12, symField: 'y'
    },

    // ================= 31–40: Moving Multi-Body & Orbiting Constellations =================
    {
      id: 31, mode: 'both', spanW: 960, spanH: 640,
      pad: { x: -340, y: 130 },
      sol: { angleDeg: -24, speed: 215 },
      goalFrac: 0.90,
      blockDirect: 'wide',
      bodies: [
        { kind: 'star', x: 0, y: 0, r: 26, gm: 3600000, visualR: 165 },
        { kind: 'moon', cx: 0, cy: 0, orbitR: 175, orbitPhase: 0.5, orbitSpeed: OMEGA, r: 15, gm: 1500000, visualR: 105 },
        { kind: 'planet', x: -215, y: -125, r: 16, gm: 1450000, visualR: 105 },
        { kind: 'planet', x: 215, y: 125, r: 16, gm: 1450000, visualR: 105 }
      ],
      targetSpecs: [
        { frac: 0.24, orbit: { cx: 0, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.52 },
        { frac: 0.76, orbit: { cx: 0, cy: 0, orbitSpeed: -OMEGA } }
      ],
      fieldCount: 12, symField: 'rot'
    },
    {
      id: 32, mode: 'destroy', spanW: 940, spanH: 640,
      pad: { x: -330, y: 140 },
      sol: { angleDeg: -14, speed: 198 },
      bodies: [
        { kind: 'star', x: 20, y: 0, r: 26, gm: 4100000, visualR: 175 },
        { kind: 'planet', x: -200, y: -125, r: 16, gm: 1450000, visualR: 105 },
        { kind: 'planet', x: 245, y: 135, r: 16, gm: 1450000, visualR: 105 }
      ],
      debris: makeDebrisRing(20, 0, 210, 8, [0, 4], OMEGA, 13, 0.3),
      targetSpecs: [
        { frac: 0.18 },
        { frac: 0.40, orbit: { cx: 20, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.62, orbit: { cx: 20, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.84 }
      ],
      fieldCount: 10, symField: 'rot'
    },
    {
      // 4-Body Concentric Orbiting Solar System!
      id: 33, mode: 'both', spanW: 980, spanH: 660,
      pad: { x: -355, y: 155 },
      sol: { angleDeg: -26, speed: 225 },
      goalFrac: 0.91,
      blockDirect: 'wide',
      bodies: [
        { kind: 'star', x: 0, y: 0, r: 25, gm: 3400000, visualR: 160 },
        { kind: 'planet', cx: 0, cy: 0, orbitR: 120, orbitPhase: 0.8, orbitSpeed: OMEGA * 2, r: 15, gm: 1300000, visualR: 100 },
        { kind: 'planet', cx: 0, cy: 0, orbitR: 205, orbitPhase: 3.1, orbitSpeed: -OMEGA, r: 17, gm: 1600000, visualR: 115 },
        { kind: 'moon', cx: 0, cy: 0, orbitR: 280, orbitPhase: 5.2, orbitSpeed: OMEGA, r: 14, gm: 1200000, visualR: 95 }
      ],
      targetSpecs: [
        { frac: 0.24, orbit: { cx: 0, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.50 },
        { frac: 0.74, orbit: { cx: 0, cy: 0, orbitSpeed: -OMEGA } }
      ],
      fieldCount: 12, symField: 'xy'
    },
    {
      // 4-Body Orbiting Crystal Belt (5 Orbiting Targets!)
      id: 34, mode: 'destroy', spanW: 940, spanH: 640,
      pad: { x: -335, y: 135 },
      sol: { angleDeg: -16, speed: 202 },
      bodies: [
        { kind: 'star', x: 15, y: 0, r: 26, gm: 4200000, visualR: 175 },
        { kind: 'planet', x: -215, y: -135, r: 16, gm: 1350000, visualR: 100 },
        { kind: 'planet', x: 245, y: -135, r: 16, gm: 1350000, visualR: 100 },
        { kind: 'planet', x: 245, y: 135, r: 16, gm: 1350000, visualR: 100 }
      ],
      debris: makeDebrisRing(15, 0, 215, 6, [], -OMEGA, 13, 0.5),
      targetSpecs: [
        { frac: 0.18, orbit: { cx: 15, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.36, orbit: { cx: 15, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.54, orbit: { cx: 15, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.72, orbit: { cx: 15, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.88, orbit: { cx: 15, cy: 0, orbitSpeed: OMEGA } }
      ],
      fieldCount: 10, symField: 'y'
    },
    {
      // 4-Body Binary + Twin Moons + Twin Rotating Rings
      id: 35, mode: 'both', spanW: 980, spanH: 650,
      pad: { x: -360, y: 145 },
      sol: { angleDeg: -26, speed: 230 },
      goalFrac: 0.91,
      blockDirect: 'wide',
      bodies: [
        { kind: 'star', x: -165, y: 0, r: 24, gm: 3400000, visualR: 155 },
        { kind: 'star2', x: 165, y: 0, r: 24, gm: 3400000, visualR: 155 },
        { kind: 'moon', cx: -165, cy: 0, orbitR: 115, orbitPhase: 1.0, orbitSpeed: OMEGA, r: 13, gm: 950000, visualR: 85 },
        { kind: 'moon', cx: 165, cy: 0, orbitR: 115, orbitPhase: 4.1, orbitSpeed: -OMEGA, r: 13, gm: 950000, visualR: 85 }
      ],
      debris: [
        ...makeDebrisRing(-165, 0, 155, 5, [], OMEGA, 12, 0.2),
        ...makeDebrisRing(165, 0, 155, 5, [], -OMEGA, 12, 0.9)
      ],
      targetSpecs: [{ frac: 0.20 }, { frac: 0.44 }, { frac: 0.64 }, { frac: 0.80 }],
      fieldCount: 10, symField: 'rot'
    },
    {
      // 5-Body Planetary Escort
      id: 36, mode: 'both', spanW: 980, spanH: 650,
      pad: { x: -355, y: -140 },
      sol: { angleDeg: 22, speed: 228 },
      goalFrac: 0.91,
      blockDirect: 'wide',
      bodies: [
        { kind: 'star', x: -105, y: 20, r: 25, gm: 3500000, visualR: 160 },
        { kind: 'planet', cx: -105, cy: 20, orbitR: 185, orbitPhase: 1.2, orbitSpeed: OMEGA, r: 16, gm: 1700000, visualR: 115 },
        { kind: 'star2', x: 205, y: -35, r: 23, gm: 3100000, visualR: 145 },
        { kind: 'planet', x: 55, y: -175, r: 16, gm: 1450000, visualR: 105 },
        { kind: 'planet', x: 55, y: 175, r: 16, gm: 1450000, visualR: 105 }
      ],
      debris: makeDebrisRing(55, 0, 80, 4, [], OMEGA * 2, 12, 0),
      targetSpecs: [{ frac: 0.22 }, { frac: 0.48 }, { frac: 0.74 }],
      fieldCount: 14, symField: 'y'
    },
    {
      // 4-Body Double-Ring Gauntlet + 5 Targets
      id: 37, mode: 'destroy', spanW: 960, spanH: 650,
      pad: { x: -355, y: 125 },
      sol: { angleDeg: -14, speed: 208 },
      bodies: [
        { kind: 'star', x: 35, y: 0, r: 27, gm: 4300000, visualR: 180 },
        { kind: 'planet', x: -225, y: -120, r: 16, gm: 1450000, visualR: 105 },
        { kind: 'planet', x: -225, y: 120, r: 16, gm: 1450000, visualR: 105 },
        { kind: 'planet', x: 285, y: 0, r: 17, gm: 1650000, visualR: 110 }
      ],
      debris: [
        ...makeDebrisRing(35, 0, 178, 5, [], OMEGA, 12, 0),
        ...makeDebrisRing(35, 0, 248, 6, [], -OMEGA, 13, 0.6)
      ],
      targetSpecs: [
        { frac: 0.16 },
        { frac: 0.36, orbit: { cx: 35, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.56 },
        { frac: 0.74, orbit: { cx: 35, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.90 }
      ],
      fieldCount: 10, symField: 'y'
    },
    {
      // 5-Body Moonlight Seal
      id: 38, mode: 'both', spanW: 980, spanH: 650,
      pad: { x: -355, y: 150 },
      sol: { angleDeg: -34, speed: 222 },
      goalFrac: 0.91,
      blockDirect: 'wide',
      bodies: [
        { kind: 'star', x: -120, y: 0, r: 25, gm: 3600000, visualR: 165 },
        { kind: 'moon', cx: -120, cy: 0, orbitR: 155, orbitPhase: 2.1, orbitSpeed: OMEGA, r: 14, gm: 1300000, visualR: 100 },
        { kind: 'planet', x: 190, y: 20, r: 19, gm: 2150000, visualR: 130 },
        { kind: 'moon', cx: 190, cy: 20, orbitR: 125, orbitPhase: 5.0, orbitSpeed: -OMEGA * 2, r: 13, gm: 1050000, visualR: 85 },
        { kind: 'planet', x: 35, y: -185, r: 16, gm: 1450000, visualR: 105 }
      ],
      targetSpecs: [
        { frac: 0.20, orbit: { cx: -120, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.44 },
        { frac: 0.64, orbit: { cx: 190, cy: 20, orbitSpeed: OMEGA } },
        { frac: 0.80 }
      ],
      fieldCount: 14, symField: 'rot'
    },
    {
      // 6-Body Pendulum Binary Archipelago!
      id: 39, mode: 'both', spanW: 1000, spanH: 660,
      pad: { x: -365, y: 155 },
      sol: { angleDeg: -26, speed: 235 },
      goalFrac: 0.91,
      blockDirect: 'wide',
      bodies: [
        { kind: 'star', x: -165, y: 0, r: 24, gm: 3300000, visualR: 155 },
        { kind: 'moon', cx: -165, cy: 0, orbitR: 115, orbitPhase: 0.2, orbitSpeed: OMEGA * 2, r: 13, gm: 1100000, visualR: 90 },
        { kind: 'star2', x: 165, y: 0, r: 24, gm: 3300000, visualR: 155 },
        { kind: 'moon', cx: 165, cy: 0, orbitR: 115, orbitPhase: 3.3, orbitSpeed: -OMEGA * 2, r: 13, gm: 1100000, visualR: 90 },
        { kind: 'planet', x: 0, y: -195, r: 17, gm: 1650000, visualR: 110 },
        { kind: 'planet', x: 0, y: 195, r: 17, gm: 1650000, visualR: 110 }
      ],
      debris: [{ x: 0, y: -68, r: 13 }, { x: 0, y: 0, r: 14 }, { x: 0, y: 68, r: 13 }],
      targetSpecs: [{ frac: 0.22 }, { frac: 0.48 }, { frac: 0.72 }],
      fieldCount: 14, symField: 'xy',
      gates: [{ frac: 0.60, gap: 15, side: 'left' }]
    },
    {
      // 5-Body Rotating Quad-Planet Citadel + 4 Orbiting Seals!
      id: 40, mode: 'both', spanW: 980, spanH: 660,
      pad: { x: -355, y: 145 },
      sol: { angleDeg: -16, speed: 208 },
      goalFrac: 0.91,
      blockDirect: 'wide',
      bodies: [
        { kind: 'star', x: 0, y: 0, r: 27, gm: 4300000, visualR: 180 },
        { kind: 'planet', cx: 0, cy: 0, orbitR: 230, orbitPhase: 0.0, orbitSpeed: OMEGA, r: 15, gm: 1200000, visualR: 95 },
        { kind: 'planet', cx: 0, cy: 0, orbitR: 230, orbitPhase: Math.PI * 0.5, orbitSpeed: OMEGA, r: 15, gm: 1200000, visualR: 95 },
        { kind: 'planet', cx: 0, cy: 0, orbitR: 230, orbitPhase: Math.PI, orbitSpeed: OMEGA, r: 15, gm: 1200000, visualR: 95 },
        { kind: 'planet', cx: 0, cy: 0, orbitR: 230, orbitPhase: Math.PI * 1.5, orbitSpeed: OMEGA, r: 15, gm: 1200000, visualR: 95 }
      ],
      debris: makeDebrisRing(0, 0, 175, 8, [1, 5], -OMEGA, 12, 0),
      targetSpecs: [
        { frac: 0.22, orbit: { cx: 0, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.42, orbit: { cx: 0, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.62, orbit: { cx: 0, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.78, orbit: { cx: 0, cy: 0, orbitSpeed: -OMEGA } }
      ],
      fieldCount: 12, symField: 'xy'
    },

    // ================= 41–50: Master 5–7 Body Razor-Thin Trials (すれっすれ!) =================
    {
      // 5-Body Warp + Orbiting Moon + 4 Seals
      id: 41, mode: 'both', spanW: 980, spanH: 650,
      pad: { x: -350, y: 135 },
      sol: { angleDeg: -34, speed: 215 },
      goalFrac: 0.91,
      bodies: [
        { kind: 'star', x: -175, y: 0, r: 25, gm: 3500000, visualR: 160 },
        { kind: 'star2', x: 175, y: 0, r: 25, gm: 3600000, visualR: 160 },
        { kind: 'moon', cx: 175, cy: 0, orbitR: 145, orbitPhase: 1.0, orbitSpeed: OMEGA, r: 14, gm: 1200000, visualR: 95 },
        { kind: 'planet', x: -245, y: -155, r: 16, gm: 1400000, visualR: 100 },
        { kind: 'planet', x: 285, y: 155, r: 16, gm: 1400000, visualR: 100 }
      ],
      debris: makeVerticalDebrisWall(0, -560, 560, 44, 14),
      warpSpecs: [{ step: 78, exitX: 110, exitY: 145, r: 26, pairIndex: 0 }],
      targetSpecs: [
        { frac: 0.18 },
        { frac: 0.44 },
        { frac: 0.62, orbit: { cx: 175, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.78 }
      ],
      fieldCount: 16, symField: 'rot',
      gates: [{ frac: 0.70, gap: 13, side: 'right' }]
    },
    {
      // 5-Body Warp Orbit Injection II + 5 Orbiting Targets
      id: 42, mode: 'destroy', spanW: 980, spanH: 650,
      pad: { x: -360, y: -135 },
      sol: { angleDeg: 24, speed: 218 },
      bodies: [
        { kind: 'star', x: 95, y: 0, r: 28, gm: 4500000, visualR: 180 },
        { kind: 'planet', x: -210, y: 25, r: 18, gm: 1900000, visualR: 120 },
        { kind: 'planet', x: -210, y: 185, r: 15, gm: 1250000, visualR: 95 },
        { kind: 'planet', x: 290, y: -145, r: 16, gm: 1350000, visualR: 100 },
        { kind: 'planet', x: 290, y: 145, r: 16, gm: 1350000, visualR: 100 }
      ],
      debris: makeDebrisRing(95, 0, 220, 6, [], OMEGA, 13, 0.3),
      warpSpecs: [{ step: 74, exitX: 95, exitY: -130, r: 26, pairIndex: 0 }],
      targetSpecs: [
        { frac: 0.16 },
        { frac: 0.38, orbit: { cx: 95, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.56, orbit: { cx: 95, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.74, orbit: { cx: 95, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.90, orbit: { cx: 95, cy: 0, orbitSpeed: OMEGA } }
      ],
      fieldCount: 16, symField: 'y',
      gates: [{ frac: 0.64, gap: 12 }]
    },
    {
      // 5-Body Subspace Airlock + 4 Seals
      id: 43, mode: 'both', spanW: 980, spanH: 650,
      pad: { x: -355, y: 125 },
      sol: { angleDeg: -36, speed: 218 },
      goalFrac: 0.91,
      bodies: [
        { kind: 'star', x: -175, y: 10, r: 25, gm: 3600000, visualR: 160 },
        { kind: 'star2', x: 185, y: -10, r: 26, gm: 3800000, visualR: 165 },
        { kind: 'planet', x: -240, y: -155, r: 16, gm: 1400000, visualR: 100 },
        { kind: 'planet', x: 185, y: -195, r: 15, gm: 1250000, visualR: 95 },
        { kind: 'planet', x: 315, y: 125, r: 16, gm: 1400000, visualR: 100 }
      ],
      debris: [
        ...makeVerticalDebrisWall(10, -560, 560, 44, 14),
        ...makeDebrisRing(185, -10, 190, 6, [], -OMEGA, 12, 0.4)
      ],
      warpSpecs: [{ step: 82, exitX: 115, exitY: 145, r: 26, pairIndex: 0 }],
      targetSpecs: [
        { frac: 0.18 },
        { frac: 0.46, orbit: { cx: 185, cy: -10, orbitSpeed: OMEGA } },
        { frac: 0.64 },
        { frac: 0.80 }
      ],
      fieldCount: 16, symField: 'rot',
      gates: [{ frac: 0.72, gap: 12 }]
    },
    {
      // 6-Body Three-Chamber Double-Warp Labyrinth + 4 Seals!
      id: 44, mode: 'both', spanW: 1020, spanH: 660,
      pad: { x: -375, y: 145 },
      sol: { angleDeg: -36, speed: 225 },
      goalFrac: 0.91,
      bodies: [
        { kind: 'planet', x: -250, y: 15, r: 18, gm: 2150000, visualR: 125 },
        { kind: 'planet', x: -250, y: -165, r: 15, gm: 1250000, visualR: 95 },
        { kind: 'star', x: 0, y: 0, r: 24, gm: 3400000, visualR: 150 },
        { kind: 'moon', cx: 0, cy: 0, orbitR: 105, orbitPhase: 0.5, orbitSpeed: OMEGA * 2, r: 12, gm: 850000, visualR: 80 },
        { kind: 'planet', x: 250, y: -15, r: 18, gm: 2150000, visualR: 125 },
        { kind: 'planet', x: 250, y: 165, r: 15, gm: 1250000, visualR: 95 }
      ],
      debris: [
        ...makeVerticalDebrisWall(-122, -560, 560, 44, 13),
        ...makeVerticalDebrisWall(122, -560, 560, 44, 13),
        ...makeDebrisRing(0, 0, 92, 4, [], -OMEGA * 2, 11, 0)
      ],
      warpSpecs: [
        { step: 64, exitX: -20, exitY: 150, r: 26, pairIndex: 0 },
        { step: 146, exitX: 205, exitY: -150, r: 26, pairIndex: 1 }
      ],
      targetSpecs: [{ frac: 0.14 }, { frac: 0.40 }, { frac: 0.62 }, { frac: 0.80 }],
      fieldCount: 16, symField: 'rot',
      gates: [{ frac: 0.72, gap: 12 }]
    },
    {
      // 6-Body Binary Warp Shatter (5 Targets!)
      id: 45, mode: 'destroy', spanW: 1000, spanH: 660,
      pad: { x: -365, y: 135 },
      sol: { angleDeg: -32, speed: 218 },
      bodies: [
        { kind: 'star', x: -170, y: 0, r: 25, gm: 3700000, visualR: 160 },
        { kind: 'star2', x: 170, y: 0, r: 25, gm: 3700000, visualR: 160 },
        { kind: 'planet', x: -290, y: -165, r: 16, gm: 1400000, visualR: 100 },
        { kind: 'planet', x: -290, y: 165, r: 16, gm: 1400000, visualR: 100 },
        { kind: 'planet', x: 290, y: -165, r: 16, gm: 1400000, visualR: 100 },
        { kind: 'planet', x: 290, y: 165, r: 16, gm: 1400000, visualR: 100 }
      ],
      debris: makeDebrisRing(0, 0, 76, 4, [], OMEGA * 2, 12, 0),
      warpSpecs: [
        { step: 74, exitX: 55, exitY: 130, r: 26, pairIndex: 0 },
        { step: 158, exitX: -255, exitY: -115, r: 26, pairIndex: 1 }
      ],
      targetSpecs: [
        { frac: 0.16 },
        { frac: 0.36, orbit: { cx: 170, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.56, orbit: { cx: 170, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.74, orbit: { cx: -170, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.90 }
      ],
      fieldCount: 16, symField: 'xy',
      gates: [{ frac: 0.46, gap: 12 }]
    },
    {
      // 6-Body Twin-Orbit Resonance + 5 Seals
      id: 46, mode: 'both', spanW: 1000, spanH: 660,
      pad: { x: -365, y: 145 },
      sol: { angleDeg: -30, speed: 222 },
      goalFrac: 0.91,
      blockDirect: 'wide',
      bodies: [
        { kind: 'star', x: -155, y: 15, r: 25, gm: 3600000, visualR: 160 },
        { kind: 'planet', cx: -155, cy: 15, orbitR: 160, orbitPhase: 0.9, orbitSpeed: OMEGA, r: 15, gm: 1400000, visualR: 105 },
        { kind: 'star2', x: 175, y: -15, r: 26, gm: 3900000, visualR: 165 },
        { kind: 'moon', cx: 175, cy: -15, orbitR: 155, orbitPhase: 4.0, orbitSpeed: -OMEGA, r: 14, gm: 1200000, visualR: 95 },
        { kind: 'planet', x: 10, y: -195, r: 16, gm: 1450000, visualR: 105 },
        { kind: 'planet', x: 10, y: 195, r: 16, gm: 1450000, visualR: 105 }
      ],
      warpSpecs: [{ step: 86, exitX: 175, exitY: 120, r: 27, pairIndex: 0 }],
      targetSpecs: [
        { frac: 0.16 },
        { frac: 0.36 },
        { frac: 0.56, orbit: { cx: 175, cy: -15, orbitSpeed: OMEGA } },
        { frac: 0.72 },
        { frac: 0.82 }
      ],
      fieldCount: 18, symField: 'rot',
      gates: [{ frac: 0.64, gap: 11 }]
    },
    {
      // 6-Body Chaos Corridor II + 4 Seals
      id: 47, mode: 'both', spanW: 980, spanH: 660,
      pad: { x: -355, y: 155 },
      sol: { angleDeg: -28, speed: 230 },
      goalFrac: 0.91,
      blockDirect: 'wide',
      bodies: [
        { kind: 'star', x: 0, y: -150, r: 25, gm: 3600000, visualR: 160 },
        { kind: 'star2', x: 0, y: 150, r: 25, gm: 3600000, visualR: 160 },
        { kind: 'planet', x: -240, y: -125, r: 16, gm: 1500000, visualR: 105 },
        { kind: 'planet', x: 240, y: -125, r: 16, gm: 1500000, visualR: 105 },
        { kind: 'planet', x: -240, y: 125, r: 16, gm: 1500000, visualR: 105 },
        { kind: 'planet', x: 240, y: 125, r: 16, gm: 1500000, visualR: 105 }
      ],
      debris: [
        ...makeDebrisRing(0, -150, 105, 4, [], OMEGA * 2, 12, 0),
        ...makeDebrisRing(0, 150, 105, 4, [], -OMEGA * 2, 12, 0.8),
        { x: 0, y: 0, r: 15 }
      ],
      warpSpecs: [{ step: 82, exitX: 155, exitY: 165, r: 26, pairIndex: 0 }],
      targetSpecs: [{ frac: 0.18 }, { frac: 0.44 }, { frac: 0.64 }, { frac: 0.80 }],
      fieldCount: 16, symField: 'xy',
      gates: [{ frac: 0.72, gap: 11 }]
    },
    {
      // 6-Body Pentagonal Starfield (1 Central Star + 5 Pentagonal Planets) + 6 Targets!
      id: 48, mode: 'destroy', spanW: 1000, spanH: 660,
      pad: { x: -370, y: 145 },
      sol: { angleDeg: -22, speed: 220 },
      bodies: [
        { kind: 'star', x: 0, y: 0, r: 27, gm: 4300000, visualR: 180 },
        { kind: 'planet', x: 255, y: 0, r: 16, gm: 1550000, visualR: 105 },
        { kind: 'planet', x: 79, y: -238, r: 16, gm: 1550000, visualR: 105 },
        { kind: 'planet', x: -206, y: -148, r: 16, gm: 1550000, visualR: 105 },
        { kind: 'planet', x: -206, y: 148, r: 16, gm: 1550000, visualR: 105 },
        { kind: 'planet', x: 79, y: 238, r: 16, gm: 1550000, visualR: 105 }
      ],
      debris: makeDebrisRing(0, 0, 215, 5, [], OMEGA, 12, 0.4),
      warpSpecs: [{ step: 70, exitX: 0, exitY: -130, r: 26, pairIndex: 0 }],
      targetSpecs: [
        { frac: 0.14 },
        { frac: 0.34, orbit: { cx: 0, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.50, orbit: { cx: 0, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.64, orbit: { cx: 0, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.78, orbit: { cx: 0, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.90 }
      ],
      fieldCount: 16, symField: 'rot',
      gates: [{ frac: 0.56, gap: 11 }]
    },
    {
      // 6-Body Eclipse Protocol + Dual Warp + 5 Seals
      id: 49, mode: 'both', spanW: 1020, spanH: 670,
      pad: { x: -370, y: 145 },
      sol: { angleDeg: -34, speed: 222 },
      goalFrac: 0.91,
      bodies: [
        { kind: 'star', x: -180, y: 0, r: 25, gm: 3700000, visualR: 160 },
        { kind: 'moon', cx: -180, cy: 0, orbitR: 125, orbitPhase: 0.7, orbitSpeed: OMEGA * 2, r: 13, gm: 1000000, visualR: 90 },
        { kind: 'star2', x: 180, y: 0, r: 26, gm: 4000000, visualR: 165 },
        { kind: 'moon', cx: 180, cy: 0, orbitR: 135, orbitPhase: 3.9, orbitSpeed: -OMEGA * 2, r: 13, gm: 1000000, visualR: 90 },
        { kind: 'planet', x: -295, y: -165, r: 16, gm: 1450000, visualR: 100 },
        { kind: 'planet', x: 295, y: 165, r: 16, gm: 1450000, visualR: 100 }
      ],
      debris: [
        ...makeVerticalDebrisWall(0, -560, 560, 44, 14),
        ...makeDebrisRing(180, 0, 195, 6, [], -OMEGA, 12, 0.2)
      ],
      warpSpecs: [
        { step: 78, exitX: 180, exitY: 122, r: 26, pairIndex: 0 },
        { step: 164, exitX: -220, exitY: -140, r: 26, pairIndex: 1 }
      ],
      targetSpecs: [
        { frac: 0.16 },
        { frac: 0.38, orbit: { cx: 180, cy: 0, orbitSpeed: OMEGA } },
        { frac: 0.54 },
        { frac: 0.70, orbit: { cx: -180, cy: 0, orbitSpeed: -OMEGA } },
        { frac: 0.82 }
      ],
      fieldCount: 18, symField: 'rot',
      gates: [{ frac: 0.62, gap: 11 }, { frac: 0.86, gap: 10 }]
    },
    {
      // 7-BODY GRAND FINALE (3 Stars + 2 Planets + 2 Orbiting Moons + Dual Warp + 6 Seals!)
      id: 50, mode: 'both', spanW: 1040, spanH: 680,
      pad: { x: -380, y: 155 },
      sol: { angleDeg: -32, speed: 224 },
      goalFrac: 0.92,
      blockDirect: 'wide',
      bodies: [
        { kind: 'star', x: -185, y: 35, r: 25, gm: 3700000, visualR: 160 },
        { kind: 'star2', x: 185, y: 35, r: 25, gm: 3800000, visualR: 165 },
        { kind: 'star', x: 0, y: -185, r: 23, gm: 3100000, visualR: 145 },
        { kind: 'moon', cx: -185, cy: 35, orbitR: 145, orbitPhase: 0.4, orbitSpeed: OMEGA, r: 13, gm: 1050000, visualR: 90 },
        { kind: 'moon', cx: 185, cy: 35, orbitR: 145, orbitPhase: 2.2, orbitSpeed: -OMEGA, r: 13, gm: 1050000, visualR: 90 },
        { kind: 'planet', x: -305, y: -155, r: 16, gm: 1450000, visualR: 100 },
        { kind: 'planet', x: 305, y: -155, r: 16, gm: 1450000, visualR: 100 }
      ],
      debris: makeDebrisRing(0, 35, 86, 5, [], OMEGA * 2, 12, 0),
      warpSpecs: [
        { step: 78, exitX: 185, exitY: 165, r: 27, pairIndex: 0 },
        { step: 168, exitX: -185, exitY: -125, r: 27, pairIndex: 1 }
      ],
      targetSpecs: [
        { frac: 0.14 },
        { frac: 0.34, orbit: { cx: 185, cy: 35, orbitSpeed: -OMEGA } },
        { frac: 0.48 },
        { frac: 0.62, orbit: { cx: 0, cy: -185, orbitSpeed: OMEGA } },
        { frac: 0.74 },
        { frac: 0.84 }
      ],
      fieldCount: 20, symField: 'y',
      gates: [{ frac: 0.56, gap: 11 }, { frac: 0.88, gap: 10 }]
    }
  ];

  window.ORBITA_STAGES = [
    ...FOUNDATIONS,
    ...BLUEPRINTS.map(buildStage)
  ];
})();
