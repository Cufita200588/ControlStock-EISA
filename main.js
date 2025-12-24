const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

let serverStarted = false;

const resolvePaths = () => {
  const isPackaged = app.isPackaged;
  const basePath = isPackaged ? process.resourcesPath : __dirname;
  const serverDir = path.join(basePath, 'server');

  return {
    serverDir,
    serverEntry: path.join(serverDir, 'src', 'index.js'),
    serviceAccountPath: path.join(serverDir, 'service-account.json'),
    clientIndex: path.join(isPackaged ? process.resourcesPath : __dirname, 'client', 'dist', 'index.html')
  };
};

const startServer = async () => {
  if (serverStarted) return;
  const { serverEntry, serviceAccountPath } = resolvePaths();

  if (!fs.existsSync(serverEntry)) {
    dialog.showErrorBox('Servidor no encontrado', 'No se encontró server/src/index.js dentro del paquete.');
    return;
  }

  const env = { ...process.env };
  env.PORT = env.PORT || '8081';
  env.NODE_ENV = 'production';

  if (fs.existsSync(serviceAccountPath)) {
    env.GOOGLE_APPLICATION_CREDENTIALS = serviceAccountPath;
    try {
      const json = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      env.FIRESTORE_PROJECT_ID = env.FIRESTORE_PROJECT_ID || json.project_id;
    } catch (err) {
      console.warn('No se pudo leer service-account.json', err);
    }
  } else {
    dialog.showErrorBox('Credenciales faltantes', 'No se encontró server/service-account.json. El backend no podrá conectarse a Firestore.');
  }

  Object.assign(process.env, env);

  try {
    const serverUrl = pathToFileURL(serverEntry).href;
    await import(serverUrl);
    serverStarted = true;
  } catch (err) {
    dialog.showErrorBox('Error al iniciar servidor', String(err));
    console.error('Error al iniciar servidor', err);
  }
};

function createWindow() {
  const { clientIndex } = resolvePaths();

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile(clientIndex);
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
