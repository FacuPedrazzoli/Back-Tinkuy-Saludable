import { logger } from "./logger";

interface MetricLabels {
  operation?: string;
  tenantId?: string;
  [key: string]: string | undefined;
}

interface TimingMetric {
  count: number;
  sum: number;
  min: number;
  max: number;
}

const MAX_METRICS_ENTRIES = 10000;
const MAX_COUNTER_ENTRIES = 10000;
const metrics: Map<string, TimingMetric> = new Map();
const counters: Map<string, number> = new Map();

export function recordMetric(name: string, value: number, labels: MetricLabels = {}) {
  if (metrics.size >= MAX_METRICS_ENTRIES) {
    const firstKey = metrics.keys().next().value;
    if (firstKey !== undefined) metrics.delete(firstKey);
  }
  const key = metricKey(name, labels);
  const existing = metrics.get(key);

  if (existing) {
    existing.count += 1;
    existing.sum += value;
    existing.min = Math.min(existing.min, value);
    existing.max = Math.max(existing.max, value);
  } else {
    metrics.set(key, { count: 1, sum: value, min: value, max: value });
  }
}

export function incrementCounter(name: string, labels: MetricLabels = {}) {
  if (counters.size >= MAX_COUNTER_ENTRIES) {
    const firstKey = counters.keys().next().value;
    if (firstKey !== undefined) counters.delete(firstKey);
  }
  const key = metricKey(name, labels);
  counters.set(key, (counters.get(key) ?? 0) + 1);
}

export function getMetrics() {
  const result: Record<string, unknown> = {};

  for (const [key, metric] of metrics.entries()) {
    result[key] = {
      type: "histogram",
      count: metric.count,
      avg: metric.sum / metric.count,
      min: metric.min,
      max: metric.max,
    };
  }

  for (const [key, count] of counters.entries()) {
    result[key] = { type: "counter", value: count };
  }

  return result;
}

export function getMetricsSummary(): Record<string, unknown> {
  const metricsData = getMetrics();
  logger.info({ component: "metrics" }, JSON.stringify(metricsData));
  return metricsData;
}

function metricKey(name: string, labels: MetricLabels): string {
  const sortedLabels = Object.keys(labels)
    .sort()
    .filter((k) => labels[k] !== undefined)
    .map((k) => `${k}:${labels[k]}`)
    .join(",");
  return sortedLabels ? `${name}{${sortedLabels}}` : name;
}
