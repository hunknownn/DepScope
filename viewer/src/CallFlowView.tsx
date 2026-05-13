import { useEffect, useState } from "react";
import { CallFlowNode, SourceSnippet } from "./types";
import { fetchCallFlow, fetchSource } from "./api";

interface Props {
  seed: string;
  method: string;
  descriptor: string;
  onClose: () => void;
}

type Version = "v1" | "v2";

export default function CallFlowView({ seed, method, descriptor, onClose }: Props) {
  const [depth, setDepth] = useState(3);
  const [version, setVersion] = useState<Version>("v1");
  const [tree, setTree] = useState<CallFlowNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchCallFlow(seed, method, descriptor, depth)
      .then(t => { setTree(t); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [seed, method, descriptor, depth]);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "#9aa5b1" }}>호출 흐름</div>
            <div style={{ fontWeight: 600, wordBreak: "break-all" }}>
              {shortFqn(seed)}<span style={{ color: "#9aa5b1" }}>.</span>{method}
              <span style={{ color: "#9aa5b1", fontWeight: 400 }}>{descriptor}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <div style={{ display: "inline-flex", border: "1px solid #374151", borderRadius: 4, overflow: "hidden" }}>
              <VersionBtn active={version === "v1"} onClick={() => setVersion("v1")}>v1 트리</VersionBtn>
              <VersionBtn active={version === "v2"} onClick={() => setVersion("v2")}>v2 코드</VersionBtn>
            </div>
            <label style={{ fontSize: 12, color: "#9aa5b1" }}>
              depth
              <input type="range" min={1} max={6} value={depth}
                onChange={e => setDepth(Number(e.target.value))}
                style={{ marginLeft: 8, verticalAlign: "middle" }} />
              <span style={{ marginLeft: 6, color: "#fff", display: "inline-block", width: 12 }}>{depth}</span>
            </label>
            <button onClick={onClose} style={closeBtnStyle}>닫기</button>
          </div>
        </div>

        <div style={legendStyle}>
          <Legend color="#fbbf24" label="root" />
          <Legend color="#cbd5e1" label="내부 호출" />
          <Legend color="#9aa5b1" label="external (펼침 불가)" />
          <Legend color="#f472b6" label="recursive" />
          <Legend color="#a78bfa" label="truncated (depth 초과)" />
        </div>

        <div style={bodyStyle}>
          {loading && <div style={infoStyle}>로딩...</div>}
          {error && <div style={errorStyle}>{error}</div>}
          {tree && !loading && !error && (
            version === "v1"
              ? <TreeNode node={tree} indent={0} isRoot />
              : <TreeNodeV2 node={tree} parentClassFqn={null} indent={0} isRoot />
          )}
        </div>
      </div>
    </div>
  );
}

function TreeNode({ node, indent, isRoot }: { node: CallFlowNode; indent: number; isRoot?: boolean }) {
  const color = isRoot ? "#fbbf24"
              : node.recursive ? "#f472b6"
              : node.truncated ? "#a78bfa"
              : node.external ? "#9aa5b1"
              : "#cbd5e1";

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 8,
        paddingLeft: indent * 20, paddingTop: 2, paddingBottom: 2,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12,
        borderLeft: indent > 0 ? "1px solid #1f2937" : "none"
      }}>
        {!isRoot && (
          <span style={{ color: "#6b7280", minWidth: 24, fontSize: 11 }}>
            {node.order}.
          </span>
        )}
        <span style={{ color: "#7bc7ff" }}>{node.className}</span>
        <span style={{ color: "#9aa5b1" }}>.</span>
        <span style={{ color }}>{node.method}</span>
        <span style={{ color: "#6b7280", fontSize: 11 }}>{shortDescriptor(node.descriptor)}</span>
        {node.recursive && <Tag color="#f472b6">recursive</Tag>}
        {node.truncated && <Tag color="#a78bfa">⋯ depth 초과</Tag>}
        {node.external && <Tag color="#475569">external</Tag>}
        {!isRoot && node.kind && node.kind !== "virtual" && (
          <Tag color="#374151">{node.kind}</Tag>
        )}
      </div>
      {node.calls.map((c, i) => (
        <TreeNode key={i} node={c} indent={indent + 1} />
      ))}
    </div>
  );
}

