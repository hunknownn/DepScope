plugins {
    id("org.springframework.boot") version "3.3.5"
    id("io.spring.dependency-management") version "1.1.6"
    application
}

dependencies {
    implementation(project(":extractor"))
    implementation("org.springframework.boot:spring-boot-starter-web")
}

application {
    mainClass.set("com.analyzer.server.ServerApp")
}
