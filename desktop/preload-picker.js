const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('picker', {
  onSources: callback => ipcRenderer.on('picker:sources', (_event, sources) => callback(sources)),
  choose: (id, withAudio) => ipcRenderer.send('picker:choose', { id, withAudio }),
  cancel: () => ipcRenderer.send('picker:cancel')
});
