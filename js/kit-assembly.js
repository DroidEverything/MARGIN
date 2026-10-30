/* MARGIN shared spacecraft composer (js/kit-assembly.js).
   The ONE authoritative builder of the player's craft, used by both the build
   bay (js/view3d.js: renderer + highlight + framing) and ops (js/ops-view.js:
   fixed symbolic size + label + scan beam). No second implementation.
   Side-effect-free module: no renderer, no DOM at import, no globals.
   Selection is an explicit object — never reads game state:
     sel = { n, power, comms, prop, instr[] }.
   Sources (vendored static, NASA-only):
     NASA 3D Resources hero models (aqua, lro, mro, osiris_rex, voyager)
     Procedural aerospace subsystem assemblies
     Per-level rover assets (perseverance, rassor)
   Origin: NASA 3D Resources (public domain per NASA media guidelines).
   All 9 kit GLBs use KHR_draco_mesh_compression — decoded by the vendored
   static three r160 decoder (vendor/draco/, no network). Parsed GLBs are
   cached per URL; every assembly clones (shares geometry, own transforms).
   Tiers: body 1/2/3 by instrument count (<=2 / 3-5 / 6+); wings 1/2/3 by
   power class; radio 1/2/3 by comms class. Within-tier size factors keep
   every option visually distinct (representative illustration).
   Instruments have no per-unit NASA CAD: generic procedural glyphs shaped by
   instrument group (representative, never flight hardware). Propulsion maps
   to a procedural engine block (kit ships no engine parts). */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/DRACOLoader.js';

export const KIT = {
  bodies: [
    'models/nasa/satellite_kit_body_1.glb',
    'models/nasa/satellite_kit_body_2.glb',
    'models/nasa/satellite_kit_body_3.glb'
  ],
  wings: [
    'models/nasa/satellite_kit_wings_1.glb',
    'models/nasa/satellite_kit_wings_2.glb',
    'models/nasa/satellite_kit_wings_3.glb'
  ],
  radios: [
    'models/nasa/satellite_kit_radio_1.glb',
    'models/nasa/satellite_kit_radio_2.glb',
    'models/nasa/satellite_kit_radio_3.glb'
  ],
  fallback: 'models/margin_mission_bus.glb' // original MARGIN bus (not NASA)
};

let _draco = null;
function draco() {
  if (!_draco) {
    _draco = new DRACOLoader();
    try { _draco.setDecoderPath('vendor/draco/'); } catch (e) {}
  }
  return _draco;
}

/* Parsed-GLB cache: one network fetch + Draco decode per URL per session. */
const _cache = new Map();
export function loadKitGltf(url) {
  if (!_cache.has(url)) {
    _cache.set(url, new Promise((resolve, reject) => {
      const l = new GLTFLoader();
      try { l.setDRACOLoader(draco()); } catch (e) {}
      l.load(url, resolve, undefined, reject);
    }));
  }
  return _cache.get(url);
}

/* --- hero craft: single-piece NASA flown-mission models per fixed mission ---
   Fixed missions fly their real NASA hero; free-design levels (l1/sbx) fly the
   player's modular kit build. Sim is untouched — this only selects the mesh.
   Fallback chain everywhere: hero -> kit assembly -> margin bus -> marker. */
export const HERO_BY_LEVEL = {
  l2: { url: 'models/nasa/lro.glb', assetId: 'LRO-A', why: 'Lunar orbiter for lunar polar mission' },
  l3: { url: 'models/nasa/mro.glb', assetId: 'MRO-A', why: 'Mars orbiter for Mars relay mission' },
  l4: { url: 'models/nasa/osiris_rex.glb', assetId: 'OSIRIS-REX', why: 'Sample-return probe for asteroid TAG mission' },
  l5: { url: 'models/nasa/voyager.glb', assetId: 'VOYAGER-A', why: 'Outer-system flyby heritage for Europa tour' },
  l1: null, sbx: null // kit build: your design
  // spares (viewer-available, unassigned): juno, maven, messenger
};
export function heroForLevel(levelId) {
  try { return HERO_BY_LEVEL[levelId] || null; } catch (e) { return null; }
}
/* Normalize a loaded hero GLB clone into a reliably renderable craft.
   Repairs common vendor-GLB visibility killers WITHOUT changing geometry:
   - owns materials (clones) so the parsed-GLB cache stays pristine,
   - lifts pure-black untextured PBR base colors to dark gray (large black
     parts render black-on-black under the dim space rig — the "invisible
     Quiet Side" look) while keeping the author's gold/silver/bronze hues
     untouched (no global tint wash — the brown/rust cast came from a warm
     multiply over every hero texture),
   - forces fully-transparent shells (opacity ~0) back to opaque,
   - double-sides thin panels so dishes/arrays never vanish from behind,
   - disables frustum culling per mesh (authoring-time bounds + recentered
     parents otherwise cull the craft at close zoom),
   - guarantees a non-empty group: a wireframe marker box fallback instead
     of an invisible craft when the GLB carries no meshes at all. */
