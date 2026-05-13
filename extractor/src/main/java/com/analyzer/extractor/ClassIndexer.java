package com.analyzer.extractor;

import com.analyzer.extractor.model.CallSite;
import com.analyzer.extractor.model.FieldInfo;
import com.analyzer.extractor.model.MethodInfo;
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
        private String sourceFile; // 예: "ClassIndexer.java"
        private final List<String> stereotypes = new ArrayList<>();
        private final List<MethodInfo> methods = new ArrayList<>();
        private final List<FieldInfo> fields = new ArrayList<>();

        Visitor() { super(ASM_API); }

        @Override
        public void visitSource(String source, String debug) {
            this.sourceFile = source; // 예: "ClassIndexer.java"
        }

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
            // 컴파일러가 만든 합성 필드(this$0 등)는 표시 목록에서 제외
            if ((access & Opcodes.ACC_SYNTHETIC) == 0) {
                fields.add(new FieldInfo(
                        name,
                        Type.getType(descriptor).getClassName(),
                        modifiers(access)
                ));
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
            // <clinit> / 합성/브릿지 메서드는 사람이 보기엔 노이즈라 MethodInfo 등록 제외 (엣지는 계속 수집)
            boolean noise = "<clinit>".equals(name)
                    || (access & (Opcodes.ACC_SYNTHETIC | Opcodes.ACC_BRIDGE)) != 0;
            return new MethodBodyVisitor(noise ? null : name, descriptor, access);
        }

        @Override
        public void visitEnd() {
            if (thisFqn == null) return;
            index.putNode(new Node(
                    thisFqn,
                    simple(thisFqn),
                    pkg(thisFqn),
                    kind,
                    new ArrayList<>(new LinkedHashSet<>(stereotypes)),
                    List.copyOf(methods),
                    List.copyOf(fields),
                    sourceFile
            ));
        }

        /**
         * 메서드 본문: INVOKE* / NEW 명령에서 호출/생성된 타입 수집.
         * methodName 이 null 이면 noise 메서드라 MethodInfo 는 등록하지 않고 엣지만 추가.
         */
        private final class MethodBodyVisitor extends MethodVisitor {
            private final String methodName;       // null 이면 MethodInfo 미등록
            private final String methodDescriptor;
            private final int methodAccess;
            private final Set<String> usedTypes = new LinkedHashSet<>();
            private final List<CallSite> calls = new ArrayList<>();
            private int currentLine = -1;
            private int startLine = -1; // 메서드 첫 라인

            MethodBodyVisitor(String methodName, String methodDescriptor, int methodAccess) {
                super(ASM_API);
                this.methodName = methodName;
                this.methodDescriptor = methodDescriptor;
                this.methodAccess = methodAccess;
            }

            @Override
            public void visitLineNumber(int line, org.objectweb.asm.Label start) {
                this.currentLine = line;
                if (this.startLine < 0 || line < this.startLine) this.startLine = line;
            }

            @Override
            public void visitMethodInsn(int opcode, String owner, String name,
                                        String descriptor, boolean isInterface) {
                String t = fqn(owner);
                if (t != null && keep(t)) {
                    index.addEdge(thisFqn, t, Relation.CALLS);
                    usedTypes.add(t);
                }
                // CallSite 는 외부 클래스 (keep=false) 도 기록 — 호출 흐름 시각화는 외부 호출도 보여줘야 함
                if (t != null && methodName != null) {
                    calls.add(new CallSite(calls.size(), t, name, descriptor, invokeKind(opcode), currentLine));
                }
            }

            @Override
            public void visitTypeInsn(int opcode, String type) {
                if (opcode == Opcodes.NEW) {
                    String t = fqn(type);
                    if (t != null && keep(t)) {
                        index.addEdge(thisFqn, t, Relation.NEW);
                        usedTypes.add(t);
                    }
                }
            }

            @Override
            public void visitEnd() {
                if (methodName == null) return; // noise 메서드: MethodInfo 등록 생략
                Type m = Type.getMethodType(methodDescriptor);
                List<String> paramTypes = new ArrayList<>(m.getArgumentTypes().length);
                for (Type p : m.getArgumentTypes()) paramTypes.add(p.getClassName());
                methods.add(new MethodInfo(
                        methodName,
                        methodDescriptor,
                        m.getReturnType().getClassName(),
                        paramTypes,
                        modifiers(methodAccess),
                        List.copyOf(usedTypes),
                        List.copyOf(calls),
                        startLine
                ));
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

    /** INVOKE* opcode -> 사람이 읽기 좋은 호출 종류 */
    private static String invokeKind(int opcode) {
        return switch (opcode) {
            case Opcodes.INVOKEVIRTUAL -> "virtual";
            case Opcodes.INVOKESTATIC -> "static";
            case Opcodes.INVOKEINTERFACE -> "interface";
            case Opcodes.INVOKESPECIAL -> "special"; // 생성자 / private / super
            case Opcodes.INVOKEDYNAMIC -> "dynamic"; // 람다, indy 등
            default -> "unknown";
        };
    }

    /** ASM access 플래그 -> ["public", "static", ...] */
    private static List<String> modifiers(int access) {
        List<String> out = new ArrayList<>(4);
        if ((access & Opcodes.ACC_PUBLIC) != 0) out.add("public");
        if ((access & Opcodes.ACC_PROTECTED) != 0) out.add("protected");
        if ((access & Opcodes.ACC_PRIVATE) != 0) out.add("private");
        if ((access & Opcodes.ACC_STATIC) != 0) out.add("static");
        if ((access & Opcodes.ACC_FINAL) != 0) out.add("final");
        if ((access & Opcodes.ACC_ABSTRACT) != 0) out.add("abstract");
        return out;
    }
}
