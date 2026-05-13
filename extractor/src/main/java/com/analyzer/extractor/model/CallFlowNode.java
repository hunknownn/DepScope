package com.analyzer.extractor.model;

import java.util.List;

/**
 * 호출 흐름 트리의 한 노드. 루트는 사용자가 클릭한 메서드, 자식은 그 안에서 호출된 메서드들.
 * 자식 리스트는 등장 순서대로 (CallSite.order 기준) 정렬되어 있음.
 *
 * @param classFqn   호출 대상 클래스 FQN
 * @param className  simple name (UI 편의)
 * @param method     메서드 이름
 * @param descriptor JVM descriptor
 * @param kind       virtual / static / interface / special / dynamic — 루트는 "root"
 * @param order      부모 안에서 몇 번째 호출인지 (루트는 0)
 * @param line       부모 메서드 내 호출 위치 라인 번호 (루트는 -1, 디버그 정보 없으면 -1)
 * @param recursive  현재 DFS 경로에서 같은 메서드를 다시 만나서 expand 를 멈춤
 * @param external   인덱스에 본문 정보가 없어 더 펼칠 수 없음 (JDK / 라이브러리)
 * @param truncated  depth 제한에 걸려서 자식을 펼치지 않음
 * @param calls      펼친 자식들
 */
public record CallFlowNode(
        String classFqn,
        String className,
        String method,
        String descriptor,
        String kind,
        int order,
        int line,
        boolean recursive,
        boolean external,
        boolean truncated,
        List<CallFlowNode> calls
) {
}
