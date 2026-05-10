package com.analyzer.server;

import com.analyzer.extractor.ClassScanner;
import com.analyzer.extractor.GraphIndex;
import com.analyzer.extractor.IndexBuilder;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.stream.Stream;

/**
 * 시작 시 인덱스를 빌드하고 메모리에 보관.
 * /api/reindex 로 런타임에 분석 대상(경로/패키지) 변경 가능.
 *
 * 입력 소스 우선순위 (둘 다 있으면 합집합):
 *  1) analyzer.project-root : 프로젝트 루트만 주면 build/classes/{java,kotlin}/main 자동 탐색
 *  2) analyzer.classpath    : ":" 구분 디렉터리/jar 경로 직접 지정
 */
@Service
public class IndexService {

    @Value("${analyzer.classpath:}")
    private String initialClasspath;

    @Value("${analyzer.packages:}")
    private String initialPackages;

    @Value("${analyzer.project-root:}")
    private String initialProjectRoot;

    /** 마지막으로 사용된 설정 (인자 없는 reindex 호출 시 재사용) */
    private volatile String lastClasspath;
    private volatile String lastPackages;
    private volatile String lastProjectRoot;

    private volatile GraphIndex index = new GraphIndex();

    @PostConstruct
    public void init() throws IOException {
        reindex(initialClasspath, initialPackages, initialProjectRoot);
    }

    /** 마지막 설정으로 다시 인덱싱 */
    public synchronized void reindex() throws IOException {
        reindex(lastClasspath, lastPackages, lastProjectRoot);
    }

    /** 새 설정으로 인덱싱 */
    public synchronized void reindex(String classpath, String packagesCsv, String projectRoot) throws IOException {
        List<Path> roots = collectRoots(projectRoot, classpath);
        if (roots.isEmpty()) {
            this.index = new GraphIndex();
            this.lastClasspath = classpath;
            this.lastPackages = packagesCsv;
            this.lastProjectRoot = projectRoot;
            System.err.println("[analyzer] 분석 대상 경로가 비어 있습니다. 빈 인덱스로 시작합니다.");
            return;
        }
        List<String> pkgs = parseCsv(packagesCsv);
        long t0 = System.currentTimeMillis();
        this.index = new IndexBuilder(roots, pkgs).build();
        long ms = System.currentTimeMillis() - t0;
        this.lastClasspath = classpath;
        this.lastPackages = packagesCsv;
        this.lastProjectRoot = projectRoot;
        System.err.println("[analyzer] indexed " + this.index.allNodes().size()
                + " nodes from " + roots.size() + " roots in " + ms + "ms");
    }

    public GraphIndex index() {
        return index;
    }

    public String currentClasspath() { return lastClasspath; }
    public String currentPackages() { return lastPackages; }
    public String currentProjectRoot() { return lastProjectRoot; }

    private static List<Path> collectRoots(String projectRoot, String classpath) throws IOException {
        // LinkedHashSet 으로 중복 제거 + 입력 순서 유지
        var out = new LinkedHashSet<Path>();
        if (projectRoot != null && !projectRoot.isBlank()) {
            out.addAll(autoDiscover(Path.of(projectRoot)));
        }
        if (classpath != null && !classpath.isBlank()) {
            out.addAll(ClassScanner.parseClasspath(classpath));
        }
        return new ArrayList<>(out);
    }

    /** 프로젝트 루트 아래에서 build/classes/{java,kotlin}/main 디렉터리들을 자동 탐색 */
    private static List<Path> autoDiscover(Path root) throws IOException {
        if (!Files.isDirectory(root)) {
            System.err.println("[analyzer] project-root 가 디렉터리가 아닙니다: " + root);
            return List.of();
        }
        Path javaSuffix = Path.of("build", "classes", "java", "main");
        Path kotlinSuffix = Path.of("build", "classes", "kotlin", "main");
        try (Stream<Path> walk = Files.walk(root)) {
            List<Path> found = walk
                    .filter(Files::isDirectory)
                    .filter(p -> p.endsWith(javaSuffix) || p.endsWith(kotlinSuffix))
                    .toList();
            System.err.println("[analyzer] auto-discovered " + found.size() + " class dirs under " + root);
            return found;
        }
    }

    private static List<String> parseCsv(String csv) {
        if (csv == null || csv.isBlank()) return List.of();
        return Arrays.stream(csv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }
}
