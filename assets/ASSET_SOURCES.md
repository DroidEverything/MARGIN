# Asset Sources — Textures, 3D Models, Baked Datasets & Audio

Every external binary and pre-baked static dataset bundled in `assets/`, `models/`, and `js/` is catalogued below with its origin, license, dimensions/size, and runtime role. MARGIN loads all assets locally with zero runtime network dependencies.

---

## 1. Solar System Scope Textures (CC BY 4.0)

- **Source:** Solar System Scope (<https://www.solarsystemscope.com/textures/>)
- **Copyright:** © 2010–2017 Solar System Scope
- **License:** Creative Commons Attribution 4.0 International ([CC BY 4.0](../licenses/CC-BY-4.0.txt))
- **Scope:** Visual surface appearance only (`js/orrery.js`, `js/ops-view.js`, `js/surface-view.js`, `js/launch-view.js`). These maps do not affect ephemerides, photometry, exposure metering, or gameplay calculations.

| File | Size | Dimensions | Runtime Use |
|---|---:|---|---|
| `models/8K_textures/earth/8k_earth_daymap.jpg` | 4,565,076 B | 8192×4096 | Earth day-side map |
| `models/8K_textures/earth/8k_earth_nightmap.jpg` | 3,144,468 B | 8192×4096 | Earth night-side city lights |
| `models/8K_textures/earth/8k_earth_clouds.png` | 30,090,932 B | 8192×4096 | Earth cloud layer |
| `assets/textures/earth_roughness_sss.jpg` | 316,902 B | 4096×2048 | Remapped land/sea matte `roughnessMap` (`sea 0.55 / land 1.00`) |
| `assets/textures/moon_8k.jpg` | 13,858,015 B | 8192×4096 | Moon orbital sphere texture (converted from `8k_moon`, based on NASA LRO imagery) |
| `models/8K_textures/8k_mercury.jpg` | 15,035,740 B | 8192×4096 | Mercury surface map |
| `models/8K_textures/venus/8k_venus_surface.jpg` | 12,523,129 B | 8192×4096 | Venus surface map |
| `models/8K_textures/8k_mars.jpg` | 8,396,951 B | 8192×4096 | Mars surface map |
| `models/8K_textures/8k_jupiter.jpg` | 3,080,980 B | 8192×4096 | Jupiter surface map |
| `models/8K_textures/saturn/8k_saturn.jpg` | 1,098,204 B | 8192×4096 | Saturn surface map |
| `models/8K_textures/saturn/8k_saturn_ring_alpha.png` | 64,790 B | 8192×1024 | Saturn ring radial alpha profile |
| `models/8K_textures/2k_uranus.jpg` | 77,751 B | 2048×1024 | Uranus surface map |
| `models/8K_textures/2k_neptune.jpg` | 241,580 B | 2048×1024 | Neptune surface map |
| `assets/textures/stars_8k.jpg` | 1,905,513 B | 8192×4096 | Equirectangular Milky Way skybox (`8k_stars_milky_way`) |

---

## 2. NASA Planetary & Surface Textures (Public Domain)

- **Origin:** NASA 3D Resources (<https://github.com/nasa/NASA-3D-Resources>), NASA GIBS, NASA PDS / UArizona HiRISE
- **License:** Public domain under NASA Images and Media Usage Guidelines (<https://www.nasa.gov/nasa-brand-center/images-and-media/>)

| File | Origin | Size | Runtime Use |
|---|---|---:|---|
| `assets/textures/earth_day.jpg` | NASA GIBS `BlueMarble_ShadedRelief` (2048×1024) | 213,215 B | Surface/fallback Earth backdrop (`js/ops-view.js`) |
| `assets/textures/io.jpg` | NASA 3D Resources (`Jupiter - Io (A).jpg`) | 702,001 B | Galilean moon Io |
| `assets/textures/europa.jpg` | NASA 3D Resources (`Jupiter - Europa.jpg`) | 610,862 B | Galilean moon Europa |
| `assets/textures/ganymede.jpg` | NASA 3D Resources (`Jupiter - Ganymede.jpg`) | 710,923 B | Galilean moon Ganymede |
| `assets/textures/callisto.jpg` | NASA 3D Resources (`Jupiter - Callisto.jpg`) | 783,405 B | Galilean moon Callisto |
| `assets/textures/pluto.jpg` | NASA 3D Resources (`Pluto.jpg`, New Horizons) | 351,885 B | Dwarf planet Pluto |
| `assets/textures/phobos.jpg` | NASA 3D Resources (`Mars - Phobos.jpg`, 1440×720) | 601,584 B | Martian moon Phobos |
| `assets/textures/deimos.jpg` | NASA 3D Resources (`Mars - Deimos.jpg`, 1440×720) | 480,429 B | Martian moon Deimos |
| `assets/textures/jezero_albedo.jpg` | MRO HiRISE `ESP_045994_1985_RED_C_01_ORTHO` high-pass 2048×2048 | 792,719 B | Jezero Crater surface micro-albedo |
| `assets/textures/jezero_meso.png` | MRO HiRISE `DTEEC_045994_1985_046060_1985_U01` 2048×2048 normals | 3,785,751 B | Jezero Crater real 1 m DTE meso-normal map |

---

## 3. NASA 3D Models (Public Domain)

- **Spacecraft & Ground Hardware (`models/nasa/*.glb`):** Sourced from NASA 3D Resources (<https://github.com/nasa/NASA-3D-Resources>), public domain per NASA Media Guidelines.
- **Asteroid Shape Model:** NASA Planetary Data System (PDS) Small Bodies Node.

| File | Asset | Size | Notes |
|---|---|---:|---|
| `models/nasa/Bennu_1_1.glb` | Asteroid (101955) Bennu V1.1 shape model | 859,980 B | Nolan et al. (2013), PDS DOI `10.26033/33ba-s419`; bbox-centered |
| `models/nasa/Mobile Launcher (assembled).glb` | Kennedy Space Center LC-39B Mobile Launcher | 198,480 B | Draco-compressed GLB; true-scale site anchor (117 m tower, 14.3 m deck) |
| `models/nasa/apollo_lm_lander.glb` | Apollo Lunar Module (`lunarlandernofoil-c`) | 369,984 B | Descent + ascent lander geometry |
| `models/nasa/aqua.glb` | NASA Aqua Earth Observing System spacecraft | 1,994,440 B | Earth-observation mission viewer |
| `models/nasa/lro.glb` | Lunar Reconnaissance Orbiter (LRO) | 654,500 B | Lunar orbiter mission viewer |
| `models/nasa/messenger.glb` | MESSENGER Mercury orbiter | 2,673,396 B | Payload/mission viewer |
| `models/nasa/mro.glb` | Mars Reconnaissance Orbiter (MRO) | 2,652,460 B | Mars orbiter mission viewer |
| `models/nasa/osiris_rex.glb` | OSIRIS-REx sample return spacecraft | 1,281,308 B | Bennu rendezvous mission viewer |
| `models/nasa/perseverance.glb` | Mars 2020 Perseverance Rover | 4,987,176 B | Calibrated to 3.0 m true metric span for Mars surface traverses |
| `models/nasa/rassor.glb` | NASA KSC Swamp Works RASSOR Rover | 6,283,464 B | Calibrated to 1.66 m true metric span for Lunar surface traverses |
| `models/nasa/voyager.glb` | Voyager deep-space probe | 285,936 B | Outer-system mission viewer |

---

## 4. Baked Catalogs, Ephemerides & Terrain Patches

| File | Source & License | Details |
|---|---|---|
| `js/stars-data.js` | HYG Database v4.0 (CC BY-SA 4.0) | 5,070 real J2000 stars (Vmag <= 6.0) with B-V color index |
| `js/astronomy-jpl-data.js`, `js/astronomy-jpl-data-de440.js`, `js/astronomy-jpl-data-bennu.js` | JPL Horizons (`DE441`, `DE440`, `ORX_merged_DE424`, satellite kernels) | Public domain NASA/JPL Chebyshev state vectors (`ECLIPTIC_J2000`, SSB, TDB) |
| `js/surface-data.js` | NASA PDS LRO LOLA RDR (`ldem_875s_5m`, `ldem_85s_10m`, `ldem_1024_00n_15n_000_030`) | Offline-baked 3×3 km inner + 48×48 km outer lunar terrain patches (Shackleton, Malapert, Tranquillitatis) |
| `js/mars-surface-data.js` | NASA PDS MGS MOLA MEGDR (`10.17189/1519460`) + MRO HiRISE (`10.17189/1520227`) | Offline-baked 3×3 km inner + 48×48 km outer Martian terrain patches (Jezero 1 m HiRISE, Gale, Elysium) |
| `js/nasa-hardware-data.js` | NSSDCA Master Catalog & NASA PDS instrument documentation | Public flight specs, mass, power, and mission heritage for build-bay hardware |

---

## 5. Audio Assets

| File | Source & License | Size | Purpose |
|---|---|---:|---|
| `assets/audio/margin_theme.mp3` | Sine-model resynthesis of a Google Flow Music (Lyria 3.5) generation | 3,343,104 B | Looping ambient soundtrack (256 kbps MP3) |
| `assets/audio/ui/click_002.wav`, `click_003.wav`, `tick_001.wav` | Kenney Interface Sounds (CC0 1.0) | 1,102 / 1,742 / 4,046 B | Tactile console button sounds |
| `assets/audio/ui/mechanical_select.mp3`, `scifi_select.mp3` | Yuki Capital UI SFX (CC0 1.0) | 2,550 / 2,968 B | Selection and modal UI sounds |
| `js/launch-audio-data.js` | NASA JSC Audio Archive (`Launch-Sound_Launch-texture.mp3`, `Launch-Sound_Sonic-Booms.mp3`), Public Domain | 66 KB (embedded base64) | Rocket combustion loop and staging transient |

---

## 6. Project-Authored Visual Assets (MIT License)

Created originally for MARGIN (no external third-party source):

| File | Size | Dimensions / Type | Purpose |
|---|---:|---|---|
| `assets/margin-mission-bus-preview.png` | 40,577 B | Static schematic PNG | Build-bay 2D schematic fallback preview |
| `models/nasa/launch_env_lc39b.glb` | 597,800 B | Authored GLB | LC-39B pad slab, lightning masts, and FX anchors supporting the NASA Mobile Launcher |
| `assets/textures/lroc_nac_tile.png` | 735,891 B | 512×512 tangent normal map | Procedural lunar regolith micro-relief tile (`js/surface-view.js`) |
| `assets/textures/mars_sand_tile_v2.png` | 387,197 B | 512×512 tangent normal map | Procedural Martian basalt grit & sand ripple normal map (`js/surface-view.js`) |
