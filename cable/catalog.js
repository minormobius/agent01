// cable/catalog.js — the parts library the solver reasons over.
//
// A cable assembly bridges a BOARD connector and a COMPONENT connector with a
// run of cable, terminated by a pin (contact) set at each end. This file is the
// small-but-real library of the pieces involved: components and the signals they
// carry, connector families, contact (pin) families, crimp tools, reference
// boards, and the wire-gauge reference tables the solver uses to size things.
//
// Everything attaches to globalThis.CABLE_CATALOG so it loads both in the browser
// (plain <script>) and in node for unit tests (see cable/README.md).

(function (root) {
  "use strict";

  // ── Wire-gauge reference (AWG) ──────────────────────────────────────────────
  // Chassis-wiring ampacity (A) and DC resistance (ohm/m) by AWG. These are the
  // commonly-cited reference figures used for sizing short instrument cables;
  // they are deliberately conservative and not a substitute for the applicable
  // electrical code on a given install.
  const AWG = {
    32: { amps: 0.91, ohmPerM: 0.538, mm2: 0.032 },
    30: { amps: 1.4,  ohmPerM: 0.339, mm2: 0.051 },
    28: { amps: 1.8,  ohmPerM: 0.213, mm2: 0.081 },
    26: { amps: 2.2,  ohmPerM: 0.134, mm2: 0.129 },
    24: { amps: 3.5,  ohmPerM: 0.0842, mm2: 0.205 },
    22: { amps: 7.0,  ohmPerM: 0.0530, mm2: 0.326 },
    20: { amps: 11.0, ohmPerM: 0.0333, mm2: 0.518 },
    18: { amps: 16.0, ohmPerM: 0.0209, mm2: 0.823 },
    16: { amps: 22.0, ohmPerM: 0.0132, mm2: 1.31 },
  };
  // Descending gauge order (finest → heaviest) so the solver can pick the finest
  // wire that still carries the current.
  const AWG_ORDER = [32, 30, 28, 26, 24, 22, 20, 18, 16];

  // Representative stranding by flex requirement. Real lay-up varies by gauge;
  // these are the typical classes called out on a cable drawing.
  const STRANDING = {
    static:          { strands: 7,  cls: "Class 2 (7-strand)",  note: "fixed routing, no movement" },
    flexible:        { strands: 19, cls: "Class 5 (19-strand)", note: "occasional flex / re-routing" },
    "continuous-flex": { strands: 41, cls: "Class 6 (41+ strand)", note: "cable-track / continuous motion" },
  };

  // Twisted-pair lay length by data rate band. Tighter lay (shorter) rejects more
  // common-mode noise and is required as edge rates climb.
  const TWIST = {
    none:   null,
    low:    { layMm: 25, label: "loose (≈25 mm lay, ≈40 turns/m)", band: "≤1 Mbps / slow analog pairs" },
    medium: { layMm: 15, label: "medium (≈15 mm lay, ≈67 turns/m)", band: "1–100 Mbps" },
    high:   { layMm: 10, label: "tight (≈10 mm lay, ≈100 turns/m)", band: ">100 Mbps / high-edge-rate" },
  };

  // ── Crimp tools ─────────────────────────────────────────────────────────────
  const crimpTools = {
    crimp_m12:      { id: "crimp_m12",      name: "M12 field-wireable crimp tool", die: "0.34–1.5 mm² hex die", note: "or solder-cup variant (no tool)" },
    crimp_dsub:     { id: "crimp_dsub",     name: "D-Sub machined-contact crimper", die: "AWG 20–28 turret head", note: "e.g. DMC AF8 + TH1A positioner" },
    crimp_microfit: { id: "crimp_microfit", name: "Molex Micro-Fit hand crimper",   die: "63819-0000 (20–24) / 63819-0900 (26–30)" },
    crimp_minifit:  { id: "crimp_minifit",  name: "Molex Mini-Fit Jr. hand crimper", die: "63819-0000 / 0011-0023 die set, 18–24 AWG" },
    crimp_mil:      { id: "crimp_mil",      name: "MIL circular crimp tool (M22520)", die: "M22520/2-01 + positioner", note: "size-16/20 contacts" },
    crimp_jst_ph:   { id: "crimp_jst_ph",   name: "JST PH crimper (WC-110)",         die: "PH 2.0 die, AWG 24–32" },
    crimp_kk254:    { id: "crimp_kk254",    name: "Molex KK 2.54 crimper",           die: "63811-1000, AWG 22–30" },
    screwdriver:    { id: "screwdriver",    name: "Flat 2.5 mm screwdriver",         die: "torque to terminal spec (no crimp)", note: "screw-clamp termination" },
    idc_press:      { id: "idc_press",      name: "IDC ribbon press / bench fixture", die: "displaces insulation, no strip", note: "ribbon must match pitch" },
  };

  // ── Contact (pin) families ──────────────────────────────────────────────────
  // gaugeMin/gaugeMax are the AWG window the contact crimps (min = finest number,
  // i.e. heaviest wire). amps = per-contact current rating.
  const contacts = {
    m12_crimp:     { id: "m12_crimp",     name: "M12 crimp contact (gold)",        gaugeHeavy: 18, gaugeFine: 28, amps: 4,  term: "crimp", tool: "crimp_m12" },
    dsub_machined: { id: "dsub_machined", name: "D-Sub machined contact (gold)",   gaugeHeavy: 20, gaugeFine: 30, amps: 5,  term: "crimp", tool: "crimp_dsub" },
    microfit:      { id: "microfit",      name: "Micro-Fit 3.0 crimp terminal",    gaugeHeavy: 20, gaugeFine: 30, amps: 5,  term: "crimp", tool: "crimp_microfit" },
    minifit:       { id: "minifit",       name: "Mini-Fit Jr. crimp terminal",     gaugeHeavy: 18, gaugeFine: 24, amps: 9,  term: "crimp", tool: "crimp_minifit" },
    mil_size16:    { id: "mil_size16",    name: "MIL size-16 crimp contact",       gaugeHeavy: 16, gaugeFine: 22, amps: 13, term: "crimp", tool: "crimp_mil" },
    jst_ph:        { id: "jst_ph",        name: "JST PH crimp contact",            gaugeHeavy: 24, gaugeFine: 32, amps: 2,  term: "crimp", tool: "crimp_jst_ph" },
    kk254:         { id: "kk254",         name: "Molex KK 2.54 crimp terminal",    gaugeHeavy: 22, gaugeFine: 30, amps: 3,  term: "crimp", tool: "crimp_kk254" },
    screw_clamp:   { id: "screw_clamp",   name: "Screw-clamp wire entry (ferrule)", gaugeHeavy: 16, gaugeFine: 28, amps: 8,  term: "screw", tool: "screwdriver" },
    idc:           { id: "idc",           name: "IDC ribbon contact",              gaugeHeavy: 28, gaugeFine: 28, amps: 1,  term: "idc",   tool: "idc_press" },
  };

  // ── Connector families ──────────────────────────────────────────────────────
  // positions = the position counts the family is offered in (the solver picks
  // the smallest ≥ required conductors). side = where it's typically used.
  const connectors = {
    m12_a:        { id: "m12_a",        name: "M12 A-coded circular",      positions: [3, 4, 5, 8],            contact: "m12_crimp",     ip: "IP67", lock: "M12×1 thread", side: "component" },
    dsub:         { id: "dsub",         name: "D-Sub (DA/DB/DC)",          positions: [9, 15, 25],             contact: "dsub_machined", ip: "—",    lock: "4-40 jackscrews", side: "component" },
    circular_mil: { id: "circular_mil", name: "Circular MIL-style (5015)", positions: [3, 4, 7, 10, 14],       contact: "mil_size16",    ip: "IP67", lock: "bayonet/threaded", side: "component" },
    microfit:     { id: "microfit",     name: "Molex Micro-Fit 3.0",       positions: [2, 4, 6, 8, 10, 12],    contact: "microfit",      ip: "—",    lock: "positive latch", side: "both" },
    minifit:      { id: "minifit",      name: "Molex Mini-Fit Jr.",        positions: [2, 4, 6, 8],            contact: "minifit",       ip: "—",    lock: "positive latch", side: "both" },
    jst_ph:       { id: "jst_ph",       name: "JST PH 2.0 mm",             positions: [2, 3, 4, 5, 6],         contact: "jst_ph",        ip: "—",    lock: "friction + ramp", side: "board" },
    phoenix_mc:   { id: "phoenix_mc",   name: "Phoenix MC 1.5 screw block", positions: [2, 3, 4, 5, 6, 8, 10, 12], contact: "screw_clamp", ip: "—", lock: "pluggable screw block", side: "board" },
    idc_header:   { id: "idc_header",   name: "2.54 mm IDC box header",    positions: [10, 14, 16, 20, 26],    contact: "idc",           ip: "—",    lock: "shrouded + ejectors", side: "board" },
    kk254:        { id: "kk254",        name: "Molex KK 2.54 board header", positions: [2, 3, 4, 5, 6, 8, 10, 12], contact: "kk254",      ip: "—",    lock: "friction latch", side: "board" },
  };

  // ── Reference boards (the custom boards that present a defined connector) ─────
  // header = the connector family the board exposes for this class of signal.
  const boards = {
    daq_24bit:   { id: "daq_24bit",   name: "24-bit DAQ board",        header: "phoenix_mc", domain: "low-level analog / sensor", note: "pluggable screw blocks per channel" },
    sensor_hub:  { id: "sensor_hub",  name: "Sensor hub board",        header: "microfit",   domain: "mixed signal / powered sensors" },
    motion_ctrl: { id: "motion_ctrl", name: "Motion controller board", header: "minifit",    domain: "motor / actuator power" },
    breakout254: { id: "breakout254", name: "2.54 mm breakout board",  header: "kk254",      domain: "general prototyping" },
    generic:     { id: "generic",     name: "Generic board (pick header)", header: null,     domain: "you choose the board-side connector" },
  };

  // ── Components and the signals they carry ─────────────────────────────────────
  // Each line is one logical signal. type ∈ power|ground|analog|digital|shield.
  // A pair groups two lines that must be run as a twisted pair (each line is still
  // its own conductor). rate (for pairs/digital) drives twist tightness.
  // current (A) on the heaviest line drives gauge selection.
  const components = {
    rtd_4wire: {
      id: "rtd_4wire", name: "Pt100 RTD, 4-wire", domain: "temperature",
      connectors: ["m12_a", "dsub", "circular_mil"],
      shield: "recommended", env: "industrial", rate: "low",
      lines: [
        { name: "EXC+", type: "analog", current: 0.001 },
        { name: "EXC−", type: "analog", current: 0.001 },
        { name: "SEN+", type: "analog", current: 0.001 },
        { name: "SEN−", type: "analog", current: 0.001 },
      ],
    },
    loadcell_6wire: {
      id: "loadcell_6wire", name: "Load cell, 6-wire bridge", domain: "force / weight",
      connectors: ["circular_mil", "m12_a", "dsub"],
      shield: "required", env: "industrial", rate: "low",
      lines: [
        { name: "EXC+", type: "analog", current: 0.03 },
        { name: "EXC−", type: "analog", current: 0.03 },
        { name: "SIG+", type: "analog", current: 0.001 },
        { name: "SIG−", type: "analog", current: 0.001 },
        { name: "SNS+", type: "analog", current: 0.001 },
        { name: "SNS−", type: "analog", current: 0.001 },
      ],
    },
    encoder_diff: {
      id: "encoder_diff", name: "Incremental encoder, differential 5 V", domain: "motion feedback",
      connectors: ["m12_a", "dsub", "circular_mil"],
      shield: "required", env: "industrial", rate: "medium",
      lines: [
        { name: "+5V", type: "power", current: 0.15 },
        { name: "GND", type: "ground", current: 0.15 },
        { name: "A",  type: "digital", current: 0.02, pair: "A" },
        { name: "A̅",  type: "digital", current: 0.02, pair: "A" },
        { name: "B",  type: "digital", current: 0.02, pair: "B" },
        { name: "B̅",  type: "digital", current: 0.02, pair: "B" },
        { name: "Z",  type: "digital", current: 0.02, pair: "Z" },
        { name: "Z̅",  type: "digital", current: 0.02, pair: "Z" },
      ],
    },
    rs485_sensor: {
      id: "rs485_sensor", name: "RS-485 smart sensor", domain: "digital bus",
      connectors: ["m12_a", "dsub", "microfit"],
      shield: "recommended", env: "industrial", rate: "low",
      lines: [
        { name: "V+",  type: "power", current: 0.2 },
        { name: "GND", type: "ground", current: 0.2 },
        { name: "D+",  type: "digital", current: 0.02, pair: "D" },
        { name: "D−",  type: "digital", current: 0.02, pair: "D" },
      ],
    },
    pressure_420: {
      id: "pressure_420", name: "Pressure transducer, 3-wire 4–20 mA", domain: "process",
      connectors: ["m12_a", "dsub"],
      shield: "recommended", env: "industrial", rate: "low",
      lines: [
        { name: "V+",  type: "power", current: 0.05 },
        { name: "SIG", type: "analog", current: 0.02 },
        { name: "GND", type: "ground", current: 0.05 },
      ],
    },
    stepper_nema17: {
      id: "stepper_nema17", name: "Stepper motor, NEMA 17 bipolar", domain: "actuator",
      connectors: ["minifit", "microfit", "circular_mil"],
      shield: "optional", env: "industrial", rate: "none",
      lines: [
        { name: "A+", type: "power", current: 2.0 },
        { name: "A−", type: "power", current: 2.0 },
        { name: "B+", type: "power", current: 2.0 },
        { name: "B−", type: "power", current: 2.0 },
      ],
    },
    gearmotor_dc: {
      id: "gearmotor_dc", name: "Brushed DC gearmotor", domain: "actuator",
      connectors: ["minifit", "circular_mil"],
      shield: "optional", env: "industrial", rate: "none",
      lines: [
        { name: "M+", type: "power", current: 5.0 },
        { name: "M−", type: "power", current: 5.0 },
      ],
    },
    solenoid_24v: {
      id: "solenoid_24v", name: "Solenoid valve, 24 V", domain: "actuator",
      connectors: ["m12_a", "minifit"],
      shield: "optional", env: "industrial", rate: "none",
      lines: [
        { name: "V+", type: "power", current: 0.5 },
        { name: "V−", type: "power", current: 0.5 },
      ],
    },
  };

  root.CABLE_CATALOG = {
    AWG, AWG_ORDER, STRANDING, TWIST,
    crimpTools, contacts, connectors, boards, components,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
