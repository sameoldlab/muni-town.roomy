function persistedBool(key: string, defaultValue = false) {
  let value = $state(localStorage.getItem(key) === null ? defaultValue : localStorage.getItem(key) === 'true');

  return {
    get value() {
      if (!('__TAURI__' in window)) return false;
      return value;
    },
    set value(v) {
      if (!('__TAURI__' in window)) return
      value = v;
      localStorage.setItem(key, String(value));
    }
  };
}
export const enableAutoupdate = persistedBool('autoUpdate', true)

/** Run update in background if autoUpdate is enabled*/
export const tryUpdate = async () => {
  const update = await checkUpdate()
  if (!update) return

  let contentLength = 0
  let downloaded = 0
  await update.download((event) => {
    switch (event.event) {
      case 'Started':
        contentLength = event.data.contentLength ?? 0
        console.debug(`starting update download: ${event.data.contentLength} bytes`);
        break;
      case 'Progress':
        downloaded += event.data.chunkLength
        console.debug(` ${downloaded} /  ${contentLength} complete`);
        break;
      case 'Finished':
        console.log('update download finished');
        break;
    }
  });
}

export const checkUpdate = async () => {
  if (!('__TAURI__' in window) || !('updater' in window.__TAURI__)) return null
  const { check, } = await import('@tauri-apps/plugin-updater');

  return check();
}

