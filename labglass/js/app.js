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
    setupKeyboardShortcuts();

    // ── Create starter cells ──
    createStarterNotebook();

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
