const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Enable live reload for Electron in development
if (process.env.NODE_ENV === 'development') {
    require('electron-reload')(__dirname, {
        electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
        hardResetMethod: 'exit'
    });
}

let mainWindow;
let isDev = process.env.NODE_ENV === 'development';

function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        show: false
    });

    // Load the app
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    }

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Handle window closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Create application menu
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Save Analysis',
                    accelerator: 'CmdOrCtrl+S',
                    click: () => {
                        mainWindow.webContents.send('save-analysis');
                    }
                },
                {
                    label: 'Export Results',
                    accelerator: 'CmdOrCtrl+E',
                    click: () => {
                        mainWindow.webContents.send('export-results');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Quit',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About Face Beauty Analyzer',
                            message: 'Face Beauty Analyzer',
                            detail: 'Version 1.0.0\n\nAI-powered facial analysis application using TensorFlow.js and MediaPipe.',
                            buttons: ['OK']
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// IPC Handlers
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('save-analysis', async (event, data) => {
    try {
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Save Analysis',
            defaultPath: `face-analysis-${Date.now()}.json`,
            filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (filePath) {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            return { success: true, path: filePath };
        }
        return { success: false, cancelled: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('load-analysis', async () => {
    try {
        const { filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Load Analysis',
            filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (filePaths && filePaths.length > 0) {
            const data = fs.readFileSync(filePaths[0], 'utf8');
            return { success: true, data: JSON.parse(data) };
        }
        return { success: false, cancelled: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('export-results', async (event, data, format) => {
    try {
        const extension = format === 'pdf' ? 'pdf' : 'png';
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Export Results',
            defaultPath: `face-analysis-${Date.now()}.${extension}`,
            filters: [
                { name: format.toUpperCase(), extensions: [extension] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (filePath) {
            // For PNG export, we'd need to implement screenshot functionality
            // For now, we'll save as JSON
            fs.writeFileSync(filePath.replace(`.${extension}`, '.json'), JSON.stringify(data, null, 2));
            return { success: true, path: filePath };
        }
        return { success: false, cancelled: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-settings', () => {
    // Return default settings
    return {
        theme: 'dark',
        autoAnalyze: true,
        showMesh: true
    };
});

ipcMain.handle('save-settings', (event, settings) => {
    // In a real app, you'd save these to a file or database
    console.log('Settings saved:', settings);
    return { success: true };
});

// Window controls
ipcMain.on('minimize-window', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.on('close-window', () => {
    if (mainWindow) mainWindow.close();
});

// App event handlers
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Handle certificate errors
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    // In development, ignore certificate errors
    if (isDev) {
        event.preventDefault();
        callback(true);
    } else {
        // In production, use default behavior
        callback(false);
    }
});