export function normalizeHero(group) {
  const out = (group && group.isObject3D) ? group : new THREE.Group();
  try {
    let meshes = 0;
    out.traverse(o => {
      if (!o.isMesh) return;
      meshes++;
      try { o.frustumCulled = false; } catch (e) {}
      try { o.castShadow = false; o.receiveShadow = false; } catch (e) {}
      try {
        const owns = (m) => {
          const c = m.clone();
          if (!c.emissive) c.emissive = new THREE.Color(0x000000);
          return c;
        };
        o.material = Array.isArray(o.material) ? o.material.map(owns) : (o.material ? owns(o.material) : o.material);
      } catch (e) {}
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) {
        if (!m) continue;
        try {
          if (m.transparent && (m.opacity === 0 || m.opacity < 0.03)) { m.transparent = false; m.opacity = 1; }
          if (m.alphaTest > 0.9) m.alphaTest = 0;
          if (m.side === THREE.FrontSide) m.side = THREE.DoubleSide;
          if (m.color && !m.map && m.color.r < 0.02 && m.color.g < 0.02 && m.color.b < 0.02) m.color.setHex(0x232830);
          if (m.needsUpdate !== undefined) m.needsUpdate = true;
          /* MRO-class heroes carry WebP base-color textures: three r160's
             bundled WebP path can leave the map blank on some drivers, which
             drops the whole craft to its warm material tint (the "rusty
             Mars" look) or to black. Fall back to a neutral light-gray base
             whenever the map failed to decode to readable pixels. */
          try {
            if (m.map && m.map.image !== undefined &&
              (!m.map.image || m.map.image.width === 0 || m.map.image.width === undefined)) {
              if (m.color) m.color.setHex(0xb9c1cb);
            }
          } catch (e4) {}
        } catch (e) {}
      }
    });
    if (!meshes) {
      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.6, 1),
        new THREE.MeshBasicMaterial({ color: 0x9fb4cc, wireframe: true }));
      marker.name = 'hero_empty_fallback';
      try { marker.frustumCulled = false; } catch (e) {}
      out.add(marker);
      try { out.userData.heroEmpty = true; } catch (e2) {}
    }
  } catch (e) { /* never throw out of the presentation path */ }
  return out;
}
/* --- rover: vendored NASA Perseverance hero for L2 surface phases ---
   Raw NASA-export units are arbitrary per model (audit table:
   Perseverance spans 175.63 raw units for a 3 m
   rover; MRO 89.74 for 13.6 m; MAVEN 13.46 for 11.43 m). calibrateRover
   measures the bounding box and normalizes max extent to ROVER_TRUE_SPAN_M
   (Bennu pattern: measure Box3, center, scale from the measured maximum
   extent), so Phase-5 terrain placement is true-scale. Material repairs reuse
   normalizeHero (shared path, geometry untouched). Lazy: fetched on first L2
   preview compose only — never at boot, never headless (?no3d safe: view3d
   only calls this inside the live-renderer compose path). */
