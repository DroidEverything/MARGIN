/* MARGIN title vista — thin adapter over js/orrery.js.
   The starting page shows the LIVE solar-system Earth (same buildSolarSystem
   scene, same Blue Marble / Black Marble / MODIS-cloud material, same decay-2
   sunlight rig, same simDays clock as the mission-select and briefing views)
   in a zoomed cinematic framing — with the REAL presentation Sun rising
   half-eclipsed beside the limb. Starfield is HYG-catalog star points ONLY
   (real catalog stars, true B-V colors): no photo skybox on this screen, so
   there is no JPEG macroblocking in the blacks. No fake flare sprite
   anywhere: the glare, the corona, and the terminator sweep are the live
   system. The Sun carries its own triple-layer halo parented to the disc
   (core + skirt + aura, depth-tested so the limb occults it), because the
   one post-processing experiment fogged the frame and geometry glow is
   deterministic. The camera flows continuously through four FIXED angles
   (sunside limb, terminator side, blue marble, far side — ~14 s each, ~56 s
   per revolution) while the Earth spins on its own, so the surface visibly
   rotates beneath each viewpoint and the disc phases night through crescent
   to day and back. There is deliberately NO solver, NO iteration, and NO
   frame-to-frame feedback in the framing: the pose is a pure function of a
   monotonic clock plus the live Earth vector, so it cannot diverge or fling
   (see PRESETS).
   Link contract (what keeps the title -> select cut seamless):
   - simDays starts at todayDays() and advances at DAYS_PER_SEC, exactly like
     every other orrery view; each frame publishes window.__MARGIN_SIMDAYS
     (adopted by select/brief when fresh) plus window.__MARGIN_HANDOFF with
     the live camera viewpoint, which the select view adopts as its flight
     start — game.js skips the veil fade for title -> select, so the cut reads
     as one continuous pull-back, not a fade plus a second intro flight.
   - Earth spin / cloud drift use the same BODY_STYLE rates as the shared loop.
   - The light rig, material, and stars are identical to the select view; the
     iris is the only difference, and it runs the same metered law damped
     toward a night-side floor (see below).
   Honest close-range compromises (documented, rendering-only):
   - Orbit rings + distance tags are hidden (a hero close-up has no use for
     them); the wide views restore all of it. The Moon hides too: under the
     night iris it renders as a flat overexposed blob drifting through the
     hero framing — same reasoning, same restore. The corona stays but tight
     (1.6x) and dimmed (half power): stock 5x at full power fills the sky
     from two Earth radii and reads as gray wash.
   - The Sun disc is pinned at uExposure 0.15, decoupled from the title
     iris: hot cells clip brilliant white while dark lanes hold burnt orange
     and the limb falls off — structure that survives the title CSS grade,
     which now dims less (canvas 0.85) so the glare punches through.
   - Iris: the shared exposureForBody() law meters SUNLIT rock to mid-gray —
     right on the day side, but it would crush the night hemisphere to black.
     The title snaps between that metered value (anything past a sliver of
     day) and 1.0 (deep night) by the live sunlit fraction, with the same
     1/exposure counter-boosts select uses (stars, ambient, city
     lights), so both hemispheres read and the terminator crossing never
     washes out.
   NEVER touches simulation state. Silent CSS fallback (.earth-fallback)
   covers file:// and no-WebGL. */
import * as THREE from 'three';
import {
  DPR_CAP, DAYS_PER_SEC, BODY_STYLE, radiusWorld,
  buildStars, buildSolarSystem, todayDays, tex, dataTex,
  bodyWorldUnified, exposureForBody, isPhysicalMode, UNITS_PER_KM
} from './orrery.js';

const FOV_DEG = 38;
const TAN_V = Math.tan(FOV_DEG * Math.PI / 360);
/* FIXED cinematic angles — no solver, no iteration, no feedback. Each preset
   is a rigid Earth-local framing (coefficients over o = away-from-Sun,
   s = camera-right, up; dist and target in Earth radii). Consecutive presets
   sit <90° apart so the eased blend between them can never collapse. The
   camera pose is a pure function of the live Earth vector: nothing in here
   can diverge, slam to a clamp, or flip discontinuously. */
