# JPA Entity View — 설계 결정 사항

> 브랜치: `feature/jpa-entity-view`
> 작성일: 2026-05-24
> 목적: DepScope에 JPA Entity 전용 ERD 뷰를 추가한다.

본 문서는 구현 착수 전 인터뷰를 통해 합의된 범위와 결정 사항을 기록한다.
**검토된 대안도 함께 남긴다** — 추후 방향 전환이나 다른 기능으로 마이그레이션할 때 의사결정 맥락을 재확인하기 위함이다.

---

## 1. 목적과 사용 시나리오

### 결정
JPA `@Entity` 중심의 ERD 뷰를 **별도 페이지**(`/erd`)로 제공한다. 아래 3가지 시나리오를 **동일한 그래프에서 정보량 토글**로 모두 다룬다.

| 시나리오 | 무엇을 보고 싶은가 | 토글 단계 |
|---|---|---|
| 도메인 구조 파악 | Entity 간 연관관계만 | **level 1: 관계만** |
| DB 스키마 도출 | 테이블/컬럼/제약/PK까지 | **level 2: + 컬럼·제약** |
| 리팩토링 영향도 | 각 Entity 사용처(Repository) | **level 3: + Repository** |

### 검토된 대안
- **3개 서브탭 분리** (`/erd` 안에 [도메인][스키마][영향도]) — 더 명확하지만 UI/코드 중복.
- **시나리오별 별도 페이지** — 과도한 분리.
- **단일 시나리오만 지원** — 사용처 다양성 포기.

### 채택 이유
같은 노드 세트를 다른 렌더 디테일로 보여주는 토글이 코드 재사용·UX 일관성 측면에서 가장 효율적이라 판단.

---

## 2. UI / 진입 방식

### 결정
- **`/erd` 별도 페이지**. 기존 메인 그래프 뷰와 라우팅 분리.
- **3D 모드와 2D 모드 모두 제공**.
  - 3D: 기존 `react-force-graph` 재사용.
  - 2D: 전통적 ERD 다이어그램 (테이블 카드 + 카디널리티 라벨), `dagre` 또는 `elkjs` 레이아웃.
- **진입 시 조회 범위 스위치**: `전체` / `seed 중심`.
- **상단 헤더 탭**으로 메인 ↔ `/erd` 전환.
- **상태는 URL 쿼리 파라미터**로 유지 (`scope`, `seed`, `level`, `view=2d|3d`).

### 검토된 대안
| 영역 | 대안 | 탈락 사유 |
|---|---|---|
| 메인 뷰와의 공존 | 한 화면에 ERD 모드 토글 | 정보 밀도 차이가 커서 같은 화면 부적합 |
| 메인 뷰와의 공존 | "Entity only" 체크박스만 추가 (별도 페이지 없음) | ERD 다운 표현을 못 함 |
| 노드 형태 | 3D만 | 전통적 ERD 가독성 부족 |
| 노드 형태 | 2D만 | 기존 3D 자산·인터랙션 포기 |
| 네비게이션 | Entity 노드 컨텍스트 액션만 | 진입점이 숨어 있어 발견성 낮음 |
| 네비게이션 | 헤더 탭 + 노드 액션 둘 다 | 1차에서는 헤더 탭만으로 충분 |
| 상태 유지 | localStorage | 공유·북마크 불가 |
| 상태 유지 | 없음 | 새로고침 시 컨텍스트 손실 |
| 진입 범위 기본값 | 전체만 | 큰 프로젝트에서 부담 |
| 진입 범위 기본값 | seed만 | 작은 프로젝트에서 한눈에 못 봄 |

---

## 3. 인식 대상 타입

### 결정
**프로젝트 내 클래스만** 대상.

| 어노테이션 / 인터페이스 | 처리 |
|---|---|
| `@Entity` | ERD의 1급 노드 |
| `@MappedSuperclass` | 부모 노드. EXTENDS 엣지로 자식과 연결 |
| `@Embeddable` / `@Embedded` | 값 타입. 테이블 없음, 복합 컬럼 표현용 |
| Spring Data `Repository` 계열 | `level 3` 토글에서 표시. Entity와 연결 |

### 검토된 대안
- **`@Converter` / `@AttributeConverter` 포함** — ERD 본질과 거리. 보류.
- **외부 jar 내 `@Entity` / `@MappedSuperclass` 포함** — 공용 BaseEntity가 jar로 배포되는 케이스. 1차에서는 제외, 필요해지면 README의 `classpath` 옵션 재활용 가능.

---

