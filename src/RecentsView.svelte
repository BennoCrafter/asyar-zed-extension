<script lang="ts">
  import { onMount } from 'svelte';
  import type { ExtensionContext } from 'asyar-sdk/view';
  import { ActionCategory, ActionContext } from 'asyar-sdk/contracts';
  import type { ICacheService, IEnvironmentService, IExtensionManager, IFilesService, IOpenerService, IShellService } from 'asyar-sdk/contracts';
  import { branchFromHead, filterItems, toRecentItems } from './lib/recents.js';
  import { errorMessage, fileManagerName, folderIconsScript, run, scripts, type Platform } from './lib/zed';
  import folderIcon from './assets/folder.png';

  type Item = { id: string; title: string; subtitle?: string; argv: string[] };

  let { context, extensionId }: { context: ExtensionContext; extensionId: string } = $props();

  const extensions = context.getService<IExtensionManager>('extensions');
  const shell = context.getService<IShellService>('shell');
  const files = context.getService<IFilesService>('files');
  const opener = context.getService<IOpenerService>('opener');
  const cache = context.getService<ICacheService>('cache');
  const openId = `${extensionId}:open`;
  const revealId = `${extensionId}:reveal`;

  let platform = $state<Platform>('macos');
  // macOS waits for Finder's icons instead of flashing the bundled one first.
  let iconsFailed = $state(false);
  let items = $state<Item[] | null>(null);
  let branches = $state<Record<string, string>>({});
  let icons = $state<Record<string, string>>({});
  let error = $state<string | null>(null);
  let query = $state('');
  let selected = $state(0);

  const filtered = $derived(items ? (filterItems(items, query) as Item[]) : []);
  $effect(() => {
    query;
    selected = 0;
  });

  async function pick(item: Item | undefined) {
    if (!item) return;
    try {
      await run(shell, platform, scripts[platform].open, item.argv);
      context.hideLauncher();
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function reveal(item: Item | undefined) {
    if (!item) return;
    try {
      await opener.reveal(item.argv[0]);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  function loadBranches(list: Item[]) {
    for (const item of list) {
      const head = `${item.argv[0].replace(/[/\\]+$/, '')}/.git/HEAD`;
      // glob resolves [] for a missing file; read would reject and log an error per non-git folder.
      files
        .glob(head)
        .then((found) => (found.length ? files.read(head, { maxBytes: 256 }) : ''))
        .then((text) => {
          const branch = branchFromHead(text);
          if (branch) branches[item.id] = branch;
        })
        .catch(() => {});
    }
  }

  function loadIcons(list: Item[]) {
    if (platform !== 'macos') return;
    run(shell, platform, folderIconsScript, list.map((i) => i.argv[0]))
      .then((out) => {
        const lines = out.split('\n');
        icons = Object.fromEntries(list.map((item, i) => [item.id, `data:image/png;base64,${lines[i]}`]));
        // Saved so the next open shows them instantly; refreshed every open so changed folder icons catch up.
        return cache.set('folderIcons', JSON.stringify(icons));
      })
      .catch(() => (iconsFailed = true));
  }

  function move(delta: number) {
    selected = Math.max(0, Math.min(filtered.length - 1, selected + delta));
    document.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  onMount(() => {
    const savedIcons = cache
      .get('folderIcons')
      .then((v) => JSON.parse(v ?? '{}') as Record<string, string>)
      .catch(() => ({}));
    context
      .getService<IEnvironmentService>('environment')
      .getEnvironment()
      .then((env) => {
        platform = env.platform;
        // Registered first so it heads the ⌘K list; Enter keeps going through the keydown handler below.
        context.registerAction({
          id: openId,
          title: 'Open in Zed',
          icon: 'icon:window',
          extensionId,
          category: ActionCategory.PRIMARY,
          context: ActionContext.EXTENSION_VIEW,
          execute: () => pick(filtered[selected]),
        });
        context.registerAction({
          id: revealId,
          title: `Open in ${fileManagerName[platform]}`,
          icon: 'icon:folder-search',
          extensionId,
          context: ActionContext.EXTENSION_VIEW,
          shortcut: 'Mod+Shift+F',
          execute: () => reveal(filtered[selected]),
        });
        return run(shell, platform, scripts[platform].recents);
      })
      .then(async (out) => {
        icons = await savedIcons;
        items = toRecentItems(JSON.parse(out || '[]')) as Item[];
        loadBranches(items);
        loadIcons(items);
      })
      .catch((e) => (error = errorMessage(e)));
    extensions.setActiveViewActionLabel('Open in Zed');
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !event.data) return;
      const { type, payload } = event.data;
      if (type === 'asyar:view:search') query = String(payload?.query ?? '');
      else if (type === 'asyar:view:keydown') {
        if (payload?.key === 'ArrowDown') move(1);
        else if (payload?.key === 'ArrowUp') move(-1);
        else if (payload?.key === 'Enter') void pick(filtered[selected]);
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      context.unregisterAction(openId);
      context.unregisterAction(revealId);
      extensions.setActiveViewActionLabel(null);
    };
  });
</script>

<div class="container">
  {#if error}
    <div class="error" role="alert">{error}</div>
  {/if}
  <!-- The scroll container exists from the first paint: WKWebView didn't paint one created later until it scrolled. -->
  <div class="list">
    {#if items === null}
      <p class="empty">{error ? '' : 'Loading recent projects…'}</p>
    {:else if filtered.length === 0}
      <p class="empty">Nothing found</p>
    {:else}
      <h2 class="section">Recent Projects</h2>
      {#each filtered as item, i (item.id)}
        <div
          class="entry"
          class:selected={i === selected}
          data-index={i}
          role="button"
          tabindex="-1"
          onmouseenter={() => (selected = i)}
          onclick={() => pick(item)}
          onkeydown={() => {}}
        >
          {#if icons[item.id] || platform !== 'macos' || iconsFailed}
            <img class="icon" src={icons[item.id] ?? folderIcon} alt="" />
          {:else}
            <span class="icon"></span>
          {/if}
          <span class="title">{item.title}</span>
          {#if item.subtitle}<span class="subtitle">{item.subtitle}</span>{/if}
          {#if branches[item.id]}
            <span class="branch" title="Git branch">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="6" cy="5" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="6" cy="19" r="2" />
                <path d="M6 7v10M18 9c0 5-12 3-12 8" />
              </svg>
              <span class="branch-name">{branches[item.id]}</span>
            </span>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  /* No default 8px body margin around the iframe content. */
  :global(body) {
    margin: 0;
  }
  .container {
    color: var(--text-primary);
    font-family: var(--font-ui);
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .error {
    padding: var(--space-2) var(--space-4);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    font-size: var(--font-size-sm);
  }
  /* Rows mirror the launcher's own result rows (LauncherListRow). */
  .list {
    flex: 1;
    overflow-y: auto;
    padding: 0 var(--space-2) var(--space-2);
  }
  .section {
    margin: 0;
    padding: var(--space-4) var(--space-3) var(--space-2);
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--text-secondary);
  }
  .entry {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    min-height: var(--shell-row-h, 38px);
    padding: 0 var(--space-3);
    border-radius: var(--radius-lg);
    cursor: pointer;
  }
  .entry.selected {
    background: var(--bg-selected);
  }
  .icon {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
  }
  .title {
    font-size: var(--font-size-md);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .subtitle {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-md);
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .branch {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    max-width: 45%;
    margin-left: auto;
    padding: var(--space-0-5) var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--bg-tertiary);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }
  .branch svg {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  .branch-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .empty {
    margin: var(--space-8) 0;
    text-align: center;
    font-size: var(--font-size-md);
    color: var(--text-secondary);
  }
</style>
