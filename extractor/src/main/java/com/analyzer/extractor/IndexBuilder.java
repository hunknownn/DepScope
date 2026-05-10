package com.analyzer.extractor;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.function.Predicate;

/**
 * classpath roots 와 패키지 prefix 화이트리스트를 받아 GraphIndex 를 빌드.
 */
public final class IndexBuilder {

    private final List<Path> roots;
    private final List<String> packagePrefixes;

    public IndexBuilder(List<Path> roots, List<String> packagePrefixes) {
        this.roots = roots;
        this.packagePrefixes = packagePrefixes;
    }

    public GraphIndex build() throws IOException {
        GraphIndex idx = new GraphIndex();
        Predicate<String> include = packagePrefixes == null || packagePrefixes.isEmpty()
                ? fqn -> true
                : fqn -> {
                    for (String p : packagePrefixes) if (fqn.startsWith(p)) return true;
                    return false;
                };
        ClassIndexer indexer = new ClassIndexer(idx, include);
        ClassScanner scanner = new ClassScanner(roots);
        scanner.forEachClass((label, bytes) -> {
            try { indexer.index(bytes); }
            catch (Exception e) {
                System.err.println("[skip] " + label + " : " + e.getMessage());
            }
        });
        return idx;
    }
}
