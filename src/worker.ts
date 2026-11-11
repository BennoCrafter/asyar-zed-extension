import { ExtensionContext, extensionBridge } from 'asyar-sdk/worker';
import type { Extension, IFeedbackService, ILogService, IShellService } from 'asyar-sdk/contracts';

import manifest from '../manifest.json';
import { errorMessage, osascript, scripts } from './lib/zed';

const context = new ExtensionContext();
context.setExtensionId(manifest.id);

class ZedWorker implements Extension {
  async initialize(): Promise<void> {}
  async activate(): Promise<void> {}
  async deactivate(): Promise<void> {}
  onUnload = (): void => {};
  async executeCommand(commandId: string): Promise<unknown> {
    // "Open with Zed" has nothing to show, so it runs here instead of opening a view.
    if (commandId === 'open-finder-folder') {
      await osascript(context.getService<IShellService>('shell'), scripts.openFinder).catch((e) => {
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
