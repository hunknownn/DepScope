# syntax=docker/dockerfile:1.7

# ---- build stage ----
FROM eclipse-temurin:25-jdk AS build
WORKDIR /workspace

# gradle wrapper + 루트 빌드 스크립트 먼저 복사 (의존성 캐시 활용)
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle gradle
COPY extractor/build.gradle.kts extractor/
COPY server/build.gradle.kts server/

# 의존성 미리 받아두기 (소스 변경에도 캐시 유지되도록)
RUN --mount=type=cache,target=/root/.gradle \
    ./gradlew --no-daemon :server:dependencies || true

# 소스 복사 후 bootJar 빌드
COPY extractor/src extractor/src
COPY server/src server/src
RUN --mount=type=cache,target=/root/.gradle \
    ./gradlew --no-daemon :server:bootJar -x test

# ---- runtime stage ----
FROM eclipse-temurin:25-jre
WORKDIR /app

COPY --from=build /workspace/server/build/libs/*.jar /app/app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
