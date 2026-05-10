package com.analyzer.server;

import com.analyzer.extractor.BfsExpander;
import com.analyzer.extractor.GraphIndex;
import com.analyzer.extractor.model.GraphData;
import com.analyzer.extractor.model.Node;
import com.analyzer.extractor.model.Relation;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;

@RestController
@CrossOrigin(origins = "*")
public class GraphController {

    private final IndexService indexService;

    public GraphController(IndexService indexService) {
        this.indexService = indexService;
    }

    @GetMapping("/api/graph")
    public GraphData graph(@RequestParam String seed,
                           @RequestParam(defaultValue = "1") int depth,
                           @RequestParam(required = false) String relations) {
        GraphIndex idx = indexService.index();
        EnumSet<Relation> allowed = parseRelations(relations);
        return new BfsExpander(idx).expand(seed, depth, allowed);
    }

    /**
     * 단일 클래스 디테일 조회. 인덱스에 메서드/필드 정보가 없는 외부 클래스(JDK 등)는
     * JVM 클래스로더 기반 리플렉션으로 보강해 반환.
     */
    @GetMapping("/api/class")
    public Node classDetail(@RequestParam String id) {
        GraphIndex idx = indexService.index();
        Node n = idx.node(id);
        boolean hasDetails = n != null
                && ((n.methods() != null && !n.methods().isEmpty())
                    || (n.fields() != null && !n.fields().isEmpty()));
        if (hasDetails) return n;

        Node enriched = ReflectionInspector.tryInspect(id);
        if (enriched == null) {
            return n; // 인덱스 placeholder 그대로 (methods/fields 비어있음)
        }
        // 인덱스 stereotype 정보가 있으면 보존
        if (n != null && n.stereotypes() != null && !n.stereotypes().isEmpty()) {
            return new Node(
                    enriched.id(), enriched.name(), enriched.pkg(), enriched.kind(),
                    n.stereotypes(), enriched.methods(), enriched.fields()
            );
        }
        return enriched;
    }

    @GetMapping("/api/search")
    public List<Node> search(@RequestParam String q,
                             @RequestParam(defaultValue = "20") int limit) {
        String needle = q.toLowerCase();
        return indexService.index().allNodes().stream()
                .filter(n -> n.id().toLowerCase().contains(needle))
                .sorted(Comparator.comparingInt(n -> n.id().length()))
                .limit(limit)
                .toList();
    }

    /**
     * 인덱스 재빌드.
     *  - 바디 없이 호출: 마지막 설정으로 재빌드 (타깃 코드만 새로 빌드된 경우)
     *  - 바디 포함: 새 설정으로 재빌드 (분석 대상 자체 변경)
     */
    @PostMapping("/api/reindex")
    public ReindexResponse reindex(@RequestBody(required = false) ReindexRequest req) throws IOException {
        if (req == null || req.isEmpty()) {
            indexService.reindex();
        } else {
            indexService.reindex(req.classpath(), req.packages(), req.projectRoot());
        }
        return new ReindexResponse(
                indexService.index().allNodes().size(),
                indexService.currentProjectRoot(),
                indexService.currentClasspath(),
                indexService.currentPackages()
        );
    }

    /** 현재 적용된 설정 조회 (뷰어가 시작 시 표시용) */
    @GetMapping("/api/config")
    public ReindexResponse config() {
        return new ReindexResponse(
                indexService.index().allNodes().size(),
                indexService.currentProjectRoot(),
                indexService.currentClasspath(),
                indexService.currentPackages()
        );
    }

    private static EnumSet<Relation> parseRelations(String csv) {
        if (csv == null || csv.isBlank()) return EnumSet.allOf(Relation.class);
        EnumSet<Relation> set = EnumSet.noneOf(Relation.class);
        for (String s : csv.split(",")) {
            try { set.add(Relation.valueOf(s.trim().toUpperCase())); }
            catch (IllegalArgumentException ignore) {}
        }
        return set.isEmpty() ? EnumSet.allOf(Relation.class) : set;
    }

    public record ReindexRequest(String projectRoot, String classpath, String packages) {
        boolean isEmpty() {
            return blank(projectRoot) && blank(classpath) && blank(packages);
        }
        private static boolean blank(String s) { return s == null || s.isBlank(); }
    }

    public record ReindexResponse(int nodes, String projectRoot, String classpath, String packages) {}
}
