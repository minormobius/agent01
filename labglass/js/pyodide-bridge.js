// ── Pyodide Bridge ──
// Lazy-loads Pyodide (Python in the browser) and provides execution context.
// Shares data between DuckDB results and Python via JSON serialization.

window.LabPython = (() => {
  let pyodide = null;
  let loading = false;
  let loadPromise = null;

  const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/';

  async function init() {
    if (pyodide) return pyodide;
    if (loadPromise) return loadPromise;

    loading = true;
    const statusEl = document.getElementById('status-pyodide');
    if (statusEl) statusEl.dataset.status = 'loading';

    loadPromise = (async () => {
      try {
        // Load Pyodide from CDN
        const script = document.createElement('script');
        script.src = PYODIDE_CDN + 'pyodide.js';
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });

        pyodide = await window.loadPyodide({
          indexURL: PYODIDE_CDN,
        });

        // Pre-load core scientific packages
        await pyodide.loadPackage(['numpy', 'matplotlib', 'micropip']);

        // Set up the Python environment with helpers
        await pyodide.runPythonAsync(`
import sys
import json
import io

# Capture stdout/stderr
class OutputCapture:
    def __init__(self):
        self.outputs = []
    def write(self, text):
        if text.strip():
            self.outputs.append(text)
    def flush(self):
        pass
    def get(self):
        result = ''.join(self.outputs)
        self.outputs = []
        return result

_stdout_capture = OutputCapture()
_stderr_capture = OutputCapture()

# Helper to receive data from JS
def _load_from_json(json_str):
    """Load a DuckDB result (passed as JSON) into a dict of lists."""
    data = json.loads(json_str)
    return data

# Helper to convert matplotlib figure to base64 PNG
def _fig_to_base64():
    import matplotlib
    matplotlib.use('agg')
    import matplotlib.pyplot as plt
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=100, bbox_inches='tight',
                facecolor='#1c2128', edgecolor='none')
    plt.close()
    buf.seek(0)
    import base64
    return base64.b64encode(buf.read()).decode('utf-8')
        `);

        loading = false;
        if (statusEl) statusEl.dataset.status = 'ready';
        return pyodide;
      } catch (err) {
        loading = false;
        if (statusEl) statusEl.dataset.status = 'error';
        console.error('Pyodide init failed:', err);
        throw err;
      }
    })();

    return loadPromise;
  }

  // Run Python code and capture output
  async function run(code) {
    if (!pyodide) await init();

    // Redirect stdout/stderr
    await pyodide.runPythonAsync(`
import sys
sys.stdout = _stdout_capture
sys.stderr = _stderr_capture
    `);

    let result;
    let error = null;
    let stdout = '';
    let figures = [];

    try {
      result = await pyodide.runPythonAsync(code);

      // Check if matplotlib was used and there are open figures
      try {
        const figCount = await pyodide.runPythonAsync(`
import sys as _sys
_fig_count = 0
if 'matplotlib.pyplot' in _sys.modules:
    import matplotlib.pyplot as _plt
    _fig_count = len(_plt.get_fignums())
_fig_count
        `);
        for (let i = 0; i < figCount; i++) {
          const b64 = await pyodide.runPythonAsync('_fig_to_base64()');
          figures.push(b64);
        }
      } catch (e) {
        // matplotlib not imported, that's fine
      }
    } catch (err) {
      error = err.message;
    }

    // Capture stdout
    stdout = await pyodide.runPythonAsync('_stdout_capture.get()');
    const stderr = await pyodide.runPythonAsync('_stderr_capture.get()');

    // Restore stdout/stderr
    await pyodide.runPythonAsync(`
import sys
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
    `);

    // Convert result to JS-friendly format
    let resultStr = '';
    if (result !== undefined && result !== null) {
      try {
        resultStr = result.toString();
      } catch (e) {
        resultStr = String(result);
      }
    }

    return {
      output: stdout || resultStr,
      error: error || (stderr ? stderr : null),
      figures,
    };
  }

  // Pass DuckDB query results to Python as a variable
  async function injectData(varName, data) {
    if (!pyodide) await init();
    const jsonStr = JSON.stringify(data);
    await pyodide.runPythonAsync(`
${varName} = _load_from_json('${jsonStr.replace(/'/g, "\\'")}')
    `);
  }

  // Install a Python package via micropip
  async function installPackage(pkg) {
    if (!pyodide) await init();
    await pyodide.runPythonAsync(`
import micropip
await micropip.install('${pkg}')
    `);
  }

  function isReady() {
    return pyodide !== null;
  }

  function isLoading() {
    return loading;
  }

  return {
    init,
    run,
    injectData,
    installPackage,
    isReady,
    isLoading,
  };
})();
