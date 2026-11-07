# Third-Party Notices

MARGIN's original source code is licensed under the **MIT License** — see
[`LICENSE`](LICENSE).

This file lists the third-party components bundled in this repository, their
licenses, and the attribution they require. Full license texts are in
[`licenses/`](licenses/). Technical provenance and scientific simplifications are
recorded in [`SOURCES.md`](SOURCES.md) and [`assets/ASSET_SOURCES.md`](assets/ASSET_SOURCES.md).

---

## 1. Code libraries

### Three.js r160 — MIT

- **Files:** `vendor/three.module.min.js`, `vendor/addons/**` (including
  `vendor/addons/BufferGeometryUtils.js`, `GLTFLoader.js`, `DRACOLoader.js`,
  `OrbitControls.js`, and post-processing passes/shaders)
- **Copyright:** © 2010–2023 three.js authors
- **License text:** [`licenses/MIT-three.js.txt`](licenses/MIT-three.js.txt)
- **Upstream:** <https://github.com/mrdoob/three.js>

### Draco — Apache License 2.0

- **Files:** `vendor/draco/**` (`draco_decoder.js`, `draco_decoder.wasm`,
  `draco_wasm_wrapper.js`)
- **Copyright:** Copyright 2016 Google Inc.
- **License text:** [`licenses/Apache-2.0.txt`](licenses/Apache-2.0.txt)
- **Upstream:** <https://github.com/google/draco>

### N3rson / Solar-System-3D — MIT

- **Usage:** Solar bloom/emissive sun-disc presentation technique and
  `PLANET_DATA` descriptive flavor text in `js/orrery.js`
- **Copyright:** Copyright (c) 2025 N3rson
- **License text:** [`licenses/MIT-N3rson.txt`](licenses/MIT-N3rson.txt)
- **Upstream:** <https://github.com/N3rson/Solar-System-3D>

---

## 2. Fonts

| Family | Files | License | Copyright |
|---|---|---|---|
| Inter | `fonts/inter-400/500/600.woff2` | SIL OFL 1.1 | Copyright 2020 The Inter Project Authors |
| JetBrains Mono | `fonts/jetbrains-mono-400/500.woff2` | SIL OFL 1.1 | Copyright 2020 The JetBrains Mono Project Authors |
| IBM Plex Mono | `fonts/ibm-plex-mono-400/500.woff2` | SIL OFL 1.1 | Copyright © 2017 IBM Corp. with Reserved Font Name "Plex" |
| Instrument Sans | `fonts/instrument-sans-600.woff2` | SIL OFL 1.1 | Copyright 2022 The Instrument Sans Project Authors |
| Material Symbols Outlined | `fonts/material-symbols-outlined.woff2` | Apache License 2.0 | Copyright Google LLC |

- **OFL text:** [`licenses/OFL-1.1.txt`](licenses/OFL-1.1.txt)
- **Apache text:** [`licenses/Apache-2.0.txt`](licenses/Apache-2.0.txt)
- **Upstreams:** <https://fonts.google.com/> and the respective open-source font repositories.

---

## 3. NASA assets — public domain

NASA imagery, 3D models, audio, and data are generally not subject to copyright
in the United States and are used under NASA's Images and Media Usage
Guidelines:

<https://www.nasa.gov/nasa-brand-center/images-and-media/>

Bundled files covered under NASA guidelines include:

- **3D Models (`models/nasa/`):** `Bennu_1_1.glb` (NASA PDS Small Bodies Node),
  `Mobile Launcher (assembled).glb`, `apollo_lm_lander.glb`, `aqua.glb`, `lro.glb`,
  `messenger.glb`, `mro.glb`, `osiris_rex.glb`, `perseverance.glb`, `rassor.glb`,
  `voyager.glb` (NASA 3D Resources)
- **Surface & Satellite Textures (`assets/textures/`):** `earth_day.jpg` (NASA GIBS
  Blue Marble fallback), `io.jpg`, `europa.jpg`, `ganymede.jpg`, `callisto.jpg`,
  `pluto.jpg`, `phobos.jpg`, `deimos.jpg`, and MRO HiRISE Jezero Crater maps
  (`jezero_albedo.jpg`, `jezero_meso.png`)
- **Static Data & Terrain Bakes:** `js/astronomy-jpl-data*.js`,
  `js/surface-data.js` (LRO LOLA), `js/mars-surface-data.js` (MGS MOLA + MRO HiRISE),
  `js/nasa-hardware-data.js`