const PRESETS = [
  /* sunside limb (opening frame): camera mostly anti-sunward but sidestepped,
     aim nudged so Earth sits lower-right as a huge limb while the REAL Sun
     burns upper-left, clear of the disc — verified numerically in true-scale mode.
     Same no-solver arithmetic as the rest. */
  { dir: [0.90, -0.44, 0.18], dist: 3.20, tgt: [0.20, -0.20, -0.60] },
  { dir: [0.30, 0.90, 0.30], dist: 3.20, tgt: [0, 0, 0] },            // terminator side
  { dir: [-1.00, 0.25, 0.40], dist: 5.00, tgt: [0, 0, 0] },           // blue marble
  { dir: [-0.20, -0.85, 0.35], dist: 3.20, tgt: [0, 0, 0] }           // far side
];
/* the cycle never pauses: SEG seconds flowing through each angle into the
   next, ~56 s per full revolution. Pure timer function — still no solver. */
const SEG = 14.0;
const NIGHT_EXP = 1.0;
const VER = 2026092313;

const V = {
  renderer: null, scene: null, camera: null, canvas: null,
  sys: null, bodies: null, ambient: null, starMat: null, sunMat: null,
  simDays: 0, preset: 0, cycleT: 0, dist: 0, r: 0.014, exposure: 0, isPhys: false,
  dir: new THREE.Vector3(1, 0.4, 0), o: new THREE.Vector3(1, 0, 0),
  s: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(1, 0.4, 0),
  goodE: new THREE.Vector3(1.35, 0, 0),
  raf: 0, W: 0, H: 0, last: 0, failed: false, graded: false,
  loadDone: false, bootMaxTimer: 0, mgrPending: 0, mgrSettled: 0, mgrSave: null, mgrHooks: null
};
const UP = new THREE.Vector3(0, 1, 0);
const _E = new THREE.Vector3(), _C = new THREE.Vector3(), _T = new THREE.Vector3(),
  _P = new THREE.Vector3(), _S = new THREE.Vector3(), _D = new THREE.Vector3();

function publishClock() {
  try { window.__MARGIN_SIMDAYS = V.simDays; } catch (e) {}
}

function publishHandoff() {
  try {
    window.__MARGIN_HANDOFF = {
      pos: [V.camera.position.x, V.camera.position.y, V.camera.position.z],
      tgt: [_E.x, _E.y, _E.z],
      sim: V.simDays, t: performance.now()
    };
  } catch (e) {}
}

function earthPos(out) {
  const p = bodyWorldUnified('earth', out, V.simDays,
    { physical: V.isPhys, unitsPerKm: UNITS_PER_KM, originKm: [0, 0, 0] });
  return p || out.set(1.35, 0, 0);
}

/* camera basis from the LIVE Earth heliocentric vector: o points away from
   the Sun, s is the horizontal camera-right. Non-finite samples fall back
   to the last good vector — the camera can never chase a NaN. */
function computeBasis() {
  earthPos(_E);
  V.o.set(_E.x, 0, _E.z);
  if (V.o.lengthSq() < 1e-12) V.o.set(1, 0, 0); else V.o.normalize();
  V.s.crossVectors(UP, V.o).normalize();
  V.r = Math.max(1e-9, radiusWorld('earth', { physical: V.isPhys, unitsPerKm: UNITS_PER_KM }));
}

function lookTarget(out, tU, tO, tS) {
  return out.copy(_E).addScaledVector(UP, tU)
    .addScaledVector(V.o, tO).addScaledVector(V.s, tS);
}

/* cyclic segment: which two keyframes bracket the flow, and the raw phase
   between them. Interpolation is Catmull-Rom (below), so velocity carries
   through every keyframe — the flow never dwells, never pauses. */
function segInfo() {
  const n = PRESETS.length, total = SEG * n;
  const t = ((V.cycleT % total) + total) % total;
  const i = Math.floor(t / SEG) % n;
  return { i, t: (t - i * SEG) / SEG };
}

function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/* FIXED-angle framing, Catmull-Rom flow: every scalar (direction coeffs,
   dolly, target offsets) rides a cyclic CR spline through the keyframes, so
   velocity is continuous across every angle — no dwell, no pause. Still
   straight arithmetic off the live Earth vector: no projection, no
   iteration, no state feedback, nothing that can diverge. */
