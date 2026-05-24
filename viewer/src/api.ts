import { CallFlowNode, GraphData, GraphNode, Relation, SourceSnippet } from "./types";

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

export async function fetchClassDetail(id: string): Promise<GraphNode> {
  const res = await fetch(`/api/class?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`class detail fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchSource(
  classFqn: string,
  line: number,
  before = 1,
  after = 1
): Promise<SourceSnippet> {
  const params = new URLSearchParams({
    class: classFqn,
    line: String(line),
    before: String(before),
    after: String(after)
  });
  const res = await fetch(`/api/source?${params}`);
  if (!res.ok) throw new Error(`source fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchCallFlow(
  seed: string,
  method: string,
  descriptor?: string,
  depth = 3
): Promise<CallFlowNode> {
  const params = new URLSearchParams({ seed, method, depth: String(depth) });
  if (descriptor) params.set("descriptor", descriptor);
  const res = await fetch(`/api/call-flow?${params}`);
  if (!res.ok) throw new Error(`call-flow fetch failed: ${res.status}`);
  return res.json();
}

export async function search(q: string): Promise<GraphNode[]> {
  if (!q.trim()) return [];
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  return res.json();
}

export async function fetchErd(opts: {
  scope: "all" | "seed";
  seed?: string;
  depth?: number;
  level: 1 | 2 | 3;
}): Promise<GraphData> {
  const params = new URLSearchParams({ scope: opts.scope, level: String(opts.level) });
  if (opts.seed) params.set("seed", opts.seed);
  if (opts.depth != null) params.set("depth", String(opts.depth));
  const res = await fetch(`/api/erd?${params}`);
  if (!res.ok) throw new Error(`erd fetch failed: ${res.status}`);
  return res.json();
}

export async function searchErd(q: string, includeRepositories = true): Promise<GraphNode[]> {
  if (!q.trim()) return [];
  const params = new URLSearchParams({
    q,
    includeRepositories: String(includeRepositories)
  });
  const res = await fetch(`/api/erd/search?${params}`);
  if (!res.ok) throw new Error(`erd search failed: ${res.status}`);
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