/**
 * v2: v1 트리와 동일한 구조 + 각 행 아래에 부모 메서드의 코드 라인 표시.
 * - 루트: 부모가 없어 코드 미리보기 없음 (메서드 시그니처는 모달 헤더에 이미 표시됨)
 * - 자식: 부모(parentClassFqn) 의 소스에서 node.line 주변 라인을 가져옴
 */
function TreeNodeV2({
  node, parentClassFqn, indent, isRoot
}: {
  node: CallFlowNode; parentClassFqn: string | null; indent: number; isRoot?: boolean;
}) {
  const color = isRoot ? "#fbbf24"
              : node.recursive ? "#f472b6"
              : node.truncated ? "#a78bfa"
              : node.external ? "#9aa5b1"
              : "#cbd5e1";
  return (
    <div>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 8,
        paddingLeft: indent * 20, paddingTop: 2, paddingBottom: 2,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12,
        borderLeft: indent > 0 ? "1px solid #1f2937" : "none"
      }}>
        {!isRoot && (
          <span style={{ color: "#6b7280", minWidth: 24, fontSize: 11 }}>
            {node.order}.
          </span>
        )}
        <span style={{ color: "#7bc7ff" }}>{node.className}</span>
        <span style={{ color: "#9aa5b1" }}>.</span>
        <span style={{ color }}>{node.method}</span>
        <span style={{ color: "#6b7280", fontSize: 11 }}>{shortDescriptor(node.descriptor)}</span>
        {node.line > 0 && !isRoot && (
          <span style={{ color: "#6b7280", fontSize: 10 }}>L{node.line}</span>
        )}
        {node.recursive && <Tag color="#f472b6">recursive</Tag>}
        {node.truncated && <Tag color="#a78bfa">⋯ depth 초과</Tag>}
        {node.external && <Tag color="#475569">external</Tag>}
      </div>
      {/* 코드 미리보기: 부모의 소스에서 node.line 주변 */}
      {!isRoot && parentClassFqn && node.line > 0 && (
        <CodeSnippet classFqn={parentClassFqn} line={node.line} indent={indent} />
      )}
      {node.calls.map((c, i) => (
        <TreeNodeV2 key={i} node={c} parentClassFqn={node.classFqn} indent={indent + 1} />
      ))}
    </div>
  );
}

