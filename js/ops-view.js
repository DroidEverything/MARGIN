/* MARGIN 3D Flight Operations Viewport (js/ops-view.js)
   Full-screen 3D Solar System flight operations center.
   Renders real-time interplanetary spacecraft trajectory, live probe model,
   DSN Earth communication laser, and adaptive camera tracking.
   Adapter over js/orrery.js. Fallback-safe. */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/DRACOLoader.js';
import { mergeVertices, toCreasedNormals } from 'three/addons/BufferGeometryUtils.js';
import {
  KIT, loadKitGltf, assembleKit, heroForLevel, normalizeHero,
  loadRoverGltf, calibrateRover,
  bodyTierOf, wingTierOf, radioTierOf, wingScaleOf, radioScaleOf,
  engineSpecOf, groupOfInstr, mountEngineRow, mountGlyphRow
} from './kit-assembly.js?v=20261108c';
import { AU_KM, SOLAR_CONSTANT_W_M2 } from './solar-system-accuracy.js';
import {
  DPR_CAP, WORLD_PER_AU, UNITS_PER_KM,
  buildStars, loadSpaceSkybox, buildSolarSystem,
  todayDays, bodyWorld, bodyWorldPhysical, frameOf, exposureForBody,
  isPhysicalMode, frameDist, radiusOf, radiusKmTrue, SUN_POINT_INTENSITY,
  BODY_STYLE, PLANET_DATA, tex
} from './orrery.js';
import {
  updateSurfaceCamera, updateSurfSky, updateSurfRover, disposeSurface,
  enterSurface as surfEnterSurface, exitSurface as surfExitSurface,
  surfDebugExposure, decodeSite, surfHeightAt
} from './surface-view.js?v=20261108n';
import { STAR_VEC } from './stars-data.js';

const V = {
  renderer: null,
  scene: null,
  camera: null,
  canvas: null,
  controls: null,
  sys: null,
  sunMat: null,
  sunLight: null,
  ambient: null,
  bodies: null,
  craftGroup: null,
  craftToken: 0,
  fgScene: null,
  fgCamera: null,
  fgSun: null,
  fgAmb: null,
  fgCraftModel: null,
  craftMarker: null, // screen-space findability dot (UI, not the model)
  craftMarkerTex: null,
  cockpitLook: null, // {yaw,pitch,drag,lx,ly} — first-person look offsets (shared by mast-cam)
  surfActive: false, // surface diorama owns the frame (Phase 5)
  surf: null, // {scene,sun,amb,terrain,rover,marker,label,siteId,patch,cx,cz,roverPos,heading}
  cockpitUp: null, // persistent parallel-transported up-vector (see cockpitTangentUp)
  prevRelPos: null, // last-frame planet-relative craft pos (heliocentric-free differencing)
  orbitShown: null, // slew-limited DISPLAY orbit angle (anti-strobe, see orbitAngle)
  orbitEllipse: null, // arrived-branch ellipse params feeding the ring line  orbitWall: 0, // wall-clock ms of last orbitAngle evaluation
  orbitDay: NaN, // sim day the display angle was last synced to
  orbitRate: 0, // orbit rate the display angle was last synced to
  scanGroup: null,
  scanCone: null,
  scanRing: null,
  trajGroup: null,
  plannedLine: null,
  historyLine: null,
  commsLine: null,
  targetOrbitLine: null,
  simDays: 0,
  tickDay: NaN, // last per-tick smoothDay (sim truth as fed; ?time-debug compares it to V.simDays)
  viewAnchor: NaN, // sim-days anchor of the continuous VIEW clock (see below)
  viewWall: 0, // wall ms of the anchor
  viewRate: 0, // measured sim-days per wall second (0 while paused)
  _dyn: null, // last tick dynamics for per-frame refresh (presentation only)
  targetKey: 'mars',
  exposure: 1.0, // metered iris (same law as select/brief/title); smoothed per frame
  camMode: 'craft', // 'craft' | 'target' | 'system' | 'free' | 'cockpit'
  craftWorldPos: new THREE.Vector3(),
  targetWorldPos: new THREE.Vector3(),
  earthWorldPos: new THREE.Vector3(),
  camTargetPos: new THREE.Vector3(),
  camTargetLook: new THREE.Vector3(),
  lastTime: 0,
  raf: 0,
  W: 0,
  H: 0,
  active: false,
  arrived: false,
  frac: 0,
  flightTimeDays: 0,
  lastCraftKm: [0, 0],
  trajPoints: [],
  userInteracted: false,
  lastTrackedPos: new THREE.Vector3(),
  glide: null,
  camInitialized: false,
  labelsGroup: null,
  bodyLabels: {},
  sceneKind: null, // 'ops' | 'final' — which screen owns the live scene
  finalKey: null,
  mblur: null, // camera-shutter fade rig (surface only, lazy; see ensureMblur)
  mblurClear: true, // next surface frame clears instead of accumulating
  _mblurWasSurf: false, // accumulation armed only across consecutive surf frames
  _mblurTels: 0, // teleport count at last accumulated frame (cuts clear)
  _skyboxCubeRT: null,
  _skySphereMesh: null,
  earthIris: null // cached Earth material handles (see collectEarthIris)
  ,
  satTick: null, // Phase B runner tick (null when beats idle/done)
  satChip: null, // Phase B beat/ticker chip (single DOM node, textContent only)
  cruiseTrail: null, // Phase B 128-sample ring trail (preallocated, ESTIMATE)
  cruiseHead: 0, cruiseCount: 0, // ring-buffer head + valid count
  deployPivots: null, // Phase B wing hinges (built once per craft load)
  deployT: -1 // deploy anim clock (-1 idle); 7 s smoothstep, snap on reduced motion
};

const _zero = new THREE.Vector3(0, 0, 0);
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _NEG_Y = new THREE.Vector3(0, -1, 0);
const _UP_Y = new THREE.Vector3(0, 1, 0);

/* Frame-time instrument (`?time-debug`): proves per-frame continuity at
   60 FPS in a live browser — sky °/frame, rover m/frame, tick rate, teleport
   count. URL-gated; one boolean check per frame otherwise. */
const TIME_DEBUG = (() => {
  try { return new URLSearchParams(location.search).has("time-debug"); }
  catch (e) { return false; }
})();
/* ?perf=1 debug overlay (zero cost when off): rolling avg + p95 render ms,
   renderer.info.memory + render.calls, THREE.REVISION + useLegacyLights.
   window.__launchDbg exposed ONLY under this flag (same drill as launch-view). */
const PERF = (() => {
  try { return new URLSearchParams(location.search).has("perf"); }
  catch (e) { return false; }
})();
/* GPU timer (?perf=1 only, zero cost off): CPU submission ms mislead on iGPU —
   this is the real number. Same contract as launch-view. */
function makeGpuTimer(renderer) {
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return null;
    const ring = [null, null, null, null];
    let w = 0, sum = 0, n = 0, max = 0;
    return {
      begin() {
        try {
          if (ring[w]) gl.deleteQuery(ring[w]);
          const q = gl.createQuery();
          gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
          ring[w] = q;
        } catch (e) {}
      },
      end() {
        try { gl.endQuery(ext.TIME_ELAPSED_EXT); } catch (e) {}
        w = (w + 1) & 3;
        this.poll();
      },
      poll() {
        try {
          for (let i = 0; i < 4; i++) {
            const q = ring[i];
            if (!q || !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
            if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
              const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
              sum += ms; n++;
              if (ms > max) max = ms;
            }
            try { gl.deleteQuery(q); } catch (e) {}
            ring[i] = null;
          }
        } catch (e) {}
      },
      avg() { return n ? sum / n : NaN; }, max() { return max; },
      dispose() {
        try { for (let i = 0; i < 4; i++) { if (ring[i]) gl.deleteQuery(ring[i]); ring[i] = null; } } catch (e) {}
      }
    };
  } catch (e) { return null; }
}
function perfSample(ms) {
  if (!PERF) return;
  try {
    if (!V._perfArr) { V._perfArr = new Float32Array(120); V._perfIdx = 0; V._perfN = 0; }
    V._perfArr[V._perfIdx] = ms;
    V._perfIdx = (V._perfIdx + 1) % 120;
    if (V._perfN < 120) V._perfN++;
    const now = performance.now();
    if (V._perfLast && now - V._perfLast < 500) return;
    V._perfLast = now;
    let sum = 0;
    for (let i = 0; i < V._perfN; i++) sum += V._perfArr[i];
    const avg = V._perfN ? sum / V._perfN : 0;
    let p95 = avg;
    try {
      const tmp = Array.prototype.slice.call(V._perfArr.subarray(0, V._perfN));
      tmp.sort((a, b) => a - b);
      p95 = tmp[Math.min(tmp.length - 1, Math.floor(tmp.length * 0.95))] || avg;
    } catch (e) {}
    let mem = null, calls = 0;
    try { mem = V.renderer.info.memory; calls = V.renderer.info.render.calls; } catch (e) {}
    let rev = '?', leg = '?';
    try { rev = THREE.REVISION; } catch (e) {}
    try { leg = String(V.renderer.useLegacyLights); } catch (e) {}
    let el = V._perfEl;
    if (!el || !el.isConnected) {
      const host = (V.canvas && V.canvas.parentElement) || document.body;
      el = document.createElement('div');
      el.style.cssText = 'position:absolute;right:12px;bottom:12px;z-index:9;pointer-events:none;'
        + 'font:11px/1.6 monospace;color:#cfe3ff;background:rgba(2,6,12,.6);'
        + 'border:1px solid rgba(140,180,255,.3);border-radius:4px;padding:6px 10px;white-space:pre;';
      host.appendChild(el);
      V._perfEl = el;
    }
    el.textContent = 'render ' + avg.toFixed(2) + ' ms avg / ' + p95.toFixed(2) + ' p95'
      + ((V._gpuT && isFinite(V._gpuT.avg())) ? ' · GPU ' + V._gpuT.avg().toFixed(2) + '/' + V._gpuT.max().toFixed(2) : ' · GPU n/a (rAF p95 above)')
      + '\n'
      + 'mem geo ' + (mem ? mem.geometries : '?') + ' tex ' + (mem ? mem.textures : '?')
      + ' calls ' + calls + '\n'
      + 'three r' + rev + ' legacyLights ' + leg
      + '\nlock dz ' + ((typeof DZ !== 'undefined' && DZ.active) ? 1 : 0) + '/'
      + ((typeof DZ !== 'undefined' && DZ.done) ? 1 : 0) + ' b/d '
      + ((typeof DZ !== 'undefined' && DZ.b) ? 1 : 0) + '/'
      + ((typeof DZ !== 'undefined' && DZ.d) ? 1 : 0);
  } catch (e) {}
}
const _tdbg = {
  el: null, frames: 0, winT: 0, ticks: 0, lastTick: 0,
  lastDays: NaN, maxSkyD: 0, lastCX: NaN, lastCZ: NaN, maxRvM: 0,
};

/* Camera-shutter motion blur (`?no-blur` opts out; default ON in the surface
   view only): strobing is sampling, not missing interpolation — the view
   clock already evaluates every frame exactly. A real camera shutter fixes
   fast-but-continuous motion by integrating time within each exposure, so
   this fades the previous frame toward black and draws the new one over it
   (frame accumulation, warp-adaptive persistence via mblurKeepForRate,
   wall-compensated). Static content converges pixel-sharp within frames;
   transparent/additive/exposure transitions (sun disc fade, glare, iris and
   lighting gains, rover marker) streak instead of leaping. Opaque-sky
   continuity comes from the surface star-trail samples (exact-timestamp
   ghosts — accumulation cannot streak opaque geometry, which overwrites). Honest by construction:
   it integrates TRUE rendered positions, invents none, touches no sim
   state. Persistence is pure presentation gain (it decays, never a clock),
   so pause still freezes sharp. Orbital view untouched. */
const NO_BLUR = (() => {
  try { return new URLSearchParams(location.search).has("no-blur"); }
  catch (e) { return false; }
})();
const MBLUR_KEEP_LO = 0.5; // persistence at/below the default 10 d/s warp
const MBLUR_KEEP_HI = 0.9; // persistence at MAX warp (long timelapse trail)
/* Debug override (`?shutter=0..1`): pins frame persistence, bypassing the
   warp mapping below — lets a live browser judge crisp-stepping vs
   accumulation-mush at high warp. URL-gated; absent on normal loads. */
const MBLUR_KEEP_PIN = (() => {
  try {
    const q = new URLSearchParams(location.search);
    if (!q.has("shutter")) return NaN;
    const v = parseFloat(q.get("shutter"));
    return (isFinite(v)) ? Math.max(0, Math.min(1, v)) : NaN;
  } catch (e) { return NaN; }
})();
/* Presentation-only shutter persistence from the EXACT sim rate (d/s wall).
   Per-60fps-frame keep fraction: LO at/below 10 d/s (converges sharp in
   ~2 frames) ramping linearly to HI at 225 d/s (~10-frame trail spanning a
   49°/frame celestial step as a continuous streak). Gain only — it decays,
   never accumulates time, so no lag and no snap are possible. The existing
   dt*60 wall compensation at the call site keeps this FPS-independent. */
function mblurKeepForRate(rate) {
  if (isFinite(MBLUR_KEEP_PIN)) return MBLUR_KEEP_PIN;
  const r = (isFinite(rate) && rate > 0) ? rate : 0;
  const t = Math.max(0, Math.min(1, (r - 10) / (225 - 10)));
  return MBLUR_KEEP_LO + (MBLUR_KEEP_HI - MBLUR_KEEP_LO) * t;
}
function ensureMblur() {
  if (V.mblur && V.mblur.scene && V.mblur.cam && V.mblur.mat) return V.mblur;
  try {
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 1 - MBLUR_KEEP_LO,
      depthTest: false, depthWrite: false, fog: false });
    mat.toneMapped = false;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    quad.renderOrder = 9999;
    scene.add(quad);
    V.mblur = { scene, cam, mat };
  } catch (e) { V.mblur = null; }
  return V.mblur;
}

/* ── Player craft in ops: the SAME shared assembly as the build bay ──
   js/kit-assembly.js builds body+wings+radio tiers + engine + glyphs from the
   locked build; ops keeps TRUE SIMULATION COORDINATES and renders the SAME
   representative craft assembly: true scale at close range, with a capped
   visibility lift far away (≤0.002 scene units — small next to the 250x
   planet discs, never planet-sized), plus a screen-space findability dot +
   the config-tagged CRAFT label + arrival scan beam for target/system views.
   Craft cam mode (default) zooms the camera down to the model; cockpit mode
   rides the model first-person facing the target.
   Async with a token guard: a stale load never clobbers a newer scene. */
/* Craft cam mode (default) tracks V.craftWorldPos: controls.target follows the
   craft each frame, so the model stays centred; cockpit mode instead parks
   the eye on the craft and locks the gaze on the target (controls off). */
function readSel() {
  try {
    return {
      n: (((typeof S !== 'undefined' && S.instruments) || []).length),
      power: (typeof S !== 'undefined') ? (S.power || '') : '',
      comms: (typeof S !== 'undefined') ? (S.comms || '') : '',
      prop: (typeof S !== 'undefined') ? (S.prop || '') : '',
      instr: (((typeof S !== 'undefined' && S.instruments) || []).slice(0, 12)),
      level: (typeof S !== 'undefined') ? (S.levelId || '') : ''
    };
  } catch (e) { return { n: 0, power: '', comms: '', prop: '', instr: [], level: '' }; }
}
/* True-scale craft extent in scene units (largest bbox dimension mapped via
   UNITS_PER_KM). Falls back to a ~10 m estimate before the async model loads
   so the camera frames the right scale from the first frame. Read-only. */
function craftTrueSize() {
  try {
    const s = trueCraftSpan();
    if (s && isFinite(s) && s > 0) return s;
  } catch (e) {}
  return (CRAFT_REF_SPAN_M / 1000) * UNITS_PER_KM;
}
function groupOfOps(id) {
  try { return groupOfInstr(id, (typeof INSTR !== 'undefined') ? INSTR : []); }
  catch (e) { return ''; }
}

/* ── Split-Depth Foreground Craft Layer (NASA Eyes convention) ──
   The main scene renders celestial bodies, stars, and trajectories in AU coordinates.
   The spacecraft model is rendered in a foreground pass (fgScene) at 1 unit = 1 meter,
   with its own camera (fgCamera) matching view orientation and perspective.
   The depth buffer is cleared between passes so the spacecraft has float32 millimeter
   precision, 100% solid PBR materials, and zero Z-fighting or see-through artifacts. */

const _fgCraftPos = new THREE.Vector3();
const _fgCraftQuat = new THREE.Quaternion();
const _fgSunDir = new THREE.Vector3();
const _fgToCraft = new THREE.Vector3();
const _fgToBody = new THREE.Vector3();
const _fgClosest = new THREE.Vector3();

function setupCraftLayer() {
  if (V.fgScene) return;
  V.fgScene = new THREE.Scene();
  V.fgCamera = new THREE.PerspectiveCamera(V.camera ? V.camera.fov : 40, V.camera ? V.camera.aspect : 16 / 9, 0.05, 1e7);

  // Sunlight for foreground pass (intensity matches main astronomical rig)
  V.fgSun = new THREE.DirectionalLight(0xffffff, 2400.0);
  V.fgScene.add(V.fgSun);
  V.fgScene.add(V.fgSun.target);

  // Cosmic ambient fill & studio rim lighting for authentic aerospace PBR look
  V.fgAmb = new THREE.AmbientLight(0x405570, 60.0);
  V.fgScene.add(V.fgAmb);

  const craftFill = new THREE.DirectionalLight(0x5a7ca8, 120.0);
  craftFill.position.set(-1, 0.5, -1).normalize();
  V.fgScene.add(craftFill);

  const craftRim = new THREE.DirectionalLight(0xffeedd, 180.0);
  craftRim.position.set(1.5, 1.2, 0.8).normalize();
  V.fgScene.add(craftRim);

  if (V.renderer) V.renderer.autoClear = false;
}

function syncCraftLayer() {
  if (!V.fgCraftModel || !V.craftGroup || !V.fgCamera || !V.camera) return;

  V.craftGroup.getWorldPosition(_fgCraftPos);
  V.craftGroup.getWorldQuaternion(_fgCraftQuat);

  // Craft sits at foreground origin (0, 0, 0)
  V.fgCraftModel.position.set(0, 0, 0);
  V.fgCraftModel.quaternion.copy(_fgCraftQuat);

  // Foreground camera placed relative to craft in meters:
  // (camPos - craftPos) in AU scene units converted to meters
  const metersPerSceneUnit = 1000 / UNITS_PER_KM;
  V.fgCamera.position
    .copy(V.camera.position).sub(_fgCraftPos)
    .multiplyScalar(metersPerSceneUnit);
  V.fgCamera.quaternion.copy(V.camera.quaternion);
  V.fgCamera.fov = V.camera.fov;
  V.fgCamera.aspect = V.camera.aspect;
  V.fgCamera.updateProjectionMatrix();

  // Sun direction as seen from the craft in heliocentric AU scene:
  // Sun is at (0, 0, 0). Vector from craft to Sun is -craftPos
  if (_fgCraftPos.lengthSq() > 1e-12) {
    _fgSunDir.copy(_fgCraftPos).negate().normalize();
  } else {
    _fgSunDir.set(0, 0, 1);
  }
  V.fgSun.position.copy(_fgSunDir).multiplyScalar(1000);
  V.fgSun.target.position.set(0, 0, 0);
}

function isCraftVisible() {
  if (V.camMode === 'cockpit') return false; // Cockpit eye rides forward looking out
  if (V.camMode === 'craft') return true;    // Close-up inspection mode is always focused on craft
  if (!V.craftGroup || !V.camera) return false;

  const craftPos = _fgCraftPos;
  V.craftGroup.getWorldPosition(craftPos);
  const camPos = V.camera.position;

  // Bodies that can occlude the craft in orbital view
  const bodies = [];
  if (V.earthWorldPos) {
    bodies.push({ pos: V.earthWorldPos, r: targetBodyRadius('earth') });
  }
  if (V.targetKey && V.targetKey !== 'earth' && V.targetWorldPos) {
    bodies.push({ pos: V.targetWorldPos, r: targetBodyRadius(V.targetKey) });
  }

  const toCraft = _fgToCraft.subVectors(craftPos, camPos);
  const distCraft = toCraft.length();
  if (distCraft < 1e-12) return true;
  const dir = toCraft.divideScalar(distCraft);

  for (const b of bodies) {
    if (!b.pos) continue;
    const toBody = _fgToBody.subVectors(b.pos, camPos);
    const t = THREE.MathUtils.clamp(toBody.dot(dir), 0, distCraft);
    const closest = _fgClosest.copy(camPos).addScaledVector(dir, t);
    if (closest.distanceTo(b.pos) < b.r && t < distCraft) {
      return false; // occluded behind planet
    }
  }
  return true;
}
function mountOpsCraft() {
  const token = ((V.craftToken | 0) + 1);
  V.craftToken = token;
  const sel = readSel();
  const hero = heroForLevel(sel.level);
  // Fallback chain: hero -> kit assembly -> margin bus -> tiny marker.
  const wantKit = () => {
    const urls = [KIT.bodies[bodyTierOf(sel)], KIT.wings[wingTierOf(sel)],
      KIT.radios[radioTierOf(sel)]];
    return Promise.all(urls.map(loadKitGltf)).then((gltfs) => {
      const built = assembleKit(gltfs[0].scene, gltfs[1].scene, gltfs[2].scene, 1.0, 1.0);
      mountEngineRow(built.group, engineSpecOf(sel.prop));
      mountGlyphRow(built.group, sel.instr, groupOfOps);
      try { if (built.parts && built.parts[1]) built.parts[1].name = 'kit_wings'; } catch (e) {}
      return built.group;
    });
  };
  const gotModel = (group) => {
    if (token !== V.craftToken || !V.active || !V.scene) return;
    // Ops scene units are AU-scale (WORLD_PER_AU=1.35 per AU, UNITS_PER_KM≈9e-9):
    // raw GLB units here would dwarf planets. Convert canonical metres to true
    // scene size with the SAME km→scene transform as ephemeris positions
    // (presentation transform, not a physical claim — the craft is sub-pixel
    // at true size, exactly like reality). The centering offset lives INSIDE
    // the scaled frame so the model centre coincides exactly with the wrap
    // origin (= craftWorldPos = trajectory/comms/scan endpoints) at ANY
    // readability scale. A parent-space offset would NOT scale and would
    // detach the model from its lines — that was the separation bug.
    try {
      const box = new THREE.Box3().setFromObject(group);
      const c = box.getCenter(new THREE.Vector3());
      const sz = box.getSize(new THREE.Vector3());

      /* Dual-pass meter architecture:
         NASA 3D Resources models are authored in arbitrary units (cm, dm, or mm).
         Normalize raw geometry so its maximum extent in fgScene is EXACTLY activeCraftSpanM()
         (e.g. 16.7 m for Aqua, 4.3 m for LRO, 13.6 m for MRO, 10 m for kit assembly).
         1 scene unit in fgScene = 1 meter. */
      const maxDim = Math.max(sz.x, sz.y, sz.z) || 1;
      const targetSpanM = activeCraftSpanM();
      const modelScale = targetSpanM / maxDim;

      const centered = new THREE.Group();
      centered.name = 'craft_centered';
      centered.position.set(-c.x, -c.y, -c.z); // Center about local origin
      for (const k of group.children.slice()) centered.add(k);

      const scaledHolder = new THREE.Group();
      scaledHolder.name = 'craft_meter_scaled';
      scaledHolder.scale.setScalar(modelScale);
      scaledHolder.add(centered);

      /* Per-mesh safety net: enforce solid PBR materials, depth testing, and front-side hulls */
      try {
        let meshes = 0;
        centered.traverse(o => {
          if (!o.isMesh) return;
          meshes++;
          try { o.frustumCulled = false; } catch (e2) {}
          const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
          for (const m of mats) {
            if (!m) continue;
            try {
              if (m.transparent && (m.opacity === 0 || m.opacity < 0.05 || m.opacity >= 0.95)) {
                m.transparent = false;
                m.opacity = 1.0;
              }
              m.depthTest = true;
              m.depthWrite = true;
              if (m.alphaTest > 0.9) m.alphaTest = 0;
              const isPlanar = /panel|wing|array|dish|solar|radiator|foil|default #2/i.test(m.name || '') ||
                               /panel|wing|array|dish|solar|radiator|foil|proxy7_1/i.test(o.name || '');
              m.side = isPlanar ? THREE.DoubleSide : THREE.FrontSide;
              if (m.name === 'default #2' || o.name === 'mro_proxy7_1') {
                m.side = THREE.DoubleSide; m.transparent = false; m.opacity = 1.0; m.depthWrite = true;
              }
              if (m.needsUpdate !== undefined) m.needsUpdate = true;
            } catch (e3) {}
          }
        });
        const check = new THREE.Box3().setFromObject(centered);
        if (!meshes || check.isEmpty()) {
          const marker = new THREE.Mesh(
            new THREE.BoxGeometry(1, 0.6, 1),
            new THREE.MeshBasicMaterial({ color: 0x9fb4cc, wireframe: true }));
          marker.name = 'craft_empty_fallback';
          try { marker.frustumCulled = false; } catch (e2) {}
          centered.add(marker);
        }
      } catch (e2) {}

      // Move real model into meter-scale fgScene (1 unit = 1 meter)
      if (V.fgCraftModel && V.fgScene) {
        try { V.fgScene.remove(V.fgCraftModel); } catch (e) {}
        V.fgCraftModel = null;
      }
      V.fgCraftModel = scaledHolder;
      if (V.fgScene) V.fgScene.add(V.fgCraftModel);

      // Leave empty proxy in AU scene so orbit code / update() keeps driving position & orientation
      const wrap = new THREE.Group();
      wrap.name = 'spacecraft_probe_proxy';
      wrap.userData.glbSize = (targetSpanM / 1000) * UNITS_PER_KM;
      wrap.userData.trueScale = UNITS_PER_KM;
      try { wrap.position.copy(V.craftWorldPos); } catch (e) {}
      V.scene.add(wrap);
      V.craftGroup = wrap;

      // Phase B: wing hinges for the deploy beat (kit path only; heroes ride log-only).
      try {
        V.deployPivots = null; V.deployT = -1;
        const wings = centered.getObjectByName('kit_wings');
        if (wings) V.deployPivots = buildWingHinges(wings);
      } catch (e) { V.deployPivots = null; }

      // Model size is known now: re-zoom the craft camera onto the true scale
      if (V.camMode === 'craft' && V.camInitialized && V.camera && V.controls) {
        startCameraGlide('craft');
      }
    } catch (e) {}
  };
  const showDot = () => {
    if (token !== V.craftToken || !V.active || !V.scene) return;
    const wrap = new THREE.Group();
    wrap.name = 'spacecraft_probe_proxy';
    wrap.userData.glbSize = 10 * UNITS_PER_KM;
    wrap.userData.trueScale = UNITS_PER_KM;
    try { wrap.position.copy(V.craftWorldPos); } catch (e) {}
    V.scene.add(wrap);
    V.craftGroup = wrap;

    const dot = new THREE.Mesh(
      new THREE.OctahedronGeometry(5), // ~10 m in fgScene
      new THREE.MeshBasicMaterial({ color: 0x5ef6a0 }));
    if (V.fgCraftModel && V.fgScene) {
      try { V.fgScene.remove(V.fgCraftModel); } catch (e) {}
    }
    V.fgCraftModel = dot;
    if (V.fgScene) V.fgScene.add(dot);

    if (V.camMode === 'craft' && V.camInitialized && V.camera && V.controls) {
      startCameraGlide('craft');
    }
  };
  if (V.craftGroup) { try { V.scene.remove(V.craftGroup); } catch (e) {} V.craftGroup = null; }
  if (V.fgCraftModel && V.fgScene) { try { V.fgScene.remove(V.fgCraftModel); } catch (e) {} V.fgCraftModel = null; }
  const loadHero = () => loadKitGltf(hero.url).then((g) => normalizeHero(g.scene.clone(true)));
  (hero ? loadHero().catch(() => wantKit()) : wantKit())
    .then(gotModel)
    .catch(() => { showDot(); });
}


