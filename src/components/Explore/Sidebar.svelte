<script>
  import Switch from '../Utils/Switch.svelte';

  export let gameStore;

  $: pausedStore = gameStore.paused;
  $: exploreStatusStore = gameStore.exploreStatus;
  $: exploreBranchesStore = gameStore.exploreBranches;

  let branchLabel = '';

  $: exploreActive = $exploreStatusStore?.active;
  $: exploreConflict = $exploreStatusStore?.hasConflict;
  $: canExploreUndo = $exploreStatusStore?.canExploreUndo;
  $: canExploreRedo = $exploreStatusStore?.canExploreRedo;
  $: branches = $exploreBranchesStore || [];
  $: currentBranch = branches.find(branch => branch.current);

  function branchDepthClass(branch) {
    return `branch-row branch-depth-${Math.min(branch.depth || 0, 3)}`;
  }

  function handleExploreToggle(event) {
    if (event.detail) {
      gameStore.startExplore();
      return;
    }

    gameStore.cancelExplore();
  }

  function handleCreateBranch() {
    const id = gameStore.createExploreBranch(branchLabel);
    if (id !== null) {
      branchLabel = '';
    }
  }
</script>

<aside class="explore-sidebar">
  <div class="sidebar-header">
    <div>
      <div class="eyebrow">Explore</div>
      <h2>探索模式</h2>
    </div>
    <Switch
      id="explore-mode"
      text=""
      checked={!!exploreActive}
      disabled={$pausedStore}
      on:change={handleExploreToggle}
    />
  </div>

  {#if exploreActive}
    <div class="status-card" class:status-conflict={exploreConflict}>
      <div class="status-title">
        {#if $exploreStatusStore.status === 'revisited-failed'}
          已重访失败路径
        {:else if exploreConflict}
          当前分支存在冲突
        {:else}
          正在探索
        {/if}
      </div>
      <div class="status-text">
        {#if currentBranch}
          当前分支 #{currentBranch.id} · {currentBranch.label}
        {:else}
          当前分支尚未就绪
        {/if}
      </div>
    </div>

    <div class="toolbar">
      <button class="mini-button" disabled={$pausedStore || !canExploreUndo} on:click={() => gameStore.exploreUndo()}>撤销</button>
      <button class="mini-button" disabled={$pausedStore || !canExploreRedo} on:click={() => gameStore.exploreRedo()}>重做</button>
      <button class="mini-button primary" disabled={$pausedStore} on:click={() => gameStore.backtrackExplore()}>回起点</button>
    </div>

    <div class="branch-create">
      <input
        class="branch-input"
        aria-label="探索分支名称"
        placeholder="新分支名称"
        bind:value={branchLabel}
        disabled={$pausedStore}
      />
      <button class="mini-button primary" disabled={$pausedStore} on:click={handleCreateBranch}>新建</button>
    </div>

    <div class="section-title">
      <span>分支列表</span>
      <span>{branches.length}</span>
    </div>

    <div class="branch-list" aria-label="探索分支列表">
      {#each branches as branch}
        <button
          class={branchDepthClass(branch)}
          class:branch-current={branch.current}
          disabled={$pausedStore || branch.current}
          on:click={() => gameStore.switchExploreBranch(branch.id)}
        >
          {#if branch.depth > 0}
            <span class="branch-connector" aria-hidden="true"></span>
          {/if}
          <span class="branch-marker"></span>
          <span class="branch-main">
            <span class="branch-name">{branch.label}</span>
            <span class="branch-meta">
              #{branch.id}
              {#if branch.parentId !== null}
                · parent #{branch.parentId}
              {:else}
                · root
              {/if}
            </span>
          </span>
          {#if branch.current}
            <span class="current-pill">当前</span>
          {/if}
        </button>
      {/each}
    </div>

    <div class="finish-actions">
      <button class="finish-button" disabled={$pausedStore || exploreConflict} on:click={() => gameStore.commitExplore()}>提交探索</button>
      <button class="finish-button danger" disabled={$pausedStore} on:click={() => gameStore.cancelExplore()}>放弃探索</button>
    </div>
  {:else}
    <div class="empty-state">
      打开探索模式后，分支、回滚、提交和放弃都会集中显示在这里。
    </div>
  {/if}
</aside>

<style>
  .explore-sidebar {
    position: fixed;
    left: 12px;
    top: 80px;
    width: 340px;
    max-height: 72vh;
    overflow: auto;
    background: rgba(255, 255, 255, 0.98);
    border: 1px solid #d8dde6;
    padding: 14px;
    border-radius: 8px;
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
    z-index: 55;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #64748b;
  }

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: #111827;
  }

  .status-card {
    border: 1px solid #bfdbfe;
    background: #eff6ff;
    color: #1e3a8a;
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 10px;
  }

  .status-conflict {
    border-color: #fecaca;
    background: #fff1f2;
    color: #991b1b;
  }

  .status-title {
    font-size: 13px;
    font-weight: 700;
  }

  .status-text,
  .empty-state {
    margin-top: 3px;
    font-size: 12px;
    line-height: 1.45;
    color: #475569;
  }

  .toolbar,
  .branch-create,
  .finish-actions {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }

  .branch-create {
    align-items: center;
  }

  .branch-input {
    min-width: 0;
    flex: 1;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 7px 9px;
    font-size: 13px;
    color: #0f172a;
    background: #fff;
  }

  .mini-button,
  .finish-button {
    border: 1px solid #cbd5e1;
    background: #fff;
    color: #0f172a;
    border-radius: 6px;
    padding: 7px 10px;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
  }

  .mini-button:disabled,
  .finish-button:disabled,
  .branch-row:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .primary {
    border-color: #2563eb;
    background: #2563eb;
    color: #fff;
  }

  .section-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 6px 0;
    font-size: 12px;
    font-weight: 700;
    color: #475569;
  }

  .branch-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin-bottom: 12px;
  }

  .branch-row {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 9px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #fff;
    padding: 9px;
    text-align: left;
    color: #0f172a;
  }

  .branch-depth-1 {
    margin-left: 16px;
    width: calc(100% - 16px);
  }

  .branch-depth-2 {
    margin-left: 32px;
    width: calc(100% - 32px);
  }

  .branch-depth-3 {
    margin-left: 48px;
    width: calc(100% - 48px);
  }

  .branch-connector {
    width: 12px;
    height: 1px;
    background: #94a3b8;
    flex: 0 0 auto;
  }

  .branch-current {
    border-color: #2563eb;
    background: #eff6ff;
  }

  .branch-marker {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: #94a3b8;
    flex: 0 0 auto;
  }

  .branch-current .branch-marker {
    background: #2563eb;
  }

  .branch-main {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .branch-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 700;
  }

  .branch-meta {
    font-size: 11px;
    color: #64748b;
  }

  .current-pill {
    border-radius: 999px;
    padding: 3px 7px;
    background: #2563eb;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
  }

  .finish-actions {
    margin-bottom: 0;
  }

  .finish-button {
    flex: 1;
  }

  .danger {
    border-color: #fecaca;
    color: #991b1b;
  }

  .empty-state {
    margin-top: 0;
    border: 1px dashed #cbd5e1;
    border-radius: 8px;
    padding: 10px;
    background: #f8fafc;
  }

  @media (max-width: 1100px) {
    .explore-sidebar {
      position: static;
      width: auto;
      max-height: none;
      margin: 10px 12px;
    }
  }
</style>