export const ROVER_GLB_URL = 'models/nasa/perseverance.glb';
export const ROVER_TRUE_SPAN_M = 3.0; // NASA Mars 2020 fact sheet: ~3 m long, 2.7 m wide, 2.2 m tall
export const ROVER_RAW_MAX_UNITS = 175.63; // measured bbox max (audit table)
export const ROVER_CAL_FACTOR = ROVER_TRUE_SPAN_M / ROVER_RAW_MAX_UNITS; // ≈0.01708 m/unit
let _roverP = null;
export function loadRoverGltf() {
  if (!_roverP) _roverP = loadKitGltf(ROVER_GLB_URL);
  return _roverP;
}
export function calibrateRover(rawGroup) {
  /* Wheels define the ground plane: Perseverance wheels are exactly 0.5 m in
     diameter (published), and the export keeps them assembled at y≈0. A full
     bbox grounds on whichever stray part hangs lowest (a waveguide block sits
     ~1.5 m below the wheels in this export) — floating the rover. So: span
     assert on the whole root, lift from the wheel meshes, full bbox fallback. */
  const fixed = normalizeHero(rawGroup);
  const root = new THREE.Group();
  root.name = 'rover_calibrated';
  try {
    fixed.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(fixed);
    if (b.isEmpty()) throw new Error('rover glb empty');
    const c = b.getCenter(new THREE.Vector3());
    const sz = b.getSize(new THREE.Vector3());
    const maxDim = Math.max(sz.x, sz.y, sz.z) || 1;
    const k = ROVER_TRUE_SPAN_M / maxDim;
    const inner = new THREE.Group();
    // Offset lives INSIDE the scaled frame (cf. ops-view craft_true): a single
    // node with position+scale would apply the offset unscaled.
    inner.position.set(-c.x * k, -c.y * k, -c.z * k);
    fixed.scale.multiplyScalar(k);
    inner.add(fixed);
    root.add(inner);
    root.userData.calFactor = k;
    root.userData.trueSpanM = ROVER_TRUE_SPAN_M;
    root.updateMatrixWorld(true);
    // Span assert: a unit-rogue export rescales here, never silently.
    const chk = new THREE.Box3().setFromObject(root);
    if (!chk.isEmpty()) {
      const cs = chk.getSize(new THREE.Vector3());
      const span = Math.max(cs.x, cs.y, cs.z) || 1;
      if (Math.abs(span - ROVER_TRUE_SPAN_M) / ROVER_TRUE_SPAN_M > 0.10) {
        root.scale.multiplyScalar(ROVER_TRUE_SPAN_M / span);
        root.updateMatrixWorld(true);
      }
    }
    // Ground lift from the wheels (0.5 m flight hardware), not the bbox.
    // Match the named assembly subtree (mesh names are part codes; the
    // "Wheels_objs" node carries the name), then bound that subtree.
    let lift = null;
    try {
      root.updateMatrixWorld(true);
      const wheelRoots = [];
      root.traverse((o) => {
        if (/wheel/i.test(o.name || '')) wheelRoots.push(o);
      });
      if (wheelRoots.length) {
        const wb = new THREE.Box3();
        for (const w of wheelRoots) wb.expandByObject(w);
        if (!wb.isEmpty()) lift = -wb.min.y;
      }
    } catch (e2) { lift = null; }
    if (lift === null || !isFinite(lift)) {
      const fb = new THREE.Box3().setFromObject(root);
      lift = fb.isEmpty() ? 1.1 : -fb.min.y;
    }
    root.userData.groundLift = lift;
  } catch (e) {
    try { root.add(fixed); } catch (e2) {}
    root.userData.calFactor = 1;
    root.userData.trueSpanM = ROVER_TRUE_SPAN_M;
    root.userData.groundLift = 1.1;
  }
  return root;
}
export function levelOfSel(sel) { try { return (sel && sel.level) || ''; } catch (e) { return ''; } }
export function bodyTierOf(sel) {
  const n = (sel && sel.n | 0) || 0;
  return n <= 2 ? 0 : n <= 5 ? 1 : 2;
}
export function wingTierOf(sel) {
  const p = sel && sel.power;
  return (p === 'sa1' || p === 'rtg1') ? 0 : (p === 'sa2' || p === 'rtg2') ? 1 : 2;
}
export function radioTierOf(sel) {
  const c = sel && sel.comms;
  return c === 'lga' ? 0 : (c === 'mga' || c === 'hga2') ? 1 : 2;
}
/* Within-tier identity (Phase 5): tiers select PART IDENTITY ONLY at scale 1.0.
    Former WING_SCALE/RADIO_SCALE runtime multipliers removed — arbitrary
    physical scaling is forbidden. Kept as deprecated no-op maps for save compat. */
