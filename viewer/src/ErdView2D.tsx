import { useEffect, useMemo, useRef, useState } from "react";
import dagre from "dagre";
import { GraphData, GraphLink, GraphNode, Relation } from "./types";

interface Props {
  data: GraphData;
  width: number;
  height: number;
  level: 1 | 2 | 3;
  onNodeReseed: (n: GraphNode) => void;
}

const RELATION_LABEL: Partial<Record<Relation, string>> = {
  ONE_TO_MANY: "1:N",
  MANY_TO_ONE: "N:1",
  ONE_TO_ONE: "1:1",
  MANY_TO_MANY: "M:N",
  EXTENDS: "extends",
  USES_ENTITY: "uses"
};

const RELATION_COLOR: Partial<Record<Relation, string>> = {
  ONE_TO_MANY: "#10b981",
  MANY_TO_ONE: "#14b8a6",
  ONE_TO_ONE: "#06b6d4",
  MANY_TO_MANY: "#6366f1",
  EXTENDS: "#ff7b7b",
  USES_ENTITY: "#eab308"
};

const CARD_W = 220;
const CARD_HEADER_H = 36;
const ROW_H = 18;

type RankDir = "LR" | "TB";

interface CardBox { x: number; y: number; w: number; h: number; }
interface EdgePath { points: { x: number; y: number }[]; }

interface Layout {
  nodes: Map<string, CardBox>;
  edges: Map<string, EdgePath>;
  width: number;
  height: number;
}

/**
 * dagre 기반 2D ERD 렌더러.
 *
 * 노드는 테이블 카드 형태(header + 컬럼 리스트), 엣지는 dagre 가 계산한 꺾인 경로.
 * rankdir 토글(LR / TB)로 가로/세로 방향 전환.
 */