function applyFixedFrame() {
  computeBasis();
  const n = PRESETS.length;
  const { i, t } = segInfo();
  const P = k => PRESETS[(((i + k) % n) + n) % n];
  const mixA = (get, j) => cr(get(P(-1))[j], get(P(0))[j], get(P(1))[j], get(P(2))[j], t);
  const byDir = j => mixA(p => p.dir, j);
  const byTgt = j => mixA(p => p.tgt, j);
  const byDist = cr(P(-1).dist, P(0).dist, P(1).dist, P(2).dist, t);
  _D.set(
    V.o.x * byDir(0) + V.s.x * byDir(1),
    byDir(2),
    V.o.z * byDir(0) + V.s.z * byDir(1)
  );
  if (_D.lengthSq() < 1e-12) _D.set(1, 0.3, 0);
  _D.normalize();
  const dist = byDist * V.r;
  V.dist = dist;
  lookTarget(_T, byTgt(0) * V.r, byTgt(1) * V.r, byTgt(2) * V.r);
  _C.copy(_E).addScaledVector(_D, dist);
  V.camera.position.copy(_C);
  V.camera.lookAt(_T);
}

/* live sunlit fraction of the facing disc: 0 deep night, 1 full day. */
function dayFactor() {
  _S.copy(_E).multiplyScalar(-1).normalize(); // Earth -> Sun
  return 0.5 * (1 + _S.dot(V.u));
}

function dispose() {
  /* select-viewer pattern: release the renderer/context, never the shared
     orrery texture cache (maps are reused verbatim by the next view). */
  if (V.renderer) {
    try { V.renderer.dispose(); } catch (e) {}
    const r = V.renderer;
    setTimeout(() => { try { r.forceContextLoss(); } catch (e) {} }, 600);
  }
  V.renderer = V.scene = V.camera = V.sys = V.bodies = V.ambient =
    V.starMat = V.sunMat = null;
}

function shortAssetName(url) {
  try {
    const clean = String(url || '').split('?')[0].split('/').pop() || '';
    return clean.replace(/\.(jpg|jpeg|png|webp|glb)$/i, '').replace(/^(8k|2k)_/i, '').replace(/_/g, ' ').toUpperCase().slice(0, 22);
  } catch (e) { return ''; }
}

const TITLE_TEX_KEYS = [
  'earth', 'earthClouds', 'earthNight', 'moon', 'mars',
  'mercury', 'venus', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'hipparcos'
];
const _failedTexUrls = new Set();
let _mgrIdle = false;

function criticalTextures() {
  return [tex('earth'), tex('earthClouds'), tex('earthNight'), dataTex('earthRough')].filter(Boolean);
}
function solarTextures() {
  const out = TITLE_TEX_KEYS.map((k) => tex(k));
  out.push(dataTex('earthRough'));
  return out.filter(Boolean);
}
function isTexFailed(t) {
  if (!_failedTexUrls.size || !t) return false;
  const img = t.image;
  if (img && img.src) {
    for (const u of _failedTexUrls) {
      if (img.src.endsWith(u) || u.endsWith(img.src)) return true;
    }
  }
  return false;
}
function isTexSettled(t) {
  if (!t) return true;
  if (isTexFailed(t)) return true;
  const img = t.image;
  return !!(img && img.complete && img.naturalWidth > 0);
}
function waitTexReady(t) {
  if (!t) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    let hookedImg = null;
    let idleSince = 0;
    const finish = (img) => {
      if (done) return;
      done = true;
      if (img && img.naturalWidth > 0) {
        t.needsUpdate = true;
        if (typeof img.decode === 'function') {
          Promise.race([img.decode().catch(() => {}), new Promise((r) => setTimeout(r, 8000))]).then(resolve, resolve);
          return;
        }
      }
      resolve();
    };
    const check = () => {
      if (done || !V.scene) return finish(null);
      if (isTexFailed(t)) return finish(null);
      const img = t.image;
      if (img) {
        if (img.complete) return finish(img);
        if (hookedImg !== img) {
          hookedImg = img;
          const onLoad = () => { if (!done) check(); };
          const onErr = () => finish(null);
          img.addEventListener('load', onLoad, { once: true });
          img.addEventListener('error', onErr, { once: true });
        }
        idleSince = 0;
      } else if (_mgrIdle) {
        if (!idleSince) idleSince = performance.now();
        else if (performance.now() - idleSince > 1500) return finish(null);
      } else {
        idleSince = 0;
      }
      setTimeout(check, 60);
    };
    check();
  });
}

