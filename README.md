# ERD 설계 도구

브라우저에서 바로 쓰는 ERD(Entity Relationship Diagram) 설계 도구입니다. 표를 만들고 1:1 · 1:N · N:M 관계를 그리며, 상세 설정을 켜면 데이터 타입과 SQL(CREATE TABLE)까지 확인할 수 있어요.

- 웹 주소: https://wangjagom.github.io/erd-designer/
- 단일 파일 `index.html`로 동작하며, 작업 내용은 브라우저(localStorage)에 저장돼요.

## 배포

`main` 브랜치(또는 작업 브랜치)에 푸시하면 GitHub Actions(`.github/workflows/pages.yml`)가 GitHub Pages로 자동 배포합니다.
처음 한 번은 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정해 주세요.
