/* MARGIN launch-screen 3D vehicle stage (js/lv-preview.js).
   Progressive enhancement for the LAUNCH VEHICLE FLEET page:
      - builds the SELECTED vehicle with the SAME geometry builder as the ascent
        cinematic (js/launch-view.js `buildModularStack`) — never a second model;
      - renders it inside the SAME LC-39B environment the cinematic uses: the
        vendored env + Mobile Launcher GLBs, the site ground (grass, marsh,
        crawlerway, treeline, ocean), the analytic sky dome, the HYG star field,
        the four measured pad floodlights + lamp housings, the ML tower lamps and
        the distant facility-light field — all built by the cinematic's own
        builders, not copies;
      - cycles through the cinematic's countdown SHOT LIST as a slideshow
        (PAD-WIDE-STATIC → CAPSULE-LOW-UP → ORION-DETAIL-MED → TOWER-TOP-DOWN →
        PAD-WIDE-RETURN → BASE-UP-VERTICAL). Drag to orbit; the slideshow
        resumes from wherever the drag left the camera;
      - owns the COMMIT → cinematic hand-off: the scene expands to fill the
        viewport, then the launch overlay (owned by game.js liftoff) takes over;
      - falls back to a Canvas2D true-scale schematic when WebGL is unavailable.

   Presentation only. It reads no simulation state, writes none, and adds no
   network dependency. The vehicle id/name arrive through the host dataset that
   game.js already renders from S.launch.lv. */

import * as THREE from 'three';
import {
  buildModularStack, LV_STACKS,
  envGltfLoader, ENV_URL, ENV_SCALE, ML_URL,
  ML_M_PER_UNIT, WORLD_M_PER_UNIT, SLAB_TOP_Y, SITE_DECK_Y,
  measureGlbGround, buildSiteGround, buildLampHousings,
  buildPadSpotLights, buildFieldLights, buildTowerLampsFromML,
  buildLightShafts, buildSkyDome, buildRealStars, LAMP_HEADS,
} from './launch-view.js?v=20261107_v3';

const HOST_ID = 'lv3host';
const FOG_DENSITY = 0.0035;      // cinematic pad-level FogExp2 density
// Cinematic night grade is 1.35, tuned for a full-viewport flame-lit image.
// The panel has no flame and a small canvas, so it gets a brighter stop to
// keep the tower structure and pad readable (display grade only).
const EXPOSURE = 2.0;

/* Cinematic countdown cuts (names + order from launch-view.js COUNT_SHOTS).
   The preview frames the same beats on the static pad instead of directing a
   live count — same language, no cinematic state. */
const SHOTS = [
  'PAD-WIDE-STATIC',
  'CAPSULE-LOW-UP',
  'ORION-DETAIL-MED',
  'TOWER-TOP-DOWN',
  'PAD-WIDE-RETURN',
  'BASE-UP-VERTICAL'
];
const SHOT_HOLD_S = 4.4;
// The cinematic cuts between these framings on the beat — no camera move. The
// preview matches that: a cut is a snap. This value only governs the "return to
// the cycle" ease after the user releases a drag (not a shot change).
const SHOT_RESUME_S = 0.6;

const P = {
  host: null, caption: null, renderer: null, scene: null, camera: null,
  rocket: null, lv: null, lvName: '', cfg: null,
  padEnv: null, padML: null, padCtx: null, padLoading: false, padLoaded: false,
  sky: null, stars: null, fieldLights: null, towerLamps: null, beacons: [],
  shafts: [],
  raf: 0, last: 0, angle: 5.35, dist: 24, ty: 6, el: 0.105,
  fitH: 14, fitW: 7, rocketTop: 8, mlTop: 0, groundY: -2.3,
  dragging: false, dragX: 0, dragCurX: 0, dragAngle: 0, auto: true, reduced: false,
  shots: true, shot: { i: 0, t: 0, mode: 'hold', from: null, labeled: -1 },
  look: { x: 0, y: 6, z: 0 },
  obs: null, size: { w: 0, h: 0 }, takeover: null
};

function reducedMotion() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (e) { return false; }
}

/* The cinematic bakes a PMREM probe (bakeEnvProbe) so its GLB metal reads
   correctly. The preview scene has no probe, so unmapped metalness renders
   black; clamp the vendored pad materials to a matte industrial finish
   (display only — geometry and textures untouched). */
function softenGLB(root) {
  const clamp = (mt) => {
    if (!mt) return;
    try {
      if (typeof mt.metalness === 'number' && mt.metalness > 0.35) mt.metalness = 0.35;
      if (typeof mt.roughness === 'number' && mt.roughness < 0.55) mt.roughness = 0.55;
      if (typeof mt.envMapIntensity === 'number') mt.envMapIntensity = 0.35;
    } catch (e) { }
  };
  try {
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (Array.isArray(o.material)) o.material.forEach(clamp);
      else clamp(o.material);
    });
  } catch (e) { }
}