## 4. 연관 관계 표현

### 4.1 추가될 Relation 타입

```
ONE_TO_MANY
MANY_TO_ONE
ONE_TO_ONE
MANY_TO_MANY
```

기존 `HAS_FIELD` / `EXTENDS` / `IMPLEMENTS` 등은 그대로 두고, JPA 관계는 별도 타입으로 구분.

### 4.2 양방향 관계 (mappedBy)

- **하나의 엣지로 통합**, 방향은 **주인(owning side)** 기준.
- 엣지 라벨에 `mappedBy = <필드명>` 표기.
- 단방향이면 라벨 없음.

**검토된 대안**: 양방향을 **2개 엣지**(OneToMany + ManyToOne)로 분리.
- 장점: 원본 코드 구조에 충실.
- 단점: 화면이 시끄러움. ERD 관점에선 하나의 관계.

### 4.3 컬렉션 element 타입 추출

- **ASM `FieldVisitor` + `SignatureVisitor`로 제네릭 시그니처를 파싱**해 `List<User>`의 `User`를 정확히 추출.
- `@OneToMany(targetEntity = ...)` 명시가 없어도 동작.

**검토된 대안**: `targetEntity` 어노테이션 파라미터에만 의존 — 미지정 케이스가 흔해서 누락 위험.

### 4.4 `@ManyToMany` 조인 테이블

- **엣지 라벨에만 표기** (`M:N (join: user_role)`).
- 가상 조인 노드를 만들지 않음.

**검토된 대안**: join table을 별도 노드로 — 충실하지만 Entity가 아닌 가짜 노드가 섞임.

### 4.5 카디널리티 표기

- **Crow's foot (UML 스타일)**.
- 2D 모드의 엣지 끝모양으로 카디널리티 표현.
- **3D 모드에서는 끝모양 표현이 어렵기 때문에**, 엣지 라벨에 `1:N` 같은 텍스트로 보강 (구현 디테일은 작업 #5에서 결정).

**검토된 대안**:
- `1:N / N:1 / 1:1 / N:M` 텍스트 표기 — 간결하지만 시각적 임팩트 약함.
- `OneToMany / ManyToOne` (어노테이션 명칭 그대로) — 개발자 친화적이지만 ERD 표준과 거리.

### 4.6 상속

- `@MappedSuperclass` ↔ 자식 Entity: **EXTENDS 엣지로만 표시**.
- `@Inheritance(JOINED / SINGLE_TABLE / TABLE_PER_CLASS)` **전략값은 보류**.

**검토된 대안**: 전략값까지 노드/엣지에 표기 — 스키마 도출 용도엔 유용하나 시각 복잡도 증가.

---

## 5. 컬럼 / 제약 메타데이터

### 결정
`level 2: + 컬럼·제약` 토글에서 다음을 읽어 노드에 표시.

| 출처 | 추출 정보 |
|---|---|
| 필드 타입 | 이름, Java 타입 |
| `@Id` | PK 표시 |
| `@GeneratedValue(strategy=…)` | 생성 전략 |
| `@Column` | `name`, `nullable`, `unique`, `length` |
| `@JoinColumn` | FK 컬럼명 (관계 엣지 라벨에 부착) |
| `@Table` | 테이블명 (노드 라벨에 부착) |

기본 매핑(어노테이션 없는 필드)은 필드명 그대로.

### 검토된 대안
- **이름 + 타입만** — 도메인 구조 파악엔 충분하지만, 본 프로젝트가 "스키마 도출"까지 시나리오로 명시했기 때문에 부족.

---

## 6. Repository ↔ Entity 연결

### 결정
- **ASM `SignatureVisitor`로 클래스 시그니처 파싱**, `JpaRepository<T, ID>`의 첫 타입 파라미터 `T`를 추출.
- 추출 결과는 `USES_ENTITY` (가칭) 엣지로 Repository → Entity 방향 연결.

### 검토된 대안
**메서드 반환 타입 기반 추정** (findById/findAll 등의 반환 타입에서 역추론).
- 장점: 메타데이터 없는 구현체도 잡힘.
- 단점: 노이즈 큼, false positive 다발.

---

## 7. 검색 UX

### 결정
- `/erd` 안의 검색창은 **`@Entity` + Spring Data Repository**를 후보로 표시.
- Repository를 선택해도 그 Repository가 다루는 Entity가 seed로 설정됨 (간접 진입).

### 검토된 대안
- **Entity만 검색** — 명확하지만 Repository에서 Entity로 진입하는 시나리오 불편.
- **검색창 없음, 전체 모드만** — 큰 프로젝트에서 답답.

---

## 8. 진입 시 조회 범위

### 결정
**`전체 / seed 중심` 둘 다 제공**, 상단 스위치로 전환.
- 전체: 프로젝트 내 모든 `@Entity` 한 화면.
- seed 중심: 기존 메인 뷰처럼 검색 → seed → depth.

### 검토된 대안
- 전체만 / seed만 — 둘 중 하나만 두면 프로젝트 크기에 따라 부적합.

---

## 9. Empty State

### 결정
`@Entity`가 0개인 프로젝트에서 `/erd` 접근 시:
- **안내 메시지 + 메인 그래프로 돌아가기 링크** 표시.
- ex) "이 프로젝트에서 JPA Entity를 찾지 못했습니다. 메인 그래프 뷰로 돌아가시겠어요?"

