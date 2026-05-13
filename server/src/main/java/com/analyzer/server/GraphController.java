package com.analyzer.server;

import com.analyzer.extractor.BfsExpander;
import com.analyzer.extractor.CallFlowExpander;
import com.analyzer.extractor.GraphIndex;
import com.analyzer.extractor.model.CallFlowNode;
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
import org.springframework.http.ResponseEntity;

@RestController
@CrossOrigin(origins = "*")
public class GraphController {

    private final IndexService indexService;
    private final SourceResolver sourceResolver;

    public GraphController(IndexService indexService, SourceResolver sourceResolver) {
        this.indexService = indexService;
        this.sourceResolver = sourceResolver;
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
                    n.stereotypes(), enriched.methods(), enriched.fields(), enriched.sourceFile()
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
        sourceResolver.invalidate();
        return new ReindexResponse(
                indexService.index().allNodes().size(),
                indexService.currentProjectRoot(),
                indexService.currentClasspath(),
                indexService.currentPackages()
        );
    }

    /**
     * 메서드 단위 호출 흐름 트리. 시드 메서드를 루트로, 본문 안 호출 순서대로 자식을 펼친다.
     *
     * @param seed       클래스 FQN
     * @param method     메서드 이름
     * @param descriptor (옵션) JVM descriptor — 오버로드 식별. 생략 시 첫 번째 매치
     * @param depth      펼침 깊이 (기본 3)
     */
    @GetMapping("/api/call-flow")
    public CallFlowNode callFlow(@RequestParam String seed,
                                 @RequestParam String method,
                                 @RequestParam(required = false) String descriptor,
                                 @RequestParam(defaultValue = "3") int depth) {
        GraphIndex idx = indexService.index();
        return new CallFlowExpander(idx).expand(seed, method, descriptor, depth);
    }

    /**
     * 소스 코드 한 조각 — call-flow v2 행에 표시할 라인 컨텍스트.
     * line 이 0 이하면 빈 결과 (메타데이터 부족).
     */
    @GetMapping("/api/source")
    public SourceResolver.Snippet source(@RequestParam("class") String classFqn,
                                         @RequestParam int line,
                                         @RequestParam(defaultValue = "1") int before,
                                         @RequestParam(defaultValue = "1") int after) throws IOException {
        return sourceResolver.read(classFqn, line, before, after);
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
