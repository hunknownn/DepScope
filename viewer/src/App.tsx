import { useEffect, useRef, useState } from "react";
import { Config, fetchClassDetail, fetchGraph, getConfig, reindex, search } from "./api";
import { CallSite, GraphData, GraphNode, MethodInfo, Relation } from "./types";
import GraphView, { GraphHandle } from "./GraphView";
import NodeDetailPanel from "./NodeDetailPanel";
import CallFlowView from "./CallFlowView";

const ALL_RELATIONS: Relation[] = [
  "EXTENDS", "IMPLEMENTS", "HAS_FIELD", "PARAM",
  "RETURNS", "CALLS", "NEW", "ANNOTATED_BY"
];

const PANEL_W_DEFAULT = 380;
const PANEL_W_MIN = 240;
const PANEL_W_MAX = 720;
const GUTTER = 16;

export default function App() {
  const [query, setQuery] = useState("");
  const [suggests, setSuggests] = useState<GraphNode[]>([]);
  const [seed, setSeed] = useState<string | null>(null);
  const [depth, setDepth] = useState(2);
  const [relations, setRelations] = useState<Relation[]>(ALL_RELATIONS);
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [panelTab, setPanelTab] = useState<"controls" | "detail">("controls");
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [devMode, setDevMode] = useState(false);
  const [grabMode, setGrabMode] = useState(false);
  const [callFlowTarget, setCallFlowTarget] = useState<{ seed: string; method: MethodInfo } | null>(null);
  // 그래프 위에 표시할 호출 시퀀스 (A+B: 간선 순번 + 파티클)
  const [graphCallFlow, setGraphCallFlow] = useState<CallSite[] | null>(null);
  const graphRef = useRef<GraphHandle>(null);

  // 인덱스 설정 패널 (서브 섹션)
  const [config, setConfig] = useState<Config | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [projectRoot, setProjectRoot] = useState("");
  const [classpath, setClasspath] = useState("");
  const [packages, setPackages] = useState("");
  const [reindexing, setReindexing] = useState(false);

  // 좌측 패널 전체 표시 여부 + 너비 (드래그 리사이즈)
  const [panelVisible, setPanelVisible] = useState(true);
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    const saved = localStorage.getItem("panelWidth");
    const n = saved ? Number(saved) : PANEL_W_DEFAULT;
    return Number.isFinite(n) ? Math.min(PANEL_W_MAX, Math.max(PANEL_W_MIN, n)) : PANEL_W_DEFAULT;
  });

  // 드래그 핸들로 패널 너비 조절
  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(PANEL_W_MAX, Math.max(PANEL_W_MIN, startW + (ev.clientX - startX)));
      setPanelWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // 마지막 값 저장
      setPanelWidth(curr => {
        localStorage.setItem("panelWidth", String(curr));
        return curr;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // 윈도우 크기 추적 (그래프 width/height 계산용)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    getConfig().then(c => {
      setConfig(c);
      setProjectRoot(c.projectRoot ?? "");
      setClasspath(c.classpath ?? "");
      setPackages(c.packages ?? "");
      if (c.nodes === 0) setShowConfig(true);
    }).catch(e => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!seed) return;
    fetchGraph(seed, depth, relations)
      .then(setData)
      .catch(e => setError(String(e)));
  }, [seed, depth, relations]);

  // 선택된 노드의 메서드/필드가 비어있으면 서버에서 lazy 보강 (외부/JDK 클래스용)
  useEffect(() => {
    if (!selectedNode) return;
    const hasDetails = (selectedNode.methods?.length ?? 0) > 0
                    || (selectedNode.fields?.length ?? 0) > 0;
    if (hasDetails) return;
    const id = selectedNode.id;
    fetchClassDetail(id).then(n => {
      setSelectedNode(prev => (prev && prev.id === id) ? n : prev);
    }).catch(() => {});
  }, [selectedNode?.id]);

  useEffect(() => {
    const t = setTimeout(() => {
      search(query).then(setSuggests).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  function toggleRelation(r: Relation) {
    setRelations(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  }

  async function handleReindex() {
    setReindexing(true);
    setError(null);
    try {
      const c = await reindex({ projectRoot, classpath, packages });
      setConfig(c);
      if (c.nodes > 0) setShowConfig(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setReindexing(false);
    }
  }

  // 그래프 영역 좌표 계산: 패널이 보이면 그만큼 오른쪽으로 밀기
  const graphLeft = panelVisible ? panelWidth + GUTTER * 2 : 0;
  const graphWidth = Math.max(100, size.w - graphLeft);
  const graphHeight = size.h;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      {/* 패널 토글 (항상 표시) */}
      <button onClick={() => setPanelVisible(v => !v)}
        style={{
          position: "absolute", top: 16, left: 16, zIndex: 20,
          padding: "6px 12px", fontSize: 12, background: "#1f2937", color: "#fff",
          border: "1px solid #374151", borderRadius: 4, cursor: "pointer"
        }}>
        {panelVisible ? "← 패널 숨기기" : "≡ 패널 보이기"}
      </button>

      {/* 좌측 컨트롤 패널 */}
      {panelVisible && (
        <div style={{
          position: "absolute", top: 56, left: 16, zIndex: 10, width: panelWidth,
          background: "#111827cc", padding: 16, borderRadius: 8, backdropFilter: "blur(6px)",
          maxHeight: "calc(100vh - 72px)", overflowY: "auto", boxSizing: "border-box"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>DepScope</h3>
            <button onClick={() => setShowConfig(s => !s)}
              style={btn}>{showConfig ? "닫기" : "인덱스 설정"}</button>
          </div>

          {/* 탭 바: 컨트롤 / 디테일 */}
          <div style={{ display: "flex", gap: 6, marginTop: 12, borderBottom: "1px solid #1f2937" }}>
            <PanelTab active={panelTab === "controls"} onClick={() => setPanelTab("controls")}>
              컨트롤
            </PanelTab>
            <PanelTab active={panelTab === "detail"} onClick={() => setPanelTab("detail")}>
              디테일{selectedNode ? ` · ${selectedNode.name}` : ""}
            </PanelTab>
          </div>

          {panelTab === "controls" && showConfig && (
            <div style={{ marginTop: 12, padding: 12, background: "#0b1020aa", borderRadius: 6 }}>
              <Label>project-root (멀티모듈 자동 탐색)</Label>
              <input value={projectRoot} onChange={e => setProjectRoot(e.target.value)}
                placeholder="/path/to/target-project" style={inputStyle} />

              <Label>classpath (직접 지정, ":" 구분)</Label>
              <textarea value={classpath} onChange={e => setClasspath(e.target.value)}
                placeholder="/p/build/classes/java/main:/p/libs/foo.jar"
                style={{ ...inputStyle, height: 60, fontFamily: "monospace", fontSize: 11 }} />

              <Label>packages (",", 비우면 전체)</Label>
              <input value={packages} onChange={e => setPackages(e.target.value)}
                placeholder="io.example.app,com.shared" style={inputStyle} />

              <button onClick={handleReindex} disabled={reindexing}
                style={{ ...btn, marginTop: 8, background: "#2563eb", color: "#fff",
                         opacity: reindexing ? 0.5 : 1 }}>
                {reindexing ? "indexing..." : "reindex"}
              </button>
              {config && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#9aa5b1" }}>
                  현재 인덱스: <b style={{ color: "#fbbf24" }}>{config.nodes}</b> nodes
                </div>
              )}
            </div>
          )}

          {panelTab === "controls" && (
          <>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="클래스 검색 (FQN 일부)"
            style={{ ...inputStyle, marginTop: 12 }}
          />
          {suggests.length > 0 && query && (
            <div style={{ marginTop: 4, maxHeight: 200, overflowY: "auto",
                          background: "#0b1020aa", borderRadius: 4 }}>
              {suggests.map(n => (
                <div key={n.id}
                  onClick={() => { setSeed(n.id); setQuery(""); setSuggests([]); }}
                  style={{ padding: "4px 8px", cursor: "pointer", borderBottom: "1px solid #1f2937" }}>
                  <div>{n.name}</div>
                  <small style={{ color: "#9aa5b1" }}>{n.pkg}</small>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <label>depth: {depth}</label>
            <input type="range" min={1} max={4} value={depth}
                   onChange={e => setDepth(Number(e.target.value))}
                   style={{ width: "100%" }} />
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: "#9aa5b1", marginBottom: 4 }}>relations</div>
            {ALL_RELATIONS.map(r => (
              <label key={r} style={{ display: "inline-block", marginRight: 8, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={relations.includes(r)}
                  onChange={() => toggleRelation(r)}
                /> {r}
              </label>
            ))}
          </div>

          {seed && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#9aa5b1", wordBreak: "break-all" }}>
              seed: <span style={{ color: "#fbbf24" }}>{seed}</span>
              {data && <> · {data.nodes.length} nodes / {data.links.length} edges</>}
            </div>
          )}
          {error && <div style={{ color: "#ef4444", marginTop: 8 }}>{error}</div>}
          <div style={{ marginTop: 12, fontSize: 11, color: "#6b7280" }}>
            노드 좌클릭 → 디테일 탭 · 우클릭 → 그 노드를 새 seed 로
          </div>
          </>
          )}

          {panelTab === "detail" && (
            <div style={{ marginTop: 12 }}>
              {selectedNode ? (
                <NodeDetailPanel
                  node={selectedNode}
                  onReseed={(id) => { setSeed(id); setPanelTab("controls"); }}
                  onHover={(ids) => setHighlightedIds(new Set(ids))}
                  onShowCallFlow={(m) => setCallFlowTarget({ seed: selectedNode.id, method: m })}
                  onSetCallFlow={(calls) => setGraphCallFlow(calls)}
                />
              ) : (
                <div style={{ color: "#6b7280", padding: 12, textAlign: "center", fontSize: 11 }}>
                  노드를 좌클릭하면 메서드/필드가 여기에 표시됩니다.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 패널 리사이즈 핸들 — 패널 오른쪽 가장자리에 세로 막대 */}
      {panelVisible && (
        <div
          onMouseDown={startResize}
          title="드래그해서 패널 너비 조절"
          style={{
            position: "absolute", top: 56, left: 16 + panelWidth, zIndex: 11,
            width: 6, height: "calc(100vh - 72px)",
            cursor: "ew-resize",
            background: "transparent"
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#3b82f6aa")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        />
      )}

      {/* 그래프 — 패널 오른쪽 영역의 한가운데에 위치 */}
      {data && (
        <div style={{
          position: "absolute", top: 0, left: graphLeft,
          width: graphWidth, height: graphHeight,
          cursor: grabMode ? "grab" : "auto"
        }}>
          <GraphView
            ref={graphRef}
            data={data}
            width={graphWidth}
            height={graphHeight}
            highlightedIds={highlightedIds}
            highlightBaseId={selectedNode?.id}
            devMode={devMode}
            grabMode={grabMode}
            callFlowSource={graphCallFlow ? selectedNode?.id : undefined}
            callFlowCalls={graphCallFlow ?? undefined}
            onNodeSelect={n => { setSelectedNode(n); setPanelTab("detail"); }}
            onNodeReseed={n => { setSeed(n.id); setSelectedNode(null); setPanelTab("controls"); }}
          />
        </div>
      )}

      {/* 하단 중앙 줌/맞춤 컨트롤 (Figma 스타일) */}
      {data && (
        <div style={{
          position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 20,
          display: "flex", gap: 4, padding: 4,
          background: "#111827cc", borderRadius: 6, backdropFilter: "blur(6px)",
          border: "1px solid #1f2937"
        }}>
          <ZoomBtn onClick={() => graphRef.current?.zoomOut()} title="줌 아웃">−</ZoomBtn>
          <ZoomBtn onClick={() => graphRef.current?.zoomIn()} title="줌 인">+</ZoomBtn>
          <ZoomBtn onClick={() => graphRef.current?.fit()} title="전체 보기">⤢</ZoomBtn>
          <ZoomBtn onClick={() => setGrabMode(v => !v)}
                   title={grabMode ? "grab 끄기 (좌클릭 = 회전)" : "grab 켜기 (좌클릭 = 이동)"}
                   active={grabMode}>✋</ZoomBtn>
          <div style={{ width: 1, background: "#1f2937", margin: "4px 2px" }} />
          <ZoomBtn onClick={() => setDevMode(v => !v)}
                   title={devMode ? "dev 모드 끄기" : "dev 모드: 노드 이름 / in·out 카운트 표시"}
                   active={devMode}>{"</>"}</ZoomBtn>
        </div>
      )}

      {/* 호출 흐름 오버레이 */}
      {callFlowTarget && (
        <CallFlowView
          seed={callFlowTarget.seed}
          method={callFlowTarget.method.name}
          descriptor={callFlowTarget.method.descriptor}
          onClose={() => setCallFlowTarget(null)}
        />
      )}
    </div>
  );
}

function ZoomBtn({ children, onClick, title, active }: {
  children: React.ReactNode; onClick: () => void; title: string; active?: boolean;
}) {
  const baseBg = active ? "#2563eb" : "transparent";
  const hoverBg = active ? "#1d4ed8" : "#1f2937";
  return (
    <button onClick={onClick} title={title}
      style={{
        width: 32, height: 32, fontSize: 14, lineHeight: 1,
        background: baseBg, color: "#fff",
        border: "none", borderRadius: 4, cursor: "pointer",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
      }}
      onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
      onMouseLeave={e => (e.currentTarget.style.background = baseBg)}
    >{children}</button>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: 8, background: "#1f2937", color: "#fff",
  border: "1px solid #374151", borderRadius: 4, boxSizing: "border-box", marginBottom: 4
};

const btn: React.CSSProperties = {
  padding: "4px 10px", fontSize: 12, background: "#374151", color: "#fff",
  border: "none", borderRadius: 4, cursor: "pointer"
};

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: "#9aa5b1", marginTop: 8, marginBottom: 2 }}>{children}</div>;
}

function PanelTab({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px", fontSize: 12, cursor: "pointer",
        background: "transparent", color: active ? "#fff" : "#9aa5b1",
        border: "none", borderBottom: active ? "2px solid #2563eb" : "2px solid transparent",
        marginBottom: -1
      }}>
      {children}
    </button>
  );
}