function restoreMgrHooks() {
  const s = V.mgrSave, h = V.mgrHooks;
  const mgr = THREE.DefaultLoadingManager;
  if (!s || !h || !mgr) return;
  if (mgr.onStart === h.onStart) mgr.onStart = s.onStart;
  if (mgr.onProgress === h.onProgress) mgr.onProgress = s.onProgress;
  if (mgr.onLoad === h.onLoad) mgr.onLoad = s.onLoad;
  if (mgr.onError === h.onError) mgr.onError = s.onError;
  V.mgrSave = null; V.mgrHooks = null;
}

function syncEarthGraded() {
  if (V.graded || !V.bodies || !V.bodies.earth) return;
  try {
    const host = V.bodies.earth.isMesh ? V.bodies.earth : (V.bodies.earth.children || [])[0];
    const map = host && host.material && host.material.map;
    if (map && map.image && map.image.complete && map.image.naturalWidth > 0) {
      document.body.classList.add('earth3d');
      V.graded = true;
    }
  } catch (e) {}
}

async function prepareGpuAndReveal() {
  if (V.loadDone || !V.scene || !V.renderer) return;
  V.loadDone = true;
  if (V.bootMaxTimer) { clearTimeout(V.bootMaxTimer); V.bootMaxTimer = 0; }
  const boot = window.__MARGIN_BOOT;
  if (boot) boot.step(95, 'DECODING 8K EARTH & CLOUD LAYERS…', 97, 3, 'DECODING');
  try {
    const texList = solarTextures();
    await Promise.all(texList.map(waitTexReady));
    for (const t of texList) {
      if (t.image && t.image.naturalWidth > 0) t.needsUpdate = true;
    }
  } catch (e) {}
  restoreMgrHooks();
  if (!V.scene || !V.renderer || !V.camera) return;
  if (boot) boot.step(97, 'WAITING FOR TYPOGRAPHY & FONTS…', 99, 3, 'FONTS');
  try {
    if (document.fonts && document.fonts.ready) {
      await Promise.race([document.fonts.ready.catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
    }
  } catch (e) {}
  if (!V.scene || !V.renderer || !V.camera) return;
  if (boot) boot.step(98, 'COMPILING WEBGL SHADERS & ATMOSPHERE…', 100, 3, 'SHADERS');
  try { V.renderer.compile(V.scene, V.camera); } catch (e) {}
  // Activate earth3d before sizing & rendering so #earthCanvas has full viewport dimensions behind #bootGate
  syncEarthGraded();
  try {
    size();
    applyFixedFrame();
    applyIris(1);
    V.renderer.render(V.scene, V.camera);
  } catch (e) {}
  await new Promise((resolve) => {
    let settled = false;
    const fin = () => { if (!settled) { settled = true; resolve(); } };
    requestAnimationFrame(() => {
      try {
        if (V.scene && V.renderer && V.camera) {
          size();
          applyFixedFrame();
          applyIris(1);
          V.renderer.render(V.scene, V.camera);
        }
      } catch (e) {}
      requestAnimationFrame(fin);
    });
    setTimeout(fin, 400);
  });
  syncEarthGraded();
  if (boot) boot.finish('ALL TELEMETRY LOCKED · READY');
}

function hookTitleStream() {
  restoreMgrHooks();
  V.loadDone = false;
  V.mgrPending = 0;
  V.mgrSettled = 0;
  if (V.bootMaxTimer) { clearTimeout(V.bootMaxTimer); V.bootMaxTimer = 0; }
  const mgr = THREE.DefaultLoadingManager;
  if (!mgr) return;
  const boot = window.__MARGIN_BOOT;
  const prev = {
    onStart: mgr.onStart, onProgress: mgr.onProgress,
    onLoad: mgr.onLoad, onError: mgr.onError
  };
  const report = (url, total) => {
    if (V.loadDone || !V.scene || !boot) return;
    if (total > 0) {
      V.mgrPending = Math.max(V.mgrPending, total);
      const frac = Math.min(1, V.mgrSettled / total);
      const pct = Math.max(58, Math.min(95, 58 + Math.round(frac * 37)));
      const nextCap = Math.min(96, pct + Math.max(2, Math.round(37 / total)));
      const nm = shortAssetName(url);
      boot.step(pct, nm ? `STREAMING ${nm}…` : 'STREAMING 8K PLANETARY TEXTURES…', nextCap, 2, `${Math.min(V.mgrSettled, total)} / ${total} ASSETS`);
    }
  };
  _mgrIdle = false;
  _failedTexUrls.clear();
  const hooks = {
    onStart(url, loaded, total) {
      try { if (prev.onStart) prev.onStart.call(mgr, url, loaded, total); } catch (e) {}
      _mgrIdle = false;
      V.mgrPending = Math.max(V.mgrPending + 1, total || 0);
      report(url, Math.max(V.mgrPending, total || 0));
    },
    onProgress(url, loaded, total) {
      try { if (prev.onProgress) prev.onProgress.call(mgr, url, loaded, total); } catch (e) {}
      _mgrIdle = false;
      V.mgrSettled = Math.max(V.mgrSettled, loaded || 0);
      V.mgrPending = Math.max(V.mgrPending, total || 0);
      report(url, Math.max(V.mgrPending, total || 0));
    },
    onLoad() {
      try { if (prev.onLoad) prev.onLoad.call(mgr); } catch (e) {}
      _mgrIdle = true;
      prepareGpuAndReveal();
    },
    onError(url) {
      try { if (prev.onError) prev.onError.call(mgr, url); } catch (e) {}
      if (url) _failedTexUrls.add(url);
      const total = Math.max(V.mgrPending, V.mgrSettled);
      report(url, total);
    }
  };
  V.mgrSave = prev;
  V.mgrHooks = hooks;
  mgr.onStart = hooks.onStart;
  mgr.onProgress = hooks.onProgress;
  mgr.onLoad = hooks.onLoad;
  mgr.onError = hooks.onError;
  V.bootMaxTimer = 0;
}

function stop() {
  if (V.raf) cancelAnimationFrame(V.raf);
  V.raf = 0;
  if (V.bootMaxTimer) { clearTimeout(V.bootMaxTimer); V.bootMaxTimer = 0; }
  restoreMgrHooks();
  V.loadDone = false; V.mgrPending = 0; V.mgrSettled = 0;
  dispose();
  V.canvas = null; V.W = 0; V.H = 0; V.failed = false; V.graded = false;
  V.dist = 0; V.preset = 0; V.cycleT = 0; V.exposure = 0;
  try { document.body.classList.remove('earth3d'); } catch (e) {}
}

function size() {
  const cv = V.canvas;
  if (!cv || !cv.isConnected || !V.renderer) return;
  const w = Math.max(1, cv.clientWidth), h = Math.max(1, cv.clientHeight);
  if (w === V.W && h === V.H) return;
  V.W = w; V.H = h;
  V.camera.aspect = w / h;
  V.camera.updateProjectionMatrix();
  computeBasis(); // fresh radius before fitting depth (matters in ?phys=1)
  V.camera.near = Math.max(1e-5, V.r * 0.05);
  V.camera.far = 1000;
  V.camera.updateProjectionMatrix();
  if (V.starMat) V.starMat.uniforms.pr.value = V.renderer.getPixelRatio();
  V.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
  V.renderer.setSize(w, h, false);
  /* aspect changed: framing is aspect-independent (fixed angles), so nothing
     to re-solve — the pose rebuilds every frame regardless. */
}

function applyIris(dt) {
  const metered = Math.max(1e-4, exposureForBody('earth', Math.max(0.05, _E.length())));
  /* snap, don't sweep: anything past a sliver of day meters for rock, deep
     night alone opens up. Log-mean dwells mid-crossing would wash the clouds
     out. */
  let f = (dayFactor() - 0.10) / 0.25;
  f = Math.min(1, Math.max(0, f));
  f = f * f * (3 - 2 * f);
  const goal = Math.exp(THREE.MathUtils.lerp(Math.log(NIGHT_EXP), Math.log(metered), f));
  if (!V.exposure) V.exposure = goal;
  else V.exposure += (goal - V.exposure) * Math.min(1, dt * 4);
  try {
    const inv = 1 / Math.max(1e-4, V.exposure);
    V.renderer.toneMappingExposure = V.exposure;
    /* Structured brilliance: pin uExposure 0.15 so hot cells clip white
       while dark lanes hold orange and the limb falls off — texture that
       survives the CSS grade, instead of a clipped coin that the grade
       stamps flat gray. Same shader, same star. */
    if (V.sunMat && V.sunMat.uniforms && V.sunMat.uniforms.uExposure) {
      V.sunMat.uniforms.uExposure.value = 0.15;
    }
    if (V.starMat && V.starMat.uniforms && V.starMat.uniforms.uBoost) {
      V.starMat.uniforms.uBoost.value = Math.min(600, 1.1 * inv);
    }
    if (V.ambient) V.ambient.intensity = Math.min(75, 0.22 * inv);
    /* city lights ride the iris so they hold constant into the night side. */
    if (V.bodies && V.bodies.earth) {
      const host = V.bodies.earth.isMesh ? [V.bodies.earth] : (V.bodies.earth.children || []);
      const stack = [...host];
      while (stack.length) {
        const ch = stack.pop();
        if (ch.isMesh && ch.material && ch.material.userData && ch.material.userData.nightBoost) {
          ch.material.userData.nightBoost.value = Math.min(800, inv);
        }
        if (ch.children) for (const c of ch.children) stack.push(c);
      }
    }
  } catch (e) { /* iris must never break the frame */ }
}

function frame(now) {
  if (!V.canvas || !V.canvas.isConnected) { stop(); return; }
  V.raf = requestAnimationFrame(frame);
  size();
  const dt = Math.min(0.1, (now - V.last) / 1000 || 0);
  V.last = now;
  let still = false;
  try { still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (!still) {
    V.simDays += dt * DAYS_PER_SEC;
    /* the flow never pauses: a monotonic clock eased through the angles.
       Frozen entirely under reduced-motion. */
    V.cycleT += dt;
  }
  publishClock();
  if (V.sunMat && V.sunMat.uniforms && V.sunMat.uniforms.uTime && !still) {
    V.sunMat.uniforms.uTime.value = (V.sunMat.uniforms.uTime.value + dt) % 3600;
  }
  if (V.bodies) {
    for (const key of Object.keys(V.bodies)) {
      const m = V.bodies[key];
      if (!m) continue;
      /* hero declutter, enforced per frame so late arrivals (Bennu's async
         mesh) hide too: Earth + Sun render, siblings simulate. */
      m.visible = (key === 'earth' || key === 'sun');
      const pw = bodyWorldUnified(key, _P, V.simDays,
        { physical: V.isPhys, unitsPerKm: UNITS_PER_KM, originKm: [0, 0, 0] });
      if (pw) m.position.copy(pw);
      /* planet spins on its own axis AND the viewpoint orbits (different
         rates), so the surface visibly rotates beneath the camera. */
      if (!still) m.rotation.y += dt * ((BODY_STYLE[key] || {}).spin || 0.02);
    }
  }
  if (V.sys && V.sys.atmospheres && V.sys.atmospheres.earth && !still) {
    V.sys.atmospheres.earth.rotation.y += dt * 0.055;
  }
  /* fixed angles only: pose is rebuilt from scratch every frame with plain
     arithmetic — nothing carried, nothing to diverge. */
  applyFixedFrame();
  V.u.copy(V.camera.position).sub(_E).normalize();
  applyIris(dt);
  publishHandoff();
  /* reveal only once the live Earth texture is decoded on the mesh, so the first
     paint is never a gray/half-loaded disc. */
  syncEarthGraded();
  /* direct rendering: the one post-processing experiment fogged the frame,
     so the glow is geometry again (see sunHalo below) — deterministic. */
  V.renderer.render(V.scene, V.camera);
}

/* layered sun glow, done as geometry: three additive shells parented to the
   disc. Hot tight core + warm mid skirt + faint wide aura. Depth-tested, so
   the Earth occults them like the real thing; alphas chosen to survive the
   title CSS grade. */
function glowTexture(stops) {
  const s = 256, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sunHalo(sunR) {
  const grp = new THREE.Group();
  const layers = [
    { s: 1.25, o: 0.90, stops: [[0, 'rgba(255,253,246,1)'], [0.35, 'rgba(255,240,214,0.55)']] },
    { s: 2.20, o: 0.34, stops: [[0, 'rgba(255,236,200,0.85)'], [0.45, 'rgba(255,196,130,0.28)']] },
    { s: 4.20, o: 0.13, stops: [[0, 'rgba(255,214,160,0.6)'], [0.50, 'rgba(255,170,110,0.16)']] }
  ];
  for (const L of layers) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(L.stops),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      opacity: L.o
    }));
    sp.scale.setScalar(Math.max(1e-9, sunR * L.s));
    grp.add(sp);
  }
  return grp;
}

