/*
Copyright © 2025 Sam Analytic Solutions
All rights reserved.
*/
const { app, BrowserWindow } = require('electron');
const path = require('path');

function resolveAssetsBase() {
  if (app.isPackaged) {
    // In production, extraResources are placed in process.resourcesPath
    return path.join(process.resourcesPath, 'app-web');
  }
  // In development, use the parent folder where the web files live
  return path.resolve(__dirname, '..');
}

function createWindow() {
  const assetsBase = resolveAssetsBase();

  const win = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#0b0c10',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    }
  });

  const indexPath = path.join(assetsBase, 'index.html');
  win.loadURL(`file://${indexPath.replace(/\\/g, '/')}`);
}

app.setName('QR vCard Generator');
app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.sas.qr-vcard-generator');
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
}); 