/* ── Craft screen-space marker (presentation UI, no sim effect) ──
   Wide views render the model at true ~10 m scale (sub-pixel at range), so
   this constant-screen-size dot marks the true craft position everywhere
   except close-up inspection (craft/cockpit mode, or within 0.02 units, where
   the model fills the frame). Honest UI marker, not a model substitute: it
   never pretends to be the spacecraft's size. */
export function buildCraftMarker() {
  const S = 64, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(220,255,235,1)');
  g.addColorStop(0.35, 'rgba(94,246,160,0.9)');
  g.addColorStop(1, 'rgba(94,246,160,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({
    map: t, transparent: true, opacity: 0.9,
    depthWrite: false, toneMapped: false
  });
  const sp = new THREE.Sprite(m);
  sp.name = 'craft_marker';
  sp.renderOrder = 5;
  sp.visible = false;
  V.craftMarkerTex = t;
  V.craftMarker = sp;
  return sp;
}
function updateCraftMarker(now) {
  const sp = V.craftMarker;
  if (!sp || !V.camera) return;
  // No position yet (pre-first-update): stay hidden, never at the origin/Sun.
  if (V.craftWorldPos.lengthSq() < 1e-6) { sp.visible = false; return; }
  const d = V.camera.position.distanceTo(V.craftWorldPos);
  // Every view except close-up inspection (the true-scale model is sub-pixel
  // at range): at close range the model fills the frame, so the beacon would
  // just sit on top of it.
  if (V.camMode === 'craft' || V.camMode === 'cockpit' || !(d >= 0.02)) { sp.visible = false; return; }
  sp.visible = true;
  sp.position.copy(V.craftWorldPos);
  // Small constant screen size (~2% of frame height): a findability beacon,
  // never planet-scale, soft pulse kept subtle.
  const s = THREE.MathUtils.clamp(d * 0.025, 1e-6, 0.35);
  sp.scale.set(s, s, 1);
  sp.material.opacity = 0.55 + 0.15 * Math.sin((now || 0) * 0.003);
}

/* ── Arrival scan beam REMOVED: the synthetic cone/ring overlay obscured the
   target body. Kept as no-op stubs so older call sites remain valid —
   no beam is ever built or shown. */
function buildScanBeam() {
  const group = new THREE.Group();
  group.name = 'scan_beam_removed';
  group.visible = false;
  V.scanGroup = group; V.scanCone = null; V.scanRing = null;
  return group;
}
function updateScanBeam() {
  if (V.scanGroup) V.scanGroup.visible = false;
  return;
}

/* ── Build Comms Laser Line (Earth <-> Craft) ── */
function buildCommsLine() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(6);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const mat = new THREE.LineDashedMaterial({
    color: 0x5ef6a0,
    linewidth: 2.0,
    scale: 1,
    dashSize: 0.025,
    gapSize: 0.025,
    transparent: true,
    opacity: 0.75,
    toneMapped: false,
    blending: THREE.AdditiveBlending
  });
  const line = new THREE.Line(geo, mat);
  line.computeLineDistances();
  return line;
}

/* ── Build Trajectory Visualizer Lines ── */
function buildTrajectoryLines() {
  const group = new THREE.Group();

  // 1. History Line (traveled path, bright luminous green)
  const histGeo = new THREE.BufferGeometry();
  const histMat = new THREE.LineBasicMaterial({
    color: 0x5ef6a0,
    linewidth: 2.5,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending
  });
  V.historyLine = new THREE.Line(histGeo, histMat);
  group.add(V.historyLine);

  // 2. Planned Line (remaining path, subtle luminous cyan)
  const planGeo = new THREE.BufferGeometry();
  const planMat = new THREE.LineDashedMaterial({
    color: 0x38bdf8,
    dashSize: 0.035,
    gapSize: 0.025,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    toneMapped: false
  });
  V.plannedLine = new THREE.Line(planGeo, planMat);
  group.add(V.plannedLine);

  // 3. Target Orbit Ring (once arrived): draws the branch's tilted ellipse
  // (see V.orbitEllipse). Preallocated 129-point buffer — the per-tick update
  // writes in place, zero allocation.
  const orbGeo = new THREE.BufferGeometry();
  orbGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(129 * 3), 3));
  const orbMat = new THREE.LineBasicMaterial({
    color: 0x9fd8b8,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    toneMapped: false
  });
  V.targetOrbitLine = new THREE.Line(orbGeo, orbMat);
  V.targetOrbitLine.visible = false;
  group.add(V.targetOrbitLine);

  return group;
}

/* ── Clean, Minimal Celestial Body Text Labels ── */
export function createBodyTextSprite(text, color, w) {
  const cv = document.createElement('canvas');
  cv.width = w || 256;
  cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.font = '600 20px "IBM Plex Mono", "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.98)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = color || '#a0c4e8';
  ctx.fillText(text.toUpperCase(), (w || 256) / 2, 32);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    toneMapped: false
  });
  const sprite = new THREE.Sprite(mat);
  const sx = 0.22 * ((w || 256) / 256);
  sprite.scale.set(sx, 0.055, 1);
  sprite.userData.baseScale = new THREE.Vector2(sx, 0.055);
  sprite.userData.labelKey = text.toLowerCase();
  return sprite;
}

function formatBodyLabelText(key, rawName) {
  if (key === 'craft') return 'CRAFT';
  if (key === 'sun') return 'SUN';
  if (key === 'earth') return 'EARTH';
  const name = (rawName || key).replace(/^\d+\s*/, '').trim();
  return name.toUpperCase();
}

/* Spacecraft label badge, NASA Eyes convention: hexagon outline marker +
   name text, constant screen size. Stays right above the craft; when the
   true-scale model is sub-pixel the badge + marker dot carry findability. */
function createCraftLabelSprite() {
  const cv = document.createElement('canvas');
  cv.width = 168;
  cv.height = 48;
  const ctx = cv.getContext('2d');

  // Hexagon outline (spacecraft position marker)
  const hx = 26, hy = 24, hr = 15;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i / 6) * Math.PI * 2;
    const px = hx + Math.cos(a) * hr, py = hy + Math.sin(a) * hr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.strokeStyle = 'rgba(94, 246, 160, 0.85)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hx, hy, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#5ef6a0';
  ctx.fill();

  // Name text beside the marker
  ctx.font = '700 17px "JetBrains Mono", "IBM Plex Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#5ef6a0';
  ctx.fillText('CRAFT', 50, 25);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 20;
  sprite.userData.labelKey = 'craft';
  return sprite;
}

function craftLabelText() {
  return 'CRAFT';
}

function applyOrbitLineFilter(targetKey) {
  if (!V.sys || !V.sys.orbitLines) return;
  const tk = (targetKey || '').toLowerCase();
  V.sys.orbitLines.traverse((ch) => {
    if (!ch.isLine) return;
    const bk = (ch.userData && ch.userData.bodyKey) ? ch.userData.bodyKey.toLowerCase() : null;
    if (!bk) return; // skip untagged geometry (tags are sprites, not Lines)
    const isMissionBody = (bk === 'earth' || bk === tk);
    ch.visible = isMissionBody;
    if (ch.material) {
      // Earth ring: subtle blue-white; target ring: slightly brighter accent
      if (isMissionBody) {
        ch.material.opacity = bk === tk ? 0.70 : 0.45;
      }
    }
  });
}

function setupBodyLabels() {
  if (V.labelsGroup && V.scene) {
    try { V.scene.remove(V.labelsGroup); } catch (e) {}
  }
  const group = new THREE.Group();
  group.name = 'mission_body_labels';
  V.bodyLabels = {};

  const targetKey = (V.targetKey || 'bennu').toLowerCase();

  // Spacecraft label: small badge anchored directly above the craft
  const craftLbl = createCraftLabelSprite();
  group.add(craftLbl);
  V.bodyLabels.craft = { sprite: craftLbl, key: 'craft', baseOffset: 0.0005, isMissionFocus: true };

  // Sun label (warm golden solar glow)
  const sunLbl = createBodyTextSprite('SUN', '#ffd080');
  group.add(sunLbl);
  V.bodyLabels.sun = { sprite: sunLbl, key: 'sun', baseOffset: 0.56, isMissionFocus: true };

  // Earth label (soft pale blue)
  const earthLbl = createBodyTextSprite('EARTH', '#6ba4ea');
  group.add(earthLbl);
  V.bodyLabels.earth = { sprite: earthLbl, key: 'earth', baseOffset: 0.065, isMissionFocus: true };

  // Solar system celestial bodies in V.bodies
  if (V.bodies) {
    for (const key of Object.keys(V.bodies)) {
      if (key === 'sun' || key === 'earth') continue;
      const isTarget = (key.toLowerCase() === targetKey);
      const bData = PLANET_DATA[key] || {};
      const name = formatBodyLabelText(key, bData.name);
      const col = isTarget ? '#5ef6a0' : '#8d93a1';
      const lbl = createBodyTextSprite(name, col);
      group.add(lbl);
      const rad = isPhysicalMode() ? radiusKmTrue(key) * UNITS_PER_KM : (radiusOf(key) || 0.025);
      V.bodyLabels[key] = {
        sprite: lbl,
        key: key,
        baseOffset: Math.max(0.065, rad * 1.5 + 0.035),
        isTarget: isTarget,
        isMissionFocus: isTarget
      };
    }
  }

  // Ensure target key has a label if not in V.bodies
  if (!V.bodyLabels[targetKey]) {
    const bData = PLANET_DATA[targetKey] || {};
    const name = formatBodyLabelText(targetKey, bData.name);
    const lbl = createBodyTextSprite(name, '#5ef6a0');
    group.add(lbl);
    V.bodyLabels[targetKey] = {
      sprite: lbl,
      key: targetKey,
      baseOffset: 0.065,
      isTarget: true,
      isMissionFocus: true
    };
  }

  if (V.scene) V.scene.add(group);
  V.labelsGroup = group;
}

function updateBodyLabels() {
  if (!V.bodyLabels || !V.camera) return;

  const camPos = V.camera.position;

  for (const item of Object.values(V.bodyLabels)) {
    const sp = item.sprite;
    if (!sp) continue;

    let worldPos = null;
    if (item.key === 'craft') {
      worldPos = V.craftWorldPos;
    } else if (item.key === 'sun') {
      worldPos = _zero;
    } else if (item.key === 'earth') {
      worldPos = V.earthWorldPos;
    } else if (item.isTarget) {
      worldPos = V.targetWorldPos;
    } else if (V.bodies && V.bodies[item.key]) {
      worldPos = V.bodies[item.key].position;
    }

    if (!worldPos || (worldPos.lengthSq() < 1e-6 && item.key !== 'sun')) {
      sp.visible = false;
      continue;
    }

    // Craft label: small, crisp badge locked directly above the craft model.
    if (item.key === 'craft') {
      if (V.camMode === 'cockpit') {
        sp.visible = false;
        continue;
      }

      const d = camPos.distanceTo(worldPos);
      if (!(d > 0) || !isFinite(d)) {
        sp.visible = false;
        continue;
      }

      // Keep screen size small, refined, and constant (~14px height on screen)
      const fovRad = ((V.camera && V.camera.fov) || 45) * Math.PI / 180;
      const frustumH = 2 * d * Math.tan(fovRad / 2);
      const viewH = Math.max(300, V.H || (V.canvas && V.canvas.clientHeight) || window.innerHeight || 720);
      const targetPx = 14;
      const labelH = frustumH * (targetPx / viewH);
      const labelW = labelH * (168 / 48);
      sp.scale.set(labelW, labelH, 1);

      // Camera up vector in world space: guarantees the label is ALWAYS directly above
      // the craft on the user's screen, regardless of camera orbit angle, pitch, or roll.
      const camUp = _v1.set(0, 1, 0).applyQuaternion(V.camera.quaternion).normalize();

      // Craft model visual radius in 3D (true NASA physical scale):
      const craftR = trueCraftSpan() * 0.55;

      // Position the label center so its bottom edge hovers cleanly just above the craft top:
      // In close-up craft view: craftR + half label height + subtle clearance.
      // In far view: craft is sub-pixel, so hover just above the craft center.
      const closeUp = (V.camMode === 'craft' || d < 0.02);
      const baseR = closeUp ? craftR : 0;
      const clearance = labelH * 0.35;
      const offsetDist = baseR + labelH * 0.5 + clearance;

      sp.position.copy(worldPos).addScaledVector(camUp, offsetDist);
      sp.material.opacity = 0.95;
      sp.visible = true;
      continue;
    }

    sp.visible = true;
    sp.position.set(worldPos.x, worldPos.y + item.baseOffset, worldPos.z);

    // Distance scaling for celestial bodies: keep constant readable screen size
    const d = camPos.distanceTo(sp.position);
    const fovRad = ((V.camera && V.camera.fov) || 45) * Math.PI / 180;
    const frustumH = 2 * d * Math.tan(fovRad / 2);
    const viewH = Math.max(300, V.H || (V.canvas && V.canvas.clientHeight) || window.innerHeight || 720);
    // Fixed readable height in screen pixels (~12px height) so distant planets don't balloon into giant text
    const targetPx = item.isMissionFocus ? 13 : 11;
    const labelH = frustumH * (targetPx / viewH);
    const aspect = sp.userData.baseScale.x / sp.userData.baseScale.y;
    const labelW = labelH * aspect;
    sp.scale.set(labelW, labelH, 1);

    // If camera is in 'craft' chase mode, keep planetary body text hidden or tiny
    // so planet names like EARTH / MOON never balloon or occlude the spacecraft
    if (V.camMode === 'craft') {
      sp.visible = false;
      continue;
    }

    // Keep labels visible and clean in TARGET, SYSTEM, and FREE modes
    const maxOp = item.isMissionFocus ? 0.85 : 0.55;
    sp.material.opacity = maxOp;
    sp.visible = true;
  }

  // De-conflict celestial labels when a moon orbits close to its parent planet
  // (e.g. Phobos right on Mars projection causing text overlap into "PMAROS").
  const MOON_PARENTS = {
    phobos: 'mars', deimos: 'mars', moon: 'earth',
    io: 'jupiter', europa: 'jupiter', ganymede: 'jupiter', callisto: 'jupiter'
  };
  const viewW = Math.max(300, V.W || (V.canvas && V.canvas.clientWidth) || window.innerWidth || 1280);
  const viewH = Math.max(300, V.H || (V.canvas && V.canvas.clientHeight) || window.innerHeight || 720);
  for (const [moonKey, parentKey] of Object.entries(MOON_PARENTS)) {
    const mItem = V.bodyLabels[moonKey];
    const pItem = V.bodyLabels[parentKey];
    if (!mItem || !mItem.sprite || !mItem.sprite.visible) continue;
    if (!pItem || !pItem.sprite || !pItem.sprite.visible) continue;
    _v1.copy(mItem.sprite.position).project(V.camera);
    _v2.copy(pItem.sprite.position).project(V.camera);
    if (_v1.z >= -1 && _v1.z <= 1 && _v2.z >= -1 && _v2.z <= 1) {
      const dxPx = (_v1.x - _v2.x) * 0.5 * viewW;
      const dyPx = (_v1.y - _v2.y) * 0.5 * viewH;
      if (Math.hypot(dxPx, dyPx) < 48) {
        if (mItem.isTarget) {
          pItem.sprite.visible = false;
        } else {
          mItem.sprite.visible = false;
        }
      }
    }
  }
}

/* ── Resize Viewport ── */
function handleResize() {
  const cv = V.canvas;
  if (!cv || !cv.isConnected || !V.renderer || !V.camera) return;
  const w = Math.max(1, cv.clientWidth || window.innerWidth);
  const h = Math.max(1, cv.clientHeight || window.innerHeight);
  if (w === V.W && h === V.H) return;
  V.W = w;
  V.H = h;
  V.mblurClear = true; // realloc clears the kept frame — never fade from garbage
  V.camera.aspect = w / h;
  V.camera.updateProjectionMatrix();
  V.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
  V.renderer.setSize(w, h, false);
}

/* ── Stop / Teardown ── */
function stop() {
  V.active = false;
  disposeSurface(V);
  // C1 no-strand: a mid-descent stop (scene exit, context loss, ?no3d toggle)
  // converges through fireDone — never a silent cancel — so onDone still runs
  // and descentActive still clears in finishLanding. No visual change.
  try { if (DZ.active && !DZ.done) fireDone(); else cancelDescent(true); } catch (e) {}
  if (V.raf) cancelAnimationFrame(V.raf);
  V.raf = 0;
  if (V.controls) {
    try { V.controls.dispose(); } catch (e) {}
    V.controls = null;
  }
  if (V.renderer) {
    try { V.renderer.dispose(); } catch (e) {}
    try { V.renderer.forceContextLoss(); } catch (e) {}
  }
  if (V.starMat) {
    try { V.starMat.dispose(); } catch (e) {}
    V.starMat = null;
  }
  if (V._skySphereMesh) {
    try {
      V._skySphereMesh.geometry.dispose();
      V._skySphereMesh.material.map && V._skySphereMesh.material.map.dispose();
      V._skySphereMesh.material.dispose();
      if (V.scene) V.scene.remove(V._skySphereMesh);
    } catch (e) {}
    V._skySphereMesh = null;
  }
  if (V.mblur) {
    try {
      V.mblur.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    } catch (e) {}
    V.mblur = null;
  }
  V._mblurWasSurf = false; V.mblurClear = true;
  if (V._skyboxCubeRT) {
    try { V._skyboxCubeRT.dispose(); } catch (e) {}
    V._skyboxCubeRT = null;
  }
  if (V.labelsGroup) {
    if (V.scene) {
      try { V.scene.remove(V.labelsGroup); } catch (e) {}
    }
    V.labelsGroup = null;
  }
  V.bodyLabels = {};
  V.earthIris = null;
  V.orbitShown = null;
  V.orbitEllipse = null;
  V.cockpitUp = null; V.prevRelPos = null;
  V.glide = null;
  V.craftDrag = false;
  V.craftHoldUntil = 0;
  if (V.cockpitLook) V.cockpitLook.drag = false;
  V.camInitialized = false;
  V.sceneKind = null;
  V.finalKey = null;

  V.renderer = V.scene = V.camera = V.canvas = null;
  try { if (V._gpuT) { try { V._gpuT.dispose(); } catch (e) {} } } catch (e2) {}
  V._gpuT = null;
  try { if (PERF) { try { delete window.__launchDbg; } catch (e) {} } } catch (e2) {}
  V._perfArr = null; V._perfEl = null; V._perfLast = 0;
  V.sys = V.sunMat = V.sunLight = V.ambient = V.bodies = null;
  V.craftGroup = null; V.craftToken = (V.craftToken | 0) + 1;
  if (V.fgCraftModel && V.fgScene) {
    try { V.fgScene.remove(V.fgCraftModel); } catch (e) {}
  }
  V.fgCraftModel = null;
  V.fgScene = null;
  V.fgCamera = null;
  V.fgSun = null;
  V.fgAmb = null;
  if (V.craftMarkerTex) { try { V.craftMarkerTex.dispose(); } catch (e) {} }
  if (V.craftMarker) { try { V.craftMarker.material.dispose(); } catch (e) {} }
  V.craftMarker = V.craftMarkerTex = null;
  V.craftLamp = null;
  V.scanGroup = V.scanCone = V.scanRing = null;
  V.trajGroup = V.plannedLine = V.historyLine = V.commsLine = V.targetOrbitLine = null;
  V.trajPoints = [];
  V.W = 0;
  V.H = 0;
  // C2: drop an unused preloaded lander (descent never ran) so the memory
  // baseline holds. Existing teardown above untouched.
  try {
    if (DZ3D.raw && !DZ3D.scene) {
      const tmp = new THREE.Group();
      while (DZ3D.raw.children.length) tmp.add(DZ3D.raw.children[0]);
      tmp.traverse(o => {
        try { if (o.geometry) o.geometry.dispose(); } catch (e) {}
        try {
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
            try { if (m.map) m.map.dispose(); } catch (e) {}
            try { m.dispose(); } catch (e) {}
          });
        } catch (e) {}
      });
    }
  } catch (e) {}
  DZ3D.raw = null; DZ3D.status = 'idle'; DZ3D.promise = null;
  // Phase B cleanup (new objects only — existing teardown above untouched):
  // finish the runner exactly-once (skip-spam/teardown converge), drop the chip,
  // dispose the preallocated trail, release hinges (meshes die with craftGroup).
  try {
    if (V.satTick) { try { V.satTick.skip(); } catch (e) {} }
  } catch (e) {}
  V.satTick = null; V._satDone = false;
  removeSatSkip();
  try { if (V.satChip && V.satChip.parentNode) V.satChip.parentNode.removeChild(V.satChip); } catch (e) {}
  V.satChip = null;
  try {
    if (V.cruiseTrail) {
      if (V.cruiseTrail.parent) V.cruiseTrail.parent.remove(V.cruiseTrail);
      if (V.cruiseTrail.geometry) V.cruiseTrail.geometry.dispose();
      if (V.cruiseTrail.material) V.cruiseTrail.material.dispose();
    }
  } catch (e) {}
  V.cruiseTrail = null; V.cruiseHead = 0; V.cruiseCount = 0;
  V.deployPivots = null; V.deployT = -1;
}

