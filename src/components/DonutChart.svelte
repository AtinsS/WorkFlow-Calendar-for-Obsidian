<script lang="ts">
  import { onMount, afterUpdate } from "svelte";
  import { t } from "../i18n";

  export let segments: { label: string; value: number; color: string }[] = [];
  export let centerLabel: string = "";
  export let centerValue: string = "";

  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;

  $: total = segments.reduce((sum, s) => sum + s.value, 0);

  function drawChart() {
    if (!canvas || !container || segments.length === 0 || total === 0) return;

    const rect = container.getBoundingClientRect();
    const size = Math.max(40, Math.min(rect.width, 220));

    canvas.style.width = size + "px";
    canvas.style.height = size + "px";

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const computedStyles = getComputedStyle(document.documentElement);
    const textMuted = computedStyles.getPropertyValue("--mcp-text-muted").trim() || "rgba(200, 210, 220, 0.5)";
    const textFaint = computedStyles.getPropertyValue("--mcp-text-faint").trim() || "rgba(200, 210, 220, 0.25)";

    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const outerRadius = size / 2 - 8;
    const innerRadius = outerRadius * 0.65;

    let startAngle = -Math.PI / 2;

    for (const seg of segments) {
      if (seg.value <= 0) continue;
      const sweep = (seg.value / total) * Math.PI * 2;
      const endAngle = startAngle + sweep;

      ctx.beginPath();
      ctx.arc(cx, cy, outerRadius, startAngle, endAngle);
      ctx.arc(cx, cy, innerRadius, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();

      startAngle = endAngle;
    }

    // Center text
    if (centerValue) {
      ctx.fillStyle = textMuted;
      ctx.font = `bold 16px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(centerValue, cx, cy - 6);
    }
    if (centerLabel) {
      ctx.fillStyle = textFaint;
      ctx.font = `11px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(centerLabel, cx, cy + 14);
    }
  }

  onMount(() => {
    drawChart();
    const ro = new ResizeObserver(() => drawChart());
    ro.observe(container);
    return () => ro.disconnect();
  });

  afterUpdate(() => {
    drawChart();
  });
</script>

<div class="donut-chart" bind:this={container}>
  {#if segments.length === 0 || total === 0}
    <div class="donut-empty">{$t("components.noData")}</div>
  {:else}
    <canvas bind:this={canvas}></canvas>
    <div class="donut-legend">
      {#each segments as seg}
        <div class="donut-legend-item">
          <span class="donut-legend-dot" style="background: {seg.color}"></span>
          <span class="donut-legend-label">{seg.label}</span>
          <span class="donut-legend-value">{seg.value > 0 ? Math.round((seg.value / total) * 100) : 0}%</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .donut-chart {
    display: flex;
    align-items: center;
    gap: 20px;
    width: 100%;
  }

  canvas {
    flex-shrink: 0;
  }

  .donut-empty {
    text-align: center;
    padding: 20px 0;
    color: var(--mcp-text-faint);
    font-size: 12px;
    width: 100%;
  }

  .donut-legend {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .donut-legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }

  .donut-legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .donut-legend-label {
    color: var(--mcp-text-muted);
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .donut-legend-value {
    color: var(--mcp-text-muted);
    font-weight: 600;
    flex-shrink: 0;
  }

  @media (max-width: 480px) {
    .donut-chart {
      flex-direction: column;
    }
  }
</style>
