<script lang="ts">
  export let items: { key: string; label: string }[] = [];
  export let onNavigate: (key: string) => void = () => {};

  // Customizable appearance
  export let btnColor: string = "";
  export let btnBg: string = "";
  export let btnRadius: string = "";
  export let btnSize: string = "";
  export let accentColor: string = "";

  const icons: Record<string, string> = {
    schedule: "📋",
    tasks: "✅",
    finance: "💰",
    "finance-analytics": "📊",
  };

  function handleClick(key: string) {
    onNavigate(key);
  }

  $: btnStyle = [
    btnColor ? `color: ${btnColor}` : "",
    btnBg ? `background: ${btnBg}` : "",
    btnRadius ? `border-radius: ${btnRadius}` : "",
    btnSize ? `font-size: ${btnSize}` : "",
  ].filter(Boolean).join("; ");

  $: accentVar = accentColor ? `--nav-accent: ${accentColor}` : "";
</script>

<div class="calendar-nav" style="{accentVar}">
  {#each items as item}
    <button
      class="calendar-nav-btn"
      style={btnStyle}
      on:click={() => handleClick(item.key)}
    >
      <span class="calendar-nav-icon">{icons[item.key] || "🔗"}</span>
      <span class="calendar-nav-label">{item.label}</span>
    </button>
  {/each}
</div>

<style>
  .calendar-nav {
    --nav-accent: var(--mcp-accent, rgba(95, 153, 225, 0.55));
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 4px 0;
  }

  .calendar-nav-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: var(--mcp-surface, rgba(40, 45, 60, 0.5));
    border: 1px solid var(--mcp-glass-border, rgba(255, 255, 255, 0.07));
    border-radius: var(--mcp-radius-sm, 12px);
    color: var(--mcp-text, rgba(230, 235, 240, 0.94));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: inherit;
    line-height: 1;
  }

  .calendar-nav-btn:hover {
    background: var(--mcp-surface-hover, rgba(50, 55, 72, 0.6));
    border-color: var(--nav-accent);
    transform: translateY(-1px);
  }

  .calendar-nav-btn:active {
    transform: translateY(0);
  }

  .calendar-nav-icon {
    font-size: 14px;
    line-height: 1;
  }

  .calendar-nav-label {
    line-height: 1;
  }

  @media (max-width: 480px) {
    .calendar-nav { gap: 6px; }
    .calendar-nav-btn { padding: 5px 10px; font-size: 12px; gap: 4px; }
    .calendar-nav-icon { font-size: 12px; }
  }
</style>
