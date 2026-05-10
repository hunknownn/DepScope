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
