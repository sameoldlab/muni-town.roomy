<script lang="ts">
  import { Switch }from '@foxui/core';
  import type { SwitchRootProps } from 'bits-ui';

	let {
		class: className,
		checked = $bindable(true),
		...rest
	}: SwitchRootProps = $props();
</script>

<Switch class={className} bind:checked {...rest}/>
