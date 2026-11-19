# ERD 설계 도구

브라우저에서 바로 쓰는 ERD(Entity Relationship Diagram) 설계 도구입니다. 표를 만들고 1:1 · 1:N · N:M 관계를 그리며, 상세 설정을 켜면 데이터 타입과 SQL(CREATE TABLE)까지 확인할 수 있어요.

- 웹 주소: https://wangjagom.github.io/erd-designer/
- 작업 내용은 브라우저(localStorage)에 자동 저장돼요.
- Supabase를 연결하면 간편 로그인(Google · 카카오 · GitHub)으로 ERD를 클라우드에 저장하고, 읽기 전용 링크로 공유할 수 있어요. 설정 방법: [docs/SUPABASE.md](docs/SUPABASE.md)

## 배포

`main` 브랜치(또는 작업 브랜치)에 푸시하면 GitHub Actions(`.github/workflows/pages.yml`)가 GitHub Pages로 자동 배포합니다.
처음 한 번은 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정해 주세요.

## 프로그램 흐름 (ABAP)
상단의 **ERD | 프로그램 흐름** 전환으로, SAP ABAP 리포트 프로그램의 실행 흐름을 코드 짜기 전에 설계해요.

- 이벤트 블록은 실행 순서(INITIALIZATION → AT SELECTION-SCREEN OUTPUT → AT SELECTION-SCREEN → START-OF-SELECTION)로 고정돼요.
- PERFORM/FORM(USING·CHANGING 파라미터), SELECT, IF/CASE, MESSAGE(S/I/W/E/A/X), WRITE, RETURN/EXIT 노드를 화살표로 이어요.
- SELECT 노드는 이 ERD의 표·필드를 가리켜요. ERD에서 표를 고르면 그 표를 쓰는 흐름이, 흐름에서는 "ERD에서 보기"로 읽는 필드가 강조돼요.
- 테이블 사용표(흐름별 · 블록별)로 어느 단계가 어떤 표를 읽는지 한눈에 봐요.
- 흐름은 같은 문서(`flows`)에 저장돼서 브라우저 저장, JSON, 클라우드 저장·버전 기록·공유 링크에 그대로 따라가요. 흐름이 없는 기존 문서는 예전과 똑같이 열려요.
