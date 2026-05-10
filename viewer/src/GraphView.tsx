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
  onNodeDoubleClick: (n: GraphNode) => void;
  width: number;
  height: number;
}

export default function GraphView({ data, onNodeDoubleClick, width, height }: Props) {
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
      nodeColor={(n: any) => nodeColor(n as GraphNode, data.seed)}
      nodeVal={(n: any) => ((n as GraphNode).id === data.seed ? 16 : 4)}
      linkColor={(l: any) => RELATION_COLOR[(l as GraphLink).relation] ?? "#666"}
      linkOpacity={0.6}
      linkDirectionalArrowLength={3}
      linkDirectionalArrowRelPos={1}
      onNodeClick={(n: any) => fgRef.current?.centerAt?.()}
      onNodeRightClick={(n: any) => onNodeDoubleClick(n as GraphNode)}
      // 더블클릭 대용으로 right-click 사용 (3d-force-graph 는 기본 dblclick = 줌)
    />
  );
}
