// Electron main process for the ATS CV Studio desktop app.
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { importLinkedInProfile } = require('./linkedin.cjs');
const { callAi, readSettings, writeSettings, publicSettings } = require('./aiClient.cjs');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const FILTERS = {
  pdf: [{ name: 'PDF', extensions: ['pdf'] }],
  docx: [{ name: 'Word document', extensions: ['docx'] }],
  txt: [{ name: 'Text', extensions: ['txt'] }],
  json: [{ name: 'JSON', extensions: ['json'] }],
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: `ATS CV Studio ${app.getVersion()}`,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    backgroundColor: '#f4f5fa',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (DEV_URL) mainWindow.loadURL(DEV_URL);
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Open external links in the user's browser, never inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
}

async function askSavePath(sender, fileName) {
  const win = BrowserWindow.fromWebContents(sender);
  const ext = path.extname(fileName).slice(1).toLowerCase();
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('documents'), fileName),
    filters: FILTERS[ext] ?? [],
  });
  return canceled ? null : filePath;
}

ipcMain.handle('save-file', async (event, { name, data }) => {
  const filePath = await askSavePath(event.sender, String(name));
  if (!filePath) return false;
  await fs.writeFile(filePath, Buffer.from(data));
  return true;
});

ipcMain.handle('print-to-pdf', async (event, { name }) => {
  const filePath = await askSavePath(event.sender, String(name));
  if (!filePath) return false;
  // Uses the page's print stylesheet, so only the CV is rendered — as real, selectable text.
  const pdf = await event.sender.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
  await fs.writeFile(filePath, pdf);
  shell.showItemInFolder(filePath);
  return true;
});

ipcMain.handle('linkedin-import', (event, payload) => {
  const { url, options } = payload && typeof payload === 'object' ? payload : { url: payload, options: {} };
  // Stream progress to the import dialog so it can tell the user what is happening.
  const progress = (update) => { if (!event.sender.isDestroyed()) event.sender.send('linkedin-progress', update); };
  return importLinkedInProfile(BrowserWindow.fromWebContents(event.sender), String(url), options ?? {}, progress);
});

// ---------------------------------------------------------------- AI provider
// The key is stored in the app's own data folder and is never sent to the renderer.
ipcMain.handle('ai-settings-get', () => publicSettings(readSettings(app.getPath('userData'))));

ipcMain.handle('ai-settings-set', (_event, patch) => publicSettings(writeSettings(app.getPath('userData'), patch)));

ipcMain.handle('ai-complete', async (_event, { prompt }) => {
  const settings = readSettings(app.getPath('userData'));
  return callAi({ ...settings, prompt: String(prompt ?? '') });
});

// Multi-turn version: the whole conversation is sent each time, so the assistant remembers its own questions.
ipcMain.handle('ai-chat', async (_event, { messages }) => {
  const settings = readSettings(app.getPath('userData'));
  return callAi({ ...settings, messages: Array.isArray(messages) ? messages : [] });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  app.setAppUserModelId('com.atscvstudio.app');
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
