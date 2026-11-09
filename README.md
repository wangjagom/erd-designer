# ERD 설계 도구

브라우저에서 바로 쓰는 ERD(Entity Relationship Diagram) 설계 도구입니다. 표를 만들고 1:1 · 1:N · N:M 관계를 그리며, 상세 설정을 켜면 데이터 타입과 SQL(CREATE TABLE)까지 확인할 수 있어요.

- 웹 주소: https://wangjagom.github.io/erd-designer/
- 작업 내용은 브라우저(localStorage)에 자동 저장돼요.
- Supabase를 연결하면 간편 로그인(Google · 카카오 · GitHub)으로 ERD를 클라우드에 저장하고, 읽기 전용 링크로 공유할 수 있어요. 설정 방법: [docs/SUPABASE.md](docs/SUPABASE.md)

## 배포

`main` 브랜치(또는 작업 브랜치)에 푸시하면 GitHub Actions(`.github/workflows/pages.yml`)가 GitHub Pages로 자동 배포합니다.
처음 한 번은 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정해 주세요.
