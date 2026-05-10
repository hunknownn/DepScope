import { GraphData, GraphNode, Relation } from "./types";

export async function fetchGraph(
  seed: string,
  depth: number,
  relations?: Relation[]
): Promise<GraphData> {
  const params = new URLSearchParams({ seed, depth: String(depth) });
  if (relations && relations.length) params.set("relations", relations.join(","));
  const res = await fetch(`/api/graph?${params}`);
  if (!res.ok) throw new Error(`graph fetch failed: ${res.status}`);
  return res.json();
}

export async function search(q: string): Promise<GraphNode[]> {
  if (!q.trim()) return [];
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  return res.json();
}

export interface Config {
  nodes: number;
  projectRoot?: string;
  classpath?: string;
  packages?: string;
}

export async function getConfig(): Promise<Config> {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error(`config fetch failed: ${res.status}`);
  return res.json();
}

export async function reindex(req?: {
  projectRoot?: string;
  classpath?: string;
  packages?: string;
}): Promise<Config> {
  const res = await fetch("/api/reindex", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: req ? JSON.stringify(req) : undefined
  });
  if (!res.ok) throw new Error(`reindex failed: ${res.status}`);
  return res.json();
}
