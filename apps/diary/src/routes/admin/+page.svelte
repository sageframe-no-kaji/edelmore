<script lang="ts">
import type { ActionData, PageData } from './$types';

const { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<div class="paper flex min-h-screen items-center justify-center">
	<div class="paper w-full max-w-sm space-y-8 rounded-sm border border-cream-300 p-10 shadow-md">
		<div class="space-y-1">
			<h1 class="font-serif text-2xl text-ink-900">Accounts</h1>
			<p class="font-serif text-xs text-cream-500">
				<a href="/login" class="hover:text-ornament-gold">← Back to diary</a>
			</p>
		</div>

		{#if !data.authorized}
			<form method="POST" action="?/unlock" class="space-y-4">
				<p class="font-serif text-sm text-cream-700">Enter the admin PIN to manage accounts.</p>
				<input
					type="password"
					name="admin_pin"
					inputmode="numeric"
					maxlength="8"
					autocomplete="off"
					class="w-full rounded-sm border border-cream-300 bg-cream-50 px-3 py-2 text-center font-mono text-xl tracking-widest text-ink-900 focus:border-ornament-gold focus:outline-none"
				/>
				{#if form?.error}
					<p class="font-serif text-xs text-red-600">{form.error}</p>
				{/if}
				<button
					type="submit"
					class="w-full rounded-sm border border-ornament-gold bg-ornament-gold px-4 py-2 font-serif text-sm text-cream-50 hover:bg-ornament-gold/90"
				>
					Unlock
				</button>
			</form>
		{:else}
		{#if data.users.length > 0}
			<ul class="space-y-2">
				{#each data.users as user}
					<li class="font-serif text-sm text-ink-900 border-b border-cream-200 pb-2">{user.username}</li>
				{/each}
			</ul>
		{:else}
			<p class="font-serif text-sm text-cream-500">No accounts yet.</p>
		{/if}

		<form method="POST" action="?/create" class="space-y-4 pt-2 border-t border-cream-200">
			<p class="font-serif text-sm text-cream-700">Add a new account</p>

			<div class="space-y-2">
				<label class="font-serif text-xs text-cream-600" for="username">Name</label>
				<input
					id="username"
					type="text"
					name="username"
					autocomplete="off"
					class="w-full rounded-sm border border-cream-300 bg-cream-50 px-3 py-2 font-serif text-sm text-ink-900 focus:border-ornament-gold focus:outline-none"
					placeholder="e.g. Rosie"
				/>
			</div>

			<div class="space-y-2">
				<label class="font-serif text-xs text-cream-600" for="pin">4-digit PIN</label>
				<input
					id="pin"
					type="password"
					name="pin"
					inputmode="numeric"
					maxlength="4"
					autocomplete="off"
					class="w-full rounded-sm border border-cream-300 bg-cream-50 px-3 py-2 text-center font-mono text-xl tracking-widest text-ink-900 focus:border-ornament-gold focus:outline-none"
				/>
			</div>

			{#if form?.error}
				<p class="font-serif text-xs text-red-600">{form.error}</p>
			{/if}
			{#if form?.success}
				<p class="font-serif text-xs text-green-700">Account created.</p>
			{/if}

			<button
				type="submit"
				class="w-full rounded-sm border border-ornament-gold bg-ornament-gold px-4 py-2 font-serif text-sm text-cream-50 hover:bg-ornament-gold/90"
			>
				Create account
			</button>
		</form>
		{/if}
	</div>
</div>
