package com.analyzer.server;

import com.analyzer.extractor.BfsExpander;
import com.analyzer.extractor.GraphIndex;
import com.analyzer.extractor.model.ColumnInfo;
import com.analyzer.extractor.model.Edge;
import com.analyzer.extractor.model.EntityInfo;
import com.analyzer.extractor.model.GraphData;
import com.analyzer.extractor.model.Node;
import com.analyzer.extractor.model.Relation;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * JPA Entity ERD 전용 API.
 *
 * 일반 그래프 API(GraphController)와 데이터 모델은 같지만,
 *  - Entity / MappedSuperclass / Embeddable 노드만 노출(level 3에선 Spring Data Repository도 포함)
 *  - JPA 관계 / EXTENDS / USES_ENTITY 엣지만 통과
 *  - 양방향 관계(mappedBy)는 주인 방향으로 1개 엣지로 통합
 * 를 강제한다.
 */
@RestController
@CrossOrigin(origins = "*")
public class ErdController {

    private static final EnumSet<Relation> JPA_RELATIONS = EnumSet.of(
            Relation.ONE_TO_MANY, Relation.MANY_TO_ONE,
            Relation.ONE_TO_ONE, Relation.MANY_TO_MANY,
            Relation.EXTENDS
    );

    private final IndexService indexService;

    public ErdController(IndexService indexService) {
        this.indexService = indexService;
    }

    /**
     * ERD 그래프 조회.
     *
     * @param scope "all" (모든 Entity) 또는 "seed" (특정 Entity 중심 BFS). 기본 "all".
     * @param seed  scope=seed 일 때만 사용. Entity FQN.
     * @param depth scope=seed 일 때의 BFS 깊이. 기본 2.
     * @param level 1=관계만, 2=+컬럼·제약, 3=+Repository. 응답 노드의 entity.columns 노출 여부와
     *              USES_ENTITY 엣지/Repository 노드 포함 여부를 결정한다.
     */
    @GetMapping("/api/erd")
    public GraphData erd(@RequestParam(defaultValue = "all") String scope,
                         @RequestParam(required = false) String seed,
                         @RequestParam(defaultValue = "2") int depth,
                         @RequestParam(defaultValue = "1") int level) {
        GraphIndex idx = indexService.index();
        EnumSet<Relation> allowed = EnumSet.copyOf(JPA_RELATIONS);
        if (level >= 3) allowed.add(Relation.USES_ENTITY);

        boolean includeRepos = level >= 3;
        GraphData raw;
        if ("seed".equalsIgnoreCase(scope) && seed != null && !seed.isBlank()) {
            raw = new BfsExpander(idx).expand(seed, Math.max(1, depth), allowed);
        } else {
            raw = collectAll(idx, allowed, includeRepos);
        }

        List<Node> filtered = raw.nodes().stream()
                .filter(n -> n.entity() != null || (includeRepos && isRepositoryNode(idx, n)))
                .map(n -> projectNode(n, level))
                .toList();
        java.util.Set<String> keepIds = new java.util.HashSet<>();
        for (Node n : filtered) keepIds.add(n.id());
        List<Edge> filteredEdges = raw.links().stream()
                .filter(e -> keepIds.contains(e.source()) && keepIds.contains(e.target()))
                .toList();
        List<Edge> dedupedEdges = dropBidirectionalMirrors(filteredEdges);

        return new GraphData(raw.seed(), raw.depth(), filtered, dedupedEdges);
    }

    /**
     * ERD 검색 — Entity 와 (선택적으로) Spring Data Repository 후보.
     *
     * @param includeRepositories true 면 Repository 인터페이스도 후보에 포함.
     *                            뷰어에서 Repository 를 선택하면 그 Repository 의 대상 Entity 를 seed 로 사용한다.
     */
    @GetMapping("/api/erd/search")
    public List<Node> search(@RequestParam String q,
                             @RequestParam(defaultValue = "20") int limit,
                             @RequestParam(defaultValue = "true") boolean includeRepositories) {
        GraphIndex idx = indexService.index();
        String needle = q.toLowerCase();
        return idx.allNodes().stream()
                .filter(n -> n.entity() != null
                        || (includeRepositories && isRepositoryNode(idx, n)))
                .filter(n -> n.id().toLowerCase().contains(needle))
                .sorted(Comparator.comparingInt(n -> n.id().length()))
                .limit(limit)
                .toList();
    }

    /** scope=all: 인덱스 전체에서 ERD 노드를 모으고, 그 사이의 허용 엣지만 수집. */
    private static GraphData collectAll(GraphIndex idx, EnumSet<Relation> allowed, boolean includeRepositories) {
        Map<String, Node> nodes = new LinkedHashMap<>();
        for (Node n : idx.allNodes()) {
            if (n.entity() != null) nodes.put(n.id(), n);
        }
        if (includeRepositories) {
            for (Node n : idx.allNodes()) {
                if (isRepositoryNode(idx, n)) nodes.putIfAbsent(n.id(), n);
            }
        }
        List<Edge> edges = new ArrayList<>();
        for (String id : nodes.keySet()) {
            for (Edge e : idx.outgoing(id)) {
                if (!allowed.contains(e.relation())) continue;
                if (nodes.containsKey(e.target())) edges.add(e);
            }
        }
        return new GraphData("", 0, new ArrayList<>(nodes.values()), edges);
    }

    /**
     * Repository 추정: 이 노드에서 나가는 USES_ENTITY 엣지가 하나라도 있으면 Repository 로 본다.
     * (ClassIndexer 가 Spring Data 상속 패턴에서만 USES_ENTITY 를 만든다.)
     */
    private static boolean isRepositoryNode(GraphIndex idx, Node n) {
        for (Edge e : idx.outgoing(n.id())) {
            if (e.relation() == Relation.USES_ENTITY) return true;
        }
        return false;
    }

    /** level < 2 면 entity.columns 를 비워서 응답 크기를 줄인다. */
    private static Node projectNode(Node n, int level) {
        if (n.entity() == null) return n;
        if (level >= 2) return n;
        EntityInfo stripped = new EntityInfo(n.entity().kind(), n.entity().tableName(), List.<ColumnInfo>of());
        return new Node(n.id(), n.name(), n.pkg(), n.kind(),
                n.stereotypes(), n.methods(), n.fields(), n.sourceFile(), stripped);
    }

    /**
     * 양방향 관계의 비주인 측 엣지를 제거한다.
     * mappedBy 라벨이 부착된 엣지는 비주인 측이고, 같은 클래스 쌍 사이에 주인 측 엣지가 별도로 존재.
     * 단순 휴리스틱: label 에 "mappedBy=" 가 포함된 엣지를 제거.
     */
    private static List<Edge> dropBidirectionalMirrors(List<Edge> edges) {
        List<Edge> out = new ArrayList<>(edges.size());
        for (Edge e : edges) {
            if (e.label() != null && e.label().contains("mappedBy=")) continue;
            out.add(e);
        }
        return out;
    }
}
