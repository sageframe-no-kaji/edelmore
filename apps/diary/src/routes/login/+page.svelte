<script lang="ts">
import { untrack } from 'svelte';
import type { ActionData, PageData } from './$types';

const { data, form }: { data: PageData; form: ActionData } = $props();

let selectedUser = $state(untrack(() => data.users[0]?.username ?? ''));
let pin = $state('');

function selectUser(name: string) {
  selectedUser = name;
  pin = '';
}
</script>

<div class="paper flex min-h-screen items-center justify-center">
	<div class="paper w-full max-w-sm space-y-8 rounded-sm border border-cream-300 p-10 shadow-md">
		<div class="text-center space-y-1">
			<h1 class="font-serif text-3xl text-ink-900 italic">Edelmore</h1>
			<p class="font-serif text-xs text-cream-600 tracking-widest uppercase">A private diary</p>
		</div>

		<form method="POST" class="space-y-6">
			{#if data.users.length > 0}
				<fieldset class="space-y-3">
					<legend class="font-serif text-sm text-cream-600">Who are you?</legend>
					<div class="flex flex-wrap gap-2">
						{#each data.users as user}
							<button
								type="button"
								class="flex-1 min-w-24 rounded-sm border px-4 py-2 font-serif text-sm transition-colors
									{selectedUser === user.username
									? 'border-ornament-gold bg-ornament-gold text-cream-50'
									: 'border-cream-400 bg-cream-100 text-ink-900 hover:border-ornament-gold hover:text-ornament-gold'}"
								onclick={() => selectUser(user.username)}
							>
								{user.username}
							</button>
						{/each}
					</div>
					<input type="hidden" name="username" value={selectedUser} />
				</fieldset>
			{:else}
				<p class="font-serif text-sm text-cream-600 text-center">
					No accounts yet. <a href="/admin" class="text-ornament-gold hover:underline">Create one →</a>
				</p>
			{/if}

			{#if selectedUser}
				<fieldset class="space-y-2">
					<legend class="font-serif text-sm text-cream-600">Your 4-digit PIN</legend>
					<input
						type="password"
						name="pin"
						inputmode="numeric"
						maxlength="4"
						autocomplete="off"
						bind:value={pin}
						class="w-full rounded-sm border border-cream-300 bg-cream-50 px-3 py-3 text-center font-mono text-2xl tracking-[0.5em] text-ink-900 focus:border-ornament-gold focus:outline-none"
					/>
				</fieldset>

				{#if form?.error}
					<p class="font-serif text-xs text-red-600 text-center">{form.error}</p>
				{/if}

				<button
					type="submit"
					disabled={pin.length !== 4}
					class="w-full rounded-sm border border-ornament-gold bg-ornament-gold px-4 py-3 font-serif text-sm text-cream-50 hover:bg-ornament-gold/90 disabled:cursor-not-allowed disabled:opacity-40"
				>
					Open my diary
				</button>
			{/if}
		</form>

		<div class="text-center">
			<a href="/admin" class="font-serif text-xs text-cream-500 hover:text-cream-700">Manage accounts</a>
		</div>
	</div>
</div>
