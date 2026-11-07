// =======================================================
// CineShare Desktop - Processo principal do Electron
// =======================================================
const {
  app,
  BrowserWindow,
  session,
  desktopCapturer,
  ipcMain,
  shell,
  net
} = require('electron');
const path = require('path');
const fs = require('fs');

// URL do servidor: variável de ambiente > config.json
function getServerUrl() {
  if (process.env.CINESHARE_URL) return process.env.CINESHARE_URL;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
    if (cfg.serverUrl) return cfg.serverUrl;
  } catch (e) {
    console.error('Erro ao ler config.json:', e);
  }
  return 'http://localhost:3000';
}

const SERVER_URL = getServerUrl().replace(/\/+$/, '');
let mainWindow = null;

// Apenas uma instância do app aberta por vez
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// -------------------------------------------------------
// Janela principal
// -------------------------------------------------------
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0b10',
    title: 'CineShare',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false // não reduzir o vídeo quando a janela perde o foco
    }
  });

  // Links externos abrem no navegador padrão
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(__dirname, 'splash.html'));
  mainWindow.webContents.once('did-finish-load', () => waitForServerAndLoad());

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Aguarda o servidor responder (servidores gratuitos na nuvem "dormem")
async function waitForServerAndLoad() {
  const maxAttempts = 40; // ~2 minutos
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!mainWindow) return;
    setSplashStatus(
      attempt === 1
        ? 'Conectando ao servidor...'
        : `Acordando o servidor... (tentativa ${attempt})`
    );
    try {
      const res = await net.fetch(`${SERVER_URL}/health`, { cache: 'no-store' });
      if (res.ok) {
        mainWindow.loadURL(SERVER_URL);
        return;
      }
    } catch (e) {
      // servidor ainda não respondeu
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  setSplashStatus('Não foi possível conectar ao servidor. Verifique sua internet e reabra o app.', true);
}

function setSplashStatus(text, isError = false) {
  if (!mainWindow) return;
  mainWindow.webContents
    .executeJavaScript(`window.setStatus && window.setStatus(${JSON.stringify(text)}, ${isError})`)
    .catch(() => {});
}

// -------------------------------------------------------
// Permissões (microfone, captura de tela, tela cheia)
// -------------------------------------------------------
function setupPermissions() {
  const allowed = new Set(['media', 'display-capture', 'fullscreen', 'clipboard-sanitized-write']);
  const serverOrigin = new URL(SERVER_URL).origin;

  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const origin = details.requestingUrl ? new URL(details.requestingUrl).origin : '';
    callback(allowed.has(permission) && origin === serverOrigin);
  });

  session.defaultSession.setPermissionCheckHandler((wc, permission, requestingOrigin) => {
    return allowed.has(permission) && requestingOrigin === serverOrigin;
  });
}

// -------------------------------------------------------
// Compartilhamento de tela com ÁUDIO DO SISTEMA (loopback)
// -------------------------------------------------------
function setupDisplayMedia() {
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true
      });

      const choice = await openSourcePicker(sources);
      if (!choice) {
        callback({}); // usuário cancelou
        return;
      }

      const source = sources.find(s => s.id === choice.id);
      if (!source) {
        callback({});
        return;
      }

      // 'loopback' captura o som do Windows mesmo ao escolher uma janela específica
      callback(choice.withAudio ? { video: source, audio: 'loopback' } : { video: source });
    } catch (err) {
      console.error('Erro no seletor de tela:', err);
      callback({});
    }
  });
}

function openSourcePicker(sources) {
  return new Promise(resolve => {
    const picker = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      width: 860,
      height: 620,
      resizable: false,
      minimizable: false,
      maximizable: false,
      backgroundColor: '#12141f',
      title: 'Escolha o que compartilhar',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload-picker.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener('picker:choose', onChoose);
      ipcMain.removeListener('picker:cancel', onCancel);
      if (!picker.isDestroyed()) picker.close();
      resolve(result);
    };
    const onChoose = (event, payload) => {
      if (event.sender === picker.webContents) finish(payload);
    };
    const onCancel = event => {
      if (event.sender === picker.webContents) finish(null);
    };

    ipcMain.on('picker:choose', onChoose);
    ipcMain.on('picker:cancel', onCancel);
    picker.on('closed', () => finish(null));

    const serialized = sources.map(s => ({
      id: s.id,
      name: s.name,
      isScreen: s.id.startsWith('screen:'),
      thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
      icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null
    }));

    picker.loadFile(path.join(__dirname, 'picker.html'));
    picker.webContents.once('did-finish-load', () => {
      picker.webContents.send('picker:sources', serialized);
    });
  });
}

// -------------------------------------------------------
app.whenReady().then(() => {
  setupPermissions();
  setupDisplayMedia();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

