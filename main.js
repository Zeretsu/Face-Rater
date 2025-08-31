const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;
let isDev = process.env.NODE_ENV === 'development';

// Enable live reload for Electron in development
if (isDev) {
    require('electron-reload')(__dirname, {
        electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
        hardResetMethod: 'exit'
    });
}

function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        frame: process.platform === 'darwin' ? true : false,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        backgroundColor: '#667eea',
        show: false
    });

    // Create application menu
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Analysis',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        mainWindow.webContents.send('new-analysis');
                    }
                },
                {
                    label: 'Save Results',
                    accelerator: 'CmdOrCtrl+S',
                    click: () => {
                        mainWindow.webContents.send('save-results');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Export as PDF',
                    accelerator: 'CmdOrCtrl+E',
                    click: () => {
                        mainWindow.webContents.send('export-pdf');
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
                { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
                { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
                { type: 'separator' },
                { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
                { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
                { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
                { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
                { label: 'Toggle Developer Tools', accelerator: 'F12', role: 'toggleDevTools' },
                { type: 'separator' },
                { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
                { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
                { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
                { type: 'separator' },
                { label: 'Toggle Fullscreen', accelerator: 'F11', role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About Face Beauty Analyzer',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About Face Beauty Analyzer',
                            message: 'Face Beauty Analyzer',
                            detail: 'Version 1.0.0\n\nAn advanced facial analysis tool using AI to evaluate facial proportions, symmetry, and harmony.\n\n© 2024 Face Beauty Analyzer',
                            buttons: ['OK']
                        });
                    }
                },
                {
                    label: 'Learn More',
                    click: () => {
                        require('electron').shell.openExternal('https://github.com');
                    }
                }
            ]
        }
    ];

    // macOS specific menu adjustments
    if (process.platform === 'darwin') {
        template.unshift({
            label: app.getName(),
            submenu: [
                { label: 'About ' + app.getName(), role: 'about' },
                { type: 'separator' },
                { label: 'Services', role: 'services', submenu: [] },
                { type: 'separator' },
                { label: 'Hide ' + app.getName(), accelerator: 'Command+H', role: 'hide' },
                { label: 'Hide Others', accelerator: 'Command+Shift+H', role: 'hideothers' },
                { label: 'Show All', role: 'unhide' },
                { type: 'separator' },
                { label: 'Quit', accelerator: 'Command+Q', click: () => app.quit() }
            ]
        });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

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
}

// IPC Handlers

// Get app version
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// Save analysis results
ipcMain.handle('save-analysis', async (event, data) => {
    try {
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Save Analysis Results',
            defaultPath: `face-analysis-${Date.now()}.json`,
            filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (filePath) {
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            return { success: true, path: filePath };
        }
        return { success: false, cancelled: true };
    } catch (error) {
        console.error('Error saving analysis:', error);
        return { success: false, error: error.message };
    }
});

// Load analysis results
ipcMain.handle('load-analysis', async () => {
    try {
        const { filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Load Analysis Results',
            filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (filePaths && filePaths[0]) {
            const data = await fs.readFile(filePaths[0], 'utf-8');
            return { success: true, data: JSON.parse(data) };
        }
        return { success: false, cancelled: true };
    } catch (error) {
        console.error('Error loading analysis:', error);
        return { success: false, error: error.message };
    }
});

// Export results in different formats
ipcMain.handle('export-results', async (event, data, format) => {
    try {
        let extension = 'txt';
        let content = '';

        switch (format) {
            case 'pdf':
                // For PDF export, you would need to integrate a PDF library
                extension = 'pdf';
                content = 'PDF export would require additional library';
                break;
            case 'html':
                extension = 'html';
                content = generateHTMLReport(data);
                break;
            case 'csv':
                extension = 'csv';
                content = generateCSVReport(data);
                break;
            default:
                content = generateTextReport(data);
        }

        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Export Analysis Results',
            defaultPath: `face-analysis-${Date.now()}.${extension}`,
            filters: [
                { name: `${format.toUpperCase()} Files`, extensions: [extension] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (filePath) {
            await fs.writeFile(filePath, content);
            return { success: true, path: filePath };
        }
        return { success: false, cancelled: true };
    } catch (error) {
        console.error('Error exporting results:', error);
        return { success: false, error: error.message };
    }
});

// Settings management
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

ipcMain.handle('get-settings', async () => {
    try {
        const data = await fs.readFile(settingsPath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // Return default settings if file doesn't exist
        return {
            theme: 'dark',
            autoAnalyze: true,
            showMesh: true,
            saveHistory: false
        };
    }
});

ipcMain.handle('save-settings', async (event, settings) => {
    try {
        await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
        return { success: true };
    } catch (error) {
        console.error('Error saving settings:', error);
        return { success: false, error: error.message };
    }
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

// Report generation helpers
function generateTextReport(data) {
    return `Face Beauty Analysis Report
================================
Generated: ${new Date().toLocaleString()}

Overall Score: ${data.overallScore}/100
${data.description}

Detailed Metrics:
-----------------
Proportions: ${data.proportions}%
Symmetry: ${data.symmetry}%
Harmony: ${data.harmony}%

Face Shape: ${data.faceShape}
Face Ratio: ${data.details.faceRatio}

Note: This analysis is for entertainment purposes only.
Beauty is subjective and diverse.
`;
}

function generateHTMLReport(data) {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Face Beauty Analysis Report</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #667eea; }
        .score { font-size: 48px; color: #4ade80; font-weight: bold; }
        .metric { margin: 10px 0; padding: 10px; background: #f0f0f0; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>Face Beauty Analysis Report</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
    <div class="score">${data.overallScore}/100</div>
    <p>${data.description}</p>
    <div class="metric">Proportions: ${data.proportions}%</div>
    <div class="metric">Symmetry: ${data.symmetry}%</div>
    <div class="metric">Harmony: ${data.harmony}%</div>
    <div class="metric">Face Shape: ${data.faceShape}</div>
</body>
</html>`;
}

function generateCSVReport(data) {
    return `Metric,Value
Overall Score,${data.overallScore}
Proportions,${data.proportions}
Symmetry,${data.symmetry}
Harmony,${data.harmony}
Face Shape,${data.faceShape}
Face Ratio,${data.details.faceRatio}
Generated,"${new Date().toLocaleString()}"`;
}

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

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}