/* ── Canvas2D fallback: true-scale stack schematic (LV_STACKS metres) ── */
function drawSchematic(host, lvId) {
  const cfg = LV_STACKS[lvId] || LV_STACKS.f9;
  const name = P.lvName || lvId;
  host.textContent = '';
  const cv = document.createElement('canvas');
  cv.className = 'lv3canvas lv3canvas-2d';
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', name + ' schematic, true proportion, ' + cfg.h + ' metres tall');
  host.appendChild(cv);
  const hostW = host.clientWidth || 300, hostH = host.clientHeight || 420;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.round(hostW * dpr));
  cv.height = Math.max(1, Math.round(hostH * dpr));
  const x = cv.getContext('2d');
  if (!x) return;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = hostW, H = hostH;
  x.clearRect(0, 0, W, H);

  const m = 46;                       // vertical margin for the height ruler
  const availH = Math.max(40, H - m * 2);
  const scale = availH / cfg.h;       // px per metre (same for every axis)
  const cx = W * 0.5;
  const baseY = H - m;
  const m2 = (v) => v * scale;

  // ground line + grid
  x.strokeStyle = 'rgba(91,155,255,.22)';
  x.lineWidth = 1;
  x.beginPath(); x.moveTo(18, baseY + 0.5); x.lineTo(W - 18, baseY + 0.5); x.stroke();
  x.strokeStyle = 'rgba(91,155,255,.08)';
  x.setLineDash([3, 5]);
  for (let g = 1; g <= 3; g++) {
    const gx = 18 + (W - 36) * g / 4;
    x.beginPath(); x.moveTo(gx, baseY); x.lineTo(gx, baseY - availH); x.stroke();
  }
  x.setLineDash([]);

  const bodyR = m2(cfg.coreD) / 2;
  const s1 = m2(cfg.s1), s2 = m2(cfg.s2);
  const fair = cfg.fair ? m2(cfg.fair[0]) : (cfg.capsule ? m2(cfg.capsule) : 0);
  const fairR = cfg.fair ? m2(cfg.fair[1]) / 2 : bodyR;
  const upR = m2(cfg.upD || cfg.coreD) / 2;

  const shell = 'rgba(214,226,240,.10)';
  const edge = 'rgba(178,204,236,.75)';

  // side cores (Falcon Heavy)
  if (cfg.triple) {
    const off = m2(cfg.coreD * 1.05);
    for (const sx of [-1, 1]) {
      x.fillStyle = shell; x.strokeStyle = edge; x.lineWidth = 1;
      x.beginPath();
      x.rect(cx + sx * off - bodyR, baseY - s1, bodyR * 2, s1);
      x.fill(); x.stroke();
      x.beginPath();
      x.moveTo(cx + sx * off - bodyR, baseY - s1);
      x.lineTo(cx + sx * off, baseY - s1 - bodyR * 1.5);
      x.lineTo(cx + sx * off + bodyR, baseY - s1);
      x.closePath(); x.fill(); x.stroke();
    }
  }

  // solid rocket boosters
  if (cfg.srb && cfg.srb[0] > 0) {
    const n = cfg.srb[0], sh = m2(cfg.srb[1]), rr = m2(cfg.srb[2]) / 2;
    for (let i = 0; i < n; i++) {
      const side = (i % 2 === 0) ? -1 : 1;
      const sx = cx + side * (bodyR + rr + 2);
      x.fillStyle = 'rgba(206,214,226,.16)';
      x.strokeStyle = 'rgba(200,214,232,.8)';
      x.lineWidth = 1;
      x.beginPath(); x.rect(sx - rr, baseY - sh, rr * 2, sh); x.fill(); x.stroke();
      x.beginPath();
      x.moveTo(sx - rr, baseY - sh);
      x.lineTo(sx, baseY - sh - rr * 2.6);
      x.lineTo(sx + rr, baseY - sh);
      x.closePath(); x.fill(); x.stroke();
    }
  }

  // core stage 1
  x.fillStyle = shell; x.strokeStyle = edge; x.lineWidth = 1.2;
  x.beginPath(); x.rect(cx - bodyR, baseY - s1, bodyR * 2, s1); x.fill(); x.stroke();

  // upper stage
  x.beginPath(); x.rect(cx - upR, baseY - s1 - s2, upR * 2, s2); x.fill(); x.stroke();

  // fairing / capsule
  if (fair > 0) {
    const barrel = fair * 0.62, nose = fair - barrel;
    const topY = baseY - s1 - s2;
    x.beginPath(); x.rect(cx - fairR, topY - barrel, fairR * 2, barrel); x.fill(); x.stroke();
    x.beginPath();
    x.moveTo(cx - fairR, topY - barrel);
    x.quadraticCurveTo(cx - fairR * 0.55, topY - barrel - nose * 0.72, cx, topY - fair);
    x.quadraticCurveTo(cx + fairR * 0.55, topY - barrel - nose * 0.72, cx + fairR, topY - barrel);
    x.closePath(); x.fill(); x.stroke();
  }

  // engine bells
  x.strokeStyle = 'rgba(178,204,236,.6)';
  const bells = Math.min(cfg.engines || 1, 5);
  for (let i = 0; i < bells; i++) {
    const t = bells === 1 ? 0 : (i / (bells - 1) - 0.5);
    const bx = cx + t * bodyR * 1.1;
    x.beginPath();
    x.moveTo(bx - bodyR * 0.16, baseY);
    x.lineTo(bx - bodyR * 0.22, baseY + m2(cfg.coreD * 0.14));
    x.lineTo(bx + bodyR * 0.22, baseY + m2(cfg.coreD * 0.14));
    x.lineTo(bx + bodyR * 0.16, baseY);
    x.stroke();
  }

  // height ruler (same scale as the drawing)
  const rx = Math.max(16, cx - fairR - Math.max(m2(cfg.srb[2] || 0) + 24, bodyR + 26));
  x.strokeStyle = 'rgba(140,170,205,.45)';
  x.beginPath(); x.moveTo(rx + 0.5, baseY); x.lineTo(rx + 0.5, baseY - availH); x.stroke();
  x.beginPath(); x.moveTo(rx - 4, baseY - availH); x.lineTo(rx + 5, baseY - availH); x.stroke();
  x.beginPath(); x.moveTo(rx - 4, baseY); x.lineTo(rx + 5, baseY); x.stroke();
  x.save();
  x.translate(rx - 6, baseY - availH * 0.5);
  x.rotate(-Math.PI / 2);
  x.fillStyle = 'rgba(198,214,234,.8)';
  x.font = '10px "IBM Plex Mono", Consolas, monospace';
  x.textAlign = 'center';
  x.fillText(cfg.h.toFixed(1) + ' m', 0, 0);
  x.restore();

  // 2D mode stamp
  x.fillStyle = 'rgba(140,165,195,.55)';
  x.font = '9px "IBM Plex Mono", Consolas, monospace';
  x.textAlign = 'left';
  x.fillText('2D SCHEMATIC · TRUE PROPORTION', 18, 20);
}

