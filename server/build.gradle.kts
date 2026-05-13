plugins {
    id("org.springframework.boot") version "4.0.6"
    id("io.spring.dependency-management") version "1.1.7"
    application
}

dependencies {
    implementation(project(":extractor"))
    implementation("org.springframework.boot:spring-boot-starter-web")
}

application {
    mainClass.set("com.analyzer.server.ServerApp")
}