export const WING_SCALE = { sa1: 1, sa2: 1, sa3: 1, sa4: 1, rtg1: 1, rtg2: 1 };
/* Dishes grow in place (about the part centre): origin-scaling would shove
   the dish further out along its arm and detach it visually. Kept modest —
   radio_3's dish is already large at 1.0. */
export const RADIO_SCALE = { lga: 1, mga: 1, hga2: 1, hga3: 1, ka: 1 };
export function wingScaleOf(power) { return WING_SCALE[power] || 1; }
export function radioScaleOf(comms) { return RADIO_SCALE[comms] || 1; }
/* Propulsion → procedural engine block (the kit ships no engine parts):
   mono/bi/dual = nozzle sized by class; sep = triple ion thrusters, blue. */
export function engineSpecOf(prop) {
  if (prop === 'mono') return { kind: 'chem', s: 1.0 };
  if (prop === 'bi') return { kind: 'chem', s: 1.0 };
  if (prop === 'dual') return { kind: 'chem', s: 1.0 };
  if (prop === 'sep') return { kind: 'ion', s: 1.0 };
  return null;
}
export function keyOf(sel) {
  try {
    return bodyTierOf(sel) + ':' + sel.power + ':' + sel.comms + ':' + sel.prop + ':' +
      ((sel.instr || []).join(','));
  } catch (e) { return '1:sa2:mga:none:'; }
}
export function groupOfInstr(id, catalog) {
  try {
    if (catalog) for (const x of catalog) if (x.id === id) return x.g;
  } catch (e) {}
  return '';
}

/* Scale a kit part about the shared assembly origin: uniform scale preserves
   every internal mount, the part just reads bigger/smaller in place.
   (Wings: span grows outward from the root — the desired read.) */
export function scalePartAboutOrigin(part, f) {
  if (!part || !f || f === 1) return;
  try { part.scale.setScalar(f); } catch (e) {}
}
/* Scale a compact part about its own centre via a holder group (mounts near
   the origin barely move; the asset re-seats itself). Used for dishes.
   NOTE: plain add(), not attach() — attach preserves world transforms and
   would no-op the scale. */
export function scalePartAboutCenter(part, f) {
  if (!part || !f || f === 1) return;
  try {
    part.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(part);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const kids = part.children.slice();
    if (!kids.length) return;
    const cl = part.worldToLocal(c.clone());
    const holder = new THREE.Group();
    holder.name = 'scale_holder';
    holder.position.copy(cl);
    holder.scale.setScalar(f);
    part.add(holder);
    for (const k of kids) { k.position.sub(cl); holder.add(k); }
  } catch (e) {}
}

/* ── NASA-Verified Aerospace Component Geometries & PBR Materials ──
   Replaces primitive procedural shapes with high-fidelity aerospace components
   modeled after authentic NASA flight hardware:
   - Gold/Amber Kapton & Silver Aluminized Mylar MLI thermal blankets
   - Carbon-fiber Cassegrain telescope barrels with anti-reflective quartz lenses (HiRISE/CTX)
   - Faceted cryo-radiator spectrometer housings (OVIRS/SAM)
   - Triangular lattice deployable magnetometer truss booms (Juno/MAVEN)
   - Dual-gimbal titanium propellant feeds & NEXT-C molybdenum ion optics (DART)
   - Kinematic titanium mounting brackets replacing blocky equipment rails
   ══════════════════════════════════════════════════════════════════════ */