/* ── caption overlay (name + verified stack height + current cut) ── */
function makeCaption(host) {
  const cap = document.createElement('div');
  cap.className = 'lv3-cap';
  cap.innerHTML = '<span class="lv3-name"></span><span class="lv3-sub"></span>' +
    '<span class="lv3-shot"></span>';
  host.appendChild(cap);
  P.caption = cap;
  return cap;
}
function setCaption(name, cfg) {
  if (!P.caption) return;
  const n = P.caption.querySelector('.lv3-name');
  const s = P.caption.querySelector('.lv3-sub');
  if (n) n.textContent = (name || P.lv || '').toUpperCase();
  if (s) s.textContent = cfg ? (cfg.h.toFixed(1) + ' m STACK · TRUE PROPORTION') : '';
}
function setShotLabel(i, cut) {
  if (!P.caption) return;
  const el = P.caption.querySelector('.lv3-shot');
  if (!el) return;
  if (!cut) { el.textContent = ''; return; }
  el.textContent = 'SHOT ' + String(i + 1).padStart(2, '0') + ' · ' + SHOTS[i];
}

/* ── environment: the cinematic's own night sky, stars and floodlight rig ── */
function buildEnvironment(scene) {
  scene.background = new THREE.Color(0x010204);
  scene.fog = new THREE.FogExp2(0x02040a, FOG_DENSITY);
  // Ambient wash matches the cinematic's zero-at-night rule with a small
  // preview-only floor so the tower lattice reads in a small canvas.
  scene.add(new THREE.HemisphereLight(0x5a78b0, 0x05070c, 0.10));

  // Measured pad floodlights (same four heads/positions as the ascent
  // cinematic). Slightly hot for the preview because there is no flame key.
  P.padLights = buildPadSpotLights(scene, null);
  for (const s of P.padLights) { try { s.intensity *= 1.45; } catch (e) { } }

  // Analytic dome + HYG stars, both camera-centered (same shaders as the
  // cinematic; the preview has no solar hook, so it renders the night pass).
  P.sky = buildSkyDome(scene, new THREE.Vector3(0.55, -0.25, 0.4));
  const su = P.sky.material.uniforms;
  su.uDayF.value = 0; su.uDens.value = 1; su.uDipY.value = 0; su.uLift.value = 0;

  const pr = Math.min(window.devicePixelRatio || 1, 1.5);
  P.stars = buildRealStars(scene, null, pr);
  P.stars.material.uniforms.uVis.value = 1;
  P.stars.material.uniforms.uDipY.value = 0;

  // Distant facility lights + lamp housings at the measured heads.
  P.fieldLights = buildFieldLights(scene);
  P.fieldLights.visible = true;

  // Volumetric floodlight cones — the same beams the cinematic renders.
  P.shafts = buildLightShafts(scene);
}

/* Load the same vendored pad assets the ascent cinematic uses, at the same
   measured scales, then build the same site ground around them. */
