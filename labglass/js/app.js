// ── LABGLASS App Orchestrator ──
// Wires all modules together: storage, DuckDB, Pyodide, notebook,
// WebGPU, collaboration, hardware, and capture.

window.LabApp = (() => {
  async function init() {
    console.log('%c LABGLASS ', 'background:#58a6ff;color:#0d1117;font-weight:bold;font-size:14px;padding:2px 8px;border-radius:3px;', 'Initializing...');

    // ── Initialize core systems in parallel ──
    const initPromises = [
      LabStorage.init().then(() => {
        refreshFileList();
        updateStorageInfo();
        console.log('OPFS ready');
      }).catch(err => {
        console.error('OPFS failed:', err);
        toast('OPFS not available — file storage disabled', 'error');
      }),

      LabDuckDB.init().then(() => {
        console.log('DuckDB-Wasm ready');
        toast('DuckDB ready', 'success');
        // Register any existing OPFS files
        return LabDuckDB.registerAllFiles();
      }).catch(err => {
        console.error('DuckDB failed:', err);
        const coi = self.crossOriginIsolated ? 'COI=yes' : 'COI=no';
        toast(`DuckDB failed (${coi}): ${err.message}`, 'error');
      }),

      LabViz.init().then((ok) => {
        if (ok) console.log('WebGPU ready');
        else console.log('WebGPU not available — using Canvas 2D fallback');
      }).catch(() => {
        console.log('WebGPU not available');
      }),
    ];

    await Promise.allSettled(initPromises);

    // ── Wire up UI events ──
    setupSidebar();
    setupDropZone();
    setupToolbar();
    setupSensorsUI();
    setupCollabUI();
    setupCaptureUI();
    setupShareDialog();
    setupATProtoUI();
    setupKeyboardShortcuts();

    // ── Load template or starter notebook ──
    const params = new URLSearchParams(location.search);
    const templateName = params.get('t') || params.get('template');
    if (templateName && templates[templateName]) {
      templates[templateName]();
    } else {
      createStarterNotebook();
    }

    console.log('%c LABGLASS READY ', 'background:#3fb950;color:#0d1117;font-weight:bold;font-size:12px;padding:2px 8px;border-radius:3px;');
  }

  // ── Sidebar ──
  function isDesktop() {
    return window.matchMedia('(min-width: 900px)').matches;
  }

  function setupSidebar() {
    const btn = document.getElementById('btn-files');
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('sidebar-scrim');

    // Open sidebar by default on desktop only
    if (isDesktop()) {
      sidebar.classList.add('open');
      btn.classList.add('active');
    }

    function toggleSidebar() {
      const opening = !sidebar.classList.contains('open');
      sidebar.classList.toggle('open');
      btn.classList.toggle('active');
      // Show/hide scrim on mobile
      if (!isDesktop()) {
        scrim.classList.toggle('visible', opening);
      }
    }

    function closeSidebar() {
      sidebar.classList.remove('open');
      btn.classList.remove('active');
      scrim.classList.remove('visible');
    }

    btn.addEventListener('click', toggleSidebar);

    // Tap scrim to close sidebar on mobile
    scrim.addEventListener('click', closeSidebar);

    // When resizing from mobile to desktop, clean up scrim state
    window.matchMedia('(min-width: 900px)').addEventListener('change', (e) => {
      scrim.classList.remove('visible');
      if (e.matches && !sidebar.classList.contains('open')) {
        sidebar.classList.add('open');
        btn.classList.add('active');
      }
    });

    document.getElementById('btn-refresh-files').addEventListener('click', () => {
      refreshFileList();
      updateStorageInfo();
    });

    // Sensors topbar button: open sidebar and scroll to sensors section
    document.getElementById('btn-sensors').addEventListener('click', () => {
      if (!sidebar.classList.contains('open')) {
        sidebar.classList.add('open');
        btn.classList.add('active');
        if (!isDesktop()) scrim.classList.toggle('visible', true);
      }
      const sensorSection = document.querySelector('#sensor-buttons');
      if (sensorSection) sensorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ── Drag & Drop ──
  function setupDropZone() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('btn-browse');

    browseBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
      if (fileInput.files.length > 0) {
        await handleFiles(fileInput.files);
      }
    });

    // Drag events on the whole main area too
    const main = document.getElementById('main');

    main.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    main.addEventListener('dragleave', (e) => {
      if (!main.contains(e.relatedTarget)) {
        dropZone.classList.remove('dragover');
      }
    });

    main.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        await handleFiles(e.dataTransfer.files);
      }
    });
  }

  async function handleFiles(fileList) {
    for (const file of fileList) {
      toast(`Importing ${file.name}...`);
      try {
        await LabStorage.writeFile(file.name, file);
        if (LabDuckDB.isReady()) {
          const result = await LabDuckDB.registerFile(file.name);
          if (result.view) {
            toast(`${file.name} → table "${result.view}" ready`, 'success');
            // Auto-create a SQL cell with a preview query
            LabNotebook.createCell('sql',
              `-- Preview: ${file.name}\nSELECT * FROM "${result.view}" LIMIT 10;`,
              result.view + '_preview'
            );
          } else {
            toast(`${file.name} stored (not auto-tabled)`, 'success');
          }
        } else {
          toast(`${file.name} stored in OPFS`, 'success');
        }
      } catch (err) {
        toast(`Failed: ${file.name} — ${err.message}`, 'error');
      }
    }
    refreshFileList();
    updateStorageInfo();
  }

  async function refreshFileList() {
    const list = document.getElementById('file-list');
    try {
      const files = await LabStorage.listFiles();
      list.innerHTML = files.map(f => `
        <li data-name="${escapeAttr(f.name)}">
          <span class="file-name" title="${escapeAttr(f.name)}">${escapeHtml(f.name)}</span>
          <span class="file-size">${LabStorage.formatBytes(f.size)}</span>
          <button class="file-delete" title="Delete">&times;</button>
        </li>
      `).join('');

      // Wire delete buttons
      list.querySelectorAll('.file-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const li = btn.closest('li');
          const name = li.dataset.name;
          await LabStorage.deleteFile(name);
          li.remove();
          updateStorageInfo();
          toast(`Deleted ${name}`);
        });
      });

      // Click to create SQL preview
      list.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', () => {
          const name = li.dataset.name;
          const tableName = name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+/, '');
          LabNotebook.createCell('sql',
            `SELECT * FROM "${tableName}" LIMIT 20;`,
            tableName + '_query'
          );
        });
      });
    } catch (e) {
      list.innerHTML = '<li style="color:var(--text-dim);padding:8px;">No files yet</li>';
    }
  }

  async function updateStorageInfo() {
    const info = await LabStorage.getStorageInfo();
    const fill = document.getElementById('storage-fill');
    const text = document.getElementById('storage-text');
    if (info.quota > 0) {
      const pct = (info.usage / info.quota) * 100;
      fill.style.width = pct + '%';
      text.textContent = `${LabStorage.formatBytes(info.usage)} / ${LabStorage.formatBytes(info.quota)}`;
    } else {
      text.textContent = 'Storage info unavailable';
    }
  }

  // ── Toolbar ──
  function setupToolbar() {
    document.getElementById('btn-add-sql').addEventListener('click', () => {
      LabNotebook.createCell('sql');
    });
    document.getElementById('btn-add-python').addEventListener('click', () => {
      LabNotebook.createCell('python');
    });
    document.getElementById('btn-add-markdown').addEventListener('click', () => {
      LabNotebook.createCell('markdown');
    });
    document.getElementById('btn-add-viz').addEventListener('click', () => {
      LabNotebook.createCell('viz');
    });
    document.getElementById('btn-add-config').addEventListener('click', () => {
      LabNotebook.createCell('config', '', 'sensor_config');
    });
    document.getElementById('btn-add-cell-bottom').addEventListener('click', () => {
      LabNotebook.createCell('sql');
    });

    document.getElementById('btn-run-all').addEventListener('click', async () => {
      toast('Running all cells...');
      await LabNotebook.runAll();
      toast('All cells executed', 'success');
    });

    document.getElementById('btn-export').addEventListener('click', () => {
      const nb = LabNotebook.exportNotebook();
      const blob = new Blob([JSON.stringify(nb, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `labglass-notebook-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Notebook exported', 'success');
    });
  }

  // ── Sensors ──
  function setupSensorsUI() {
    const sensorStarters = {
      motion: () => LabSensors.startMotion(),
      orientation: () => LabSensors.startOrientation(),
      gps: () => LabSensors.startGeolocation(),
      camera: () => LabSensors.startCamera(),
      microphone: () => LabSensors.startMicrophone(),
      magnetometer: () => LabSensors.startMagnetometer(),
      ambientLight: () => LabSensors.startAmbientLight(),
    };

    const sensorTables = {
      motion: 'sensor_accel',
      orientation: 'sensor_orientation',
      gps: 'sensor_gps',
      camera: 'sensor_camera',
      microphone: 'sensor_mic',
      magnetometer: 'sensor_magnetometer',
      ambientLight: 'sensor_ambient_light',
    };

    document.querySelectorAll('.sensor-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sensor = btn.dataset.sensor;

        // Toggle: if active, stop it
        const activeSensors = LabSensors.getActive();
        const isActive = activeSensors.some(s => s.name === sensor || s.name === sensorNameMap(sensor));

        if (isActive) {
          LabSensors.stop(sensorNameMap(sensor));
          btn.classList.remove('sensor-active');
          toast(`${sensor} stopped`);
          updateSensorList();
          return;
        }

        // Start sensor
        try {
          btn.classList.add('sensor-active');
          await sensorStarters[sensor]();
          toast(`${sensor} streaming → ${sensorTables[sensor]}`, 'success');

          // Auto-create a SQL cell to query the sensor data
          LabNotebook.createCell('sql',
            `-- Live ${sensor} data (run again to see latest)\nSELECT * FROM "${sensorTables[sensor]}" ORDER BY t DESC LIMIT 20;`,
            `${sensor}_live`
          );

          // Motion: add config + full analysis pipeline
          if (sensor === 'motion') {
            LabNotebook.createCell('config',
              JSON.stringify({
                motion: { hz: 60 },
                microphone: { fftSize: 2048, intervalMs: 100, smoothing: 0.3 },
                camera: { facing: 'environment', intervalMs: 1000, width: 320, height: 240 },
                orientation: { hz: 10 },
                magnetometer: { hz: 10 },
                ambientLight: { hz: 10 },
                gps: { continuous: true, highAccuracy: true },
              }, null, 2),
              'sensor_config'
            );

            LabNotebook.createCell('sql',
              `-- Full accel data (run AFTER stopping motion)\nSELECT t, x, y, z, ax, ay, az, gx, gy, gz\nFROM sensor_accel\nORDER BY t;`,
              'accel_data'
            );

            LabNotebook.createCell('python',
`import numpy as np
import matplotlib
matplotlib.use('agg')
import matplotlib.pyplot as plt

cols = accel_data['columns']
rows = accel_data['rows']
if len(rows) < 2:
    print("No motion data yet!")
    print("1) Start motion  2) Move/toss  3) Stop motion  4) Run SQL cell above  5) Run this cell")
else:
    t = np.array([r[cols.index('t')] for r in rows])
    t = (t - t[0]) / 1000
    x = np.array([r[cols.index('x')] for r in rows])
    y = np.array([r[cols.index('y')] for r in rows])
    z = np.array([r[cols.index('z')] for r in rows])
    mag = np.sqrt(x**2 + y**2 + z**2)

    print(f"{len(rows)} samples over {t[-1]:.2f}s ({len(rows)/t[-1]:.0f} Hz effective)")
    print(f"Magnitude — min: {mag.min():.1f}, max: {mag.max():.1f}, mean: {mag.mean():.1f} m/s²")

    fig, ax_plt = plt.subplots(figsize=(10, 4))
    ax_plt.plot(t, x, color='#ff6b6b', linewidth=0.8, label='x')
    ax_plt.plot(t, y, color='#51cf66', linewidth=0.8, label='y')
    ax_plt.plot(t, z, color='#339af0', linewidth=0.8, label='z')
    ax_plt.plot(t, mag, color='#ffd43b', linewidth=1.2, label='|a|')
    ax_plt.set_xlabel('Time (s)', color='#adbac7')
    ax_plt.set_ylabel('m/s²', color='#adbac7')
    ax_plt.set_title('Raw Acceleration (with gravity)', color='#adbac7')
    ax_plt.legend(loc='upper right')
    ax_plt.set_facecolor('#1c2128')
    ax_plt.tick_params(colors='#adbac7')
    for spine in ax_plt.spines.values():
        spine.set_color('#444c56')
    ax_plt.grid(True, alpha=0.2, color='#444c56')
    plt.tight_layout()`,
              'plot_raw_accel'
            );

            LabNotebook.createCell('python',
`import numpy as np
import matplotlib
matplotlib.use('agg')
import matplotlib.pyplot as plt

cols = accel_data['columns']
rows = accel_data['rows']
if len(rows) < 2:
    print("No data yet.")
else:
    t = np.array([r[cols.index('t')] for r in rows])
    t = (t - t[0]) / 1000
    ax_v = np.array([r[cols.index('ax')] for r in rows])
    ay_v = np.array([r[cols.index('ay')] for r in rows])
    az_v = np.array([r[cols.index('az')] for r in rows])
    mag = np.sqrt(ax_v**2 + ay_v**2 + az_v**2)

    print(f"Linear accel — peak: {mag.max():.1f} m/s²")

    fig, ax_plt = plt.subplots(figsize=(10, 4))
    ax_plt.plot(t, ax_v, color='#ff6b6b', linewidth=0.8, label='ax')
    ax_plt.plot(t, ay_v, color='#51cf66', linewidth=0.8, label='ay')
    ax_plt.plot(t, az_v, color='#339af0', linewidth=0.8, label='az')
    ax_plt.plot(t, mag, color='#ffd43b', linewidth=1.2, label='|a|')
    ax_plt.set_xlabel('Time (s)', color='#adbac7')
    ax_plt.set_ylabel('m/s²', color='#adbac7')
    ax_plt.set_title('Linear Acceleration (gravity subtracted)', color='#adbac7')
    ax_plt.legend(loc='upper right')
    ax_plt.set_facecolor('#1c2128')
    ax_plt.tick_params(colors='#adbac7')
    for spine in ax_plt.spines.values():
        spine.set_color('#444c56')
    ax_plt.grid(True, alpha=0.2, color='#444c56')
    plt.tight_layout()`,
              'plot_linear_accel'
            );

            LabNotebook.createCell('python',
`import numpy as np
import matplotlib
matplotlib.use('agg')
import matplotlib.pyplot as plt

cols = accel_data['columns']
rows = accel_data['rows']
if len(rows) < 2:
    print("No data yet.")
else:
    t = np.array([r[cols.index('t')] for r in rows])
    t_sec = (t - t[0]) / 1000
    dt = np.diff(t) / 1000
    ax_v = np.array([r[cols.index('ax')] for r in rows])
    ay_v = np.array([r[cols.index('ay')] for r in rows])
    az_v = np.array([r[cols.index('az')] for r in rows])

    vx = np.concatenate([[0], np.cumsum((ax_v[:-1] + ax_v[1:]) / 2 * dt)])
    vy = np.concatenate([[0], np.cumsum((ay_v[:-1] + ay_v[1:]) / 2 * dt)])
    vz = np.concatenate([[0], np.cumsum((az_v[:-1] + az_v[1:]) / 2 * dt)])
    v_mag = np.sqrt(vx**2 + vy**2 + vz**2)

    print(f"Peak speed: {v_mag.max():.2f} m/s ({v_mag.max() * 3.6:.1f} km/h)")
    print(f"Final drift: vx={vx[-1]:.3f} vy={vy[-1]:.3f} vz={vz[-1]:.3f} m/s")

    fig, ax_plt = plt.subplots(figsize=(10, 4))
    ax_plt.plot(t_sec, vx, color='#ff6b6b', linewidth=0.8, label='vx')
    ax_plt.plot(t_sec, vy, color='#51cf66', linewidth=0.8, label='vy')
    ax_plt.plot(t_sec, vz, color='#339af0', linewidth=0.8, label='vz')
    ax_plt.plot(t_sec, v_mag, color='#ffd43b', linewidth=1.2, label='|v|')
    ax_plt.set_xlabel('Time (s)', color='#adbac7')
    ax_plt.set_ylabel('m/s', color='#adbac7')
    ax_plt.set_title('Velocity (integrated from linear accel)', color='#adbac7')
    ax_plt.legend(loc='upper right')
    ax_plt.set_facecolor('#1c2128')
    ax_plt.tick_params(colors='#adbac7')
    for spine in ax_plt.spines.values():
        spine.set_color('#444c56')
    ax_plt.grid(True, alpha=0.2, color='#444c56')
    plt.tight_layout()`,
              'velocity'
            );

            LabNotebook.createCell('python',
`import numpy as np
import matplotlib
matplotlib.use('agg')
import matplotlib.pyplot as plt

cols = accel_data['columns']
rows = accel_data['rows']
if len(rows) < 2:
    print("No data yet.")
else:
    t = np.array([r[cols.index('t')] for r in rows])
    t_sec = (t - t[0]) / 1000
    dt = np.diff(t) / 1000
    ax_v = np.array([r[cols.index('ax')] for r in rows])
    ay_v = np.array([r[cols.index('ay')] for r in rows])
    az_v = np.array([r[cols.index('az')] for r in rows])

    vx = np.concatenate([[0], np.cumsum((ax_v[:-1] + ax_v[1:]) / 2 * dt)])
    vy = np.concatenate([[0], np.cumsum((ay_v[:-1] + ay_v[1:]) / 2 * dt)])
    vz = np.concatenate([[0], np.cumsum((az_v[:-1] + az_v[1:]) / 2 * dt)])

    px = np.concatenate([[0], np.cumsum((vx[:-1] + vx[1:]) / 2 * dt)])
    py = np.concatenate([[0], np.cumsum((vy[:-1] + vy[1:]) / 2 * dt)])
    pz = np.concatenate([[0], np.cumsum((vz[:-1] + vz[1:]) / 2 * dt)])
    p_mag = np.sqrt(px**2 + py**2 + pz**2)

    print(f"Max displacement: {p_mag.max():.3f} m ({p_mag.max() * 100:.1f} cm)")
    print(f"Final drift: x={px[-1]:.3f} y={py[-1]:.3f} z={pz[-1]:.3f} m")

    fig, ax_plt = plt.subplots(figsize=(10, 4))
    ax_plt.plot(t_sec, px, color='#ff6b6b', linewidth=0.8, label='x')
    ax_plt.plot(t_sec, py, color='#51cf66', linewidth=0.8, label='y')
    ax_plt.plot(t_sec, pz, color='#339af0', linewidth=0.8, label='z')
    ax_plt.plot(t_sec, p_mag, color='#ffd43b', linewidth=1.2, label='|p|')
    ax_plt.set_xlabel('Time (s)', color='#adbac7')
    ax_plt.set_ylabel('m', color='#adbac7')
    ax_plt.set_title('Position (double-integrated from accel)', color='#adbac7')
    ax_plt.legend(loc='upper right')
    ax_plt.set_facecolor('#1c2128')
    ax_plt.tick_params(colors='#adbac7')
    for spine in ax_plt.spines.values():
        spine.set_color('#444c56')
    ax_plt.grid(True, alpha=0.2, color='#444c56')
    plt.tight_layout()`,
              'position'
            );
          }

          // Microphone: add spectrum query + spectral analysis Python cell
          if (sensor === 'microphone') {
            LabNotebook.createCell('sql',
              `-- Full spectrum data (run AFTER stopping mic)\nSELECT t, sample_rate, fft_size, spectrum\nFROM sensor_mic_spectrum\nORDER BY t;`,
              'mic_spectrum'
            );

            LabNotebook.createCell('python',
`import numpy as np
import matplotlib
matplotlib.use('agg')
import matplotlib.pyplot as plt

# mic_spectrum is auto-injected from the SQL cell above
rows = mic_spectrum['rows']
if not rows:
    print("No spectrum data yet!")
    print("1) Start mic  2) Speak  3) Stop mic  4) Run the SQL cell above  5) Re-run this cell")
else:
    sr = rows[0]['sample_rate']
    fft_size = int(rows[0]['fft_size'])
    n_bins = fft_size // 2
    freqs = np.linspace(0, sr / 2, n_bins)

    spectra = []
    times = []
    for r in rows:
        mags = np.array(r['spectrum'].split(','), dtype=np.float64)
        spectra.append(mags)
        times.append(r['t'])

    spectra = np.array(spectra)
    t = (np.array(times) - times[0]) / 1000

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 7))

    # Spectrogram
    im = ax1.pcolormesh(t, freqs, spectra.T, shading='auto', cmap='magma')
    ax1.set_ylim(50, 4000)
    ax1.set_ylabel('Frequency (Hz)', color='white')
    ax1.set_xlabel('Time (s)', color='white')
    ax1.set_title('Voice Spectrogram', color='white', fontsize=14)
    ax1.tick_params(colors='white')
    cb = fig.colorbar(im, ax=ax1)
    cb.set_label('dB', color='white')
    cb.ax.tick_params(colors='white')

    # Average power spectrum
    avg = spectra.mean(axis=0)
    ax2.fill_between(freqs, avg, -100, alpha=0.3, color='cyan')
    ax2.plot(freqs, avg, color='cyan', linewidth=0.8)
    ax2.set_xlim(50, 4000)
    ax2.set_xlabel('Frequency (Hz)', color='white')
    ax2.set_ylabel('Magnitude (dB)', color='white')
    ax2.set_title('Average Power Spectrum', color='white', fontsize=14)
    ax2.tick_params(colors='white')

    for ax in (ax1, ax2):
        ax.set_facecolor('#1c2128')

    plt.tight_layout()
    print(f"Plotted {len(rows)} frames over {t[-1]:.1f}s")
    print(f"Sample rate: {int(sr)} Hz | FFT: {fft_size} | Bins: {n_bins}")`,
              'voice_spectrum'
            );
          }

          updateSensorList();
        } catch (err) {
          btn.classList.remove('sensor-active');
          toast(`${sensor}: ${err.message}`, 'error');
        }
      });
    });

    // Grey out unavailable sensors
    const caps = LabSensors.detectCapabilities();
    const capMap = {
      motion: caps.motion,
      orientation: caps.orientation,
      gps: caps.geolocation,
      camera: caps.camera,
      microphone: caps.microphone,
      magnetometer: caps.magnetometer,
      ambientLight: caps.ambientLight,
    };

    document.querySelectorAll('.sensor-btn').forEach(btn => {
      const sensor = btn.dataset.sensor;
      if (!capMap[sensor]) {
        btn.disabled = true;
        btn.title += ' (not available)';
        btn.style.opacity = '0.3';
      }
    });
  }

  function sensorNameMap(sensor) {
    // Map button data-sensor to LabSensors active map key
    const map = { gps: 'gps', ambientLight: 'ambient_light' };
    return map[sensor] || sensor;
  }

  function updateSensorList() {
    const el = document.getElementById('sensor-active');
    if (!el) return;
    const sensors = LabSensors.getActive();
    if (sensors.length === 0) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = sensors.map(s =>
      `<div style="font-family:var(--font-mono);font-size:11px;padding:2px 0;color:var(--green);">` +
      `${s.name} (${s.points} pts)</div>`
    ).join('');
  }

  // Refresh sensor point counts periodically
  setInterval(() => {
    if (LabSensors.getActive().length > 0) updateSensorList();
  }, 2000);

  // ── Collaboration ──
  function setupCollabUI() {
    document.getElementById('btn-collab-host').addEventListener('click', async () => {
      const dialog = document.getElementById('share-dialog');
      document.getElementById('share-offer-section').style.display = 'block';
      document.getElementById('share-answer-section').style.display = 'block';
      document.getElementById('share-join-section').style.display = 'none';
      dialog.showModal();
      try {
        await LabCollab.host();
      } catch (err) {
        toast('Failed to create session: ' + err.message, 'error');
      }
    });

    document.getElementById('btn-collab-join').addEventListener('click', () => {
      const dialog = document.getElementById('share-dialog');
      document.getElementById('share-offer-section').style.display = 'none';
      document.getElementById('share-answer-section').style.display = 'none';
      document.getElementById('share-join-section').style.display = 'block';
      dialog.showModal();
    });

    // Hardware
    document.getElementById('btn-serial').addEventListener('click', async () => {
      try {
        const dev = await LabHardware.connectSerial();
        toast(`Connected: ${dev.name}`, 'success');
      } catch (err) {
        if (err.name !== 'NotFoundError') { // user cancelled
          toast('Serial: ' + err.message, 'error');
        }
      }
    });

    document.getElementById('btn-bluetooth').addEventListener('click', async () => {
      try {
        const dev = await LabHardware.connectBluetooth();
        toast(`Connected: ${dev.name}`, 'success');
      } catch (err) {
        if (err.name !== 'NotFoundError') {
          toast('Bluetooth: ' + err.message, 'error');
        }
      }
    });
  }

  // ── Capture ──
  function setupCaptureUI() {
    document.getElementById('btn-record').addEventListener('click', async () => {
      if (LabCapture.isRecording()) {
        LabCapture.stopRecording();
      } else {
        try {
          await LabCapture.startRecording();
          toast('Recording started');
        } catch (err) {
          toast('Recording: ' + err.message, 'error');
        }
      }
    });

    document.getElementById('btn-stop-rec').addEventListener('click', () => {
      LabCapture.stopRecording();
    });
  }

  // ── Share Dialog ──
  function setupShareDialog() {
    document.getElementById('btn-close-share').addEventListener('click', () => {
      document.getElementById('share-dialog').close();
    });

    document.getElementById('btn-copy-offer').addEventListener('click', () => {
      const el = document.getElementById('share-offer');
      navigator.clipboard.writeText(el.value);
      toast('Offer copied!', 'success');
    });

    document.getElementById('btn-accept-answer').addEventListener('click', async () => {
      const answer = document.getElementById('share-answer').value.trim();
      if (!answer) return;
      try {
        await LabCollab.acceptAnswer(answer);
        document.getElementById('share-dialog').close();
        toast('Connected to peer!', 'success');
      } catch (err) {
        toast('Connection failed: ' + err.message, 'error');
      }
    });

    document.getElementById('btn-create-answer').addEventListener('click', async () => {
      const offer = document.getElementById('join-offer').value.trim();
      if (!offer) return;
      try {
        await LabCollab.join(offer);
        toast('Answer generated — copy it to the host', 'success');
      } catch (err) {
        toast('Failed to join: ' + err.message, 'error');
      }
    });

    document.getElementById('btn-copy-answer').addEventListener('click', () => {
      const el = document.getElementById('join-answer');
      navigator.clipboard.writeText(el.value);
      toast('Answer copied!', 'success');
    });

    // Also wire the top-bar share button
    document.getElementById('btn-share').addEventListener('click', () => {
      document.getElementById('btn-collab-host').click();
    });
  }

  // ── ATProto UI ──
  function setupATProtoUI() {
    const loginBtn = document.getElementById('btn-login');
    const loginDialog = document.getElementById('login-dialog');
    const saveBtn = document.getElementById('btn-save-pds');
    const saveDialog = document.getElementById('save-dialog');
    const browseDialog = document.getElementById('browse-dialog');
    const openBtn = document.getElementById('btn-open-pds');
    const statusPill = document.getElementById('status-atproto');

    // Restore session on load
    const restored = LabATProto.restoreSession();
    if (restored) {
      updateATProtoUI(restored);
    }

    // Login button
    loginBtn.addEventListener('click', () => {
      if (LabATProto.isLoggedIn()) {
        // Already logged in — show menu
        if (confirm(`Signed in as ${LabATProto.getSession().handle}.\n\nSign out?`)) {
          LabATProto.logout();
          updateATProtoUI(null);
          toast('Signed out');
        }
      } else {
        document.getElementById('login-error').textContent = '';
        loginDialog.showModal();
      }
    });

    // Login form
    document.getElementById('btn-do-login').addEventListener('click', async () => {
      const handle = document.getElementById('login-handle').value.trim();
      const password = document.getElementById('login-password').value.trim();
      const errorEl = document.getElementById('login-error');

      if (!handle || !password) {
        errorEl.textContent = 'Enter both handle and app password.';
        return;
      }

      errorEl.textContent = '';
      document.getElementById('btn-do-login').disabled = true;
      document.getElementById('btn-do-login').textContent = 'Signing in...';

      try {
        const session = await LabATProto.login(handle, password);
        updateATProtoUI(session);
        loginDialog.close();
        document.getElementById('login-password').value = '';
        toast(`Signed in as ${session.handle}`, 'success');
      } catch (err) {
        errorEl.textContent = err.message;
      } finally {
        document.getElementById('btn-do-login').disabled = false;
        document.getElementById('btn-do-login').textContent = 'Sign in';
      }
    });

    document.getElementById('btn-close-login').addEventListener('click', () => {
      loginDialog.close();
    });

    // Enter key in login dialog submits
    loginDialog.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('btn-do-login').click();
      }
    });

    // Save to PDS
    saveBtn.addEventListener('click', () => {
      if (!LabATProto.isLoggedIn()) {
        toast('Sign in first to save to PDS', 'error');
        loginDialog.showModal();
        return;
      }
      document.getElementById('save-status').textContent = '';
      saveDialog.showModal();
    });

    document.getElementById('btn-do-save').addEventListener('click', async () => {
      const title = document.getElementById('save-title').value.trim();
      const description = document.getElementById('save-description').value.trim();
      const tagsStr = document.getElementById('save-tags').value.trim();
      const statusEl = document.getElementById('save-status');

      if (!title) {
        statusEl.textContent = 'Title is required.';
        return;
      }

      const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
      const cells = LabNotebook.getCellsWithOutput();

      if (cells.length === 0) {
        statusEl.textContent = 'Notebook has no cells to save.';
        return;
      }

      document.getElementById('btn-do-save').disabled = true;
      statusEl.textContent = `Saving ${cells.length} cells...`;

      try {
        const result = await LabATProto.saveNotebook(title, description, cells, tags);
        statusEl.textContent = '';
        saveDialog.close();
        toast(`Saved to PDS (${cells.length} cells)`, 'success');
      } catch (err) {
        statusEl.textContent = 'Error: ' + err.message;
      } finally {
        document.getElementById('btn-do-save').disabled = false;
      }
    });

    document.getElementById('btn-close-save').addEventListener('click', () => {
      saveDialog.close();
    });

    // Open from PDS (browse)
    openBtn.addEventListener('click', () => {
      document.getElementById('browse-status').textContent = '';
      document.getElementById('browse-list').innerHTML = '';
      // Pre-fill with own handle if logged in
      if (LabATProto.isLoggedIn()) {
        document.getElementById('browse-handle').value = LabATProto.getSession().handle;
      }
      browseDialog.showModal();
    });

    document.getElementById('btn-do-browse').addEventListener('click', async () => {
      const handle = document.getElementById('browse-handle').value.trim();
      const statusEl = document.getElementById('browse-status');
      const listEl = document.getElementById('browse-list');

      if (!handle) {
        statusEl.textContent = 'Enter a handle to browse.';
        return;
      }

      statusEl.textContent = 'Loading notebooks...';
      listEl.innerHTML = '';

      try {
        const { notebooks } = await LabATProto.listNotebooks(handle);
        if (notebooks.length === 0) {
          statusEl.textContent = 'No LABGLASS notebooks found for this user.';
          return;
        }
        statusEl.textContent = `${notebooks.length} notebook(s) found.`;
        renderNotebookList(listEl, notebooks, handle);
      } catch (err) {
        statusEl.textContent = 'Error: ' + err.message;
      }
    });

    // Enter key in browse handle input
    document.getElementById('browse-handle').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btn-do-browse').click();
      }
    });

    document.getElementById('btn-close-browse').addEventListener('click', () => {
      browseDialog.close();
    });

    function renderNotebookList(container, notebooks, handle) {
      container.innerHTML = '';
      for (const nb of notebooks) {
        const li = document.createElement('li');
        const date = nb.createdAt ? new Date(nb.createdAt).toLocaleDateString() : '';
        const cellCount = (nb.cells || []).length;
        let tagsHtml = '';
        if (nb.tags && nb.tags.length > 0) {
          tagsHtml = '<div class="nb-tags">' + nb.tags.map(t => `<span class="nb-tag">${escapeHtml(t)}</span>`).join('') + '</div>';
        }
        li.innerHTML = `
          <div class="nb-title">${escapeHtml(nb.title || 'Untitled')}</div>
          <div class="nb-meta">${date} &middot; ${cellCount} cells</div>
          ${nb.description ? `<div class="nb-meta">${escapeHtml(nb.description.slice(0, 120))}</div>` : ''}
          ${tagsHtml}
        `;
        li.addEventListener('click', () => loadNotebookFromPDS(handle, nb.rkey, nb.title));
        container.appendChild(li);
      }
    }

    async function loadNotebookFromPDS(handle, rkey, title) {
      const browseDialog = document.getElementById('browse-dialog');
      const statusEl = document.getElementById('browse-status');
      statusEl.textContent = `Loading "${title}"...`;

      try {
        const { notebook, cells } = await LabATProto.loadNotebook(handle, rkey);
        // Import into the editor
        LabNotebook.importNotebook({
          cells: cells.map(c => ({
            type: c.cellType,
            source: c.source,
            name: c.name || '',
          })),
        });
        browseDialog.close();
        toast(`Loaded "${notebook.title}" (${cells.length} cells)`, 'success');
      } catch (err) {
        statusEl.textContent = 'Error loading: ' + err.message;
      }
    }

    function updateATProtoUI(session) {
      if (session) {
        loginBtn.textContent = session.handle;
        loginBtn.title = `Signed in as ${session.handle}. Click to sign out.`;
        loginBtn.classList.add('logged-in');
        statusPill.dataset.status = 'ready';
        saveBtn.disabled = false;
      } else {
        loginBtn.textContent = 'Sign in';
        loginBtn.title = 'Sign in with ATProto';
        loginBtn.classList.remove('logged-in');
        statusPill.dataset.status = 'off';
        saveBtn.disabled = true;
      }
    }
  }

  // ── Keyboard Shortcuts ──
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Enter: Run current cell
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const activeCell = document.activeElement.closest('.cell');
        if (activeCell) {
          e.preventDefault();
          LabNotebook.runCell(activeCell.id);
        }
      }

      // Ctrl/Cmd + Shift + Enter: Run all
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        LabNotebook.runAll();
      }

      // Ctrl/Cmd + S: Export notebook
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        document.getElementById('btn-export').click();
      }
    });
  }

  // ── Experiment Templates ──
  // Load via ?t=phone-toss (or ?template=phone-toss)
  const templates = {

    'phone-toss': function () {
      // ── Instructions ──
      LabNotebook.createCell('markdown',
`# Phone Toss — Acceleration, Velocity & Position

Toss your phone in the air and reconstruct its trajectory from the accelerometer.

### Procedure
1. **Run the config cell** below (sets motion sensor to 60 Hz)
2. Open the **Sensors** panel and tap **Motion** to start recording
3. Hold your phone steady for ~1 second (establishes baseline)
4. **Toss it straight up** and catch it
5. Hold steady again for ~1 second
6. Tap **Motion** again to stop
7. **Run All** — the SQL cell pulls data, then the Python cells plot and integrate

### What you'll see
- **Raw acceleration** — x, y, z axes plus magnitude (with gravity). Free-fall reads ~0 m/s\u00B2, catch spike can exceed 30 m/s\u00B2
- **Linear acceleration** — device sensor-fused, gravity subtracted. This is what we integrate
- **Velocity** — cumulative trapezoidal integral of linear accel. Should return near zero at catch
- **Position** — double integral. The parabolic arc of the toss

### Columns in sensor_accel
| Column | What it is |
|--------|-----------|
| \`x, y, z\` | Acceleration including gravity (m/s\u00B2) |
| \`ax, ay, az\` | Linear acceleration, gravity subtracted by device sensor fusion |
| \`gx, gy, gz\` | Gyroscope rotation rate (\u00B0/s) |

> The \`ax, ay, az\` columns come from \`DeviceMotionEvent.acceleration\`, which uses the device's IMU fusion to subtract gravity in the device frame. Integration drift is real — a 1-second toss stays clean, a 10-second recording won't.`,
        'instructions'
      );

      // ── Sensor config: 60 Hz motion ──
      LabNotebook.createCell('config',
        JSON.stringify({
          motion: { hz: 60 },
          microphone: { fftSize: 2048, intervalMs: 100, smoothing: 0.3 },
          camera: { facing: 'environment', intervalMs: 1000, width: 320, height: 240 },
          orientation: { hz: 10 },
          magnetometer: { hz: 10 },
          ambientLight: { hz: 10 },
          gps: { continuous: true, highAccuracy: true },
        }, null, 2),
        'sensor_config'
      );

      // ── SQL: pull accel data ──
      LabNotebook.createCell('sql',
`-- Pull accelerometer data. Run this after you stop the sensor.
SELECT t, x, y, z, ax, ay, az, gx, gy, gz
FROM sensor_accel
ORDER BY t;`,
        'accel_data'
      );

      // ── Plot raw acceleration ──
      LabNotebook.createCell('python',
`# Plot raw acceleration (with gravity) — all 3 axes + magnitude
import numpy as np
import matplotlib
matplotlib.use('agg')
import matplotlib.pyplot as plt

# accel_data comes from the SQL cell above
cols = accel_data['columns']
rows = accel_data['rows']
if len(rows) < 2:
    print("No motion data yet. Start the sensor, toss, stop, run the SQL cell first.")
else:
    t_col = cols.index('t')
    t = np.array([r[t_col] for r in rows])
    t = (t - t[0]) / 1000  # ms -> seconds

    x = np.array([r[cols.index('x')] for r in rows])
    y = np.array([r[cols.index('y')] for r in rows])
    z = np.array([r[cols.index('z')] for r in rows])
    mag = np.sqrt(x**2 + y**2 + z**2)

    print(f"{len(rows)} samples over {t[-1]:.2f}s ({len(rows)/t[-1]:.0f} Hz effective)")
    print(f"Magnitude — min: {mag.min():.1f}, max: {mag.max():.1f}, mean: {mag.mean():.1f} m/s²")

    fig, ax_plt = plt.subplots(figsize=(10, 4))
    ax_plt.plot(t, x, color='#ff6b6b', linewidth=0.8, label='x')
    ax_plt.plot(t, y, color='#51cf66', linewidth=0.8, label='y')
    ax_plt.plot(t, z, color='#339af0', linewidth=0.8, label='z')
    ax_plt.plot(t, mag, color='#ffd43b', linewidth=1.2, label='|a|')
    ax_plt.set_xlabel('Time (s)', color='#adbac7')
    ax_plt.set_ylabel('m/s²', color='#adbac7')
    ax_plt.set_title('Raw Acceleration (with gravity)', color='#adbac7')
    ax_plt.legend(loc='upper right')
    ax_plt.set_facecolor('#1c2128')
    ax_plt.tick_params(colors='#adbac7')
    for spine in ax_plt.spines.values():
        spine.set_color('#444c56')
    ax_plt.grid(True, alpha=0.2, color='#444c56')
    plt.tight_layout()`,
        'plot_raw_accel'
      );

      // ── Plot linear acceleration ──
      LabNotebook.createCell('python',
`# Linear acceleration — gravity removed by device sensor fusion
import numpy as np
import matplotlib
matplotlib.use('agg')
import matplotlib.pyplot as plt

cols = accel_data['columns']
rows = accel_data['rows']
if len(rows) < 2:
    print("No data yet.")
else:
    t = np.array([r[cols.index('t')] for r in rows])
    t = (t - t[0]) / 1000

    ax_v = np.array([r[cols.index('ax')] for r in rows])
    ay_v = np.array([r[cols.index('ay')] for r in rows])
    az_v = np.array([r[cols.index('az')] for r in rows])
    mag = np.sqrt(ax_v**2 + ay_v**2 + az_v**2)

    print(f"Linear accel — peak: {mag.max():.1f} m/s²")

    fig, ax_plt = plt.subplots(figsize=(10, 4))
    ax_plt.plot(t, ax_v, color='#ff6b6b', linewidth=0.8, label='ax')
    ax_plt.plot(t, ay_v, color='#51cf66', linewidth=0.8, label='ay')
    ax_plt.plot(t, az_v, color='#339af0', linewidth=0.8, label='az')
    ax_plt.plot(t, mag, color='#ffd43b', linewidth=1.2, label='|a|')
    ax_plt.set_xlabel('Time (s)', color='#adbac7')
    ax_plt.set_ylabel('m/s²', color='#adbac7')
    ax_plt.set_title('Linear Acceleration (gravity subtracted)', color='#adbac7')
    ax_plt.legend(loc='upper right')
    ax_plt.set_facecolor('#1c2128')
    ax_plt.tick_params(colors='#adbac7')
    for spine in ax_plt.spines.values():
        spine.set_color('#444c56')
    ax_plt.grid(True, alpha=0.2, color='#444c56')
    plt.tight_layout()`,
        'plot_linear_accel'
      );

      // ── Integrate to velocity ──
      LabNotebook.createCell('python',
`# Integrate linear acceleration -> velocity (trapezoidal rule)
import numpy as np
import matplotlib
matplotlib.use('agg')
import matplotlib.pyplot as plt

cols = accel_data['columns']
rows = accel_data['rows']
if len(rows) < 2:
    print("No data yet.")
else:
    t = np.array([r[cols.index('t')] for r in rows])
    t_sec = (t - t[0]) / 1000
    dt = np.diff(t) / 1000  # per-sample dt in seconds

    ax_v = np.array([r[cols.index('ax')] for r in rows])
    ay_v = np.array([r[cols.index('ay')] for r in rows])
    az_v = np.array([r[cols.index('az')] for r in rows])

    # Cumulative trapezoidal integration
    vx = np.concatenate([[0], np.cumsum((ax_v[:-1] + ax_v[1:]) / 2 * dt)])
    vy = np.concatenate([[0], np.cumsum((ay_v[:-1] + ay_v[1:]) / 2 * dt)])
    vz = np.concatenate([[0], np.cumsum((az_v[:-1] + az_v[1:]) / 2 * dt)])
    v_mag = np.sqrt(vx**2 + vy**2 + vz**2)

    print(f"Peak speed: {v_mag.max():.2f} m/s ({v_mag.max() * 3.6:.1f} km/h)")
    print(f"Final velocity drift: vx={vx[-1]:.3f} vy={vy[-1]:.3f} vz={vz[-1]:.3f} m/s")

    fig, ax_plt = plt.subplots(figsize=(10, 4))
    ax_plt.plot(t_sec, vx, color='#ff6b6b', linewidth=0.8, label='vx')
    ax_plt.plot(t_sec, vy, color='#51cf66', linewidth=0.8, label='vy')
    ax_plt.plot(t_sec, vz, color='#339af0', linewidth=0.8, label='vz')
    ax_plt.plot(t_sec, v_mag, color='#ffd43b', linewidth=1.2, label='|v|')
    ax_plt.set_xlabel('Time (s)', color='#adbac7')
    ax_plt.set_ylabel('m/s', color='#adbac7')
    ax_plt.set_title('Velocity (integrated from linear accel)', color='#adbac7')
    ax_plt.legend(loc='upper right')
    ax_plt.set_facecolor('#1c2128')
    ax_plt.tick_params(colors='#adbac7')
    for spine in ax_plt.spines.values():
        spine.set_color('#444c56')
    ax_plt.grid(True, alpha=0.2, color='#444c56')
    plt.tight_layout()`,
        'velocity'
      );

      // ── Double-integrate to position ──
      LabNotebook.createCell('python',
`# Double-integrate: acceleration -> velocity -> position
import numpy as np
import matplotlib
matplotlib.use('agg')
import matplotlib.pyplot as plt

cols = accel_data['columns']
rows = accel_data['rows']
if len(rows) < 2:
    print("No data yet.")
else:
    t = np.array([r[cols.index('t')] for r in rows])
    t_sec = (t - t[0]) / 1000
    dt = np.diff(t) / 1000

    ax_v = np.array([r[cols.index('ax')] for r in rows])
    ay_v = np.array([r[cols.index('ay')] for r in rows])
    az_v = np.array([r[cols.index('az')] for r in rows])

    # First integral -> velocity
    vx = np.concatenate([[0], np.cumsum((ax_v[:-1] + ax_v[1:]) / 2 * dt)])
    vy = np.concatenate([[0], np.cumsum((ay_v[:-1] + ay_v[1:]) / 2 * dt)])
    vz = np.concatenate([[0], np.cumsum((az_v[:-1] + az_v[1:]) / 2 * dt)])

    # Second integral -> position
    px = np.concatenate([[0], np.cumsum((vx[:-1] + vx[1:]) / 2 * dt)])
    py = np.concatenate([[0], np.cumsum((vy[:-1] + vy[1:]) / 2 * dt)])
    pz = np.concatenate([[0], np.cumsum((vz[:-1] + vz[1:]) / 2 * dt)])
    p_mag = np.sqrt(px**2 + py**2 + pz**2)

    print(f"Max displacement: {p_mag.max():.3f} m ({p_mag.max() * 100:.1f} cm)")
    print(f"Final position drift: x={px[-1]:.3f} y={py[-1]:.3f} z={pz[-1]:.3f} m")

    fig, ax_plt = plt.subplots(figsize=(10, 4))
    ax_plt.plot(t_sec, px, color='#ff6b6b', linewidth=0.8, label='x')
    ax_plt.plot(t_sec, py, color='#51cf66', linewidth=0.8, label='y')
    ax_plt.plot(t_sec, pz, color='#339af0', linewidth=0.8, label='z')
    ax_plt.plot(t_sec, p_mag, color='#ffd43b', linewidth=1.2, label='|p|')
    ax_plt.set_xlabel('Time (s)', color='#adbac7')
    ax_plt.set_ylabel('m', color='#adbac7')
    ax_plt.set_title('Position (double-integrated from accel)', color='#adbac7')
    ax_plt.legend(loc='upper right')
    ax_plt.set_facecolor('#1c2128')
    ax_plt.tick_params(colors='#adbac7')
    for spine in ax_plt.spines.values():
        spine.set_color('#444c56')
    ax_plt.grid(True, alpha=0.2, color='#444c56')
    plt.tight_layout()`,
        'position'
      );
    },

  };

  // ── Starter Notebook ──
  function createStarterNotebook() {
    LabNotebook.createCell('markdown',
`# Welcome to LABGLASS

A **peer-to-peer biotech data workbench** running entirely in your browser.

- **SQL cells** query data via DuckDB-Wasm (columnar analytics engine)
- **Python cells** run NumPy, Pandas, SciPy via Pyodide (no server)
- **Drag & drop** CSV/Parquet/JSON files — stored in OPFS (up to 300GB)
- **Share** notebooks peer-to-peer via WebRTC (no server)
- **Connect** lab hardware via Web Serial (RS-232) or Web Bluetooth (BLE)
- **Record** your session with the Rec button

Everything runs client-side. There is no server. There was never a server.`,
      'welcome'
    );

    LabNotebook.createCell('sql',
`-- DuckDB-Wasm is ready. Try a query:
SELECT
  'LABGLASS' as platform,
  version() as duckdb_version,
  current_date as today;`,
      'hello_sql'
    );

    LabNotebook.createCell('python',
`# Python runs in-browser via Pyodide (~11MB on first load)
# NumPy is pre-loaded. Pandas/SciPy load on demand via micropip.
import numpy as np

# Generate some data
x = np.random.randn(1000)
y = 2.5 * x + np.random.randn(1000) * 0.5

print(f"Generated {len(x)} points")
print(f"Correlation: {np.corrcoef(x, y)[0,1]:.4f}")
print(f"x: mean={x.mean():.2f}, std={x.std():.2f}")
print(f"y: mean={y.mean():.2f}, std={y.std():.2f}")`,
      'hello_python'
    );

    LabNotebook.createCell('sql',
`-- Load remote data directly over HTTP:
-- SELECT * FROM read_csv_auto('https://example.com/data.csv') LIMIT 10;
--
-- Or query files you've dropped into OPFS:
-- SELECT * FROM my_file_csv LIMIT 10;
--
-- List all registered tables:
SELECT table_name, table_type
FROM information_schema.tables
ORDER BY table_name;`,
      'explore_tables'
    );
  }

  // ── Toast notifications ──
  function toast(message, type = '') {
    const container = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(100%)';
      el.style.transition = 'all 0.3s ease';
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  // ── Helpers ──
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Boot ──
  document.addEventListener('DOMContentLoaded', init);

  return { toast };
})();
