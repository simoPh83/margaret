import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import * as Sentry from '@sentry/nextjs';
import { isTauri } from './isTauri';

const RELEASES_URL = 'https://github.com/simoPh83/margaret/releases/latest';

export interface UpdateInfo {
  version: string;
  install: () => Promise<void>;
  manualUrl: string;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri) return null;

  let update;
  try {
    update = await check();
  } catch (err) {
    Sentry.captureException(err, { tags: { source: 'updater-check' } });
    throw err;
  }
  if (!update) return null;

  const version = update.version;

  return {
    version,
    manualUrl: RELEASES_URL,
    install: async () => {
      try {
        await update.downloadAndInstall();
      } catch (err) {
        Sentry.captureException(err, {
          tags: { source: 'updater-install' },
          extra: { targetVersion: version },
        });
        throw err;
      }
      await relaunch().catch((err) => {
        Sentry.captureException(err, { tags: { source: 'updater-relaunch' } });
        // relaunch fails when launched from the raw binary instead of .app bundle
        alert('Update installed. Please restart the app manually.');
      });
    },
  };
}