function loadPad() {
  if (!P.scene || P.padLoading || P.padLoaded) return;
  P.padLoading = true;
  P.padErr = null;
  const ctx = {
    scene: P.scene, sun: null, envTex: null, env: [],
    siteGround: null, lampHousings: null
  };
  P.padCtx = ctx;
  try { buildLampHousings(ctx); } catch (e) { }
  let loader = null;
  try { loader = envGltfLoader(); } catch (e) { P.padLoading = false; P.padErr = 'loader: ' + (e && e.message); return; }
  if (!loader) { P.padLoading = false; P.padErr = 'no loader'; return; }

  loader.load(ENV_URL, (gltf) => {
    try {
      if (!P.scene) return;
      const g = gltf.scene || (gltf.scenes && gltf.scenes[0]);
      if (!g) return;
      g.scale.setScalar(ENV_SCALE);
      g.position.y = 1.0;
      g.updateMatrixWorld(true);
      softenGLB(g);
      let m = null;
      try { m = measureGlbGround(g); } catch (e) { m = null; }
      if (m && isFinite(m.groundY)) P.groundY = m.groundY;
      P.scene.add(g);
      P.padEnv = g;
      // Same site ground the cinematic builds (grass/marsh/ocean/treeline/
      // crawlerway). Context form keeps the cinematic's V state untouched.
      try { buildSiteGround(m ? m.R : 18.8, P.groundY, true, ctx); } catch (e) { }
      // Procedural lamp housings supersede the GLB lamp boxes (cinematic rule).
      try {
        if (ctx.lampHousings) {
          g.traverse(o => { if (o.isMesh && o.name === 'env_lamps') o.visible = false; });
        }
      } catch (e) { }
      // Mast-tip beacons snap to the authored nodes (same as the cinematic).
      try {
        const mat = new THREE.MeshBasicMaterial({ color: 0xff2a20 });
        const geo = new THREE.SphereGeometry(0.16, 8, 8);
        for (let i = 0; i < 3; i++) {
          const tip = g.getObjectByName('mast_tip_' + i);
          if (!tip) continue;
          const b = new THREE.Mesh(geo, mat.clone());
          tip.getWorldPosition(b.position);
          b.userData.phase = i * 0.67;
          P.scene.add(b);
          P.beacons.push(b);
        }
        if (!P.beacons.length) geo.dispose();
        mat.dispose(); // beacons use per-instance clones of this material
      } catch (e) { }
      P.padLoaded = true;
      layout(); // reframe now that the measured pad floor is known
    } catch (e) { P.padErr = 'env build: ' + (e && e.message); }
    P.padLoading = false;
  }, undefined, (err) => {
    P.padLoading = false;
    P.padErr = 'env: ' + (err && (err.message || err));
    try { if (P.scene && !P.padLoaded) buildSiteGround(18.8, P.groundY, false, ctx); } catch (e) { }
  });

  loader.load(ML_URL, (gltf) => {
    try {
      if (!P.scene) return;
      const g = gltf.scene || (gltf.scenes && gltf.scenes[0]);
      if (!g) return;
      g.scale.setScalar(ML_M_PER_UNIT / WORLD_M_PER_UNIT);
      g.position.set(0, SLAB_TOP_Y, 0); // base flush on the slab (cinematic rule)
      g.updateMatrixWorld(true);
      softenGLB(g);
      try {
        const mb = new THREE.Box3().setFromObject(g);
        if (isFinite(mb.max.y)) P.mlTop = mb.max.y;
      } catch (e) { }
      P.scene.add(g);
      P.padML = g;
      // Tower lamp dots up the ML faces (measured from the loaded geometry).
      try {
        P.towerLamps = buildTowerLampsFromML(g, P.scene);
        if (P.towerLamps) P.towerLamps.visible = true;
      } catch (e) { }
      layout(); // reframe to include the tower top
    } catch (e) { P.padErr = 'ml build: ' + (e && e.message); }
  }, undefined, (err) => { P.padErr = 'ml: ' + (err && (err.message || err)); });
}

/* ── framing: seat the whole pad + the selected stack in the panel ── */
function layout() {
  if (!P.camera || !P.size.w || !P.size.h) return;
  // Frame the pad floor and the full stack together: the view must read as
  // the launch area, not a catalogue shot. Ground level comes from the loaded
  // env GLB, so this is recomputed when that arrives.
  // Margin covers the ML tower standing nearer the camera than the pad axis
  // (it sits east of centre, so it magnifies slightly against the fit plane).
  const topY = Math.max(P.rocketTop, P.mlTop || 0) + 0.9;
  const bottomY = P.groundY - 0.15;
  P.fitH = Math.max(topY - bottomY, 11);
  P.ty = (topY + bottomY) / 2;
  const aspect = P.size.w / P.size.h;
  const baseFov = 38; // framing is defined on the wide-shot lens, never the
  // current cut's fov (a long lens must not zoom the fit out)
  const vfov = baseFov * Math.PI / 180;
  const tanV = Math.tan(vfov / 2);
  const tanH = tanV * aspect;
  const distV = (P.fitH / 2) / Math.max(tanV, 1e-6);
  const distH = (P.fitW / 2) / Math.max(tanH, 1e-6);
  // Height always fits (pad width crops naturally, like a pad camera). The
  // width term only guards the VEHICLE against side cropping in narrow panels;
  // P.fitW is the stack width, never the pad width, so a tall column still
  // fills its height instead of zooming out to show empty apron.
  P.dist = Math.max(distV, distH) * 1.02;
  P.camera.aspect = aspect;
  P.camera.updateProjectionMatrix();
  if (!P.shots && !P.dragging) orbit();
}