let _IGEO = null, _IMAT = null;
function _imat() {
  if (_IMAT) return _IMAT;
  const std = (c, m, r) => new THREE.MeshStandardMaterial({
    color: c, metalness: m, roughness: r, emissive: new THREE.Color(0x000000), emissiveIntensity: 0
  });
  _IMAT = {
    // NASA Aerospace Materials
    goldMli: std(0xcca038, 0.88, 0.28),      // Multi-Layer Insulation (Kapton gold foil)
    silverMli: std(0xdfe6ed, 0.95, 0.22),    // Aluminized Mylar thermal wrap
    carbonFiber: std(0x181c22, 0.40, 0.48),  // Carbon-fiber composite optical barrels & trusses
    titanium: std(0x8a929e, 0.75, 0.38),     // CNC Machined Ti-6Al-4V mounts & brackets
    lensQuartz: std(0x0c1220, 0.90, 0.12),   // Coated quartz / germanium optical apertures
    radiatorWhite: std(0xf0f3f6, 0.10, 0.65),// Z-93 thermal control white radiator paint
    copperHeat: std(0xbf6834, 0.85, 0.32),   // Heat pipes / thermal strap links
    solarPanel: std(0x1a2e56, 0.65, 0.35)    // GaInP/GaAs/Ge triple-junction solar cells
  };
  return _IMAT;
}

function _igeo() {
  if (_IGEO) return _IGEO;
  _IGEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
    cone: new THREE.ConeGeometry(0.5, 1, 24, 1, true),
    sphere: new THREE.SphereGeometry(0.5, 16, 12),
    torus: new THREE.TorusGeometry(0.5, 0.08, 12, 24)
  };
  return _IGEO;
}

function _part(geo, mat, sx, sy, sz, x, y, z, rx, ry, rz) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(Math.max(sx, 1e-5), Math.max(sy, 1e-5), Math.max(sz, 1e-5));
  m.position.set(x, y, z);
  if (rx) m.rotation.x = rx; if (ry) m.rotation.y = ry; if (rz) m.rotation.z = rz;
  return m;
}

