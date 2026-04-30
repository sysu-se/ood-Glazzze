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

<aside class="ai-sidebar" style="position:fixed;right:12px;top:80px;width:320px;max-height:60vh;overflow:auto;background:rgba(255,255,255,0.98);border:1px solid #ddd;padding:12px;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,0.12);z-index:60">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
    <strong>提示解释</strong>
    <button aria-label="清空解释" on:click={close} style="background:none;border:none;cursor:pointer;font-size:16px">✕</button>
  </div>
  <div style="margin-bottom:8px;padding:8px;border-radius:6px;background:#f7fafc;border:1px solid #e5e7eb">
    <div style="font-size:12px;color:#4b5563">当前提示等级</div>
    <div style="font-size:13px;font-weight:600;color:#111">{hintLevelInfo.name}</div>
    <div style="font-size:12px;color:#4b5563">{hintLevelInfo.desc}</div>
  </div>
  <div style="font-size:14px;line-height:1.5;color:#222">
    {#if explanation}
      <div style="margin-bottom:8px;color:#666">位置：{explanation.row},{explanation.col}</div>
      <div>{explanation.text}</div>
    {:else}
      <div style="color:#666">等待提示。点击任意 Hint 按钮后，这里会显示 AI 的解释。</div>
    {/if}
  </div>
</aside>
