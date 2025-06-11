const electron = require('electron');
const path = require('path');
const { NetworkManager } = require('./src/network-manager');

// Access the app and BrowserWindow modules through the electron module
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const ipcMain = electron.ipcMain;

// Keep a global reference of the window object to prevent garbage collection
let mainWindow = null;
let networkManager = null;

// Wait until the app is ready
app.on('ready', function() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false, 
    titleBarStyle: 'hidden', 
    webPreferences: {
      nodeIntegration: true, // Re-enable for now
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Initialize the NetworkManager and set up its callbacks to send data to the renderer
  networkManager = new NetworkManager();
  networkManager.setCallbacks({
    onMessageReceived: (timestamp, sender, senderIp, message) => {
      if (mainWindow) {
        mainWindow.webContents.send('message-received', { timestamp, sender, senderIp, message });
      }
    },
    onPeersUpdated: (peers) => {
      if (mainWindow) {
        mainWindow.webContents.send('peers-updated', peers);
      }
    },
    onSystemLog: (message) => {
      if (mainWindow) {
        mainWindow.webContents.send('system-log', message);
      }
    }
  });

  // Check for inactive peers periodically
  setInterval(() => {
    if (networkManager) {
      networkManager.checkInactivePeers();
    }
  }, 15000);

  // Load the index.html of the app
  mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
  
  // Re-enable DevTools for debugging
  mainWindow.webContents.openDevTools();

  // Emitted when the window is closed
  mainWindow.on('closed', function() {
    mainWindow = null;
  });
});

// Quit when all windows are closed
app.on('window-all-closed', function() {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function() {
  if (mainWindow === null) {
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      frame: false, 
      titleBarStyle: 'hidden', 
      webPreferences: {
        nodeIntegration: true, // Re-enable for now
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js')
      }
    });
    mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
  }
});

// IPC handlers for the renderer to interact with the NetworkManager
ipcMain.on('start-p2p', (event, nickname) => {
  if (networkManager) {
    networkManager.nickname = nickname;
    const success = networkManager.startNetworking();
    event.reply('start-p2p-reply', success);
  } else {
    event.reply('start-p2p-reply', false);
  }
});

ipcMain.on('send-message', (event, { selectedPeers, message }) => {
  if (networkManager) {
    networkManager.sendMessageToSelectedPeers(selectedPeers, message);
  }
});

ipcMain.handle('get-stats', () => {
  if (networkManager) {
    return networkManager.getStats();
  }
  return null;
});

// Window control handlers
ipcMain.on('window:minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});