/* ── Start 3D Operations Scene ── */
function start(hostEl, config, kind) {
  stop();
  if (!hostEl) return false;
  V.sceneKind = kind || 'ops';

  const canvas = hostEl.tagName === 'CANVAS' ? hostEl : hostEl.querySelector('canvas') || document.createElement('canvas');
  if (canvas !== hostEl) hostEl.appendChild(canvas);
  V.canvas = canvas;
  V.contextLost = false;
  /* A dead context renders exactly this bug (HUD alive, viewport black).
     Flag it so sync() cold-starts instead of trusting a live-looking canvas. */
  try {
    canvas.addEventListener('webglcontextlost', (e) => {
      try { e.preventDefault(); } catch (_) {}
      V.contextLost = true;
      try { console.warn('[ops-view] WebGL context lost — scene will rebuild.'); } catch (_) {}
    }, false);
    canvas.addEventListener('webglcontextrestored', () => { V.contextLost = false; }, false);
  } catch (e) {}

  try {
    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
      /* preserveDrawingBuffer: the surface camera-shutter (frame accumulation
         motion blur) integrates the previous frame — without this the buffer
         is undefined after present on some drivers and trails break (rendering
         stays correct either way; every pixel is redrawn each frame). */
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true; // shared rig now casts (eclipses/ring-shade)
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;
    V.renderer = renderer;
    try { if (PERF) window.__launchDbg = { renderer }; } catch (e) {}
    try { if (PERF) { try { V._gpuT = makeGpuTimer(renderer); } catch (e) { V._gpuT = null; } } } catch (e2) {}

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020307);
    V.scene = scene;

    const camera = new THREE.PerspectiveCamera(40, (window.innerWidth || 1) / (window.innerHeight || 1), 1e-12, 1500);
    camera.position.set(0, 1.2, 2.4);
    V.camera = camera;

    setupCraftLayer();

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1e-13; // true-scale craft close-ups live at ~1e-11 to 1e-10 units
    controls.maxDistance = 60;
    // Cockpit free-look: pointer drags rotate the view (orientation only —
    // the ride, tracking and gaze anchor are untouched). Offsets PERSIST after
    // release so the player can watch the stars, the Sun, or aft while flying;
    // double-click recenters on the planet. Attached per canvas; the old
    // canvas is discarded on stop.
    if (!V.cockpitLook) V.cockpitLook = { yaw: 0, pitch: 0, drag: false, lx: 0, ly: 0 };
    const lk = V.cockpitLook;
    canvas.addEventListener('pointerdown', (e) => {
      if (V.camMode !== 'cockpit' || !V.active) return;
      lk.drag = true; lk.lx = e.clientX; lk.ly = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!lk.drag || V.camMode !== 'cockpit' || !V.active) return;
      lk.yaw = THREE.MathUtils.clamp(lk.yaw - (e.clientX - lk.lx) * 0.004, -Math.PI, Math.PI);
      lk.pitch = THREE.MathUtils.clamp(lk.pitch - (e.clientY - lk.ly) * 0.004, -1.2, 1.2);
      lk.lx = e.clientX; lk.ly = e.clientY;
    });
    const lkEnd = () => { lk.drag = false; };
    canvas.addEventListener('pointerup', lkEnd);
    canvas.addEventListener('pointercancel', lkEnd);
    canvas.addEventListener('dblclick', () => {
      if (V.camMode !== 'cockpit' || !V.active) return;
      lk.yaw = 0; lk.pitch = 0; lk.drag = false;
    });
    controls.addEventListener('start', () => {
      V.glide = null;
      V.userInteracted = true;
      V.craftDrag = true;
    });
    controls.addEventListener('end', () => {
      V.craftDrag = false;
      V.craftHoldUntil = performance.now() + 240;
    });
    V.controls = controls;

    // Background Stars & Skybox
    const stars = buildStars();
    if (stars && stars.points) {
      scene.add(stars.points);
      V.starMat = stars.mat;
      // Boost star brightness and scale with device pixel ratio
      if (stars.mat && stars.mat.uniforms) {
        stars.mat.uniforms.uBoost.value = 1.6;
        stars.mat.uniforms.pr.value = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      }
    }

    // Sky sphere: render the equirectangular star map on the inside of a giant sphere.
    // Preserves source resolution without cubemap conversion or downsampling.
    // BackSide flips normals so the texture is visible from inside the sphere.
    scene.background = new THREE.Color(0x010208);
    new THREE.TextureLoader().load('assets/textures/stars_8k.jpg', (hTex) => {
      if (!V.active || !V.scene) { hTex.dispose(); return; }
      hTex.colorSpace = THREE.SRGBColorSpace;
      hTex.minFilter = THREE.LinearFilter;
      hTex.magFilter = THREE.LinearFilter;
      hTex.anisotropy = V.renderer ? V.renderer.capabilities.getMaxAnisotropy() : 4;
      hTex.needsUpdate = true;

      const skyGeo  = new THREE.SphereGeometry(1100, 64, 40);
      const skyMat  = new THREE.MeshBasicMaterial({
        map: hTex,
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false
      });
      const skyMesh = new THREE.Mesh(skyGeo, skyMat);
      skyMesh.name  = 'hipparcosSkySphere';
      skyMesh.renderOrder = -1;
      V.scene.add(skyMesh);
      V._skySphereMesh = skyMesh;
    });

    // Build Complete Solar System
    const sys = buildSolarSystem(scene, () => V.active, { physical: isPhysicalMode() });
    V.sys = sys;
    V.bodies = sys.bodies;
    V.sunMat = sys.sunMat;
    V.sunLight = sys.sunLight;
    V.ambient = sys.ambient;
    /* Earth keeps its own iris in ops (see Earth iris parity note). */
    V.earthIris = collectEarthIris();

    // Hide massive rectangular orbit distance cards during operations
    if (sys.orbitTags && sys.orbitTags.length) {
      for (const tag of sys.orbitTags) {
        tag.visible = false;
      }
    }

    // Configure planetary orbit lines with toneMapped: false and clear visibility
    if (sys.orbitLines) {
      sys.orbitLines.traverse((ch) => {
        if (ch.isLine && ch.material) {
          ch.material.toneMapped = false;
          ch.material.transparent = true;
          ch.material.opacity = 0.55;
          if (ch.userData && ch.userData.baseColor) {
            ch.material.color.copy(ch.userData.baseColor);
          }
        }
      });
    }
    // Show only mission-relevant orbit rings (Earth + target) for immersion
    applyOrbitLineFilter(V.targetKey);

    // Shared NASA-derived sunlight (SUN_POINT_INTENSITY = 1361 × 1.35²):
    // ops meters exposure off the target like every other view (see animate),
    // so no artificial dimming is needed — planets receive true 1/r² irradiance.
    if (sys.sunLight) {
      sys.sunLight.intensity = SUN_POINT_INTENSITY;
    }

    // Ambient Starlight Floor — V.ambient is bound to THIS scene's shared rig
    // at build (line ~834; select-viewer pattern), so no second ambient is
    // ever added here: ops uses exactly the shared sun + ambient rig that
    // select/brief/title use.

    // Craft floodlight (presentation fill, documented): hero craft are dark
    // (OSIRIS-REx MLI ~0.06 albedo, MRO gold foil). Anti-sun framing
    // (see getIdealFraming) deliberately shows the night side to avoid glare,
    // so this lamp carries the key; per-frame iris coupling (see animate)
    // holds the craft constant while planets meter. Colour is NEUTRAL WHITE on purpose: a warm
    // lamp (0xfff2df) at intensity ~12 pushed the MRO's gold/copper foil into
    // an ACES highlight roll-off that read as "rusty brown" — the model's own
    // albedo should decide the hue, not the key light.
    // POINT light riding ON the craft with a tight distance cutoff (a few
    // craft sizes): directional/spot lamps from the camera are global/cone
    // effects that also blast the target disc and clip its day side to white.
    // Planets keep the shared sun + ambient rig only, like every other view.
    if (!V.craftLamp) {
      V.craftLamp = new THREE.PointLight(0xffffff, 10.0, 0, 0);
      scene.add(V.craftLamp);
    } else {
      V.craftLamp.color.setHex(0xffffff);
      V.craftLamp.intensity = 10.0;
      if (V.craftLamp.parent !== scene) scene.add(V.craftLamp);
    }

    // Player's kit assembly (async shared composer; label marks it meanwhile)
    V.craftToken = (V.craftToken | 0) + 1;
    V.craftGroup = null;
    mountOpsCraft();

    // C2 lander preload (L2 only, never ?no3d — async, fallback on failure).
    try { dzPreload(); } catch (e) {}

    const trajLines = buildTrajectoryLines();
    scene.add(trajLines);
    V.trajGroup = trajLines;

    const comms = buildCommsLine();
    scene.add(comms);
    V.commsLine = comms;

    // Arrival scanning beam (craft -> target sweep once arrived)
    const scan = buildScanBeam();
    scene.add(scan);

    // Craft findability dot (screen-space marker; the model stays true-scale)
    scene.add(buildCraftMarker());

    // Setup clean, minimal celestial body text labels
    setupBodyLabels();

    V.active = true;
    V.camMode = 'craft';
    V.userInteracted = false;
    V.camInitialized = false;
    V.glide = null;
    V.lastTime = performance.now();
    handleResize();

    animate(performance.now());
    return true;
  } catch (err) {
    console.error('[ops-view] Failed to initialize 3D operations view:', err);
    stop();
    return false;
  }
}

/* ── Earth iris parity ────────────────────────────────────────────────
   Ops meters the tone-mapping iris off the MISSION TARGET (exposureForBody
   in animate), which is correct for the craft/target/cockpit close-ups but
   leaves Earth on the wrong stop: measured on this build, the ops iris is
   6.9x Earth's on a Mars mission, 15.8x on Bennu and 21.7x on Europa, so
   Earth's sunlit face clips to flat white and the high-resolution Blue
   Marble + MODIS cloud detail is destroyed. Its city lights have the
   matching problem from the other side: select-viewer drives
   material.userData.nightBoost to 1/exposure every frame, ops never touches
   it, so the Black Marble emissive is 20-330x too dim to see.

   Both are one shared correction: give Earth its OWN iris, computed from the
   same exposureForBody law the other views use, and scale the three pieces of
   the Earth stack (surface, cloud shell, limb glow) together. Earth then
   renders on exactly the same tone in ops as it does in the mission-select
   viewer, whatever the mission target is. The handles are collected once at
   scene build (no per-frame traversal) and reset in stop(). */
function collectEarthIris(){
  const earth = V.bodies && V.bodies.earth;
  if(!earth) return null;
  const ir = { dayMeter: null, nightBoost: null, cloud: null, limb: null, limbBase: 0.7 };
  earth.traverse((o)=>{
    if(!o.isMesh || !o.material) return;
    const m = o.material;
    if(m.userData && m.userData.dayMeter && m.userData.nightBoost){
      ir.dayMeter = m.userData.dayMeter;   // sunlit surface trim (orrery shader)
      ir.nightBoost = m.userData.nightBoost; // city-light emissive trim
    } else if(m.isMeshStandardMaterial && m.map && m.transparent){
      ir.cloud = m;                        // MODIS cloud shell: sun-lit white
    } else if(m.isShaderMaterial && m.uniforms && m.uniforms.k){
      ir.limb = m.uniforms.k;              // fresnel limb glow gain
      ir.limbBase = m.uniforms.k.value;
    }
  });
  return (ir.dayMeter || ir.cloud || ir.limb) ? ir : null;
}

function updateEarthIris(){
  const ir = V.earthIris;
  if(!ir) return;
  /* Earth's own iris: the same law every other view uses, evaluated at Earth's
     true heliocentric distance. V.exposure is the view iris (mission target). */
  const eEarth = exposureForBody('earth', V.earthWorldPos.length());
  const m = THREE.MathUtils.clamp(eEarth / Math.max(1e-6, V.exposure), 0.02, 50);
  if(ir.dayMeter) ir.dayMeter.value = m;
  if(ir.cloud) ir.cloud.color.setScalar(m);
  if(ir.limb) ir.limb.value = ir.limbBase * m;
  /* City lights are emissive and never ride the sunlit trim, so they get the
     1/iris counter-boost the select viewer already applies (same 800 clamp). */
  if(ir.nightBoost) ir.nightBoost.value = Math.min(800, 1 / Math.max(1e-4, eEarth));
}

/* ── Animation & Render Loop ── */
function animate(now) {
  if (!V.active || !V.canvas || !V.canvas.isConnected) {
    stop();
    return;
  }
  V.raf = requestAnimationFrame(animate);
  handleResize();

  const dt = Math.min(0.1, (now - V.lastTime) / 1000 || 0);
  V.lastTime = now;

  // Continuous view clock: bridge whole-day sim steps and slow game frames
  // with wall-clock extrapolation. Lead capped 0.1 s to match the sim's own
  // 100 ms dt clamp (same thread — the view can never legitimately lead
  // truth by more, so hitch overshoot can never snap back). V.simDays is
  // view-owned (game logic reads O.day, never this), so every
  // sky/lighting/ephemeris reader below smooths automatically.
  // Pause-exact: rate is 0 unless the sim runs (see update()).
  try {
    if (isFinite(V.viewAnchor) && V.viewRate > 0) {
      const lead = Math.min(0.1, Math.max(0, (now - V.viewWall) / 1000));
      V.simDays = V.viewAnchor + lead * V.viewRate;
    } else if (isFinite(V.viewAnchor)) {
      V.simDays = V.viewAnchor;
    }
  } catch (e) { /* extrapolated clock never breaks the frame */ }
  /* One time base for the whole frame: re-seat craft/earth/comms on the
     extrapolated clock before bodies, camera, iris, and surf sky read it. */
  try { refreshDynamicFrame(now); } catch (e) {}
  // Phase B: sat beat runner + wing deploy (presentation only, zero-alloc).
  try {
    if (V.satTick) { try { if (V.satTick(dt)) V.satTick = null; } catch (e) {} }
    if (V.deployT >= 0 && V.deployPivots && V.deployPivots.length) {
      V.deployT += dt;
      const k = Math.max(0, Math.min(1, V.deployT / (V.deployDur || 7)));
      const s = k * k * (3 - 2 * k); // smoothstep over the deploy beat
      for (let pi = 0; pi < V.deployPivots.length; pi++) {
        const pv = V.deployPivots[pi];
        pv.p.rotation[pv.rotAxis || 'z'] = pv.stow * (1 - s);
      }
      if (k >= 1) V.deployT = -1;
    }
    // C2 descent driver (own clock, clamped dt; no-op off-path).
    if (DZ._3d) { try { dzDrive3D(dt); } catch (e) {} }
  } catch (e) {}
  /* ?time-debug sampling: per-frame maxima + teleport detection inside a
     ~250 ms window. Teleport rule: while running, every sky step must be
     forward and within 3× of rate×frame-time (uniform sweep); backward steps
     (snap-back) and oversize steps (leaps) are counted, never hidden. */
  if (TIME_DEBUG) {
    try {
      _tdbg.frames++;
      const tels = (V.teleports | 0);
      if (tels !== (_tdbg.lastTels | 0)) {
        /* Legit scene cut (run/mission switch, load): resync without counting. */
        _tdbg.lastDays = V.simDays; _tdbg.lastT = now; _tdbg.lastTels = tels;
      } else if (isFinite(V.simDays)) {
        if (isFinite(_tdbg.lastDays) && isFinite(_tdbg.lastT)) {
          const sd = V.simDays - _tdbg.lastDays;
          const ad = Math.abs(sd);
          if (ad > _tdbg.maxSkyD) _tdbg.maxSkyD = ad;
          const fdt = Math.max(1e-3, (now - _tdbg.lastT) / 1000);
          const rate = V.viewRate || 0;
          if (V.running !== false && rate > 0) {
            if (sd < -1e-9) { _tdbg.rev = (_tdbg.rev | 0) + 1; if (ad > (_tdbg.maxRev || 0)) _tdbg.maxRev = ad; }
            else if (sd > 3 * rate * fdt + 1e-6) { _tdbg.anom = (_tdbg.anom | 0) + 1; if (sd > (_tdbg.maxAnom || 0)) _tdbg.maxAnom = sd; }
          } else if (ad > 1e-9) { _tdbg.anom = (_tdbg.anom | 0) + 1; }
        }
        _tdbg.lastDays = V.simDays; _tdbg.lastT = now;
      }
      try {
        const F = (typeof S !== 'undefined') ? S.surface : null;
        if (F && isFinite(F.ce) && isFinite(F.cn) && F.dscale > 0) {
          const cx = F.ce * 1000 * F.dscale, cz = -F.cn * 1000 * F.dscale;
          if (isFinite(_tdbg.lastCX)) {
            const m = Math.hypot(cx - _tdbg.lastCX, cz - _tdbg.lastCZ);
            if (m > _tdbg.maxRvM) _tdbg.maxRvM = m;
          }
          _tdbg.lastCX = cx; _tdbg.lastCZ = cz;
        }
      } catch (e2) { /* rover sampling never breaks the frame */ }
      if (!_tdbg.el) {
        const el2 = document.createElement('div');
        el2.style.cssText = "position:fixed;left:8px;top:8px;z-index:9999;background:rgba(5,10,20,.92);border:1px solid #2a3a55;color:#cfe0ff;font:11px/1.6 monospace;padding:8px 10px;white-space:pre";
        document.body.appendChild(el2);
        _tdbg.el = el2;
        _tdbg.winT = now;
      }
      if (now - _tdbg.winT >= 250) {
        const winS = Math.max(1e-3, (now - _tdbg.winT) / 1000);
        const fps = _tdbg.frames / winS;
        const ticks = (V.tickCount | 0) - _tdbg.ticks;
        let pops = 0;
        try {
          const SF = (typeof S !== 'undefined') ? S.surface : null;
          const pc = SF ? (SF._sunPops | 0) : 0;
          pops = pc - (_tdbg.lastPops | 0);
          if ((_tdbg.havePops | 0) === 0) { pops = 0; _tdbg.havePops = 1; }
          _tdbg.lastPops = pc;
        } catch (e3) {}
        /* Celestial-timestamp invariant readout (Phase 2): the surface sky
           must render the current presentation timestamp — skyCur ≈ view,
           lag ≈ 0 at every warp, with no accumulating clock. skyPrev bounds
           the shutter's honest exposure interval [prev, cur]. Orbital (no
           surf samples) reads V.simDays directly, lag 0 by construction. */
        let _tdbgTick = "n/a", _tdbgView = "n/a";
        let _tdbgSkyCur = "n/a", _tdbgSkyPrev = "n/a", _tdbgSkyLag = "n/a";
        let _tdbgKeep = "n/a", _tdbgSweep = "n/a", _tdbgMot = "n/a", _tdbgSky = "n/a";
        try {
          if (isFinite(V.tickDay)) _tdbgTick = V.tickDay.toFixed(3);
          if (isFinite(V.simDays)) {
            _tdbgView = V.simDays.toFixed(3);
            _tdbgSkyCur = _tdbgView; _tdbgSkyPrev = _tdbgView; _tdbgSkyLag = "0.0000";
          }
          /* Phase-4.1 diagnostic-path correction: motion state lives on the
             diorama object V.surf.mot — S.surface is sim data and has no mot
             (the old reference reported mot/sweep as n/a forever). */
          const MM = (V.surf && V.surf.mot) ? V.surf.mot : null;
          const DD = (V.surf && V.surf._skydbg) ? V.surf._skydbg : null;
          if (MM && isFinite(MM.curDays)) {
            _tdbgSkyCur = MM.curDays.toFixed(3);
            _tdbgSkyLag = isFinite(V.simDays) ? (V.simDays - MM.curDays).toFixed(4) : "n/a";
          }
          if (MM && isFinite(MM.prevDays)) _tdbgSkyPrev = MM.prevDays.toFixed(3);
          if (MM && isFinite(MM.sweepTaps)) {
            _tdbgSweep = String(MM.sweepTaps | 0) + " " + (MM.sweepMode || "?")
              + (MM.sweepActive ? " on" : " off");
          }
          /* Phase-3 motion interval (presentation poses, diagnostic only):
             zero on first frame / pause / re-anchor by construction. */
          if (MM) {
            const f1 = (v, n) => isFinite(v) ? v.toFixed(n) : "n/a";
            _tdbgMot = "dD " + f1(MM.dDays, 4)
              + " · sky " + (MM.skyValid ? "Y" : "n") + " " + f1(MM.skyDeg, 2) + "°"
              + " · sun " + (MM.sunValid ? "Y" : "n") + " " + f1(MM.sunDeg, 2) + "°"
              + " · bodies " + (MM.bodyValid ? "Y" : "n")
              + " e" + f1(MM.earthM, 1) + " p" + f1(MM.planetM, 1);
          }
          /* Phase-4.1 per-frame sky-signal line (debug gate only in the
             producer): sim → input → lon/eph → matrix → quat write/change →
             mesh audit → mot/sweep mirror → gap counters. */
          if (DD) {
            const f2 = (v, n) => isFinite(v) ? v.toFixed(n) : "n/a";
            const bi = (b) => b ? 1 : 0;
            const SF = (V.surf) ? V.surf : null;
            const saz = (SF && isFinite(SF._dbgSunAz)) ? SF._dbgSunAz.toFixed(1) : "n/a";
            const sel = (SF && isFinite(SF._dbgSunEl)) ? SF._dbgSunEl.toFixed(2) : "n/a";
            const snf = (SF && isFinite(SF.nightF)) ? SF.nightF.toFixed(2) : "n/a";
            _tdbgSky = "sim=" + f2(DD.sim, 2) + " in=" + f2(DD.inp, 2)
              + " lon=" + f2(DD.lon, 2) + " dLon=" + f2(DD.dLon, 3)
              + " lonT=" + f2(DD.lonT, 2)
              + " ephD=" + f2(DD.ephD, 3) + "°"
              + " matΔ=" + bi(DD.matChg) + " qW=" + (DD.qWrite | 0)
              + " qΔ=" + bi(DD.qChg) + " qDot=" + f2(DD.qDot, 6)
              + " qFlip=" + bi(DD.qSignFlip)
              + " mainN=" + (DD.meshN | 0) + " mainΔ=" + bi(DD.mainChg)
              + " same=" + bi(DD.meshSame) + " vis=" + bi(DD.meshVis)
              + " motΔ=" + f2(DD.motD, 2) + "° sweepN=" + (DD.sweepN | 0)
              + " wGap=" + (DD.writeGap | 0) + " cGap=" + (DD.chgGap | 0)
              + " sunAz=" + saz + " sunEl=" + sel + " nf=" + snf;
          } else {
            _tdbgSky = "n/a (surf diag off)";
          }
          if (isFinite(V._mblurKeep)) _tdbgKeep = V._mblurKeep.toFixed(3);
        } catch (e3b) { /* instrument never breaks the frame */ }
        _tdbg.el.textContent =
          "TIME-DEBUG (per-frame maxima in window)\n" +
          "fps " + fps.toFixed(0) + " · game ticks/s " + (ticks / winS).toFixed(1) + "\n" +
          "sky " + (_tdbg.maxSkyD * 13.2).toFixed(2) + "°/frame (" + _tdbg.maxSkyD.toFixed(3) + " d)\n" +
          "sky jumps: back " + (_tdbg.rev | 0) + " (max " + ((_tdbg.maxRev || 0) * 13.2).toFixed(2) + "°) · fwd-leap " + (_tdbg.anom | 0) + " (max " + ((_tdbg.maxAnom || 0) * 13.2).toFixed(2) + "°)\n" +
          "sun band-crossings " + pops + "\n" +
          "rover " + _tdbg.maxRvM.toFixed(2) + " m/frame\n" +
          "viewRate " + (V.viewRate || 0).toFixed(1) + " d/s · teleports " + (V.teleports | 0) + "\n" +
          "tick " + _tdbgTick + " · view " + _tdbgView + "\n" +
          "skyCur " + _tdbgSkyCur + " · skyPrev " + _tdbgSkyPrev + " · lag " + _tdbgSkyLag + " d\n" +
          "mot " + _tdbgMot + "\n" +
          "sky: " + _tdbgSky + "\n" +
          "shutter keep " + _tdbgKeep + " · sweep " + _tdbgSweep + "\n" +
          "running " + (V.running !== false);
        _tdbg.frames = 0; _tdbg.ticks = (V.tickCount | 0);
        _tdbg.winT = now; _tdbg.maxSkyD = 0; _tdbg.maxRvM = 0;
        _tdbg.rev = 0; _tdbg.anom = 0; _tdbg.maxRev = 0; _tdbg.maxAnom = 0;
      }
    } catch (e) { /* instrument never breaks the frame */ }
  }

  // Keep sky sphere centred on camera so it never clips as camera roams the scene
  if (V._skySphereMesh && V.camera) {
    V._skySphereMesh.position.copy(V.camera.position);
  }

  // Animate Sun shader granulation (frozen while paused — sim exactness)
  if (V.sunMat && V.sunMat.uniforms && V.sunMat.uniforms.uTime) {
    if (V.running !== false) V.sunMat.uniforms.uTime.value = (V.sunMat.uniforms.uTime.value + dt * 0.4) % 3600;
  }

  // (engine detail rides with the shared assembly; no separate plume)
  // (strobe beacon retired — arrival scanning beam replaces the glow marker)

  // Animate Comms Line Dashes (data flow — frozen while paused)
  if (V.commsLine && V.commsLine.material && V.commsLine.material.dashOffset !== undefined) {
    if (V.running !== false) V.commsLine.material.dashOffset -= dt * 0.4;
  }

  // Rotate Planetary Bodies (physical-aware: moons ride true JPL states,
  // matching the meshes built by buildSolarSystem in either mode)
  if (V.bodies) {
    const phys = isPhysicalMode();
    for (const key of Object.keys(V.bodies)) {
      const m = V.bodies[key];
      if (!m) continue;
      if (phys) { const pw = bodyWorldPhysical(key, _p, V.simDays, [0, 0, 0], UNITS_PER_KM); if (pw) m.position.copy(pw); }
      else m.position.copy(bodyWorld(key, _p, V.simDays));
      const spin = (BODY_STYLE[key] || {}).spin || 0.1;
      // Wall-clock spin, but gated on sim running: pause freezes every body
      // exactly (positions are sim-day driven and already freeze).
      if (V.running !== false) m.rotation.y += dt * spin * 0.25;
    }
  }

  // Update Camera Tracking & Subject Follow
  updateCamera(dt);
  if (V.controls && V.camMode !== 'cockpit' && V.camMode !== 'mast') V.controls.update();

  // Update Clean Celestial Body Text Labels
  updateBodyLabels();

  // Metered iris (same law as select/brief/title): exposure meters off the
  // mission target's NASA irradiance × albedo, so every planet receives its
  // true 1/r² share of the shared 2480 rig. The craft lamp + ambient ride
  // 1/exposure counter-boosts (select-viewer pattern) so the dark craft and
  // night sides hold constant while sunlit rock meters.
  if (V.renderer) {
    let goal = 1.0;
    try { goal = exposureForBody(V.targetKey || 'mars', V.targetWorldPos.length()); } catch (e) {}
    V.exposure += (goal - V.exposure) * Math.min(1, dt * 2.5);
    V.renderer.toneMappingExposure = V.exposure;
    if (V.sunMat && V.sunMat.uniforms && V.sunMat.uniforms.uExposure) {
      V.sunMat.uniforms.uExposure.value = V.exposure;
    }
    try {
      const inv = 1 / Math.max(1e-4, V.exposure);
      if (V.craftLamp) V.craftLamp.intensity = THREE.MathUtils.clamp(10.0 * inv, 0.5, 5000);
      if (V.ambient) V.ambient.intensity = Math.min(75, 0.22 * inv);
    } catch (e) { /* compensation must never break the frame */ }
    /* Earth is metered off its OWN heliocentric distance instead of the mission
       target's, so its high-res day map, cloud shell, limb glow and city lights
       read exactly as they do in the other views (see Earth iris parity note). */
    updateEarthIris();
  }
  if (V.dz3dOn && DZ3D.scene && DZ3D.camera && V.renderer) {
    // C2 descent scene owns the frame (own metre-unit scene/camera).
    V._mblurWasSurf = false;
    const exp = (typeof exposureForBody === 'function') ? exposureForBody('moon', WORLD_PER_AU) : 0.00346;
    V.renderer.toneMappingExposure = exp;
    const _pf0 = PERF ? performance.now() : 0;
    if (PERF && V._gpuT) { try { V._gpuT.begin(); } catch (e) {} }
    V.renderer.render(DZ3D.scene, DZ3D.camera);
    if (PERF && V._gpuT) { try { V._gpuT.end(); } catch (e) {} }
    if (PERF) perfSample(performance.now() - _pf0);
  } else if (V.surfActive && V.surf && V.surf.scene) {
    try { if (V.craftGroup) V.craftGroup.visible = false; } catch (e) {}
    try {
      const auLen = (V.targetWorldPos && V.targetWorldPos.length() > 1e-9)
        ? V.targetWorldPos.length() : WORLD_PER_AU;
      /* Honest-timelapse iris (T2): the goal evaluates on the per-frame
         refreshed auLen (same extrapolated clock as sky/craft), the applied
         iris lerps exactly like the orbital V.exposure path — C1 instead of
         whole-tick pumping at warp, exact on average, pause-exact. */
      let surfGoal = exposureForBody('moon', auLen);
      // ?terrain-debug exposure lock (Pass A): hold the iris fixed.
      try { const lk = surfDebugExposure(); if (lk) surfGoal = lk; } catch (e) {}
      if (!isFinite(surfGoal)) surfGoal = V.surfExposure;
      if (!isFinite(V.surfExposure)) V.surfExposure = surfGoal;
      if (!isFinite(V.surfExposure)) V.surfExposure = V.renderer.toneMappingExposure;
      V.surfExposure += (surfGoal - V.surfExposure) * Math.min(1, dt * 2.5);
      V.renderer.toneMappingExposure = V.surfExposure;
      const inv = 1 / Math.max(1e-4, V.surfExposure);
      // Artifact fix (C): gate fill by nightF — vacuum day shadows stay black.
      // Day: fixed ~0.5% sun bounce; night: exposure-compensated ramp as before.
      try {
        const nf = Math.max(0, Math.min(1, (V.surf && V.surf.nightF) || 0)), nightAmb = Math.min(75, 0.22 * inv);
        const m = V.surf && V.surf.isMars;
        if (V.surf.amb) V.surf.amb.intensity = m ? (nightAmb * nf + 25.0 * (1 - nf)) : (nightAmb * nf + 0.005 * SOLAR_CONSTANT_W_M2 * (1 - nf));
        if (V.surf.hemi) V.surf.hemi.intensity = m ? 115.0 * (1 - nf) : 0;
      } catch (e) { if (V.surf.amb) V.surf.amb.intensity = Math.min(75, 0.22 * inv); }
      if (V.surf.marker) {
        const d = V.camera.position.distanceTo(V.surf.marker.position);
        const s = THREE.MathUtils.clamp(d * 0.03, 0.05, 1.2);
        V.surf.marker.scale.set(s, s, 1);
        V.surf.marker.material.opacity = 0.55 + 0.15 * Math.sin(now * 0.003);
      }
      updateSurfSky(V, dt);
      updateSurfRover(V, dt);
    } catch (e) { /* surf frame must never break the frame */ }
    if (V.renderer && V.camera) {
      const mb = (!NO_BLUR) ? ensureMblur() : null;
      if (mb) {
        /* Shutter path: clear on any cut (scene/mode/teleport/resize edge),
           otherwise fade the kept frame and draw the new exposure over it.
           Isolation-spin diagnostic (?sky-spin) bypasses accumulation: it
           exists to compare discrete orientations, and blending ~10 widely
           separated sky positions averages to a near-static image that reads
           as frozen. Zero effect on normal loads (flag false unless gated). */
        const spinIso = V.surfSpinIso === true;
        if (spinIso || V._mblurWasSurf !== true || V.mblurClear || (V.teleports | 0) !== (V._mblurTels | 0)) {
          V.renderer.clear();
          V.renderer.render(V.surf.scene, V.camera);
          V.mblurClear = false; V._mblurWasSurf = true; V._mblurTels = (V.teleports | 0);
        } else {
          const r = V.renderer, prevAuto = r.autoClear;
          r.autoClear = false;
          try {
            /* Warp-adaptive persistence (presentation gain only — the shutter
               integrates true per-frame positions; longer persistence at high
               warp lengthens transparent/additive/gain trails, while the
               opaque-sky streak comes from the star-trail samples). Stored
               on V for the ?time-debug readout. */
            const keep = mblurKeepForRate(V.viewRate);
            V._mblurKeep = keep;
            mb.mat.opacity = 1 - Math.pow(keep, Math.max(0.25, Math.min(4, dt * 60)));
            r.render(mb.scene, mb.cam);
            r.clearDepth();
            r.render(V.surf.scene, V.camera);
          } catch (e) { /* single-frame fallback below next frame */ }
          r.autoClear = prevAuto;
        }
      } else {
        V._mblurWasSurf = false;
        V.renderer.render(V.surf.scene, V.camera);
      }
    }
  } else if (V.renderer && V.scene && V.camera) {
    V._mblurWasSurf = false; // orbital frames never accumulate into the shutter
    const _pf0 = PERF ? performance.now() : 0;
    if (PERF && V._gpuT) { try { V._gpuT.begin(); } catch (e) {} }

    // Pass 1: Main astronomical AU scene (planets, stars, sun, trajectories)
    V.renderer.clear();
    V.renderer.render(V.scene, V.camera);

    // Pass 2: Split-depth foreground spacecraft layer (1 unit = 1 meter, solid PBR)
    if (V.fgScene && V.fgCamera && V.fgCraftModel && isCraftVisible()) {
      syncCraftLayer();
      V.renderer.clearDepth();
      V.renderer.render(V.fgScene, V.fgCamera);
    }

    if (PERF && V._gpuT) { try { V._gpuT.end(); } catch (e) {} }
    if (PERF) perfSample(performance.now() - _pf0);
  }
}

