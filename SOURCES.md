# MARGIN — Source & Scientific Provenance Register

> Authoritative register of the NASA/JPL datasets, historical mission benchmarks,
> 3D models, planetary textures, and acoustic models bundled in MARGIN.
> All data is vendored statically so the game runs 100% offline with zero
> runtime API or CDN dependencies.

---

## 1. Mission-Design Reference Data (`SRC` in `game.js`)

All static mission-design tables carry explicit source metadata (`source`, `url`,
`retrieved`, `simp`) inspected through the in-game **NASA Provenance** modal:

| Key | Source | URL | Retrieved | Scope & Simplification |
|---|---|---|---|---|
| `lsp` | NASA Launch Services Program — Launch Vehicle Performance | <https://elvperf.ksc.nasa.gov/> | 2026-09-19 | C3/payload curves digitised to 5–7 anchor points, interpolated in log-mass space |
| `techport` | NASA TechPort Portfolio | <https://techport.nasa.gov/api/projects> | 2026-09-19 | Representative mass/power/cost classes for spacecraft instruments |
| `horizons` | JPL Horizons Ephemerides | <https://ssd.jpl.nasa.gov/api/horizons.api> | 2026-09-19 | Lambert / porkchop solver uses coplanar J2000 Keplerian elements; 3D views use DE441 |
| `sbdb` | JPL Small-Body Database Query API | <https://ssd-api.jpl.nasa.gov/sbdb_query.api> | 2026-09-19 | Bennu (101955) orbital elements and physical parameters |
| `dsn` | NASA/JPL Deep Space Network | <https://eyes.nasa.gov/dsn/data/dsn.xml> | 2026-09-19 | Static aperture snapshot; single gain figure per DSN class |
| `rps` | NASA Radioisotope Power Systems (MMRTG) | <https://rps.nasa.gov/> | 2026-09-19 | Flat 1.6%/yr power decay model |
| `nssdc` | NASA NSSDCA Planetary Fact Sheets | <https://nssdc.gsfc.nasa.gov/planetary/factsheet/> | 2026-09-19 | Exact GM and body radii; budget delta-v items are planning baselines |
| `cost` | NASA AO Cost-Class Envelopes (Discovery / New Frontiers / Flagship) | <https://science.nasa.gov/researchers/solicitations/> | 2026-09-19 | Parametric bus and integration cost model |
| `models` | NASA 3D Resources & NASA PDS | <https://github.com/nasa/NASA-3D-Resources> | 2026-09-23 | Vendored static GLBs for flight spacecraft, rovers, Bennu, and LC-39B Mobile Launcher |

Live network checks are disabled by design (including SBDB CORS requests); all
browser views evaluate strictly against vendored local data.

---

## 2. Ephemeris & Physical Constants (JPL / IAU)

* **State Evaluation (`js/astronomy.js` + `js/astronomy-jpl-data*.js`):**
  Evaluates vendored Chebyshev series (`JPL_DE441`, `JPL_DE440`, and
  `ORX_merged_DE424` for Bennu orbit solution `118`) in frame `ECLIPTIC_J2000`,
  origin Solar System Barycenter (SSB), time scale `TDB` (`UTC -> TAI -> TT -> TDB`
  implemented in `js/time-service.js`). Any out-of-range epoch explicitly falls
  back to `FALLBACK_KEPLER`.
* **Satellite Kernels:** Merged planetary satellite ephemerides (`jup365`,
  `sat441l`, `mar099`, `ura184`, `nep098`, `plu060`) compose parent-relative
  moon vectors with barycentric corrections for Earth–Moon and Pluto–Charon.
* **Physical Layer (`js/solar-system-accuracy.js`):**
  * IAU nominal AU (`149597870.700 km`), `R_SUN` (`695700 km`), DE440 GM values,
    obliquity, rotation periods, ring radii, and JPL `GeometricAlbedo`.
  * Solar constant `1361 W/m²` at 1 AU (SORCE/TIM, Kopp & Lean 2011).
  * Reference docs: <https://ssd.jpl.nasa.gov/ephem.html>,
    <https://ssd.jpl.nasa.gov/planets/phys_par.html>,
    <https://ssd.jpl.nasa.gov/sats/phys_par/>.

---

## 3. Planetary, Lunar, and Sky Textures

Full per-file sizes, dimensions, and attributions are recorded in
[`assets/ASSET_SOURCES.md`](assets/ASSET_SOURCES.md) and
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

* **NASA Public-Domain Maps (`assets/textures/`):**
  * `earth_day.jpg`: NASA GIBS `BlueMarble_ShadedRelief` (2048×1024), used in Earth orbital surface overlays (`js/ops-view.js`).
  * `io.jpg`, `europa.jpg`, `ganymede.jpg`, `callisto.jpg`, `pluto.jpg`, `phobos.jpg`, `deimos.jpg`: NASA 3D Resources planetary & satellite equirectangular maps.
  * `jezero_albedo.jpg` & `jezero_meso.png`: MRO HiRISE `ESP_045994_1985` / `DTEEC_045994_1985_046060_1985_U01` micro-albedo and 2048×2048 normal map for Jezero Crater.
