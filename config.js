/*
 * Supabase 연결 설정
 * Supabase 대시보드 → Project Settings → API 에서 값을 복사해 넣으세요.
 * anon(public) 키는 브라우저에 공개돼도 되는 키예요. (데이터는 RLS로 보호돼요)
 * service_role 키는 절대 여기에 넣지 마세요.
 */
window.ERD_CONFIG = {
  supabaseUrl: '',      // 예: 'https://abcdefghijkl.supabase.co'
  supabaseAnonKey: '',  // 예: 'eyJhbGciOi...' 또는 'sb_publishable_...'

  // Supabase → Authentication → Providers 에서 켠 간편 로그인만 남기세요.
  providers: ['google', 'kakao', 'github']
};