/* ── Dynamic Subject Tracking & Smooth Mode Transition ── */
function getTrackedSubjectPos() {
  if (V.camMode === 'cockpit') {
    return V.craftWorldPos; // eye rides the craft; view locked on target
  } else if (V.camMode === 'target') {
    return V.targetWorldPos;
  } else if (V.camMode === 'system') {
    return _zero;
  } else if (V.camMode === 'free') {
    return null;
  } else {
    // Default 'craft'
    return V.craftWorldPos;
  }
}

function craftTargetOffset(dist, out) {
  const craft = V.craftWorldPos, target = V.targetWorldPos;
  if (V.targetKey === 'moon' && target && craft) {
    _t2.subVectors(target, craft);
    if (_t2.lengthSq() > 1e-18) {
      _t2.normalize();
      _v1.crossVectors(_t2, _UP_Y);
      if (_v1.lengthSq() < 1e-6) _v1.set(1, 0, 0); else _v1.normalize();
      _v2.crossVectors(_v1, _t2).normalize();
      return out.copy(_t2).multiplyScalar(-dist * 0.96)
        .addScaledVector(_v2, dist * 0.12).addScaledVector(_v1, dist * 0.10);
    }
  }
  return null;
}

function getIdealFraming(mode) {
  const craft = V.craftWorldPos;
  const target = V.targetWorldPos;
  const closeSize = trueCraftSpan();

  if (mode === 'craft') {
    const dist = Math.max(closeSize * 5.5, 1e-13);
    const moonOff = craftTargetOffset(dist, new THREE.Vector3());
    if (moonOff) return { target: craft.clone(), offset: moonOff };
    // Sunward framing: keep the Sun behind the lens for heliocentric deep-space cruise.
    const away = _tmp.copy(craft);
    if (away.lengthSq() < 1e-6) away.set(0, 0, 1);
    away.normalize();
    const right = new THREE.Vector3().crossVectors(away, _UP_Y).normalize();
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    const upTilt = new THREE.Vector3().crossVectors(right, away).normalize();
    const offset = away.clone().multiplyScalar(-dist * 0.90)
      .addScaledVector(upTilt, dist * 0.38).addScaledVector(right, dist * 0.30);
    return { target: craft.clone(), offset: offset };
  } else if (mode === 'cockpit') {
    // First-person eye: radial perch above the craft (cockpitPerch —
    // zenith-relative, pole-safe), gaze locked on the planet, roll from the
    // orbit tangent (see cockpitTangentUp). Drag-to-look offsets handled in
    // start(). Sizing via cockpitScale() so the eye can never overshoot the
    // target during proximity ops (arranged orbits sit at only 2.2 radii — a
    // fixed size crossed the target and the cockpit ended up looking BACK at
    // the hull).
    const S = cockpitScale();
    return {
      target: craft.clone(),
      offset: cockpitPerch(new THREE.Vector3(), S).sub(craft)
    };
  } else if (mode === 'target') {
    // Close, relevant framing: ~8 target-radii out so the body fills ~1/3 of
    // the frame. The old 0.45–1.35-unit tactical distance shrank small bodies
    // to dots (Earth filled ~3%). Physical mode keeps its own rule.
    const dist = isPhysicalMode() ? frameDist(V.targetKey) : Math.max((radiusOf(V.targetKey) || 0.02) * 8, 0.06);
    return {
      target: target.clone(),
      offset: new THREE.Vector3(dist * 0.70, dist * 0.45, dist * 0.85)
    };
  } else if (mode === 'system') {
    return {
      target: _zero.clone(),
      offset: new THREE.Vector3(0, 8.5, 7.5)
    };
  }
  return null;
}

/* Surface cameras live in js/surface-view.js (updateSurfaceCamera) — see scenes/07-ops-surface.md. */


function startCameraGlide(mode) {
  const ideal = getIdealFraming(mode);
  if (!ideal) return;

  V.glide = null; // hard cut: cancel any in-flight glide

  if (mode === 'cockpit' && V.cockpitUp) {
    try { V.camera.up.copy(V.cockpitUp); } catch (e) {}
  } else if (V.camera && mode !== 'cockpit') {
    try { V.camera.up.set(0, 1, 0); } catch (e) {}
  }

  // Instant snap to target and framing offset
  if (V.controls) V.controls.target.copy(ideal.target);
  if (V.camera) V.camera.position.copy(ideal.target).add(ideal.offset);
  V.lastTrackedPos.copy(ideal.target);
}

function updateCamera(dt) {
  if (!V.camera || !V.controls) return;
  if (V.dz3dOn) return; // 3D descent sequence owns the viewport & camera

  /* Surface diorama owns the camera (Phase 5): mast-cam and walkaround orbit
     run here; orbital tracking below is skipped wholesale. Rover is static in
     Phase 5, so the mast needs no transport machinery — terrain-normal up,
     heading gaze, persistent free-look. Roll-stable by construction. */
  if (V.surfActive && V.surf) {
    updateSurfaceCamera(V);
    return;
  }

  const subjectPos = getTrackedSubjectPos();

  // If camera hasn't been initialized yet, wait until subject position is ready
  if (!V.camInitialized) {
    if (subjectPos && (subjectPos.lengthSq() > 1e-4 || V.camMode === 'system')) {
      const ideal = getIdealFraming(V.camMode || 'craft');
      if (ideal) {
        V.controls.target.copy(ideal.target);
        V.camera.position.copy(ideal.target).add(ideal.offset);
        V.lastTrackedPos.copy(ideal.target);
        V.camInitialized = true;
      }
    }
    return;
  }

  // Smooth mode transition glide
  if (V.glide) {
    const elapsed = performance.now() - V.glide.startTime;
    const progress = Math.min(1.0, elapsed / V.glide.duration);
    const t = 1 - Math.pow(1 - progress, 3); // cubic ease-out

    const currentSubjectPos = getTrackedSubjectPos() || _zero;
    V.controls.target.lerpVectors(V.glide.startTarget, currentSubjectPos, t);
    const currentOffset = _tmp.lerpVectors(V.glide.startOffset, V.glide.idealOffset, t);
    V.camera.position.copy(V.controls.target).add(currentOffset);

    V.lastTrackedPos.copy(currentSubjectPos);

    if (progress >= 1.0) {
      V.glide = null;
    }
    return;
  }

  // Free mode has no subject displacement tracking
  if (V.camMode === 'free' || !subjectPos) {
    return;
  }

  // Tracking: craft mode hard-locks the target to the craft every frame so the
  // model stays centred (pan offsets do not accumulate); other modes preserve
  // the user's orbital angle/zoom/pan via delta-follow. Free mode is untouched.
  if (V.camMode === 'cockpit' && subjectPos) {
    // First-person ride: radial perch above the craft, gaze locked on the
    // planet, roll from the orbit tangent (cockpitTangentUp — perpendicular
    // to the sight line, so no lookAt cross-product degeneracy at the poles).
    // Same sizing rule as getIdealFraming('cockpit') so the entry glide lands
    // exactly here. OrbitControls stays disabled in this mode (see
    // setCameraMode) and animate() skips controls.update(), so nothing fights
    // the lock. Free-look: pointer drags add persistent yaw/pitch offsets
    // (orientation only — position, tracking and the planet anchor are
    // untouched), so the player can look anywhere while the ride continues.
    // Double-click recenters on the planet (see listeners in start()).
    const S = cockpitScale();
    cockpitPerch(_t2, S);
    V.camera.position.copy(_t2);
    cockpitTangentUp(_v1);
    V.camera.up.copy(_v1);
    V.controls.target.copy(V.targetWorldPos);
    V.camera.lookAt(V.targetWorldPos);
    const lk = V.cockpitLook;
    if (lk) {
      if (lk.yaw) V.camera.rotateY(lk.yaw);
      if (lk.pitch) V.camera.rotateX(lk.pitch);
    }
  } else if (V.camMode === 'craft' && subjectPos) {
    const delta = _tmp.subVectors(subjectPos, V.controls.target);
    if (delta.lengthSq() < 2500) {
      V.controls.target.copy(subjectPos);
      V.camera.position.add(delta);
    } else {
      V.controls.target.copy(subjectPos);
    }
    if (V.targetKey === 'moon' && !V.craftDrag && performance.now() >= (V.craftHoldUntil || 0)) {
      const curOff = _t.subVectors(V.camera.position, V.controls.target);
      const curDist = curOff.length();
      if (curDist > 1e-15 && craftTargetOffset(curDist, _tmp)) {
        if (curOff.dot(_tmp) < -0.99 * curDist * curDist) curOff.addScaledVector(_v1, curDist * 0.05);
        const a = Math.min(1, 1 - Math.exp(-Math.max(0.001, dt) * 4.5));
        curOff.lerp(_tmp, a).normalize().multiplyScalar(curDist);
        V.camera.position.copy(V.controls.target).add(curOff);
      }
    }
  } else {
    const delta = _tmp.subVectors(subjectPos, V.lastTrackedPos);
    if (delta.lengthSq() < 2500) {
      V.controls.target.add(delta);
      V.camera.position.add(delta);
    }
  }
  V.lastTrackedPos.copy(subjectPos);

  // Dynamic clip planes for true-scale AU scene:
  // The spacecraft model is rendered in V.fgScene (meter pass, split-depth).
  // The main AU scene holds astronomical bodies, trajectories, and background stars.
  // Floor near plane at 1e-6 scene units (~110 m) to protect 24-bit depth precision
  // and prevent depth quantization / Z-fighting on planetary surfaces and cloud decks.
  try {
    const dTgt = V.camera.position.distanceTo(V.controls.target);
    const dTargetBody = (V.earthWorldPos) ? V.camera.position.distanceTo(V.earthWorldPos) : Infinity;
    const dDist = Math.min((isFinite(dTgt) && dTgt > 0) ? dTgt : Infinity, dTargetBody);
    if (isFinite(dDist)) {
      const wantNear = Math.min(0.001, Math.max(dDist * 0.01, 1e-6));
      if (Math.abs(V.camera.near - wantNear) / wantNear > 0.1) {
        V.camera.near = wantNear;
        V.camera.updateProjectionMatrix();
      }
    }
  } catch (e) {}
}

function targetBodyRadius(key) {
  const k = key || V.targetKey || 'mars';
  if (isPhysicalMode()) {
    return radiusKmTrue(k) * UNITS_PER_KM;
  }
  return radiusOf(k) || 0.0039;
}

/* Cockpit up-vector: parallel-transported orbit tangent, computed in
   PLANET-RELATIVE space. Two contamination sources killed:
   (a) Heliocentric velocity: differencing world craftWorldPos mixes in the
   planet's own Sun-orbit motion, which dominates at high warp (orbit display
   is slew-capped, the planet is not) and spins up around the sight line.
   Differencing R = craft − planet removes it exactly.
   (b) Transfer torsion: on near-radial approach legs the velocity's
   perpendicular component → 0, so a pure velocity lock windmills 180° around
   closest approach. Rule: when the perpendicular fraction of planet-relative
   motion is strong (>15%), lock screen-up to the direction of travel
   (heading lock — horizon scrolls linearly on the ring); when it collapses
   (radial transfer, pause), parallel-transport the previous up into the new
   tangent plane instead — discrete Levi-Civita transport, identically zero
   roll around the sight line. Pre-first-motion fallback: world-Y ⊥ R. */
function cockpitTangentUp(out) {
  _tmp.subVectors(V.craftWorldPos, V.targetWorldPos); // full planet-relative R
  const rLen = _tmp.length();
  if (rLen > 1e-12) _t.copy(_tmp).divideScalar(rLen); // R̂
  else _t.set(0, 1, 0);
  if (!V.prevRelPos) V.prevRelPos = _tmp.clone();
  _v1.subVectors(_tmp, V.prevRelPos); // planet-relative motion only
  V.prevRelPos.copy(_tmp);
  const relLenSq = _v1.lengthSq();
  if (relLenSq > 1e-24) {
    _v1.addScaledVector(_t, -_v1.dot(_t));
    // Strong transverse signal → heading lock; radial/weak → transport.
    if (_v1.lengthSq() > 0.0225 * relLenSq) {
      _v1.normalize();
      if (!V.cockpitUp) V.cockpitUp = _v1.clone();
      else V.cockpitUp.copy(_v1);
    } else if (V.cockpitUp) {
      V.cockpitUp.addScaledVector(_t, -V.cockpitUp.dot(_t));
      if (V.cockpitUp.lengthSq() > 1e-12) V.cockpitUp.normalize();
      else V.cockpitUp = null;
    }
  } else if (V.cockpitUp) {
    V.cockpitUp.addScaledVector(_t, -V.cockpitUp.dot(_t));
    if (V.cockpitUp.lengthSq() > 1e-12) V.cockpitUp.normalize();
    else V.cockpitUp = null;
  }
  if (V.cockpitUp) return out.copy(V.cockpitUp);
  // No motion history yet: world-Y projected ⊥ radial (never collinear).
  out.set(0, 1, 0).addScaledVector(_t, -_t.y);
  if (out.lengthSq() < 1e-12) out.set(1, 0, 0).addScaledVector(_t, -_t.x);
  if (out.lengthSq() < 1e-12) out.set(0, 0, 1);
  return out.normalize();
}

/* Cockpit perch: radially above the craft (zenith-relative), NOT world +Y.
// A world-Y eye offset secretly reinstates a fixed (0,1,0) up through the
// lookAt cross product (R×Δ with Δ=+Y → 0 at the poles → 180° whip). The
// radial perch keeps the geometry pole-safe; S from cockpitScale() so the eye
// never crosses into the target at 2.2-radii proximity. */
function cockpitPerch(out, S) {
  _t2.subVectors(V.craftWorldPos, V.targetWorldPos);
  if (_t2.lengthSq() < 1e-12) _t2.set(0, 1, 0);
  _t2.normalize();
  return out.copy(V.craftWorldPos).addScaledVector(_t2, S * 0.6);
}

/* True-scale NASA spacecraft dimensions:
   Flown hero models use verified NASA mission hardware specifications.
   Custom player kit assemblies default to NuSTAR-class 10 m deployed span.
   Zero exaggeration: ratios between spacecraft and celestial bodies are 100%
   physically accurate to NASA JPL planetary and mission data. */
const HERO_SPAN_M = {
  l1: 16.7,      // Aqua: 16.7 m deployed solar array span (NASA EOS Flagship)
  l2: 4.3,       // LRO: 4.3 m solar array span
  l3: 13.6,      // MRO: 13.6 m solar array span
  l4: 6.2,       // OSIRIS-REx: 6.2 m deployed span
  l5: 13.0,      // Voyager: 13.0 m magnetometer boom span
  sbx: 13.6,
  sbx_moon: 4.3,
  sbx_earth: 16.7
};
const CRAFT_REF_SPAN_M = 10;

function activeCraftSpanM() {
  try {
    const sel = readSel();
    const lvl = sel && sel.level;
    if (lvl && HERO_SPAN_M[lvl]) return HERO_SPAN_M[lvl];
  } catch (e) {}
  return CRAFT_REF_SPAN_M;
}

function trueCraftSpan() {
  return (activeCraftSpanM() / 1000) * UNITS_PER_KM;
}

function trueCraftScale(modelUnits) {
  const worldSpan = trueCraftSpan();
  return worldSpan / Math.max(modelUnits, 1e-15);
}

function showroomSize() {
  return trueCraftSpan();
}

function cockpitScale() {
  return trueCraftSpan();
}

/* Display orbit angle with anti-strobe slew limiting (presentation only —
   state.day stays the sim truth). The arrived/LEO orbit phase is sim-day
   driven, so at high warp the craft would advance several rad per real second
   and strobe day↔night instead of flying. The display angle chases the SIGNED
   sim-day delta at most 1.5 rad/s (~4 s/rev — fast but trackable, NASA Eyes
   convention), snapping only on teleports: mission/target switches, rate
   changes, or multi-day sim jumps (restarts, scrubs). Deliberately NO modulo
   wrapping: shortest-path unwrapping flips direction whenever the true phase
   advances more than π between evaluations (routine at 10 d/s+), which reads
   as zig-zag. Cumulative signed chase can never reverse. At low warp the
   chase never saturates, so the display is exactly sim-true. */
function orbitAngle(rate, simDay) {
  const day = (simDay || 0);
  const now = performance.now();
  const dayJump = !isFinite(V.orbitDay) || Math.abs(day - V.orbitDay) > 2;
  if (V.orbitShown === null || V.orbitShown === undefined || !isFinite(V.orbitShown)
      || V.orbitRate !== rate || dayJump) {
    V.orbitShown = day * rate; V.orbitWall = now;
    V.orbitDay = day; V.orbitRate = rate;
    return V.orbitShown;
  }
  // Signed forward/backward travel since the last evaluation — never wrapped,
  // so direction is always correct regardless of warp or evaluation cadence.
  const dTrue = (day - V.orbitDay) * rate;
  const dtS = Math.min(1, Math.max(0, (now - (V.orbitWall || now)) / 1000));
  V.orbitWall = now;
  V.orbitDay = day;
  if (!isFinite(dTrue)) {
    V.orbitShown = day * rate;
    return V.orbitShown;
  }
  V.orbitShown += THREE.MathUtils.clamp(dTrue, -(1.5 * dtS + 1e-6), 1.5 * dtS + 1e-6);
  return V.orbitShown;
}

/* Per-frame dynamics refresh (presentation only — update() stays the tick
   authority for sim truth, trajectory geometry, labels, and iris snap).
   update() positions earth/target/craft once per game tick from stepped
   smoothDay; animate() re-runs this on the EXTRAPOLATED V.simDays before
   every render, so planets (bodies loop), craft, comms, camera, iris, and
   the surface sky all share one time base instead of disagreeing by up to
   a frame. Cheap Chebyshev + lerps only; trajectory rebuild stays per-tick.
   Allocation-free (scratch vectors); never breaks the frame. */
/* Shared translunar transfer curve (Earth→Moon) scaled strictly by live Earth–Moon separation. */
function translunarPoint(out, frac, phys) {
  const dir = _t2.subVectors(V.targetWorldPos, V.earthWorldPos);
  const dist = dir.length();
  const normDir = (dist > 1e-6) ? _v1.copy(dir).multiplyScalar(1 / dist) : _v1.set(0, 0, 1);
  const rE = (phys ? radiusKmTrue('earth') * UNITS_PER_KM : radiusOf('earth') || 0.0144) * 1.55;
  const rM = (phys ? radiusKmTrue('moon') * UNITS_PER_KM : radiusOf('moon') || 0.0039) * 2.2;
  const p0 = _v2.copy(V.earthWorldPos).addScaledVector(normDir, rE);
  const p1 = _t.copy(V.targetWorldPos).addScaledVector(normDir, -rM);
  out.lerpVectors(p0, p1, frac);
  const s = Math.sin(frac * Math.PI);
  out.y += s * (dist * 0.03);
  const side = s * (dist * 0.07);
  out.x += -normDir.z * side;
  out.z += normDir.x * side;
  return out;
}

function refreshDynamicFrame(nowMs) {
  const D = V._dyn;
  if (!V.active || !D || !isFinite(V.simDays)) return;
  try {
    const phys = isPhysicalMode();
    if (phys) { const pw = bodyWorldPhysical('earth', V.earthWorldPos, V.simDays, [0, 0, 0], UNITS_PER_KM); if (!pw) V.earthWorldPos.set(0, 0, 0); }
    else bodyWorld('earth', V.earthWorldPos, V.simDays);
    if (D.targetKey) {
      if (phys) { const pw = bodyWorldPhysical(D.targetKey, V.targetWorldPos, V.simDays, [0, 0, 0], UNITS_PER_KM); if (!pw) bodyWorld(D.targetKey, V.targetWorldPos, V.simDays); }
      else bodyWorld(D.targetKey, V.targetWorldPos, V.simDays);
    }
    if (D.mode === 'leo' || D.targetKey === 'earth') {
      const earthR = phys ? radiusKmTrue('earth') * UNITS_PER_KM : radiusOf('earth');
      const angle = orbitAngle(0.12, V.simDays);
      V.craftWorldPos.set(
        V.earthWorldPos.x + Math.sin(angle) * (earthR * 1.55),
        V.earthWorldPos.y + Math.cos(angle) * (earthR * 1.55) * 0.98,
        V.earthWorldPos.z + Math.cos(angle) * (earthR * 0.4)
      );
    } else if (D.mode === 'fixedC3' || D.targetKey === 'moon') {
      if (D.arrived) {
        const orbR = (phys ? radiusKmTrue('moon') * UNITS_PER_KM : (radiusOf('moon') || 0.0039)) * 2.2;
        const orbSpeed = orbitAngle(0.45, V.simDays);
        V.craftWorldPos.set(
          V.targetWorldPos.x + Math.cos(orbSpeed) * orbR,
          V.targetWorldPos.y + Math.sin(orbSpeed) * (orbR * 0.35),
          V.targetWorldPos.z + Math.sin(orbSpeed) * orbR
        );
      } else {
        translunarPoint(V.craftWorldPos, D.frac || 0, phys);
      }
    } else {
      if (D.arrived) {
        const orbR = targetBodyRadius() * 2.2;
        const orbSpeed = orbitAngle(0.35, V.simDays);
        V.craftWorldPos.set(
          V.targetWorldPos.x + Math.cos(orbSpeed) * orbR,
          V.targetWorldPos.y + Math.sin(orbSpeed) * (orbR * 0.35),
          V.targetWorldPos.z + Math.sin(orbSpeed) * orbR
        );
      } else if (D.craftKm) {
        const u = UNITS_PER_KM;
        V.craftWorldPos.set(D.craftKm[0] * u,
          THREE.MathUtils.lerp(V.earthWorldPos.y, V.targetWorldPos.y, D.frac || 0),
          D.craftKm[1] * u);
      }
      /* No craftKm this tick (same as update()): hold last position. */
    }
    if (V.craftGroup) {
      V.craftGroup.position.copy(V.craftWorldPos);
      if (V.craftLamp) V.craftLamp.position.copy(V.craftWorldPos);
      if (D.arrived && V.targetWorldPos.lengthSq() > 1e-12) V.craftGroup.lookAt(V.targetWorldPos);
      else {
        _tmp.subVectors(V.targetWorldPos, V.craftWorldPos);
        if (_tmp.lengthSq() > 1e-12) { _t2.copy(V.craftWorldPos).add(_tmp.normalize()); V.craftGroup.lookAt(_t2); }
      }
    }
    if (V.commsLine) {
      const pos = V.commsLine.geometry.attributes.position.array;
      pos[0] = V.earthWorldPos.x; pos[1] = V.earthWorldPos.y; pos[2] = V.earthWorldPos.z;
      pos[3] = V.craftWorldPos.x; pos[4] = V.craftWorldPos.y; pos[5] = V.craftWorldPos.z;
      V.commsLine.geometry.attributes.position.needsUpdate = true;
      V.commsLine.computeLineDistances();
      try {
        const linkLen = Math.hypot(pos[3] - pos[0], pos[4] - pos[1], pos[5] - pos[2]);
        const pitch = THREE.MathUtils.clamp(linkLen * 0.03, 1e-5, 0.025);
        V.commsLine.material.dashSize = pitch;
        V.commsLine.material.gapSize = pitch;
      } catch (e) {}
      if (D.linkF !== undefined) {
        const f = THREE.MathUtils.clamp(D.linkF, 0, 1);
        V.commsLine.visible = f > 0 && V.camMode !== 'cockpit' && V.camMode !== 'craft';
        V.commsLine.material.opacity = 0.06 + 0.69 * f;
      } else {
        V.commsLine.visible = (V.camMode !== 'cockpit' && V.camMode !== 'craft');
      }
    }
    // Synchronize orbit ring positions on extrapolated per-frame planet center to eliminate orbit line wiggling
    if (V.targetOrbitLine && V.targetOrbitLine.visible && V.orbitEllipse) {
      const c = (V.orbitEllipse.key === 'earth') ? V.earthWorldPos : V.targetWorldPos;
      const el = V.orbitEllipse;
      const attr = V.targetOrbitLine.geometry.getAttribute('position');
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * Math.PI * 2;
        attr.setXYZ(i,
          c.x + (el.fx ? Math.cos(a) : Math.sin(a)) * el.rx,
          c.y + (el.fy ? Math.cos(a) : Math.sin(a)) * el.ry,
          c.z + (el.fz ? Math.cos(a) : Math.sin(a)) * el.rz);
      }
      attr.needsUpdate = true;
    }
    try { updateCraftMarker(nowMs); } catch (e) {}
  } catch (e) { /* refresh never breaks the frame */ }
}

