<script>
  import { onDestroy } from 'svelte';

  export let gameStore;

  let unsub;
  let unsubHint;
  let explanation = null;
  let hintLevelInfo = { name: 'L1 观察级', desc: '只指出值得关注的位置，不给数字。' };

  if (gameStore && gameStore.explanation) {
    unsub = gameStore.explanation.subscribe(v => explanation = v);
  }

  if (gameStore && gameStore.hintLevelInfo) {
    unsubHint = gameStore.hintLevelInfo.subscribe(v => {
      hintLevelInfo = v || hintLevelInfo;
    });
  }

  onDestroy(() => {
    if (unsub) unsub();
    if (unsubHint) unsubHint();
  });

  function close() {
    if (gameStore && gameStore.closeExplanation) {
      gameStore.closeExplanation();
    }
  }
</script>

<aside class="ai-sidebar">
  <div class="sidebar-header">
    <strong>提示解释</strong>
    <button class="close-button" aria-label="清空解释" on:click={close}>✕</button>
  </div>

  <div class="hint-level-box">
    <div class="hint-level-label">当前提示等级</div>
    <div class="hint-level-name">{hintLevelInfo.name}</div>
    <div class="hint-level-desc">{hintLevelInfo.desc}</div>
  </div>

  <div class="explanation-body">
    {#if explanation}
      <div class="explanation-position">位置：{explanation.row},{explanation.col}</div>
      <div>{explanation.text}</div>
    {:else}
      <div class="empty-text">等待提示。点击任意 Hint 按钮后，这里会显示 AI 的解释。</div>
    {/if}
  </div>
</aside>

<style>
  .ai-sidebar {
    position: fixed;
    right: 12px;
    top: 80px;
    width: 320px;
    max-height: 60vh;
    overflow: auto;
    background: rgba(255, 255, 255, 0.98);
    border: 1px solid #ddd;
    padding: 12px;
    border-radius: 8px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
    z-index: 60;
  }

  .sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .close-button {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 16px;
  }

  .hint-level-box {
    margin-bottom: 8px;
    padding: 8px;
    border-radius: 6px;
    background: #f7fafc;
    border: 1px solid #e5e7eb;
  }

  .hint-level-label,
  .hint-level-desc {
    font-size: 12px;
    color: #4b5563;
  }

  .hint-level-name {
    font-size: 13px;
    font-weight: 600;
    color: #111;
  }

  .explanation-body {
    font-size: 14px;
    line-height: 1.5;
    color: #222;
  }

  .explanation-position {
    margin-bottom: 8px;
    color: #666;
  }

  .empty-text {
    color: #666;
  }
</style>
