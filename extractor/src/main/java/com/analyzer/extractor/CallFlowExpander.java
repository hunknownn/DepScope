package com.analyzer.extractor;

import com.analyzer.extractor.model.CallFlowNode;
import com.analyzer.extractor.model.CallSite;
import com.analyzer.extractor.model.MethodInfo;
import com.analyzer.extractor.model.Node;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 메서드를 시드로 호출 흐름 트리를 빌드한다.
 *
 * <p>전제: ClassIndexer 가 MethodInfo.calls 에 본문의 호출 시퀀스를 등장 순서대로 채워둠.
 * 따라서 사이클(재귀)이 없으면 트리이고, 분기/루프는 단순 선형화된 형태로 펼쳐진다.</p>
 *
 * <ul>
 *   <li>같은 메서드를 현재 DFS 경로에서 다시 만나면 {@code recursive=true} 로 표시하고 멈춘다.</li>
 *   <li>인덱스에 본문이 없는 클래스(외부/JDK) 호출은 {@code external=true} 리프로 표시.</li>
 *   <li>{@code maxDepth} 초과 시 {@code truncated=true} 로 멈춘다.</li>
 * </ul>
 */
public final class CallFlowExpander {

    private final GraphIndex index;

    public CallFlowExpander(GraphIndex index) {
        this.index = index;
    }

    /** descriptor 가 null 이면 이름만으로 첫 매치 */
    public CallFlowNode expand(String classFqn, String methodName, String descriptor, int maxDepth) {
        MethodInfo root = findMethod(classFqn, methodName, descriptor);
        if (root == null) {
            throw new IllegalArgumentException(
                    "method not found: " + classFqn + "#" + methodName
                            + (descriptor == null ? "" : descriptor)
            );
        }
        Set<String> pathKeys = new HashSet<>();
        return buildTree(classFqn, root, "root", 0, -1, maxDepth, pathKeys);
    }

    private CallFlowNode buildTree(
            String classFqn,
            MethodInfo method,
            String kind,
            int order,
            int line,
            int remainingDepth,
            Set<String> pathKeys
    ) {
        String key = methodKey(classFqn, method.name(), method.descriptor());
        if (pathKeys.contains(key)) {
            return leaf(classFqn, method.name(), method.descriptor(), kind, order, line,
                    /*recursive=*/ true, /*external=*/ false, /*truncated=*/ false);
        }

        if (remainingDepth <= 0) {
            return leaf(classFqn, method.name(), method.descriptor(), kind, order, line,
                    false, false, /*truncated=*/ true);
        }

        pathKeys.add(key);
        List<CallFlowNode> children = new ArrayList<>(method.calls().size());
        for (CallSite cs : method.calls()) {
            MethodInfo callee = findMethod(cs.ownerFqn(), cs.name(), cs.descriptor());
            if (callee == null) {
                children.add(leaf(
                        cs.ownerFqn(), cs.name(), cs.descriptor(), cs.kind(), cs.order(), cs.line(),
                        false, /*external=*/ true, false
                ));
            } else {
                children.add(buildTree(
                        cs.ownerFqn(), callee, cs.kind(), cs.order(), cs.line(),
                        remainingDepth - 1, pathKeys
                ));
            }
        }
        pathKeys.remove(key);

        return new CallFlowNode(
                classFqn, simple(classFqn),
                method.name(), method.descriptor(), kind,
                order, line, false, false, false,
                List.copyOf(children)
        );
    }

    private MethodInfo findMethod(String classFqn, String methodName, String descriptor) {
        Node n = index.node(classFqn);
        if (n == null || n.methods() == null) return null;
        // 1차: name + descriptor 정확 매치
        if (descriptor != null) {
            for (MethodInfo m : n.methods()) {
                if (m.name().equals(methodName) && descriptor.equals(m.descriptor())) return m;
            }
        }
        // 2차: name 만 매치 (오버로드 무시, 첫 번째)
        for (MethodInfo m : n.methods()) {
            if (m.name().equals(methodName)) return m;
        }
        return null;
    }

    private static CallFlowNode leaf(
            String classFqn, String method, String descriptor, String kind, int order, int line,
            boolean recursive, boolean external, boolean truncated
    ) {
        return new CallFlowNode(
                classFqn, simple(classFqn),
                method, descriptor, kind, order, line,
                recursive, external, truncated,
                List.of()
        );
    }

    private static String methodKey(String classFqn, String name, String descriptor) {
        return classFqn + "#" + name + (descriptor == null ? "" : descriptor);
    }

    private static String simple(String fqn) {
        int i = fqn.lastIndexOf('.');
        return i < 0 ? fqn : fqn.substring(i + 1);
    }
}
