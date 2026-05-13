package com.analyzer.server;

import com.analyzer.extractor.GraphIndex;
import com.analyzer.extractor.model.Node;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;

/**
 * FQN → 소스 파일 경로 해석.
 *
 * <p>전략:
 * <ol>
 *   <li>inner class 면 outer 로 변환 ({@code com.Foo$Bar} → {@code com.Foo})</li>
 *   <li>Node.sourceFile 이 있으면 파일명으로 사용, 없으면 {@code <Simple>.java} / {@code <Simple>.kt} 폴백</li>
 *   <li>{@code projectRoot} 아래에서 {@code <pkg as dirs>/<filename>} 으로 끝나는 경로 검색</li>
 *   <li>결과는 캐싱 — reindex 시 외부에서 clear() 호출</li>
 * </ol>
 */
@Service
public class SourceResolver {

    private final IndexService indexService;
    private final Map<String, Path> cache = new ConcurrentHashMap<>();
    /** 캐시 무효화용 sentinel — projectRoot 가 바뀌면 캐시 비우기 */
    private volatile String cachedProjectRoot;

    public SourceResolver(IndexService indexService) {
        this.indexService = indexService;
    }

    /** 라인 범위 추출. line 이 -1 이면 빈 결과. */
    public Snippet read(String classFqn, int line, int contextBefore, int contextAfter) throws IOException {
        if (line < 1) return Snippet.empty();
        Path file = resolve(classFqn);
        if (file == null) return Snippet.empty();
        List<String> all = Files.readAllLines(file);
        int from = Math.max(1, line - contextBefore);
        int to = Math.min(all.size(), line + contextAfter);
        List<String> slice = all.subList(from - 1, to);
        return new Snippet(file.toString(), from, to, line, slice);
    }

    private Path resolve(String classFqn) {
        invalidateIfRootChanged();

        // inner class 정규화 + 캐시 hit
        String outer = stripInner(classFqn);
        Path cached = cache.get(outer);
        if (cached != null) return cached;

        String projectRoot = indexService.currentProjectRoot();
        if (projectRoot == null || projectRoot.isBlank()) return null;
        Path root = Path.of(projectRoot);
        if (!Files.isDirectory(root)) return null;

        // 후보 파일명 결정
        GraphIndex idx = indexService.index();
        Node n = idx.node(outer);
        String filename = (n != null && n.sourceFile() != null) ? n.sourceFile() : null;
        String simple = simpleName(outer);
        String pkgDir = packageName(outer).replace('.', '/');

        List<String> candidates = filename != null
                ? List.of(filename)
                : List.of(simple + ".java", simple + ".kt");

        for (String fn : candidates) {
            // 검색 대상: <projectRoot>/**/<pkgDir>/<fn>
            String suffix = pkgDir.isEmpty() ? fn : (pkgDir + "/" + fn);
            try (Stream<Path> walk = Files.walk(root)) {
                Path found = walk
                        .filter(Files::isRegularFile)
                        .filter(p -> p.toString().replace('\\', '/').endsWith("/" + suffix)
                                  || p.toString().replace('\\', '/').endsWith(suffix))
                        .findFirst()
                        .orElse(null);
                if (found != null) {
                    cache.put(outer, found);
                    return found;
                }
            } catch (IOException e) {
                return null;
            }
        }
        return null;
    }

    public synchronized void invalidate() {
        cache.clear();
        cachedProjectRoot = indexService.currentProjectRoot();
    }

    private void invalidateIfRootChanged() {
        String now = indexService.currentProjectRoot();
        if (now != null && !now.equals(cachedProjectRoot)) {
            cache.clear();
            cachedProjectRoot = now;
        }
    }

    private static String stripInner(String fqn) {
        int i = fqn.indexOf('$');
        return i < 0 ? fqn : fqn.substring(0, i);
    }

    private static String simpleName(String fqn) {
        int i = fqn.lastIndexOf('.');
        return i < 0 ? fqn : fqn.substring(i + 1);
    }

    private static String packageName(String fqn) {
        int i = fqn.lastIndexOf('.');
        return i < 0 ? "" : fqn.substring(0, i);
    }

    public record Snippet(String path, int fromLine, int toLine, int callLine, List<String> lines) {
        static Snippet empty() { return new Snippet(null, 0, 0, 0, List.of()); }
    }
}
