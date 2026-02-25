// ── Phone Sensors ──
// Taps into every available sensor on the device and streams readings
// into DuckDB tables. Each sensor gets its own table, queryable with SQL.
//
// Supported sensors:
//   - Accelerometer (DeviceMotionEvent + Generic Sensor API)
//   - Gyroscope (DeviceMotionEvent + Generic Sensor API)
//   - Magnetometer (Generic Sensor API, Chrome Android)
//   - Ambient Light (AmbientLightSensor, Chrome Android)
//   - Geolocation (Geolocation API)
//   - Orientation (DeviceOrientationEvent)
//   - Camera (getUserMedia → frame analysis)
//   - Microphone (getUserMedia → Web Audio analyser)

window.LabSensors = (() => {
  const active = new Map(); // sensorName -> { stop(), data[], streaming }
  const SAMPLE_BUFFER = 500; // keep last N readings in memory per sensor

  // ── Accelerometer + Gyroscope via DeviceMotionEvent ──

  function startMotion(opts = {}) {
    const hz = opts.hz || 20;
    const interval = 1000 / hz;
    let lastSample = 0;

    // iOS 13+ requires permission
    const needsPermission = typeof DeviceMotionEvent.requestPermission === 'function';

    async function begin() {
      if (needsPermission) {
        const perm = await DeviceMotionEvent.requestPermission();
        if (perm !== 'granted') throw new Error('Motion permission denied');
      }

      await ensureTable('sensor_accel', `(
        t DOUBLE,
        x DOUBLE,
        y DOUBLE,
        z DOUBLE,
        gx DOUBLE,
        gy DOUBLE,
        gz DOUBLE
      )`);

      const data = [];
      const handler = (e) => {
        const now = performance.now();
        if (now - lastSample < interval) return;
        lastSample = now;

        const a = e.accelerationIncludingGravity || {};
        const r = e.rotationRate || {};
        const entry = {
          t: now,
          x: a.x ?? 0, y: a.y ?? 0, z: a.z ?? 0,
          gx: r.alpha ?? 0, gy: r.beta ?? 0, gz: r.gamma ?? 0,
        };
        data.push(entry);
        if (data.length > SAMPLE_BUFFER) data.shift();

        insertRow('sensor_accel', entry);
      };

      window.addEventListener('devicemotion', handler);

      active.set('motion', {
        stop: () => {
          window.removeEventListener('devicemotion', handler);
          active.delete('motion');
        },
        data,
        streaming: true,
        type: 'motion',
      });

      return active.get('motion');
    }

    return begin();
  }

  // ── Orientation (compass heading, tilt) ──

  function startOrientation(opts = {}) {
    const hz = opts.hz || 10;
    const interval = 1000 / hz;
    let lastSample = 0;

    async function begin() {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') throw new Error('Orientation permission denied');
      }

      await ensureTable('sensor_orientation', `(
        t DOUBLE,
        alpha DOUBLE,
        beta DOUBLE,
        gamma DOUBLE
      )`);

      const data = [];
      const handler = (e) => {
        const now = performance.now();
        if (now - lastSample < interval) return;
        lastSample = now;

        const entry = {
          t: now,
          alpha: e.alpha ?? 0,
          beta: e.beta ?? 0,
          gamma: e.gamma ?? 0,
        };
        data.push(entry);
        if (data.length > SAMPLE_BUFFER) data.shift();

        insertRow('sensor_orientation', entry);
      };

      window.addEventListener('deviceorientation', handler);

      active.set('orientation', {
        stop: () => {
          window.removeEventListener('deviceorientation', handler);
          active.delete('orientation');
        },
        data,
        streaming: true,
        type: 'orientation',
      });
    }

    return begin();
  }

  // ── Generic Sensor API (Chrome) — Magnetometer, AmbientLight ──

  function startGenericSensor(SensorClass, name, fields, opts = {}) {
    const hz = opts.hz || 10;

    return new Promise((resolve, reject) => {
      if (typeof SensorClass === 'undefined' || !SensorClass) {
        return reject(new Error(`${name} not supported in this browser`));
      }

      const cols = Object.entries(fields)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ');

      ensureTable(`sensor_${name}`, `(t DOUBLE, ${cols})`).then(() => {
        const sensor = new SensorClass({ frequency: hz });
        const data = [];

        sensor.addEventListener('reading', () => {
          const entry = { t: performance.now() };
          for (const key of Object.keys(fields)) {
            entry[key] = sensor[key] ?? 0;
          }
          data.push(entry);
          if (data.length > SAMPLE_BUFFER) data.shift();
          insertRow(`sensor_${name}`, entry);
        });

        sensor.addEventListener('error', (e) => {
          console.error(`${name} error:`, e.error);
        });

        sensor.start();

        active.set(name, {
          stop: () => { sensor.stop(); active.delete(name); },
          data,
          streaming: true,
          type: name,
        });

        resolve(active.get(name));
      }).catch(reject);
    });
  }

  function startMagnetometer(opts) {
    return startGenericSensor(
      window.Magnetometer, 'magnetometer',
      { x: 'DOUBLE', y: 'DOUBLE', z: 'DOUBLE' },
      opts
    );
  }

  function startAmbientLight(opts) {
    return startGenericSensor(
      window.AmbientLightSensor, 'ambient_light',
      { illuminance: 'DOUBLE' },
      opts
    );
  }

  // ── Geolocation ──

  function startGeolocation(opts = {}) {
    const continuous = opts.continuous !== false;

    async function begin() {
      await ensureTable('sensor_gps', `(
        t DOUBLE,
        lat DOUBLE,
        lon DOUBLE,
        alt DOUBLE,
        accuracy DOUBLE,
        speed DOUBLE,
        heading DOUBLE
      )`);

      const data = [];

      if (continuous) {
        const watchId = navigator.geolocation.watchPosition(
          (pos) => handlePosition(pos, data),
          (err) => console.error('GPS error:', err),
          { enableHighAccuracy: true, maximumAge: 0 }
        );

        active.set('gps', {
          stop: () => { navigator.geolocation.clearWatch(watchId); active.delete('gps'); },
          data,
          streaming: true,
          type: 'gps',
        });
      } else {
        return new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => { handlePosition(pos, data); resolve(data[0]); },
            reject,
            { enableHighAccuracy: true }
          );
        });
      }
    }

    function handlePosition(pos, data) {
      const entry = {
        t: performance.now(),
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        alt: pos.coords.altitude ?? 0,
        accuracy: pos.coords.accuracy ?? 0,
        speed: pos.coords.speed ?? 0,
        heading: pos.coords.heading ?? 0,
      };
      data.push(entry);
      if (data.length > SAMPLE_BUFFER) data.shift();
      insertRow('sensor_gps', entry);
    }

    return begin();
  }

  // ── Camera ──

  function startCamera(opts = {}) {
    const facing = opts.facing || 'environment'; // 'user' for selfie
    const captureInterval = opts.intervalMs || 1000; // ms between frame analyses
    const width = opts.width || 320;
    const height = opts.height || 240;

    async function begin() {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: width },
          height: { ideal: height },
        },
      });

      await ensureTable('sensor_camera', `(
        t DOUBLE,
        r_mean DOUBLE,
        g_mean DOUBLE,
        b_mean DOUBLE,
        brightness DOUBLE,
        r_std DOUBLE,
        g_std DOUBLE,
        b_std DOUBLE
      )`);

      // Create off-screen video + canvas for frame capture
      const video = document.createElement('video');
      video.srcObject = stream;
      video.playsInline = true;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      const data = [];

      const timer = setInterval(() => {
        ctx.drawImage(video, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;
        const n = pixels.length / 4;

        let rSum = 0, gSum = 0, bSum = 0;
        let rSq = 0, gSq = 0, bSq = 0;

        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          rSum += r; gSum += g; bSum += b;
          rSq += r * r; gSq += g * g; bSq += b * b;
        }

        const rMean = rSum / n, gMean = gSum / n, bMean = bSum / n;
        const brightness = (rMean + gMean + bMean) / 3;
        const rStd = Math.sqrt(rSq / n - rMean * rMean);
        const gStd = Math.sqrt(gSq / n - gMean * gMean);
        const bStd = Math.sqrt(bSq / n - bMean * bMean);

        const entry = {
          t: performance.now(),
          r_mean: rMean, g_mean: gMean, b_mean: bMean,
          brightness,
          r_std: rStd, g_std: gStd, b_std: bStd,
        };

        data.push(entry);
        if (data.length > SAMPLE_BUFFER) data.shift();
        insertRow('sensor_camera', entry);
      }, captureInterval);

      active.set('camera', {
        stop: () => {
          clearInterval(timer);
          stream.getTracks().forEach(t => t.stop());
          active.delete('camera');
        },
        data,
        streaming: true,
        type: 'camera',
        stream, // expose stream for video preview
        video,
        canvas,
      });

      return active.get('camera');
    }

    return begin();
  }

  // ── Microphone ──

  function startMicrophone(opts = {}) {
    const fftSize = opts.fftSize || 256;
    const captureInterval = opts.intervalMs || 100;

    async function begin() {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      await ensureTable('sensor_mic', `(
        t DOUBLE,
        rms DOUBLE,
        peak DOUBLE,
        db DOUBLE,
        dominant_freq DOUBLE
      )`);

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = fftSize;
      source.connect(analyser);

      const timeData = new Uint8Array(analyser.fftSize);
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const data = [];

      const timer = setInterval(() => {
        analyser.getByteTimeDomainData(timeData);
        analyser.getByteFrequencyData(freqData);

        // RMS & peak
        let sumSq = 0;
        let peak = 0;
        for (let i = 0; i < timeData.length; i++) {
          const sample = (timeData[i] - 128) / 128;
          sumSq += sample * sample;
          if (Math.abs(sample) > peak) peak = Math.abs(sample);
        }
        const rms = Math.sqrt(sumSq / timeData.length);
        const db = rms > 0 ? 20 * Math.log10(rms) : -100;

        // Dominant frequency
        let maxFreqVal = 0;
        let maxFreqIdx = 0;
        for (let i = 0; i < freqData.length; i++) {
          if (freqData[i] > maxFreqVal) {
            maxFreqVal = freqData[i];
            maxFreqIdx = i;
          }
        }
        const dominantFreq = maxFreqIdx * audioCtx.sampleRate / analyser.fftSize;

        const entry = {
          t: performance.now(),
          rms,
          peak,
          db,
          dominant_freq: dominantFreq,
        };

        data.push(entry);
        if (data.length > SAMPLE_BUFFER) data.shift();
        insertRow('sensor_mic', entry);
      }, captureInterval);

      active.set('microphone', {
        stop: () => {
          clearInterval(timer);
          stream.getTracks().forEach(t => t.stop());
          audioCtx.close();
          active.delete('microphone');
        },
        data,
        streaming: true,
        type: 'microphone',
        analyser,
        audioCtx,
      });

      return active.get('microphone');
    }

    return begin();
  }

  // ── DuckDB helpers ──

  async function ensureTable(name, schema) {
    if (!LabDuckDB.isReady()) return;
    try {
      await LabDuckDB.query(`CREATE TABLE IF NOT EXISTS "${name}" ${schema}`);
    } catch (e) {
      // Table may already exist with same schema
    }
  }

  let insertQueue = [];
  let insertFlushTimer = null;

  function insertRow(table, row) {
    if (!LabDuckDB.isReady()) return;
    insertQueue.push({ table, row });

    // Batch inserts: flush every 200ms to avoid hammering DuckDB
    if (!insertFlushTimer) {
      insertFlushTimer = setTimeout(flushInserts, 200);
    }
  }

  async function flushInserts() {
    insertFlushTimer = null;
    const batch = insertQueue.splice(0);
    if (batch.length === 0) return;

    // Group by table
    const byTable = {};
    for (const { table, row } of batch) {
      if (!byTable[table]) byTable[table] = [];
      byTable[table].push(row);
    }

    for (const [table, rows] of Object.entries(byTable)) {
      try {
        const cols = Object.keys(rows[0]);
        const values = rows.map(r =>
          '(' + cols.map(c => {
            const v = r[c];
            return v === null || v === undefined ? 'NULL' : typeof v === 'string' ? `'${v}'` : v;
          }).join(', ') + ')'
        ).join(', ');

        await LabDuckDB.query(`INSERT INTO "${table}" VALUES ${values}`);
      } catch (e) {
        // Batch may fail if table was dropped — silently skip
      }
    }
  }

  // ── Control ──

  function stop(name) {
    const sensor = active.get(name);
    if (sensor) sensor.stop();
  }

  function stopAll() {
    for (const sensor of active.values()) {
      sensor.stop();
    }
  }

  function getActive() {
    return Array.from(active.entries()).map(([name, s]) => ({
      name,
      type: s.type,
      points: s.data.length,
      streaming: s.streaming,
    }));
  }

  // ── Quick summary of what's available ──

  function detectCapabilities() {
    return {
      motion: 'DeviceMotionEvent' in window,
      orientation: 'DeviceOrientationEvent' in window,
      magnetometer: 'Magnetometer' in window,
      ambientLight: 'AmbientLightSensor' in window,
      geolocation: 'geolocation' in navigator,
      camera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      microphone: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      // Generic Sensor API availability
      accelerometer: 'Accelerometer' in window,
      gyroscope: 'Gyroscope' in window,
      linearAcceleration: 'LinearAccelerationSensor' in window,
      gravity: 'GravitySensor' in window,
    };
  }

  return {
    startMotion,
    startOrientation,
    startMagnetometer,
    startAmbientLight,
    startGeolocation,
    startCamera,
    startMicrophone,
    stop,
    stopAll,
    getActive,
    detectCapabilities,
  };
})();