/* ── Live State Synchronizer (Called from game loop) ── */
function update(state) {
  if (!V.active || !state) return;

  // Pause gate: wall-clock-driven visuals (spin, sun granulation, comms flow)
  // freeze exactly when the sim does. Marker pulse stays live (UI, not sim).
  V.running = state.running !== false;

  V.simDays = (state.tNow !== undefined ? (state.tNow - 2000) * 365.25 : state.day || 0);
  try { V.tickDay = state.day; } catch (e) { /* tick truth tag never breaks update */ }
  /* Continuous VIEW clock (presentation only — O.day stays the sim truth).
     game.js advances integer days per stepDay and feeds fractional smoothDay,
     but the 3D loop runs on its own rAF: on slow frames several sim-days can
     land in one update (or one V.simDays value spans several 3D frames), so
     sun/stars/lighting visibly hold-then-jump in whole-day steps. Anchor each
     update's sim-days to wall time and extrapolate per rendered frame.
     Rate comes EXACT from the sim (state.rate = O.speed×2.5, 0 while
     paused) — never wall-clock-estimated, so warp changes apply on the next
     tick with no EMA convergence lag and irregular frame times can't skew
     it. Teleport = a gap no warp can produce in one tick: the stepDay guard
     caps a single tick at 400 sols, so beyond ±500 d is a run/mission
     switch, a save load, or a context rebuild — re-anchor it. Ordinary steps
     (any supported warp, any frame rate) always track.
     Paused/ended → rate 0: the sky freezes exactly with the sim. */
  try {
    const nowMs = performance.now();
    const gap = V.simDays - V.viewAnchor;
    const jump = !isFinite(V.viewAnchor) || !isFinite(gap) || Math.abs(gap) > 500;
    if (jump || V.running === false) {
      V.viewAnchor = V.simDays; V.viewWall = nowMs;
      V.viewRate = 0;
      if (jump) V.teleports = (V.teleports | 0) + 1;
    } else {
      V.viewAnchor = V.simDays; V.viewWall = nowMs;
      V.viewRate = (isFinite(state.rate) && state.rate >= 0)
        ? Math.min(400, state.rate) : 0;
    }
    V.tickCount = (V.tickCount | 0) + 1;
    V.lastGap = gap;
  } catch (e) { /* anchor failure → frame extrapolation simply re-anchors */ }
  /* Cache tick dynamics for the per-frame refresh (presentation only).
     refreshDynamicFrame() re-evaluates these on extrapolated V.simDays. */
  try {
    V._dyn = {
      mode: state.mode, targetKey: state.targetKey || V.targetKey,
      frac: isFinite(state.frac) ? state.frac : (isFinite(V.frac) ? V.frac : 0),
      arrived: !!state.arrived,
      craftKm: (state.craftKm && isFinite(state.craftKm[0]) && isFinite(state.craftKm[1]))
        ? [state.craftKm[0], state.craftKm[1]] : null,
      linkF: state.linkF,
    };
  } catch (e) { /* stale dynamics stand */ }
  if (state.targetKey && state.targetKey !== V.targetKey) {
    V.targetKey = state.targetKey;
    V.targetChanged = true;
    setupBodyLabels();
    applyOrbitLineFilter(V.targetKey);
  }
  V.arrived = !!state.arrived;
  V.frac = THREE.MathUtils.clamp(state.frac || 0, 0, 1);

  // 1. Update Earth World Position
  if (isPhysicalMode()) { const pw = bodyWorldPhysical('earth', V.earthWorldPos, V.simDays, [0, 0, 0], UNITS_PER_KM); if (!pw) V.earthWorldPos.set(0, 0, 0); }
  else bodyWorld('earth', V.earthWorldPos, V.simDays);

  // 2. Update Target Body World Position
  if (V.targetKey) {
    if (isPhysicalMode()) { const pw = bodyWorldPhysical(V.targetKey, V.targetWorldPos, V.simDays, [0, 0, 0], UNITS_PER_KM); if (!pw) bodyWorld(V.targetKey, V.targetWorldPos, V.simDays); }
    else bodyWorld(V.targetKey, V.targetWorldPos, V.simDays);
  }
  /* Iris snap on target change (select-viewer pattern): smoothing from a
     far-off value leaves the new target nuclear or black for seconds.
     Runs on the FRESH position above, then clears the flag. */
  if (V.targetChanged) {
    V.targetChanged = false;
    V.orbitShown = null; // orbit centre teleported — re-seed display angle
    V.orbitEllipse = null;
    V.cockpitUp = null; V.prevRelPos = null; // planet frame changed — re-seed up
    try { V.exposure = exposureForBody(V.targetKey || 'mars', V.targetWorldPos.length()); } catch (e) {}
  }

  // 3. Compute 3D Spacecraft Position (all arrived/LEO branches are closed
  // single-frequency tilted ellipses — mixed-frequency Lissajous terms never
  // rejoin and read as drunken weaving. Each branch records its ellipse in
  // V.orbitEllipse so the arrival ring line draws the same shape.)
  if (state.mode === 'leo' || state.targetKey === 'earth') {
    // Earth orbital mission (LEO Sun-synchronous)
    const earthR = isPhysicalMode() ? radiusKmTrue('earth') * UNITS_PER_KM : radiusOf('earth');
    const angle = orbitAngle(0.12, V.simDays);
    V.craftWorldPos.set(
      V.earthWorldPos.x + Math.sin(angle) * (earthR * 1.55),
      V.earthWorldPos.y + Math.cos(angle) * (earthR * 1.55) * 0.98,
      V.earthWorldPos.z + Math.cos(angle) * (earthR * 0.4)
    );
    V.orbitEllipse = { key: 'earth', fx: 0, fy: 1, fz: 1, rx: earthR * 1.55, ry: earthR * 1.55 * 0.98, rz: earthR * 0.4 };
  } else if (state.mode === 'fixedC3' || state.targetKey === 'moon') {
    // Translunar trajectory
    const frac = V.frac;
    if (V.arrived) {
      // Craft is in lunar orbit around the Moon
      const orbR = (isPhysicalMode() ? radiusKmTrue('moon') * UNITS_PER_KM : (radiusOf('moon') || 0.0039)) * 2.2;
      const orbSpeed = orbitAngle(0.45, V.simDays);
      V.craftWorldPos.set(
        V.targetWorldPos.x + Math.cos(orbSpeed) * orbR,
        V.targetWorldPos.y + Math.sin(orbSpeed) * (orbR * 0.35),
        V.targetWorldPos.z + Math.sin(orbSpeed) * orbR
      );
      V.orbitEllipse = { key: 'moon', fx: 1, fy: 0, fz: 0, rx: orbR, ry: orbR * 0.35, rz: orbR };
    } else {
      translunarPoint(V.craftWorldPos, frac, isPhysicalMode());
      V.orbitEllipse = null;
    }
  } else {
    // Interplanetary Transfer
    if (V.arrived) {
      // Craft is in proximity orbit around target
      const orbR = targetBodyRadius() * 2.2;
      const orbSpeed = orbitAngle(0.35, V.simDays);
      V.craftWorldPos.set(
        V.targetWorldPos.x + Math.cos(orbSpeed) * orbR,
        V.targetWorldPos.y + Math.sin(orbSpeed) * (orbR * 0.35),
        V.targetWorldPos.z + Math.sin(orbSpeed) * orbR
      );
      V.orbitEllipse = { key: 'target', fx: 1, fy: 0, fz: 0, rx: orbR, ry: orbR * 0.35, rz: orbR };
    } else {
      // Along transfer ellipse in space
      const craftKm = state.craftKm;
      if (craftKm) {
        const u = UNITS_PER_KM;
        const x3d = craftKm[0] * u;
        const z3d = craftKm[1] * u;
        // Smoothly interpolate elevation towards target's inclined 3D plane
        const y3d = THREE.MathUtils.lerp(V.earthWorldPos.y, V.targetWorldPos.y, V.frac);
        V.craftWorldPos.set(x3d, y3d, z3d);
      }
      V.orbitEllipse = null; // on transfer: no arrival ring
    }
  }

  // Update Spacecraft Mesh Position & Orientation
  if (V.craftGroup) {
    V.craftGroup.position.copy(V.craftWorldPos);
    // Floodlight rides the craft; cutoff ends a few craft-sizes out so no
    // planet surface is ever inside the fill volume.
    if (V.craftLamp) {
      V.craftLamp.position.copy(V.craftWorldPos);
      try {
        const cs = trueCraftSpan();
        if (isFinite(cs) && cs > 0) V.craftLamp.distance = cs * 6;
      } catch (e) {}
    }

    // Orientation: nose points along velocity/target direction
    if (V.arrived) {
      V.craftGroup.lookAt(V.targetWorldPos);
    } else {
      const heading = _tmp.subVectors(V.targetWorldPos, V.craftWorldPos).normalize();
      if (heading.lengthSq() > 1e-6) {
        V.craftGroup.lookAt(V.craftWorldPos.clone().add(heading));
      }
    }

    // Dual-pass split-depth rendering:
    // The spacecraft model lives in V.fgScene authored in meters at scale 1.
    // The main AU scene holds V.craftGroup as an empty orientation proxy.
    // NASA Eyes convention: zero artificial enlargement. Sub-pixel at system range,
    // where the screen-space marker carries findability (see updateCraftMarker).

    // Bounded camera controls: in close-up inspection, lock minDistance outside the craft hull
    try {
      if (V.controls) {
        if (V.camMode === 'craft' || V.camMode === 'cockpit') {
          const s = trueCraftSpan();
          V.controls.minDistance = s * 2.2;
          V.controls.maxDistance = s * 40.0;
        } else {
          V.controls.minDistance = 0.00005;
          V.controls.maxDistance = 60;
        }
      }
    } catch (e) {}
  }

  // Arrival scanning beam follows the craft/target pair
  updateScanBeam();

  // Findability dot at the true craft position (screen-space marker; the
  // model itself stays true-scale, so this is what stays visible in
  // target/system/free views). Wall-clock pulse; no per-frame allocation.
  try { updateCraftMarker(performance.now()); } catch (e) {}

  // 4. Update Trajectory Curve
  updateTrajectoryGeometry(state);

  // Phase B step 3: sat beats + cruise trail/ticker (presentation only).
  try { satPhaseB(state); } catch (e) {}

  // 5. Update DSN Telemetry Comms Beam
  if (V.commsLine) {
    const pos = V.commsLine.geometry.attributes.position.array;
    pos[0] = V.earthWorldPos.x;
    pos[1] = V.earthWorldPos.y;
    pos[2] = V.earthWorldPos.z;
    pos[3] = V.craftWorldPos.x;
    pos[4] = V.craftWorldPos.y;
    pos[5] = V.craftWorldPos.z;
    V.commsLine.geometry.attributes.position.needsUpdate = true;
    V.commsLine.computeLineDistances();
    // Dash pitch follows the link length: the fixed 0.025 pitch drew one
    // solid glare-streak across short links (LEO links are ~0.022 units).
    try {
      const linkLen = Math.hypot(
        pos[3] - pos[0], pos[4] - pos[1], pos[5] - pos[2]);
      const pitch = THREE.MathUtils.clamp(linkLen * 0.03, 1e-5, 0.025);
      V.commsLine.material.dashSize = pitch;
      V.commsLine.material.gapSize = pitch;
    } catch (e) {}
    /* Phase 11: beam reflects link state (read-only). Blackout hides it.
       Cockpit hides it too: the eye sits on the beam endpoint, so the line
       would streak across the whole frame. */
    if (state.linkF !== undefined) {
      const f = THREE.MathUtils.clamp(state.linkF, 0, 1);
      V.commsLine.visible = f > 0 && V.camMode !== 'cockpit' && V.camMode !== 'craft';
      V.commsLine.material.opacity = 0.06 + 0.69 * f;
    } else {
      // No link factor this tick (e.g. LEO): visible except in cockpit and close-up craft inspection.
      V.commsLine.visible = (V.camMode !== 'cockpit' && V.camMode !== 'craft');
    }
  }
  /* (health beacon tint retired with the strobe sprite) */
}

/* ── Update Trajectory Arc Geometry ── */
function updateTrajectoryGeometry(state) {
  if (!state || !V.plannedLine || !V.historyLine) return;

  if (state.els) {
    const N = 80;
    const u = UNITS_PER_KM;
    const tofSec = (state.tofDays || 300) * 86400;
    const histCount = Math.max(2, Math.floor(N * V.frac));

    const histPos = [];
    const planPos = [];

    for (let i = 0; i <= N; i++) {
      const t = (i / N);
      const dtSec = tofSec * t;

      // Evaluate coplanar orbit position from elements
      let M = state.els.M0 + state.els.n * dtSec;
      let E = M;
      for (let k = 0; k < 15; k++) E = E - (E - state.els.e * Math.sin(E) - M) / (1 - state.els.e * Math.cos(E));
      const nu = 2 * Math.atan2(Math.sqrt(1 + state.els.e) * Math.sin(E / 2), Math.sqrt(1 - state.els.e) * Math.cos(E / 2));
      const r = state.els.a * (1 - state.els.e * Math.cos(E));
      const th = nu + state.els.argp;

      const x3d = r * Math.cos(th) * u;
      const z3d = r * Math.sin(th) * u;
      const y3d = THREE.MathUtils.lerp(V.earthWorldPos.y, V.targetWorldPos.y, t);

      const pt = new THREE.Vector3(x3d, y3d, z3d);

      if (i <= histCount) histPos.push(pt);
      if (i >= histCount) planPos.push(pt);
    }

    V.historyLine.geometry.setFromPoints(histPos);
    V.plannedLine.geometry.setFromPoints(planPos);
    V.plannedLine.computeLineDistances();
  } else if ((state.mode === 'fixedC3' || state.targetKey === 'moon') && !V.arrived) {
    const N = 80, histCount = Math.max(2, Math.floor(N * V.frac));
    const histPos = [], planPos = [], phys = isPhysicalMode();
    for (let i = 0; i <= N; i++) {
      const pt = translunarPoint(new THREE.Vector3(), i / N, phys);
      if (i <= histCount) histPos.push(pt);
      if (i >= histCount) planPos.push(pt);
    }

    V.historyLine.geometry.setFromPoints(histPos);
    V.plannedLine.geometry.setFromPoints(planPos);
    V.plannedLine.computeLineDistances();
  } else {
    V.historyLine.geometry.setFromPoints([]);
    V.plannedLine.geometry.setFromPoints([]);
  }

  // Arrival orbit ring: draws the branch's own tilted ellipse (V.orbitEllipse)
  // around the live target centre — the craft visibly rides the line.
  // Zero per-frame allocation: samples land in a preallocated buffer.
  // Hidden pre-arrival and in cockpit (the rider sees the planet, not the ring).
  try {
    const showOrb = (V.arrived || state.arrived) && V.targetOrbitLine
      && V.orbitEllipse && V.camMode !== 'cockpit';
    if (showOrb) {
      const c = (V.orbitEllipse.key === 'earth') ? V.earthWorldPos : V.targetWorldPos;
      const el = V.orbitEllipse;
      const attr = V.targetOrbitLine.geometry.getAttribute('position');
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * Math.PI * 2;
        attr.setXYZ(i,
          c.x + (el.fx ? Math.cos(a) : Math.sin(a)) * el.rx,
          c.y + (el.fy ? Math.cos(a) : Math.sin(a)) * el.ry,
          c.z + (el.fz ? Math.cos(a) : Math.sin(a)) * el.rz);
      }
      attr.needsUpdate = true;
      V.targetOrbitLine.visible = true;
    } else if (V.targetOrbitLine) {
      V.targetOrbitLine.visible = false;
    }
  } catch (e) {}
}

/* ── Phase B (P8): satellite / cruise beats — presentation only ──
   SAT_BEATS + runSatBeats: data-driven cinematic runner. Sim truth untouched:
   beats read game state, never write it. gate:null is the only gate today, so
   there is no behaviour change — future commissioning/insertion choices slot in
   as gate functions without touching derive(S) or FLIGHT_KEYS.
   Tags: REFERENCE = last FLIGHT_KEY; PRESENTATION = compressed beats;
   ESTIMATE = interpolated positions/trails/light-time (labelled as such). */
const SAT_BEATS = [
  { id: 'insertion', dur: 3.0, tag: 'REFERENCE', log: 'Orbit insertion — separation confirmed' },
  { id: 'drift', dur: 4.0, tag: 'PRESENTATION', log: 'Separation drift — spacecraft on station-keeping' },
  { id: 'deploy', dur: 7.0, tag: 'PRESENTATION', log: 'Array deploy — time-compressed' },
  { id: 'sunacq', dur: 2.0, tag: 'PRESENTATION', log: 'Sun acquisition — attitude stable' },
  { id: 'checkout', dur: 5.0, tag: 'PRESENTATION', log: 'Commissioning checkout' },
  { id: 'handover', dur: 1.5, tag: 'PRESENTATION', log: 'Handover to operations' }
];
/* Outcome gate (pure — fixture-testable): the runner is constructed for nominal
   ascents only. Scrub / partial / catastrophic never reach it. Unknown (e.g.
   final tableau) → false. Reads S.launch.outcome read-only. */
function satRunnerAllowed(outcome) {
  try {
    if (!outcome || typeof outcome.type !== 'string') return false;
    return outcome.type === 'nominal';
  } catch (e) { return false; }
}
/* Reload-replay latch (presentation-only, never touches S): written when the
   runner is constructed, keyed on mission id + launch day. sessionStorage in
   try/catch (file:// may throw); falls back to an in-memory flag. Checked
   BEFORE the fresh-start gate, so a reload at frac 0.02 on day<2 replays
   nothing — the trail backfills instead. */
const _satLatchMem = {};
function satLatchKey() {
  try {
    const lvl = (typeof S !== 'undefined' && S.levelId) ? S.levelId : 'x';
    const tdep = (typeof S !== 'undefined' && S.launch && isFinite(S.launch.tDep))
      ? S.launch.tDep : 'x';
    return 'margin_sat_v1:' + lvl + ':' + tdep;
  } catch (e) { return 'margin_sat_v1:x:x'; }
}
function satLatchRead() {
  try {
    const k = satLatchKey();
    if (_satLatchMem[k]) return true;
    try { if (window.sessionStorage && window.sessionStorage.getItem(k) === '1') return true; }
    catch (e) {}
    return false;
  } catch (e) { return false; }
}
function satLatchWrite() {
  try {
    const k = satLatchKey();
    _satLatchMem[k] = true;
    try { if (window.sessionStorage) window.sessionStorage.setItem(k, '1'); } catch (e) {}
  } catch (e) {}
}
/* Runner closure: created once per sequence start, never per frame. tick(sdt)
   advances with clamped wall dt (hidden-tab stall just pauses — rAF stops, no
   spurious finish). No setTimeout/setInterval anywhere in this sequence: nothing
   waits on a timer. onDone fires exactly once (b/d guards): skip-spam,
   double-tick and mid-beat teardown all converge. Zero per-frame allocation. */
function runSatBeats(beats, ctx) {
  let i = 0, t = 0, done = false;
  const finish = () => {
    if (done) return;
    done = true;
    try { if (ctx.onDone) ctx.onDone(); } catch (e) {}
  };
  const enter = () => {
    try { if (ctx.onLog) ctx.onLog(beats[i]); } catch (e) {}
    try { if (ctx.onBeat) ctx.onBeat(beats[i], ctx.reduced); } catch (e) {}
  };
  enter();
  const tick = (sdt) => {
    if (done) return true;
    const b = beats[i];
    try { if (b.gate && !b.gate(ctx)) return false; } catch (e) { return false; }
    t += (isFinite(sdt) && sdt > 0) ? Math.min(sdt, 0.1) : 0.016;
    if (t < b.dur) return false;
    t = 0;
    if (++i >= beats.length) { finish(); return true; }
    enter();
    return false;
  };
  tick.skip = finish;
  tick.isDone = () => done;
  return tick;
}
/* Cruise warp legibility (pure): compressed summary duration for a transfer of
   tofDays. The live ops loop stays player-warped; this bounds any summary beat. */
function cruiseLegibilityDur(tofDays) {
  try {
    const t = isFinite(tofDays) && tofDays > 0 ? tofDays : 300;
    return Math.max(8, Math.min(14, 6 + 3 * Math.log10(t)));
  } catch (e) { return 12; }
}
/* Wing hinge pivots (computed once, never per frame): for each side of the kit
   wings node, one Group at the bus-nearest edge; pivot.attach(wing) preserves
   world transform. Hinge axis = longest horizontal Box3 axis relative to the
   bus centre (not assumed ±X); stowed ∓π/2 about the other horizontal axis at
   build, decked to 0 over the 7 s deploy beat (smoothstep). If the Box3 is
   degenerate the hinge is skipped (beats stay log-only). Reduced motion: snap,
   no animation. Existing kit materials untouched. */
function buildWingHinges(wingsNode) {
  const pivots = [];
  try {
    if (!wingsNode) return pivots;
    wingsNode.updateMatrixWorld(true);
    const meshes = [];
    wingsNode.traverse(o => { if (o.isMesh) meshes.push(o); });
    if (!meshes.length) return pivots;
    const wb = new THREE.Box3().setFromObject(wingsNode);
    if (wb.isEmpty()) return pivots;
    const size = wb.getSize(new THREE.Vector3());
    const ctr = wb.getCenter(new THREE.Vector3());
    // Longest horizontal extent = span axis A; fold about the other one B.
    const alongX = size.x >= size.z;
    const span = alongX ? size.x : size.z;
    const other = alongX ? size.z : size.x;
    if (!(span > Math.max(other * 0.5, 1e-9))) return pivots; // not a wing pair
    try {
      if (PERF) {
        console.info('[ops-view] wing hinge: box=(' + size.x.toFixed(2) + ','
          + size.y.toFixed(2) + ',' + size.z.toFixed(2) + ') axis='
          + (alongX ? 'X' : 'Z'));
      }
    } catch (e) {}
    const sides = [[], []];
    const mb = new THREE.Box3(), mc = new THREE.Vector3();
    for (const m of meshes) {
      mb.setFromObject(m);
      if (mb.isEmpty()) continue;
      mb.getCenter(mc);
      const cA = alongX ? mc.x : mc.z, ctrA = alongX ? ctr.x : ctr.z;
      // Store mesh + bus-nearest edge along A (two small clones, once at build).
      sides[(cA >= ctrA) ? 0 : 1].push({ m, lo: alongX ? mb.min.x : mb.min.z,
        hi: alongX ? mb.max.x : mb.max.z });
    }
    const mkSide = (list, stow, rotAxis) => {
      if (!list.length) return;
      let inner = (stow < 0) ? Infinity : -Infinity;
      for (const e of list) {
        const edge = (stow < 0) ? e.lo : e.hi; // bus-nearest edge along A
        inner = (stow < 0) ? Math.min(inner, edge) : Math.max(inner, edge);
      }
      if (!isFinite(inner)) return;
      const pivot = new THREE.Group();
      pivot.name = 'wing_hinge';
      // Inner edge in wings-local space: wings node is untransformed at build
      // (mountOpsCraft wraps/scales AFTER), so world edge ≈ local edge.
      const px = alongX ? inner : ctr.x, pz = alongX ? ctr.z : inner;
      const lp = wingsNode.worldToLocal(new THREE.Vector3(px, ctr.y, pz));
      pivot.position.copy(lp);
      wingsNode.add(pivot);
      for (const e of list) { try { pivot.attach(e.m); } catch (err) {} }
      pivot.rotation[rotAxis] = stow;
      try { if (PERF) console.info('[ops-view] wing pivot at local', lp.toArray()); } catch (e) {}
      pivots.push({ p: pivot, stow, rotAxis });
    };
    // +A side folds down (−), −A side folds down mirrored; both deploy to 0.
    // A=X → rotate about Z (Rx untouched); A=Z → rotate about X.
    // Rx(+90°): +Z→−Y (down); Rx(−90°): −Z→−Y (down).
    if (alongX) { mkSide(sides[0], -Math.PI / 2, 'z'); mkSide(sides[1], Math.PI / 2, 'z'); }
    else { mkSide(sides[0], Math.PI / 2, 'x'); mkSide(sides[1], -Math.PI / 2, 'x'); }
  } catch (e) {}
  return pivots;
}

/* Phase B step 2: cruise legibility — warp ticker, 128-sample ring trail,
   light-time line. All ESTIMATE-labelled; positions reuse existing states. */
function ensureSatChip() {  try {
    if (V.satChip && V.satChip.isConnected) return V.satChip;
    const host = (V.canvas && V.canvas.parentElement) || document.body;
    const d = document.createElement('div');
    d.className = 'sat-beat-chip';
    d.setAttribute('role', 'status');
    d.style.cssText = 'position:absolute;left:12px;top:12px;z-index:5;pointer-events:none;'
      + 'font:11px/1.5 monospace;color:#9fe8b8;background:rgba(2,8,6,.55);'
      + 'border:1px solid rgba(94,246,160,.25);border-radius:4px;padding:4px 8px;';
    host.appendChild(d);
    V.satChip = d;
    return d;
  } catch (e) { return null; }
}
function buildCruiseTrail() {
  try {
    if (V.cruiseTrail) return V.cruiseTrail;
    const arr = new Float32Array(128 * 3); // preallocated once; chronological via copyWithin
    const geo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(arr, 3);
    try { attr.setUsage(THREE.DynamicDrawUsage); } catch (e) {}
    geo.setAttribute('position', attr);
    geo.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ color: 0x5ef6a0, transparent: true, opacity: 0.5 });
    const line = new THREE.Line(geo, mat);
    line.name = 'cruise_trail_estimate';
    line.userData.estimate = true; // interpolated positions — ESTIMATE, not truth
    line.frustumCulled = false;
    if (V.scene) V.scene.add(line);
    V.cruiseTrail = line;
    V.cruiseHead = 0; V.cruiseCount = 0;
    return line;
  } catch (e) { return null; }
}
/* One-time backfill of the flown arc from the live transfer elements (same
   Kepler eval as updateTrajectoryGeometry; runs once per ops start, not per
   frame). Reload mid-cruise therefore shows the flown trail immediately and
   never replays separation beats. */
