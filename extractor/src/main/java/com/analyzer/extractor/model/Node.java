package com.analyzer.extractor.model;

import java.util.List;

public record Node(
        String id,
        String name,
        String pkg,
        String kind,
        List<String> stereotypes,
        List<MethodInfo> methods,
        List<FieldInfo> fields
) {
}