/* Build authentic aerospace payload instrument assembly */
export function buildGlyph(group) {
  const G = _igeo(), M = _imat();
  const g = new THREE.Group();
  switch (group) {
    case 'Imaging': { // Catadioptric Cassegrain Telescope (HiRISE / CTX class)
      // Titanium mounting plate
      g.add(_part(G.box, M.titanium, 0.55, 0.06, 0.55, 0, -0.03, 0));
      // Primary carbon-fiber telescope baffle barrel
      g.add(_part(G.cyl, M.carbonFiber, 0.44, 0.55, 0.44, 0, -0.32, 0));
      // Outer Kapton gold MLI thermal blanket wrapped around lower half
      g.add(_part(G.cyl, M.goldMli, 0.47, 0.32, 0.47, 0, -0.22, 0));
      // Front sunshade aperture ring
      g.add(_part(G.torus, M.titanium, 0.42, 0.42, 0.42, 0, -0.58, 0, Math.PI / 2, 0, 0));
      // Recessed coated quartz primary lens element
      g.add(_part(G.cyl, M.lensQuartz, 0.36, 0.04, 0.36, 0, -0.54, 0));
      // Secondary mirror spider hub & supports
      g.add(_part(G.cyl, M.titanium, 0.08, 0.05, 0.08, 0, -0.56, 0));
      g.add(_part(G.box, M.titanium, 0.36, 0.02, 0.015, 0, -0.56, 0));
      g.add(_part(G.box, M.titanium, 0.015, 0.02, 0.36, 0, -0.56, 0));
      break;
    }
    case 'Spectroscopy': { // Faceted Thermal Cryo-Spectrometer (OVIRS / SAM class)
      // Gold MLI faceted sensor electronics enclosure
      g.add(_part(G.box, M.goldMli, 0.62, 0.42, 0.52, 0, -0.24, 0));
      // Cryocooler heat-radiator panel (white thermal coat)
      g.add(_part(G.box, M.radiatorWhite, 0.56, 0.04, 0.34, 0, -0.02, 0.12));
      // Copper thermal heat pipe bus
      g.add(_part(G.cyl, M.copperHeat, 0.03, 0.44, 0.03, 0.22, -0.22, 0.18, 0, 0, Math.PI / 2));
      // Spectrometer entrance slit optics & collimator
      g.add(_part(G.box, M.carbonFiber, 0.28, 0.12, 0.18, 0, -0.46, 0.08));
      g.add(_part(G.box, M.lensQuartz, 0.22, 0.03, 0.05, 0, -0.51, 0.08));
      break;
    }
    case 'Fields': { // Deployable Lattice Magnetometer Boom (Juno MAG / MAVEN class)
      // Articulated deployment hinge knuckle
      g.add(_part(G.box, M.titanium, 0.22, 0.12, 0.18, 0, -0.06, 0));
      // Lightweight carbon-fiber tubular mast
      g.add(_part(G.cyl, M.carbonFiber, 0.05, 1.45, 0.05, 0, -0.78, 0));
      // Mid-boom support ring & harness
      g.add(_part(G.torus, M.titanium, 0.08, 0.08, 0.08, 0, -0.65, 0, Math.PI / 2, 0, 0));
      // Triaxial fluxgate sensor canister wrapped in aluminized mylar
      g.add(_part(G.cyl, M.silverMli, 0.18, 0.22, 0.18, 0, -1.55, 0));
      // Thermal tip radiator globe
      g.add(_part(G.sphere, M.goldMli, 0.14, 0.14, 0.14, 0, -1.68, 0));
      break;
    }
    case 'Radar': { // Ice-Penetrating Radar Antenna / Altimeter (REASON / LOLA class)
      // Electronics vault
      g.add(_part(G.box, M.silverMli, 0.48, 0.28, 0.48, 0, -0.16, 0));
      // Deployable planar antenna array backing
      g.add(_part(G.box, M.carbonFiber, 1.35, 0.04, 0.85, 0, -0.38, 0));
      // High-gain phased array dipole elements
      g.add(_part(G.box, M.solarPanel, 1.25, 0.015, 0.75, 0, -0.395, 0));
      // Feed waveguide mast
      g.add(_part(G.cyl, M.copperHeat, 0.04, 0.28, 0.04, 0, -0.22, 0));
      break;
    }
    case 'In-situ': { // Articulated Robotic Sampling Arm & Coring Turret (TAGSAM / M2020)
      // Base shoulder azimuth rotator
      g.add(_part(G.cyl, M.titanium, 0.32, 0.16, 0.32, 0, -0.08, 0));
      // Upper arm link (Gold MLI thermal protected)
      g.add(_part(G.cyl, M.goldMli, 0.12, 0.65, 0.12, 0.08, -0.42, 0, 0, 0, -0.22));
      // Elbow joint actuator housing
      g.add(_part(G.cyl, M.titanium, 0.18, 0.18, 0.18, 0.22, -0.72, 0, Math.PI / 2, 0, 0));
      // Forearm link
      g.add(_part(G.cyl, M.carbonFiber, 0.11, 0.55, 0.11, 0.28, -1.02, 0, 0, 0, 0.12));
      // Wrist rotary tool turret & core catch mechanism
      g.add(_part(G.cyl, M.titanium, 0.26, 0.22, 0.26, 0.34, -1.32, 0));
      g.add(_part(G.cyl, M.copperHeat, 0.08, 0.28, 0.08, 0.34, -1.48, 0));
      break;
    }
    case 'Radio Sci.': { // Precision Radio Science Antenna & Calibration Horn
      g.add(_part(G.box, M.titanium, 0.32, 0.12, 0.32, 0, -0.06, 0));
      g.add(_part(G.cyl, M.carbonFiber, 0.08, 0.65, 0.08, 0, -0.38, 0));
      // X/Ka-band calibration feed horn
      g.add(_part(G.cone, M.copperHeat, 0.22, 0.32, 0.22, 0, -0.72, 0, Math.PI, 0, 0));
      g.add(_part(G.cyl, M.goldMli, 0.14, 0.18, 0.14, 0, -0.84, 0));
      break;
    }
    default: { // Standard Aerospace Avionics / Sensor Package
      g.add(_part(G.box, M.goldMli, 0.52, 0.38, 0.52, 0, -0.19, 0));
      g.add(_part(G.box, M.silverMli, 0.44, 0.12, 0.44, 0, -0.38, 0));
      g.add(_part(G.cyl, M.titanium, 0.06, 0.12, 0.06, 0.18, -0.06, 0.18));
      break;
    }
  }
  return g;
}

