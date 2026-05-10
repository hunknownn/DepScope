package com.analyzer.extractor.model;

public record Edge(
        String source,
        String target,
        Relation relation,
        int weight
) {
    public Edge(String source, String target, Relation relation) {
        this(source, target, relation, 1);
    }
}
