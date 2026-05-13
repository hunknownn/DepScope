package com.analyzer.extractor.model;

/**
 * 메서드 본문 안에서 호출 한 건.
 *
 * @param order      메서드 안에서 등장한 순서 (0 부터, 바이트코드 visit 순서 = 소스 순서)
 * @param ownerFqn   호출 대상 클래스 (선언 타입 기준 — 런타임 dispatch 실제 타깃은 모름)
 * @param name       호출되는 메서드 이름 (생성자는 "&lt;init&gt;")
 * @param descriptor JVM descriptor — 오버로드 식별용 (예: "(Ljava/lang/String;)I")
 * @param kind       호출 종류: "virtual" | "static" | "interface" | "special" | "dynamic" | "new"
 * @param line       호출이 위치한 소스 라인 (디버그 정보 없으면 -1)
 */
public record CallSite(
        int order,
        String ownerFqn,
        String name,
        String descriptor,
        String kind,
        int line
) {
}