function backfillCruiseTrail(els, frac, tofDays) {
  try {
    const line = buildCruiseTrail();
    if (!line) return;
    const attr = line.geometry.getAttribute('position');
    const arr = attr.array;
    const n = Math.max(2, Math.min(128, Math.floor(128 * (frac || 0))));
    if (els && isFinite(els.a)) {
      const u = UNITS_PER_KM;
      const tofSec = (tofDays || 300) * 86400;
      for (let k = 0; k < n; k++) {
        const t = n <= 1 ? 0 : (k / (n - 1)) * (frac || 0);
        const dtSec = tofSec * t;
        let M = els.M0 + els.n * dtSec, E = M;
        for (let j = 0; j < 12; j++) E = E - (E - els.e * Math.sin(E) - M) / (1 - els.e * Math.cos(E));
        const nu = 2 * Math.atan2(Math.sqrt(1 + els.e) * Math.sin(E / 2), Math.sqrt(1 - els.e) * Math.cos(E / 2));
        const r = els.a * (1 - els.e * Math.cos(E));
        const th = nu + els.argp;
        arr[k * 3] = r * Math.cos(th) * u;
        arr[k * 3 + 1] = THREE.MathUtils.lerp(V.earthWorldPos.y, V.targetWorldPos.y, t);
        arr[k * 3 + 2] = r * Math.sin(th) * u;
      }
    } else if (V.targetKey === 'moon' || (typeof S !== 'undefined' && S.levelId === 'l2')) {
      const dir = new THREE.Vector3().subVectors(V.targetWorldPos, V.earthWorldPos);
      const dist = dir.length();
      const normDir = (dist > 1e-6) ? dir.clone().multiplyScalar(1 / dist) : new THREE.Vector3(0, 0, 1);
      const rE = (isPhysicalMode() ? radiusKmTrue('earth') * UNITS_PER_KM : radiusOf('earth') || 0.0144) * 1.55;
      const rM = (isPhysicalMode() ? radiusKmTrue('moon') * UNITS_PER_KM : radiusOf('moon') || 0.0039) * 2.2;
      const p0 = new THREE.Vector3().copy(V.earthWorldPos).addScaledVector(normDir, rE);
      const p1 = new THREE.Vector3().copy(V.targetWorldPos).addScaledVector(normDir, -rM);
      for (let k = 0; k < n; k++) {
        const t = (n <= 1 ? 0 : (k / (n - 1))) * (frac || 0);
        const pt = new THREE.Vector3().lerpVectors(p0, p1, t);
        pt.y += Math.sin(t * Math.PI) * 0.04;
        const side = Math.sin(t * Math.PI) * (dist * 0.07);
        pt.x += -normDir.z * side;
        pt.z += normDir.x * side;
        arr[k * 3] = pt.x;
        arr[k * 3 + 1] = pt.y;
        arr[k * 3 + 2] = pt.z;
      }
    } else {
      return;
    }
    V.cruiseCount = n; V.cruiseHead = n % 128;
    // Chronological order: backfilled head-to-tail; live pushes append via copyWithin.
    if (n >= 128) { V.cruiseCount = 128; V.cruiseHead = 0; }
    attr.needsUpdate = true;
    line.geometry.setDrawRange(0, V.cruiseCount);
  } catch (e) {}
}
function pushCruiseTrail() {
  try {
    const line = V.cruiseTrail;
    if (!line) return;
    const attr = line.geometry.getAttribute('position');
    const arr = attr.array;
    if (V.cruiseCount < 128) {
      arr[V.cruiseCount * 3] = V.craftWorldPos.x;
      arr[V.cruiseCount * 3 + 1] = V.craftWorldPos.y;
      arr[V.cruiseCount * 3 + 2] = V.craftWorldPos.z;
      V.cruiseCount++;
    } else {
      arr.copyWithin(0, 3); // allocation-free shift; chronological order kept
      arr[127 * 3] = V.craftWorldPos.x;
      arr[127 * 3 + 1] = V.craftWorldPos.y;
      arr[127 * 3 + 2] = V.craftWorldPos.z;
    }
    attr.needsUpdate = true;
    line.geometry.setDrawRange(0, V.cruiseCount);
  } catch (e) {}
}
/* Light-time seconds from existing world states (ESTIMATE): |craft−earth| km / c. */
function lightTimeSec() {
  try {
    _tmp.subVectors(V.craftWorldPos, V.earthWorldPos);
    const km = _tmp.length() / UNITS_PER_KM;
    if (!isFinite(km) || km < 0) return 0;
    return km / 299792.458;
  } catch (e) { return 0; }
}

/* Phase B step 3: robustness — outcome gate, reload rebuild, fail path.
   Called once per update() tick (not per frame). Fresh-start rule (day<2,
   !arrived, frac<0.05, ops scene, nominal outcome) means a reload mid-cruise
   rebuilds the trail from els but never replays separation beats. Scrub /
   partial / catastrophic outcomes never construct the runner (fixture table in
   QA). ?no3d / GLB-fail: this whole block is V.active-gated; the 2D canvas +
   mission log carry the same three beats (separation / cruise N days / arrival). */
/* Visible skip control (satellite cinematic stays skippable — only the landing
   descent is unskippable). Button is keyboard-focusable; Esc also skips while
   the runner is active. Listener is added per sequence start and removed on
   done/cleanup, so no stray handler survives teardown. */
function ensureSatSkip() {
  try {
    if (V.satSkip && V.satSkip.isConnected) { V.satSkip.style.display = ''; return V.satSkip; }
    const host = (V.canvas && V.canvas.parentElement) || document.body;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sat-skip';
    b.textContent = 'SKIP ▸▸';
    b.setAttribute('aria-label', 'Skip satellite deployment cinematic');
    b.style.cssText = 'position:absolute;right:12px;top:12px;z-index:5;'
      + 'font:11px monospace;color:#0a1410;background:#5ef6a0;border:0;border-radius:4px;'
      + 'padding:5px 10px;cursor:pointer;';
    b.addEventListener('click', () => { try { if (V.satTick) V.satTick.skip(); } catch (e) {} });
    host.appendChild(b);
    V.satSkip = b;
    return b;
  } catch (e) { return null; }
}
function removeSatSkip() {
  try { if (V._satKeyH) { window.removeEventListener('keydown', V._satKeyH, true); } } catch (e) {}
  V._satKeyH = null;
  try { if (V.satSkip && V.satSkip.parentNode) V.satSkip.parentNode.removeChild(V.satSkip); } catch (e) {}
  V.satSkip = null;
}
function satPhaseB(state) {
  if (!V.active || !state || V.sceneKind !== 'ops') return;
  try {
    if (!V.cruiseTrail) {
      buildCruiseTrail();
      if (!state.arrived) backfillCruiseTrail(state.els, state.frac || 0, state.tofDays);
    }
    if (!state.arrived) pushCruiseTrail();
  } catch (e) {}
  try {
    let outcome = null;
    try { outcome = (typeof S !== 'undefined' && S.launch) ? S.launch.outcome : null; } catch (e) {}
    const day = isFinite(state.day) ? state.day : 999;
    const fresh = day < 2 && !state.arrived && ((state.frac || 0) < 0.05);
    // Latch first: a day<2 reload inside the first 5% must not replay beats.
    if (fresh && satLatchRead()) { V._satDone = true; /* replay suppressed */ }
    if (!V.satTick && !V._satDone && fresh && satRunnerAllowed(outcome) && !satLatchRead()) {
      satLatchWrite(); // written at construction (presentation-only, never S)
      const isMoon = (state.targetKey === 'moon' || (typeof S !== 'undefined' && S.levelId === 'l2'));
      const reduced = (() => {
        try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
        catch (e) { return false; }
      })();
      const chip = ensureSatChip();
      ensureSatSkip();
      try {
        if (V._satKeyH) { try { window.removeEventListener('keydown', V._satKeyH, true); } catch (e) {} }
        // Phase C layering note: this Esc capture lives only while the sat
        // runner is active and never calls stopPropagation — the descent key
        // capture must layer on top without being stopped by this one.
        V._satKeyH = (e) => {
          try { if (e && e.key === 'Escape' && V.satTick) V.satTick.skip(); } catch (err) {}
        };
        window.addEventListener('keydown', V._satKeyH, true);
      } catch (e) {}
      const ctx = {
        reduced,
        onLog: (b) => { try { if (chip) chip.textContent = '▸ ' + b.log + ' · ' + b.tag; } catch (e) {} },
        onBeat: (b) => {
          if (b.id !== 'deploy') return;
          if (reduced || !V.deployPivots || !V.deployPivots.length) {
            try {
              (V.deployPivots || []).forEach(p => { p.p.rotation[p.rotAxis || 'z'] = 0; });
            } catch (e) {}
            V.deployT = -1;
            return;
          }
          V.deployDur = isMoon ? 4.6 : 7.0;
          V.deployT = 0; // smoothstep in animate(); stowed angles set at build
        },
        onDone: () => {
          V._satDone = true;
          V.satTick = null;
          removeSatSkip(); // sequence over: skip control + Esc listener go away
        }
      };
      const beats = isMoon
        ? SAT_BEATS.map(b => ({ ...b, dur: +(b.dur * 0.65).toFixed(1) }))
        : SAT_BEATS;
      V.satTick = runSatBeats(beats, ctx);
    }
  } catch (e) {}
  // Cruise ticker (post-beats; during beats the chip shows the beat line).
  try {
    if (V._satDone && V.satChip && V.satChip.isConnected) {
      const lt = lightTimeSec();
      const mm = Math.floor(lt / 60), ss = Math.floor(lt % 60);
      const rate = (V.viewRate || 0).toFixed(1);
      V.satChip.textContent = 'T+' + (isFinite(state.day) ? state.day.toFixed(1) : '?')
        + '/' + (state.cruise || '?') + ' d · ×' + rate + ' d/s · LT +'
        + mm + 'm' + String(ss).padStart(2, '0') + 's EST';
    }
  } catch (e) {}
}

/* ── Phase C2: lander + descent scene (presentation only) ──
   Owner-supplied `models/nasa/apollo_lm_lander.glb` (370 KB, no Draco, 17.5k
   tris, whole LM both stages, scale 1.0 presentation-grade). Preloaded eagerly
   at ops start (L2 only, never ?no3d — no game.js edit involved); the fallback
   decision is made once at descent start with ~3 s frame-driven grace. Load
   failure → existing skippable overlay. Own metre-unit scene (1 u = 1 m,
   near 0.1 / far 20000); footpads seated at y = 0 via measured Box3. Touchdown
   truth always from computeLanding (read-only); altitude tape is synthesized
   descentCurve labelled TIME-COMPRESSED / PRESENTATION. */
const LANDER_URL = 'models/nasa/apollo_lm_lander.glb';
// Presentation tuning (profile changes timing/dust/shake ONLY — never outcome).
const DZ_PROF = {
  precision: { dur: 11.5, dustMul: 0.8, shakeMul: 0.8 },
  balanced: { dur: 10.0, dustMul: 1.0, shakeMul: 1.0 },
  ballistic: { dur: 8.0, dustMul: 1.4, shakeMul: 1.5 }
};
const DZ3D = { status: 'idle', promise: null, raw: null, scene: null, camera: null,
  wrap: null, box: null, ground: null, plume: null, glow: null, dust: [], dustTex: null,
  marker: null, aria: null, t: 0, T: 10, hold: 0, covered: false, prof: null,
  land: null, reduced: false, lastAria: 0, seed: 1 };
const _dc = { h: 1500, throttle: 0 }; // preallocated descentCurve result (zero-alloc)
/* Synthesized altitude (PRESENTATION): u = t/T in [0,1], H0 metres at u=0. */
function descentCurve(u, out, H0) {
  const uu = Math.max(0, Math.min(1, u));
  out.h = (H0 == null ? 1500 : H0) * Math.pow(1 - uu, 2.2);
  const t = uu;
  const sm = (a, b) => {
    const k = Math.max(0, Math.min(1, (t - a) / Math.max(1e-6, b - a)));
    return k * k * (3 - 2 * k);
  };
  out.throttle = 0.25 + 0.65 * sm(0.05, 0.35) * (1 - 0.5 * sm(0.85, 1));
  return out;
}
let _dzDraco = null;
function dzLoader() {
  const l = new GLTFLoader(); // same loader pattern as the existing GLB path
  try {
    if (!_dzDraco) {
      _dzDraco = new DRACOLoader();
      _dzDraco.setDecoderPath('vendor/draco/');
    }
    l.setDRACOLoader(_dzDraco);
  } catch (e) {}
  return l;
}
/* PAINT mapping by base colour (owner table). Textured parts (flag + 2 labels)
   keep their maps with a mild tune; legs are merged by material so no per-leg
   motion — C2 tilts the whole body by slope + single settle (C3 owns settle). */
function dzPaintKind(m) {
  try {
    if (m.map) return { m: 0.3, r: 0.6, keepMap: true };
    const c = m.color || { r: 1, g: 1, b: 1 };
    const R = Math.round(c.r * 255), G = Math.round(c.g * 255), B = Math.round(c.b * 255);
    const near = (a, b, t) => Math.abs(a - b) <= t;
    if (near(R, 196, 8) && near(G, 135, 8) && near(B, 15, 8)) return { m: 0.9, r: 0.35 }; // gold foil
    if (near(R, 163, 10) && near(G, 81, 10) && near(B, 5, 8)) return { m: 0.9, r: 0.4 }; // copper
    if (near(R, 239, 10) && near(G, 239, 10) && near(B, 142, 10)) return { m: 0.3, r: 0.6 }; // pale yellow
    if (near(R, 191, 8) && near(G, 191, 8) && near(B, 191, 8)) return { m: 0.6, r: 0.5 }; // ascent shell
    if (near(R, 173, 8) && near(G, 173, 8) && near(B, 173, 8)) return { m: 0.2, r: 0.5 }; // light gray
    if (near(R, 127, 8) && near(G, 127, 8) && near(B, 127, 8)) return { m: 0.5, r: 0.6 }; // mid gray
    if (near(R, 255, 6) && near(G, 255, 6) && near(B, 255, 6)) return { m: 0.05, r: 0.45 }; // white
    if (R < 24 && G < 24 && B < 24) return { m: 0.4, r: 0.8 }; // black
    if (R < 90 && G < 90 && B < 90) return { m: 0.8, r: 0.55 }; // dark struts
    return { m: 0.5, r: 0.6 };
  } catch (e) { return { m: 0.5, r: 0.6 }; }
}
function dzApplyPaint(root) {
  try {
    root.traverse(o => {
      if (!o.isMesh || !o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
        if (!m || !m.isMeshStandardMaterial) return;
        try {
          const p = dzPaintKind(m);
          m.metalness = p.m;
          m.roughness = p.r;
        } catch (e) {}
      });
      try { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; } catch (e) {}
    });
  } catch (e) {}
}
/* Eager preload at ops start (L2 only, never ?no3d). Failure parks status at
   'failed' — descent falls back to the skippable overlay, no second chance. */
function dzPreload() {
  if (DZ3D.status !== 'idle') return;
  try {
    let isL2 = false, no3d = false;
    try { isL2 = (typeof S !== 'undefined' && S.levelId === 'l2'); } catch (e) {}
    try { no3d = /[?&]no3d/.test(location.search); } catch (e) {}
    if (!isL2 || no3d) { DZ3D.status = 'skipped'; return; }
  } catch (e) { DZ3D.status = 'skipped'; return; }
  DZ3D.status = 'loading';
  try {
    DZ3D.promise = new Promise((resolve, reject) => {
      dzLoader().load(LANDER_URL, resolve, undefined, reject);
    }).then((gltf) => {
      const sc = (gltf && (gltf.scene || (gltf.scenes && gltf.scenes[0]))) || null;
      if (!sc) { DZ3D.status = 'failed'; return; }
      if (!V.active) { // scene died mid-load: dispose immediately, no stale cache
        try {
          sc.traverse(o => {
            try { if (o.geometry) o.geometry.dispose(); } catch (e) {}
            try {
              if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
                try { if (m.map) m.map.dispose(); } catch (e) {}
                try { m.dispose(); } catch (e) {}
              });
            } catch (e) {}
          });
        } catch (e) {}
        DZ3D.status = 'idle';
        return;
      }
      DZ3D.raw = sc;
      try {
        const box = new THREE.Box3().setFromObject(DZ3D.raw);
        const sz = box.getSize(new THREE.Vector3());
        DZ3D.rawBox = box.clone();
        try {
          if (PERF) {
            console.info('[ops-view] lander Box3 size=(' + sz.x.toFixed(2) + ','
              + sz.y.toFixed(2) + ',' + sz.z.toFixed(2) + ')m span/footprint vs 9.1m gear, height vs ~7m (presentation scale 1.0)');
          }
        } catch (e) {}
        dzApplyPaint(DZ3D.raw);
      } catch (e) {}
      DZ3D.status = 'ready';
    }).catch((e) => {
      try { console.warn('[ops-view] lander load failed, overlay fallback:', e && (e.message || e)); } catch (_) {}
      DZ3D.status = 'failed';
    });
  } catch (e) { DZ3D.status = 'failed'; }
}



/* ── Lunar Descent Supersonic Engine Plume (Physics-based ray contour) ── */
const LM_PLUME_VERT = [
  'uniform float uTime, uExpand;',
  'varying vec3 vLocal; varying float vAx; varying vec3 vN; varying vec3 vV;',
  'void main(){',
  '  float v = 1.0 - uv.y;',
  '  vec3 p = position;',
  '  float flare = 1.0 + (uExpand - 1.0) * (1.0 - exp(-3.0 * v));',
  '  float taper = 1.0 - 0.55 * smoothstep(0.6, 1.0, v);',
  '  p.xz *= flare * taper;',
  '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
  '  vLocal = p; vAx = v;',
  '  vN = normalize(normalMatrix * normal);',
  '  vV = normalize(-mv.xyz);',
  '  gl_Position = projectionMatrix * mv;',
  '}'
].join('\n');

const LM_PLUME_FRAG = [
  'float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
  'float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);',
  '  float a = hash21(i); float b = hash21(i+vec2(1.0,0.0));',
  '  float c = hash21(i+vec2(0.0,1.0)); float d = hash21(i+vec2(1.0,1.0));',
  '  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }',
  'float fbm4(vec2 p){ float v = 0.0; float a = 0.5;',
  '  for(int i=0;i<4;i++){ v += a*vnoise(p); p *= 2.03; a *= 0.5; } return v; }',
  'uniform float uTime, uThrottle, uExposure, uTurb, uSoft;',
  'uniform vec3 uMidCol, uCoreCol;',
  'varying vec3 vLocal; varying float vAx; varying vec3 vN; varying vec3 vV;',
  'void main(){',
  '  float v = vAx;',
  '  float ndv = abs(dot(normalize(vN), normalize(vV)));',
  '  float r = sqrt(max(0.0, 1.0 - ndv * ndv));',
  '  float q = r * 1.3;',
  '  vec2 c = normalize(vLocal.xz + 1e-5);',
  '  float T = uTime;',
  '  vec2 p1 = vec2(c.x*2.0 + c.y*1.1 + T*1.5, v*6.0 - T*24.0);',
  '  vec2 p2 = vec2(c.y*3.5 - c.x*2.1 - T*1.8, v*14.0 - T*36.0);',
  '  float nm = 0.6*fbm4(p1) + 0.4*fbm4(p2);',
  '  float pulse = 0.90 + 0.20 * vnoise(vec2(T*38.0 - v*12.0, 3.7));',
  '  float f = exp(-(q*q*q*1.8));',
  '  float s = mix(0.15, 0.45, smoothstep(0.0, 0.5, v)) * uTurb;',
  '  float J = f * (1.0 + s*(nm - 0.5)*2.0) * pulse * exp(-1.6 * v) * (0.4 + 0.6*uThrottle);',
  '  J *= 1.0 + 0.25 * pow(0.5 + 0.5*cos(v*48.0), 3.0) * exp(-3.0*v) * (1.0 - r);',
  '  J *= 1.0 - smoothstep(0.70, 1.0, v + 0.25*r);',
  '  float w = 0.06 * uSoft;',
  '  float a = smoothstep(0.20 - w, 0.20 + w, J) * (1.0 - smoothstep(0.85, 0.99, r));',
  '  if (a < 0.005) discard;',
  '  float I = uExposure * J;',
  '  vec3 col = mix(uMidCol, uCoreCol, smoothstep(0.8, 2.5, I));',
  '  col += vec3(0.9, 0.95, 1.0) * smoothstep(2.0, 4.0, I) * 0.4;',
  '  gl_FragColor = vec4(col, a * 0.75 * min(1.0, uThrottle * 1.5));',
  '}'
].join('\n');

function makeLmPlumeMesh() {
  const over = 1.4;
  const topR = 0.52 * over, botR = 1.35 * over, len = 5.2;
  const geo = new THREE.CylinderGeometry(topR, botR, len, 32, 16, true);
  const aspect = len / (((topR + botR) * 0.5));
  const mat = new THREE.ShaderMaterial({
    vertexShader: LM_PLUME_VERT,
    fragmentShader: LM_PLUME_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uThrottle: { value: 1.0 },
      uExpand: { value: 1.6 },
      uCoreCol: { value: new THREE.Color(0xffffff) },
      uMidCol: { value: new THREE.Color(0xffaa44) },
      uExposure: { value: 6.0 },
      uTurb: { value: 0.35 },
      uSoft: { value: 2.5 },
      uAspect: { value: aspect }
    },
    transparent: true, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -len / 2;
  return m;
}

function makeSmokeTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  let seed = 9876543;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 28; i++) {
    const x = 128 + (rnd() - 0.5) * 140;
    const y = 128 + (rnd() - 0.5) * 140;
    const r = 12 + rnd() * 26;
    const a = 0.18 + rnd() * 0.22;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(220,215,205,' + a.toFixed(3) + ')');
    g.addColorStop(0.55, 'rgba(180,175,165,' + (a * 0.5).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(150,145,135,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ── Procedural Regolith Textures & Terrain Utilities (Zero-asset Moon Surface) ── */
function dzHash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function dzVnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return dzHash(xi, yi) * (1 - u) * (1 - v) + dzHash(xi + 1, yi) * u * (1 - v) +
         dzHash(xi, yi + 1) * (1 - u) * v + dzHash(xi + 1, yi + 1) * u * v;
}
function dzFbm(x, y) {
  let a = 0.5, f = 1, s = 0;
  for (let o = 0; o < 4; o++) { s += a * dzVnoise(x * f, y * f); f *= 2; a *= 0.5; }
  return s - 0.5;
}

function makeRegolithTextures(renderer) {
  if (typeof document === 'undefined') return { map: null, normalMap: null };
  const N = 512;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };

  // Diffuse: grain
  const dc = mk(), dctx = dc.getContext('2d');
  const img = dctx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const g = 140 + Math.random() * 40 + (Math.random() < 0.02 ? -30 : 0);
    img.data.set([g, g, g * 1.01, 255], i * 4);
  }
  dctx.putImageData(img, 0, 0);

  // Normal: derive from a height field
  const hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      hgt[y * N + x] = dzFbm(x * 0.08, y * 0.08) * 1.0 + dzFbm(x * 0.5, y * 0.5) * 0.4;
    }
  }

  const nc = mk(), nctx = nc.getContext('2d');
  const nimg = nctx.createImageData(N, N);
  const S = 6.0; // bump strength
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const l = hgt[y * N + (x - 1 + N) % N], r = hgt[y * N + (x + 1) % N];
      const u = hgt[((y - 1 + N) % N) * N + x], d = hgt[((y + 1) % N) * N + x];
      let nx = (l - r) * S, ny = (u - d) * S, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * N + x) * 4;
      nimg.data[i]     = (nx / len * 0.5 + 0.5) * 255;
      nimg.data[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      nimg.data[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      nimg.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);

  const setup = (canvas, repeat, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    try {
      if (renderer && renderer.capabilities && typeof renderer.capabilities.getMaxAnisotropy === 'function') {
        t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      } else {
        t.anisotropy = 8;
      }
    } catch (e) { t.anisotropy = 8; }
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: setup(dc, 400, true), normalMap: setup(nc, 400, false) };
}

function makeGroundMaterial(renderer) {
  const { map, normalMap } = makeRegolithTextures(renderer);
  return new THREE.MeshStandardMaterial({
    color: 0x78787a, // authentic Apollo ~12% reflectance basaltic regolith
    map: map || undefined,
    normalMap: normalMap || undefined,
    normalScale: new THREE.Vector2(0.8, 0.8),
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.02,
    side: THREE.DoubleSide
  });
}

function makeFarMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x8f8f91,
    roughness: 1.0,
    metalness: 0.0,
    side: THREE.DoubleSide
  });
}

function fitSunShadow(sun, target, sunDir, half = 60) {
  if (!sun || !target) return;
  sun.position.copy(target).addScaledVector(sunDir, 450);
  if (sun.target) {
    sun.target.position.copy(target);
    sun.target.updateMatrixWorld();
  }
  if (sun.shadow && sun.shadow.camera) {
    const c = sun.shadow.camera;
    c.left = -half; c.right = half; c.top = half; c.bottom = -half;
    c.near = 10; c.far = 1000;
    c.updateProjectionMatrix();
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.04;
  }
}

