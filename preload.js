const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'electronAPI', {
    // Window controls
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),

    // Network API
    startP2P: (nickname) => {
      ipcRenderer.send('start-p2p', nickname);
      return new Promise((resolve) => {
        ipcRenderer.once('start-p2p-reply', (_event, success) => {
          resolve(success);
        });
      });
    },
    sendMessage: (data) => ipcRenderer.send('send-message', data),
    getStats: () => ipcRenderer.invoke('get-stats'),

    // Listeners for events from main
    onMessageReceived: (callback) => ipcRenderer.on('message-received', (_event, { timestamp, sender, senderIp, message }) => callback(timestamp, sender, senderIp, message)),
    onPeersUpdated: (callback) => ipcRenderer.on('peers-updated', (_event, peers) => callback(peers)),
    onSystemLog: (callback) => ipcRenderer.on('system-log', (_event, message) => callback(message)),
  }
); 