package com.analyzer.extractor;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BiConsumer;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.stream.Stream;

/**
 * 입력으로 받은 디렉터리/jar 들에서 .class 파일 바이트를 꺼내 콜백으로 넘겨준다.
 * 디렉터리는 재귀, jar는 엔트리 순회.
 */
public final class ClassScanner {

    private final List<Path> roots;

    public ClassScanner(List<Path> roots) {
        this.roots = roots;
    }

    /** consumer: (sourceLabel, classBytes) — sourceLabel 은 디버깅용 */
    public void forEachClass(BiConsumer<String, byte[]> consumer) throws IOException {
        for (Path root : roots) {
            if (Files.isDirectory(root)) {
                scanDir(root, consumer);
            } else if (root.getFileName().toString().endsWith(".jar")) {
                scanJar(root, consumer);
            }
        }
    }

    private static void scanDir(Path dir, BiConsumer<String, byte[]> consumer) throws IOException {
        try (Stream<Path> walk = Files.walk(dir)) {
            List<Path> classes = walk
                    .filter(Files::isRegularFile)
                    .filter(p -> p.getFileName().toString().endsWith(".class"))
                    .toList();
            for (Path p : classes) {
                consumer.accept(p.toString(), Files.readAllBytes(p));
            }
        }
    }

    private static void scanJar(Path jar, BiConsumer<String, byte[]> consumer) throws IOException {
        try (JarFile jf = new JarFile(jar.toFile())) {
            var entries = jf.entries();
            while (entries.hasMoreElements()) {
                JarEntry e = entries.nextElement();
                if (e.isDirectory() || !e.getName().endsWith(".class")) continue;
                try (InputStream in = jf.getInputStream(e)) {
                    consumer.accept(jar + "!" + e.getName(), in.readAllBytes());
                }
            }
        }
    }

    public static List<Path> parseClasspath(String spec) {
        List<Path> out = new ArrayList<>();
        for (String part : spec.split(java.io.File.pathSeparator)) {
            if (!part.isBlank()) out.add(Path.of(part));
        }
        return out;
    }
}