- **Launch Acoustics:** NASA Johnson Space Center launch and separation recordings
  embedded in `js/launch-audio-data.js`

NASA does **not** endorse this project. No NASA insignia, logotype, or
identifier is used.

---

## 4. Solar System Scope textures — CC BY 4.0

- **Files:**
  - `models/8K_textures/earth/8k_earth_daymap.jpg`
  - `models/8K_textures/earth/8k_earth_nightmap.jpg`
  - `models/8K_textures/earth/8k_earth_clouds.png`
  - `models/8K_textures/8k_mercury.jpg`
  - `models/8K_textures/venus/8k_venus_surface.jpg`
  - `models/8K_textures/8k_mars.jpg`
  - `models/8K_textures/8k_jupiter.jpg`
  - `models/8K_textures/saturn/8k_saturn.jpg`
  - `models/8K_textures/saturn/8k_saturn_ring_alpha.png`
  - `models/8K_textures/2k_uranus.jpg`
  - `models/8K_textures/2k_neptune.jpg`
  - `assets/textures/earth_roughness_sss.jpg` (land/sea roughness mask converted from `8k_earth_specular_map`)
  - `assets/textures/moon_8k.jpg` (JPEG conversion of Solar System Scope `8k_moon`, derived from NASA LRO imagery)
  - `assets/textures/stars_8k.jpg` (JPEG conversion of Solar System Scope `8k_stars_milky_way` equirectangular skybox)
- **Copyright:** © 2010–2017 Solar System Scope
- **License:** Creative Commons Attribution 4.0 International (CC BY 4.0)
- **Required credit:** “Planet and sky textures: Solar System Scope, CC BY 4.0”
- **License text:** [`licenses/CC-BY-4.0.txt`](licenses/CC-BY-4.0.txt)
- **Source:** <https://www.solarsystemscope.com/textures/>

---

## 5. HYG star catalogue — CC BY-SA 4.0

- **File:** `js/stars-data.js` — 5,070 stars (Vmag <= 6.0) compiled from HYG
  Database v4.0 (Hipparcos/ESA, Yale Bright Star Catalog, Gliese).
- **Required credit:** “Stars: HYG v4.0 (Hipparcos / Yale BSC / Gliese)”
- **License:** Creative Commons Attribution-ShareAlike 4.0 International
  (CC BY-SA 4.0)
- **License text:** [`licenses/CC-BY-SA-4.0.txt`](licenses/CC-BY-SA-4.0.txt)
- **Source:** <https://github.com/astronexus/HYG-Database>

---

## 6. Background music — “Margin Theme”

- **File:** `assets/audio/margin_theme.mp3` (104.4 s, 256 kbps loop)
- **Source & Method:** Sine-model resynthesis generated from a Google Flow Music
  (Lyria 3.5) audio render created under a Flow Music Plus plan.
- **Rights:** Distributed as a derivative work under Flow Music Plus terms. The
  source master and C2PA provenance metadata are archived by the project author.

---

## 7. UI sound effects — CC0 1.0

The UI audio samples in `assets/audio/ui/` are dedicated to the public domain
under **CC0 1.0**:

- `click_002.wav`, `click_003.wav`, `tick_001.wav` — Kenney Interface Sounds,
  Copyright © 2020 Kenney (<https://github.com/Calinou/kenney-interface-sounds>)
- `mechanical_select.mp3`, `scifi_select.mp3` — UI SFX by Yuki Capital
  (<https://github.com/romainsimon/uisfx>)

License text: [`licenses/CC0-1.0.txt`](licenses/CC0-1.0.txt).

---

## 8. Original project assets — MIT

The following visual assets and procedural maps were created specifically for
MARGIN and are covered by the project [`LICENSE`](LICENSE) (MIT):

- `assets/margin-mission-bus-preview.png` — Spacecraft schematic fallback preview
- `models/nasa/launch_env_lc39b.glb` — Authored launch pad terrain slab and lightning-mast environment geometry (hosts the NASA Mobile Launcher GLB)
- `assets/textures/lroc_nac_tile.png` — Procedural lunar regolith micro-relief tangent-space normal map
- `assets/textures/mars_sand_tile_v2.png` — Procedural Martian basalt grit and sand ripple tangent-space normal map
