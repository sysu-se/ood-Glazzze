<script>
	import { cursor } from '@sudoku/stores/cursor';
	import { hints } from '@sudoku/stores/hints';
	import { notes } from '@sudoku/stores/notes';
	import { settings } from '@sudoku/stores/settings';
	import Switch from '../../Utils/Switch.svelte';

	// 接收 gameStore 作为 prop
	export let gameStore;

	// 先取出子 store，再用 $store 语法订阅
	$: canUndoStore = gameStore.canUndo;
	$: canRedoStore = gameStore.canRedo;
	$: gridStore = gameStore.grid;
	$: pausedStore = gameStore.paused;
	$: exploreStatusStore = gameStore.exploreStatus;
	$: hintLevelStore = gameStore.hintLevel;
	$: hintLevelInfoStore = gameStore.hintLevelInfo;
	let selectedHintLevel = '1';
	$: selectedHintLevel = String($hintLevelStore ?? 1);

	$: hintsAvailable = $hints > 0;
	$: exploreActive = $exploreStatusStore?.active;
	$: exploreConflict = $exploreStatusStore?.hasConflict;

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

	function handleExploreToggle(event) {
		if (event.detail) {
			gameStore.startExplore();
			return;
		}

		gameStore.cancelExplore();
	}

	function handleBacktrackExplore() {
		gameStore.backtrackExplore();
	}

	function handleCommitExplore() {
		gameStore.commitExplore();
	}

	function handleCancelExplore() {
		gameStore.cancelExplore();
	}
</script>

<div class="action-buttons space-x-3">

	<button class="btn btn-round" disabled={$pausedStore || !$canUndoStore} title="Undo" on:click={() => gameStore.undo()}>
		<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
		</svg>
	</button>

	<button class="btn btn-round" disabled={$pausedStore || !$canRedoStore} title="Redo" on:click={() => gameStore.redo()}>
		<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10h-10a8 8 90 00-8 8v2M21 10l-6 6m6-6l-6-6" />
		</svg>
	</button>

	<div class="hint-panel">
		<div class="hint-panel-header">Hint 等级模式</div>
		<select class="hint-level-select" bind:value={selectedHintLevel} on:change={handleHintLevelChange}>
			<option value="1">L1 观察级：只提示值得看的格子</option>
			<option value="2">L2 候选+推理级：显示候选并解释排除依据</option>
			<option value="3">L3 决策级：可确定时给出可填数字</option>
		</select>
		<div class="hint-level-desc">当前：{$hintLevelInfoStore.name} · {$hintLevelInfoStore.desc}</div>

		<button class="btn btn-round btn-badge" disabled={$pausedStore || !hintsAvailable} on:click={handleUnifiedHint} title="Hint ({$hints})">
			<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
			</svg>

			{#if $settings.hintsLimited}
				<span class="badge" class:badge-primary={hintsAvailable}>{$hints}</span>
			{/if}
			<span class="btn-label">Hint</span>
		</button>
	</div>

	<button class="btn btn-round btn-badge" on:click={notes.toggle} title="Notes ({$notes ? 'ON' : 'OFF'})">
		<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
		</svg>

		<span class="badge tracking-tighter" class:badge-primary={$notes}>{$notes ? 'ON' : 'OFF'}</span>
	</button>

	<div class="explore-panel">
		<Switch
			id="explore-mode"
			text="探索模式"
			checked={!!exploreActive}
			disabled={$pausedStore}
			on:change={handleExploreToggle}
		/>

		{#if exploreActive}
			<div class="explore-actions">
				<button class="btn btn-small btn-primary" disabled={$pausedStore || !exploreActive} on:click={handleBacktrackExplore}>回到起点</button>
				<button class="btn btn-small" disabled={$pausedStore || !exploreActive || exploreConflict} on:click={handleCommitExplore}>提交</button>
				<button class="btn btn-small" disabled={$pausedStore || !exploreActive} on:click={handleCancelExplore}>放弃</button>
			</div>

			<div class="explore-status" class:explore-status-conflict={exploreConflict}>
				{#if $exploreStatusStore.status === 'revisited-failed'}
					这个棋盘路径之前已经失败过。
				{:else if exploreConflict}
					检测到冲突，当前探索分支无效。
				{:else}
					正在基于保存的起点进行探索。
				{/if}
			</div>
		{/if}
	</div>

</div>


<style>
	.action-buttons {
		@apply flex flex-wrap items-center justify-evenly self-end gap-3;
	}

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

	.btn-label {
		@apply text-xs font-semibold tracking-wide uppercase mt-1;
	}

	.explore-panel {
		@apply flex flex-col items-center gap-2 pt-1;
	}

	.hint-panel {
		@apply flex flex-col items-center gap-2 pt-1;
	}

	.hint-panel-header {
		@apply text-xs font-semibold tracking-wide text-gray-600;
	}

	.hint-level-select {
		@apply text-xs px-2 py-1 rounded border border-gray-300 bg-white max-w-xs;
	}

	.hint-level-desc {
		@apply max-w-xs text-center text-xs text-gray-600;
	}

	.explore-actions {
		@apply flex flex-wrap items-center justify-center gap-2;
	}

	.explore-status {
		@apply max-w-md text-center text-xs font-semibold tracking-wide text-gray-600;
	}

	.explore-status-conflict {
		@apply text-red-600;
	}
</style>