function orbit() {
  const cam = P.camera;
  if (!cam) return;
  const a = P.angle, d = P.dist, ty = P.ty, el = P.el;
  const ce = Math.cos(el), se = Math.sin(el);
  cam.position.set(Math.sin(a) * d * ce, ty + se * d, Math.cos(a) * d * ce);
  cam.lookAt(0, ty, 0);
  P.look.x = 0; P.look.y = ty; P.look.z = 0;
}

/* ── cinematic shot slideshow (same cut names/order as COUNT_SHOTS) ── */
function shotPose(i) {
  const top = P.rocketTop || 8;
  const gy = P.groundY || -2.3;
  const deck = SITE_DECK_Y; // ML deck: the stack's own base (never the apron)
  const tower = P.mlTop || top + 3;
  const d = P.dist || 20;
  const ty = P.ty || (top + gy) / 2;
  const A = P.angle;
  const ce = Math.cos(P.el), se = Math.sin(P.el);
  const ring = (a, dist, el) => ({
    x: Math.sin(a) * dist * Math.cos(el),
    y: ty + Math.sin(el) * dist,
    z: Math.cos(a) * dist * Math.cos(el)
  });
  switch (i) {
    case 1: { // CAPSULE-LOW-UP — from the deck, looking up the stack
      const dist = Math.max(7, d * 0.62);
      const p = ring(A, dist, 0.02);
      return { px: p.x, py: deck + 1.1, pz: p.z, lx: 0, ly: top * 0.94, lz: 0, fov: 42 };
    }
    case 2: { // ORION-DETAIL-MED — long lens on the upper stage
      const dist = Math.max(10, d * 0.62);
      const p = ring(A + 0.28, dist, 0.08);
      return { px: p.x, py: top * 0.86 + 1.2, pz: p.z, lx: 0, ly: top * 0.80, lz: 0, fov: 15 };
    }
    case 3: { // TOWER-TOP-DOWN — from the ML crown, looking down the pad
      // Keep x/z safely clear of the left console column
      return { px: 4.8, py: tower + 1.1, pz: 6.2, lx: 0.6, ly: top * 0.74, lz: 0, fov: 48 };
    }
    case 4: { // PAD-WIDE-RETURN — pull back on the establishing side, a little
      // higher, so the pad floor, lamps and tower all read together
      const p = ring(A - 0.14, d * 1.06, Math.max(0.17, P.el + 0.06));
      return { px: p.x, py: p.y, pz: p.z, lx: 0, ly: ty * 0.98, lz: 0, fov: 41 };
    }
    case 5: { // BASE-UP-VERTICAL — low and close at the engine bells
      const dist = Math.max(5, d * 0.34);
      const p = ring(A, dist, -0.02);
      return { px: p.x, py: deck + 0.7, pz: p.z, lx: 0, ly: top * 0.70, lz: 0, fov: 52 };
    }
    default: { // PAD-WIDE-STATIC — the establishing pad frame
      const p = ring(A, d * 1.0, P.el);
      return { px: p.x, py: p.y, pz: p.z, lx: 0, ly: ty, lz: 0, fov: 38 };
    }
  }
}

function applyPose(p, fov) {
  const cam = P.camera;
  if (!cam) return;
  cam.position.set(p.px, p.py, p.pz);
  cam.lookAt(p.lx, p.ly, p.lz);
  P.look.x = p.lx; P.look.y = p.ly; P.look.z = p.lz;
  if (fov != null && Math.abs(cam.fov - fov) > 0.01) {
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }
}

function currentPose() {
  const cam = P.camera;
  return {
    px: cam.position.x, py: cam.position.y, pz: cam.position.z,
    lx: P.look.x, ly: P.look.y, lz: P.look.z, fov: cam.fov
  };
}

