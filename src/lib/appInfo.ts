import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-shell';
import { isTauri } from './isTauri';

// All desktop/web forks live behind isTauri here in src/lib/.
// Pages/components should call these helpers, never @tauri-apps/* directly.

/** App version from tauri.conf.json on desktop, null on web. */
export async function getAppVersion(): Promise<string | null> {
  if (!isTauri) return null;
  return getVersion().catch(() => null);
}

/** Open a URL in the system browser (desktop) or a new tab (web). */
export async function openExternal(url: string): Promise<void> {
  if (isTauri) {
    await open(url).catch(() => window.open(url, '_blank'));
  } else {
    window.open(url, '_blank');
  }
}