function buildContinuousLunarTerrain(patch, h0, outerHeightAt) {
  const N = 180;
  const geo = new THREE.PlaneGeometry(1, 1, N, N);
  const pos = geo.attributes.position;
  const totalVerts = pos.count;
  const colArr = new Float32Array(totalVerts * 3);
  const radiusAt = (rho) => 360000 * (0.008 * rho + 0.035 * Math.pow(rho, 2) + 0.957 * Math.pow(rho, 3.5));
  const R_MOON = 1737000;
  const D2G = 180 / Math.PI;
  const clamp1 = (v) => v < -1 ? -1 : v > 1 ? 1 : v;

  let hmn = 1e9, hmx = -1e9;
  for (let k = 0; k < totalVerts; k++) {
    const u = pos.getX(k) * 2;
    const v = pos.getY(k) * 2;
    // Shirley-Chiu disc mapping: orthogonal quad mesh in center -> perfect circular perimeter
    const xP = u * Math.sqrt(Math.max(0, 1 - v * v / 2));
    const zP = v * Math.sqrt(Math.max(0, 1 - u * u / 2));
    const rho = Math.min(1, Math.hypot(xP, zP));
    let x = 0, z = 0, r = 0;
    if (rho >= 1e-7) {
      r = radiusAt(rho);
      x = (xP / rho) * r;
      z = (zP / rho) * r;
    }

    const sphereDrop = Math.sqrt(Math.max(0, R_MOON * R_MOON - r * r)) - R_MOON;

    let relief = 0;
    if (patch) {
      if (r <= 1500) {
        relief = surfHeightAt(patch, x, z) - h0;
      } else if (r < 2300) {
        const w = (r - 1500) / 800, s = w * w * (3 - 2 * w);
        relief = (surfHeightAt(patch, x, z) - h0) * (1 - s) + (outerHeightAt ? outerHeightAt(x, z) : 0) * s;
      } else if (r <= 18000) {
        relief = outerHeightAt ? outerHeightAt(x, z) : 0;
      } else if (r < 24000) {
        const w = (r - 18000) / 6000, s = w * w * (3 - 2 * w);
        const k1 = 0.00007, k2 = 0.00019, k3 = 0.00045;
        const n1 = Math.sin(x * k1 + 1.2) * Math.cos(z * k1 + 0.8);
        const n2 = Math.sin(x * k2 * 0.7 - z * k2 * 0.7 + 2.1) * Math.cos(x * k2 * 0.7 + z * k2 * 0.7);
        const n3 = Math.sin(x * k3 + 3.7) * Math.sin(z * k3 + 1.4);
        const distantTopo = Math.abs(n1) * 850 + n2 * 450 + n3 * 200;
        relief = (outerHeightAt ? outerHeightAt(x, z) : 0) * (1 - s) + distantTopo * s;
      } else {
        const k1 = 0.00007, k2 = 0.00019, k3 = 0.00045;
        const n1 = Math.sin(x * k1 + 1.2) * Math.cos(z * k1 + 0.8);
        const n2 = Math.sin(x * k2 * 0.7 - z * k2 * 0.7 + 2.1) * Math.cos(x * k2 * 0.7 + z * k2 * 0.7);
        const n3 = Math.sin(x * k3 + 3.7) * Math.sin(z * k3 + 1.4);
        const fade = Math.max(0, 1 - (r - 24000) / 300000);
        relief = (Math.abs(n1) * 850 + n2 * 450 + n3 * 200) * fade;
      }
    } else {
      const k1 = 0.00007, k2 = 0.00019, k3 = 0.00045;
      const n1 = Math.sin(x * k1 + 1.2) * Math.cos(z * k1 + 0.8);
      const n2 = Math.sin(x * k2 * 0.7 - z * k2 * 0.7 + 2.1) * Math.cos(x * k2 * 0.7 + z * k2 * 0.7);
      const n3 = Math.sin(x * k3 + 3.7) * Math.sin(z * k3 + 1.4);
      relief = Math.abs(n1) * 600 + n2 * 300 + n3 * 150;
    }

    const flat = Math.min(1, Math.max(0, (r - 12) / 30));
    const microH = (dzFbm(x * 0.05, z * 0.05) * 0.5 + dzFbm(x * 0.3, z * 0.3) * 0.1) * flat;

    const y = sphereDrop + relief + microH;
    pos.setXYZ(k, x, y, z);
    if (y < hmn) hmn = y;
    if (y > hmx) hmx = y;
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  // Apollo regolith grading: dark basalt base + slope-dependent anorthosite highlights + subtle mare tint
  const norms = geo.attributes.normal;
  for (let k = 0; k < totalVerts; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    const ny = Math.max(0, norms.getY(k));
    const sl = Math.acos(clamp1(ny)) * D2G;

    const s1 = Math.sin(x * 0.00004 + z * 0.00006) * 43758.5453;
    const mareVal = Math.sin(x * 0.000012 + 0.5) * Math.cos(z * 0.000012 + 1.2);
    const mareTint = mareVal > 0.2 ? -0.03 : 0.02;
    const mNoise = (s1 - Math.floor(s1)) * 0.03 - 0.015;
    const slopeBright = Math.min(40, sl) / 40 * 0.10;

    let g = 0.54 + mareTint + mNoise + slopeBright;
    g = Math.max(0.35, Math.min(0.82, g));
    colArr[k * 3]     = g;
    colArr[k * 3 + 1] = g;
    colArr[k * 3 + 2] = g * 1.01;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  return geo;
}

function makeBoulderGeo(seedOffset = 0) {
  let geo = new THREE.IcosahedronGeometry(1, 3);
  try {
    geo.deleteAttribute('normal');
    geo.deleteAttribute('uv');
    if (typeof mergeVertices === 'function') {
      geo = mergeVertices(geo);
    }
  } catch (e) {}
  const p = geo.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
    const n = 0.7 + dzFbm(x * 2.3 + 11 + seedOffset, z * 2.3 + y * 2.1) * 0.9 + 0.3;
    p.setXYZ(k, x * n, y * n * 0.6, z * n);
  }
  geo.computeVertexNormals();
  return geo;
}

function scatterBoulders(group, groundHeightAt, count = 100, maxR = 90) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x77777a, roughness: 1.0, metalness: 0.0 });
  const geos = [makeBoulderGeo(0), makeBoulderGeo(37), makeBoulderGeo(83)];

  for (let ri = 0; ri < count; ri++) {
    // bias toward the near field; keep far boulders rare and small
    const r = 10 + Math.pow(Math.random(), 1.6) * (maxR - 10);
    const a = Math.random() * Math.PI * 2;
    const s = (0.2 + Math.random() * 0.7) * (1 - r / (maxR * 1.4));

    const geo = geos[ri % geos.length];
    const m = new THREE.Mesh(geo, mat);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    m.position.set(x, groundHeightAt(x, z) - s * 0.15, z); // sunk in, not floating
    m.scale.setScalar(s);
    m.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
}

function fixLanderMaterials(root, envMap) {
  root.traverse(o => {
    if (!o.isMesh) return;
    try {
      if (o.geometry && typeof toCreasedNormals === 'function') {
        o.geometry = toCreasedNormals(o.geometry, THREE.MathUtils.degToRad(35));
      }
    } catch (e) {}

    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(m => {
      if (!m || !m.color) return;
      const hsl = {}; m.color.getHSL(hsl);
      const isGold = hsl.s > 0.35 && hsl.h > 0.08 && hsl.h < 0.18;
      const isGrey = hsl.s < 0.12;

      if (isGold) {
        m.metalness = 0.85;
        m.roughness = 0.40;
      } else if (isGrey) {
        // Ascent stage: satin Mylar/aluminum look instead of chrome shards
        m.metalness = 0.35;
        m.roughness = 0.60;
        m.color.setScalar(0.80);
      }
      if (envMap) {
        m.envMap = envMap;
        m.envMapIntensity = 0.70; // was 1.2
      }
      m.flatShading = false;
      m.needsUpdate = true;
    });
    if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
  });
}

/* Own metre-unit descent scene (built once per 3D descent from the preloaded
   raw; disposed in dzCleanup so memory returns to baseline). Camera shots:
   A high-chase 0–35%, B low-lateral 35–80%, C footpad cam 80–100%. */
function dzBuildScene(prof, land) {
  dzDisposeScene();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010206); // Pitch-black cosmic vacuum
  scene.fog = null; // No atmosphere on Moon — distant terrain stays fully lit
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.8, 800000);
  try {
    if (V.canvas) {
      const w = V.canvas.clientWidth || 800, h = V.canvas.clientHeight || 450;
      if (w > 0 && h > 0) camera.aspect = w / h;
    }
    camera.updateProjectionMatrix();
  } catch (e) {}

  // 1. High-contrast Apollo solar illumination: 1361 W/m² direct airless sunlight + subtle 3.5 ambient fill
  try {
    const sun = new THREE.DirectionalLight(0xfffcf8, SOLAR_CONSTANT_W_M2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.04;
    scene.add(sun);
    scene.add(sun.target);
    DZ3D.sun = sun;
    const sunDirInit = new THREE.Vector3(0.55, 0.65, -0.45).normalize();
    fitSunShadow(sun, new THREE.Vector3(0, 0, 0), sunDirInit, 60);

    const amb = new THREE.AmbientLight(0x283444, 4.5);
    scene.add(amb);
    DZ3D.amb = amb;

    const fill = new THREE.HemisphereLight(0x353538, 0x222226, 0.85); // regolith ground bounce
    scene.add(fill);
    DZ3D.hemi = fill;

    // 2. Sun Disc and Glare Billboard at astronomical distance (650 km, subtends 0.53 deg)
    const sunDir = new THREE.Vector3(0.55, 0.65, -0.45).normalize();
    const sunDist = 650000;
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(3000, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff9ee, depthWrite: false, toneMapped: false })
    );
    sunDisc.position.copy(sunDir).multiplyScalar(sunDist);
    sunDisc.lookAt(0, 0, 0);
    scene.add(sunDisc);
    DZ3D.sunDisc = sunDisc;

    const dotCanvas = document.createElement('canvas'); dotCanvas.width = dotCanvas.height = 64;
    const dctx = dotCanvas.getContext('2d');
    const dg = dctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    dg.addColorStop(0, 'rgba(255,255,255,1)');
    dg.addColorStop(0.35, 'rgba(255,245,220,0.55)');
    dg.addColorStop(1, 'rgba(255,230,190,0)');
    dctx.fillStyle = dg; dctx.fillRect(0, 0, 64, 64);
    const dotTex = new THREE.CanvasTexture(dotCanvas);
    const glare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dotTex, color: 0xfff5dd, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    }));
    glare.scale.set(28000, 28000, 1);
    glare.position.copy(sunDisc.position);
    scene.add(glare);
    DZ3D.glare = glare;
    DZ3D.dotTex = dotTex;

    // 3. Earth hanging in the black lunar sky (600 km distance, subtends 1.91 deg)
    try {
      const earthTex = new THREE.TextureLoader().load('assets/textures/earth_day.jpg');
      earthTex.colorSpace = THREE.SRGBColorSpace;
      const earthGeo = new THREE.SphereGeometry(10000, 32, 24);
      const earthMat = new THREE.MeshStandardMaterial({
        map: earthTex, roughness: 0.8, metalness: 0, toneMapped: false
      });
      const earthMesh = new THREE.Mesh(earthGeo, earthMat);
      // Position Earth ~14 deg above the horizon in direct line of sight:
      const earthDir = new THREE.Vector3(-0.41, 0.17, -0.90).normalize();
      earthMesh.position.copy(earthDir).multiplyScalar(600000);
      earthMesh.rotation.z = -23.44 * Math.PI / 180;
      scene.add(earthMesh);
      DZ3D.earth = earthMesh;
      DZ3D.earthTex = earthTex;
    } catch (e) {}

    // 4. Uniform Pinpoint Celestial Stars at 700 km (beyond horizon globe, zero terrain clipping)
    const starCount = 2000;
    const starPos = new Float32Array(starCount * 3);
    let sSeed = 1337;
    const sRnd = () => { sSeed = (sSeed * 1664525 + 1013904223) >>> 0; return sSeed / 4294967296; };
    for (let i = 0; i < starCount; i++) {
      const u = sRnd();
      const v = sRnd();
      const theta = u * Math.PI * 2;
      const elev = Math.asin(Math.sqrt(v)); // uniform upper hemisphere
      const r = 700000;
      starPos[i * 3]     = r * Math.cos(elev) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(elev) + 500;
      starPos[i * 3 + 2] = r * Math.cos(elev) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.95, toneMapped: false
    });
    const starPoints = new THREE.Points(starGeo, starMat);
    scene.add(starPoints);
    DZ3D.stars = starPoints;

    // 5. Reflection probe for gold foil and metallic alloy components
    const probe = new THREE.Scene();
    const panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    panelMat.color.setRGB(1200, 1100, 1000);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), panelMat);
    panel.position.set(18, 22, 8);
    panel.lookAt(0, 0, 0);
    probe.add(panel);
    const gndMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    gndMat.color.setRGB(25, 24, 23);
    const gnd = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), gndMat);
    gnd.rotation.x = -Math.PI / 2;
    gnd.position.y = -10;
    probe.add(gnd);
    const pmrem = new THREE.PMREMGenerator(V.renderer);
    const rt = pmrem.fromScene(probe, 0.04);
    scene.environment = rt.texture;
    DZ3D.envTex = rt.texture;
    DZ3D.pmrem = pmrem;
    panel.geometry.dispose(); panelMat.dispose();
    gnd.geometry.dispose(); gndMat.dispose();
  } catch (e) {}

  // 6. Decoded site elevation (inner LOLA patch + 48 km outer LOLA context)
  let siteId = null;
  try {
    siteId = (land && land.site) || ((typeof S !== 'undefined') ? S.site : null) || null;
  } catch (e) {}
  let patch = null, h0 = 0;
  try {
    const P = (typeof SURFACE_PATCHES !== 'undefined') ? SURFACE_PATCHES : (typeof window !== 'undefined' ? window.SURFACE_PATCHES : null);
    if (P && P.sites && siteId && P.sites[siteId]) {
      patch = decodeSite(P.sites[siteId]);
      if (patch && patch._dec) h0 = surfHeightAt(patch, 0, 0);
      else patch = null;
    }
  } catch (e) { patch = null; }
  DZ3D.g0 = 0;

  const R_MOON = 1737000;
  const clamp1 = (v) => v < -1 ? -1 : v > 1 ? 1 : v;
  const D2G = 180 / Math.PI;

  try {
    if (patch) {
      // Decode outer LOLA context first if present to determine unified bounds and enable fringe blending
      let oh = null, on = 200, osz = 48000, opost = 241.2;
      let omn = 1e9, omx = -1e9;
      if (patch.out && patch.out.h) {
        try {
          const bin = atob(patch.out.h), u = new Uint8Array(bin.length);
          for (let bi = 0; bi < bin.length; bi++) u[bi] = bin.charCodeAt(bi);
          oh = new Float32Array(u.buffer);
          on = patch.out.n || 200;
          osz = patch.out.sizeM || 48000;
          opost = osz / (on - 1);
          for (let oi = 0; oi < oh.length; oi++) {
            const eh = oh[oi] - h0;
            if (eh < omn) omn = eh;
            if (eh > omx) omx = eh;
          }
        } catch (e) { oh = null; }
      }

      const outerHeightAt = (x, z) => {
        if (!oh) return 0;
        const fi = (x + osz / 2) / opost;
        const fj = (z + osz / 2) / opost;
        const i0 = Math.max(0, Math.min(on - 2, Math.floor(fi)));
        const j0 = Math.max(0, Math.min(on - 2, Math.floor(fj)));
        const fx = Math.max(0, Math.min(1, fi - i0));
        const fz = Math.max(0, Math.min(1, fj - j0));
        const g00 = oh[j0 * on + i0] - h0;
        const g10 = oh[j0 * on + i0 + 1] - h0;
        const g01 = oh[(j0 + 1) * on + i0] - h0;
        const g11 = oh[(j0 + 1) * on + i0 + 1] - h0;
        return g00 * (1 - fx) * (1 - fz) + g10 * fx * (1 - fz) + g01 * (1 - fx) * fz + g11 * fx * fz;
      };

      const terrainGroup = new THREE.Group();
      terrainGroup.name = 'descent_terrain';

      const groundHeightAt = (x, z) => {
        let relief = 0;
        const r = Math.hypot(x, z);
        if (patch) {
          if (r <= 1500) relief = surfHeightAt(patch, x, z) - h0;
          else if (r < 2300) {
            const w = (r - 1500) / 800, s = w * w * (3 - 2 * w);
            relief = (surfHeightAt(patch, x, z) - h0) * (1 - s) + outerHeightAt(x, z) * s;
          } else relief = outerHeightAt(x, z);
        }
        const flat = Math.min(1, Math.max(0, (r - 15) / 40));
        const microH = (dzFbm(x * 0.05, z * 0.05) * 0.6 + dzFbm(x * 0.4, z * 0.4) * 0.12) * flat;
        const sphereDrop = Math.sqrt(Math.max(0, R_MOON * R_MOON - r * r)) - R_MOON;
        return sphereDrop + relief + microH;
      };

      // 1. UNIFIED CONTINUOUS LUNAR PLANETARY TERRAIN (0 m -> 360 km)
      // Single continuous mesh without seams, square borders, or concentric rings.
      // Orthogonal quad mesh in landing center transitioning to 360 km spherical horizon.
      const terrainGeo = buildContinuousLunarTerrain(patch, h0, outerHeightAt);
      const terrainMat = makeGroundMaterial(V.renderer);
      const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
      terrainMesh.receiveShadow = true;
      scene.add(terrainMesh);
      DZ3D.ground = terrainMesh;
      DZ3D.siteId = siteId;

      // 2. REGOLITH BOULDER FIELD (Smooth normals via mergeVertices, half-buried, albedo matched)
      try {
        const boulderGroup = new THREE.Group();
        boulderGroup.name = 'descent_boulders';
        scatterBoulders(boulderGroup, groundHeightAt, 120, 110);
        scene.add(boulderGroup);
        DZ3D.rocks = boulderGroup;
      } catch (e) {}
    } else {
      // Seamless Fallback Continuous Globe (when no site patch is selected)
      const terrainGeo = buildContinuousLunarTerrain(null, 0, null);
      const terrainMat = makeGroundMaterial(V.renderer);
      const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
      terrainMesh.receiveShadow = true;
      scene.add(terrainMesh);
      DZ3D.ground = terrainMesh;
      DZ3D.globe = null;
      DZ3D.siteId = null;
    }
  } catch (e) { DZ3D.ground = null; }

  // 9. Lander wrap: seated at touchdown datum
  const wrap = new THREE.Group();
  wrap.name = 'descent_lander';
  try {
    const inner = new THREE.Group();
    inner.name = 'lander_seated';
    const box = new THREE.Box3().setFromObject(DZ3D.raw);
    DZ3D.box = box.clone();
    inner.position.y = -box.min.y;
    inner.add(DZ3D.raw.clone(true));
    try { fixLanderMaterials(inner, DZ3D.envTex); } catch (e) {}
    inner.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    wrap.add(inner);
  } catch (e) {}
  wrap.position.set(0, 12000, 0);
  scene.add(wrap);
  DZ3D.wrap = wrap;

  // 10. SUPERSONIC ROCKET DESCENT PLUME (from launch-view shader technology)
  try {
    const plume = makeLmPlumeMesh();
    const plumeGroup = new THREE.Group();
    plumeGroup.position.set(0, 0.9, 0); // descent engine bell mouth
    plumeGroup.add(plume);
    wrap.add(plumeGroup);
    DZ3D.plumeMesh = plume;
    DZ3D.plumeGroup = plumeGroup;
  } catch (e) { DZ3D.plumeMesh = null; }

  // Dynamic warm plume illumination
  try {
    const pl = new THREE.PointLight(0xffa855, 0, 90, 1.8);
    pl.position.set(0, 0.5, 0);
    wrap.add(pl);
    DZ3D.plumeLight = pl;
  } catch (e) { DZ3D.plumeLight = null; }

  // 11. VOLUMETRIC CUMULUS LUNAR DUST & SMOKE POOL (launch-view cumulus banks)
  try {
    const sTex = makeSmokeTexture();
    DZ3D.smokeTex = sTex;
    DZ3D.smokePool = [];
    let seed = 4242;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 70; i++) {
      const sm = new THREE.SpriteMaterial({
        map: sTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false
      });
      const sp = new THREE.Sprite(sm);
      sp.visible = false;
      sp.renderOrder = 3;
      scene.add(sp);
      DZ3D.smokePool.push({ sp, active: false, life: 0, vx: 0, vy: 0, vz: 0, seed: rnd() });
    }
  } catch (e) { DZ3D.smokePool = []; }

  // Fix 4: No stray target marker mesh in the lunar wilderness (eliminated horizon notch artifact)
  DZ3D.marker = null;

  DZ3D.scene = scene;
  DZ3D.camera = camera;
}

function dzDisposeScene() {
  try {
    if (DZ3D.aria && DZ3D.aria.parentNode) DZ3D.aria.parentNode.removeChild(DZ3D.aria);
  } catch (e) {}
  DZ3D.aria = null;
  try {
    if (DZ3D.scene) {
      DZ3D.scene.traverse(o => {
        if (DZ3D.wrap && (o === DZ3D.wrap || (DZ3D.wrap.getObjectById && DZ3D.wrap.getObjectById(o.id)))) return;
        try { if (o.geometry) o.geometry.dispose(); } catch (e) {}
        try {
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
            try { if (m.map) m.map.dispose(); } catch (e) {}
            try { m.dispose(); } catch (e) {}
          });
        } catch (e) {}
      });
    }
  } catch (e) {}
  DZ3D.scene = null; DZ3D.camera = null; DZ3D.wrap = null; DZ3D.ground = null;
  DZ3D.globe = null; DZ3D.outer = null; DZ3D.rocks = null; DZ3D.earth = null;
  DZ3D.sunDisc = null; DZ3D.glare = null; DZ3D.stars = null;
  DZ3D.plumeMesh = null; DZ3D.plumeGroup = null; DZ3D.plumeLight = null;
  DZ3D.smokePool = []; DZ3D.marker = null;
  try { if (DZ3D.smokeTex) DZ3D.smokeTex.dispose(); } catch (e) {}
  try { if (DZ3D.dotTex) DZ3D.dotTex.dispose(); } catch (e) {}
  try { if (DZ3D.earthTex) DZ3D.earthTex.dispose(); } catch (e) {}
  try { if (DZ3D.lrocTex) DZ3D.lrocTex.dispose(); } catch (e) {}
  try { if (DZ3D.envTex) DZ3D.envTex.dispose(); } catch (e) {}
  try { if (DZ3D.pmrem) DZ3D.pmrem.dispose(); } catch (e) {}
  DZ3D.smokeTex = null; DZ3D.dotTex = null; DZ3D.earthTex = null; DZ3D.lrocTex = null;
  DZ3D.envTex = null; DZ3D.pmrem = null;
  try { if (V) V.dz3dOn = false; } catch (e) {}
  DZ3D.t = 0; DZ3D.hold = 0; DZ3D.covered = false;
  DZ3D.camOffset = null; DZ3D.camLookY = 0;
}

function dzDrive3D(dt) {
  if (!DZ._3d || !DZ3D.scene || !DZ3D.camera || !DZ3D.wrap) return;
  const T = DZ3D.T || 10;
  DZ3D.t += Math.min(Math.max(0, dt), 0.1);
  const t = DZ3D.t, u = Math.max(0, Math.min(1.15, t / T));
  const uu = Math.max(0, Math.min(1, u));
  descentCurve(uu, _dc, 12000);
  const h = _dc.h, thr = _dc.throttle;
  const prof = DZ3D.prof || DZ_PROF.balanced;
  const land = DZ3D.land || {};
  const degraded = !!land.degraded;
  const isLanded = uu >= 0.96;
  const effThr = isLanded ? 0 : thr;

  try {
    DZ3D.wrap.position.y = h;
    // Track sun position and direction to spacecraft to maintain crisp, high-contrast illumination & footpad shadows
    if (DZ3D.sun) {
      const sunDir = new THREE.Vector3(0.55, 0.65, -0.45).normalize();
      fitSunShadow(DZ3D.sun, DZ3D.wrap.position, sunDir, 60);
    }
    // Realistic lunar descent pitch angle: retro-braking (55 deg) -> pitchover -> vertical touchdown
    let pitchDeg = 0;
    if (uu < 0.35) {
      pitchDeg = 55 - 20 * (uu / 0.35); // 55 deg -> 35 deg
    } else if (uu < 0.75) {
      const p = (uu - 0.35) / 0.40;
      pitchDeg = 35 - 27 * (p * p * (3 - 2 * p)); // smooth rotation to 8 deg
    } else if (uu < 0.96) {
      const p = (uu - 0.75) / 0.21;
      pitchDeg = 8 * (1 - p); // 8 deg -> 0 deg
    } else {
      pitchDeg = 0;
    }
    const finalSlopeZ = THREE.MathUtils.degToRad(Math.max(-15, Math.min(15, (land && land.slope) || 0)) * 0.5);
    DZ3D.wrap.rotation.x = THREE.MathUtils.degToRad(pitchDeg);
    DZ3D.wrap.rotation.z = (uu >= 0.96) ? finalSlopeZ : finalSlopeZ * (uu / 0.96);
  } catch (e) {}

  // SUPERSONIC DESCENT PLUME DRIVE (shock diamonds & supersonic flame)
  try {
    if (DZ3D.plumeMesh) {
      const pmat = DZ3D.plumeMesh.material;
      pmat.uniforms.uTime.value = performance.now() * 0.001;
      pmat.uniforms.uThrottle.value = effThr;
      DZ3D.plumeMesh.visible = effThr > 0.04;
      const flameLen = Math.max(0.1, effThr);
      DZ3D.plumeMesh.scale.set(1, flameLen, 1);
    }
    if (DZ3D.plumeLight) {
      DZ3D.plumeLight.intensity = 350 * Math.max(0.001, effThr);
    }
  } catch (e) {}

  // BALLISTIC REGOLITH DUST (Apollo physics: high-speed radial sweep hugging the ground)
  try {
    const pool = DZ3D.smokePool;
    if (pool && pool.length) {
      if (h < 50 && effThr > 0.08) {
        const spawnCount = h < 20 ? 3 : 1;
        for (let sc = 0; sc < spawnCount; sc++) {
          for (let i = 0; i < pool.length; i++) {
            const d = pool[i];
            if (!d.active) {
              d.active = true;
              d.life = 1.0;
              const a = d.seed * 6.2832 + (performance.now() * 0.005 % 6.28);
              const speed = 18 + (d.seed * 11 % 1) * 26; // rapid radial sweep across regolith
              d.sp.position.set(DZ3D.wrap.position.x, Math.max(0.12, h * 0.05), DZ3D.wrap.position.z);
              d.vx = Math.cos(a) * speed;
              d.vz = Math.sin(a) * speed;
              d.vy = 0.04 + (d.seed * 19 % 1) * 0.10; // stays low to the ground, never enters sky
              d.sp.scale.set(1.5, 1.5, 1);
              d.sp.visible = true;
              break;
            }
          }
        }
      }
      for (let i = 0; i < pool.length; i++) {
        const d = pool[i];
        if (!d.active) continue;
        d.life -= isLanded ? dt * 4.5 : dt * 1.5;
        if (d.life <= 0) { d.active = false; d.sp.visible = false; d.sp.material.opacity = 0; continue; }
        d.sp.position.x += d.vx * dt;
        d.sp.position.y = Math.max(0.10, d.sp.position.y + d.vy * dt);
        d.sp.position.z += d.vz * dt;
        const grow = 1.5 + (1 - d.life) * 7;
        d.sp.scale.set(grow, grow, 1);
        d.sp.material.opacity = Math.max(0, d.life * 0.32);
      }
    }
  } catch (e) {}

  // RIGID CRAFT-ATTACHED CHASE CAMERA FRAMING
  try {
    const cam = DZ3D.camera;
    const wrapPos = DZ3D.wrap.position;
    let targetOffX, targetOffY, targetOffZ, lookY;

    if (uu < 0.38) {
      // Shot 1: Braking orbit phase (12 km -> 3.5 km)
      // Elevated 3/4 chase view framing the retro-pitched lander against the sweeping lunar craters & curved globe below!
      targetOffX = -15; targetOffY = 5.0; targetOffZ = 18; lookY = 2.0;
    } else if (uu < 0.78) {
      // Shot 2: Pitchover approach (3.5 km -> 300 m)
      // Dynamic tracking angle showing the lander rotating upright, revealing ascent stage, RCS & landing gear
      targetOffX = -12; targetOffY = 3.8; targetOffZ = 15; lookY = 2.0;
    } else if (uu < 0.96) {
      // Shot 3: Terminal vertical descent (300 m -> 2 m)
      // Low dramatic angle tracking the footpads approaching the regolith, shadows connecting, dust blowing radially
      targetOffX = -8; targetOffY = 2.8; targetOffZ = 12; lookY = 2.0;
    } else {
      // Shot 4: Touchdown contact & settled surface vantage point
      // Observer on the lunar soil looking across at the landed spacecraft firmly planted on the Moon!
      targetOffX = -8; targetOffY = 2.2; targetOffZ = 11; lookY = 2.0;
    }

    if (!DZ3D.camOffset) {
      DZ3D.camOffset = { x: targetOffX, y: targetOffY, z: targetOffZ };
      DZ3D.camLookY = lookY;
    } else {
      const k = 1 - Math.exp(-dt * 4.0);
      DZ3D.camOffset.x += (targetOffX - DZ3D.camOffset.x) * k;
      DZ3D.camOffset.y += (targetOffY - DZ3D.camOffset.y) * k;
      DZ3D.camOffset.z += (targetOffZ - DZ3D.camOffset.z) * k;
      DZ3D.camLookY += (lookY - DZ3D.camLookY) * k;
    }

    const shMul = (prof.shakeMul || 1) * (degraded ? 1.5 : 1) * (DZ3D.reduced ? 0.25 : 1);
    const shAmp = isLanded ? 0.003 : 0.08 * shMul * (h < 50 ? 0.5 : 0.25);
    const tw = performance.now() * 0.001;

    cam.position.set(
      wrapPos.x + DZ3D.camOffset.x + Math.sin(tw * 39.7) * shAmp,
      wrapPos.y + DZ3D.camOffset.y + Math.sin(tw * 31.3 + 1.2) * shAmp,
      wrapPos.z + DZ3D.camOffset.z
    );
    cam.lookAt(
      wrapPos.x,
      wrapPos.y + DZ3D.camLookY,
      wrapPos.z
    );
  } catch (e) {}

  // Tape + aria mirror (≤1/s)
  try {
    if (DZ.els && DZ.els.alt) DZ.els.alt.textContent = (h >= 1000 ? (h / 1000).toFixed(2) + ' km' : Math.max(0, h).toFixed(0) + ' m');
    if (DZ.els && DZ.els.vel) {
      const hvel = Math.max(0, 1680 * Math.pow(1 - uu, 1.8));
      const vvel = uu < 0.4 ? (15 + 20 * (uu / 0.4)) : uu < 0.78 ? (35 - 23 * ((uu - 0.4) / 0.38)) : Math.max(1.5, 12 * (1 - (uu - 0.78) / 0.22));
      DZ.els.vel.textContent = 'H:' + (uu >= 0.96 ? '0' : hvel.toFixed(0)) + ' V:−' + (uu >= 0.96 ? '0.0' : vvel.toFixed(1)) + ' m/s';
    }
    if (DZ.els && DZ.els.mode) {
      if (uu >= 0.96) {
        DZ.els.mode.textContent = 'CONTACT';
        DZ.els.mode.style.color = '#5ce6a0';
      } else if (uu >= 0.78) {
        DZ.els.mode.textContent = 'TERMINAL';
        DZ.els.mode.style.color = '#ffb000';
      } else {
        DZ.els.mode.textContent = 'POWERED';
        DZ.els.mode.style.color = '#ffb000';
      }
    }
    const nowA = performance.now();
    if (DZ3D.aria && nowA - (DZ3D.lastAria || 0) > 1000) {
      DZ3D.lastAria = nowA;
      const phaseName = uu < 0.4 ? 'Braking phase' : uu < 0.78 ? 'Pitchover approach' : uu < 0.96 ? 'Terminal descent' : 'Touchdown contact';
      DZ3D.aria.textContent = phaseName + ', altitude ' + Math.max(0, h).toFixed(0)
        + ' metres, time-compressed presentation';
    }
  } catch (e) {}

  // Contact & transition: subtle dust vignette (max 0.28, never blinding the terrain),
  // brief hold on the settled craft, then clean seamless handoff to surface view.
  try {
    if (!DZ3D.covered) {
      const c = Math.max(0, Math.min(1, (t - (T - 0.4)) / 0.4));
      if (DZ.els && DZ.els.dust) DZ.els.dust.style.opacity = (c * 0.28).toFixed(2);
      if (c >= 1) {
        DZ3D.covered = true;
        DZ3D.hold = 0;
        fireBlackout(); // enterSurface swaps the diorama behind clean view
      }
    } else {
      DZ3D.hold += Math.min(Math.max(0, dt), 0.1);
      if (DZ3D.hold >= 0.6) { fireDone(); return; }
    }
  } catch (e) {}
}

