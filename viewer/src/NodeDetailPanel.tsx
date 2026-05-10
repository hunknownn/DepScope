import { useEffect, useState } from "react";
import { GraphNode, MethodInfo } from "./types";

interface Props {
  node: GraphNode;
  onReseed: (id: string) => void;
  onHover: (ids: string[]) => void;
}

type Tab = "methods" | "fields";

const PRIMITIVES = new Set([
  "void", "boolean", "byte", "char", "short", "int", "long", "float", "double"
]);

/** "java.lang.String[]" → "java.lang.String", 프리미티브는 제거 */
function toClassFqns(types: string[]): string[] {
  const out: string[] = [];
  for (const t of types) {
    if (!t) continue;
    const stripped = t.replace(/\[\]/g, "");
    if (!PRIMITIVES.has(stripped)) out.push(stripped);
  }
  return out;
}

export default function NodeDetailPanel({ node, onReseed, onHover }: Props) {
  const [tab, setTab] = useState<Tab>("methods");
  // 클릭으로 고정된 행: key + 강조할 ids
  const [pinned, setPinned] = useState<{ key: string; ids: string[] } | null>(null);

  // 다른 노드를 선택하면 핀 해제
  useEffect(() => {
    setPinned(null);
    onHover([]);
  }, [node.id]);

  // 핀 상태 변경 시 그래프에 반영
  useEffect(() => {
    onHover(pinned?.ids ?? []);
  }, [pinned]);

  const methods = node.methods ?? [];
  const fields = node.fields ?? [];
  const hasDetails = methods.length > 0 || fields.length > 0;

  function togglePin(key: string, ids: string[]) {
    setPinned(prev => prev?.key === key ? null : { key, ids });
  }

  /** 호버 종료 시: 핀이 있으면 핀의 ids 로 복귀, 없으면 해제 */
  function handleLeave() {
    onHover(pinned?.ids ?? []);
  }

  function rowStyle(key: string): React.CSSProperties {
    const isPinned = pinned?.key === key;
    return {
      ...itemStyle,
      background: isPinned ? "#2563eb44" : "transparent",
      borderLeft: isPinned ? "2px solid #2563eb" : "2px solid transparent"
    };
  }

  return (
    <div style={contentStyle}>
      <div>
        <div style={{ fontSize: 11, color: "#9aa5b1" }}>{node.pkg || "(default package)"}</div>
        <div style={{ fontSize: 16, fontWeight: 600, wordBreak: "break-all" }}>
          {node.name}
        </div>
        <div style={{ fontSize: 11, color: "#9aa5b1", marginTop: 2 }}>
          {node.kind}
          {node.stereotypes?.length ? " · @" + node.stereotypes.join(", @") : ""}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        <TabButton active={tab === "methods"} onClick={() => setTab("methods")}>
          Methods ({methods.length})
        </TabButton>
        <TabButton active={tab === "fields"} onClick={() => setTab("fields")}>
          Fields ({fields.length})
        </TabButton>
      </div>

      <div style={{ marginTop: 12 }}>
        {!hasDetails && (
          <div style={emptyStyle}>
            인덱스에 메서드/필드 정보가 없습니다.
            <br />
            (외부 라이브러리이거나 인덱스가 오래되었을 수 있습니다 — reindex 필요)
          </div>
        )}
        {hasDetails && tab === "methods" && (
          methods.length === 0
            ? <div style={emptyStyle}>메서드가 없습니다.</div>
            : <ul style={listStyle}>
                {methods.map((m, i) => {
                  const key = `m:${i}`;
                  const ids = toClassFqns([m.returnType, ...m.paramTypes, ...(m.usedTypes ?? [])]);
                  return (
                    <li key={key} style={rowStyle(key)}
                        title="클릭: 강조 고정 / 다시 클릭: 해제"
                        onClick={() => togglePin(key, ids)}
                        onMouseEnter={() => onHover(ids)}
                        onMouseLeave={handleLeave}>
                      {renderMethod(m)}
                    </li>
                  );
                })}
              </ul>
        )}
        {hasDetails && tab === "fields" && (
          fields.length === 0
            ? <div style={emptyStyle}>필드가 없습니다.</div>
            : <ul style={listStyle}>
                {fields.map((f, i) => {
                  const key = `f:${i}`;
                  const ids = toClassFqns([f.type]);
                  return (
                    <li key={key} style={rowStyle(key)}
                        title="클릭: 강조 고정 / 다시 클릭: 해제"
                        onClick={() => togglePin(key, ids)}
                        onMouseEnter={() => onHover(ids)}
                        onMouseLeave={handleLeave}>
                      <span style={modStyle}>{f.modifiers.join(" ")}</span>
                      {" "}
                      <span style={typeStyle}>{shortType(f.type)}</span>
                      {" "}
                      <span style={{ color: "#fff" }}>{f.name}</span>
                    </li>
                  );
                })}
              </ul>
        )}
      </div>

      {pinned && (
        <button onClick={() => setPinned(null)} style={{ ...reseedBtn, background: "#1f2937" }}>
          강조 해제
        </button>
      )}
      <button onClick={() => onReseed(node.id)} style={reseedBtn}>
        이 노드를 새 seed 로
      </button>
    </div>
  );
}

function renderMethod(m: MethodInfo) {
  const params = m.paramTypes.map(shortType).join(", ");
  return (
    <>
      <span style={modStyle}>{m.modifiers.join(" ")}</span>
      {" "}
      <span style={typeStyle}>{shortType(m.returnType)}</span>
      {" "}
      <span style={{ color: "#fff" }}>{m.name}</span>
      <span style={{ color: "#9aa5b1" }}>({params})</span>
    </>
  );
}

/** java.util.List<java.lang.String> -> List<String> 수준의 짧은 표시 */
function shortType(t: string): string {
  if (!t) return t;
  // Generic 은 ASM descriptor 에선 지워지므로 단순 . 분할로 충분
  return t.replace(/[\w$.]+/g, seg => {
    const i = seg.lastIndexOf(".");
    return i < 0 ? seg : seg.substring(i + 1);
  });
}

function TabButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px", fontSize: 12, cursor: "pointer",
        background: active ? "#2563eb" : "#1f2937",
        color: "#fff", border: "1px solid #374151", borderRadius: 4
      }}>
      {children}
    </button>
  );
}

const contentStyle: React.CSSProperties = {
  color: "#e5e7eb", fontSize: 12, display: "flex", flexDirection: "column"
};

const listStyle: React.CSSProperties = {
  margin: 0, padding: 0, listStyle: "none"
};

const itemStyle: React.CSSProperties = {
  padding: "4px 6px", borderBottom: "1px solid #1f293744",
  fontFamily: "monospace", fontSize: 11, wordBreak: "break-all",
  cursor: "pointer", borderRadius: 3
};

const modStyle: React.CSSProperties = { color: "#a78bfa" };
const typeStyle: React.CSSProperties = { color: "#7bc7ff" };

const emptyStyle: React.CSSProperties = {
  color: "#6b7280", padding: 12, textAlign: "center", fontSize: 11
};

const reseedBtn: React.CSSProperties = {
  marginTop: 12, padding: "6px 12px", fontSize: 12,
  background: "#374151", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer"
};
