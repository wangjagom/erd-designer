# Supabase 연결 방법

ERD를 클라우드에 저장하고, 간편 로그인(Google · 카카오 · GitHub)과 읽기 전용 공유 링크를 쓰려면 아래 순서대로 한 번만 설정하세요.

사이트 주소: `https://wangjagom.github.io/erd-designer/`

## 1. 프로젝트 만들기
1. https://supabase.com 에 가입하고 **New project**를 만들어요. (Region은 `Northeast Asia (Seoul)` 추천)
2. **SQL Editor**를 열고 [`supabase/schema.sql`](../supabase/schema.sql) 내용을 붙여넣은 뒤 **Run**을 눌러요.
   - `erds` 표, 본인만 접근할 수 있게 하는 RLS 정책, 공유 링크용 함수 `get_shared_erd`가 만들어져요.

## 2. 주소 설정
**Authentication → URL Configuration**
- **Site URL**: `https://wangjagom.github.io/erd-designer/`
- **Redirect URLs**에 같은 주소를 추가해요. (로컬에서 시험하려면 `http://localhost:8000/`도 추가)

## 3. 간편 로그인 켜기 (Authentication → Sign In / Providers)
모든 제공자의 콜백(Redirect) URL은 `https://<프로젝트ID>.supabase.co/auth/v1/callback` 이에요. Supabase 화면에서 복사할 수 있어요.

### Google
1. [Google Cloud Console](https://console.cloud.google.com/) → API 및 서비스 → **OAuth 동의 화면** 구성
2. **사용자 인증 정보 → OAuth 클라이언트 ID** (웹 애플리케이션)
   - 승인된 리디렉션 URI: 위 콜백 URL
3. 받은 Client ID / Client Secret을 Supabase의 Google 항목에 넣고 Enable

### 카카오
1. [Kakao Developers](https://developers.kakao.com/) → 내 애플리케이션 → 애플리케이션 추가
2. **카카오 로그인** 활성화, **Redirect URI**에 위 콜백 URL 등록
3. **동의 항목**에서 닉네임 · 프로필 사진을 설정해요. (카카오계정 이메일은 비즈 앱 전환이 필요해요)
   - 이메일을 받지 않는다면 Supabase의 Kakao 설정에서 **Allow users without an email**을 켜 주세요.
4. **앱 키 → REST API 키**를 Client ID로, **보안 → Client Secret**(코드 생성 후 활성화)을 Secret으로 Supabase에 넣고 Enable

### GitHub
1. GitHub → Settings → Developer settings → **OAuth Apps → New OAuth App**
   - Homepage URL: 사이트 주소, Authorization callback URL: 위 콜백 URL
2. Client ID / Client Secret을 Supabase의 GitHub 항목에 넣고 Enable

## 4. 사이트에 키 넣기
**Project Settings → API**(또는 API Keys)에서 복사해 [`config.js`](../config.js)에 넣고 커밋 · 푸시하면 자동으로 다시 배포돼요.

```js
window.ERD_CONFIG = {
  supabaseUrl: 'https://<프로젝트ID>.supabase.co',
  supabaseAnonKey: '<anon public 키>',
  providers: ['google', 'kakao', 'github']   // 켠 제공자만 남기세요
};
```

> anon(public) 키는 브라우저에 공개돼도 괜찮은 키예요. 데이터는 RLS 정책으로 보호돼요.
> **service_role 키는 절대 넣지 마세요.**

## 사용법
- 툴바의 **클라우드** 버튼 → 간편 로그인 → **클라우드에 저장**
- **내 ERD** 목록에서 열기 · 삭제, 같은 ERD는 **저장**으로 덮어쓰고 **새로 저장**으로 사본을 만들어요.
- **공유**를 켜면 `?share=...` 링크가 생겨요. 링크를 받은 사람은 로그인 없이 읽기 전용 사본으로 볼 수 있고, 원본은 바뀌지 않아요. 공유를 끄면 링크가 바로 막혀요.
