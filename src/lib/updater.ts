import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { isTauri } from './isTauri';

export interface UpdateInfo {
  version: string;
  install: () => Promise<void>;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri) return null;

  const update = await check();
  if (!update) return null;

  return {
    version: update.version,
    install: async () => {
      await update.downloadAndInstall();
      await relaunch();
    },
  };
}
