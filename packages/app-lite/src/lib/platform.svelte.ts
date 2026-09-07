import type { Update } from '@tauri-apps/plugin-updater';

function persistedBool(key: string, defaultValue = false) {
  let value = $state(localStorage.getItem(key) === null ? defaultValue : localStorage.getItem(key) === 'true');

  return {
    get value() { return value; },
    set value(v) {
      value = v;
      localStorage.setItem(key, String(value));
    }
  };
}
export const enableAutoupdate = persistedBool('autoUpdate')

export const checkUpdate = async () => {
  if (!('__TAURI__' in window)) return null
  const { check } = await import('@tauri-apps/plugin-updater');

  const update = check();
  console.log(update)
  return update
}
