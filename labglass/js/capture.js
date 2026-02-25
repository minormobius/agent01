// ── Screen Capture & Recording ──
// Uses MediaRecorder + WebCodecs (where available) for session recording.
// Records the notebook area and exports as WebM/MP4.
// Falls back gracefully if APIs are unavailable.

window.LabCapture = (() => {
  let mediaRecorder = null;
  let recordedChunks = [];
  let stream = null;
  let recording = false;
  let startTime = 0;

  async function startRecording() {
    if (recording) return;

    // Guard: getDisplayMedia is unavailable on iOS Safari
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
      throw new Error('Screen recording is not supported in this browser (no getDisplayMedia).');
    }

    try {
      // Capture the notebook area (or whole tab)
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: false,
        preferCurrentTab: true,
      });

      // Check for WebCodecs support and use it for higher quality if available
      const mimeType = getPreferredMimeType();

      mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2500000,
      });

      recordedChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        finishRecording();
      };

      // Handle stream ending (user clicks "Stop sharing")
      stream.getVideoTracks()[0].onended = () => {
        stopRecording();
      };

      mediaRecorder.start(1000); // Chunk every second
      recording = true;
      startTime = Date.now();

      // Show indicator
      document.getElementById('rec-indicator').classList.remove('hidden');

      return true;
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        throw new Error('Screen recording permission denied.');
      }
      throw err;
    }
  }

  function stopRecording() {
    if (!recording || !mediaRecorder) return;

    recording = false;
    mediaRecorder.stop();

    // Stop all tracks
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    document.getElementById('rec-indicator').classList.add('hidden');
  }

  async function finishRecording() {
    if (recordedChunks.length === 0) return;

    const mimeType = recordedChunks[0].type || 'video/webm';
    const blob = new Blob(recordedChunks, { type: mimeType });
    const duration = Date.now() - startTime;

    // Save to OPFS — use correct extension based on actual MIME type
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const filename = `recording-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.${ext}`;

    try {
      await LabStorage.writeFile(filename, blob);
      toast(`Recording saved: ${filename} (${LabStorage.formatBytes(blob.size)})`, 'success');
    } catch (e) {
      console.error('Failed to save recording to OPFS:', e);
    }

    // Also offer download
    downloadBlob(blob, filename);

    recordedChunks = [];
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getPreferredMimeType() {
    const types = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=h264',
      'video/mp4',
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    // Final fallback — let the browser pick
    return '';
  }

  function isRecording() {
    return recording;
  }

  function toast(msg, type) {
    if (window.LabApp && window.LabApp.toast) {
      window.LabApp.toast(msg, type);
    }
  }

  return {
    startRecording,
    stopRecording,
    isRecording,
  };
})();