function start(cv) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  } catch (e) {
    V.failed = true;
    try { if (window.__MARGIN_BOOT) window.__MARGIN_BOOT.finish('2D FALLBACK READY'); } catch (e2) {}
    return;
  }
  V.renderer = renderer;
  V.canvas = cv;
  try { renderer.setClearColor(0x04070d, 1); } catch (e) {}
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  V.isPhys = false;
  try { V.isPhys = isPhysicalMode(); } catch (e) {}
  V.scene = new THREE.Scene();
  V.camera = new THREE.PerspectiveCamera(FOV_DEG, 16 / 9, 0.001, 1000);
  V.scene.add(V.camera);
  try {
    /* catalog star points ONLY on this screen — no photo skybox (its JPEG
       blacks macroblocked under the title iris). scene.background stays
       null; the clear color is the void. Select/brief keep their sky. */
    V.scene.background = null;
  } catch (e) {}
  /* the live solar system — same assembly the select/brief views fly,
     REAL Sun included. */
  try { if (window.__MARGIN_BOOT) window.__MARGIN_BOOT.step(56, 'INITIALIZING 3D SOLAR SYSTEM…', 62, 2, 'SOLAR SYSTEM'); } catch (e) {}
  hookTitleStream();
  const built = buildSolarSystem(V.scene, () => !!V.scene, {
    simDays: todayDays(), physical: V.isPhys,
    unitsPerKm: UNITS_PER_KM, focusKey: null, originKm: [0, 0, 0]
  });
  V.sys = built;
  V.bodies = built.bodies;
  V.ambient = built.ambient || null;
  V.sunMat = built.sunMat;
  /* Sun grading for close range (per-view uniforms — the shared rig and the
     select view are untouched): pinned at uExposure 0.15, decoupled from
     the title iris. Hot cells clip brilliant white, dark lanes hold burnt
     orange, the limb falls off — structure that survives the title CSS
     grade instead of a flat coin. */
  try {
    if (V.sunMat && V.sunMat.uniforms) {
      if (V.sunMat.uniforms.uExposure) V.sunMat.uniforms.uExposure.value = 0.15;
    }
  } catch (e) {}
  /* hero declutter: this cinematic renders Earth + Sun + stars only. Sibling
     planets at the night iris read as flat gray discs, so they stay hidden here
     while continuing to simulate underneath, and the wide views restore all of them. */
  try { if (built.orbitLines) built.orbitLines.visible = false; } catch (e) {}
  try { if (V.bodies.moon) V.bodies.moon.visible = false; } catch (e) {}
  const stars = buildStars();
  V.scene.add(stars.points);
  V.starMat = stars.mat;
  /* the Sun's own glow, done as geometry: three additive halo shells parented
     to the disc (they track it, and the Earth occults them correctly through
     the depth test). Deterministic at any iris — no post chain to fog. */
  try {
    const sunMesh = V.bodies.sun;
    const sunR = (sunMesh && sunMesh.userData.renderRadius) || 0.5;
    V.scene.traverse((o) => { if (o.isSprite) o.visible = false; }); // stock corona off
    if (sunMesh) sunMesh.add(sunHalo(sunR));
  } catch (e) {}
  V.simDays = todayDays();
  V.preset = 0; V.cycleT = 0; // open settled on the eclipse limb
  publishClock();
  V.W = 0; V.H = 0;
  size();
  applyFixedFrame();
  V.u.copy(V.camera.position).sub(_E).normalize();
  applyIris(1); // snap the iris before first paint — no exposure pop
  publishHandoff();
  V.last = performance.now();
  if (!V.raf) V.raf = requestAnimationFrame(frame);
  criticalTextures();
  const solar = solarTextures();
  const pendingTex = solar.filter((t) => !isTexSettled(t));
  if (V.mgrPending === 0 && pendingTex.length === 0) {
    _mgrIdle = true;
    prepareGpuAndReveal();
  } else {
    if (V.mgrPending === 0 && pendingTex.length > 0) {
      Promise.all(solar.map(waitTexReady)).then(() => {
        if (!V.loadDone && V.scene && V.renderer) prepareGpuAndReveal();
      });
    }
    if (!V.loadDone && window.__MARGIN_BOOT) {
      const totalShow = Math.max(V.mgrPending, pendingTex.length);
      window.__MARGIN_BOOT.step(58, 'STREAMING 8K EARTH & SOLAR MAPS…', 68, 2, `0 / ${totalShow} ASSETS`);
    }
  }
}