let _EGEO = null, _EMAT = null;
function _egeo() {
  if (_EGEO) return _EGEO;
  _EGEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
    cone: new THREE.ConeGeometry(0.5, 1, 28, 1, true),
    torus: new THREE.TorusGeometry(0.5, 0.06, 12, 28)
  };
  return _EGEO;
}

function _emat() {
  if (_EMAT) return _EMAT;
  const std = (c, m, r) => new THREE.MeshStandardMaterial({
    color: c, metalness: m, roughness: r, emissive: new THREE.Color(0x000000), emissiveIntensity: 0
  });
  _EMAT = {
    nozzleNiobium: std(0x282c33, 0.82, 0.28), // Inconel / Niobium heat-resistant nozzle bell
    throatGlow: new THREE.MeshBasicMaterial({ color: 0xffaa44 }), // Incandescent engine throat
    gimbalTitanium: std(0x828b98, 0.72, 0.35),// Thrust vector gimbal ring
    feedLineCopper: std(0xb86432, 0.85, 0.30),// Pre-valved propellant feed line
    goldMli: std(0xcca038, 0.88, 0.28),       // Engine bay thermal insulation
    ionMolyGrid: std(0x6e7886, 0.90, 0.25),   // NEXT-C Molybdenum accelerator grid
    ionPlasmaGlow: new THREE.MeshBasicMaterial({ color: 0x5eb4ff }) // Xenon plasma discharge core
  };
  return _EMAT;
}

/* Hang authentic aerospace engine cluster under spacecraft bus */
export function mountEngineRow(parent, spec) {
  try {
    if (!parent || !parent.getObjectByName) return null;
    if (!spec) return null;
    const box = new THREE.Box3().setFromObject(parent);
    if (box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const toLocal = (v) => (parent.worldToLocal ? parent.worldToLocal(v) : v);
    const cl = toLocal(c.clone());
    const minLy = toLocal(new THREE.Vector3(c.x, box.min.y, c.z)).y;
    const G = _egeo(), M = _emat();
    const row = new THREE.Group();
    row.name = 'engine_block';
    const u = Math.max(size.x, size.y, size.z) * 0.16 * (spec.s || 1);

    const P = (geo, mat, sx, sy, sz, x, y, z, rx, ry, rz) => {
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(Math.max(sx, 1e-5), Math.max(sy, 1e-5), Math.max(sz, 1e-5));
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx; if (ry) m.rotation.y = ry; if (rz) m.rotation.z = rz;
      row.add(m); return m;
    };

    if (spec.kind === 'chem') { // Chemical Engine (MR-106 / R-4D-11 class)
      // Thrust structure mounting ring
      P(G.torus, M.gimbalTitanium, u * 0.75, u * 0.75, u * 0.75, cl.x, minLy - u * 0.05, cl.z, Math.PI / 2, 0, 0);
      // Combustion chamber with gold MLI heat shield
      P(G.cyl, M.goldMli, u * 0.42, u * 0.32, u * 0.42, cl.x, minLy - u * 0.18, cl.z);
      // Gimbal actuators (dual orthogonal struts)
      P(G.cyl, M.gimbalTitanium, u * 0.06, u * 0.35, u * 0.06, cl.x + u * 0.22, minLy - u * 0.16, cl.z, 0, 0, 0.35);
      P(G.cyl, M.gimbalTitanium, u * 0.06, u * 0.35, u * 0.06, cl.x - u * 0.22, minLy - u * 0.16, cl.z, 0, 0, -0.35);
      // High-expansion Niobium nozzle bell
      P(G.cone, M.nozzleNiobium, u * 0.78, u * 0.68, u * 0.78, cl.x, minLy - u * 0.62, cl.z);
      // Exit plane stiffener lip
      P(G.torus, M.gimbalTitanium, u * 0.78, u * 0.78, u * 0.78, cl.x, minLy - u * 0.95, cl.z, Math.PI / 2, 0, 0);
      // Glowing internal throat
      P(G.cyl, M.throatGlow, u * 0.14, u * 0.04, u * 0.14, cl.x, minLy - u * 0.32, cl.z);
    } else { // Solar Electric Propulsion (NEXT-C Gridded Ion Thruster Suite)
      // Thruster module mounting deck
      P(G.box, M.gimbalTitanium, u * 1.05, u * 0.08, u * 1.05, cl.x, minLy - u * 0.04, cl.z);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const ix = cl.x + Math.cos(a) * u * 0.34;
        const iz = cl.z + Math.sin(a) * u * 0.34;
        // Discharge cathode body
        P(G.cyl, M.gimbalTitanium, u * 0.26, u * 0.28, u * 0.26, ix, minLy - u * 0.18, iz);
        // Ion extraction accelerator grid ring
        P(G.torus, M.ionMolyGrid, u * 0.28, u * 0.28, u * 0.28, ix, minLy - u * 0.32, iz, Math.PI / 2, 0, 0);
        // Xenon plasma luminescent emitter disc
        P(G.cyl, M.ionPlasmaGlow, u * 0.22, u * 0.03, u * 0.22, ix, minLy - u * 0.31, iz);
      }
    }

    row.traverse(o => { if (o.isMesh) o.userData.engine = true; });
    parent.add(row);
    return row;
  } catch (e) { return null; }
}

