// ── Hardware Connectivity ──
// Web Serial API for RS-232 lab instruments (plate readers, spectrophotometers).
// Web Bluetooth API for BLE sensors (Arduino Nano 33 BLE, ESP32, etc.).
// Data from connected devices streams into DuckDB tables for SQL querying.

window.LabHardware = (() => {
  const devices = new Map(); // id -> { type, port/device, name, reader, buffer }
  let deviceIdCounter = 0;

  // ── Web Serial ──

  async function connectSerial(options = {}) {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API not supported. Use Chrome or Edge.');
    }

    const port = await navigator.serial.requestPort();
    await port.open({
      baudRate: options.baudRate || 9600,
      dataBits: options.dataBits || 8,
      stopBits: options.stopBits || 1,
      parity: options.parity || 'none',
    });

    const id = 'serial-' + (++deviceIdCounter);
    const device = {
      id,
      type: 'serial',
      port,
      name: `Serial Port ${deviceIdCounter}`,
      buffer: '',
      data: [],
      onData: null,
    };

    devices.set(id, device);
    updateDeviceList();
    updateStatus();

    // Start reading
    readSerialLoop(device);

    return device;
  }

  async function readSerialLoop(device) {
    const decoder = new TextDecoderStream();
    device.port.readable.pipeTo(decoder.writable);
    const reader = decoder.readable.getReader();
    device.reader = reader;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        device.buffer += value;

        // Split on newlines — most lab instruments send line-delimited data
        const lines = device.buffer.split('\n');
        device.buffer = lines.pop(); // keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          const entry = {
            timestamp: Date.now(),
            raw: trimmed,
            values: parseDataLine(trimmed),
          };

          device.data.push(entry);

          // Push to DuckDB if available
          if (LabDuckDB.isReady()) {
            await insertHardwareReading(device, entry);
          }

          if (device.onData) device.onData(entry);
        }
      }
    } catch (err) {
      if (err.name !== 'TypeError') { // port closed
        console.error('Serial read error:', err);
      }
    }
  }

  // ── Web Bluetooth ──

  async function connectBluetooth(options = {}) {
    if (!('bluetooth' in navigator)) {
      throw new Error('Web Bluetooth API not supported. Use Chrome or Edge.');
    }

    const bleDevice = await navigator.bluetooth.requestDevice({
      acceptAllDevices: options.acceptAll !== false,
      optionalServices: options.services || [
        'battery_service',
        'environmental_sensing',
        'health_thermometer',
        'heart_rate',
        // Arduino/ESP32 custom service UUIDs can be added here
        '19b10000-e8f2-537e-4f6c-d104768a1214', // Arduino BLE default
      ],
    });

    const server = await bleDevice.gatt.connect();
    const id = 'ble-' + (++deviceIdCounter);

    const device = {
      id,
      type: 'bluetooth',
      bleDevice,
      server,
      name: bleDevice.name || `BLE Device ${deviceIdCounter}`,
      data: [],
      characteristics: [],
      onData: null,
    };

    devices.set(id, device);
    updateDeviceList();
    updateStatus();

    // Auto-discover and subscribe to characteristics
    await discoverCharacteristics(device, options.services);

    bleDevice.addEventListener('gattserverdisconnected', () => {
      device.connected = false;
      updateDeviceList();
      updateStatus();
    });

    return device;
  }

  async function discoverCharacteristics(device, serviceUUIDs) {
    const services = await device.server.getPrimaryServices();

    for (const service of services) {
      try {
        const chars = await service.getCharacteristics();
        for (const char of chars) {
          if (char.properties.notify) {
            device.characteristics.push(char);
            await char.startNotifications();
            char.addEventListener('characteristicvaluechanged', (event) => {
              handleBLEData(device, event.target.value, char.uuid);
            });
          }
        }
      } catch (e) {
        // Some services may not have readable characteristics
      }
    }
  }

  function handleBLEData(device, dataView, charUUID) {
    // Parse based on common BLE data formats
    const entry = {
      timestamp: Date.now(),
      characteristic: charUUID,
      raw: Array.from(new Uint8Array(dataView.buffer)),
    };

    // Try to parse as float (common for sensor data)
    if (dataView.byteLength >= 4) {
      entry.value = dataView.getFloat32(0, true);
    } else if (dataView.byteLength >= 2) {
      entry.value = dataView.getInt16(0, true);
    } else if (dataView.byteLength >= 1) {
      entry.value = dataView.getUint8(0);
    }

    device.data.push(entry);

    // Push to DuckDB
    if (LabDuckDB.isReady()) {
      insertHardwareReading(device, entry);
    }

    if (device.onData) device.onData(entry);
  }

  // ── Shared ──

  // Parse a line of CSV-ish data from a serial instrument
  function parseDataLine(line) {
    // Try comma-separated, then tab, then space
    const delimiters = [',', '\t', /\s+/];
    for (const d of delimiters) {
      const parts = line.split(d).map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        const numbers = parts.map(Number);
        if (numbers.every(n => !isNaN(n))) return numbers;
        return parts;
      }
    }
    const num = Number(line);
    return isNaN(num) ? [line] : [num];
  }

  // Insert a hardware reading into a DuckDB table
  async function insertHardwareReading(device, entry) {
    const tableName = `hw_${device.id.replace(/-/g, '_')}`;

    // Create table if not exists
    try {
      await LabDuckDB.query(`
        CREATE TABLE IF NOT EXISTS "${tableName}" (
          timestamp BIGINT,
          raw VARCHAR,
          value DOUBLE
        )
      `);

      const val = entry.value ?? (entry.values && entry.values[0]) ?? null;
      const rawStr = entry.raw ? String(entry.raw).replace(/'/g, "''") : '';
      await LabDuckDB.query(`
        INSERT INTO "${tableName}" VALUES (${entry.timestamp}, '${rawStr}', ${val ?? 'NULL'})
      `);
    } catch (e) {
      // Table creation race — ignore
    }
  }

  // Write data to a serial port
  async function writeSerial(deviceId, data) {
    const device = devices.get(deviceId);
    if (!device || device.type !== 'serial') return;

    const encoder = new TextEncoder();
    const writer = device.port.writable.getWriter();
    await writer.write(encoder.encode(data));
    writer.releaseLock();
  }

  // Disconnect a device
  async function disconnect(deviceId) {
    const device = devices.get(deviceId);
    if (!device) return;

    if (device.type === 'serial') {
      if (device.reader) {
        await device.reader.cancel();
      }
      await device.port.close();
    } else if (device.type === 'bluetooth') {
      device.bleDevice.gatt.disconnect();
    }

    devices.delete(deviceId);
    updateDeviceList();
    updateStatus();
  }

  // Get device list for UI
  function getDevices() {
    return Array.from(devices.values()).map(d => ({
      id: d.id,
      type: d.type,
      name: d.name,
      dataPoints: d.data.length,
    }));
  }

  function updateDeviceList() {
    const el = document.getElementById('hardware-devices');
    if (!el) return;

    const list = getDevices();
    if (list.length === 0) {
      el.innerHTML = '';
      return;
    }

    el.innerHTML = list.map(d => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
        <span style="font-family:var(--font-mono);font-size:11px;">${d.type === 'serial' ? 'RS232' : 'BLE'} ${d.name}</span>
        <button onclick="LabHardware.disconnect('${d.id}')" style="font-size:10px;background:none;border:1px solid var(--border);color:var(--text-dim);border-radius:3px;cursor:pointer;padding:1px 6px;">x</button>
      </div>
    `).join('');
  }

  function updateStatus() {
    const statusEl = document.getElementById('status-hardware');
    if (!statusEl) return;
    statusEl.dataset.status = devices.size > 0 ? 'ready' : 'off';
  }

  return {
    connectSerial,
    connectBluetooth,
    writeSerial,
    disconnect,
    getDevices,
  };
})();
