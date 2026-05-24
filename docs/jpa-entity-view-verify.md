# JPA Entity View — 동작 검증 가이드

이 문서는 `feature/jpa-entity-view` 브랜치의 ERD 뷰 동작을 실제 JPA 프로젝트로 검증하는 절차다.

## 1. 검증용 미니 프로젝트 만들기

아래 구조의 작은 Spring Boot + JPA 프로젝트를 임의 디렉터리(`/tmp/jpa-mini` 등)에 만든다.

```
jpa-mini/
├── build.gradle.kts
├── settings.gradle.kts
└── src/main/java/sample/
    ├── BaseEntity.java
    ├── User.java
    ├── Order.java
    ├── Role.java
    ├── UserRole.java
    └── UserRepository.java
```

### build.gradle.kts

```kotlin
plugins {
    java
    id("org.springframework.boot") version "3.4.0"
    id("io.spring.dependency-management") version "1.1.7"
}

java {
    toolchain { languageVersion.set(JavaLanguageVersion.of(17)) }
}

repositories { mavenCentral() }

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    runtimeOnly("com.h2database:h2")
}
```

### settings.gradle.kts

```kotlin
rootProject.name = "jpa-mini"
```

### BaseEntity (`@MappedSuperclass`)

```java
package sample;

import jakarta.persistence.*;
import java.time.Instant;

@MappedSuperclass
public abstract class BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    protected Long id;

    @Column(nullable = false, updatable = false)
    protected Instant createdAt;
}
```

### User (양방향 `@OneToMany` 주인 반대편)

```java
package sample;

import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "users")
public class User extends BaseEntity {
    @Column(name = "username", nullable = false, length = 50, unique = true)
    private String username;

    @OneToMany(mappedBy = "user")
    private List<Order> orders = new ArrayList<>();

    @ManyToMany
    @JoinTable(name = "user_role")
    private List<Role> roles = new ArrayList<>();
}
```

### Order (`@ManyToOne` 주인)

```java
package sample;

import jakarta.persistence.*;

@Entity
@Table(name = "orders")
public class Order extends BaseEntity {
    @Column(nullable = false)
    private int amount;

    @ManyToOne
    @JoinColumn(name = "user_id")
    private User user;
}
```

### Role (`@ManyToMany` 반대편)

```java
package sample;

import jakarta.persistence.*;
import java.util.List;

@Entity
@Table(name = "roles")
public class Role extends BaseEntity {
    @Column(nullable = false, length = 30)
    private String name;

    @ManyToMany(mappedBy = "roles")
    private List<User> users;
}
```

### UserRepository (Spring Data Repository)

```java
package sample;

import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {
}
```

## 2. 빌드

```bash
cd /tmp/jpa-mini
gradle build  # 또는 gradle wrapper init 후 ./gradlew build
```

`build/classes/java/main/sample/` 아래에 `.class` 파일들이 생성되어야 한다.

## 3. DepScope 서버 기동

```bash
cd <dep-scope 루트>
git checkout feature/jpa-entity-view
./gradlew :server:bootRun --args="\
  --analyzer.project-root=/tmp/jpa-mini \
  --analyzer.packages=sample"
```

## 4. 뷰어 기동 및 검증

```bash
cd viewer
npm install   # 최초 1회
npm run dev
```

브라우저에서 **http://localhost:5173/#/erd** 접속.

### 4.1 기본 검증 (scope=all, level=1, view=3d)

기대 결과:
- 노드: `User`, `Order`, `Role`, `BaseEntity` 4개 표시 (`UserRepository` 는 level 1 에선 제외)
- 엣지:
  - `Order` → `User` (`MANY_TO_ONE`, label: `user`)
  - `User` → `Role` (`MANY_TO_MANY`, label: `roles (join: user_role)`)
  - `User` → `BaseEntity` (`EXTENDS`)
  - `Order` → `BaseEntity` (`EXTENDS`)
  - `Role` → `BaseEntity` (`EXTENDS`)
- 양방향 엣지(User → Order의 `OneToMany`, Role → User의 `ManyToMany`)는 mappedBy 처리로 **사라져 있어야** 한다.

### 4.2 컬럼 검증 (level=2)