function CodeSnippet({ classFqn, line, indent }: { classFqn: string; line: number; indent: number }) {
  const [snippet, setSnippet] = useState<SourceSnippet | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchSource(classFqn, line, expanded ? 5 : 1, expanded ? 5 : 1)
      .then(setSnippet)
      .catch(() => setSnippet(null));
  }, [classFqn, line, expanded]);

  if (!snippet || snippet.lines.length === 0) {
    return (
      <div style={{ paddingLeft: indent * 20 + 32, fontSize: 11, color: "#6b7280", paddingBottom: 4 }}>
        (소스 찾을 수 없음)
      </div>
    );
  }

  return (
    <div style={{
      paddingLeft: indent * 20 + 32, paddingRight: 8, paddingBottom: 6
    }}>
      <pre
        onClick={() => setExpanded(v => !v)}
        title={expanded ? "접기" : "더 보기"}
        style={{
          margin: 0, padding: "6px 10px",
          background: "#0f172a", border: "1px solid #1f2937", borderRadius: 4,
          color: "#cbd5e1", fontSize: 11, lineHeight: 1.5,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          overflowX: "auto", cursor: "pointer", whiteSpace: "pre"
        }}>
        {snippet.lines.map((ln, i) => {
          const lineNo = snippet.fromLine + i;
          const isCallLine = lineNo === snippet.callLine;
          return (
            <div key={lineNo} style={{
              background: isCallLine ? "#1f293788" : "transparent",
              borderLeft: isCallLine ? "2px solid #fbbf24" : "2px solid transparent",
              paddingLeft: 6, marginLeft: -6
            }}>
              <span style={{ color: "#6b7280", marginRight: 10, userSelect: "none" }}>
                {String(lineNo).padStart(4, " ")}
              </span>
              {ln || " "}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

function VersionBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      style={{
        padding: "4px 10px", fontSize: 11, border: "none",
        background: active ? "#2563eb" : "transparent",
        color: active ? "#fff" : "#9aa5b1",
        cursor: "pointer"
      }}>
      {children}
    </button>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      fontSize: 10, padding: "1px 6px", borderRadius: 8,
      background: color + "55", color: "#fff", border: `1px solid ${color}`
    }}>{children}</span>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#9aa5b1" }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
      {label}
    </span>
  );
}

function shortFqn(fqn: string): string {
  // com.example.foo.Bar -> c.e.f.Bar
  const parts = fqn.split(".");
  if (parts.length <= 2) return fqn;
  const last = parts[parts.length - 1];
  const head = parts.slice(0, -1).map(p => p[0]).join(".");
  return `${head}.${last}`;
}

/** "(Ljava/lang/String;I)V" → "(String, int): void" 정도로 압축 */
function shortDescriptor(d: string): string {
  if (!d) return "";
  const m = d.match(/^\((.*)\)(.*)$/);
  if (!m) return d;
  const params = parseDescTypes(m[1]).map(simple).join(", ");
  const ret = simple(parseDescTypes(m[2])[0] ?? "void");
  return `(${params})${ret === "void" ? "" : ": " + ret}`;
}

function parseDescTypes(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    let arr = "";
    while (s[i] === "[") { arr += "[]"; i++; }
    const c = s[i];
    if (c === "L") {
      const end = s.indexOf(";", i);
      out.push(s.substring(i + 1, end).replace(/\//g, ".") + arr);
      i = end + 1;
    } else {
      const prim = ({
        V: "void", Z: "boolean", B: "byte", C: "char", S: "short",
        I: "int", J: "long", F: "float", D: "double"
      } as Record<string, string>)[c] ?? c;
      out.push(prim + arr);
      i++;
    }
  }
  return out;
}

function simple(t: string): string {
  if (!t) return t;
  const arr = t.match(/(\[\])+$/)?.[0] ?? "";
  const base = t.replace(/(\[\])+$/, "");
  const i = base.lastIndexOf(".");
  return (i < 0 ? base : base.substring(i + 1)) + arr;
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 100,
  background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 32
};

const modalStyle: React.CSSProperties = {
  width: "min(900px, 100%)", maxHeight: "100%",
  background: "#0b1020", color: "#e5e7eb",
  border: "1px solid #1f2937", borderRadius: 8,
  display: "flex", flexDirection: "column", overflow: "hidden"
};

const headerStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  padding: "16px 20px", borderBottom: "1px solid #1f2937", gap: 16
};

const legendStyle: React.CSSProperties = {
  padding: "8px 20px", display: "flex", flexWrap: "wrap", gap: 12,
  borderBottom: "1px solid #1f2937", background: "#111827"
};

const bodyStyle: React.CSSProperties = {
  padding: 16, overflowY: "auto", flex: 1
};

const closeBtnStyle: React.CSSProperties = {
  padding: "4px 12px", fontSize: 12, background: "#1f2937", color: "#fff",
  border: "1px solid #374151", borderRadius: 4, cursor: "pointer"
};

const infoStyle: React.CSSProperties = { color: "#9aa5b1", padding: 12, textAlign: "center", fontSize: 12 };
const errorStyle: React.CSSProperties = { color: "#ef4444", padding: 12, fontSize: 12 };
