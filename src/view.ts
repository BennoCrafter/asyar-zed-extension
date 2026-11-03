import 'asyar-sdk/tokens.css';
import { mount } from 'svelte';
import { ExtensionContext, extensionBridge, registerIconElement } from 'asyar-sdk/view';
import type { Extension, IExtensionManager, IFeedbackService, IShellService } from 'asyar-sdk/contracts';

import manifest from '../manifest.json';
import RecentsView from './RecentsView.svelte';
import { errorMessage, osascript, scripts } from './lib/zed';

const extensionId =
  window.location.hostname === 'localhost' || window.location.hostname === 'asyar-extension.localhost'
    ? window.location.pathname.split('/').filter(Boolean)[0] || manifest.id
    : window.location.hostname || manifest.id;

class ZedView implements Extension {
  private extensions?: IExtensionManager;
  async initialize(ctx: ExtensionContext): Promise<void> {
    this.extensions = ctx.getService<IExtensionManager>('extensions');
  }
  async activate(): Promise<void> {}
  async deactivate(): Promise<void> {}
  onUnload = (): void => {};

  async executeCommand(commandId: string): Promise<unknown> {
    const command = manifest.commands.find((c) => c.id === commandId) as { component?: string } | undefined;
    const component = command?.component;
    if (!component) return undefined;
    const viewPath = `${extensionId}/${component}`;
    this.extensions?.navigateToView(viewPath);
    return { type: 'view', viewPath };
  }
}

const context = new ExtensionContext();
context.setExtensionId(extensionId);
registerIconElement();

const view = new ZedView();
extensionBridge.registerManifest(manifest as never);
extensionBridge.registerExtensionImplementation(extensionId, view);
void view.initialize(context);

// Forward ⌘K so the host's action drawer opens from inside the iframe.
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    const { key, metaKey, ctrlKey, shiftKey, altKey } = e;
    window.parent.postMessage({ type: 'asyar:extension:keydown', payload: { key, metaKey, ctrlKey, shiftKey, altKey } }, '*');
  }
});

const target = document.getElementById('app');
const viewName = new URLSearchParams(window.location.search).get('view');
if (viewName === 'RecentsView' && target) mount(RecentsView, { target, props: { context } });

// "Open with Zed" has nothing to show; it's a view only because spawns from the worker hang.
// Hide first so the view never appears; the hidden iframe keeps running the spawn.
if (viewName === 'FinderView') {
  context.hideLauncher();
  osascript(context.getService<IShellService>('shell'), scripts.openFinder).catch((e) =>
    context.getService<IFeedbackService>('feedback').showHUD(errorMessage(e)),
  );
}
