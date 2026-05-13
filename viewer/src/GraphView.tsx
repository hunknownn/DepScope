import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import ForceGraph3D, { ForceGraphMethods } from "react-force-graph-3d";
import * as THREE from "three";
import { CallSite, GraphData, GraphLink, GraphNode, Relation } from "./types";

export interface GraphHandle {
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
}

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
  /** 하이라이트의 기준이 된 노드 — highlightedIds 가 활성일 때 항상 포함됨 */
  highlightBaseId?: string;
  width: number;
  height: number;
  devMode?: boolean;
  grabMode?: boolean;
  /** 호출 흐름 시작 클래스 (보통 selectedNode.id) */
  callFlowSource?: string;
  /** 시각화할 호출 시퀀스 — 간선에 순번/파티클로 표시 */
  callFlowCalls?: CallSite[];
}

// 간선 위에 띄울 순번 sprite (호출 흐름 시각화용)
function makeOrderBadgeSprite(orders: number[]): THREE.Sprite {
  // 1-based 표시. 5개 넘으면 축약
  const visible = orders.slice(0, 5).map(o => String(o + 1));
  const text = orders.length > 5 ? visible.join(",") + ",…" : visible.join(",");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const fontSize = 24;
  const font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.font = font;
  const w = ctx.measureText(text).width;
  const padX = 10, padY = 6;
  canvas.width = Math.ceil(w + padX * 2);
  canvas.height = Math.ceil(fontSize + padY * 2);
  // 배경 (호출 흐름 강조용 컬러)
  ctx.fillStyle = "rgba(251, 191, 36, 0.95)";
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 6);
  ctx.fill();
  // 텍스트
  ctx.font = font;
  ctx.fillStyle = "#111827";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture, transparent: true, depthWrite: false, depthTest: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 1000;
  const scale = 0.18;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
  return sprite;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 노드 위에 띄울 텍스트 라벨 sprite 생성
function makeLabelSprite(lines: string[]): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const fontSize = 28;
  const font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.font = font;
  const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const padding = 12;
  canvas.width = Math.ceil(maxW + padding * 2);
  canvas.height = Math.ceil(fontSize * lines.length * 1.2 + padding * 2);
  // 배경
  ctx.fillStyle = "rgba(17, 24, 39, 0.85)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // 텍스트 (canvas 크기 바꾸면 ctx 가 리셋되므로 font 재지정)
  ctx.font = font;
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "top";
  lines.forEach((line, i) => ctx.fillText(line, padding, padding + i * fontSize * 1.2));

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false  // 회전 각도에 따라 다른 노드에 가려지지 않도록
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 999;  // 항상 마지막에 그려서 최상위에 표시
  const scale = 0.12;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
  return sprite;
}

const DIM_COLOR = "#1f2937";