function smoothstep(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

function cameraUpdate(dt) {
  if (!P.camera) return;
  if (P.dragging) { orbit(); return; }
  if (!P.shots || P.reduced) { orbit(); return; }
  const s = P.shot;
  s.t += dt;
  const to = shotPose(s.i);
  if (s.mode === 'ease' && s.from) {
    // Only used to rejoin the cycle after a drag/resize — never between shots.
    const k = smoothstep(s.t / SHOT_RESUME_S);
    const f = s.from;
    applyPose({
      px: f.px + (to.px - f.px) * k,
      py: f.py + (to.py - f.py) * k,
      pz: f.pz + (to.pz - f.pz) * k,
      lx: f.lx + (to.lx - f.lx) * k,
      ly: f.ly + (to.ly - f.ly) * k,
      lz: f.lz + (to.lz - f.lz) * k
    }, f.fov + (to.fov - f.fov) * k);
    if (s.t >= SHOT_RESUME_S) { s.mode = 'hold'; s.t = 0; s.from = null; }
    return;
  }
  // Hard cut: the pose is applied exactly, with no interpolation. The cut lands
  // on the frame the previous hold expires.
  applyPose(to, to.fov);
  if (P.shot.labeled !== s.i) { P.shot.labeled = s.i; setShotLabel(s.i, true); }
  if (s.t >= SHOT_HOLD_S) {
    s.i = (s.i + 1) % SHOTS.length;
    s.t = 0;
    s.from = null;
    P.shot.labeled = s.i;
    setShotLabel(s.i, true);
    const next = shotPose(s.i);
    applyPose(next, next.fov); // cut now, not next frame
  }
}

/* Resume the slideshow smoothly from the camera's current pose (after a drag
   or a resize). */
function resumeShots() {
  if (!P.shots || P.reduced) return;
  const s = P.shot;
  s.from = currentPose();
  s.t = 0;
  s.mode = 'ease';
}

function measure() {
  const host = P.host;
  if (!host) return;
  // Clamp: a stylesheet-less canvas can otherwise feed its own attribute size
  // back through the ResizeObserver. No panel is legitimately this large.
  const w = Math.max(1, Math.min(4096, host.clientWidth || 1));
  const h = Math.max(1, Math.min(4096, host.clientHeight || 1));
  if (w === P.size.w && h === P.size.h) return;
  P.size.w = w; P.size.h = h;
  if (P.renderer) {
    P.renderer.setSize(w, h, false);
    layout();
  }
}

function disposeTree(root, disposeTextures) {
  if (!root) return;
  try {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      mats.forEach((mt) => {
        try {
          if (disposeTextures && mt) {
            ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap'].forEach((k) => {
              if (mt[k] && mt[k].dispose) mt[k].dispose();
            });
          }
          mt.dispose();
        } catch (e) { }
      });
    });
  } catch (e) { }
}

function clearModel() {
  if (P.rocket && P.scene) {
    P.scene.remove(P.rocket);
    // Textures are NOT disposed: the builder caches normal maps inside
    // launch-view.js and shares them with the ascent cinematic.
    disposeTree(P.rocket, false);
  }
  P.rocket = null;
  P.lv = null;
}

function clearPad() {
  // GLB textures belong to this load → dispose. Shared procedural textures
  // (ground grain, dot sprite) are cached inside launch-view.js and must NOT
  // be disposed here.
  // Cached GLTF models share geometries/textures with the launch view; do NOT dispose textures/geometries
  if (P.padEnv && P.scene) { P.scene.remove(P.padEnv); disposeTree(P.padEnv, false); }
  if (P.padML && P.scene) { P.scene.remove(P.padML); disposeTree(P.padML, false); }
  if (P.padCtx) {
    if (P.padCtx.siteGround && P.scene) { P.scene.remove(P.padCtx.siteGround); disposeTree(P.padCtx.siteGround, false); }
    if (P.padCtx.lampHousings && P.scene) { P.scene.remove(P.padCtx.lampHousings); disposeTree(P.padCtx.lampHousings, false); }
  }
  if (P.fieldLights && P.scene) { P.scene.remove(P.fieldLights); disposeTree(P.fieldLights, false); }
  if (P.towerLamps && P.scene) { P.scene.remove(P.towerLamps); disposeTree(P.towerLamps, false); }
  for (const b of P.beacons) { try { P.scene.remove(b); b.geometry.dispose(); b.material.dispose(); } catch (e) { } }
  P.beacons = [];
  P.padEnv = null; P.padML = null; P.padCtx = null;
  P.fieldLights = null; P.towerLamps = null;
  P.padLoaded = false; P.padLoading = false;
}

function setVehicle(lvId, name) {
  lvId = lvId || 'f9';
  P.lvName = name || P.lvName;
  const cfg = LV_STACKS[lvId] || LV_STACKS.f9;
  P.cfg = cfg;
  if (!P.renderer) { // Canvas2D fallback path
    P.lv = lvId;
    if (P.host) drawSchematic(P.host, lvId);
    return;
  }
  clearModel();
  let root = null;
  try { root = buildModularStack(lvId, null); } catch (e) { root = null; }
  if (!root) {
    const host = P.host;
    try { P.renderer.dispose(); } catch (e) { }
    try { P.renderer.domElement.remove(); } catch (e) { }
    P.renderer = null;
    P.lv = lvId;
    if (host) drawSchematic(host, lvId);
    return;
  }
  // buildModularStack already applies the fixed site scale (SITE_VK) and seats
  // the stack on the fixed deck (SITE_DECK_Y). Do not re-normalise: the pad is
  // the frame of reference now, so vehicles read at true relative height.
  P.scene.add(root);
  P.rocket = root;
  P.lv = lvId;
  try {
    const box = new THREE.Box3().setFromObject(root);
    P.rocketTop = box.max.y;
    P.fitW = Math.max((box.max.x - box.min.x) + 3.5, 6.5);
  } catch (e) { }
  if (!P.caption && P.host) makeCaption(P.host);
  setCaption(name, cfg);
  layout();
}

