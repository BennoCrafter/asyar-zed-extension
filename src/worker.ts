import { ExtensionContext, environment, extensionBridge } from 'asyar-sdk/worker';
import type { Extension, IFeedbackService, ILogService, ISelectionService, IShellService } from 'asyar-sdk/contracts';

import manifest from '../manifest.json';
import { errorMessage, openFinderScript, run, scripts } from './lib/zed';

const context = new ExtensionContext();
context.setExtensionId(manifest.id);

// macOS uses AppleScript for the front-window fallback; other OSes read the file manager selection.
async function openSelection(): Promise<void> {
  const shell = context.getService<IShellService>('shell');
  if (environment.platform === 'macos') {
    await run(shell, 'macos', openFinderScript);
    return;
  }
  const paths = await context.getService<ISelectionService>('selection').getSelectedFinderItems();
  if (paths.length === 0) throw new Error('Nothing selected in the file manager.');
  await run(shell, environment.platform, scripts[environment.platform].open, paths);
}

class ZedWorker implements Extension {
  async initialize(): Promise<void> {}
  async activate(): Promise<void> {}
  async deactivate(): Promise<void> {}
  onUnload = (): void => {};
  async executeCommand(commandId: string): Promise<unknown> {
    // "Open with Zed" has nothing to show, so it runs here instead of opening a view.
    if (commandId === 'open-finder-folder') {
      await openSelection().catch((e) => {
        context.getService<ILogService>('log').error(`Open with Zed: ${errorMessage(e)}`);
        return context.getService<IFeedbackService>('feedback').sendBackground({ title: 'Open with Zed', body: errorMessage(e) });
      });
    }
    return undefined;
  }
  async search(): Promise<never[]> {
    return [];
  }
}

extensionBridge.registerManifest(manifest as never);
extensionBridge.registerExtensionImplementation(manifest.id, new ZedWorker() as never);