/* Hang authentic aerospace kinematic mounting rack and components */
export function mountGlyphRow(parent, ids, groupOf) {
  try {
    if (!parent || !parent.getObjectByName) return null;
    ids = (ids || []).slice(0, 12);
    if (!ids.length) return null;
    const box = new THREE.Box3().setFromObject(parent);
    if (box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const toLocal = (v) => (parent.worldToLocal ? parent.worldToLocal(v) : v);
    const craftLocal = toLocal(c.clone());
    const row = new THREE.Group();
    row.name = 'generic_instruments';
    const n = ids.length;
    const span = Math.max(size.x, 0.02);
    const cell = span / n;
    const s = Math.min(cell * 0.45, Math.max(size.y, size.x, size.z) * 0.3);
    const minLy = toLocal(new THREE.Vector3(c.x, box.min.y, c.z)).y;
    const rowY = minLy - Math.max(size.y * 0.02, 0.001);

    // Kinematic titanium payload equipment bench
    const G0 = _igeo(), M0 = _imat();
    const bench = new THREE.Mesh(G0.box, M0.titanium);
    bench.scale.set(Math.max(span * 0.98, 1e-4), Math.max(s * 0.08, 1e-5), Math.max(s * 0.24, 1e-5));
    bench.position.set(craftLocal.x, rowY + s * 0.04, craftLocal.z);
    bench.traverse(o => { if (o.isMesh) o.userData.generic = true; });
    row.add(bench);

    // Kinematic titanium bipod struts bolting bench to bus structure
    for (let j = -1; j <= 1; j += 2) {
      const strut = new THREE.Mesh(G0.cyl, M0.carbonFiber);
      strut.scale.set(0.02, Math.max(s * 0.25, 1e-5), 0.02);
      strut.position.set(craftLocal.x + j * span * 0.42, rowY + s * 0.16, craftLocal.z);
      strut.traverse(o => { if (o.isMesh) o.userData.generic = true; });
      row.add(strut);
    }

    for (let i = 0; i < n; i++) {
      const glyph = buildGlyph(groupOf ? groupOf(ids[i]) : '');
      glyph.scale.setScalar(Math.max(s, 1e-4));
      glyph.position.set(
        craftLocal.x - span / 2 + cell * (i + 0.5),
        rowY,
        craftLocal.z
      );
      glyph.traverse(o => { if (o.isMesh) o.userData.generic = true; });
      row.add(glyph);
    }
    parent.add(row);
    return row;
  } catch (e) { return null; }
}

export function assembleKit(bodyScene, wingScene, radioScene, wScale, rScale) {
  const parts = [bodyScene.clone(true), wingScene.clone(true), radioScene.clone(true)];
  scalePartAboutOrigin(parts[1], wScale);
  scalePartAboutCenter(parts[2], rScale);
  const group = new THREE.Group();
  group.name = 'nasa_satellite_kit';
  group.add(parts[0]); group.add(parts[1]); group.add(parts[2]);
  return { group, parts };
}
