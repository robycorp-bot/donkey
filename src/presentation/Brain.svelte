<script lang="ts">
  export let size = 24;
</script>

<!-- Four agent nodes around a core: the product mark. -->
<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
  <path d="M16 16 7 7M16 16l9-9M16 16 7 25M16 16l9 9" stroke="currentColor" stroke-opacity=".35" stroke-width="2" stroke-linecap="round" />
  <circle cx="7" cy="7" r="4.5" fill="#4285f4" />
  <circle cx="25" cy="7" r="4.5" fill="#ea4335" />
  <circle cx="7" cy="25" r="4.5" fill="#fbbc04" />
  <circle cx="25" cy="25" r="4.5" fill="#34a853" />
  <circle cx="16" cy="16" r="3.5" fill="currentColor" />
</svg>
