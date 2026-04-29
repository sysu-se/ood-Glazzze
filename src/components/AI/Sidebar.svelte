<script>
  import { onDestroy } from 'svelte';
  export let gameStore;

  let unsub;
  let explanation = null;

  if (gameStore && gameStore.explanation) {
    unsub = gameStore.explanation.subscribe(v => explanation = v);
  }

  onDestroy(() => {
    if (unsub) unsub();
  });

  function close() {
    if (gameStore && gameStore.closeExplanation) {
      gameStore.closeExplanation();
    }
  }
</script>

{#if explanation}
  <div class="ai-sidebar" style="position:fixed;right:12px;top:80px;width:320px;max-height:60vh;overflow:auto;background:rgba(255,255,255,0.98);border:1px solid #ddd;padding:12px;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,0.12);z-index:60">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>提示解释</strong>
      <button aria-label="关闭解释" on:click={close} style="background:none;border:none;cursor:pointer;font-size:16px">✕</button>
    </div>
    <div style="font-size:14px;line-height:1.5;color:#222">
      <div style="margin-bottom:8px;color:#666">位置：{explanation.row},{explanation.col}</div>
      <div>{explanation.text}</div>
    </div>
  </div>
{/if}
