import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { isTauri } from './isTauri';

const RELEASES_URL = 'https://github.com/simoPh83/margaret/releases/latest';

export interface UpdateInfo {
  version: string;
  install: () => Promise<void>;
  manualUrl: string;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri) return null;

  const update = await check();
  if (!update) return null;

  return {
    version: update.version,
    manualUrl: RELEASES_URL,
    install: async () => {
      await update.downloadAndInstall();
      await relaunch().catch(() => {
        // relaunch fails when launched from the raw binary instead of .app bundle
        alert('Update installed. Please restart the app manually.');
      });
    },
  };
}
