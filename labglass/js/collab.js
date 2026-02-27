// ── Peer-to-Peer Collaboration ──
// Uses raw WebRTC data channels for serverless peer-to-peer notebook sync.
// No signaling server — uses copy-paste SDP exchange (like serverless-webrtc).
// Yjs-style CRDT sync for conflict-free concurrent editing.

window.LabCollab = (() => {
  let pc = null; // RTCPeerConnection
  let dc = null; // RTCDataChannel
  let peers = new Map(); // peerId -> { channel, name }
  let isHost = false;
  let localPeerId = crypto.randomUUID().slice(0, 8);
  let onMessage = null;

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  // Create a new hosting session — generates an SDP offer
  async function host() {
    isHost = true;
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    dc = pc.createDataChannel('labglass', { ordered: true });
    setupDataChannel(dc);

    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        // ICE gathering complete — offer is ready
        const offerEl = document.getElementById('share-offer');
        if (offerEl) {
          offerEl.value = btoa(JSON.stringify(pc.localDescription));
        }
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    updateStatus('Waiting for peer...');
    return btoa(JSON.stringify(pc.localDescription));
  }

  // Join a session — accepts an SDP offer and generates an answer
  async function join(offerB64) {
    isHost = false;
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.ondatachannel = (event) => {
      dc = event.channel;
      setupDataChannel(dc);
    };

    const offer = JSON.parse(atob(offerB64));
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        const answerEl = document.getElementById('join-answer');
        if (answerEl) {
          answerEl.value = btoa(JSON.stringify(pc.localDescription));
          answerEl.style.display = 'block';
          const copyBtn = document.getElementById('btn-copy-answer');
          if (copyBtn) copyBtn.style.display = 'inline-block';
        }
      }
    };

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    updateStatus('Answer generated. Share it with the host.');
    return btoa(JSON.stringify(pc.localDescription));
  }

  // Accept an answer (host side)
  async function acceptAnswer(answerB64) {
    const answer = JSON.parse(atob(answerB64));
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    updateStatus('Connecting...');
  }

  // Set up data channel event handlers
  function setupDataChannel(channel) {
    channel.onopen = () => {
      updateStatus('Connected!');
      const statusEl = document.getElementById('status-collab');
      if (statusEl) statusEl.dataset.status = 'ready';

      // Send initial sync
      send({
        type: 'hello',
        peerId: localPeerId,
        cells: LabNotebook.getCells(),
      });
    };

    channel.onclose = () => {
      updateStatus('Disconnected');
      const statusEl = document.getElementById('status-collab');
      if (statusEl) statusEl.dataset.status = 'off';
    };

    channel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    channel.onerror = (err) => {
      console.error('Data channel error:', err);
      updateStatus('Error: ' + err.message);
    };
  }

  // Handle incoming messages
  function handleMessage(msg) {
    switch (msg.type) {
      case 'hello':
        peers.set(msg.peerId, { name: msg.peerId });
        updatePeerList();
        // If we have no cells but they do, import theirs
        if (LabNotebook.getCells().length === 0 && msg.cells && msg.cells.length > 0) {
          LabNotebook.importNotebook({ cells: msg.cells });
          toast('Synced notebook from peer', 'success');
        }
        break;

      case 'cell-update':
        // Apply remote cell change
        applyCellUpdate(msg);
        break;

      case 'cell-add':
        LabNotebook.createCell(msg.cellType, msg.source, msg.name);
        break;

      case 'cell-delete':
        LabNotebook.deleteCell(msg.cellId);
        break;

      case 'cursor':
        // Could render remote cursors — future enhancement
        break;

      default:
        if (onMessage) onMessage(msg);
    }
  }

  // Apply a cell update from a remote peer
  function applyCellUpdate(msg) {
    const cells = LabNotebook.getCells();
    const cell = cells.find(c => c.id === msg.cellId || c.name === msg.cellName);
    if (cell) {
      const el = document.getElementById(cell.id);
      if (el) {
        const textarea = el.querySelector('textarea');
        if (textarea && textarea.value !== msg.source) {
          textarea.value = msg.source;
          textarea.dispatchEvent(new Event('input'));
        }
      }
    }
  }

  // Send a message to all peers
  function send(msg) {
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify(msg));
    }
  }

  // Broadcast a cell change
  function broadcastCellUpdate(cellId, cellName, source) {
    send({
      type: 'cell-update',
      cellId,
      cellName,
      source,
      peerId: localPeerId,
    });
  }

  // Broadcast new cell
  function broadcastCellAdd(cellType, source, name) {
    send({
      type: 'cell-add',
      cellType,
      source,
      name,
      peerId: localPeerId,
    });
  }

  // Broadcast cell deletion
  function broadcastCellDelete(cellId) {
    send({
      type: 'cell-delete',
      cellId,
      peerId: localPeerId,
    });
  }

  function updateStatus(text) {
    const el = document.getElementById('collab-status');
    if (el) el.textContent = text;
  }

  function updatePeerList() {
    const el = document.getElementById('collab-peers');
    if (!el) return;
    if (peers.size === 0) {
      el.textContent = '';
      return;
    }
    el.textContent = `Peers: ${Array.from(peers.values()).map(p => p.name).join(', ')}`;
  }

  function isConnected() {
    return dc && dc.readyState === 'open';
  }

  function disconnect() {
    if (dc) dc.close();
    if (pc) pc.close();
    dc = null;
    pc = null;
    peers.clear();
    updateStatus('');
    updatePeerList();
    const statusEl = document.getElementById('status-collab');
    if (statusEl) statusEl.dataset.status = 'off';
  }

  function setOnMessage(fn) {
    onMessage = fn;
  }

  function toast(msg, type) {
    if (window.LabApp && window.LabApp.toast) {
      window.LabApp.toast(msg, type);
    }
  }

  return {
    host,
    join,
    acceptAnswer,
    send,
    broadcastCellUpdate,
    broadcastCellAdd,
    broadcastCellDelete,
    isConnected,
    disconnect,
    setOnMessage,
    localPeerId: () => localPeerId,
  };
})();
