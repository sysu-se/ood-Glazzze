<script>
	import ActionBar from './ActionBar/index.svelte';
	import Keyboard from './Keyboard.svelte';

	export let gameStore;
</script>

<div class="px-4 pb-5 flex justify-center">
	<div class="w-full flex flex-col items-center">
		<div class="w-full max-w-4xl">
			<ActionBar {gameStore} />
		</div>

		<div class="w-full max-w-xl">
			<Keyboard {gameStore} />
		</div>
	</div>
</div>