### 검토된 대안
- 빈 화면 (아무것도 안 함) — 사용자가 페이지 깨진 것으로 오인 가능.

---

## 10. Export

### 결정
**1차 범위 제외**. 추후 과제.

### 검토된 대안 (후속 작업 시 참고)
| 형식 | 가치 | 구현 비용 |
|---|---|---|
| PNG / SVG | 문서 첨부 용이 | 낮음 (캔버스 캡처) |
| PlantUML / Mermaid | 텍스트 ERD, 버전 관리 친화 | 중 (관계 → DSL 변환) |
| SQL DDL | 실제 스키마 도출 | 높음 (JPA 타입 → SQL 타입 매핑 필요) |

---

## 11. Kotlin 지원

### 결정
**샘플 검증 단계에 Kotlin `data class @Entity` 케이스 포함**. 동작이 깨지면 그 시점에 대응.

### 검토된 대안
- Java와 동일 동작 가정, 문제 생기면 그때 대응 — 검증 누락 위험.

### 비고
- ASM은 컴파일된 `.class`를 읽기 때문에 Kotlin이라도 어노테이션이 보존되면 동작.
- 단, Kotlin의 `@field:` 어노테이션 타깃 차이로 어노테이션이 메서드/프로퍼티에 붙는 케이스가 있어 검증 필수.

---

## 12. API / 데이터 모델 변경 요약

| 영역 | 변경 |
|---|---|
| `Relation` enum | JPA 4종 추가 (`ONE_TO_MANY` / `MANY_TO_ONE` / `ONE_TO_ONE` / `MANY_TO_MANY`) |
| `Edge` 모델 | `label` 필드 추가 (`mappedBy`, join table, FK 컬럼 등 부착) |
| `Node` 모델 | Entity인 경우 테이블명·컬럼 리스트·PK·제약 정보 |
| `ClassIndexer` | 필드 어노테이션 파싱, `SignatureVisitor` 도입 |
| 서버 API | `/api/erd` 신설 또는 `/api/graph?view=erd`. 쿼리: `scope=all\|seed`, `level=1\|2\|3`, `seed=<fqn>` |
| 뷰어 | `/erd` 라우트, 3D/2D 렌더러, 토글 UI, 상단 헤더 탭 |

---

## 13. 구현 작업 분할

| # | 작업 | 비고 |
|---|---|---|
| 1 | `Relation` enum에 JPA 관계 4종 추가 | 직렬화·API 응답까지 |
| 2 | 필드 어노테이션 파서 + 제네릭 signature 파싱 | `FieldVisitor#visitAnnotation`, `SignatureVisitor` |
| 3 | Entity 메타데이터 모델 추가 | 테이블명·컬럼·PK·제약 |
| 4 | Repository 제네릭 파싱 | 클래스 signature → `USES_ENTITY` 엣지 |
| 5 | 서버 ERD API | `scope`, `level`, `seed` 파라미터 |
| 6 | 뷰어 `/erd` 라우트 + 3D 모드 + 토글 | 헤더 탭, URL 상태, 빈 상태 처리 |
| 7 | 뷰어 2D ERD 렌더러 | `dagre` / `elkjs`, Crow's foot |
| 8 | 샘플 JPA 프로젝트 검증 | Java + Kotlin, 양방향, `@ManyToMany`, `@MappedSuperclass` |

---

## 14. 보류 / 후속 과제

