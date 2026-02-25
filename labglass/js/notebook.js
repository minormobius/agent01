// ── Notebook Cell Manager ──
// Manages a list of executable cells (SQL, Python, Markdown, Viz).
// Cells can be added, removed, reordered, and executed.

window.LabNotebook = (() => {
  let cells = [];
  let cellIdCounter = 0;
  const cellsContainer = () => document.getElementById('cells');

  function generateId() {
    return 'cell-' + (++cellIdCounter) + '-' + Date.now().toString(36);
  }

  // Create a new cell object
  function createCell(type = 'sql', source = '', name = '') {
    const id = generateId();
    const cell = {
      id,
      type, // 'sql' | 'python' | 'markdown' | 'viz'
      name: name || `${type}_${cellIdCounter}`,
      source,
      output: null,
      execTime: null,
    };
    cells.push(cell);
    renderCell(cell);
    return cell;
  }

  // Render a single cell to the DOM
  function renderCell(cell) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.id = cell.id;
    el.draggable = true;
    el.innerHTML = `
      <div class="cell-header">
        <span class="cell-type ${cell.type}">${cell.type}</span>
        <input class="cell-name" value="${escapeHtml(cell.name)}" placeholder="Cell name..." />
        <span class="cell-exec-time"></span>
        <div class="cell-controls">
          <button class="cell-btn run-cell" title="Run (Shift+Enter)">Run</button>
          <button class="cell-btn move-up" title="Move up">&uarr;</button>
          <button class="cell-btn move-down" title="Move down">&darr;</button>
          <button class="cell-btn delete-cell" title="Delete cell">&times;</button>
        </div>
      </div>
      <div class="cell-editor">
        <textarea spellcheck="false" placeholder="${getPlaceholder(cell.type)}">${escapeHtml(cell.source)}</textarea>
      </div>
      <div class="cell-output"></div>
    `;

    // Wire up events
    const textarea = el.querySelector('textarea');
    const nameInput = el.querySelector('.cell-name');

    textarea.addEventListener('input', () => {
      cell.source = textarea.value;
      autoResize(textarea);
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        runCell(cell.id);
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        insertAtCursor(textarea, '  ');
      }
    });

    nameInput.addEventListener('input', () => {
      cell.name = nameInput.value;
    });

    el.querySelector('.run-cell').addEventListener('click', () => runCell(cell.id));
    el.querySelector('.move-up').addEventListener('click', () => moveCell(cell.id, -1));
    el.querySelector('.move-down').addEventListener('click', () => moveCell(cell.id, 1));
    el.querySelector('.delete-cell').addEventListener('click', () => deleteCell(cell.id));

    // Drag and drop
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', cell.id);
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const draggedId = e.dataTransfer.getData('text/plain');
      reorderCells(draggedId, cell.id);
    });

    cellsContainer().appendChild(el);
    autoResize(textarea);
    return el;
  }

  // Auto-resize textarea to fit content
  function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(60, textarea.scrollHeight) + 'px';
  }

  // Insert text at cursor position in a textarea
  function insertAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    textarea.value = before + text + after;
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.dispatchEvent(new Event('input'));
  }

  function getPlaceholder(type) {
    switch (type) {
      case 'sql': return 'SELECT * FROM my_table LIMIT 10;';
      case 'python': return 'import numpy as np\n\n# Your Python code here...';
      case 'markdown': return '# Title\n\nWrite your notes here...';
      case 'viz': return '// WebGPU visualization code\n// Use labglass.gpu to access WebGPU context';
      default: return '';
    }
  }

  // Execute a cell
  async function runCell(id) {
    const cell = cells.find(c => c.id === id);
    if (!cell) return;

    const el = document.getElementById(id);
    const outputEl = el.querySelector('.cell-output');
    const timeEl = el.querySelector('.cell-exec-time');

    el.classList.add('running');
    outputEl.innerHTML = '<pre class="info">Running...</pre>';

    const start = performance.now();

    try {
      switch (cell.type) {
        case 'sql':
          await runSQL(cell, outputEl);
          break;
        case 'python':
          await runPython(cell, outputEl);
          break;
        case 'markdown':
          renderMarkdown(cell, outputEl);
          break;
        case 'viz':
          await runViz(cell, outputEl);
          break;
      }
    } catch (err) {
      outputEl.innerHTML = `<pre class="error">${escapeHtml(err.message)}</pre>`;
    }

    const elapsed = performance.now() - start;
    cell.execTime = elapsed;
    timeEl.textContent = elapsed < 1000
      ? `${Math.round(elapsed)}ms`
      : `${(elapsed / 1000).toFixed(1)}s`;

    el.classList.remove('running');
  }

  // Run a SQL cell via DuckDB
  async function runSQL(cell, outputEl) {
    if (!LabDuckDB.isReady()) {
      outputEl.innerHTML = '<pre class="error">DuckDB is not ready. Wait for initialization.</pre>';
      return;
    }

    const result = await LabDuckDB.query(cell.source);
    cell.output = result;

    if (result.rows.length === 0) {
      outputEl.innerHTML = '<pre class="info">Query executed. No rows returned.</pre>';
      return;
    }

    // Render as table
    outputEl.innerHTML = renderTable(result.columns, result.rows);
  }

  // Run a Python cell via Pyodide
  async function runPython(cell, outputEl) {
    // Lazy-load Pyodide on first Python cell execution
    if (!LabPython.isReady()) {
      outputEl.innerHTML = '<pre class="info">Loading Python runtime (~11MB)...</pre>';
    }

    // Make previous SQL results available in Python
    for (const c of cells) {
      if (c.type === 'sql' && c.output && c.output.rows.length > 0) {
        await LabPython.injectData(c.name, c.output);
      }
    }

    const result = await LabPython.run(cell.source);

    let html = '';
    if (result.error) {
      html += `<pre class="error">${escapeHtml(result.error)}</pre>`;
    }
    if (result.output) {
      html += `<pre>${escapeHtml(result.output)}</pre>`;
    }
    for (const fig of result.figures) {
      html += `<img src="data:image/png;base64,${fig}" alt="Plot" />`;
    }
    if (!html) {
      html = '<pre class="info">Executed. No output.</pre>';
    }
    outputEl.innerHTML = html;
    cell.output = result;
  }

  // Render a Markdown cell
  function renderMarkdown(cell, outputEl) {
    // Simple markdown rendering (no external dependency)
    let html = cell.source;

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold & italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // Line breaks
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    html = '<p>' + html + '</p>';

    // Lists
    html = html.replace(/<p>- (.+?)(<br>|<\/p>)/g, '<li>$1</li>');

    outputEl.innerHTML = `<div class="markdown-rendered">${html}</div>`;
    cell.output = html;
  }

  // Run a WebGPU visualization cell
  async function runViz(cell, outputEl) {
    if (!LabViz || !LabViz.isReady()) {
      outputEl.innerHTML = '<pre class="error">WebGPU not available in this browser.</pre>';
      return;
    }

    // Create a canvas for this cell
    const canvasId = `canvas-${cell.id}`;
    outputEl.innerHTML = `<canvas id="${canvasId}" width="800" height="400"></canvas>`;
    const canvas = document.getElementById(canvasId);

    // Make cell data and canvas available to the viz code
    const cellData = {};
    for (const c of cells) {
      if (c.output && c.type === 'sql') {
        cellData[c.name] = c.output;
      }
    }

    try {
      // Execute viz code with canvas and data in scope
      const vizFn = new Function('canvas', 'data', 'gpu', cell.source);
      await vizFn(canvas, cellData, LabViz);
    } catch (err) {
      outputEl.innerHTML += `<pre class="error">${escapeHtml(err.message)}</pre>`;
    }
  }

  // Render an HTML table from columns and rows
  function renderTable(columns, rows, maxRows = 200) {
    const displayRows = rows.slice(0, maxRows);
    let html = '<table><thead><tr>';
    for (const col of columns) {
      html += `<th>${escapeHtml(col)}</th>`;
    }
    html += '</tr></thead><tbody>';
    for (const row of displayRows) {
      html += '<tr>';
      for (const col of columns) {
        const val = row[col];
        const display = val === null ? '<span style="color:var(--text-dim)">NULL</span>'
          : typeof val === 'object' ? escapeHtml(JSON.stringify(val))
          : escapeHtml(String(val));
        html += `<td>${display}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    if (rows.length > maxRows) {
      html += `<pre class="info">Showing ${maxRows} of ${rows.length} rows.</pre>`;
    }
    return html;
  }

  // Move a cell up or down
  function moveCell(id, direction) {
    const idx = cells.findIndex(c => c.id === id);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= cells.length) return;

    [cells[idx], cells[newIdx]] = [cells[newIdx], cells[idx]];
    rerenderAll();
  }

  // Reorder cells after drag-and-drop
  function reorderCells(draggedId, targetId) {
    const dragIdx = cells.findIndex(c => c.id === draggedId);
    const targetIdx = cells.findIndex(c => c.id === targetId);
    if (dragIdx === -1 || targetIdx === -1 || dragIdx === targetIdx) return;

    const [dragged] = cells.splice(dragIdx, 1);
    cells.splice(targetIdx, 0, dragged);
    rerenderAll();
  }

  // Delete a cell
  function deleteCell(id) {
    cells = cells.filter(c => c.id !== id);
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  // Re-render all cells (after reorder)
  function rerenderAll() {
    const container = cellsContainer();
    container.innerHTML = '';
    for (const cell of cells) {
      renderCell(cell);
      // Restore output
      if (cell.output) {
        const el = document.getElementById(cell.id);
        const outputEl = el.querySelector('.cell-output');
        const timeEl = el.querySelector('.cell-exec-time');
        // Re-run render for the output
        if (cell.type === 'sql' && cell.output.columns) {
          outputEl.innerHTML = renderTable(cell.output.columns, cell.output.rows);
        } else if (cell.type === 'markdown') {
          outputEl.innerHTML = `<div class="markdown-rendered">${cell.output}</div>`;
        } else if (cell.type === 'python' && cell.output) {
          let html = '';
          if (cell.output.error) html += `<pre class="error">${escapeHtml(cell.output.error)}</pre>`;
          if (cell.output.output) html += `<pre>${escapeHtml(cell.output.output)}</pre>`;
          for (const fig of (cell.output.figures || [])) {
            html += `<img src="data:image/png;base64,${fig}" alt="Plot" />`;
          }
          outputEl.innerHTML = html;
        }
        if (cell.execTime) {
          timeEl.textContent = cell.execTime < 1000
            ? `${Math.round(cell.execTime)}ms`
            : `${(cell.execTime / 1000).toFixed(1)}s`;
        }
      }
    }
  }

  // Run all cells sequentially
  async function runAll() {
    for (const cell of cells) {
      await runCell(cell.id);
    }
  }

  // Export notebook as JSON
  function exportNotebook() {
    return {
      version: 1,
      created: new Date().toISOString(),
      cells: cells.map(c => ({
        type: c.type,
        name: c.name,
        source: c.source,
      })),
    };
  }

  // Import notebook from JSON
  function importNotebook(data) {
    cells = [];
    cellsContainer().innerHTML = '';
    for (const c of data.cells) {
      createCell(c.type, c.source, c.name);
    }
  }

  // Get all cells (for collaboration sync)
  function getCells() {
    return cells.map(c => ({ type: c.type, name: c.name, source: c.source, id: c.id }));
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    createCell,
    runCell,
    runAll,
    deleteCell,
    moveCell,
    exportNotebook,
    importNotebook,
    getCells,
    cells: () => cells,
  };
})();
