// tape/lib/pinmap.js — which ESP32-S3 pin does what, and which ones you may not
// have. The schematic on /hardware/ is drawn from this, so the picture and the
// firmware cannot disagree.
//
// The ESP32-S3 has 45 GPIOs and a surprising number of them are already spoken
// for. Picking a pin from the middle of the range and finding out at the bench
// is the classic way to lose an evening, so the forbidden set is written down
// and the selftest enforces it.

/** Pins that are not yours, and why. Checked against every assignment below. */
export const RESERVED = [
  { pins: [0], why: 'strapping pin — held low at reset enters the bootloader' },
  { pins: [3], why: 'strapping pin — selects JTAG source at reset' },
  { pins: [19, 20], why: 'native USB D− / D+ — this is how the board is flashed' },
  { pins: [26, 27, 28, 29, 30, 31, 32], why: 'SPI flash on the WROOM-1 module' },
  { pins: [33, 34, 35, 36, 37], why: 'octal SPI PSRAM on any R8 module — the trap, because these look free on the pinout drawing' },
  { pins: [43, 44], why: 'UART0 TX/RX — the serial console you will want when it does not work' },
  { pins: [45, 46], why: 'strapping pins — flash voltage and boot mode' },
];

export const RESERVED_PINS = new Set(RESERVED.flatMap((r) => r.pins));

/** GPIO22–25 are absent on the ESP32-S3: the numbering jumps 21 → 26. */
export const NONEXISTENT = new Set([22, 23, 24, 25]);
export const MAX_GPIO = 48;
export function exists(gpio) {
  return gpio >= 0 && gpio <= MAX_GPIO && !NONEXISTENT.has(gpio);
}

/** ADC1 channels; ADC2 is unusable whenever WiFi is on, which for us is always. */
export const ADC1_PINS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

export const PINS = [
  // I²S to the amplifier
  { gpio: 5,  net: 'I2S_BCLK',  to: 'MAX98357A BCLK', group: 'audio' },
  { gpio: 6,  net: 'I2S_LRCLK', to: 'MAX98357A LRC',  group: 'audio' },
  { gpio: 7,  net: 'I2S_DIN',   to: 'MAX98357A DIN',  group: 'audio' },
  { gpio: 4,  net: 'AMP_SD',    to: 'MAX98357A SD',   group: 'audio',
    note: 'pull low to mute and drop the amp to ~1 µA — used on every pause, and it is what stops a faint hiss in a dark bedroom' },

  // I²C to the NFC reader
  { gpio: 8,  net: 'I2C_SDA',   to: 'PN532 SDA', group: 'nfc' },
  { gpio: 9,  net: 'I2C_SCL',   to: 'PN532 SCL', group: 'nfc' },
  { gpio: 10, net: 'NFC_IRQ',   to: 'PN532 IRQ', group: 'nfc',
    note: 'lets the poll wake on the reader instead of spinning' },
  { gpio: 21, net: 'NFC_RSTO',  to: 'PN532 RSTO', group: 'nfc' },

  // SPI to the SD card
  { gpio: 12, net: 'SD_SCK',    to: 'microSD CLK',  group: 'storage' },
  { gpio: 11, net: 'SD_MOSI',   to: 'microSD DI',   group: 'storage' },
  { gpio: 13, net: 'SD_MISO',   to: 'microSD DO',   group: 'storage' },
  { gpio: 14, net: 'SD_CS',     to: 'microSD CS',   group: 'storage' },

  // Controls
  { gpio: 15, net: 'BTN_BACK',  to: 'arcade button 1', group: 'controls',
    note: 'to ground, internal pull-up, debounced in firmware' },
  { gpio: 16, net: 'BTN_NEXT',  to: 'arcade button 2', group: 'controls' },
  { gpio: 1,  net: 'VOL_WIPER', to: '10 kΩ pot wiper', group: 'controls',
    note: 'ADC1_CH0. The pot ends go to 3V3 and GND; the mechanical end stop is the volume ceiling' },
  { gpio: 17, net: 'LED',       to: 'LED + 330 Ω',     group: 'controls' },

  // Housekeeping
  { gpio: 2,  net: 'VBAT_SENSE', to: '2:1 divider from the cell', group: 'power',
    note: 'ADC1_CH1. Two 100 kΩ resistors — the cell can reach 4.2 V and the ADC cannot' },
];

export const GROUPS = {
  audio:    { label: 'I²S audio', part: 'MAX98357A' },
  nfc:      { label: 'NFC reader', part: 'PN532' },
  storage:  { label: 'SD card', part: 'microSD breakout' },
  controls: { label: 'Controls', part: 'buttons, pot, LED' },
  power:    { label: 'Power sense', part: 'divider' },
};

/** Everything wrong with the assignment, as a list of strings. Empty is good. */
export function problems() {
  const bad = [];
  const seen = new Map();
  for (const p of PINS) {
    if (seen.has(p.gpio)) bad.push(`GPIO${p.gpio} is assigned twice: ${seen.get(p.gpio)} and ${p.net}`);
    seen.set(p.gpio, p.net);
    const r = RESERVED.find((x) => x.pins.includes(p.gpio));
    if (r) bad.push(`GPIO${p.gpio} (${p.net}) is reserved: ${r.why}`);
    if (!exists(p.gpio)) bad.push(`GPIO${p.gpio} (${p.net}) does not exist on this part`);
    if (/VOL_WIPER|VBAT_SENSE/.test(p.net) && !ADC1_PINS.has(p.gpio)) {
      bad.push(`${p.net} needs ADC1 (GPIO1–10); GPIO${p.gpio} is not one`);
    }
  }
  return bad;
}

export function byGroup() {
  return Object.keys(GROUPS).map((g) => ({ ...GROUPS[g], id: g, pins: PINS.filter((p) => p.group === g) }));
}

/** Free pins left over, for whoever adds a screen or a second button. */
export function spare() {
  const used = new Set(PINS.map((p) => p.gpio));
  const out = [];
  for (let g = 0; g <= MAX_GPIO; g++) if (exists(g) && !used.has(g) && !RESERVED_PINS.has(g)) out.push(g);
  return out;
}
