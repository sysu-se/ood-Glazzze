<script>
	import { cursor } from '@sudoku/stores/cursor';
	import { hints } from '@sudoku/stores/hints';
	import { settings } from '@sudoku/stores/settings';

	export let gameStore;

	$: pausedStore = gameStore.paused;
	$: hintLevelStore = gameStore.hintLevel;

	let selectedHintLevel = '1';
	$: selectedHintLevel = String($hintLevelStore ?? 1);
	$: hintsAvailable = $hints > 0;

	function consumeHintIfPossible(applied) {
		if (applied && hintsAvailable) {
			hints.useHint();
		}
	}

	function handleUnifiedHint() {
		if (!hintsAvailable) {
			return;
		}

		const acted = gameStore.requestHint($cursor.y, $cursor.x);
		consumeHintIfPossible(acted);
	}

	function handleHintLevelChange(event) {
		const nextLevel = Number(event.currentTarget.value || 1);
		selectedHintLevel = String(nextLevel);
		gameStore.setHintLevel(nextLevel);
	}
</script>

<div class="hint-panel">
	<label class="hint-field" for="hint-level-select">
		<span class="hint-panel-header">Hint 等级模式</span>
		<select id="hint-level-select" class="hint-level-select" bind:value={selectedHintLevel} on:change={handleHintLevelChange}>
			<option value="1">L1 观察级：只提示值得看的格子</option>
			<option value="2">L2 候选+推理级：显示候选并解释排除依据</option>
			<option value="3">L3 决策级：可确定时给出可填数字</option>
		</select>
	</label>

	<button class="btn btn-round btn-badge hint-icon-button" disabled={$pausedStore || !hintsAvailable} on:click={handleUnifiedHint} title="Hint ({$hints})" aria-label="Hint">
		<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
		</svg>

		{#if $settings.hintsLimited}
			<span class="badge" class:badge-primary={hintsAvailable}>{$hints}</span>
		{/if}
	</button>
</div>

<style>
	.btn-badge {
		@apply relative;
	}

	.badge {
		min-height: 20px;
		min-width:  20px;
		@apply p-1 rounded-full leading-none text-center text-xs text-white bg-gray-600 inline-block absolute top-0 left-0;
	}

	.badge-primary {
		@apply bg-primary;
	}

	.hint-panel {
		@apply flex flex-nowrap items-end justify-center gap-2;
	}

	.hint-field {
		@apply flex flex-col items-start gap-1;
	}

	.hint-panel-header {
		@apply text-xs font-semibold tracking-wide text-gray-600 whitespace-nowrap;
	}

	.hint-level-select {
		width: min(24rem, 42vw);
		min-width: 16rem;
		@apply text-xs px-2 py-1 rounded border border-gray-300 bg-white;
	}

	.hint-icon-button {
		width: 3.25rem;
		height: 3.25rem;
		@apply p-0;
	}
</style>
