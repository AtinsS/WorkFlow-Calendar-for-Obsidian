<script lang="ts">
  import { onMount, afterUpdate } from "svelte";
  import type { TimeLog } from "../task-tracker/types";
  import { formatDuration } from "../task-tracker/TimerManager";
  import { t, locale } from "../i18n";

  export let logs: TimeLog[] = [];
  export let mode: "bar" | "area" = "bar";

  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
  let tooltip: HTMLDivElement;
  let hoveredBar: number = -1;

  interface DayData {
    date: string;
    label: string;
    totalMs: number;
  }

  function aggregateByDay(logs: TimeLog[], currentLocale: string): DayData[] {
    const map = new Map<string, number>();
    for (const log of logs) {
      map.set(log.date, (map.get(log.date) || 0) + log.duration);
    }

    const result: DayData[] = [];
    for (const [date, totalMs] of map) {
      const d = new Date(date + "T12:00:00");
      const label = d.toLocaleDateString(currentLocale === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "short" });
      result.push({ date, label, totalMs });
    }

    result.sort((a, b) => a.date.localeCompare(b.date));
    const maxBars = 14;
    if (result.length > maxBars) {
      return result.slice(result.length - maxBars);
    }
    return result;
  }

  $: dayData = aggregateByDay(logs, $locale);
  $: maxMs = dayData.length > 0 ? Math.max(...dayData.map((d) => d.totalMs)) : 0;

  let dpr = 1;

  function drawChart() {
    if (!canvas || !container || dayData.length === 0) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = Math.min(160, Math.max(100, rect.width * 0.45));

    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const computedStyles = getComputedStyle(document.documentElement);
    const accentColor = computedStyles.getPropertyValue("--mcp-accent").trim() || "rgba(95, 153, 225, 0.479)";
    const textMuted = computedStyles.getPropertyValue("--mcp-text-muted").trim() || "rgba(200, 210, 220, 0.5)";
    const textFaint = computedStyles.getPropertyValue("--mcp-text-faint").trim() || "rgba(200, 210, 220, 0.25)";

    ctx.clearRect(0, 0, width, height);

    const paddingLeft = 8;
    const paddingRight = 8;
    const paddingTop = 18;
    const paddingBottom = 24;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const barCount = dayData.length;
    const barGap = Math.max(3, Math.min(8, chartWidth / barCount * 0.2));
    const barWidth = Math.max(4, (chartWidth - barGap * (barCount + 1)) / barCount);

    // Parse accent color
    const accentMatch = accentColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    let barR = 95, barG = 153, barB = 225, barA = 0.85;
    if (accentMatch) {
      barR = parseInt(accentMatch[1]);
      barG = parseInt(accentMatch[2]);
      barB = parseInt(accentMatch[3]);
      barA = accentMatch[4] ? parseFloat(accentMatch[4]) : 0.85;
    }

    // Draw horizontal grid lines
    const gridLines = 3;
    ctx.strokeStyle = textFaint;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    for (let i = 1; i <= gridLines; i++) {
      const y = paddingTop + chartHeight - (chartHeight * i) / gridLines;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (mode === "area") {
      // ── Area / Line chart with Catmull-Rom spline ──
      const points: { x: number; y: number }[] = [];
      const minBarHeight = 3;

      for (let i = 0; i < barCount; i++) {
        const d = dayData[i];
        const barH = maxMs > 0 ? Math.max(minBarHeight, (d.totalMs / maxMs) * chartHeight) : minBarHeight;
        const x = paddingLeft + barGap + i * (barWidth + barGap) + barWidth / 2;
        const y = paddingTop + chartHeight - barH;
        points.push({ x, y });
      }

      if (points.length > 1) {
        // Catmull-Rom to Bezier conversion for smooth curves
        const tension = 0.3;

        // Area fill
        ctx.beginPath();
        ctx.moveTo(points[0].x, paddingTop + chartHeight);
        ctx.lineTo(points[0].x, points[0].y);

        for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[Math.max(0, i - 1)];
          const p1 = points[i];
          const p2 = points[i + 1];
          const p3 = points[Math.min(points.length - 1, i + 2)];

          const cp1x = p1.x + (p2.x - p0.x) * tension;
          const cp1y = p1.y + (p2.y - p0.y) * tension;
          const cp2x = p2.x - (p3.x - p1.x) * tension;
          const cp2y = p2.y - (p3.y - p1.y) * tension;

          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
        ctx.lineTo(points[points.length - 1].x, paddingTop + chartHeight);
        ctx.closePath();

        const areaGrad = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + chartHeight);
        areaGrad.addColorStop(0, `rgba(${barR}, ${barG}, ${barB}, ${barA * 0.4})`);
        areaGrad.addColorStop(0.5, `rgba(${barR}, ${barG}, ${barB}, ${barA * 0.15})`);
        areaGrad.addColorStop(1, `rgba(${barR}, ${barG}, ${barB}, 0.01)`);
        ctx.fillStyle = areaGrad;
        ctx.fill();

        // Line with glow
        ctx.save();
        ctx.shadowColor = `rgba(${barR}, ${barG}, ${barB}, 0.5)`;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          const cp1x = points[i - 1].x + (points[i].x - points[Math.max(0, i - 2)].x) * tension;
          const cp1y = points[i - 1].y + (points[i].y - points[Math.max(0, i - 2)].y) * tension;
          const cp2x = points[i].x - (points[Math.min(points.length - 1, i + 1)].x - points[i - 1].x) * tension;
          const cp2y = points[i].y - (points[Math.min(points.length - 1, i + 1)].y - points[i - 1].y) * tension;
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, points[i].x, points[i].y);
        }
        ctx.strokeStyle = `rgba(${barR}, ${barG}, ${barB}, ${barA})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
      }

      // Draw dots and labels
      for (let i = 0; i < barCount; i++) {
        const d = dayData[i];
        const p = points[i];
        const isHovered = i === hoveredBar;

        // Outer glow for hovered
        if (isHovered) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${barR}, ${barG}, ${barB}, 0.15)`;
          ctx.fill();
        }

        // Dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, isHovered ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? `rgba(${barR}, ${barG}, ${barB}, 1)` : `rgba(${barR}, ${barG}, ${barB}, 0.8)`;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = isHovered ? 2 : 1.5;
        ctx.stroke();

        // Duration label on hover
        if (isHovered) {
          ctx.fillStyle = textMuted;
          ctx.font = `bold 10px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(formatDuration(d.totalMs), p.x, p.y - 10);
        }

        // Date label
        ctx.fillStyle = isHovered ? textMuted : textFaint;
        ctx.font = `${Math.max(8, Math.min(10, barWidth * 0.6))}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(d.label, p.x, height - 6);
      }
    } else {
      // ── Bar chart (original) ──
      const minBarHeight = 3;
      for (let i = 0; i < barCount; i++) {
        const d = dayData[i];
        const barH = maxMs > 0 ? Math.max(minBarHeight, (d.totalMs / maxMs) * chartHeight) : minBarHeight;
        const x = paddingLeft + barGap + i * (barWidth + barGap);
        const y = paddingTop + chartHeight - barH;

        const isHovered = i === hoveredBar;

        const radius = Math.min(4, barWidth / 3);
        ctx.beginPath();
        ctx.moveTo(x, y + radius);
        ctx.arcTo(x, y, x + radius, y, radius);
        ctx.arcTo(x + barWidth, y, x + barWidth, y + radius, radius);
        ctx.lineTo(x + barWidth, paddingTop + chartHeight);
        ctx.lineTo(x, paddingTop + chartHeight);
        ctx.closePath();

        if (isHovered) {
          ctx.fillStyle = `rgba(${barR}, ${barG}, ${barB}, 1)`;
        } else {
          const grad = ctx.createLinearGradient(x, y, x, paddingTop + chartHeight);
          grad.addColorStop(0, `rgba(${barR}, ${barG}, ${barB}, ${barA})`);
          grad.addColorStop(1, `rgba(${barR}, ${barG}, ${barB}, ${barA * 0.4})`);
          ctx.fillStyle = grad;
        }
        ctx.fill();

        if (isHovered) {
          ctx.shadowColor = `rgba(${barR}, ${barG}, ${barB}, 0.4)`;
          ctx.shadowBlur = 12;
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        ctx.fillStyle = isHovered ? textMuted : textFaint;
        ctx.font = `${Math.max(8, Math.min(10, barWidth * 0.6))}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(d.label, x + barWidth / 2, height - 6);
      }

      // Duration label on top of hovered bar
      if (hoveredBar >= 0 && hoveredBar < barCount) {
        const d = dayData[hoveredBar];
        const barH = maxMs > 0 ? Math.max(minBarHeight, (d.totalMs / maxMs) * chartHeight) : minBarHeight;
        const x = paddingLeft + barGap + hoveredBar * (barWidth + barGap);

        ctx.fillStyle = textMuted;
        ctx.font = `bold ${Math.max(9, Math.min(11, barWidth * 0.7))}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(formatDuration(d.totalMs), x + barWidth / 2, paddingTop + chartHeight - barH - 4);
      }
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!canvas || dayData.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const width = rect.width;

    const paddingLeft = 0;
    const paddingRight = 8;
    const chartWidth = width - paddingLeft - paddingRight;
    const barGap = Math.max(3, Math.min(8, chartWidth / dayData.length * 0.2));
    const barWidth = Math.max(4, (chartWidth - barGap * (dayData.length + 1)) / dayData.length);

    const idx = Math.floor((mouseX - paddingLeft - barGap) / (barWidth + barGap));
    if (idx >= 0 && idx < dayData.length) {
      hoveredBar = idx;
    } else {
      hoveredBar = -1;
    }
    drawChart();
  }

  function handleMouseLeave() {
    hoveredBar = -1;
    drawChart();
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

<div class="bar-chart-container" bind:this={container}>
  {#if dayData.length === 0}
    <div class="bar-chart-empty">{$t("components.noChartData")}</div>
  {:else}
    <canvas
      bind:this={canvas}
      on:mousemove={handleMouseMove}
      on:mouseleave={handleMouseLeave}
    ></canvas>
    <div class="bar-chart-summary">
      <span class="bar-chart-total">{$t("components.total", { value: formatDuration(dayData.reduce((s, d) => s + d.totalMs, 0)) })}</span>
      <span class="bar-chart-avg">{$t("components.average", { value: formatDuration(dayData.reduce((s, d) => s + d.totalMs, 0) / dayData.length) })}</span>
    </div>
  {/if}
</div>

<style>
  .bar-chart-container {
    width: 100%;
    position: relative;
  }

  canvas {
    display: block;
    width: 100%;
    cursor: crosshair;
  }

  .bar-chart-empty {
    text-align: center;
    padding: 20px 0;
    color: var(--mcp-text-faint);
    font-size: 12px;
  }

  .bar-chart-summary {
    display: flex;
    justify-content: space-between;
    padding: 6px 0 2px;
    font-size: 11px;
    color: var(--mcp-text-muted);
  }

  .bar-chart-total {
    font-weight: 600;
  }

  .bar-chart-avg {
    color: var(--mcp-text-faint);
  }

  @media (max-width: 480px) {
    .bar-chart-summary {
      font-size: 10px;
      flex-direction: column;
      gap: 2px;
      text-align: center;
    }
  }
</style>
