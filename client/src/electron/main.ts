import { app, BrowserWindow } from 'electron'
import path from 'path'

const isDev = !app.isPackaged

const createWindow = () => {
    const win = new BrowserWindow({
        width: 1200,
        height: 800
    })

    if (isDev) {
        win.loadURL("http://localhost:5173")
        win.webContents.openDevTools()
    } else {
        win.loadFile(path.join(__dirname, "../renderer/index.html"))
    }
}

app.whenReady().then(() => {
    createWindow()
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    app.quit()
})