# MARGIN — NASA Space Mission Design Game

> **Live Demo:** **[Launch MARGIN in Browser →](https://droideverything.github.io/MARGIN/)**

MARGIN is an offline-first, browser-based space mission design game built for the
**NASA Space Apps Challenge**. Pick a mission, engineer a spacecraft under real
mass, power, thermal, comms, and budget margins, select a launch vehicle, fly the
trajectory, and operate the mission in orbit or on the surface — anchored to
public NASA and JPL datasets.

No build step, no bundler, no runtime external API calls.

---

## Quick Start

### Play Live in Browser (Recommended)

Open **[https://droideverything.github.io/MARGIN/](https://droideverything.github.io/MARGIN/)** in Chrome, Edge, or Firefox.

- **First visit:** Preloads vendored JPL DE440 ephemerides (~31 MB) and 8K planetary/cloud textures behind a telemetry boot screen so every 3D shader and surface map is ready before entry, then caches locally for fast repeat visits.
- **2D fallback:** Append [`?no3d`](https://droideverything.github.io/MARGIN/?no3d) to bypass WebGL and play in Canvas2D mode.
- **Mobile desktop mode:** Use the fullscreen button in the top-left corner of the header bar.

### Run Locally (Windows)

Double-click **`launch_margin.bat`** (or run it from a terminal). It locates
Python 3, starts a local HTTP server at <http://localhost:8906/index.html>, and
opens MARGIN in your default browser.

To stop the background server, close the minimized **"MARGIN server"** window or run:

```bat
taskkill /FI "WINDOWTITLE eq MARGIN server*"
```

If port 8906 is busy, edit `PORT` at the top of `launch_margin.bat`.

### Run Locally (macOS / Linux / Manual)

```bash
python3 -m http.server 8906 --bind 127.0.0.1
# Open http://localhost:8906/index.html
```

### Offline & Fallback Modes

| Launch Mode | Behavior |
|---|---|
| [Live Demo (GitHub Pages)](https://droideverything.github.io/MARGIN/) | Full 3D WebGL + JPL ephemerides hosted over HTTPS; caches locally after initial boot |
| Local HTTP (default) | Same full interactive Three.js 3D scenes + Web Audio + authoritative simulation offline |
| `?no3d` query parameter | Forces the lightweight Canvas2D rendering path across every screen |
| Direct `file://` (`index.html`) | Automatically falls back to the Canvas2D simulation mode when ES modules are blocked |

---

## Mission Workflow

1. **Select a Mission** — Low Earth Orbit (PACE class), Lunar Polar / Mare Rovers (LRO / Artemis class), Mars Reconnaissance / Jezero Crater (MRO / Perseverance), Asteroid Sample Return (Bennu / OSIRIS-REx), Jovian Icy Moon Tour (Europa Clipper), or Free Design sandbox (`sbx`, `sbx_moon`, `sbx_earth`).
2. **Design the Spacecraft** — Balance instruments, solar/MMRTG power, X/Ka comms, propulsion, radiation shielding, C&DH, ADCS, and battery storage. Every engineering metric routes through the single `derive(S)` solver.
3. **Select a Launch Vehicle** — Lift capacity and injection performance follow NASA Launch Services Program (LSP) C3 curves across Falcon 9/Heavy, Atlas V, Vulcan, New Glenn, SLS Block 1B, and Saturn V.
4. **Launch, Cruise & Surface Ops** — Real-time countdown & ascent profile, planetary capture, EDL profile selection, and surface rover traverses across real LRO LOLA and MRO HiRISE terrain patches.
5. **Post-Mission Review & Match Mode** — Inspect engineering logs, compare against historical NASA flight benchmarks (`REAL`), or challenge another player's mission share code (`calcMatchVerdict`).

---

## Repository Structure

```text
index.html              Application entry point, classic script loader, and ES import map
launch_margin.bat       Windows one-click local HTTP server launcher
game.js                 Authoritative simulation core, derive(S), UI state, and 2D fallbacks
js/                     3D presentation scenes, orbital core, and static NASA/JPL data modules
  orrery.js             Shared heliocentric solar-system 3D core
  astronomy*.js         Vendored JPL DE441/DE440/SBDB Chebyshev ephemerides + Keplerian fallback
  *-view.js             Screen renderers (title, select, brief, launch, ops, surface, build-bay)
  *-data.js             Baked HYG stars, NASA hardware specs, LOLA/MOLA/HiRISE terrain, audio
styles/                 Mission Control CSS design system
fonts/                  Locally bundled open-source fonts (Inter, Instrument Sans, IBM Plex Mono, etc.)
models/                 Vendored NASA 3D Resources / PDS GLBs and 8K/2K planetary maps
assets/                 Textures, UI SFX, background theme, and ASSET_SOURCES.md register
vendor/                 Vendored Three.js r160, addons, and Draco WASM decoder
licenses/               Full third-party license texts
```

Presentation modules (`js/`) consume authoritative simulation truth from `game.js`
without writing state back into physics or mission scoring.

---

## Data & Provenance

- **Ephemeris & Dynamics:** Vendored JPL DE441/DE440 and OSIRIS-REx Bennu
  Chebyshev state vectors (`ECLIPTIC_J2000`, `TDB`), with explicit Keplerian
  fallbacks (`FALLBACK_KEPLER`).
- **Terrain & Hardware:** Real NASA PDS LRO LOLA (Moon), MGS MOLA & MRO HiRISE
  (Mars), Bennu radar shape model (PDS), NSSDCA/PDS instrument telemetry, and
  NASA Launch Services Program performance curves.
- **Transparency:** Real NASA measurements vs. simplified engineering models vs.
  visual presentation layers are documented in-game (via the NASA Provenance modal
  and `?` tooltips) and in [`SOURCES.md`](SOURCES.md).

---

## License & Credits

Original source code and project-authored assets are licensed under the **MIT License** — see [`LICENSE`](LICENSE).

Bundled third-party assets retain their respective licenses and attributions:

- **NASA 3D models, ephemerides, terrain grids, textures & launch audio:** Public domain under NASA Media Guidelines.
- **Solar System Scope planet & sky textures:** CC BY 4.0 (*“Planet and sky textures: Solar System Scope, CC BY 4.0”*).
- **HYG v4.0 star catalog:** CC BY-SA 4.0.
- **Three.js / N3rson technique:** MIT; **Draco:** Apache 2.0.
- **Fonts:** SIL OFL 1.1 / Apache 2.0; **UI SFX:** CC0 1.0; **Music:** derived from Google Flow Music (`THIRD_PARTY_NOTICES.md` §6).

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and [`licenses/`](licenses/) for complete legal notices.
