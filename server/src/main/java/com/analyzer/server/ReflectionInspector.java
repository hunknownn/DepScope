package com.analyzer.server;

import com.analyzer.extractor.model.FieldInfo;
import com.analyzer.extractor.model.MethodInfo;
import com.analyzer.extractor.model.Node;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.List;

/**
 * 인덱스에 본문 정보가 없는 클래스(JDK / 외부 라이브러리)를
 * JVM 클래스로더 기반 리플렉션으로 보강한다.
 *
 * 한계: 분석 대상 프로젝트의 3rd-party 라이브러리가 analyzer 서버의 classpath 에
 *      없으면 ClassNotFoundException 으로 실패한다. (JDK 클래스는 항상 OK)
 */
public final class ReflectionInspector {

    private ReflectionInspector() {}

    /** 리플렉션 보강에 성공하면 메서드/필드가 채워진 Node, 실패하면 null */
    public static Node tryInspect(String fqn) {
        Class<?> c;
        try {
            c = Class.forName(fqn, false, ReflectionInspector.class.getClassLoader());
        } catch (Throwable t) {
            return null;
        }
        return toNode(c, fqn);
    }

    private static Node toNode(Class<?> c, String fqn) {
        String simple = c.getSimpleName();
        if (simple == null || simple.isEmpty()) {
            int i = fqn.lastIndexOf('.');
            simple = i < 0 ? fqn : fqn.substring(i + 1);
        }
        String pkg = c.getPackageName();
        String kind = c.isAnnotation() ? "annotation"
                : c.isInterface() ? "interface"
                : c.isEnum() ? "enum"
                : "class";

        List<MethodInfo> methods = new ArrayList<>();
        try {
            for (Constructor<?> ctor : c.getDeclaredConstructors()) {
                if (ctor.isSynthetic()) continue;
                List<String> params = new ArrayList<>();
                for (Class<?> p : ctor.getParameterTypes()) params.add(p.getTypeName());
                methods.add(new MethodInfo(
                        "<init>",
                        descriptorOf(ctor.getParameterTypes(), void.class),
                        "void",
                        params,
                        modifiers(ctor.getModifiers()),
                        List.of(),
                        List.of(),
                        -1
                ));
            }
        } catch (Throwable ignore) {}
        try {
            for (Method m : c.getDeclaredMethods()) {
                if (m.isSynthetic() || m.isBridge()) continue;
                List<String> params = new ArrayList<>();
                for (Class<?> p : m.getParameterTypes()) params.add(p.getTypeName());
                methods.add(new MethodInfo(
                        m.getName(),
                        descriptorOf(m.getParameterTypes(), m.getReturnType()),
                        m.getReturnType().getTypeName(),
                        params,
                        modifiers(m.getModifiers()),
                        List.of(), // 본문 분석은 리플렉션으로 불가
                        List.of(),
                        -1
                ));
            }
        } catch (Throwable ignore) {}

        List<FieldInfo> fields = new ArrayList<>();
        try {
            for (Field f : c.getDeclaredFields()) {
                if (f.isSynthetic()) continue;
                fields.add(new FieldInfo(
                        f.getName(),
                        f.getType().getTypeName(),
                        modifiers(f.getModifiers())
                ));
            }
        } catch (Throwable ignore) {}

        return new Node(fqn, simple, pkg, kind, List.of(),
                List.copyOf(methods), List.copyOf(fields), null);
    }

    /** Class[] + return Class -> JVM descriptor (예: "(I[Ljava/lang/String;)Lfoo/Bar;") */
    private static String descriptorOf(Class<?>[] params, Class<?> ret) {
        StringBuilder sb = new StringBuilder("(");
        for (Class<?> p : params) sb.append(typeDescriptor(p));
        sb.append(")").append(typeDescriptor(ret));
        return sb.toString();
    }

    private static String typeDescriptor(Class<?> c) {
        if (c == void.class) return "V";
        if (c == boolean.class) return "Z";
        if (c == byte.class) return "B";
        if (c == char.class) return "C";
        if (c == short.class) return "S";
        if (c == int.class) return "I";
        if (c == long.class) return "J";
        if (c == float.class) return "F";
        if (c == double.class) return "D";
        if (c.isArray()) return "[" + typeDescriptor(c.getComponentType());
        return "L" + c.getName().replace('.', '/') + ";";
    }

    private static List<String> modifiers(int mod) {
        List<String> out = new ArrayList<>(4);
        if (Modifier.isPublic(mod)) out.add("public");
        if (Modifier.isProtected(mod)) out.add("protected");
        if (Modifier.isPrivate(mod)) out.add("private");
        if (Modifier.isStatic(mod)) out.add("static");
        if (Modifier.isFinal(mod)) out.add("final");
        if (Modifier.isAbstract(mod)) out.add("abstract");
        return out;
    }
}
