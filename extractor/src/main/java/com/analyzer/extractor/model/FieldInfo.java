package com.analyzer.extractor.model;

import java.util.List;

/**
 * 클래스에 정의된 필드 한 개의 메타데이터.
 *
 * @param name       필드 이름
 * @param type       사람이 읽기 좋은 타입 (예: "java.util.List", "int")
 * @param modifiers  접근 제어자 + final/static 등
 */
public record FieldInfo(
        String name,
        String type,
        List<String> modifiers
) {
}
