self.onmessage = function (e) {
  self.postMessage('pong:' + e.data);
};