- `@Inheritance` 전략(JOINED/SINGLE_TABLE/TABLE_PER_CLASS) 시각화
- 외부 jar 내 `@MappedSuperclass` / `@Entity` 인식
- `@Converter` / `@AttributeConverter`
- 메서드 반환 타입 기반 Repository ↔ Entity 추론 (보조 수단으로)
- JPQL / Criteria / `@Query` 내 Entity 참조
- XML 매핑 (`orm.xml`)
- MyBatis 등 JPA 외 ORM
- ERD Export (PNG / PlantUML / SQL DDL)
- ERD 노드 컨텍스트 액션 (메인 그래프에서 "ERD로 보기")

---

## 부록 A: 인터뷰 전체 옵션 기록

추후 방향 전환·다른 기능으로의 마이그레이션 시 의사결정 맥락 재확인용.

### Round 1: 작업 범위

| 옵션 | 선택 여부 |
|---|---|
| 필터링만 추가 (MVP) | ✗ |
| JPA 관계 타입까지 추가 | ✗ |
| **ERD 완전판 (관계 + mappedBy + 컬럼·제약)** | ✓ |

### Round 2: ERD 골격

| 질문 | 선택 | 다른 후보 |
|---|---|---|
| 사용 시나리오 | 3가지 모두 + 토글 | 도메인만 / 스키마만 / 영향도만 |
| 양방향 관계 표현 | 1개 엣지로 통합 | 2개 엣지로 분리 |
| 인식할 JPA 타입 (다중) | `@MappedSuperclass`, `@Embeddable`, Spring Data Repository | `@Converter / @AttributeConverter` |
| 메인 뷰와의 공존 | 완전 별도 페이지 | 한 화면 토글 / 필터만 |

### Round 3: 세부 구조

| 질문 | 선택 | 다른 후보 |
|---|---|---|
| 토글의 의미 | 같은 그래프, 정보량만 조절 | 3개 서브탭 |
| 노드 시각 형태 | 3D / 2D 모두 | 3D 그래프 재사용만 / 2D ERD만 |
| Repository ↔ Entity | 제네릭 타입 파라미터 파싱 | 메서드 반환 타입 추정 |
| 외부 jar | 프로젝트 내만 | classpath jar 포함 |

### Round 4: 관계 / 컬럼

| 질문 | 선택 | 다른 후보 |
|---|---|---|
| 진입 시 조회 범위 | 전체 / seed 둘 다 | 전체만 / seed만 |
| 컬럼 정보 수준 | + 제약조건까지 | 이름 + 타입만 |
| `@JoinTable` | 엣지 라벨에만 표시 | 별도 노드로 |
| `@Inheritance` 전략 | 부모-자식만, 전략 보류 | 전략까지 표시 / 나중에 |

### Round 5: 운영

| 질문 | 선택 | 다른 후보 |
|---|---|---|
| ERD 검색 UX | Entity + Repository | Entity만 / 검색창 없음 |
| Export (다중) | (이번에 안 함) | PNG/SVG, PlantUML/Mermaid, SQL DDL |
| 상태 영속화 | URL 쿼리 파라미터 | localStorage / 안 함 |
| 메인 ↔ /erd 네비게이션 | 상단 헤더 탭 | Entity 노드 액션 / 둘 다 |

### Round 6: 디테일

| 질문 | 선택 | 다른 후보 |
|---|---|---|
| Empty state | 안내 메시지 + 메인으로 | 빈 화면 |
| 컬렉션 element 타입 | FieldVisitor signature 파싱 | `targetEntity` 어노테이션 의존 |
| 카디널리티 표기 | Crow's foot (UML) | `1:N / N:1` 텍스트 / `OneToMany` 명칭 |
| Kotlin 지원 | 명시적 검증 | Java와 동일 가정 |

---

## 부록 B: 마이그레이션 메모

본 ERD 뷰의 일부 구성요소는 다른 기능으로 재사용 가능하다.

| 구성요소 | 재사용 후보 |
|---|---|
| `SignatureVisitor` 기반 제네릭 파싱 | `Optional<T>`, `Page<T>`, `Flux<T>` 등 일반 제네릭 컨테이너 분석 |
| `FieldVisitor#visitAnnotation` | Validation(`@NotNull` 등), 직렬화(`@JsonProperty`) 메타데이터 추출 |
| 2D 다이어그램 렌더러 (dagre/elkjs) | Call-flow 다이어그램의 2D 모드, 패키지 의존성 다이어그램 |
| URL 쿼리 기반 상태 관리 | 메인 그래프 뷰에도 역도입 가능 |
| `level` 토글 패턴 | 다른 뷰에서도 "정보량 토글"이 필요할 때 |
| `scope=all\|seed` 패턴 | 다른 그래프 뷰의 진입 모드 일반화 |
