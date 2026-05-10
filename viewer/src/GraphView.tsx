import { useEffect, useMemo, useRef } from "react";
import ForceGraph3D, { ForceGraphMethods } from "react-force-graph-3d";
import { GraphData, GraphLink, GraphNode, Relation } from "./types";

const RELATION_COLOR: Record<Relation, string> = {
  EXTENDS: "#ff7b7b",
  IMPLEMENTS: "#ffb86b",
  HAS_FIELD: "#7bc7ff",
  PARAM: "#9aa5b1",
  RETURNS: "#9aa5b1",
  CALLS: "#a78bfa",
  NEW: "#34d399",
  ANNOTATED_BY: "#f472b6"
};

const KIND_COLOR: Record<string, string> = {
  class: "#cbd5e1",
  interface: "#fde68a",
  enum: "#86efac",
  annotation: "#f0abfc",
  external: "#475569"
};

function nodeColor(n: GraphNode, seed: string): string {
  if (n.id === seed) return "#fbbf24";
  const stereo = n.stereotypes?.[0];
  if (stereo === "Service") return "#60a5fa";
  if (stereo === "Repository") return "#34d399";
  if (stereo === "Controller" || stereo === "RestController") return "#f472b6";
  if (stereo === "Component") return "#a78bfa";
  return KIND_COLOR[n.kind] ?? "#cbd5e1";
}

interface Props {
  data: GraphData;
  onNodeSelect: (n: GraphNode) => void;
  onNodeReseed: (n: GraphNode) => void;
  highlightedIds?: Set<string>;
  width: number;
  height: number;
}

const DIM_COLOR = "#1f2937";

export default function GraphView({ data, onNodeSelect, onNodeReseed, highlightedIds, width, height }: Props) {
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);

  // ForceGraph 는 source/target 을 객체 참조로 바꾸기 때문에 매 렌더 새 객체를 넘긴다.
  const graphData = useMemo(() => ({
    nodes: data.nodes.map(n => ({ ...n })),
    links: data.links.map(l => ({ ...l }))
  }), [data]);

  useEffect(() => {
    const t = setTimeout(() => fgRef.current?.zoomToFit(600, 80), 200);
    return () => clearTimeout(t);
  }, [data.seed, data.depth]);

  const hlActive = !!highlightedIds && highlightedIds.size > 0;
  // 하이라이트 변경 시 ForceGraph 가 색상/크기 캐시를 새로 계산하도록 트리거
  useEffect(() => {
    fgRef.current?.refresh?.();
  }, [highlightedIds]);

  function linkEndpointId(end: string | { id?: string }): string {
    return typeof end === "string" ? end : (end?.id ?? "");
  }

  return (
    <ForceGraph3D
      ref={fgRef}
      width={width}
      height={height}
      graphData={graphData}
      backgroundColor="#0b1020"
      nodeLabel={(n: any) => `<div style="padding:4px 8px;background:#111827;border-radius:4px">
        <b>${(n as GraphNode).name}</b><br/>
        <span style="color:#9aa5b1">${(n as GraphNode).pkg}</span><br/>
        <span style="color:#9aa5b1">${(n as GraphNode).kind}${
          (n as GraphNode).stereotypes?.length ? " · @" + (n as GraphNode).stereotypes.join(", @") : ""
        }</span>
      </div>`}
      nodeColor={(n: any) => {
        const node = n as GraphNode;
        const base = nodeColor(node, data.seed);
        if (!hlActive) return base;
        return highlightedIds!.has(node.id) ? base : DIM_COLOR;
      }}
      nodeVal={(n: any) => {
        const node = n as GraphNode;
        const baseSize = node.id === data.seed ? 16 : 4;
        if (!hlActive) return baseSize;
        return highlightedIds!.has(node.id) ? baseSize * 2.5 : baseSize;
      }}
      linkColor={(l: any) => {
        const link = l as GraphLink;
        const base = RELATION_COLOR[link.relation] ?? "#666";
        if (!hlActive) return base;
        const s = linkEndpointId((l as any).source);
        const t = linkEndpointId((l as any).target);
        return (highlightedIds!.has(s) || highlightedIds!.has(t)) ? base : DIM_COLOR;
      }}
      linkOpacity={hlActive ? 0.25 : 0.6}
      linkDirectionalArrowLength={3}
      linkDirectionalArrowRelPos={1}
      onNodeClick={(n: any) => onNodeSelect(n as GraphNode)}
      onNodeRightClick={(n: any) => onNodeReseed(n as GraphNode)}
      // 좌클릭: 디테일 패널 표시 / 우클릭: 그 노드를 새 seed 로
    />
  );
}
