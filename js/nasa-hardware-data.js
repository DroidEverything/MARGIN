/* ══════════════════════════════════════════════════════════════
   NASA COMPONENT FLIGHT DATA & PROVENANCE LAYER (NASA_HARDWARE_DATA)
   ══════════════════════════════════════════════════════════════
   Authoritative provenance registry for MARGIN components.
   Enriches build-bay catalogues (INSTR, POWER, PROP, COMMS, CDH, ADCS,
   BATTERY, ROVER) with verified historical flight metadata, NSSDCA /
   PDS catalog identifiers, actual flight telemetry, and flight history.
   
   CONTRACT:
   - Does NOT modify derive(S) calculations or numerical physics variables.
   - Zero runtime network dependencies (bundled statically).
   - Compatible with offline-first and file:// execution.
   ══════════════════════════════════════════════════════════════ */

"use strict";

const NASA_HARDWARE_DATA = {
  /* ── Scientific Instruments ── */
  instruments: {
    ctx: {
      name: "Context Camera (CTX)",
      mission: "Mars Reconnaissance Orbiter (2005)",
      sponsor: "NASA JPL / Malin Space Science Systems (MSSS)",
      nssdcId: "2005-029A-02",
      flightSpecs: { massKg: 3.1, powerW: 7.7, dataRateMbps: 1.5 },
      pdsUrl: "https://pds-imaging.jpl.nasa.gov/volumes/mro.html",
      heritageClass: "MRO CTX Catadioptric Imager",
      description: "350 mm focal length f/3.2 telescope with 5,064-pixel CCD line array. Acquires 30-km-wide contextual swaths at 6 m/pixel to target high-resolution observations."
    },
    hires: {
      name: "High Resolution Imaging Science Experiment (HiRISE)",
      mission: "Mars Reconnaissance Orbiter (2005)",
      sponsor: "NASA / University of Arizona / Ball Aerospace",
      nssdcId: "2005-029A-01",
      flightSpecs: { massKg: 64.2, powerW: 60.0, dataRateMbps: 6.0 },
      pdsUrl: "https://hirise.lpl.arizona.edu/pds/",
      heritageClass: "HiRISE 0.5 m Cassegrain Telescope",
      description: "Half-meter aperture Cassegrain telescope with 14 TDI CCD detectors. Resolves 0.3 m/pixel surface details from 300 km orbit to analyze sedimentary layering and landing sites."
    },
    therm: {
      name: "Thermal Emission Imaging System (THEMIS)",
      mission: "2001 Mars Odyssey (2001)",
      sponsor: "NASA / Arizona State University",
      nssdcId: "2001-013A-02",
      flightSpecs: { massKg: 11.2, powerW: 13.9, dataRateMbps: 0.3 },
      pdsUrl: "https://themis.asu.edu/",
      heritageClass: "Odyssey THEMIS Multi-Band Thermal Sensor",
      description: "9-band thermal infrared and 5-band visible imager. Maps surface mineralogy, thermal inertia, silica concentrations, and shallow sub-surface rock distributions."
    },
    ocean: {
      name: "Ocean Color Instrument (OCI)",
      mission: "Plankton, Aerosol, Cloud, ocean Ecosystem (PACE, 2024)",
      sponsor: "NASA Goddard Space Flight Center",
      nssdcId: "2024-027A-01",
      flightSpecs: { massKg: 270.0, powerW: 220.0, dataRateMbps: 16.9 },
      pdsUrl: "https://pace.gsfc.nasa.gov/",
      heritageClass: "PACE OCI Hyperspectral Radiometer",
      description: "Advanced tilt-scanning grating spectrometer capturing ultraviolet to near-infrared spectra across ocean phytoplankton blooms, aerosol scattering, and atmospheric dynamics."
    },
    vnir: {
      name: "OSIRIS-REx Visible and InfraRed Spectrometer (OVIRS)",
      mission: "OSIRIS-REx (2016)",
      sponsor: "NASA Goddard Space Flight Center",
      nssdcId: "2016-055A-01",
      flightSpecs: { massKg: 17.8, powerW: 14.5, dataRateMbps: 0.28 },
      pdsUrl: "https://pds-smallbodies.astro.umd.edu/data_sb/missions/orex/ovirs.shtml",
      heritageClass: "OVIRS Point Spectrometer (0.4–4.3 µm)",
      description: "Linear variable filter point spectrometer detecting hydrated clay minerals, carbonates, and organic volatiles on pristine carbonaceous asteroid Bennu."
    },
    msp: {
      name: "Sample Analysis at Mars (SAM)",
      mission: "Curiosity Rover / Mars Science Laboratory (2011)",
      sponsor: "NASA GSFC / CNES / Honeybee Robotics",
      nssdcId: "2011-061A-01",
      flightSpecs: { massKg: 38.5, powerW: 60.0, dataRateMbps: 0.05 },
      pdsUrl: "https://pds-geosciences.wustl.edu/missions/msl/sam.htm",
      heritageClass: "Quadrupole Mass Spec + Gas Chromatograph + Tunable Laser",
      description: "Triple-instrument suite with 74 sample cups and pyrolysis ovens heating drilled Martian rock powder to 900°C to measure carbon, methane, and organics."
    },
    grns: {
      name: "Gamma-Ray and Neutron Spectrometer (GRNS)",
      mission: "MESSENGER (2004) / Lunar Prospector",
      sponsor: "NASA / Johns Hopkins APL",
      nssdcId: "2004-030A-02",
      flightSpecs: { massKg: 13.6, powerW: 24.2, dataRateMbps: 0.02 },
      pdsUrl: "https://pds-geosciences.wustl.edu/missions/messenger/grs.htm",
      heritageClass: "High-Purity Germanium + Scintillator Array",
      description: "Measures cosmic-ray secondary gamma rays and epithermal/fast neutron leakage down to 1 m depth to quantify surface hydrogen, iron, potassium, and buried ice."
    },
    mag: {
      name: "Fluxgate Magnetometer (Juno MAG)",
      mission: "Juno (2011) / MAVEN",
      sponsor: "NASA Goddard Space Flight Center",
      nssdcId: "2011-040A-04",
      flightSpecs: { massKg: 8.9, powerW: 4.5, dataRateMbps: 0.01 },
      pdsUrl: "https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/JUNO/mag.html",
      heritageClass: "Dual Triaxial Fluxgate Magnetometers on 3m Boom",
      description: "Dual triaxial sensors mounted outboard on an isolated boom measuring planetary dynamo generation, magnetospheric current sheets, and induced conducting ocean fields."
    },
    plas: {
      name: "Solar Wind Ion Analyzer (SWIA)",
      mission: "MAVEN (2013)",
      sponsor: "NASA / UC Berkeley Space Sciences Laboratory",
      nssdcId: "2013-063A-05",
      flightSpecs: { massKg: 6.8, powerW: 7.2, dataRateMbps: 0.03 },
      pdsUrl: "https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/MAVEN/swia.html",
      heritageClass: "Toroidal Electrostatic Ion Analyzer",
      description: "Electrostatic deflection analyzer characterizing solar-wind proton/alpha fluxes, magnetotail ions, and atmospheric escape rates driven by extreme space weather."
    },
    dust: {
      name: "Venetia Burney Student Dust Counter (SDC)",
      mission: "New Horizons (2006)",
      sponsor: "NASA / University of Colorado LASP",
      nssdcId: "2006-001A-08",
      flightSpecs: { massKg: 4.1, powerW: 3.5, dataRateMbps: 0.005 },
      pdsUrl: "https://pds-smallbodies.astro.umd.edu/data_sb/missions/newhorizons/sdc.shtml",
      heritageClass: "PVDF Polymer Thin-Film Impact Detector",
      description: "Polyvinylidene fluoride impact sensor detecting dust-grain mass and spatial distribution from Earth through the Kuiper Belt and outer heliosphere."
    },
    radar: {
      name: "Radar for Europa Assessment and Sounding: Ocean to Near-surface (REASON)",
      mission: "Europa Clipper (2024)",
      sponsor: "NASA / University of Texas Institute for Geophysics",
      nssdcId: "2024-188A-04",
      flightSpecs: { massKg: 42.0, powerW: 65.0, dataRateMbps: 1.4 },
      pdsUrl: "https://europa.nasa.gov/mission/instruments/reason/",
      heritageClass: "Dual-Frequency Ice Penetrating Radar (9 MHz / 60 MHz)",
      description: "Dual-band sounder probing Europa's ice shell structure from tens of meters down to the ice-ocean interface, identifying subsurface water pockets and crustal thickness."
    },
    alt: {
      name: "Lunar Orbiter Laser Altimeter (LOLA)",
      mission: "Lunar Reconnaissance Orbiter (2009)",
      sponsor: "NASA Goddard Space Flight Center",
      nssdcId: "2009-031A-01",
      flightSpecs: { massKg: 11.5, powerW: 30.2, dataRateMbps: 0.028 },
      pdsUrl: "https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
      heritageClass: "5-Beam Nd:YAG Laser Profiler (1064 nm)",
      description: "Fires 28 pulses per second split into five beams to build meter-accurate digital elevation maps of lunar polar craters, slopes, roughness, and permanently shadowed regions."
    },
    arm: {
      name: "Touch-And-Go Sample Acquisition Mechanism (TAGSAM)",
      mission: "OSIRIS-REx (2016)",
      sponsor: "NASA / Lockheed Martin Space",
      nssdcId: "2016-055A-06",
      flightSpecs: { massKg: 68.0, powerW: 75.0, dataRateMbps: 0.02 },
      pdsUrl: "https://pds-smallbodies.astro.umd.edu/data_sb/missions/orex/tagsam.shtml",
      heritageClass: "Pneumatic Articulated Sample Arm with High-Purity GN2",
      description: "3.3 m articulated robotic arm using reverse-thruster pressurized nitrogen gas to mobilize and trap over 120 g of pristine regolith in a five-second contact burn."
    },
    drill: {
      name: "Mars 2020 Rotary-Percussive Coring Drill",
      mission: "Perseverance Rover / Mars 2020 (2020)",
      sponsor: "NASA Jet Propulsion Laboratory",
      nssdcId: "2020-052A-01",
      flightSpecs: { massKg: 65.0, powerW: 110.0, dataRateMbps: 0.02 },
      pdsUrl: "https://mars.nasa.gov/mars2020/spacecraft/rover/sample-handling/",
      heritageClass: "Rotary-Percussive Coring Turret & Hermetic Seal Vault",
      description: "Robotic turret drill capturing 6-cm-long rock cores directly into hermetically sealed ultra-clean titanium sample tubes for future Earth return retrieval."
    },
    seis: {
      name: "Seismic Experiment for Interior Structure (SEIS)",
      mission: "InSight (2018)",
      sponsor: "NASA / CNES / IPGP / Imperial College / ETH Zurich",
      nssdcId: "2018-042A-01",
      flightSpecs: { massKg: 29.5, powerW: 5.5, dataRateMbps: 0.01 },
      pdsUrl: "https://pds-geosciences.wustl.edu/missions/insight/seis.htm",
      heritageClass: "Very Broad Band (VBB) + Short Period (SP) Seismometer",
      description: "Ultra-sensitive broad-band planetary seismometer inside an evacuated sphere beneath a wind/thermal shield, resolving marsquakes, crustal thickness, and core size."
    },
    wx: {
      name: "Mars Environmental Dynamics Analyzer (MEDA)",
      mission: "Perseverance Rover / Mars 2020 (2020)",
      sponsor: "NASA / Centro de Astrobiología (CAB / CSIC)",
      nssdcId: "2020-052A-06",
      flightSpecs: { massKg: 5.5, powerW: 17.0, dataRateMbps: 0.005 },
      pdsUrl: "https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/MARS/perseverance/meda.html",
      heritageClass: "Atmospheric Weather & Radiation Sensor Suite",
      description: "Distributed surface sensors measuring ambient temperature, pressure, wind velocity, humidity, infrared radiation, and dust particle size/opacity."
    },
    uso: {
      name: "Ultra-Stable Oscillator (USO - Deep Space Radio Science)",
      mission: "Mars Global Surveyor / Cassini / Europa Clipper",
      sponsor: "NASA / Johns Hopkins APL / Frequency Electronics",
      nssdcId: "1996-062A-03",
      flightSpecs: { massKg: 2.8, powerW: 5.8, dataRateMbps: 0.0 },
      pdsUrl: "https://pds-geosciences.wustl.edu/missions/mgs/rs.htm",
      heritageClass: "Precision SC-Cut Quartz Crystal Oscillator ($10^{-13}$ Allan Dev)",
      description: "Extremely stable frequency reference clock powering radio occultation measurements to infer planetary neutral atmospheres, ionospheric profiles, and gravity fields."
    },
    rad: {
      name: "Radiation Assessment Detector (RAD)",
      mission: "Curiosity Rover / MSL (2011)",
      sponsor: "NASA / Southwest Research Institute / Christian-Albrechts-Univ",
      nssdcId: "2011-061A-04",
      flightSpecs: { massKg: 1.7, powerW: 4.2, dataRateMbps: 0.002 },
      pdsUrl: "https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/MSL/rad.html",
      heritageClass: "Silicon Detectors + CsI Scintillator Telescope",
      description: "Detects energetic galactic cosmic rays and solar energetic particles throughout interplanetary cruise and surface operations, determining biological radiation dose equivalent."
    },
    relay: {
      name: "Electra UHF Proximity Relay",
      mission: "Mars Reconnaissance Orbiter (2005) / MAVEN",
      sponsor: "NASA Jet Propulsion Laboratory",
      nssdcId: "2005-029A-07",
      flightSpecs: { massKg: 14.5, powerW: 35.0, dataRateMbps: 2.0 },
      pdsUrl: "https://descanso.jpl.nasa.gov/monograph/series12/Descanso12_all.pdf",
      heritageClass: "Software-Defined UHF Proximity-1 Transceiver (390–450 MHz)",
      description: "Software-defined radio establishing autonomous bidirectional UHF link with surface landers and rovers, relaying critical entry telemetry and high-volume science data."
    }
  },

  /* ── Power Subsystems ── */
  power: {
    sa1: {
      name: "Fixed Rigid GaAs Solar Array (0.3 kW class)",
      flightOrigin: "SmallSat / LEO Explorer baseline (Spectrolab NeXt Triple Junction)",
      heritageClass: "Rigid Aluminum-Honeycomb / Carbon-Fiber Wing",
      efficiency: "29.5% AM0 cell efficiency, ~160 W/m² at 1 AU",
      description: "Compact dual-wing rigid planar array suitable for inner solar system orbiters where solar flux is abundant."
    },
    sa2: {
      name: "Tracking UltraFlex Solar Array (0.7 kW class)",
      flightOrigin: "Lunar Reconnaissance Orbiter (LRO) / Phoenix Mars Lander",
      heritageClass: "Single-Axis Articulated Sun-Tracking Wing",
      efficiency: "High-area-ratio multi-panel deployed wing with motorized drive",
      description: "Articulated tracking array maintaining optimal solar incidence angle throughout planetary orbit operations."
    },
    sa3: {
      name: "Deployable Multi-Panel Solar Array (1.6 kW class)",
      flightOrigin: "Mars Reconnaissance Orbiter (MRO) / Deep Space 1",
      heritageClass: "Dual 3-Panel Articulated Wings (~20 m² total)",
      efficiency: "Provides 2,000 W at Earth (1 AU) and ~1,000 W at Mars (1.52 AU)",
      description: "High-area deployable wing architecture engineered to power heavy telecom amplifiers and radar suites out to the asteroid belt."
    },
    sa4: {
      name: "Flagship Deep-Space Solar Wing (Clipper class, 20 kW)",
      flightOrigin: "Europa Clipper (2024)",
      heritageClass: "Dual 5-Panel Wings, 30.5 m wingspan (102 m² total aperture)",
      efficiency: "Generates 24 kW at 1 AU, scaling down to 740 W at Jupiter (5.2 AU)",
      description: "The largest solar arrays ever flown on a planetary mission, utilizing ultra-pure Germanium triple-junction cells to overcome Jupiter's extreme cold and dim sunlight."
    },
    rtg1: {
      name: "Multi-Mission Radioisotope Thermoelectric Generator (MMRTG)",
      flightOrigin: "Curiosity (2011) / Perseverance (2020) / Dragonfly",
      heritageClass: "NASA / Department of Energy (DOE) Aerojet Rocketdyne Unit",
      efficiency: "4.8 kg Plutonium-238 Dioxide (PuO2) producing 2,000 W thermal / 110 W electric",
      description: "Solid-state Lead-Telluride (PbTe/TAGS) thermocouples convert decay heat into continuous electrical power independent of distance from the Sun, shadows, or dust storms."
    },
    rtg2: {
      name: "Dual MMRTG Flagship Power System (220 W class)",
      flightOrigin: "Proposed Outer Planet Flagship / Cassini-class architecture",
      heritageClass: "Dual Cross-Strapped MMRTG Units",
      efficiency: "9.6 kg PuO2 fuel load generating ~4,000 W thermal / 220 W electric",
      description: "Dual-unit cross-strapped installation ensuring uninterrupted operations and substantial waste heat for thermal conditioning in the outer solar system."
    }
  },

  /* ── Propulsion Subsystems ── */
  propulsion: {
    none: {
      name: "Ballistic Cruise (No Main Propulsion)",
      flightOrigin: "Flyby probes / Direct-injection Earth explorers",
      heritageClass: "Passive Flight Dynamics",
      description: "Zero main propulsion dry mass. Mission trajectory relies entirely on launch vehicle injection accuracy and planetary gravity assists."
    },
    mono: {
      name: "Catalytic Hydrazine Monopropellant",
      flightOrigin: "LRO / Phoenix / Mars Odyssey / Genesis",
      heritageClass: "Aerojet Rocketdyne MR-106 / MR-107 thruster cluster",
      efficiency: "Specific Impulse 225–235 s (Blowdown N2H4 over Shell 405 iridium catalyst)",
      description: "Simple, highly reliable single-liquid chemical system with pressure-fed titanium tanks. Ideal for modest trajectory adjustments and attitude momentum dumping."
    },
    bi: {
      name: "Bipropellant Apogee Engine (MMH / NTO)",
      flightOrigin: "Galileo / Cassini-Huygens / Mars Express",
      heritageClass: "Aerojet Rocketdyne R-4D-11 / Moog LEROS-1b (400 N class)",
      efficiency: "Specific Impulse 315–322 s (Monomethylhydrazine + Nitrogen Tetroxide)",
      description: "Hypergolic bipropellant system delivering high thrust and efficiency for massive planetary capture burns and orbit circularization maneuvers."
    },
    dual: {
      name: "Dual-Mode Propulsion System",
      flightOrigin: "Mars Reconnaissance Orbiter (MRO) / Mars Global Surveyor",
      heritageClass: "Common Hydrazine Tank shared between Bipropellant Engine and RCS",
      efficiency: "Specific Impulse 335 s main engine / 230 s attitude thrusters",
      description: "High-efficiency hybrid feeding a high-performance bipropellant main engine for capture while utilizing pure hydrazine for RCS fine attitude control."
    },
    sep: {
      name: "NASA Evolutionary Xenon Thruster - Commercial (NEXT-C)",
      flightOrigin: "DART (Double Asteroid Redirection Test, 2021)",
      heritageClass: "NASA Glenn Research Center / Aerojet Rocketdyne Gridded Ion Engine",
      efficiency: "Specific Impulse 4,190 s at full throttle (3.5 kW PPU, Xenon propellant)",
      description: "State-of-the-art gridded electrostatic ion propulsion system delivering continuous high-efficiency thrust for high-energy deep-space transfers."
    }
  },

  /* ── Communications Subsystems ── */
  comms: {
    lga: {
      name: "S-Band Low-Gain Omni Antenna (LGA)",
      flightOrigin: "Universal NASA Deep Space Standard (MRO, New Horizons, Clipper)",
      heritageClass: "Crossed Dipole / Choked Patch Antenna (Hemispheric Pattern)",
      efficiency: "RF Gain: 6 dBi",
      description: "Broad-beam omnidirectional coverage ensuring command uplink and emergency safing telemetry can be acquired regardless of spacecraft tumble or pointing error."
    },
    mga: {
      name: "X-Band Medium-Gain Horn Antenna (MGA)",
      flightOrigin: "Mars Reconnaissance Orbiter / Dawn / New Horizons",
      heritageClass: "Conical Corrugated Horn",
      efficiency: "RF Gain: 22 dBi (~20° beamwidth)",
      description: "Intermediate horn antenna offering moderate gain without requiring sub-degree articulation accuracy. Used during cruise maneuvers and safe-hold transitions."
    },
    hga2: {
      name: "2.0 m Parabolic High-Gain Antenna (X-Band)",
      flightOrigin: "Lunar Reconnaissance Orbiter (LRO) / Magellan / MESSENGER",
      heritageClass: "Carbon-Composite Honeycomb Reflector (X-Band 8.4 GHz)",
      efficiency: "RF Gain: 45 dBi (0.8° half-power beamwidth)",
      description: "Directional parabolic dish delivering high-speed science data downlinks to Deep Space Network 34 m and 70 m receiver dishes."
    },
    hga3: {
      name: "3.0 m Dual-Band High-Gain Antenna (X/Ka-Band)",
      flightOrigin: "Europa Clipper (2024) / Mars Global Surveyor / Cassini (4m)",
      heritageClass: "Carbon-Fiber Parabolic Dish with Dichroic Subreflector",
      efficiency: "RF Gain: 51 dBi (X-band) / >55 dBi (Ka-band)",
      description: "Heavy high-gain dish designed to maintain multi-megabit downlink pipelines across multi-astronomical-unit distances from the outer solar system."
    },
    ka: {
      name: "3.0 m High-Gain Antenna + Deep Space Ka-Band Package",
      flightOrigin: "MRO Ka-Band Experiment / Europa Clipper / Psyche DSOC Companion",
      heritageClass: "Dual 32 GHz Ka-band Traveling Wave Tube Amplifiers (TWTA)",
      efficiency: "RF Gain: 56 dBi (narrow 0.2° beamwidth, 100 W TWTA output)",
      description: "High-frequency Ka-band transmission offering over 3× data volume compared to standard X-band downlinks, requiring precise milli-degree gimbal pointing."
    }
  },

  /* ── Avionics & Flight Computers (C&DH) ── */
  cdh: {
    cdh_std: {
      name: "BAE RAD750 Single Board Computer",
      flightOrigin: "MRO / LRO / Curiosity / Kepler / Juno / Lunar Prospector",
      heritageClass: "Radiation-Hardened 133 MHz PowerPC Architecture",
      specs: "10.4 MIPS, >100 krad(Si) total ionizing dose, SpaceWire & MIL-STD-1553 bus",
      description: "The gold standard of NASA planetary avionics. Flown on over 100 deep-space missions with zero catastrophic on-orbit processor failures."
    },
    cdh_dual: {
      name: "Fault-Tolerant Dual-Lockstep C&DH Vault",
      flightOrigin: "Europa Clipper (2024) / Cassini-class fault architecture",
      heritageClass: "Dual Cross-Strapped RAD750 Processors inside Thick Shield Vault",
      specs: "Triple-modular redundancy (TMR) voting logic, latch-up immune",
      description: "Dual processors executing code in continuous hardware lockstep. Automatically detects and isolates single-event radiation upsets in harsh Jovian environments."
    },
    cdh_edge: {
      name: "SpaceCube 2.0 / HPSC Multicore Coprocessor",
      flightOrigin: "NASA GSFC SpaceCube v2.0 / ISS STP-H5 / OSIRIS-REx NavCam test",
      heritageClass: "Hybrid Radiation-Tolerant FPGA / Multi-core DSP Architecture",
      specs: "Over 10× processing throughput of standard RAD750, onboard CV & AI pipeline",
      description: "High-performance edge-computing package allowing onboard autonomous optical navigation, crater identification, and real-time data compression."
    }
  },

  /* ── Attitude Determination & Control System (ADCS) ── */
  adcs: {
    adcs_std: {
      name: "3-Axis Skewed Reaction Wheel Cluster (Pyramid)",
      flightOrigin: "LRO / Landsat 8 / MRO / Mars Odyssey",
      heritageClass: "4 × Collins Aerospace / Honeywell 50 Nms Reaction Wheels + Dual Star Trackers",
      pointing: "0.05° pointing accuracy, autonomous star tracker attitude recovery",
      description: "Four skewed momentum wheels in a tetrahedral pyramid providing full 3-axis pointing authority and redundancy against any single wheel friction failure."
    },
    adcs_prec: {
      name: "Control Moment Gyroscopes (CMG) & Fine Guidance Sensors",
      flightOrigin: "Hubble Space Telescope / Roman Space Telescope / ISS",
      heritageClass: "High-Torque CMG Cluster + Fine Guidance Interferometers",
      pointing: "Sub-arcsecond pointing stability (<0.001°), rapid slew agility",
      description: "Rotates spinning flywheels on gimbaled axes to exchange massive angular momentum without friction jitter, enabling ultra-stable long-exposure science."
    },
    adcs_micro: {
      name: "Cold-Gas Pulsed Micro-Thruster Slew System",
      flightOrigin: "OSIRIS-REx / New Horizons / Cassini proximity operations",
      heritageClass: "High-Purity GN2 Cold-Gas Nozzle Cluster",
      pointing: "Fast slew maneuvers, zero reaction wheel torque saturation",
      description: "Independent cold-gas thruster pack providing rapid turn rates and attitude safe-hold during close-proximity asteroid tagging and powered descent."
    }
  },

  /* ── Energy Storage & Secondary Batteries ── */
  battery: {
    bat_std: {
      name: "Standard Spaceflight Li-ion Bus Battery (400 Wh)",
      flightOrigin: "Standard LEO / Planetary Probe baseline (Yardney / ABSL)",
      heritageClass: "28 V Space-Grade Lithium-Ion Cells (Hermetic Prismatic)",
      storage: "400 Wh capacity, standard 30% depth-of-discharge (DoD)",
      description: "Standard secondary bus battery buffering orbital eclipse darkness in Earth orbit and transient thruster valve firing loads."
    },
    bat_ext: {
      name: "High-Capacity Spaceflight Battery (1.2 kWh)",
      flightOrigin: "LRO (Lunar Reconnaissance Orbiter 3.2 kWh battery heritage)",
      heritageClass: "Lithium-Ion Space-Qualified Battery Pack with Thermal Isolation",
      storage: "1,200 Wh capacity, supports extended 2-hour shadow passes",
      description: "Expanded battery capacity engineered for deep lunar polar crater shadow crossings and prolonged communication downlink passes."
    },
    bat_deep: {
      name: "Deep-Discharge Hardened Battery Vault (3.2 kWh)",
      flightOrigin: "Lunar Surface Delivery (CLPS) / Outer Planet Explorer",
      heritageClass: "Lithium-Iron-Phosphate (LiFePO4) Low-Temperature Chemistry",
      storage: "3,200 Wh capacity, deep cycle survival under extreme cold",
      description: "Heavy insulated battery vault capable of powering vital spacecraft survival heaters during prolonged multi-day darkness or Jupiter radiation eclipses."
    }
  }
};

/* Global accessor function */
function getNasaHardwareData(category, id) {
  if (!NASA_HARDWARE_DATA[category]) return null;
  return NASA_HARDWARE_DATA[category][id] || null;
}