* **Solar System Scope Textures (`models/8K_textures/`, `assets/textures/`, CC BY 4.0):**
  * Earth (`8k_earth_daymap.jpg`, `8k_earth_nightmap.jpg`, `8k_earth_clouds.png`, and matte-remapped `earth_roughness_sss.jpg`), Moon (`moon_8k.jpg`, converted from `8k_moon`), Mercury (`8k_mercury.jpg`), Venus (`8k_venus_surface.jpg`), Mars (`8k_mars.jpg`), Jupiter (`8k_jupiter.jpg`), Saturn (`8k_saturn.jpg`, `8k_saturn_ring_alpha.png`), Uranus (`2k_uranus.jpg`), Neptune (`2k_neptune.jpg`), and the Milky Way sky backdrop (`stars_8k.jpg`, converted from `8k_stars_milky_way`).
  * Required attribution: *“Planet and sky textures: Solar System Scope, CC BY 4.0.”* These textures control visual surface appearance only and do not alter ephemerides, irradiance math, or mission scoring.
* **Procedural Detail Maps (MIT):**
  * `lroc_nac_tile.png` and `mars_sand_tile_v2.png` provide seamless sub-metre micro-normal detail on lunar and Martian terrain surfaces (`js/surface-view.js`) without altering terrain elevation arrays.

---

## 4. Real Star Catalog (`js/stars-data.js`)

