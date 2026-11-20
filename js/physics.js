/**
 * Orbital Physics & Traffic-Synchronized Trajectory Engine
 * - Pure Attractive Gravity (Zero Star Bouncing!):
 *   Skimming close to a star curves sharply via Newtonian gravity (real swing-by),
 *   while hitting a star's surface (`dist <= radius`) destroys the satellite.
 * - Exclusive Gravity Sphere around Each Fixed Star (Patched-Conic Potential):
 *   Stars are spaced widely apart (`D = 470`). Inside each star's Exclusive Gravity Zone
 *   (`r <= 185`), other stars' gravity is strictly zero — giving 100% pure, unperturbed
 *   single-star Keplerian orbits, while seamlessly allowing multi-star transfers across
 *   the interstellar midpoint!
 */
(function () {
  const G_CONST = 1.0;
  const PATCH_EXPONENT = 26; // Smooth-max exponent: w_other < 0.00002 everywhere inside r <= 185

  function evaluateBodiesAtTime(bodyDefs, t) {
    const result = [];
    for (let i = 0; i < bodyDefs.length; i++) {
      const b = bodyDefs[i];
      if (!b.active) continue;

      const introProgress = b.introDuration > 0
        ? Math.min(1, Math.max(0, (t - b.spawnTime) / b.introDuration))
        : 1;
      const ease = introProgress * introProgress * (3 - 2 * introProgress);

      result.push({
        id: b.id,
        kind: b.kind,
        x: b.baseX || 0,
        y: b.baseY || 0,
        vx: 0,
        vy: 0,
        gm: b.gm * ease,
        radius: b.radius * (0.45 + 0.55 * ease),
        exclusiveRadius: (b.exclusiveRadius || 185) * ease,
        gravityVisualRadius: (b.gravityVisualRadius || 185) * ease,
        intro: ease,
        isFixedStar: true
      });
    }
    return result;
  }

  /**
   * Compute total acceleration at (x, y, vx, vy) for a satellite.
   * Uses a conservative Patched-Conic potential Phi = -(sum_k phi_k^P)^(1/P)
   * with strict zero cutoff inside any star's Exclusive Gravity Zone (`r <= 185`).
   */
  function computeAcceleration(state, bodies, context) {
    let ax = 0;
    let ay = 0;

    // Optional Lagrange Anchor zero-G stasis field (player-placed upgrade)
    let gravityScale = 1.0;
    let anchorDamp = 0;
    if ((state.anchorImmunity || 0) <= 0 && context && context.anchors && context.anchors.length > 0) {
      for (let i = 0; i < context.anchors.length; i++) {
        const anc = context.anchors[i];
        const dx = anc.x - state.x;
        const dy = anc.y - state.y;
        const dist = Math.hypot(dx, dy);
        if (dist < anc.radius) {
          const innerRatio = dist / anc.radius;
          const cancel = Math.min(1, Math.max(0, innerRatio * innerRatio));
          gravityScale = Math.min(gravityScale, cancel * 0.08);
          anchorDamp = Math.max(anchorDamp, (1 - innerRatio * 0.7) * 2.8);
          ax += dx * 0.45;
          ay += dy * 0.45;
        }
      }
    }

    const activeCount = bodies.length;
    if (activeCount === 1) {
      const b = bodies[0];
      if (b.gm > 0.001) {
        const dx = b.x - state.x;
        const dy = b.y - state.y;
        const distSq = dx * dx + dy * dy;
        const eps = b.radius * 0.75;
        const plummerSq = distSq + eps * eps;
        const ag = (G_CONST * b.gm * gravityScale) / (plummerSq * Math.sqrt(plummerSq));
        ax += dx * ag;
        ay += dy * ag;
      }
    } else if (activeCount > 1) {
      // Check if inside any star's strict Exclusive Gravity Zone (`r <= exclusiveRadius`)
      let exclusiveStar = null;
      for (let i = 0; i < activeCount; i++) {
        const b = bodies[i];
        if (b.gm <= 0.001 || b.intro < 0.2) continue;
        const dx = b.x - state.x;
        const dy = b.y - state.y;
        if (dx * dx + dy * dy <= b.exclusiveRadius * b.exclusiveRadius) {
          exclusiveStar = b;
          break;
        }
      }

      if (exclusiveStar) {
        // 100% pure 1-body gravity of this star alone — zero pull from all other stars!
        const dx = exclusiveStar.x - state.x;
        const dy = exclusiveStar.y - state.y;
        const distSq = dx * dx + dy * dy;
        const eps = exclusiveStar.radius * 0.75;
        const plummerSq = distSq + eps * eps;
        const ag = (G_CONST * exclusiveStar.gm * gravityScale) / (plummerSq * Math.sqrt(plummerSq));
        ax += dx * ag;
        ay += dy * ag;
      } else {
        // Interstellar space outside r > 185: conservative Smooth-Max Patched Conic potential
        let maxPhi = 0;
        const starData = [];
        for (let i = 0; i < activeCount; i++) {
          const b = bodies[i];
          if (b.gm <= 0.001) continue;
          const dx = b.x - state.x;
          const dy = b.y - state.y;
          const distSq = dx * dx + dy * dy;
          const eps = b.radius * 0.75;
          const s = Math.sqrt(distSq + eps * eps);
          const phi = (G_CONST * b.gm) / s;
          if (phi > maxPhi) maxPhi = phi;
          starData.push({ b, dx, dy, s, phi });
        }

        if (maxPhi > 0) {
          let sumPow = 0;
          for (let i = 0; i < starData.length; i++) {
            const ratio = starData[i].phi / maxPhi;
            starData[i].ratio = ratio;
            if (ratio > 0.35) {
              sumPow += Math.pow(ratio, PATCH_EXPONENT);
            }
          }
          const normFactor = Math.pow(sumPow, 1 / PATCH_EXPONENT);

          for (let i = 0; i < starData.length; i++) {
            const d = starData[i];
            if (d.ratio <= 0.35) continue;
            const weight = Math.pow(d.ratio / normFactor, PATCH_EXPONENT - 1);
            if (weight < 0.00005) continue;
            const ag = (weight * G_CONST * d.b.gm * gravityScale) / (d.s * d.s * d.s);
            ax += d.dx * ag;
            ay += d.dy * ag;
          }
        }
      }
    }

    if (anchorDamp > 0) {
      ax -= state.vx * anchorDamp;
      ay -= state.vy * anchorDamp;
    }

    return { ax, ay, anchored: anchorDamp > 0.4 };
  }

  /**
   * Exact local circular speed around a single star at distance `r`.
   */
  function getLocalCircularSpeed(star, r) {
    const eps = star.radius * 0.75;
    const plummerSq = r * r + eps * eps;
    const ag = (G_CONST * star.gm) / (plummerSq * Math.sqrt(plummerSq));
    return Math.sqrt(Math.max(0, ag * r * r));
  }

  function distToSegmentSq(px, py, ax, ay, bx, by) {
    const l2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
    if (l2 === 0) return (px - ax) * (px - ax) + (py - ay) * (py - ay);
    let t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = ax + t * (bx - ax);
    const projY = ay + t * (by - ay);
    return (px - projX) * (px - projX) + (py - projY) * (py - projY);
  }

  /**
   * Advance one Velocity Verlet step.
   * Never bounces off stars — instead returns `hitBody` if the satellite touches a star's surface!
   */
  function stepVerlet(state, dt, bodiesNow, bodiesNext, context) {
    const prevX = state.x;
    const prevY = state.y;

    const a1 = computeAcceleration(state, bodiesNow, context);

    const nextX = prevX + state.vx * dt + 0.5 * a1.ax * dt * dt;
    const nextY = prevY + state.vy * dt + 0.5 * a1.ay * dt * dt;

    const midState = {
      x: nextX,
      y: nextY,
      vx: state.vx + a1.ax * dt,
      vy: state.vy + a1.ay * dt,
      colorIndex: state.colorIndex,
      anchorImmunity: Math.max(0, (state.anchorImmunity || 0) - dt)
    };

    const a2 = computeAcceleration(midState, bodiesNext, context);

    state.x = nextX;
    state.y = nextY;
    state.vx += 0.5 * (a1.ax + a2.ax) * dt;
    state.vy += 0.5 * (a1.ay + a2.ay) * dt;
    state.anchored = a2.anchored;
    if (state.anchorImmunity > 0) {
      state.anchorImmunity = Math.max(0, state.anchorImmunity - dt);
    }

    // Check direct star surface impact (no bouncing!)
    for (let i = 0; i < bodiesNext.length; i++) {
      const b = bodiesNext[i];
      if (b.intro < 0.4) continue;
      const hitR = b.radius;
      if (distToSegmentSq(b.x, b.y, prevX, prevY, state.x, state.y) <= hitR * hitR) {
        const dx = state.x - b.x;
        const dy = state.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.01 && d < hitR) {
          state.x = b.x + (dx / d) * hitR;
          state.y = b.y + (dy / d) * hitR;
        }
        return { wrapped: false, hitBody: b };
      }
    }

    // Wormhole toroidal wrapping
    let wrapped = false;
    if (context && context.wormholeActive && context.worldBounds) {
      const { halfW, halfH, cx, cy } = context.worldBounds;
      const minX = cx - halfW;
      const maxX = cx + halfW;
      const minY = cy - halfH;
      const maxY = cy + halfH;
      const spanW = halfW * 2;
      const spanH = halfH * 2;

      if (state.x > maxX) {
        state.x = minX + ((state.x - minX) % spanW);
        wrapped = true;
      } else if (state.x < minX) {
        state.x = maxX - ((maxX - state.x) % spanW);
        wrapped = true;
      }
      if (state.y > maxY) {
        state.y = minY + ((state.y - minY) % spanH);
        wrapped = true;
      } else if (state.y < minY) {
        state.y = maxY - ((maxY - state.y) % spanH);
        wrapped = true;
      }
    }

    return { wrapped, hitBody: null };
  }

  /**
   * Compute a satellite's clean forward orbital path so existing orbits are clearly legible on screen.
   * Stops cleanly if the orbit closes back onto itself or impacts a star.
   */
  function computeOrbitTrack(sat, bodyDefs, startTime, context, maxSteps = 560, dt = 1 / 52) {
    const pts = [];
    const sim = {
      x: sat.x,
      y: sat.y,
      vx: sat.vx,
      vy: sat.vy,
      colorIndex: sat.colorIndex,
      anchorImmunity: sat.anchorImmunity || 0
    };

    const x0 = sim.x;
    const y0 = sim.y;
    const v0 = Math.max(1, Math.hypot(sim.vx, sim.vy));
    const ux0 = sim.vx / v0;
    const uy0 = sim.vy / v0;

    let t = startTime;
    let bodiesNow = evaluateBodiesAtTime(bodyDefs, t);
    const anyIgniting = bodyDefs.some((b) => b.active && b.introDuration > 0 && t - b.spawnTime < b.introDuration);

    pts.push({ x: sim.x, y: sim.y, breakSegment: false });

    let leftStartRegion = false;

    for (let step = 1; step <= maxSteps; step++) {
      const bodiesNext = anyIgniting ? evaluateBodiesAtTime(bodyDefs, t + dt) : bodiesNow;
      const res = stepVerlet(sim, dt, bodiesNow, bodiesNext, context);
      t += dt;
      bodiesNow = bodiesNext;

      pts.push({ x: sim.x, y: sim.y, breakSegment: res.wrapped });
      if (res.hitBody) {
        break;
      }

      const dStart = Math.hypot(sim.x - x0, sim.y - y0);
      if (dStart > 42) {
        leftStartRegion = true;
      } else if (leftStartRegion && step > 35 && dStart < 10) {
        const spd = Math.max(1, Math.hypot(sim.vx, sim.vy));
        const align = (sim.vx / spd) * ux0 + (sim.vy / spd) * uy0;
        if (align > 0.94) {
          pts.push({ x: x0, y: y0, breakSegment: false });
          break;
        }
      }
    }

    return pts;
  }

  /**
   * Simulate candidate launch/thruster trajectory in lockstep with ALL active satellites!
   * Returns:
   * - `points`: candidate dotted curve
   * - `swingBys`: close star periapsis points
   * - `hitBody`: star surface impact point (`×`) if the trajectory crashes into a star
   * - `collisions`: predicted collision points (`×`) with existing satellites
   * - `nearMisses`: predicted close grazing flyby points (`◇` "すれすれ交差") with existing satellites
   */
  function predictWithTraffic(initialState, existingSatellites, startTime, bodyDefs, context, steps = 540, dt = 1 / 52) {
    const points = [];
    const swingBys = [];
    const collisions = [];
    const nearMisses = [];
    const transits = [];
    const servicedTaskIds = new Set();
    let hitBody = null;

    const sim = {
      x: initialState.x,
      y: initialState.y,
      vx: initialState.vx,
      vy: initialState.vy,
      colorIndex: initialState.colorIndex,
      anchorImmunity: initialState.anchorImmunity || 0
    };

    const ignoreId = initialState.ignoreSatId ?? null;
    const traffic = [];
    if (existingSatellites) {
      for (let i = 0; i < existingSatellites.length; i++) {
        const s = existingSatellites[i];
        if (s.id === ignoreId) continue;
        traffic.push({
          id: s.id,
          x: s.x,
          y: s.y,
          vx: s.vx,
          vy: s.vy,
          colorIndex: s.colorIndex,
          anchorImmunity: s.anchorImmunity || 0,
          dead: false,
          prevRadDot: undefined,
          lastEventStep: -999
        });
      }
    }

    let t = startTime;
    let bodiesNow = evaluateBodiesAtTime(bodyDefs, t);
    const anyIgniting = bodyDefs.some((b) => b.active && b.introDuration > 0 && t - b.spawnTime < b.introDuration);
    const prevStarDot = new Map();

    // Track multi-star transit charge along predicted path
    let lastStarId = initialState.lastVisitedStarId || null;
    let chargeTimer = initialState.interstellarCharge || 0;
    let lastTransitStarId = null;
    if (!lastStarId) {
      for (let bIdx = 0; bIdx < bodiesNow.length; bIdx++) {
        const b = bodiesNow[bIdx];
        if (b.intro >= 0.4 && Math.hypot(sim.x - b.x, sim.y - b.y) <= b.exclusiveRadius) {
          lastStarId = b.id;
          break;
        }
      }
    }

    const tasks = context && context.tasks ? context.tasks : [];
    const basePickupBonus = initialState.pickupBonus || 0;

    points.push({
      x: sim.x,
      y: sim.y,
      speed: Math.hypot(sim.vx, sim.vy),
      breakSegment: false,
      charged: chargeTimer > 0
    });

    for (let step = 1; step <= steps; step++) {
      const bodiesNext = anyIgniting ? evaluateBodiesAtTime(bodyDefs, t + dt) : bodiesNow;
      const res = stepVerlet(sim, dt, bodiesNow, bodiesNext, context);
      for (let k = 0; k < traffic.length; k++) {
        if (traffic[k].dead) continue;
        const trRes = stepVerlet(traffic[k], dt, bodiesNow, bodiesNext, context);
        if (trRes.hitBody) traffic[k].dead = true;
      }
      t += dt;
      bodiesNow = bodiesNext;
      if (chargeTimer > 0) chargeTimer = Math.max(0, chargeTimer - dt);

      // Check close star swing-bys & Interstellar Exclusive-Zone Entry!
      const speed = Math.hypot(sim.vx, sim.vy);
      for (let bIdx = 0; bIdx < bodiesNow.length; bIdx++) {
        const b = bodiesNow[bIdx];
        if (b.intro < 0.35) continue;
        const dx = sim.x - b.x;
        const dy = sim.y - b.y;
        const dist = Math.hypot(dx, dy);

        if (dist <= b.exclusiveRadius) {
          if (lastStarId && lastStarId !== b.id) {
            chargeTimer = 8.0;
            if (lastTransitStarId !== b.id && transits.length < 4) {
              transits.push({ x: sim.x, y: sim.y, starId: b.id });
              lastTransitStarId = b.id;
            }
          }
          lastStarId = b.id;
        }

        const radDot = dx * sim.vx + dy * sim.vy;
        const prevDot = prevStarDot.get(b.id);
        if (prevDot !== undefined && prevDot < 0 && radDot >= 0) {
          if (dist < b.radius * 3.4 && speed > 155 && swingBys.length < 6) {
            swingBys.push({ x: sim.x, y: sim.y, bodyId: b.id });
          }
        }
        prevStarDot.set(b.id, radDot);
      }

      points.push({
        x: sim.x,
        y: sim.y,
        speed,
        breakSegment: res.wrapped,
        charged: chargeTimer > 0
      });

      if (res.hitBody) {
        hitBody = { x: sim.x, y: sim.y, bodyId: res.hitBody.id };
        break;
      }

      // Check which matching-color Observation Stations this trajectory will clear!
      if (step >= 12 && tasks.length > 0) {
        const chargeBonus = chargeTimer > 0 ? 28 : 0;
        for (let tIdx = 0; tIdx < tasks.length; tIdx++) {
          const task = tasks[tIdx];
          if (task.colorIndex !== sim.colorIndex || servicedTaskIds.has(task.id)) continue;
          const hitR = task.radius + 9 + basePickupBonus + chargeBonus;
          if (Math.hypot(sim.x - task.x, sim.y - task.y) <= hitR) {
            servicedTaskIds.add(task.id);
          }
        }
      }

      // Check phase collisions & close grazing flybys against existing satellites
      if (step >= 18) {
        for (let k = 0; k < traffic.length; k++) {
          const other = traffic[k];
          if (other.dead) continue;
          const dx = sim.x - other.x;
          const dy = sim.y - other.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < 10.8 * 10.8) {
            if (step - other.lastEventStep > 35 && collisions.length < 4) {
              collisions.push({
                x: (sim.x + other.x) * 0.5,
                y: (sim.y + other.y) * 0.5,
                step,
                otherColor: other.colorIndex
              });
              other.lastEventStep = step;
            }
            continue;
          }

          const relVx = sim.vx - other.vx;
          const relVy = sim.vy - other.vy;
          const radDot = dx * relVx + dy * relVy;
          if (
            other.prevRadDot !== undefined &&
            other.prevRadDot < 0 &&
            radDot >= 0 &&
            distSq >= 10.8 * 10.8 &&
            distSq <= 36 * 36 &&
            step - other.lastEventStep > 35 &&
            nearMisses.length < 6
          ) {
            nearMisses.push({
              x: (sim.x + other.x) * 0.5,
              y: (sim.y + other.y) * 0.5,
              otherX: other.x,
              otherY: other.y,
              candX: sim.x,
              candY: sim.y,
              step
            });
            other.lastEventStep = step;
          }
          other.prevRadDot = radDot;
        }
      }
    }

    return { points, swingBys, hitBody, collisions, nearMisses, transits, servicedTaskIds };
  }

  /**
   * Look ~0.9s ahead to warn the player of imminent satellite-to-satellite or star collisions.
   */
  function detectImminentCollisions(satellites, startTime, bodyDefs, context) {
    const dangerSatIds = new Set();
    const dangerPairs = [];
    if (satellites.length === 0) return { dangerSatIds, dangerPairs };

    const steps = 42;
    const dt = 1 / 46;
    const simSats = satellites.map((s) => ({
      id: s.id,
      x: s.x,
      y: s.y,
      vx: s.vx,
      vy: s.vy,
      colorIndex: s.colorIndex,
      dead: false,
      shieldReady: (s.shieldCooldown || 0) <= 0,
      anchorImmunity: s.anchorImmunity || 0
    }));

    const hasShieldUpgrade = !!(context && context.hasShieldUpgrade);
    let t = startTime;
    let bodiesNow = evaluateBodiesAtTime(bodyDefs, t);
    const seenPair = new Set();

    for (let step = 0; step < steps; step++) {
      const bodiesNext = evaluateBodiesAtTime(bodyDefs, t + dt);
      for (let i = 0; i < simSats.length; i++) {
        if (simSats[i].dead) continue;
        const res = stepVerlet(simSats[i], dt, bodiesNow, bodiesNext, context);
        if (res.hitBody) {
          dangerSatIds.add(simSats[i].id);
          simSats[i].dead = true;
        }
      }
      t += dt;
      bodiesNow = bodiesNext;

      for (let i = 0; i < simSats.length; i++) {
        const a = simSats[i];
        if (a.dead) continue;
        for (let j = i + 1; j < simSats.length; j++) {
          const b = simSats[j];
          if (b.dead) continue;
          if (hasShieldUpgrade && (a.shieldReady || b.shieldReady)) continue;

          const dx = a.x - b.x;
          const dy = a.y - b.y;
          if (dx * dx + dy * dy < 11.4 * 11.4) {
            dangerSatIds.add(a.id);
            dangerSatIds.add(b.id);
            const pKey = a.id < b.id ? `${a.id}_${b.id}` : `${b.id}_${a.id}`;
            if (!seenPair.has(pKey) && dangerPairs.length < 6) {
              seenPair.add(pKey);
              dangerPairs.push({
                idA: a.id,
                idB: b.id,
                hitX: (a.x + b.x) * 0.5,
                hitY: (a.y + b.y) * 0.5
              });
            }
          }
        }
      }
    }

    return { dangerSatIds, dangerPairs };
  }

  window.OrbitalPhysics = {
    evaluateBodiesAtTime,
    computeAcceleration,
    getLocalCircularSpeed,
    stepVerlet,
    computeOrbitTrack,
    predictWithTraffic,
    detectImminentCollisions,
    distToSegmentSq
  };
})();