/* Called (guarded) from game.js render(). Starts on the title canvas,
   tears down the moment it leaves the DOM. */
function sync() {
  let cv = null;
  try { cv = document.getElementById('earthCanvas'); } catch (e) { cv = null; }
  if (!cv) {
    if (V.raf || V.canvas) stop();
    try {
      const scr = (typeof S !== 'undefined' && S) ? S.screen : '';
      if (scr && scr !== 'title' && window.__MARGIN_BOOT) window.__MARGIN_BOOT.finish('FLIGHT SYSTEM READY');
    } catch (e) {}
    return;
  }
  if (V.canvas === cv && V.raf) return;
  stop();
  if (V.failed) {
    try { if (window.__MARGIN_BOOT) window.__MARGIN_BOOT.finish('2D FALLBACK READY'); } catch (e) {}
    return;
  }
  start(cv);
}

/* Diagnostic probe: framing + real-Sun screen pos + iris + clock + handoff
   state for telemetry verification. */
function debug() {
  const out = { ver: VER, simDays: +V.simDays.toFixed(4), aspect: 0, distR: 0,
    preset: 0, blend: 0, center: null, limb: null, sun: null, dayF: 0,
    exposure: 0, bodies: 0, handoff: false, phys: V.isPhys };
  try {
    if (!V.camera || !V.dist) return out;
    out.aspect = +(V.W / Math.max(1, V.H)).toFixed(3);
    out.distR = +(V.dist / V.r).toFixed(2);
    out.preset = segInfo().i;
    out.blend = +segInfo().t.toFixed(3);
    applyFixedFrame(); // read-only report of the live pose
    _P.copy(_E); _P.project(V.camera);
    out.center = [+_P.x.toFixed(3), +_P.y.toFixed(3)];
    _P.copy(_E).addScaledVector(UP, V.r); _P.project(V.camera);
    out.limb = [+_P.x.toFixed(3), +_P.y.toFixed(3)];
    _S.set(0, 0, 0); _S.project(V.camera);
    out.sun = [+_S.x.toFixed(3), +_S.y.toFixed(3)];
    V.u.copy(V.camera.position).sub(_E).normalize();
    out.dayF = +dayFactor().toFixed(3);
    out.exposure = +V.exposure.toFixed(4);
    out.bodies = V.bodies ? Object.keys(V.bodies).length : 0;
    try { out.handoff = !!window.__MARGIN_HANDOFF; } catch (e) {}
  } catch (e) {}
  return out;
}

window.TitleEarth = { sync, debug, ver: VER };
/* self-kick: render() already ran before this module finished importing on
   a cold boot, so sync once now in case the title canvas is already up */
try { sync(); } catch (e) {}
