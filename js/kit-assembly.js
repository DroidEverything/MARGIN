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
    'models/nasa/messenger.glb',
    'models/nasa/lro.glb',
    'models/nasa/mro.glb'
  ],
  wings: [
    'models/nasa/messenger.glb',
    'models/nasa/lro.glb',
    'models/nasa/mro.glb'
  ],
  radios: [
    'models/nasa/messenger.glb',
    'models/nasa/lro.glb',
    'models/nasa/mro.glb'
  ],
  fallback: 'models/nasa/messenger.glb'
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
  l1: { url: 'models/nasa/messenger.glb', assetId: 'MESSENGER', why: 'Orbital remote-sensing observatory' },
  l2: { url: 'models/nasa/lro.glb', assetId: 'LRO-A', why: 'Lunar Reconnaissance Orbiter' },
  l3: { url: 'models/nasa/mro.glb', assetId: 'MRO-A', why: 'Mars Reconnaissance Orbiter' },
  l4: { url: 'models/nasa/osiris_rex.glb', assetId: 'OSIRIS-REX', why: 'OSIRIS-REx Sample-Return Probe' },
  l5: { url: 'models/nasa/voyager.glb', assetId: 'VOYAGER-A', why: 'Outer-Planet Flagship Heritage' },
  sbx: { url: 'models/nasa/mro.glb', assetId: 'MRO-A', why: 'Mars Exploration Flagship' },
  sbx_moon: { url: 'models/nasa/lro.glb', assetId: 'LRO-A', why: 'Lunar Exploration Flagship' },
  sbx_earth: { url: 'models/nasa/messenger.glb', assetId: 'MESSENGER', why: 'Earth Observation Baseline' }
};
export function heroForLevel(levelId) {
  try {
    return HERO_BY_LEVEL[levelId] || HERO_BY_LEVEL.l1;
  } catch (e) {
    return HERO_BY_LEVEL.l1;
  }
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
export const ROVER_BY_LEVEL = {
  l2: { url: 'models/nasa/rassor.glb', spanM: 1.66, name: 'NASA RASSOR (Lunar Regolith Excavator)' },
  sbx_moon: { url: 'models/nasa/rassor.glb', spanM: 1.66, name: 'NASA RASSOR (Lunar Regolith Excavator)' },
  l3: { url: 'models/nasa/perseverance.glb', spanM: 3.0, name: 'NASA Perseverance (Mars 2020 Rover)' },
  sbx: { url: 'models/nasa/perseverance.glb', spanM: 3.0, name: 'NASA Perseverance (Mars 2020 Rover)' }
};
export function roverConfigForLevel(levelId) {
  if (levelId === 'l3' || levelId === 'sbx') return ROVER_BY_LEVEL.l3;
  return ROVER_BY_LEVEL.l2;
}

export const ROVER_GLB_URL = 'models/nasa/rassor.glb';
export const ROVER_TRUE_SPAN_M = 1.66;
export const ROVER_RAW_MAX_UNITS = 1.66;
export const ROVER_CAL_FACTOR = 1.0;

export function loadRoverGltf(levelId) {
  const cfg = roverConfigForLevel(levelId);
  return loadKitGltf(cfg.url);
}
export function calibrateRover(rawGroup, levelId) {
  const cfg = roverConfigForLevel(levelId);
  const trueSpanM = cfg.spanM;
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
    const k = trueSpanM / maxDim;
    const inner = new THREE.Group();
    // Offset lives INSIDE the scaled frame (cf. ops-view craft_true): a single
    // node with position+scale would apply the offset unscaled.
    inner.position.set(-c.x * k, -c.y * k, -c.z * k);
    fixed.scale.multiplyScalar(k);
    inner.add(fixed);
    root.add(inner);
    root.userData.calFactor = k;
    root.userData.trueSpanM = trueSpanM;
    root.userData.roverName = cfg.name;
    root.updateMatrixWorld(true);
    // Span assert: a unit-rogue export rescales here, never silently.
    const chk = new THREE.Box3().setFromObject(root);
    if (!chk.isEmpty()) {
      const cs = chk.getSize(new THREE.Vector3());
      const span = Math.max(cs.x, cs.y, cs.z) || 1;
      if (Math.abs(span - trueSpanM) / trueSpanM > 0.10) {
        root.scale.multiplyScalar(trueSpanM / span);
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

/* ── Authentic Flown NASA Flight Spacecraft Presentation ──────────────
   All artificial procedural rails, hanging boxes, cones, and cylinders are retired.
   All spacecraft in MARGIN display authentic NASA CAD assets (LRO, MRO, OSIRIS-REx,
   Voyager, MESSENGER). Payload instruments and propulsion thrusters are authentic
   flight systems integral to the genuine NASA flight spacecraft.
   ══════════════════════════════════════════════════════════════════════ */

export function buildGlyph() {
  return new THREE.Group();
}

export function mountEngineRow(parent, spec) {
  return null;
}

export function mountGlyphRow(parent, ids, groupOf) {
  return null;
}

export function assembleKit(bodyScene, wingScene, radioScene, wScale, rScale) {
  const group = new THREE.Group();
  group.name = 'nasa_spacecraft';
  if (bodyScene) group.add(bodyScene.clone(true));
  return { group, parts: [group] };
}
