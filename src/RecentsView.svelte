<script lang="ts">
  import { onMount } from 'svelte';
  import type { ExtensionContext } from 'asyar-sdk/view';
  import type { IExtensionManager, IShellService } from 'asyar-sdk/contracts';
  import { filterItems, toRecentItems } from './lib/recents.js';
  import { errorMessage, osascript, scripts } from './lib/zed';
  // show real folder data instead image
  import folderIcon from './assets/folder.png';

  type Item = { id: string; title: string; subtitle?: string; argv: string[] };

  let { context }: { context: ExtensionContext } = $props();

  const extensions = context.getService<IExtensionManager>('extensions');
  const shell = context.getService<IShellService>('shell');

  let items = $state<Item[] | null>(null);
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
      await osascript(shell, scripts.open, item.argv);
      context.hideLauncher();
    } catch (e) {
      error = errorMessage(e);
    }
  }

  function move(delta: number) {
    selected = Math.max(0, Math.min(filtered.length - 1, selected + delta));
    document.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  onMount(() => {
    osascript(shell, scripts.recents)
      .then((out) => (items = toRecentItems(JSON.parse(out || '[]')) as Item[]))
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
          <img class="icon" src={folderIcon} alt="" />
          <span class="title">{item.title}</span>
          {#if item.subtitle}<span class="subtitle">{item.subtitle}</span>{/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
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
    font-size: 12px;
  }
  /* Rows mirror the launcher's own result rows (LauncherListRow). */
  .list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-3);
  }
  .entry {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    min-height: var(--shell-row-h, 38px);
    padding: 0 var(--space-3);
    border-radius: var(--radius-xl);
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
  .empty {
    margin: var(--space-8) 0;
    text-align: center;
    font-size: 13px;
    color: var(--text-secondary);
  }
</style>