* **HYG Database v4.0** (CC BY-SA 4.0, <https://github.com/astronexus/HYG-Database>),
  compiled from Hipparcos/ESA, Yale Bright Star Catalog, and Gliese Catalog.
* Vendored subset of 5,070 stars (`Vmag <= 6.0`) stored as J2000 equatorial unit
  vectors with visual magnitude and B-V color index for point rendering across
  title, orrery, and launch views.

---

## 5. 3D Hardware, Asteroid Geometry & Launch Vehicles

### Asteroid Shape Model
* `models/nasa/Bennu_1_1.glb` — Radar shape model of (101955) Bennu, Nolan et al.
  (*Icarus* 226, 2013), NASA PDS Small Bodies Node bundle
  `urn:nasa:pds:ast-bennu.radar.shape-model::1.1`, DOI `10.26033/33ba-s419`.

### Spacecraft, Rovers & Ground Hardware (`models/nasa/*.glb`)
All NASA spacecraft, rovers, and ground structures originate from NASA 3D
Resources (<https://github.com/nasa/NASA-3D-Resources>):
* **Orbital & Planetary Craft:** `aqua.glb`, `lro.glb`, `mro.glb`,
  `messenger.glb`, `osiris_rex.glb`, `voyager.glb`, `apollo_lm_lander.glb`
* **Surface Rovers:** `rassor.glb` (NASA KSC Swamp Works RASSOR, calibrated to
  1.66 m span for Lunar surface missions) and `perseverance.glb` (Mars 2020
  Perseverance, calibrated to 3.0 m span for Mars surface missions)
* **Launch Pad:** `Mobile Launcher (assembled).glb` (LC-39B Mobile Launcher,
  117 m structure, 14.3 m launch deck elevation), hosted on the project-authored
  pad terrain and mast environment (`launch_env_lc39b.glb`, MIT)

### Procedural Launch Vehicles (`js/launch-view.js` & `game.js`)
Launch vehicle visuals (Falcon 9, Falcon Heavy, Atlas V 401/551, Vulcan VC4/VC6,
New Glenn, SLS Block 1B, Saturn V) are `PROCEDURAL_VERIFIED_RECONSTRUCTION`
assemblies anchored to published overall dimensions, stage lengths, fairing
envelopes, and milestone METs (`FLIGHT_KEYS` in `game.js`). Simulated lift
performance always comes from the NASA LSP curves (`SRC.lsp`).

---

## 6. Lighting & Procedural Rendering (`js/orrery.js`)

* **Solar Rendering:** Procedural animated photosphere granulation + limb
  darkening shader with `UnrealBloomPass` corona (`createSunMaterial()`).
* **Physical Solar Rig:** `PointLight` positioned at the Sun with inverse-square
  (`decay = 2`) irradiance calibrated so 1 AU receives `1361 W/m²` (Mercury
  ~`9083`, Mars ~`586`, Jupiter ~`50.3`, Pluto ~`0.87 W/m²`), paired with
  albedo-metered auto-exposure (`exposureForBody()`) and `PCFSoftShadowMap`.
* **Planetary Rings & Atmospheres:** Analytical Fresnel atmospheric limb shells
  plus procedural Saturn ring profiles (with Cassini Division) and Uranus narrow
  ring radii.

---

## 7. Lunar & Martian Terrain Patches (`js/surface-data.js`, `js/mars-surface-data.js`)

### Lunar Terrain (`js/surface-data.js`)
Baked from NASA PDS LRO LOLA RDR grids (Goddard PDS Geosciences Node,
<https://pds-geosciences.wustl.edu/lro/>):
* **Shackleton Rim (`89.9°S, 0.0°E`):** `ldem_875s_5m` (inner 400×400 at 7.52 m post, 303.5 m relief)
* **Mons Malapert (`~86°S`):** `ldem_85s_10m` (inner 300×300 at 10.03 m post, 152.9 m relief)
* **Mare Tranquillitatis (`0.67°N, 23.47°E`):** `ldem_1024_00n_15n_000_030` (inner 200×200 at ~30 m post, 19.9 m relief)
* All sites include 48×48 km outer context rings (200×200) and synchronized 80×80 hazard/slope grids (`game.js` `MOON_SITES`).

### Martian Terrain (`js/mars-surface-data.js`)
Baked from MGS MOLA MEGDR v2 (`doi:10.17189/1519460`) and MRO HiRISE stereo DTE
(`DTEEC_045994_1985_046060_1985_U01`, `doi:10.17189/1520227`):
* **Jezero Crater (`18.4447°N, 77.4508°E`):** 1 m/post HiRISE inner 3×3 km DTM and `ESP_045994_1985_RED_C_01_ORTHO` photometric drape (`jezero_albedo.jpg`, `jezero_meso.png`)
* **Gale Bradbury Landing (`4.5895°S, 137.4417°E`)** & **InSight Elysium (`4.5°N, 135.6°E`):** 128 ppd MOLA inner 3×3 km and 256×256 48×48 km outer terrain rings.

---

## 8. Spacecraft Subsystem Registry (`js/nasa-hardware-data.js`)

Offline archival dataset (`getNasaHardwareData`) providing NSSDCA Master IDs,
PDS archives, and heritage specifications across 19 instruments (`CTX`, `HiRISE`,
`THEMIS`, `PACE OCI`, `OVIRS`, `SAM`, `GRNS`, `Juno MAG`, `MAVEN SWIA`,
`New Horizons SDC`, `Europa Clipper REASON`, `LOLA`, `TAGSAM`, `Perseverance Drill`,
`InSight SEIS`, `MEDA`, `USO`, `RAD`, `Electra`), solar/MMRTG power,
monopropellant/bipropellant/NEXT-C ion propulsion, DSN X/Ka comms, and
radiation-hardened avionics (`RAD750`, `SpaceCube`). Gameplay balancing presets
and subsystem trade-offs remain anchored to `derive(S)` in `game.js`.

---

## 9. Historical Mission Benchmarks (`REAL` in `game.js`)

Head-to-Head benchmark comparisons use NSSDCA / NASA project records:

| Tier | NASA Mission | Launch Date | Launch Vehicle | Wet/Launch Mass | EOM Power | Cost | Archive Citation |
|---|---|---|---|---|---|---|---|
| **L1** | **PACE** | 2024-02-08 | Falcon 9 | 1,694 kg | 2,700 W | $880M | NSSDCA `2024-027A`, NASA GSFC |
| **L2** | **Lunar Reconnaissance Orbiter** | 2009-06-18 | Atlas V 401 | 1,846 kg | 1,850 W | $583M | NSSDCA `2009-031A`, NASA GSFC / PDS |
| **L3** | **Mars Reconnaissance Orbiter** | 2005-08-12 | Atlas V 401 | 2,180 kg | 2,000 W | $720M | NSSDCA `2005-029A`, NASA JPL / PDS |
| **L4** | **OSIRIS-REx** | 2016-09-08 | Atlas V 411 | 2,110 kg | 1,226 W | $800M | NSSDCA `2016-055A`, NASA GSFC / PDS |
| **L5** | **Europa Clipper** | 2024-10-14 | Falcon Heavy | 6,065 kg | 700 W (Jupiter) | $5,000M | NSSDCA `2024-188A`, NASA JPL / APL |

---

## 10. Acoustic Sources & Atmospheric Extinction (`js/launch-audio-data.js`, `game.js`)

* **Launch Recordings:** Authentic NASA Johnson Space Center launch combustion
  loop and staging concussion recordings embedded directly in `js/launch-audio-data.js`
  for `file://`-safe offline decoding, attenuated exponentially with altitude
  (`exp(-altKm / 12.0)` to zero above 75 km).
* **Vacuum Silence Rule:** Deep-space cruise and surface traverses remain
  acoustically silent externally; console switches synthesize tactile relay profiles
  (`Audio_.click`) and MSFN 2,525 Hz / 2,475 Hz Quindar tones (`Audio_.quindar`).
* **Music & UI SFX:** Ambient score (`assets/audio/margin_theme.mp3`) and CC0 UI
  samples (`assets/audio/ui/*`) documented in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

---

## 11. Provenance Compliance Summary

* NASA imagery, ephemerides, DTM bakes, and 3D hardware models remain strictly separated from CC BY 4.0 textures (`Solar System Scope`), CC BY-SA 4.0 catalog data (`HYG v4.0`), and MIT project code/assets in both documentation and the in-game provenance modal.
* No NASA insignia, meatball, or worm logotype is used anywhere in the repository or UI.
* Procedural reconstructions (launch vehicle stacks, surface micro-relief normal tiles, atmospheric Fresnel rims, Saturn/Uranus rings, and `launch_env_lc39b.glb`) are explicitly disclosed and never feed back into authoritative physics (`derive(S)`).
