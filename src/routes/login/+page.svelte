<script lang="ts">
import type { ActionData } from './$types';

const { form }: { form: ActionData } = $props();

// biome-ignore lint/style/useConst: $state runes must be let — Svelte 5 requires reassignment
let selectedUser = $state('');
// biome-ignore lint/style/useConst: $state runes must be let — Svelte 5 requires reassignment
let pin = $state('');
</script>

<div class="flex min-h-screen items-center justify-center bg-stone-50">
	<div class="w-full max-w-sm space-y-6 rounded-lg border border-stone-200 bg-white p-8 shadow-sm">
		<h1 class="font-serif text-2xl text-stone-800">Edelmore Diary</h1>

		<form method="POST" class="space-y-4">
			<fieldset class="space-y-2">
				<legend class="text-sm text-stone-500">Who are you?</legend>
				<div class="flex gap-3">
					{#each ['Iona', 'Isla'] as name}
						<button
							type="button"
							class="flex-1 rounded border px-4 py-2 text-sm font-medium transition-colors
								{selectedUser === name
								? 'border-stone-800 bg-stone-800 text-white'
								: 'border-stone-300 bg-white text-stone-700 hover:border-stone-500'}"
							onclick={() => { selectedUser = name; pin = ''; }}
						>
							{name}
						</button>
					{/each}
				</div>
				<input type="hidden" name="username" value={selectedUser} />
			</fieldset>

			{#if selectedUser}
				<fieldset class="space-y-2">
					<legend class="text-sm text-stone-500">Enter your 4-digit PIN</legend>
					<input
						type="password"
						name="pin"
						inputmode="numeric"
						pattern="[0-9]{4}"
						maxlength="4"
						autocomplete="current-password"
						bind:value={pin}
						class="w-full rounded border border-stone-300 px-3 py-2 text-center font-mono text-xl tracking-widest focus:border-stone-500 focus:outline-none"
					/>
				</fieldset>

				<button
					type="submit"
					disabled={pin.length !== 4}
					class="w-full rounded bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
				>
					Open my diary
				</button>
			{/if}

			{#if form?.error}
				<p class="text-sm text-red-600">{form.error}</p>
			{/if}
		</form>
	</div>
</div>