/* ── Stage light reactivity for selective UI components (.lv.on) ── */
const _lampPos = new THREE.Vector3(5.62, 4.20, 4.45); // Primary Key Pad Floodlight (LAMP_HEADS[0])
const _lampScr = new THREE.Vector3();
let _lastLightUpdate = 0;

function updateStageLightsUI() {
  if (!P.camera) return;
  const now = performance.now();
  if (now - _lastLightUpdate < 30) return; // ~30 fps update cap
  _lastLightUpdate = now;

  const w = window.innerWidth || 1920;
  const h = window.innerHeight || 1080;

  _lampScr.copy(_lampPos).project(P.camera);
  const isFront = _lampScr.z <= 1.0;
  let lightPx = isFront ? (_lampScr.x * 0.5 + 0.5) * w : (-_lampScr.x * 0.5 + 0.5) * w;
  let lightPy = isFront ? (-_lampScr.y * 0.5 + 0.5) * h : (_lampScr.y * 0.5 + 0.5) * h;

  // Selectively target ONLY selected items: .lv.on
  const target = document.querySelector('.lv-list-panel .lv.on');
  if (target) {
    const r = target.getBoundingClientRect();
    if (r.width > 0) {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = lightPx - cx;
      const dy = lightPy - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const ndx = dx / dist;
      const ndy = dy / dist;

      const posX = 50 + ndx * 45;
      const posY = 50 + ndy * 45;

      target.style.setProperty('--sun-pos-x', posX.toFixed(1) + '%');
      target.style.setProperty('--sun-pos-y', posY.toFixed(1) + '%');
      target.style.setProperty('--sun-dx', ndx.toFixed(3));
      target.style.setProperty('--sun-dy', (-ndy).toFixed(3));
      target.style.setProperty('--sun-intensity', '0.75');
    }
  }
}

/* ── render loop ── */
function tick(now) {
  P.raf = requestAnimationFrame(tick);
  const dt = P.last ? Math.min(0.05, (now - P.last) / 1000) : 0;
  P.last = now;
  if (!P.renderer || !P.scene || !P.camera) return;
  if (P.dragging) {
    P.angle = P.dragAngle + (P.dragX - P.dragCurX) * 0.008;
  }
  cameraUpdate(dt);
  updateStageLightsUI();
  // Sky + stars ride the camera (zero parallax); beacons blink at night.
  if (P.sky) P.sky.position.copy(P.camera.position);
  if (P.stars) P.stars.position.copy(P.camera.position);
  if (P.beacons.length) {
    for (const b of P.beacons) {
      const ph = ((now / 1000) * 0.9 + (b.userData.phase || 0)) % 1;
      b.visible = ph < 0.55;
    }
  }
  P.renderer.render(P.scene, P.camera);
}

function observe(host) {
  if (P.obs) { try { P.obs.disconnect(); } catch (e) { } }
  try {
    P.obs = new ResizeObserver(() => measure());
    P.obs.observe(host);
  } catch (e) { P.obs = null; }
}

/* ── start / stop ── */
function start(host) {
  stop();
  P.host = host;
  try { host.textContent = ''; } catch (e) { }   // drop the 2D placeholder
  P.reduced = reducedMotion();
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { renderer = null; }
  if (!renderer) {
    try { renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true }); } catch (e) { renderer = null; }
  }
  if (!renderer || !renderer.getContext) {
    P.renderer = null;
    if (host) {
      P.lv = host.dataset.lv || 'f9';
      P.lvName = host.dataset.name || '';
      drawSchematic(host, P.lv);
    }
    return false;
  }
  P.renderer = renderer;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  const cv = renderer.domElement;
  cv.className = 'lv3canvas';
  cv.style.width = '100%';
  cv.style.height = '100%';
  cv.style.display = 'block';
  cv.setAttribute('role', 'img');
  host.appendChild(cv);

  const scene = new THREE.Scene();
  P.scene = scene;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.2, 900);
  P.camera = camera;
  scene.add(camera);

  buildEnvironment(scene);

  makeCaption(host);
  observe(host);
  measure();
  loadPad();
  setVehicle(host.dataset.lv || 'f9', host.dataset.name || '');
  P.shot = { i: 0, t: 0, mode: 'hold', from: null, labeled: -1 };
  P.shots = true;
  P.last = 0;
  P.raf = requestAnimationFrame(tick);

  // pointer drag = manual orbit. Horizontal drag follows the pointer: the
  // scene rotates WITH the drag, so camera azimuth runs opposite the delta.
  cv.style.touchAction = 'pan-y';
  cv.addEventListener('pointerdown', (e) => {
    P.dragging = true; P.dragX = e.clientX; P.dragCurX = e.clientX; P.dragAngle = P.angle;
    if (P.camera && P.camera.fov !== 38) { P.camera.fov = 38; P.camera.updateProjectionMatrix(); }
    try { cv.setPointerCapture(e.pointerId); } catch (err) { }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!P.dragging) return;
    P.dragCurX = e.clientX;
  });
  const endDrag = () => {
    if (!P.dragging) return;
    P.dragging = false;
    resumeShots();
  };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', () => { if (P.dragging) endDrag(); });
  return true;
}