export default function ErdView2D({ data, width, height, level, onNodeReseed }: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<{ x: number; y: number } | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [rankdir, setRankdir] = useState<RankDir>("LR");
  const didFit = useRef(false);

  const layout = useMemo(() => computeDagreLayout(data, level, rankdir), [data, level, rankdir]);

  // 그래프가 새로 들어오거나 rankdir 이 바뀌면 자동으로 화면에 맞춤
  useEffect(() => {
    if (layout.width === 0 || layout.height === 0) return;
    const margin = 40;
    const scale = Math.min(
      (width - margin * 2) / layout.width,
      (height - margin * 2) / layout.height,
      1
    );
    setZoom(scale);
    setPan({
      x: (width - layout.width * scale) / 2,
      y: (height - layout.height * scale) / 2
    });
    didFit.current = true;
  }, [layout, width, height]);

  const linkKey = (l: GraphLink, i: number) => `${l.source}-${l.target}-${l.relation}-${i}`;

  return (
    <div
      style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#0f172a", cursor: dragging ? "grabbing" : "grab" }}
      onMouseDown={(e) => setDragging({ x: e.clientX - pan.x, y: e.clientY - pan.y })}
      onMouseMove={(e) => { if (dragging) setPan({ x: e.clientX - dragging.x, y: e.clientY - dragging.y }); }}
      onMouseUp={() => setDragging(null)}
      onMouseLeave={() => setDragging(null)}
      onWheel={(e) => {
        const next = Math.max(0.2, Math.min(3, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
        setZoom(next);
      }}
    >
      <svg width={width} height={height}>
        <defs>
          {Object.entries(RELATION_COLOR).map(([rel, color]) => (
            <marker
              key={rel}
              id={`arrow-${rel}`}
              viewBox="0 0 10 10"
              refX={9} refY={5}
              markerWidth={6} markerHeight={6}
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
            </marker>
          ))}
        </defs>
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* 엣지 */}
          {data.links.map((l, i) => {
            const key = linkKey(l, i);
            const path = layout.edges.get(key);
            if (!path || path.points.length < 2) return null;
            const color = RELATION_COLOR[l.relation] ?? "#94a3b8";
            const isHover = hoverEdge === key;
            const d = pointsToPath(path.points);
            const labelPoint = path.points[Math.floor(path.points.length / 2)];
            return (
              <g
                key={key}
                onMouseEnter={() => setHoverEdge(key)}
                onMouseLeave={() => setHoverEdge((h) => (h === key ? null : h))}
              >
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={isHover ? 2.5 : 1.5}
                  opacity={0.85}
                  markerEnd={`url(#arrow-${l.relation})`}
                />
                <text
                  x={labelPoint.x}
                  y={labelPoint.y - 6}
                  fill={color}
                  fontSize={11}
                  textAnchor="middle"
                  stroke="#0f172a"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {RELATION_LABEL[l.relation] ?? l.relation}
                </text>
                {l.label && isHover && (
                  <text
                    x={labelPoint.x}
                    y={labelPoint.y + 10}
                    fill="#cbd5e1"
                    fontSize={10}
                    textAnchor="middle"
                    stroke="#0f172a"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {l.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* 노드 */}
          {data.nodes.map((n) => {
            const box = layout.nodes.get(n.id);
            if (!box) return null;
            return (
              <EntityCard
                key={n.id}
                node={n}
                x={box.x}
                y={box.y}
                level={level}
                onReseed={() => onNodeReseed(n)}
              />
            );
          })}
        </g>
      </svg>

      {/* 컨트롤 */}
      <div style={{
        position: "absolute", bottom: 16, right: 16,
        display: "flex", gap: 4, background: "#1e293b", padding: 4, borderRadius: 4
      }}>
        <button
          style={zoomBtnStyle}
          onClick={() => setRankdir((d) => (d === "LR" ? "TB" : "LR"))}
          title="방향 전환 (LR ↔ TB)"
        >
          {rankdir}
        </button>
        <button style={zoomBtnStyle} onClick={() => setZoom((z) => Math.min(3, z * 1.2))}>+</button>
        <button style={zoomBtnStyle} onClick={() => setZoom((z) => Math.max(0.2, z / 1.2))}>−</button>
        <button
          style={zoomBtnStyle}
          onClick={() => {
            // fit 재실행: layout 의존성 트리거를 위해 zoom 만 살짝 바꾸지 않고 직접 계산
            const margin = 40;
            const scale = Math.min(
              (width - margin * 2) / Math.max(1, layout.width),
              (height - margin * 2) / Math.max(1, layout.height),
              1
            );
            setZoom(scale);
            setPan({
              x: (width - layout.width * scale) / 2,
              y: (height - layout.height * scale) / 2
            });
          }}
        >
          fit
        </button>
      </div>
    </div>
  );
}

function pointsToPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  // dagre 가 부드러운 곡선 경로를 주지는 않으므로 polyline 으로 그린다.
  // 첫 점 M, 이후 L. 두 점 사이는 직선.
  const head = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  const rest = points.slice(1)
    .map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  return `${head} ${rest}`;
}

function cardHeight(n: GraphNode, level: 1 | 2 | 3): number {
  if (level < 2 || !n.entity || n.entity.columns.length === 0) return CARD_HEADER_H + 8;
  return CARD_HEADER_H + n.entity.columns.length * ROW_H + 8;
}

/**
 * dagre 로 계층 레이아웃 계산.
 *
 * 노드 크기는 가변 (컬럼 수에 따라 높이 변동).
 * 엣지는 (source, target, relation, index) 를 키로 multi-edge 지원.
 * dagre 가 반환하는 노드 좌표 (x, y) 는 노드의 중심이라 좌상단 (x - w/2, y - h/2) 로 변환.
 */
function computeDagreLayout(data: GraphData, level: 1 | 2 | 3, rankdir: RankDir): Layout {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir,
    nodesep: 40,
    ranksep: 80,
    marginx: 30,
    marginy: 30
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of data.nodes) {
    g.setNode(n.id, { width: CARD_W, height: cardHeight(n, level) });
  }

  data.links.forEach((l, i) => {
    if (!g.hasNode(l.source) || !g.hasNode(l.target)) return;
    const edgeName = `${l.relation}-${i}`;
    g.setEdge(l.source, l.target, {}, edgeName);
  });

  dagre.layout(g);

  const nodeBoxes = new Map<string, CardBox>();
  for (const id of g.nodes()) {
    const n = g.node(id);
    if (!n) continue;
    nodeBoxes.set(id, {
      x: n.x - n.width / 2,
      y: n.y - n.height / 2,
      w: n.width,
      h: n.height
    });
  }

  const edgePaths = new Map<string, EdgePath>();
  data.links.forEach((l, i) => {
    if (!g.hasNode(l.source) || !g.hasNode(l.target)) return;
    const edgeName = `${l.relation}-${i}`;
    const e = g.edge({ v: l.source, w: l.target, name: edgeName });
    if (!e || !e.points) return;
    const key = `${l.source}-${l.target}-${l.relation}-${i}`;
    edgePaths.set(key, { points: e.points });
  });

  const graphLabel = g.graph() as { width?: number; height?: number };
  return {
    nodes: nodeBoxes,
    edges: edgePaths,
    width: graphLabel.width ?? 0,
    height: graphLabel.height ?? 0
  };
}

function EntityCard({ node, x, y, level, onReseed }: {
  node: GraphNode; x: number; y: number; level: 1 | 2 | 3; onReseed: () => void;
}) {
  const isEntity = node.entity != null;
  const isMappedSuper = node.entity?.kind === "mappedSuperclass";
  const isEmbeddable = node.entity?.kind === "embeddable";
  const headerBg = isMappedSuper ? "#3730a3" : isEmbeddable ? "#0f766e" : isEntity ? "#1d4ed8" : "#475569";
  const tableLine = node.entity?.tableName ?? node.name;
  const showColumns = level >= 2 && isEntity && node.entity!.columns.length > 0;
  const h = cardHeight(node, level);

  return (
    <g transform={`translate(${x},${y})`} onContextMenu={(e) => { e.preventDefault(); onReseed(); }}>
      <rect width={CARD_W} height={h} rx={6} fill="#1e293b" stroke="#334155" />
      <rect width={CARD_W} height={CARD_HEADER_H} rx={6} fill={headerBg} />
      <text x={10} y={16} fill="#f1f5f9" fontSize={13} fontWeight={600}>{node.name}</text>
      <text x={10} y={30} fill="#cbd5e1" fontSize={10}>
        {isEntity ? `${tableLine}` : "Repository"}
      </text>
      {showColumns && node.entity!.columns.map((c, i) => (
        <g key={c.fieldName} transform={`translate(0,${CARD_HEADER_H + i * ROW_H})`}>
          <text x={10} y={14} fill={c.primaryKey ? "#fbbf24" : "#e2e8f0"} fontSize={11}>
            {c.primaryKey ? "🔑 " : ""}{c.columnName ?? c.fieldName}
          </text>
          <text x={CARD_W - 10} y={14} fill="#94a3b8" fontSize={10} textAnchor="end">
            {shortType(c.javaType)}{c.nullable ? "" : "*"}
          </text>
        </g>
      ))}
    </g>
  );
}

function shortType(t: string): string {
  const i = t.lastIndexOf(".");
  return i < 0 ? t : t.slice(i + 1);
}

const zoomBtnStyle: React.CSSProperties = {
  minWidth: 28, height: 28, fontSize: 12, padding: "0 6px",
  background: "transparent", color: "#cbd5e1",
  border: "1px solid #475569", borderRadius: 4, cursor: "pointer"
};