const GraphView = forwardRef<GraphHandle, Props>(function GraphView(
  { data, onNodeSelect, onNodeReseed, highlightedIds, highlightBaseId, width, height, devMode, grabMode,
    callFlowSource, callFlowCalls },
  ref
) {
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);

  // 카메라를 타깃 기준으로 factor 만큼 멀거나 가깝게 이동
  function zoomBy(factor: number) {
    const fg = fgRef.current as any;
    if (!fg) return;
    const camera = fg.camera();
    const controls = fg.controls();
    const target: THREE.Vector3 = controls?.target ?? new THREE.Vector3(0, 0, 0);
    const dir = camera.position.clone().sub(target).multiplyScalar(factor);
    const next = target.clone().add(dir);
    fg.cameraPosition({ x: next.x, y: next.y, z: next.z }, target, 200);
  }

  useImperativeHandle(ref, () => ({
    zoomIn: () => zoomBy(0.8),
    zoomOut: () => zoomBy(1.25),
    fit: () => fgRef.current?.zoomToFit(400, 80)
  }), []);

  // ForceGraph 는 source/target 을 객체 참조로 바꾸기 때문에 매 렌더 새 객체를 넘긴다.
  const graphData = useMemo(() => ({
    nodes: data.nodes.map(n => ({ ...n })),
    links: data.links.map(l => ({ ...l }))
  }), [data]);

  useEffect(() => {
    const t = setTimeout(() => fgRef.current?.zoomToFit(600, 80), 200);
    return () => clearTimeout(t);
  }, [data.seed, data.depth]);

  // 마우스 버튼 매핑:
  //  - 휠 버튼 드래그: 기본 DOLLY(줌) → PAN(이동)
  //  - 좌클릭: grabMode 가 켜져있으면 PAN(이동), 아니면 ROTATE(회전)
  useEffect(() => {
    const t = setTimeout(() => {
      const controls = fgRef.current?.controls?.() as any;
      if (!controls) return;
      controls.mouseButtons = {
        LEFT: grabMode ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.PAN
      };
      controls.zoomSpeed = 1.0;
    }, 0);
    return () => clearTimeout(t);
  }, [grabMode]);

  const hlActive = !!highlightedIds && highlightedIds.size > 0;
  // 하이라이트 활성 시 기준 노드는 항상 포함되도록 판정
  function isHighlighted(id: string): boolean {
    return !!highlightedIds && (highlightedIds.has(id) || id === highlightBaseId);
  }
  // 하이라이트 변경 시 ForceGraph 가 색상/크기 캐시를 새로 계산하도록 트리거
  useEffect(() => {
    fgRef.current?.refresh?.();
  }, [highlightedIds, highlightBaseId]);

  function linkEndpointId(end: string | { id?: string }): string {
    return typeof end === "string" ? end : (end?.id ?? "");
  }

  // 호출 흐름: edge key (source->target) -> 등장 순번들
  const callFlowEdges = useMemo(() => {
    const m = new Map<string, number[]>();
    if (!callFlowSource || !callFlowCalls || callFlowCalls.length === 0) return m;
    for (const cs of callFlowCalls) {
      const key = `${callFlowSource}->${cs.ownerFqn}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(cs.order);
    }
    return m;
  }, [callFlowSource, callFlowCalls]);

  // 호출 흐름 변경 시 ForceGraph 가 linkThreeObject / 파티클을 다시 적용하도록 리프레시
  useEffect(() => {
    fgRef.current?.refresh?.();
  }, [callFlowEdges]);

  function linkKey(l: any): string {
    const s = linkEndpointId(l.source);
    const t = linkEndpointId(l.target);
    return `${s}->${t}`;
  }

  // 노드별 in / out edge 카운트 (devMode 라벨용)
  const edgeCounts = useMemo(() => {
    const m = new Map<string, { in: number; out: number }>();
    for (const n of data.nodes) m.set(n.id, { in: 0, out: 0 });
    for (const l of data.links) {
      const s = linkEndpointId((l as any).source);
      const t = linkEndpointId((l as any).target);
      m.get(s) && m.get(s)!.out++;
      m.get(t) && m.get(t)!.in++;
    }
    return m;
  }, [data]);

  // devMode 토글 시 ForceGraph 가 nodeThreeObject 를 다시 호출하도록 리프레시
  useEffect(() => {
    fgRef.current?.refresh?.();
  }, [devMode]);

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
        return isHighlighted(node.id) ? base : DIM_COLOR;
      }}
      nodeVal={(n: any) => {
        const node = n as GraphNode;
        const baseSize = node.id === data.seed ? 16 : 4;
        if (!hlActive) return baseSize;
        return isHighlighted(node.id) ? baseSize * 2.5 : baseSize;
      }}
      linkColor={(l: any) => {
        const link = l as GraphLink;
        const base = RELATION_COLOR[link.relation] ?? "#666";
        if (!hlActive) return base;
        const s = linkEndpointId((l as any).source);
        const t = linkEndpointId((l as any).target);
        return (isHighlighted(s) || isHighlighted(t)) ? base : DIM_COLOR;
      }}
      linkOpacity={hlActive ? 0.25 : 0.6}
      linkDirectionalArrowLength={3}
      linkDirectionalArrowRelPos={1}

      // 호출 흐름 — 해당 간선에 파티클 애니메이션 (B)
      linkDirectionalParticles={(l: any) => callFlowEdges.has(linkKey(l)) ? 4 : 0}
      linkDirectionalParticleSpeed={0.006}
      linkDirectionalParticleWidth={2.5}
      linkDirectionalParticleColor={() => "#fbbf24"}

      // 호출 흐름 — 간선 중간에 순번 sprite (A)
      linkThreeObjectExtend={true}
      linkThreeObject={(l: any) => {
        const orders = callFlowEdges.get(linkKey(l));
        if (!orders || orders.length === 0) return null as any;
        return makeOrderBadgeSprite(orders);
      }}
      linkPositionUpdate={(sprite: any, { start, end }: any) => {
        if (!sprite) return false;
        sprite.position.set(
          (start.x + end.x) / 2,
          (start.y + end.y) / 2,
          (start.z + end.z) / 2
        );
        return true;
      }}
      onNodeClick={(n: any) => onNodeSelect(n as GraphNode)}
      onNodeRightClick={(n: any) => onNodeReseed(n as GraphNode)}
      // 좌클릭: 디테일 패널 표시 / 우클릭: 그 노드를 새 seed 로

      // dev 모드: 노드 위에 이름 + in/out 카운트 라벨
      // 하이라이트가 활성화된 경우엔 하이라이트된 노드에만 표시
      nodeThreeObjectExtend={true}
      nodeThreeObject={devMode ? ((n: any) => {
        const node = n as GraphNode;
        if (hlActive && !isHighlighted(node.id)) return null;
        const c = edgeCounts.get(node.id) ?? { in: 0, out: 0 };
        const sprite = makeLabelSprite([node.name, `in ${c.in} · out ${c.out}`]);
        const baseSize = node.id === data.seed ? 16 : 4;
        const offsetY = Math.cbrt(baseSize) * 4 + 6;
        sprite.position.set(0, offsetY, 0);
        return sprite;
      }) : (() => null) as any}/>
  );
});

export default GraphView;
