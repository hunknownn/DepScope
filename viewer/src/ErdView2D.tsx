import { useMemo, useState } from "react";
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
const PADDING = 60;

/**
 * 가벼운 2D ERD 렌더러.
 *
 * 자동 레이아웃은 단순 grid (열 우선) — dagre/elkjs 없이 동작.
 * 노드는 테이블 카드 형태 (header: 클래스명 + 테이블명, body: 컬럼 리스트).
 * 엣지는 직선 + 카디널리티 라벨. 엣지 끝의 Crow's foot 마커는 후속 작업.
 */
export default function ErdView2D({ data, width, height, level, onNodeReseed }: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<{ x: number; y: number } | null>(null);
  const [hoverEdge, setHoverEdge] = useState<number | null>(null);

  const layout = useMemo(() => computeGridLayout(data.nodes, level), [data.nodes, level]);

  const linkKey = (l: GraphLink, i: number) => `${l.source}-${l.target}-${l.relation}-${i}`;

  return (
    <div
      style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#0f172a", cursor: dragging ? "grabbing" : "grab" }}
      onMouseDown={(e) => setDragging({ x: e.clientX - pan.x, y: e.clientY - pan.y })}
      onMouseMove={(e) => { if (dragging) setPan({ x: e.clientX - dragging.x, y: e.clientY - dragging.y }); }}
      onMouseUp={() => setDragging(null)}
      onMouseLeave={() => setDragging(null)}
      onWheel={(e) => {
        const next = Math.max(0.3, Math.min(2.5, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
        setZoom(next);
      }}
    >
      <svg width={width} height={height}>
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* 엣지 */}
          {data.links.map((l, i) => {
            const s = layout.get(l.source);
            const t = layout.get(l.target);
            if (!s || !t) return null;
            const sc = cardCenter(s);
            const tc = cardCenter(t);
            const mid = { x: (sc.x + tc.x) / 2, y: (sc.y + tc.y) / 2 };
            const color = RELATION_COLOR[l.relation] ?? "#94a3b8";
            const isHover = hoverEdge === i;
            return (
              <g
                key={linkKey(l, i)}
                onMouseEnter={() => setHoverEdge(i)}
                onMouseLeave={() => setHoverEdge((h) => (h === i ? null : h))}
              >
                <line
                  x1={sc.x} y1={sc.y} x2={tc.x} y2={tc.y}
                  stroke={color} strokeWidth={isHover ? 3 : 1.5} opacity={0.7}
                />
                <text x={mid.x} y={mid.y - 4} fill={color} fontSize={11} textAnchor="middle"
                      stroke="#0f172a" strokeWidth={3} paintOrder="stroke">
                  {RELATION_LABEL[l.relation] ?? l.relation}
                </text>
                {l.label && isHover && (
                  <text x={mid.x} y={mid.y + 10} fill="#cbd5e1" fontSize={10} textAnchor="middle"
                        stroke="#0f172a" strokeWidth={3} paintOrder="stroke">
                    {l.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* 노드 */}
          {data.nodes.map((n) => {
            const pos = layout.get(n.id);
            if (!pos) return null;
            return (
              <EntityCard
                key={n.id}
                node={n}
                x={pos.x}
                y={pos.y}
                level={level}
                onReseed={() => onNodeReseed(n)}
              />
            );
          })}
        </g>
      </svg>

      {/* 줌 컨트롤 */}
      <div style={{
        position: "absolute", bottom: 16, right: 16,
        display: "flex", gap: 4, background: "#1e293b", padding: 4, borderRadius: 4
      }}>
        <button style={zoomBtnStyle} onClick={() => setZoom((z) => Math.min(2.5, z * 1.2))}>+</button>
        <button style={zoomBtnStyle} onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))}>−</button>
        <button style={zoomBtnStyle} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>fit</button>
      </div>
    </div>
  );
}

interface CardPos { x: number; y: number; h: number; }

function cardCenter(p: CardPos) { return { x: p.x + CARD_W / 2, y: p.y + p.h / 2 }; }

/** sqrt(N) 기준 grid 배치. PADDING 만큼 간격. */
function computeGridLayout(nodes: GraphNode[], level: 1 | 2 | 3): Map<string, CardPos> {
  const out = new Map<string, CardPos>();
  if (nodes.length === 0) return out;
  const cols = Math.ceil(Math.sqrt(nodes.length));
  let row = 0, col = 0;
  let rowMaxH = 0;
  let curY = PADDING;
  for (const n of nodes) {
    const h = cardHeight(n, level);
    out.set(n.id, { x: PADDING + col * (CARD_W + PADDING), y: curY, h });
    if (h > rowMaxH) rowMaxH = h;
    col++;
    if (col >= cols) {
      col = 0;
      row++;
      curY += rowMaxH + PADDING;
      rowMaxH = 0;
    }
  }
  return out;
}

function cardHeight(n: GraphNode, level: 1 | 2 | 3): number {
  if (level < 2 || !n.entity || n.entity.columns.length === 0) return CARD_HEADER_H + 8;
  return CARD_HEADER_H + n.entity.columns.length * ROW_H + 8;
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
  width: 28, height: 28, fontSize: 14,
  background: "transparent", color: "#cbd5e1",
  border: "1px solid #475569", borderRadius: 4, cursor: "pointer"
};
