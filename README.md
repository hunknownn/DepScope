# DepScope

**JVM 프로젝트의 클래스 의존 관계를 3D 그래프로 시각화하는 스코프(망원경).**

IntelliJ Find Usages 처럼 특정 클래스를 중심으로 사용처를 탐색할 수 있는데, 결과를 리스트가 아니라 **3D 그래프**로 보여줘서 한눈에 의존 관계가 들어옵니다. 노드를 따라가며 점점 그래프를 펼칠 수 있습니다.

Java/Kotlin 등 모든 JVM 언어를 분석할 수 있습니다.

## 어떤 걸 보여주나요?

타깃 클래스를 중심으로 다음 8가지 관계를 그래프로 표시합니다.

| 관계 | 의미 | 예 |
|---|---|---|
| extends | 상속 | `UserServiceImpl` → `UserService` |
| implements | 구현 | `UserServiceImpl` → `UserService` (interface) |
| has-field | 필드 보유 / DI 주입 | `UserController.userService : UserService` |
| param | 메서드 파라미터 타입 | `login(UserService us)` |
| returns | 메서드 반환 타입 | `findUser(): User` |
| calls | 메서드 호출 | `OrderService.placeOrder()` → `UserService.findById()` |
| new | 객체 생성 | `new UserService()` |
| annotated-by | 어노테이션 | `@Service`, `@Repository` 등 |

색상 가이드:
- **노란색** seed (지금 보고 있는 타깃)
- **파란색** `@Service`
- **초록색** `@Repository`
- **분홍색** `@Controller` / `@RestController`
- **회색** 일반 클래스 / 외부 라이브러리

## 빠른 시작

### 사전 준비

- **Java 21**
- **Node.js 18 이상**
- 분석 대상 프로젝트가 **빌드되어 있어야 함** (`./gradlew build` 등)
  → 이 도구는 `.class` 바이트코드를 읽기 때문에 컴파일 결과물이 필요합니다.

### 1) 분석기 서버 실행

```bash
git clone <this-repo>
cd dep-scope
./gradlew :server:bootRun
```

서버가 `http://localhost:8080` 에 뜹니다. 인자 없이 띄워도 되고 (뷰어에서 설정),
미리 분석 대상을 지정해두려면:

```bash
./gradlew :server:bootRun --args="\
  --analyzer.project-root=/path/to/your-project \
  --analyzer.packages=com.yourcompany"
```

### 2) 뷰어 실행

다른 터미널에서:

```bash
cd viewer
npm install
npm run dev
```

브라우저에서 **http://localhost:5173** 접속.

## 사용법

### 처음 사용할 때

화면 좌측 패널에 **"인덱스 설정"** 이 자동으로 열립니다 (인덱스가 비어있으면).

| 입력 필드 | 무엇을 넣나요 | 예 |
|---|---|---|
| **project-root** | 분석할 프로젝트의 루트 디렉터리 | `/Users/me/workspace/my-app` |
| **classpath** | (선택) 직접 지정할 `.class` 디렉터리/jar — 보통 비워둠 | `/path/build/libs/foo.jar` |
| **packages** | (선택) 분석할 패키지 prefix. 비우면 JDK까지 다 잡힘 | `com.yourcompany,com.shared` |

채운 후 **`reindex`** 버튼 클릭. 잠시 후 `현재 인덱스: N nodes` 가 표시되면 완료.

> 💡 **packages는 거의 필수**입니다. 비우면 `java.lang.*`, `kotlin.*`, Spring 내부 클래스까지 전부 그래프에 들어와서 노이즈가 심합니다.

### 클래스 탐색

1. 검색창에 클래스 이름 일부 입력 (예: `UserService`)
2. 후보 목록에서 원하는 클래스 클릭 → seed 설정
3. 3D 그래프가 렌더됨

### 그래프 조작

| 동작 | 결과 |
|---|---|
| 마우스 드래그 | 회전 |
| 휠 | 줌 인/아웃 |
| 노드 호버 | 클래스 정보 툴팁 |
| **노드 우클릭** | **그 노드를 새 seed로 → 재탐색** |
| depth 슬라이더 (1~4) | 몇 단계까지 펼칠지 |
| relations 체크박스 | 보고 싶은 관계 종류만 표시 |

### 코드를 수정한 후

분석 대상 프로젝트를 다시 빌드한 뒤, 뷰어에서 **인덱스 설정 → reindex** 한 번 누르면 최신 상태로 갱신됩니다. 서버 재시작 불필요.

## 자주 묻는 문제

**Q. reindex 했는데 `0 nodes`가 나옵니다.**
- 분석 대상 프로젝트가 빌드되었는지 확인 (`build/classes/...` 디렉터리 존재 여부)
- `project-root` 경로 오타 확인
- packages 화이트리스트가 너무 좁지 않은지 — 일단 비워두고 시도

**Q. reindex가 너무 오래 걸리거나 멈춥니다.**
- `project-root` 가 너무 상위 디렉터리인 경우 (예: 홈 디렉터리). 정확한 프로젝트 루트로 좁혀주세요.

**Q. 검색해도 클래스가 안 뜹니다.**
- 패키지 prefix 가 실제 패키지와 다를 수 있습니다. packages 를 비운 채로 reindex 후 검색해보세요.

**Q. 외부 라이브러리(Spring 등) 호출도 보고 싶어요.**
- `classpath` 필드에 의존 jar 경로를 추가하세요 (`:` 구분).
  Gradle 캐시: `~/.gradle/caches/modules-2/files-2.1/...`

**Q. 메서드 단위로 보고 싶어요.**
- 현재는 클래스 단위만 지원합니다.

**Q. 리플렉션이나 동적 프록시 호출은 어떻게 되나요?**
- 정적 분석 한계로 누락됩니다. (런타임 보강은 추후 과제)

## 도구 구성

분석을 직접 자동화하거나 다른 도구와 연동하고 싶다면 REST API 를 사용하세요.

| Method | Path | 설명 |
|---|---|---|
| `GET`  | `/api/search?q=<substr>&limit=20` | FQN 부분 일치 검색 |
| `GET`  | `/api/graph?seed=<fqn>&depth=<n>&relations=<csv>` | seed 중심 부분 그래프 |
| `GET`  | `/api/config` | 현재 인덱스 설정 / 노드 수 |
| `POST` | `/api/reindex` | 인덱스 재빌드 (바디 또는 마지막 설정으로) |

reindex 예시:

```bash
curl -X POST http://localhost:8080/api/reindex \
  -H 'Content-Type: application/json' \
  -d '{"projectRoot": "/path/your-project", "packages": "com.yourcompany"}'
```

graph 응답 예시:

```json
{
  "seed": "com.yourcompany.UserService",
  "depth": 2,
  "nodes": [
    { "id": "com.yourcompany.UserService", "name": "UserService",
      "pkg": "com.yourcompany", "kind": "class", "stereotypes": ["Service"] }
  ],
  "links": [
    { "source": "com.yourcompany.UserController", "target": "com.yourcompany.UserService",
      "relation": "HAS_FIELD", "weight": 1 }
  ]
}
```

## 한계

- 분석 대상이 **빌드되어 있어야** 합니다 (소스만 있으면 안 됨).
- 정적 분석이라 **리플렉션 / 동적 프록시 / Spring AOP** 같은 런타임 결합은 잡히지 않습니다.
- 노드 단위는 **클래스** 입니다. 메서드 단위 그래프는 지원하지 않습니다.
- 외부 라이브러리(jar)는 자동으로 포함되지 않습니다. classpath 에 직접 추가해야 합니다.