function stop() {
  if (P.raf) { cancelAnimationFrame(P.raf); P.raf = 0; }
  if (P.obs) { try { P.obs.disconnect(); } catch (e) { } P.obs = null; }
  clearModel();
  clearPad();
  if (P.sky) { try { P.scene.remove(P.sky); P.sky.geometry.dispose(); P.sky.material.dispose(); } catch (e) { } P.sky = null; }
  if (P.stars) { try { P.scene.remove(P.stars); P.stars.geometry.dispose(); P.stars.material.dispose(); } catch (e) { } P.stars = null; }
  // Shaft cones + their sprites; shared flare texture/material live in
  // launch-view.js, so textures are not disposed here.
  for (const sh of P.shafts) { try { P.scene.remove(sh); } catch (e) { } disposeTree(sh, false); }
  P.shafts = [];
  if (P.padLights) {
    for (const s of P.padLights) {
      try { P.scene.remove(s); P.scene.remove(s.target); s.dispose(); } catch (e) { }
    }
    P.padLights = null;
  }
  if (P.renderer) {
    try { P.renderer.dispose(); } catch (e) { }
    try { if (P.renderer.domElement.parentNode) P.renderer.domElement.parentNode.removeChild(P.renderer.domElement); } catch (e) { }
    P.renderer = null;
  }
  if (P.takeover) { try { P.takeover.remove(); } catch (e) { } P.takeover = null; }
  if (P.caption) { try { P.caption.remove(); } catch (e) { } P.caption = null; }
  P.scene = null; P.camera = null; P.host = null;
  P.size.w = P.size.h = 0;
  P.dragging = false; P.auto = true;
  P.groundY = -2.3; P.mlTop = 0;
  P.beacons = [];
}

/* ── sync with the live screen (host may be rebuilt by a full repaint) ── */
function sync() {
  // Mid-hand-off: leave the expanding takeover alone. A repaint during the
  // 820 ms hand-off must not yank the scene back into the page column.
  if (P.takeover) return;
  const host = document.getElementById(HOST_ID);
  if (!host) { if (P.host || P.raf) stop(); return; }
  if (P.host !== host) {
    stop();
    if (!start(host)) { P.host = host; return; }
  }
  const lv = host.dataset.lv || 'f9';
  const name = host.dataset.name || '';
  if (lv !== P.lv) setVehicle(lv, name);
  else if (name && name !== P.lvName) { P.lvName = name; setCaption(name, P.cfg); }
  if (!P.raf && P.renderer) { P.last = 0; P.raf = requestAnimationFrame(tick); }
}

/* ── COMMIT hand-off: the scene expands to full screen, then the launch
   overlay (created by game.js liftoff) covers it. If the preview is not live
   the callback runs immediately so commit never depends on the 3D layer. ── */
function takeoff(done) {
  const host = P.host;
  if (!P.renderer || !host || !host.isConnected) { if (done) done(); return; }

  // 3D environment is already full-bleed background on screen.
  // Lock slideshow and align camera cleanly to Shot 0 (PAD-WIDE-STATIC)
  P.auto = false;
  P.shots = false;
  P.angle = 5.2;

  // Fade out UI columns on the launch page so the 3D scene smoothly transitions
  try {
    const launchGrid = document.querySelector('.launchgrid');
    if (launchGrid) {
      launchGrid.style.transition = 'opacity 0.35s ease';
      launchGrid.style.opacity = '0';
    }
  } catch (e) { }

  setTimeout(() => {
    // Stop preview render loop first so WebGL context resources do not fight launch cinematic
    stop();
    try { if (done) done(); } catch (e) { }
  }, 300);
}

const LVPreview = { sync, start, setVehicle, stop, takeoff };
// Diagnostics hook (read-only; used by QA to confirm what the panel actually
// built — environment assets, measured anchors, current shot).
LVPreview.debug = () => ({
  live: !!P.renderer, lv: P.lv, name: P.lvName,
  padEnv: !!P.padEnv, padML: !!P.padML, towerLamps: !!P.towerLamps,
  padLoading: P.padLoading, padErr: P.padErr || null,
  siteGround: !!(P.padCtx && P.padCtx.siteGround),
  lampHousings: !!(P.padCtx && P.padCtx.lampHousings),
  fieldLights: !!P.fieldLights, sky: !!P.sky, stars: !!P.stars,
  groundY: P.groundY, mlTop: P.mlTop, rocketTop: P.rocketTop,
  dist: P.dist, ty: P.ty, fitH: P.fitH,
  shot: { i: P.shot.i, mode: P.shot.mode, t: +P.shot.t.toFixed(2), fov: P.camera ? P.camera.fov : null },
  cam: P.camera ? [+P.camera.position.x.toFixed(2), +P.camera.position.y.toFixed(2), +P.camera.position.z.toFixed(2)] : null,
  children: P.scene ? P.scene.children.length : 0,
  size: { w: P.size.w, h: P.size.h }
});
try { window.LVPreview = LVPreview; } catch (e) { }

export { LVPreview };
