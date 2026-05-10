package com.analyzer.extractor;

import com.analyzer.extractor.model.Edge;
import com.analyzer.extractor.model.GraphData;
import com.analyzer.extractor.model.Node;
import com.analyzer.extractor.model.Relation;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * targetFqn 에서 시작해 depth 만큼 양방향(outgoing + incoming) BFS.
 * relations 필터를 통해 특정 관계만 따라갈 수도 있음.
 */
public final class BfsExpander {

    private final GraphIndex index;

    public BfsExpander(GraphIndex index) {
        this.index = index;
    }

    public GraphData expand(String seed, int depth, EnumSet<Relation> allowed) {
        Map<String, Node> nodes = new LinkedHashMap<>();
        Set<EdgeKey> seenEdges = new HashSet<>();
        List<Edge> edges = new ArrayList<>();

        if (index.node(seed) == null) {
            return new GraphData(seed, depth, List.of(), List.of());
        }

        Deque<Frontier> queue = new ArrayDeque<>();
        queue.add(new Frontier(seed, 0));
        Set<String> visited = new HashSet<>();

        while (!queue.isEmpty()) {
            Frontier f = queue.poll();
            if (!visited.add(f.fqn)) continue;
            Node n = index.node(f.fqn);
            if (n != null) nodes.putIfAbsent(n.id(), n);
            if (f.depth >= depth) continue;

            for (Edge e : index.outgoing(f.fqn)) {
                if (allowed != null && !allowed.contains(e.relation())) continue;
                if (seenEdges.add(EdgeKey.of(e))) edges.add(e);
                if (!visited.contains(e.target())) {
                    queue.add(new Frontier(e.target(), f.depth + 1));
                }
            }
            for (Edge e : index.incoming(f.fqn)) {
                if (allowed != null && !allowed.contains(e.relation())) continue;
                if (seenEdges.add(EdgeKey.of(e))) edges.add(e);
                if (!visited.contains(e.source())) {
                    queue.add(new Frontier(e.source(), f.depth + 1));
                }
            }
        }

        for (Edge e : edges) {
            Node ns = index.node(e.source());
            Node nt = index.node(e.target());
            if (ns != null) nodes.putIfAbsent(ns.id(), ns);
            if (nt != null) nodes.putIfAbsent(nt.id(), nt);
        }

        return new GraphData(seed, depth, new ArrayList<>(nodes.values()), edges);
    }

    private record Frontier(String fqn, int depth) {}

    private record EdgeKey(String s, String t, Relation r) {
        static EdgeKey of(Edge e) { return new EdgeKey(e.source(), e.target(), e.relation()); }
    }
}
