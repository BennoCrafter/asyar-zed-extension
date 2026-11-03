import { extensionBridge } from 'asyar-sdk/worker';
import type { Extension } from 'asyar-sdk/contracts';

import manifest from '../manifest.json';

class ZedWorker implements Extension {
  async initialize(): Promise<void> {}
  async activate(): Promise<void> {}
  async deactivate(): Promise<void> {}
  onUnload = (): void => {};
  async executeCommand(): Promise<unknown> {
    return undefined;
  }
  async search(): Promise<never[]> {
    return [];
  }
}

extensionBridge.registerManifest(manifest as never);
extensionBridge.registerExtensionImplementation(manifest.id, new ZedWorker() as never);
