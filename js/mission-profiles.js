"use strict";
/**
 * mission-profiles.js — NASA Mission Architecture Profiles & Extraction Modalities
 * 
 * Provides verified NASA architectural directives per destination:
 * e.g., L2 Lunar Reconnaissance Orbiter (pure remote sensing) vs CLPS Surface Prospector (lander+rover),
 * and L3 MRO Science/Relay Orbiter vs Perseverance Jezero Landing Expedition.
 * 
 * Classic script, zero dependencies. Runs in browser and node environments.
 */
(function (root) {
  var PROFILES = {
    l1: [
      {
        id: "pace",
        name: "Ocean & Aerosol Surveyor",
        sub: "PACE Class · Synoptic Ocean & Atmospheric Science",
        desc: "Wide-field ocean color and aerosol polarimetry. High daily data generation with 14 ground station passes per day in LEO.",
        capM: 750,
        par: { mass: 1900, power: 520, cost: 400 },
        hasRover: false,
        objs: ["o_ocean", "o_aer"],
        parts: ["ocean", "wx", "rad", "therm"]
      },
      {
        id: "landsat",
        name: "Land Surface & Thermal Observatory",
        sub: "Landsat Class · High-Resolution Terrestrial Imaging",
        desc: "VNIR multispectral and thermal infrared imaging. Targeted land-use, agriculture, and coastal change monitoring.",
        capM: 750,
        par: { mass: 2100, power: 550, cost: 420 },
        hasRover: false,
        objs: ["o_land", "o_atm"],
        parts: ["vnir", "therm", "ctx"]
      }
    ],
    l2: [
      {
        id: "orbital",
        name: "Polar Reconnaissance (LRO Class)",
        sub: "Pure Remote Sensing Orbiter · Standoff Mapping",
        desc: "Laser altimetry, gamma-ray ice detection, and context mapping from 50 km orbit. High mass margins, lean budget, zero landing risk.",
        capM: 520,
        par: { mass: 1800, power: 540, cost: 440 },
        hasRover: false,
        objs: ["o_mmap", "o_rad", "o_int"],
        parts: ["alt", "grns", "ctx", "rad", "mag"]
      },
      {
        id: "surface",
        name: "CLPS Polar Prospector (VIPER Class)",
        sub: "Commercial Lunar Delivery · Orbiter + Surface Rover",
        desc: "Powered lunar descent to polar crater rims. Deploys a rover with core drill to sample ground-truth subsurface PSR ice and relay findings.",
        capM: 800,
        par: { mass: 2200, power: 640, cost: 620 },
        hasRover: true,
        objs: ["o_ice", "o_geo", "o_int"],
        parts: ["ctx", "alt", "vnir", "rad"]
      }
    ],
    l3: [
      {
        id: "orbital",
        name: "Reconnaissance & Relay (MRO Class)",
        sub: "High-Throughput Science Orbiter & UHF Telecom Hub",
        desc: "Telescopic imaging (HiRISE class), shallow radar, and an Electra UHF relay hub bridging interplanetary deep space comms.",
        capM: 980,
        par: { mass: 2300, power: 950, cost: 860 },
        hasRover: false,
        objs: ["o_mmap", "o_relay", "o_atm"],
        parts: ["hires", "radar", "relay", "ctx", "alt"]
      },
      {
        id: "surface",
        name: "Surface Astrobiology (Perseverance Class)",
        sub: "Carrier Stage + Landing Rover Expedition",
        desc: "Carrier stage delivers a rover to Jezero Crater Delta. Executes standoff mineralogy, regolith drilling, sample caching, and relay passes.",
        capM: 1400,
        par: { mass: 3200, power: 1300, cost: 1250 },
        hasRover: true,
        objs: ["o_geo", "o_relay", "o_ice"],
        parts: ["ctx", "relay", "alt", "mag"]
      }
    ],
    l4: [
      {
        id: "survey",
        name: "Proximity Standoff Survey",
        sub: "Microgravity Standoff · Laser Altimetry & Spectroscopy",
        desc: "Surveys asteroid shape, gravitational harmonic coefficients, and surface boulder hazards from safe standoff stations.",
        capM: 1200,
        par: { mass: 1800, power: 1200, cost: 900 },
        hasRover: false,
        objs: ["o_mmap", "o_geo", "o_dust"],
        parts: ["alt", "vnir", "therm", "dust"]
      },
      {
        id: "sample",
        name: "TAGSAM Pristine Sample Return",
        sub: "OSIRIS-REx Class · Touch-and-Go Surface Contact",
        desc: "Executes low-speed touch-and-go contact with TAGSAM arm to acquire pristine regolith and return it to Earth.",
        capM: 1500,
        par: { mass: 2100, power: 1400, cost: 1050 },
        hasRover: false,
        force: ["o_samp"],
        objs: ["o_samp", "o_geo", "o_org"],
        parts: ["arm", "vnir", "ctx", "dust"]
      }
    ],
    l5: [
      {
        id: "radar",
        name: "Deep Ice Shell Sounding (REASON)",
        sub: "Europa Clipper · Ice-Penetrating Radar Passes",
        desc: "Sounds the Jovian ice shell down to 30 km depth during high-speed close flybys. Manages massive burst data buffers under DSN constraints.",
        capM: 4500,
        par: { mass: 6000, power: 2700, cost: 4200 },
        hasRover: false,
        objs: ["o_ocw", "o_ice", "o_geo"],
        parts: ["radar", "alt", "ctx", "therm"]
      },
      {
        id: "fields",
        name: "Induced Ocean & Cryovolcanic Plume Hunter",
        sub: "Fields & Particles · Plume Sputter Assays",
        desc: "Measures induced magnetic fields to confirm subsurface liquid water and samples cryovolcanic vapor plumes during flybys.",
        capM: 4200,
        par: { mass: 5400, power: 2400, cost: 3800 },
        hasRover: false,
        objs: ["o_ocw", "o_fld", "o_dust"],
        parts: ["mag", "plas", "dust", "rad", "uso"]
      }
    ]
  };

  function getProfilesFor(levelId) {
    return PROFILES[levelId] || null;
  }

  function activeProfile(S) {
    if (!S || !S.levelId) return null;
    var list = PROFILES[S.levelId];
    if (!list || list.length === 0) return null;
    if (S.profile) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === S.profile) return list[i];
      }
    }
    return list[0];
  }

  function profileSelectorHtml(S) {
    if (!S || !S.levelId) return "";
    var list = PROFILES[S.levelId];
    if (!list || list.length === 0) return "";
    var cur = activeProfile(S);
    var curId = cur ? cur.id : list[0].id;

    var cards = list.map(function (p, idx) {
      var on = p.id === curId;
      return '<button class="obj site ' + (on ? 'sel' : '') + '" data-act="profile" data-id="' + p.id + '" style="--i:' + idx + ';text-align:left;width:100%">'
        + '<div class="site-card-body" style="width:100%">'
        + '<div class="site-header" style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px">'
        + '<span class="t" style="font-size:13px;font-weight:600">' + p.name + '</span>'
        + '<span class="site-badge ' + (on ? 'sel' : '') + '">' + (on ? '<span class="g-icon">check</span> ACTIVE DIRECTIVE' : 'SELECT DIRECTIVE') + '</span>'
        + '</div>'
        + '<span class="d" style="display:block;margin-bottom:6px;color:var(--phosphor);font-size:11.5px">' + p.sub + '</span>'
        + '<p class="hint" style="font-size:11.5px;line-height:1.5;margin-bottom:8px;color:var(--bone)">' + p.desc + '</p>'
        + '<div class="site-metrics-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-family:var(--mono);font-size:11px;background:rgba(255,255,255,0.03);padding:6px 10px;border-radius:4px;border:1px solid rgba(255,255,255,0.04)">'
        + '<div><span style="color:var(--dim);display:block;font-size:9.5px">BUDGET CAP</span><b style="color:var(--phosphor)">$' + p.capM + 'M</b></div>'
        + '<div><span style="color:var(--dim);display:block;font-size:9.5px">PAR MASS</span><b style="color:var(--bone)">' + p.par.mass + ' kg</b></div>'
        + '<div><span style="color:var(--dim);display:block;font-size:9.5px">SURFACE HARDWARE</span><b style="color:' + (p.hasRover ? 'var(--amber)' : 'var(--blue-lift)') + '">' + (p.hasRover ? 'Lander + Rover' : 'Orbiter Only') + '</b></div>'
        + '</div>'
        + '</div></button>';
    }).join("");

    return '<div class="panel glass mt"><span class="bracket tl"></span><span class="bracket br"></span>'
      + '<h3>MISSION ARCHITECTURE DIRECTIVE <span class="code">ARCH-01</span></h3>'
      + '<div class="pad">'
      + '<p class="hint" style="margin-bottom:8px">Select the NASA mission architecture profile. Your choice configures hardware rails, payload expectations, and exploration scope.</p>'
      + '<div class="objlist" style="display:flex;flex-direction:column;gap:8px">' + cards + '</div>'
      + '</div></div>';
  }

  root.MISSION_PROFILES = PROFILES;
  root.getProfilesFor = getProfilesFor;
  root.activeProfile = activeProfile;
  root.profileSelectorHtml = profileSelectorHtml;
  if (typeof globalThis !== "undefined") {
    globalThis.MISSION_PROFILES = PROFILES;
    globalThis.getProfilesFor = getProfilesFor;
    globalThis.activeProfile = activeProfile;
    globalThis.profileSelectorHtml = profileSelectorHtml;
  }
})(typeof window !== "undefined" ? window : globalThis);