/* 3D path entry (C2): consumes the preloaded raw, builds the descent scene,
   drops SKIP (unskippable), hands the frame to dzDrive3D. False → overlay. */
function dzBegin3D() {
  try {
    if (!DZ3D.raw || DZ3D.status !== 'ready') return false;
    try {
      const hostEl = document.getElementById('opsViewport');
      if (hostEl) hostEl.querySelectorAll('.dz-overlay .dz-skip').forEach(n => { try { n.remove(); } catch (e) {} });
    } catch (e) {}
    DZ3D.prof = (DZ.prof && DZ.prof.dur) ? DZ.prof : DZ_PROF.balanced;
    DZ3D.land = DZ.land || null;
    DZ3D.T = DZ3D.prof.dur || 10;
    dzBuildScene(DZ3D.prof, DZ3D.land);
    if (!DZ3D.scene || !DZ3D.wrap) { dzDisposeScene(); return false; }
    // Margin note for the descent log line (low margin → slightly longer hover
    // is expressed as a 10% tail stretch, presentation timing only).
    try {
      if (DZ3D.land && isFinite(DZ3D.land.margin) && DZ3D.land.margin < 1) DZ3D.T *= 1.1;
    } catch (e) {}
    DZ3D.t = 0; DZ3D.hold = 0; DZ3D.covered = false; DZ3D._acc = 0; DZ3D.lastAria = 0;
    try { V.dz3dOn = true; } catch (e) {}
    // Snap camera and offsets immediately so the craft & lunar terrain are instantly framed with zero lag.
    try {
      DZ3D.camOffset = { x: -15, y: 5.0, z: 18 };
      DZ3D.camLookY = 2.0;
      if (DZ3D.camera) {
        const initH = 12000;
        DZ3D.camera.position.set(-15, initH + 5.0, 18);
        DZ3D.camera.lookAt(0, initH + 2.0, 0);
      }
    } catch (e) {}
    return true;
  } catch (e) {
    try { dzDisposeScene(); } catch (_) {}
    return false;
  }
}

/* ── Public API ── */
function setCameraMode(mode) {
  /* Surface contextual mapping (Phase 5): while the diorama owns the frame,
     cockpit = mast-cam, craft = walkaround orbit; any other mode exits the
     surface back to the orbital view it names. HUD buttons keep working. */
  if (V.surfActive && V.surf) {
    if (mode === 'cockpit' || mode === 'mast') {
      V.camMode = 'mast'; V.glide = null;
      V.userInteracted = false;
      try { if (V.controls) V.controls.enabled = false; } catch (e) {}
      if (V.cockpitLook) {
        V.cockpitLook.yaw = 0; V.cockpitLook.pitch = 0; V.cockpitLook.drag = false;
      }
      syncCamButtons('cockpit');
      return;
    }
    if (mode === 'craft' || mode === 'surface') {
      V.camMode = 'surface'; V.glide = null;
      V.userInteracted = false;
      /* Walkaround stays above the horizon: fully-under views read as
         floating (sky behind the rover, shadow detached by perspective). */
      try {
        if (V.controls) {
          V.controls.enabled = true;
          V.controls.maxPolarAngle = 1.535;
        }
      } catch (e) {}
      /* Honest-timelapse entry (T3): keep the current view ray and distance
         (clamped) about the rover instead of yanking the target under a
         static camera — no orientation snap on mode switch. */
      try {
        if (V.surf && V.surf.roverPos && V.controls && V.camera) {
          _tmp.subVectors(V.camera.position, V.controls.target);
          if (_tmp.lengthSq() < 1e-6) _tmp.set(0, 0.3, 1);
          _tmp.normalize();
          const dist = THREE.MathUtils.clamp(
            V.camera.position.distanceTo(V.controls.target), 4, 60);
          V.camera.position.copy(V.surf.roverPos).addScaledVector(_tmp, dist);
          V.controls.target.copy(V.surf.roverPos);
          V.controls.target.y += 1.0;
          V.surfCamAnchor = V.surf.roverPos.clone();
        } else if (V.surf && V.surf.roverPos && V.controls) {
          V.controls.target.copy(V.surf.roverPos);
          V.controls.target.y += 1.0;
        }
      } catch (e) {
        try {
          if (V.surf && V.surf.roverPos && V.controls) {
            V.controls.target.copy(V.surf.roverPos);
            V.controls.target.y += 1.0;
          }
        } catch (e2) {}
      }
      syncCamButtons('craft');
      return;
    }
    exitSurface();
  }
  if (['craft', 'target', 'system', 'free', 'cockpit'].includes(mode)) {
    V.camMode = mode;
    V.userInteracted = false;
    // Cockpit owns the camera (hard-locked eye + gaze); OrbitControls input
    // would fight it, so input stays off until another mode is chosen.
    // Entering cockpit also clears any drag-to-look offsets.
    try { if (V.controls) V.controls.enabled = (mode !== 'cockpit'); } catch (e) {}
    if (mode === 'cockpit' && V.cockpitLook) {
      V.cockpitLook.yaw = 0; V.cockpitLook.pitch = 0; V.cockpitLook.drag = false;
    }
    // Cockpit drives camera.up radially (see updateCamera); every other mode
    // runs on OrbitControls, which is Y-up — restore on exit.
    try { if (V.camera && mode !== 'cockpit') V.camera.up.set(0, 1, 0); } catch (e) {}
    // Cockpit is a rider view: the hull is hidden so no panel, wing or mast
    // can ever swing through the frame (NASA ride-along convention). The eye
    // sits above the true craft position and the orbit ring stays hidden too
    // (see updateTrajectoryGeometry) — planet fills the view.
    try { if (V.craftGroup) V.craftGroup.visible = (mode !== 'cockpit'); } catch (e) {}
    if (mode !== 'free') {
      startCameraGlide(mode);
    } else {
      V.glide = null;
    }
    syncCamButtons(mode);
  }
}

/* Reflect the active mode in the HUD buttons immediately — scrOps only
   renders them on a full screen repaint, so previously the highlighted
   CAM chip lagged one mode behind (COCKPIT lit while already back in
   CRAFT, etc.). */
function syncCamButtons(mode) {
  try {
    const btns = document.querySelectorAll('#opsCamModes .cam-btn');
    btns.forEach(b => {
      if (b.dataset && b.dataset.v) b.classList.toggle('on', b.dataset.v === mode);
    });
  } catch (e) {}
}

function getCameraMode() {
  return V.camMode;
}

function isActive() {
  return V.active;
}

/* Called (guarded) from game.js render() or on module load while on ops screen */
function sync() {
  let host = null;
  try { host = document.getElementById('ops3d-mount'); } catch (e) { host = null; }
  if (!host) {
    if (V.active && V.sceneKind !== 'final') stop();
    return;
  }
  if (V.contextLost) {
    // A lost context looks live (canvas connected, V.active true) but draws
    // nothing. Rebuild from scratch; start() clears the flag on success.
    V.contextLost = false;
    try { stop(); } catch (e) {}
  }
  if (V.canvas && V.canvas.isConnected && V.active && V.sceneKind === 'ops') {
    /* Same-screen re-render (e.g. HUD/day tick rebuilding the DOM around the
       mount): the canvas element survives only if the host node survived.
       game.js refreshOps keeps #ops3d-mount stable, so just re-assert size —
       never restart the scene (that replayed the entry glide + white flash). */
    V.W = 0;
    return;
  }
  const cfg = {
    levelId: (typeof S !== 'undefined' && S.levelId) || 'l1',
    body: (typeof S !== 'undefined' && typeof LEVELS !== 'undefined' && typeof byId === 'function') ? (byId(LEVELS, S.levelId) || {}).body : 'mars'
  };
  start(host, cfg, 'ops');
}

/* Phase 11: final-disposition tableau on the report screen. Reuses start()/update()
   with the recorded end state — no new scene code, no physics, read-only. */
function showFinal() {
  let host = null;
  try { host = document.getElementById('rep3d-mount'); } catch (e) { host = null; }
  if (!host) {
    if (V.active && V.sceneKind === 'final') stop();
    return;
  }
  let key = 'none', body = 'mars', levelId = 'l1';
  try {
    if (typeof S !== 'undefined' && typeof LEVELS !== 'undefined' && typeof byId === 'function') {
      const L = byId(LEVELS, S.levelId);
      levelId = S.levelId || 'l1'; body = (L || {}).body || 'mars';
      const O = S.ops;
      key = levelId + ':' + (O ? O.day : 0) + ':' + ((O && O.dead) ? O.dead.size : 0);
    }
  } catch (e) {}
  if (V.active && V.sceneKind === 'final' && V.finalKey === key) return;
  if (!start(host, { levelId, body }, 'final')) return;
  V.finalKey = key;
  try {
    const L = byId(LEVELS, S.levelId), O = S.ops;
    const D = (typeof derive === 'function') ? derive(S) : null;
    const live = D ? D.instr.filter(i => !(O && O.dead.has(i.id))).length : 1;
    const tot = D ? Math.max(1, D.instr.length) : 1;
    const day = O ? O.day : 0;
    update({
      day, cruise: O ? O.cruise : 1, totalDays: O ? O.totalDays : 1,
      arrived: true, frac: 1, targetKey: body,
      tNow: ((S.launch && S.launch.tDep) || 2029) + day / 365.25,
      mode: L.mode, linkF: 1, healthF: live / tot
    });
  } catch (e) {}
}

/* ── Phase-4 descent illusion overlay ──
   Scripted touchdown theater over the LIVE scene (or plain DOM headless):
   altitude/vertical-velocity tape, braking glow, vibration shake, regolith
   dust blackout at contact. The sim truth is precomputed by game.js
   (resolveLand) — this only reveals it, then calls onDone exactly once.
   Viewpoint handoff: saves the cam mode, pushes to target view for the ride
   down, restores on completion. Skip, pause-immunity (game.js locks spd during
   the beat), mode-exit and ?no3d all converge on one cleanup path. */
const DZ = { active: false, done: false, raf: 0, t0: 0, dur: 6500, onDone: null,
  onBlackout: null, blackoutFired: false, prevMode: null, els: null,
  b: false, d: false, _keyH: null }; // C1: b/d exactly-once guards (spec)
function startDescent(opts) {
  opts = opts || {};
  if (DZ.active) return; // view-owned lock stays first line
  DZ.active = true; DZ.done = false; DZ.b = false; DZ.d = false;
  DZ.onDone = (typeof opts.onDone === 'function') ? opts.onDone : null;
  DZ.onBlackout = (typeof opts.onBlackout === 'function') ? opts.onBlackout : null;
  DZ.blackoutFired = false;
  DZ.t0 = performance.now();
  DZ.el = 0; DZ._lastW = null; // C1 fix: clamped progress clock (see step)
  const host = document.getElementById('opsViewport') || document.body;
  /* Sweep any stranded overlay from an interrupted beat (black-viewport guard:
     a stuck dust layer is opaque and covers the whole scene). */
  try {
    const hostEl = document.getElementById('opsViewport');
    if (hostEl) hostEl.querySelectorAll('.dz-overlay').forEach(n => { try { n.remove(); } catch (e) {} });
  } catch (e) {}
  const box = document.createElement('div');
  box.className = 'dz-overlay';
  box.setAttribute('role', 'status');
  box.setAttribute('aria-label', 'Powered descent visualization');
  box.innerHTML = '<div class="dz-tape"><div class="dz-row"><span>ALT</span><b id="dzAlt">12.00 km</b></div>'
    + '<div class="dz-row"><span>VVEL</span><b id="dzVel">−1600 m/s</b></div>'
    + '<div class="dz-row"><span>MODE</span><b id="dzMode">POWERED</b></div></div>'
    + '<div class="dz-glow"></div><div class="dz-dust"></div>'
    + '<div class="dz-controls">'
    + '<button class="dz-divert-btn" id="dzDivert" type="button" title="Divert thruster guidance to smooth reserve terrain plateau">DIVERT TO RESERVE SITE</button>'
    + '<button class="dz-skip" type="button">SKIP CINEMATIC ▸▸</button>'
    + '</div>';
  try { host.appendChild(box); } catch (e) { dzFinish(); return; }
  DZ.els = { box,
    alt: box.querySelector('#dzAlt'), vel: box.querySelector('#dzVel'),
    mode: box.querySelector('#dzMode'),
    glow: box.querySelector('.dz-glow'), dust: box.querySelector('.dz-dust') };
  const skip = box.querySelector('.dz-skip');
  if (skip) skip.addEventListener('click', () => dzFinish());
  const divert = box.querySelector('#dzDivert');
  if (divert) {
    divert.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        if (DZ.land && !DZ._diverted) {
          DZ._diverted = true;
          DZ.land.slope = Math.max(0.5, DZ.land.slope - 1.2);
          DZ.land.margin = Math.round((DZ.land.margin + 1.2) * 10) / 10;
          divert.textContent = 'DIVERTED TO RESERVE (SLOPE -1.2°) ✓';
          divert.classList.add('diverted');
          if (typeof logLine === 'function') {
            logLine((typeof S !== 'undefined' && S.ops && S.ops.day) || 0, 'Descent guidance: active divert to reserve plateau confirmed.', 'good');
          }
        }
      } catch (err) {}
    });
  }
  // C1 input lock: capture-phase swallow of Esc/Space/Enter for the beat
  // duration (descent must not toggle pause or fire other shortcuts). Removed
  // in fireDone's finally. Phase C descent key capture layers on top of this
  // one; neither calls stopPropagation outside its own active window.
  try {
    if (DZ._keyH) { try { window.removeEventListener('keydown', DZ._keyH, true); } catch (e) {} }
    DZ._keyH = (e) => {
      try {
        if (!DZ.active || DZ.done) return;
        const k = e && e.key;
        // Fallback path: a keyboard user focused on SKIP must still activate
        // it — never swallow events targeted at the button itself.
        if (e && e.target && e.target.classList && e.target.classList.contains('dz-skip')) return;
        if (k === 'Escape' || k === ' ' || k === 'Spacebar' || k === 'Enter') {
          e.preventDefault();
          try { e.stopPropagation(); } catch (_) {}
        }
      } catch (_) {}
    };
    window.addEventListener('keydown', DZ._keyH, true);
  } catch (e) {}
  // C2 decision: 3D path needs L2 + ready lander (read-only S). In-flight load
  // gets ~3 s frame-driven grace on the overlay (SKIP stays live meanwhile);
  // anything else rides the existing skippable overlay. No game.js involved.
  DZ.prof = DZ_PROF.balanced; DZ.land = null; DZ._3d = false; DZ._grace = 0;
  try {
    DZ3D.reduced = (() => {
      try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
      catch (e) { return false; }
    })();
    let land = null;
    try { land = (typeof S !== 'undefined') ? S.landing : null; } catch (e) {}
    const profId = (land && land.profile) || 'balanced';
    DZ.prof = DZ_PROF[profId] || DZ_PROF.balanced;
    DZ.land = land;
    let want3d = false;
    try {
      const lvl = (typeof S !== 'undefined' && S.levelId) || '';
      want3d = (lvl === 'l2') && !/[?&]no3d/.test(location.search);
    } catch (e) {}
    if (want3d && DZ3D.status === 'ready' && DZ3D.raw) {
      if (dzBegin3D()) DZ._3d = true;
    } else if (want3d && DZ3D.status === 'loading') {
      DZ._grace = 3;
    }
  } catch (e) {}
  try {
    if (!DZ._3d && V.active && V.scene && V.camera) {
      DZ.prevMode = V.camMode;
      if (V.camMode !== 'target') setCameraMode('target');
    } else DZ.prevMode = null;
  } catch (e) { DZ.prevMode = null; }
  const step = () => {
    if (!DZ.active || DZ.done) return;
    // C1 fix: clamped progress clock (dt ≤ 0.1 s per frame). A hidden tab
    // pauses (rAF stops → no accumulation → resumes where it stopped); a
    // wedged loop still converges — raw accumulation past dur+4 s forces
    // fireDone. No setTimeout/setInterval anywhere in this sequence.
    const nowMs = performance.now();
    const dtW = (DZ._lastW == null) ? 0 : Math.min(Math.max(0, (nowMs - DZ._lastW) / 1000), 0.1);
    DZ._lastW = nowMs;
    // C2 grace: overlay + SKIP live while the lander finishes loading; a ready
    // lander transitions to 3D (SKIP removed), expiry stays on the overlay.
    if (DZ._grace > 0 && !DZ._3d) {
      DZ._grace -= dtW;
      if (DZ3D.status === 'ready' && DZ3D.raw) {
        if (dzBegin3D()) DZ._3d = true;
        DZ._grace = 0;
      } else if (DZ._grace <= 0) DZ._grace = 0;
    }
    if (DZ._3d) {
      // 3D path: dzDrive3D owns the clock; late watchdog only (own T + 6 s).
      DZ.el = (DZ.el || 0) + dtW * 1000;
      if (DZ.el > (DZ3D.T || 10) * 1000 + 6000) { fireDone(); return; }
      DZ.raf = requestAnimationFrame(step);
      return;
    }
    DZ.el = (DZ.el || 0) + dtW * 1000;
    if (DZ.el > DZ.dur + 4000) { fireDone(); return; }
    const el = Math.min(1, DZ.el / DZ.dur);
    dzPaint(el);
    /* Opaque-dust moment: swap scenes behind the blackout (seamless cut). */
    if (el >= 0.9 && !DZ.blackoutFired) fireBlackout();
    if (el >= 1) { dzFinish(); return; }
    DZ.raf = requestAnimationFrame(step);
  };
  DZ.raf = requestAnimationFrame(step);
}
/* C1 b/d guards (spec): fireBlackout wraps onBlackout (a throw is logged and
   must not block fireDone); fireDone calls fireBlackout first, runs onDone in
   try, and releases DZ.active + the input lock in a finally. O.descentActive
   stays game.js-owned — the view never touches it. */
function fireBlackout() {
  if (DZ.b) return;
  DZ.b = true;
  DZ.blackoutFired = true;
  try { if (typeof DZ.onBlackout === 'function') DZ.onBlackout(); }
  catch (e) { try { console.error('[ops-view] onBlackout threw:', e); } catch (_) {} }
}
function fireDone() {
  if (DZ.d) return;
  DZ.d = true;
  fireBlackout();
  try {
    const cb = DZ.onDone;
    if (typeof cb === 'function') cb();
  } catch (e) {
    try { console.error('[ops-view] onDone threw:', e); } catch (_) {}
  } finally {
    try { if (DZ._keyH) window.removeEventListener('keydown', DZ._keyH, true); } catch (e) {}
    DZ._keyH = null;
    dzCleanup();
    DZ.done = true;
    DZ.active = false;
  }
}
/* Shared cleanup worker: overlay removal, mode restore, ref release. Never
   fires callbacks — fireDone (loud) and cancelDescent (silent) own those. */
function dzCleanup() {
  try { if (DZ.raf) cancelAnimationFrame(DZ.raf); } catch (e) {}
  DZ.raf = 0;
  try {
    if (DZ.els && DZ.els.box && DZ.els.box.parentNode) DZ.els.box.parentNode.removeChild(DZ.els.box);
  } catch (e) {}
  /* Belt-and-braces: no .dz-overlay node may survive cleanup for any reason. */
  try {
    const hostEl = document.getElementById('opsViewport');
    if (hostEl) hostEl.querySelectorAll('.dz-overlay').forEach(n => { try { n.remove(); } catch (e2) {} });
  } catch (e) {}
  try {
    const vp = document.getElementById('opsViewport');
    if (vp) { vp.classList.remove('dz-shake'); vp.style.removeProperty('--dzAmp'); }
  } catch (e) {}
  try {
    if (DZ.prevMode && V.active && V.camMode === 'target') setCameraMode(DZ.prevMode);
  } catch (e) {}
  DZ.prevMode = null; DZ.els = null;
  dzDisposeScene(); // C2: lander/dust/lights/textures freed → baseline memory
}
function dzPaint(el) {
  try {
    const e = 1 - Math.pow(1 - el, 2);
    const h = 12000 * (1 - e);
    if (DZ.els.alt) DZ.els.alt.textContent = (h >= 1000 ? (h / 1000).toFixed(2) + ' km' : Math.max(0, h).toFixed(0) + ' m');
    if (DZ.els.vel) {
      const hvel = Math.max(0, 1680 * Math.pow(1 - el, 1.8));
      const vvel = el < 0.4 ? (15 + 20 * (el / 0.4)) : el < 0.78 ? (35 - 23 * ((el - 0.4) / 0.38)) : Math.max(1.5, 12 * (1 - (el - 0.78) / 0.22));
      DZ.els.vel.textContent = 'H:' + hvel.toFixed(0) + ' V:−' + (el >= 0.98 ? '0.0' : vvel.toFixed(1)) + ' m/s';
    }
    const vp = document.getElementById('opsViewport');
    if (vp) {
      vp.classList.toggle('dz-shake', el > 0.08 && el < 0.92);
      vp.style.setProperty('--dzAmp', (el < 0.5 ? el * 2 : (1 - el) * 2).toFixed(2));
    }
    if (DZ.els.glow) DZ.els.glow.style.opacity = (el < 0.7 ? (0.25 + el * 0.75) : (1 - el) * 3.3).toFixed(2);
    if (DZ.els.dust) DZ.els.dust.style.opacity = el > 0.85 ? (((el - 0.85) / 0.15) * 0.28).toFixed(2) : '0';
  } catch (e) { /* overlay must never break the frame */ }
}
/* Finish (contact) or cancel (skip/exit/headless-cleanup): exactly once.
   silent=true skips onDone (game.js already applied the truth, e.g. exit path
   via finishLanding, or a redundant call). Loud path delegates to fireDone so
   the b/d guards hold under key-mash and click barrage. */
function cancelDescent(silent) {
  if (!DZ.active || DZ.done) return;
  if (!silent) { fireDone(); return; }
  DZ.done = true;
  dzCleanup();
  DZ.active = false;
  DZ.onBlackout = null; DZ.onDone = null;
}
function dzFinish() { fireDone(); }

/* Surface diorama lives in js/surface-view.js (build/update/dispose + sky + rover + drive) — see scenes/07-ops-surface.md. */

/* Game-facing surface entry/exit (game.js contract): bound to this view's state. */
function enterSurface(){ return surfEnterSurface(V); }
function exitSurface(){ surfExitSurface(V); }
export function loadLanderGltf() {
  return dzLoader().loadAsync(LANDER_URL);
}
const OpsView = {
  start,
  stop,
  sync,
  showFinal,
  update,
  setCameraMode,
  getCameraMode,
  isActive,
  startDescent,
  cancelDescent,
  enterSurface,
  exitSurface,
  dzPreload,
  SAT_BEATS,
  satRunnerAllowed,
  runSatBeats,
  cruiseLegibilityDur
};

try { window.OpsView = OpsView; window.__opsV = V; window.__dz3d = DZ3D; window.__dz = DZ; } catch (e) {}
try { sync(); } catch (e) {}

export { OpsView };
