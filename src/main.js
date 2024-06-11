const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function readMusicLibrary() {
    try {
        const filePath = path.join(__dirname, 'musicLibrary.json');
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        } else {
            const emptyLibrary = {};
            writeMusicLibrary(emptyLibrary);
            return emptyLibrary;
        }
    } catch (error) {
        console.error('Error reading music library:', error);
        return {};
    }
}

function writeMusicLibrary(musicLibrary) {
    try {
        const filePath = path.join(__dirname, 'musicLibrary.json');
        fs.writeFileSync(filePath, JSON.stringify(musicLibrary, null, 2));
    } catch (error) {
        console.error('Error writing music library:', error);
    }
}

function getAllMusicFiles(dirPath, fileList = []) {
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
        const filePath = path.join(dirPath, file);
        if (fs.statSync(filePath).isDirectory()) {
            getAllMusicFiles(filePath, fileList);
        } else if (['.mp3', '.wav'].includes(path.extname(file).toLowerCase())) {
            fileList.push(filePath);
        }
    });

    return fileList;
}

async function addFilesToLibrary(filePaths) {
  const { parseFile } = await import('music-metadata');
  const musicLibrary = readMusicLibrary();

  for (const file of filePaths) {
      const metadata = await parseFile(file);
      const { artist = 'Unknown Artist', album = 'Unknown Album', title = path.basename(file) } = metadata.common;
      let duration = metadata.common.duration || metadata.format.duration;      let artwork = null;
      if (metadata.common.picture && metadata.common.picture.length > 0) {
          const picture = metadata.common.picture[0];
          artwork = `data:${picture.format};base64,${picture.data.toString('base64')}`;
      } else {
          console.log(`No artwork found for ${album}`);
      }
      if (!musicLibrary[artist]) {
          musicLibrary[artist] = {};
      }
      if (!musicLibrary[artist][album]) {
          musicLibrary[artist][album] = { artwork, songs: [] };
      }
      if (!musicLibrary[artist][album].songs.some(song => song.file === file)) {
          musicLibrary[artist][album].songs.push({ title, file, duration });
      }

      console.log("Title:", title);
console.log("Duration:", duration);

  }
  writeMusicLibrary(musicLibrary);
  return musicLibrary;
}

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    mainWindow.loadFile('src/index.html');

    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('music-library', readMusicLibrary());
    });
}

app.on('ready', createWindow);

ipcMain.on('update-music-library', (event, musicLibrary) => {
    writeMusicLibrary(musicLibrary);
});

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

ipcMain.handle('import-music', async (event) => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile', 'openDirectory', 'multiSelections'],
        filters: [
            { name: 'Music Files', extensions: ['mp3', 'wav'] }
        ]
    });
    if (!result.canceled) {
        let musicFiles = [];
        for (const filePath of result.filePaths) {
            if (fs.statSync(filePath).isDirectory()) {
                musicFiles = musicFiles.concat(getAllMusicFiles(filePath));
            } else {
                musicFiles.push(filePath);
            }
        }
        const updatedLibrary = await addFilesToLibrary(musicFiles);
        return updatedLibrary;
    }
    return {};
});
