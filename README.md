# ERD 설계 도구

브라우저에서 바로 쓰는 ERD(Entity Relationship Diagram) 설계 도구입니다. 표를 만들고 1:1 · 1:N · N:M 관계를 그리며, 상세 설정을 켜면 데이터 타입과 SQL(CREATE TABLE)까지 확인할 수 있어요.

- 웹 주소: https://wangjagom.github.io/erd-designer/
- 작업 내용은 브라우저(localStorage)에 자동 저장돼요.
- Supabase를 연결하면 간편 로그인(Google · 카카오 · GitHub)으로 ERD를 클라우드에 저장하고, 읽기 전용 링크로 공유할 수 있어요. 설정 방법: [docs/SUPABASE.md](docs/SUPABASE.md)

## 배포

`main` 브랜치(또는 작업 브랜치)에 푸시하면 GitHub Actions(`.github/workflows/pages.yml`)가 GitHub Pages로 자동 배포합니다.
처음 한 번은 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정해 주세요.

## 프로그램 흐름
상단의 **ERD | 프로그램 흐름** 전환으로 일반 플로우차트(시작/끝 · 처리 · 판단)를 그리고, 두 가지를 함께 보여 줘요.

- **이벤트 레인**: 흐름마다 켜고 끌 수 있는 가로 띠예요. 위 → 아래가 ABAP 리포트의 실행 순서(INITIALIZATION → AT SELECTION-SCREEN → START-OF-SELECTION, 필요하면 AT SELECTION-SCREEN OUTPUT 추가)이고, 단계를 어느 띠에 놓느냐로 그 단계가 일어나는 이벤트가 정해져요.
- **ERD 연결**: 처리 단계에서 "DB 조회"를 켜고 테이블을 고르면 단계 옆에 DB 칩이 붙어요. 칩을 누르면 ERD에서 그 테이블이 강조되고, ERD에서 테이블을 고르면 그 테이블을 조회하는 단계 목록이 나와요.
- **사용표**: 레인 › 단계 × 테이블 표에 R(조회)을 보여 줘요.
- 예제 목록의 **과목·강사 (흐름 예제)**로 바로 볼 수 있어요. (ZTCHR은 가칭 강사 배정 테이블)
- 흐름은 같은 문서(`flows`)에 저장돼서 브라우저 저장, JSON, 클라우드 저장·버전 기록·공유 링크에 그대로 따라가요. 흐름이 없는 기존 문서는 예전과 똑같이 열리고, 1차 버전 형식의 흐름은 열 때 자동으로 바뀌어요.
