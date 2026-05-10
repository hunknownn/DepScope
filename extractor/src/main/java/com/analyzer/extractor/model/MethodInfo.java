package com.analyzer.extractor.model;

import java.util.List;

/**
 * 클래스에 정의된 메서드 한 개의 시그니처 + 본문 분석 메타데이터.
 *
 * @param name        메서드 이름 (생성자는 "<init>", static initializer 는 제외)
 * @param returnType  사람이 읽기 좋은 반환 타입 (예: "java.lang.String", "int", "void")
 * @param paramTypes  순서 보존된 파라미터 타입 목록
 * @param modifiers   접근 제어자 + 정적/추상 등 (예: ["public", "static"])
 * @param usedTypes   메서드 본문에서 호출(INVOKE*) 또는 생성(NEW)된 클래스 FQN 들 (중복 제거, 등장 순서)
 */
public record MethodInfo(
        String name,
        String returnType,
        List<String> paramTypes,
        List<String> modifiers,
        List<String> usedTypes
) {
}
