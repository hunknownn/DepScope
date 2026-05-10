package com.analyzer.extractor;

import com.analyzer.extractor.model.Node;
import com.analyzer.extractor.model.Relation;
import org.objectweb.asm.AnnotationVisitor;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.FieldVisitor;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;

/**
 * .class 한 개를 ASM 으로 읽어 {@link GraphIndex} 에 노드/엣지 적재.
 * - extends/implements
 * - field type
 * - method signature (param/return)
 * - INVOKE* (CALLS), NEW (NEW)
 * - class-level annotations (ANNOTATED_BY)  ※ stereotype 추출도 같이
 */
public final class ClassIndexer {

    private static final int ASM_API = Opcodes.ASM9;

    private final GraphIndex index;
    private final Predicate<String> includeFqn; // true = 분석/엣지 포함

    public ClassIndexer(GraphIndex index, Predicate<String> includeFqn) {
        this.index = index;
        this.includeFqn = includeFqn;
    }

    public void index(byte[] classBytes) {
        ClassReader cr = new ClassReader(classBytes);
        cr.accept(new Visitor(), ClassReader.SKIP_FRAMES);
    }

    private boolean keep(String fqn) { return includeFqn.test(fqn); }

    private static String fqn(String internalName) {
        return internalName == null ? null : internalName.replace('/', '.');
    }

    private static String simple(String fqn) {
        int i = fqn.lastIndexOf('.');
        return i < 0 ? fqn : fqn.substring(i + 1);
    }

    private static String pkg(String fqn) {
        int i = fqn.lastIndexOf('.');
        return i < 0 ? "" : fqn.substring(0, i);
    }

    private final class Visitor extends ClassVisitor {

        private String thisFqn;
        private String kind;
        private final List<String> stereotypes = new ArrayList<>();

        Visitor() { super(ASM_API); }

        @Override
        public void visit(int version, int access, String name, String signature,
                          String superName, String[] interfaces) {
            this.thisFqn = fqn(name);
            this.kind = (access & Opcodes.ACC_INTERFACE) != 0 ? "interface"
                    : (access & Opcodes.ACC_ENUM) != 0 ? "enum"
                    : (access & Opcodes.ACC_ANNOTATION) != 0 ? "annotation"
                    : "class";

            if (!keep(thisFqn)) { thisFqn = null; return; }

            if (superName != null && !"java/lang/Object".equals(superName)) {
                String s = fqn(superName);
                if (keep(s)) index.addEdge(thisFqn, s, Relation.EXTENDS);
            }
            if (interfaces != null) {
                for (String i : interfaces) {
                    String s = fqn(i);
                    if (keep(s)) index.addEdge(thisFqn, s, Relation.IMPLEMENTS);
                }
            }
        }

        @Override
        public AnnotationVisitor visitAnnotation(String descriptor, boolean visible) {
            if (thisFqn == null) return null;
            String annFqn = fqn(Type.getType(descriptor).getInternalName());
            stereotypes.add(simple(annFqn));
            if (keep(annFqn)) {
                index.addEdge(thisFqn, annFqn, Relation.ANNOTATED_BY);
            }
            return null;
        }

        @Override
        public FieldVisitor visitField(int access, String name, String descriptor,
                                       String signature, Object value) {
            if (thisFqn == null) return null;
            for (String t : referencedTypes(Type.getType(descriptor))) {
                if (keep(t)) index.addEdge(thisFqn, t, Relation.HAS_FIELD);
            }
            return null;
        }

        @Override
        public MethodVisitor visitMethod(int access, String name, String descriptor,
                                         String signature, String[] exceptions) {
            if (thisFqn == null) return null;
            Type m = Type.getMethodType(descriptor);
            for (Type p : m.getArgumentTypes()) {
                for (String t : referencedTypes(p)) {
                    if (keep(t)) index.addEdge(thisFqn, t, Relation.PARAM);
                }
            }
            for (String t : referencedTypes(m.getReturnType())) {
                if (keep(t)) index.addEdge(thisFqn, t, Relation.RETURNS);
            }
            return new MethodBodyVisitor();
        }

        @Override
        public void visitEnd() {
            if (thisFqn == null) return;
            index.putNode(new Node(
                    thisFqn,
                    simple(thisFqn),
                    pkg(thisFqn),
                    kind,
                    new ArrayList<>(new LinkedHashSet<>(stereotypes))
            ));
        }

        /** 메서드 본문: INVOKE* / NEW 명령에서 호출/생성된 타입 수집 */
        private final class MethodBodyVisitor extends MethodVisitor {
            MethodBodyVisitor() { super(ASM_API); }

            @Override
            public void visitMethodInsn(int opcode, String owner, String name,
                                        String descriptor, boolean isInterface) {
                String t = fqn(owner);
                if (t != null && keep(t)) {
                    index.addEdge(thisFqn, t, Relation.CALLS);
                }
            }

            @Override
            public void visitTypeInsn(int opcode, String type) {
                if (opcode == Opcodes.NEW) {
                    String t = fqn(type);
                    if (t != null && keep(t)) {
                        index.addEdge(thisFqn, t, Relation.NEW);
                    }
                }
            }
        }
    }

    /** Type 에서 참조하는 클래스 FQN 들을 추출 (배열 -> 원소, primitive -> 무시) */
    private static Set<String> referencedTypes(Type t) {
        Set<String> out = new LinkedHashSet<>();
        collect(t, out);
        return out;
    }

    private static void collect(Type t, Set<String> out) {
        switch (t.getSort()) {
            case Type.OBJECT -> out.add(t.getClassName());
            case Type.ARRAY -> collect(t.getElementType(), out);
            default -> { /* primitive / void: 무시 */ }
        }
    }
}
