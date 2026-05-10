package com.analyzer.extractor;

import com.analyzer.extractor.model.Edge;
import com.analyzer.extractor.model.Node;
import com.analyzer.extractor.model.Relation;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * FQN -> Node, FQN -> outgoing/incoming edges 양방향 인접 인덱스.
 * 외부 라이브러리 타입(JDK 등)은 노드는 placeholder 로 만들고, 필터에서 거를 수 있게 한다.
 */
public final class GraphIndex {

    private final Map<String, Node> nodes = new ConcurrentHashMap<>();
    private final Map<String, List<Edge>> outgoing = new ConcurrentHashMap<>();
    private final Map<String, List<Edge>> incoming = new ConcurrentHashMap<>();

    public synchronized void putNode(Node n) {
        // 더 풍부한 노드(stereotype/메서드/필드 보유)를 우선
        nodes.merge(n.id(), n, (existing, incoming) -> richer(existing) ? existing : incoming);
    }

    private static boolean richer(Node n) {
        return (n.stereotypes() != null && !n.stereotypes().isEmpty())
                || (n.methods() != null && !n.methods().isEmpty())
                || (n.fields() != null && !n.fields().isEmpty());
    }

    public synchronized void addEdge(String source, String target, Relation rel) {
        if (source.equals(target)) return; // self-edge 제거
        Edge e = new Edge(source, target, rel);
        outgoing.computeIfAbsent(source, k -> new ArrayList<>()).add(e);
        incoming.computeIfAbsent(target, k -> new ArrayList<>()).add(e);
        nodes.putIfAbsent(target, placeholderNode(target));
        nodes.putIfAbsent(source, placeholderNode(source));
    }

    public Node node(String fqn) {
        return nodes.get(fqn);
    }

    public Collection<Node> allNodes() { return nodes.values(); }

    public List<Edge> outgoing(String fqn) {
        return outgoing.getOrDefault(fqn, List.of());
    }

    public List<Edge> incoming(String fqn) {
        return incoming.getOrDefault(fqn, List.of());
    }

    public Set<String> keys() { return nodes.keySet(); }

    private static Node placeholderNode(String fqn) {
        int idx = fqn.lastIndexOf('.');
        String name = idx < 0 ? fqn : fqn.substring(idx + 1);
        String pkg = idx < 0 ? "" : fqn.substring(0, idx);
        return new Node(fqn, name, pkg, "external", List.of(), List.of(), List.of());
    }
}
