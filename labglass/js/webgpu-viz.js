// ── WebGPU Visualization Pipeline ──
// Provides a WebGPU compute + render context for viz cells.
// Falls back gracefully if WebGPU is unavailable.

window.LabViz = (() => {
  let adapter = null;
  let device = null;
  let ready = false;

  async function init() {
    const statusEl = document.getElementById('status-webgpu');

    if (!navigator.gpu) {
      if (statusEl) statusEl.dataset.status = 'off';
      console.warn('WebGPU not supported');
      return false;
    }

    try {
      adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        if (statusEl) statusEl.dataset.status = 'off';
        return false;
      }

      device = await adapter.requestDevice();
      device.lost.then((info) => {
        console.error('WebGPU device lost:', info.message);
        ready = false;
        if (statusEl) statusEl.dataset.status = 'error';
      });

      ready = true;
      if (statusEl) statusEl.dataset.status = 'ready';
      return true;
    } catch (err) {
      console.error('WebGPU init failed:', err);
      if (statusEl) statusEl.dataset.status = 'error';
      return false;
    }
  }

  // Get a WebGPU context for a canvas
  function getContext(canvas) {
    if (!device) return null;
    const ctx = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: 'premultiplied' });
    return { ctx, format, device };
  }

  // Run a compute shader and read back results
  async function compute({ shader, workgroups, buffers }) {
    if (!device) throw new Error('WebGPU device not available');

    const module = device.createShaderModule({ code: shader });

    // Create buffers
    const gpuBuffers = buffers.map(buf => {
      const gpuBuf = device.createBuffer({
        size: buf.data.byteLength,
        usage: buf.usage || (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC),
        mappedAtCreation: true,
      });
      new Float32Array(gpuBuf.getMappedRange()).set(new Float32Array(buf.data));
      gpuBuf.unmap();
      return gpuBuf;
    });

    // Create bind group layout and bind group
    const bindGroupLayout = device.createBindGroupLayout({
      entries: gpuBuffers.map((_, i) => ({
        binding: i,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'storage' },
      })),
    });

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: gpuBuffers.map((buf, i) => ({
        binding: i,
        resource: { buffer: buf },
      })),
    });

    const pipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      compute: { module, entryPoint: 'main' },
    });

    // Dispatch
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(...workgroups);
    pass.end();

    // Read back results
    const readBuffers = gpuBuffers.map(buf => {
      const readBuf = device.createBuffer({
        size: buf.size,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      encoder.copyBufferToBuffer(buf, 0, readBuf, 0, buf.size);
      return readBuf;
    });

    device.queue.submit([encoder.finish()]);

    // Map and read results
    const results = [];
    for (const readBuf of readBuffers) {
      await readBuf.mapAsync(GPUMapMode.READ);
      const data = new Float32Array(readBuf.getMappedRange().slice(0));
      readBuf.unmap();
      results.push(data);
      readBuf.destroy();
    }

    // Cleanup
    gpuBuffers.forEach(b => b.destroy());

    return results;
  }

  // Render a scatter plot using WebGPU
  async function scatterPlot(canvas, xData, yData, options = {}) {
    if (!device) {
      // Fallback: Canvas 2D
      return scatterPlot2D(canvas, xData, yData, options);
    }

    // For now, use Canvas 2D as a reliable baseline
    // WebGPU rendering can be added as an enhancement
    return scatterPlot2D(canvas, xData, yData, options);
  }

  // Canvas 2D scatter plot (fallback and default)
  function scatterPlot2D(canvas, xData, yData, options = {}) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const padding = 50;

    const color = options.color || '#58a6ff';
    const bg = options.bg || '#1c2128';
    const title = options.title || '';
    const xLabel = options.xLabel || '';
    const yLabel = options.yLabel || '';
    const pointSize = options.pointSize || 3;

    // Clear
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Compute ranges
    const xMin = Math.min(...xData);
    const xMax = Math.max(...xData);
    const yMin = Math.min(...yData);
    const yMax = Math.max(...yData);
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;

    // Draw axes
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, h - padding);
    ctx.lineTo(w - padding, h - padding);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = '#8b949e';
    ctx.font = '12px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    if (xLabel) ctx.fillText(xLabel, w / 2, h - 10);
    if (yLabel) {
      ctx.save();
      ctx.translate(14, h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(yLabel, 0, 0);
      ctx.restore();
    }
    if (title) {
      ctx.fillStyle = '#e6edf3';
      ctx.font = '14px -apple-system, sans-serif';
      ctx.fillText(title, w / 2, 24);
    }

    // Tick marks
    ctx.fillStyle = '#8b949e';
    ctx.font = '10px SF Mono, monospace';
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const xVal = xMin + (xRange * i / ticks);
      const yVal = yMin + (yRange * i / ticks);
      const xPos = padding + ((w - 2 * padding) * i / ticks);
      const yPos = h - padding - ((h - 2 * padding) * i / ticks);

      ctx.textAlign = 'center';
      ctx.fillText(xVal.toFixed(1), xPos, h - padding + 16);
      ctx.textAlign = 'right';
      ctx.fillText(yVal.toFixed(1), padding - 6, yPos + 4);
    }

    // Draw points
    ctx.fillStyle = color;
    const plotW = w - 2 * padding;
    const plotH = h - 2 * padding;

    for (let i = 0; i < xData.length; i++) {
      const px = padding + ((xData[i] - xMin) / xRange) * plotW;
      const py = h - padding - ((yData[i] - yMin) / yRange) * plotH;
      ctx.beginPath();
      ctx.arc(px, py, pointSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Point count
    ctx.fillStyle = '#8b949e';
    ctx.font = '10px SF Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`n=${xData.length}`, w - padding, padding - 8);
  }

  // Bar chart
  function barChart(canvas, labels, values, options = {}) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const padding = 50;

    const color = options.color || '#58a6ff';
    const bg = options.bg || '#1c2128';
    const title = options.title || '';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const maxVal = Math.max(...values) || 1;
    const barWidth = (w - 2 * padding) / labels.length * 0.8;
    const gap = (w - 2 * padding) / labels.length * 0.2;

    // Title
    if (title) {
      ctx.fillStyle = '#e6edf3';
      ctx.font = '14px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, w / 2, 24);
    }

    // Bars
    for (let i = 0; i < labels.length; i++) {
      const barH = (values[i] / maxVal) * (h - 2 * padding);
      const x = padding + i * (barWidth + gap);
      const y = h - padding - barH;

      ctx.fillStyle = color;
      ctx.fillRect(x, y, barWidth, barH);

      // Label
      ctx.fillStyle = '#8b949e';
      ctx.font = '10px SF Mono, monospace';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(x + barWidth / 2, h - padding + 14);
      if (labels[i].length > 8) {
        ctx.rotate(-Math.PI / 6);
        ctx.textAlign = 'right';
      }
      ctx.fillText(labels[i], 0, 0);
      ctx.restore();

      // Value
      ctx.fillStyle = '#e6edf3';
      ctx.textAlign = 'center';
      ctx.fillText(values[i].toFixed(1), x + barWidth / 2, y - 6);
    }
  }

  // Heatmap
  function heatmap(canvas, matrix, options = {}) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const rows = matrix.length;
    const cols = matrix[0].length;
    const cellW = w / cols;
    const cellH = h / rows;

    const min = options.min ?? Math.min(...matrix.flat());
    const max = options.max ?? Math.max(...matrix.flat());
    const range = max - min || 1;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = (matrix[r][c] - min) / range;
        const hue = (1 - val) * 240; // blue to red
        ctx.fillStyle = `hsl(${hue}, 80%, ${30 + val * 30}%)`;
        ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
      }
    }
  }

  function isReady() { return ready; }
  function getDevice() { return device; }
  function getAdapter() { return adapter; }

  return {
    init,
    getContext,
    compute,
    scatterPlot,
    barChart,
    heatmap,
    isReady,
    getDevice,
    getAdapter,
  };
})();
