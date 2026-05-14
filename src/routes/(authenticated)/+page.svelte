<script lang="ts">
import type { PageData } from './$types';

const { data }: { data: PageData } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-stone-50">
	<div class="space-y-4 text-center">
		<p class="font-serif text-2xl text-stone-800">Welcome, {data.user.username}</p>
		<a href="/logout" class="text-sm text-stone-500 hover:text-stone-800">Log out</a>
	</div>
</div>