`+컬럼` 토글 ON. 2D 뷰로 전환(`2D` 토글).

기대 결과:
- 각 Entity 노드가 테이블 카드로 표시.
- `User` 카드:
  - 테이블명 `users`
  - 컬럼: `id` 🔑 / `createdAt` / `username` (length 50, unique)
- `Order` 카드:
  - 테이블명 `orders`
  - 컬럼: `id` 🔑 / `createdAt` / `amount`
- `BaseEntity` 카드: 컬럼 `id` / `createdAt`만, 테이블명 없음(`@Table` 미부착)

### 4.3 Repository 검증 (level=3)

`+Repository` 토글 ON.

기대 결과:
- `UserRepository` 노드 추가.
- `UserRepository` → `User` (`USES_ENTITY`) 엣지 표시.

### 4.4 seed 모드 검증

상단의 `seed 중심` 토글, 검색창에 `User` 입력 후 후보 클릭.

기대 결과:
- URL이 `#/erd?scope=seed&level=...&view=...&seed=sample.User&depth=2` 로 변경.
- `User` 를 중심으로 BFS 2단계 그래프만 표시.
- `UserRepository` 를 검색 후 클릭하면 그 Repository 가 사용하는 Entity(`User`)가 seed 로 설정됨.

### 4.5 빈 상태 검증

`--analyzer.packages=java.lang` 처럼 의도적으로 Entity가 없는 패키지로 재인덱싱한 뒤 `/#/erd` 접속 → "이 프로젝트에서 JPA Entity를 찾지 못했습니다" 안내가 나오고 메인 그래프 뷰로 돌아가는 링크가 표시되어야 한다.

## 5. Kotlin 검증 (선택)

같은 구조를 Kotlin `data class @Entity` 로 작성한 프로젝트로 위 절차를 반복.
주의: Kotlin은 어노테이션 타깃(`@field:Id` 등)에 따라 어노테이션이 메서드/생성자/프로퍼티에 붙는다.
- `@Id`, `@Column` 등은 기본 타깃이 프로퍼티(getter) 이므로 ClassIndexer 의 `visitField` 에서 잡히지 않을 수 있다.
- 만약 컬럼이 비어있으면, 명시적으로 `@field:Id`, `@field:Column` 형태로 작성해 필드에 직접 부착되도록 수정한 뒤 재검증.

Kotlin 어노테이션 타깃 처리는 후속 과제로 분리한다.

## 6. 알려진 한계

- 다단계 Repository 상속(`MyBaseRepo<T> extends JpaRepository<T, ID>` 경유)은 미지원. 직접 상속만 잡는다.
- `@Inheritance` 전략(JOINED 등)은 표시하지 않는다.
- 외부 jar 내 `@MappedSuperclass` 는 인식하지 않는다 (예: `BaseEntity` 가 공용 라이브러리 jar에 있는 경우).
- 2D 뷰의 자동 레이아웃은 elkjs `layered` 알고리즘 + `ORTHOGONAL` 엣지 라우팅 — LR/TB 방향 토글 가능. 큰 그래프에서는 계산이 비동기로 수백 ms 걸릴 수 있다.
- 2D 엣지의 Crow's foot 끝모양 마커는 미구현 (방향 화살표 + 텍스트 라벨로만 카디널리티 표시).

## 7. 검증 실패 시 체크리스트

| 증상 | 가능한 원인 |
|---|---|
| Entity 노드가 0개 | 분석 대상이 빌드되지 않음, packages 화이트리스트 누락 |
| 카디널리티 라벨이 N:1, 1:N 안 보임 | `@OneToMany` 등 어노테이션이 필드 대신 getter에 부착됨 (Kotlin) |
| `mappedBy` 사라진 엣지가 안 사라짐 | mappedBy 라벨 부착 누락 — `ClassIndexer.buildJpaLabel` 확인 |
| Repository → Entity 엣지 없음 | Repository 가 직접 JpaRepository 를 상속하지 않음, 또는 generic 시그니처 누락 |
| 양방향 관계가 양쪽에 모두 그려짐 | `mappedBy` 가 비주인 측에 명시되지 않음 (단방향으로 취급되는 것이 정상) |
