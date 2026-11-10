/* Supabase 연결: 간편 로그인, 내 ERD 저장·불러오기, 읽기 전용 공유 링크
   흐름: 처음 한 번만 이름을 정해 저장하면, 그 뒤로는 헤더의 저장 버튼이나 Ctrl+S로 바로 덮어써요. */
(function () {
  'use strict';
  var CFG = window.ERD_CONFIG || {};
  var CUR_KEY = 'erd-cloud-current';
  var BLANK = { tables: [], rels: [], seq: 1 };
  var PROVIDERS = {
    google: { label: 'Google로 계속하기', cls: 'google',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h5.9a5.05 5.05 0 0 1-2.2 3.3v2.75h3.55c2.08-1.92 3.25-4.74 3.25-8.08z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.75c-.98.66-2.24 1.05-3.72 1.05-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.85 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.67-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.2 1.64l3.15-3.15A10.95 10.95 0 0 0 2.18 7.06l3.67 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>' },
    kakao: { label: '카카오로 계속하기', cls: 'kakao',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#191919" d="M12 3.5c-5.25 0-9.5 3.33-9.5 7.44 0 2.65 1.77 4.98 4.43 6.3l-.9 3.3c-.08.3.26.53.52.36l3.94-2.6c.5.06 1 .09 1.51.09 5.25 0 9.5-3.33 9.5-7.45S17.25 3.5 12 3.5z"/></svg>' },
    github: { label: 'GitHub로 계속하기', cls: 'github',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1.5a10.5 10.5 0 0 0-3.32 20.46c.53.1.72-.23.72-.5v-1.8c-2.92.63-3.54-1.4-3.54-1.4-.48-1.22-1.17-1.54-1.17-1.54-.95-.65.07-.64.07-.64 1.06.07 1.61 1.09 1.61 1.09.94 1.6 2.46 1.14 3.06.87.1-.68.37-1.14.66-1.4-2.33-.27-4.78-1.17-4.78-5.2 0-1.14.41-2.08 1.08-2.81-.11-.27-.47-1.33.1-2.77 0 0 .88-.28 2.89 1.08a10 10 0 0 1 5.26 0c2-1.36 2.88-1.08 2.88-1.08.58 1.44.22 2.5.11 2.77.67.73 1.08 1.67 1.08 2.81 0 4.04-2.46 4.93-4.8 5.19.38.33.71.97.71 1.96v2.9c0 .28.19.61.73.5A10.5 10.5 0 0 0 12 1.5z"/></svg>' }
  };

  var css = [
    '.cv .modal { width: min(560px, 100%); overflow-y: auto; }',
    '.cv #cv-body { gap: 18px; }',
    '.cv .hd { display: flex; align-items: center; gap: 10px; }',
    '.cv .hd h3 { flex: 1; }',
    '.cv .who { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; }',
    '.cv .who img, .cv .who .av { width: 30px; height: 30px; border-radius: 50%; flex: none; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; font-weight: 700; font-size: 13px; object-fit: cover; }',
    '.cv .who .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13.5px; }',
    '.cv .who .nm small { display: block; color: var(--muted); font-size: 12px; }',
    '.cv .blk { display: flex; flex-direction: column; gap: 8px; }',
    '.cv .blk > b, .cv .bh > b { font-size: 11.5px; font-weight: 700; letter-spacing: .06em; color: var(--muted); }',
    '.cv .bh { display: flex; align-items: center; justify-content: space-between; gap: 8px; }',
    '.cv .bh .btn { height: 30px; padding: 0 10px; font-size: 12.5px; }',
    '.cv .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }',
    '.cv .row .in { flex: 1; min-width: 160px; }',
    '.cv .doc { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; }',
    '.cv .doc .ttl { font-weight: 600; font-size: 15px; }',
    '.cv .st { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); }',
    '.cv .st::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }',
    '.cv .st.dirty { color: #b45309; }',
    '.cv .st.dirty::before { background: #f59e0b; }',
    '.cv .btn kbd { margin-left: 4px; font-size: 10.5px; opacity: .85; }',
    '.cv .muted { color: var(--muted); font-size: 12.5px; line-height: 1.6; margin: 0; }',
    '.cv .err { color: var(--danger); }',
    '.cv .sso { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; height: 44px; border-radius: 10px; border: 1px solid var(--line-2); background: var(--panel); color: var(--ink); font-weight: 600; font-size: 14px; }',
    '.cv .sso svg { width: 20px; height: 20px; }',
    '.cv .sso.kakao { background: #FEE500; border-color: #FEE500; color: #191919; }',
    '.cv .sso.github { background: #1f2328; border-color: #1f2328; color: #fff; }',
    '.cv .sso:hover { filter: brightness(.97); }',
    '.cv .list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; max-height: 280px; overflow-y: auto; }',
    '.cv .list li { display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 12px; font-size: 13.5px; }',
    '.cv .list li + li { border-top: 1px solid var(--line); }',
    '.cv .list li.on { background: var(--accent-soft); }',
    '.cv .list .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.cv .list .t small { display: block; color: var(--muted); font-size: 11.5px; }',
    '.cv .list .btn { height: 30px; padding: 0 10px; font-size: 12.5px; }',
    '.cv .list .empty { justify-content: center; color: var(--muted); padding: 16px; }',
    '.cv .tag { font-size: 10.5px; font-weight: 600; color: var(--accent); border: 1px solid var(--accent); border-radius: 5px; padding: 0 5px; margin-left: 6px; }',
    '#cloud-btn.on { color: var(--ink); }',
    '#cloud-label { max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '#cloud-save.clean { background: var(--panel); border-color: var(--line); color: var(--muted); }',
    '#cloud-save.clean:hover { color: var(--ink-2); }'
  ].join('\n');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var veil = document.createElement('div');
  veil.className = 'veil cv'; veil.hidden = true;
  veil.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="cv-title"><div class="hd"><h3 id="cv-title">내 ERD</h3><button class="btn ghost sq" type="button" data-a="close" aria-label="닫기">✕</button></div><div class="blk" id="cv-body"></div></div>';
  document.body.appendChild(veil);
  var body = veil.querySelector('#cv-body');
  var btn = document.getElementById('cloud-btn'), label = document.getElementById('cloud-label');
  var saveBtn = document.getElementById('cloud-save'), saveLabel = document.getElementById('cloud-save-label');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hint(t, warn, ms) { if (window.ERD) window.ERD.hint(t, warn, ms || 2800); }
  function fmt(d) { try { return new Date(d).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return d; } }
  /* short fingerprint of the board, so we can tell whether it changed since the last cloud save */
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return s.length + ':' + h; }
  function boardHash() { return hash(JSON.stringify(window.ERD.get())); }
  function getCur() { try { return JSON.parse(localStorage.getItem(CUR_KEY)) || null; } catch (e) { return null; } }
  function setCur(c) { cur = c; try { if (c) localStorage.setItem(CUR_KEY, JSON.stringify(c)); else localStorage.removeItem(CUR_KEY); } catch (e) { /* ignore */ } paintBtn(); }
  function isDirty() { return !!cur && cur.h !== boardHash(); }

  var configured = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
  var sb = null, user = null, cur = getCur(), list = [], busy = false, msg = '', msgErr = false;
  if (configured && window.supabase && window.supabase.createClient) {
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
  }

  function paintBtn() {
    btn.classList.toggle('on', !!user);
    label.textContent = !user ? '로그인' : cur ? cur.title : '내 ERD';
    btn.title = !user ? '로그인하고 클라우드에 저장' : '내 ERD 목록 · 공유 · 계정';
    saveBtn.hidden = !user;
    var dirty = isDirty(), clean = !!cur && !dirty;
    saveBtn.classList.toggle('clean', clean);
    saveBtn.classList.toggle('primary', !clean);
    saveLabel.textContent = busy ? '저장 중…' : clean ? '저장됨' : '저장';
    saveBtn.title = (cur ? '“' + cur.title + '”에 저장' : '클라우드에 새로 저장') + ' (Ctrl+S)';
    var m = user ? (user.user_metadata || {}) : null;
    try {
      var st = {
        configured: !!sb,
        user: user ? { name: m.full_name || m.name || m.user_name || m.preferred_username || user.email || '사용자', email: user.email || '', avatar: m.avatar_url || m.picture || '' } : null,
        title: cur ? cur.title : '', saved: !!cur, dirty: dirty, busy: busy, saveLabel: saveLabel.textContent
      };
      if (window.ERD) window.ERD.cloudState = st;  /* for scripts that load after this one */
      document.dispatchEvent(new CustomEvent('erd:cloud', { detail: st }));
    } catch (e) { /* ignore */ }
  }
  function say(t, err) { msg = t; msgErr = !!err; render(); }
  function defaultTitle() { return window.ERD && window.ERD.dbName && window.ERD.dbName() ? window.ERD.dbName() : window.ERD && window.ERD.firstName() ? window.ERD.firstName() + ' ERD' : '제목 없는 ERD'; }

  function render() {
    if (veil.hidden) return;
    var h = '', dis = busy ? ' disabled' : '';
    if (!configured) {
      h += '<p class="muted">아직 Supabase가 연결되지 않았어요. 저장소의 <b>config.js</b>에 Project URL과 anon 키를 넣으면 로그인하고 ERD를 저장할 수 있어요.</p>';
    } else if (!sb) {
      h += '<p class="muted err">Supabase 라이브러리를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.</p>';
    } else if (!user) {
      h += '<p class="muted">로그인하면 ERD를 클라우드에 저장하고, 다른 기기에서 불러오고, 링크로 공유할 수 있어요.</p>';
      (CFG.providers || ['google', 'kakao', 'github']).forEach(function (p) {
        var P = PROVIDERS[p]; if (!P) return;
        h += '<button type="button" class="sso ' + P.cls + '" data-a="login" data-p="' + p + '">' + P.icon + P.label + '</button>';
      });
    } else {
      var m = user.user_metadata || {}, name = m.full_name || m.name || m.user_name || m.preferred_username || user.email || '사용자';
      var av = m.avatar_url || m.picture;
      h += '<div class="who">' + (av ? '<img src="' + esc(av) + '" alt="" referrerpolicy="no-referrer">' : '<span class="av">' + esc(name.slice(0, 1).toUpperCase()) + '</span>') +
        '<span class="nm">' + esc(name) + (user.email && user.email !== name ? '<small>' + esc(user.email) + '</small>' : '') + '</span>' +
        '<button class="btn" type="button" data-a="logout">로그아웃</button></div>';

      if (cur) {
        var dirty = isDirty();
        h += '<div class="blk"><b>지금 열린 ERD</b><div class="doc">' +
          '<input class="in ttl" id="cv-ttl" maxlength="200" value="' + esc(cur.title) + '" aria-label="ERD 이름 (바꾸면 바로 반영돼요)" title="눌러서 이름 바꾸기" autocomplete="off">' +
          '<span class="st' + (dirty ? ' dirty' : '') + '">' + (dirty ? '저장하지 않은 변경 사항이 있어요' : '저장됨' + (cur.updated_at ? ' · ' + esc(fmt(cur.updated_at)) : '')) + '</span>' +
          '<div class="row"><button class="btn primary" type="button" data-a="save"' + (busy || !dirty ? ' disabled' : '') + '>저장<kbd>Ctrl+S</kbd></button>' +
          '<button class="btn" type="button" data-a="saveas"' + dis + '>사본으로 저장</button></div></div></div>';

        var link = location.origin + location.pathname + '?share=' + cur.share_id;
        h += '<div class="blk"><b>공유</b><label class="switch" for="cv-pub"><input type="checkbox" id="cv-pub" data-a="pub"' + (cur.is_public ? ' checked' : '') + dis + '><span class="tr"></span>링크가 있는 사람은 볼 수 있음 (읽기 전용)</label>' +
          (cur.is_public ? '<div class="row"><input class="in mono" id="cv-link" readonly value="' + esc(link) + '" aria-label="공유 링크"><button class="btn" type="button" data-a="copy">링크 복사</button></div>' +
            '<p class="muted">받은 사람은 그림을 보고 고쳐 볼 수 있지만, 원본은 바뀌지 않아요.</p>' : '') + '</div>';
      } else {
        h += '<div class="blk"><b>지금 보고 있는 ERD</b><p class="muted">아직 클라우드에 없어요. 이름을 정해 한 번만 저장하면, 다음부터는 헤더의 <b>저장</b> 버튼이나 <b>Ctrl+S</b>로 바로 저장돼요.</p>' +
          '<div class="row"><input class="in" id="cv-name" maxlength="200" value="' + esc(defaultTitle()) + '" aria-label="ERD 이름" autocomplete="off">' +
          '<button class="btn primary" type="button" data-a="create"' + dis + '>클라우드에 저장</button></div></div>';
      }

      h += '<div class="blk"><div class="bh"><b>내 ERD</b><button class="btn" type="button" data-a="new"' + dis + '>+ 새 ERD</button></div><ul class="list">';
      if (!list.length) h += '<li class="empty">' + (busy ? '불러오는 중…' : '저장한 ERD가 없어요') + '</li>';
      list.forEach(function (e) {
        var on = cur && cur.id === e.id;
        h += '<li class="' + (on ? 'on' : '') + '"><span class="t">' + esc(e.title) + (on ? '<span class="tag">열림</span>' : '') + (e.is_public ? '<span class="tag">공유</span>' : '') + '<small>' + esc(fmt(e.updated_at)) + '</small></span>' +
          (on ? '' : '<button class="btn" type="button" data-a="open" data-id="' + e.id + '"' + dis + '>열기</button>') +
          '<button class="btn danger" type="button" data-a="del" data-id="' + e.id + '" aria-label="' + esc(e.title) + ' 삭제"' + dis + '>삭제</button></li>';
      });
      h += '</ul></div>';
    }
    if (msg) h += '<p class="muted' + (msgErr ? ' err' : '') + '" role="status">' + esc(msg) + '</p>';
    var focusId = document.activeElement && veil.contains(document.activeElement) ? document.activeElement.id : '';
    body.innerHTML = h;
    if (focusId) { var f = document.getElementById(focusId); if (f && !f.disabled) f.focus(); }
  }

  function refreshList() {
    if (!sb || !user) return Promise.resolve();
    busy = true; render();
    return sb.from('erds').select('id,title,is_public,share_id,updated_at').order('updated_at', { ascending: false }).then(function (r) {
      busy = false;
      if (r.error) { say('목록을 불러오지 못했어요: ' + r.error.message, true); return; }
      list = r.data || [];
      if (cur) {  /* keep the current pointer in sync (or drop it if the row is gone) */
        var row = list.filter(function (e) { return e.id === cur.id; })[0];
        setCur(row ? { id: row.id, title: row.title, is_public: row.is_public, share_id: row.share_id, updated_at: row.updated_at, h: cur.h } : null);
      }
      render(); paintBtn();
    });
  }

  function open(focusName) {
    msg = ''; veil.hidden = false; render(); if (user) refreshList();
    var f = (focusName && document.getElementById('cv-name')) || veil.querySelector('button, input');
    if (f) { f.focus(); if (f.select && f.id === 'cv-name') f.select(); }
  }
  function close() { veil.hidden = true; }

  var COLS = 'id,title,is_public,share_id,updated_at';
  function doSave(title, asNew) {
    if (busy) return;
    var data = window.ERD.get(), h = hash(JSON.stringify(data));
    busy = true; paintBtn(); render();
    var q = (!asNew && cur)
      ? sb.from('erds').update({ data: data }).eq('id', cur.id).select(COLS).single()
      : sb.from('erds').insert({ title: title, data: data }).select(COLS).single();
    q.then(function (r) {
      busy = false;
      if (r.error) { paintBtn(); say('저장하지 못했어요: ' + r.error.message, true); hint('저장하지 못했어요', true); return; }
      r.data.h = h; setCur(r.data); msg = '';
      hint(asNew || !cur ? '“' + r.data.title + '”(으)로 클라우드에 저장했어요' : '저장했어요');
      if (!veil.hidden) refreshList();
    }, function () { busy = false; paintBtn(); hint('저장하지 못했어요. 인터넷 연결을 확인해 주세요', true); });
  }

  /* header 저장 button / Ctrl+S */
  function quickSave() {
    if (!sb || !user) { open(); return; }
    if (!cur) { open(true); return; }
    if (!isDirty()) { hint('이미 저장돼 있어요'); return; }
    doSave(cur.title, false);
  }

  function rename(t) {
    t = t.trim();
    if (!cur || !t || t === cur.title) { render(); return; }
    sb.from('erds').update({ title: t }).eq('id', cur.id).select(COLS).single().then(function (r) {
      if (r.error) { say('이름을 바꾸지 못했어요: ' + r.error.message, true); return; }
      r.data.h = cur.h; setCur(r.data); refreshList();
    });
  }

  function okToLeave() { return !isDirty() || confirm('“' + cur.title + '”에 저장하지 않은 변경 사항이 있어요. 저장하지 않고 넘어갈까요?'); }

  function load(id) {
    if (!okToLeave()) return;
    busy = true; render();
    sb.from('erds').select('id,title,is_public,share_id,updated_at,data').eq('id', id).single().then(function (r) {
      busy = false;
      if (r.error) { say('불러오지 못했어요: ' + r.error.message, true); return; }
      try { window.ERD.load(r.data.data); } catch (e) { say('저장된 내용의 형식이 맞지 않아요.', true); return; }
      setCur({ id: r.data.id, title: r.data.title, is_public: r.data.is_public, share_id: r.data.share_id, updated_at: r.data.updated_at, h: boardHash() });
      close(); hint('“' + r.data.title + '”을(를) 열었어요. 고친 뒤 Ctrl+S로 저장하세요', false, 3600);
    });
  }

  function newDoc() {
    if (!okToLeave()) return;
    window.ERD.load(JSON.parse(JSON.stringify(BLANK)));
    setCur(null); close(); hint('새 ERD를 시작했어요. 저장 버튼을 누르면 이름을 정해 저장해요', false, 3600);
  }

  function remove(id) {
    var e = list.filter(function (x) { return x.id === id; })[0];
    if (!e || !confirm('“' + e.title + '”을(를) 클라우드에서 삭제할까요? 되돌릴 수 없어요.')) return;
    sb.from('erds').delete().eq('id', id).then(function (r) {
      if (r.error) { say('삭제하지 못했어요: ' + r.error.message, true); return; }
      if (cur && cur.id === id) setCur(null);
      refreshList();
    });
  }

  function setPublic(on) {
    busy = true; render();
    sb.from('erds').update({ is_public: on }).eq('id', cur.id).select(COLS).single().then(function (r) {
      busy = false;
      if (r.error) { say('공유 설정을 바꾸지 못했어요: ' + r.error.message, true); return; }
      r.data.h = cur.h; setCur(r.data); msg = ''; refreshList();
    });
  }

  veil.addEventListener('click', function (e) {
    if (e.target === veil) { close(); return; }
    var b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    var a = b.getAttribute('data-a');
    if (a === 'close') close();
    else if (a === 'login') {
      sb.auth.signInWithOAuth({ provider: b.getAttribute('data-p'), options: { redirectTo: location.origin + location.pathname } })
        .then(function (r) { if (r.error) say('로그인을 시작하지 못했어요: ' + r.error.message, true); });
    }
    else if (a === 'logout') sb.auth.signOut().then(function () { setCur(null); list = []; render(); });
    else if (a === 'save') doSave(cur.title, false);
    else if (a === 'create') { var n = document.getElementById('cv-name'); doSave((n && n.value.trim()) || defaultTitle(), true); }
    else if (a === 'saveas') doSave(cur.title + ' 사본', true);
    else if (a === 'new') newDoc();
    else if (a === 'open') load(b.getAttribute('data-id'));
    else if (a === 'del') remove(b.getAttribute('data-id'));
    else if (a === 'copy') {
      var inp = document.getElementById('cv-link'); inp.select();
      try { navigator.clipboard.writeText(inp.value).then(function () { b.textContent = '복사됨'; setTimeout(function () { b.textContent = '링크 복사'; }, 1600); }); } catch (x) { /* selected for manual copy */ }
    }
  });
  veil.addEventListener('change', function (e) {
    if (e.target.getAttribute('data-a') === 'pub') setPublic(e.target.checked);
    else if (e.target.id === 'cv-ttl') rename(e.target.value);
  });
  /* keep editor shortcuts (Delete, Ctrl+Z ...) from firing while this dialog is open */
  veil.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && e.target.id === 'cv-name') { e.preventDefault(); doSave(e.target.value.trim() || defaultTitle(), true); }
    if (e.key === 'Enter' && e.target.id === 'cv-ttl') { e.preventDefault(); e.target.blur(); }
  });
  btn.addEventListener('click', function () { open(false); });
  saveBtn.addEventListener('click', quickSave);
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) { e.preventDefault(); quickSave(); }
  }, true);

  /* switching to an example / blank board / pasted JSON detaches from the cloud copy */
  if (window.ERD) {
    window.ERD.onReset = function () { setCur(null); };
    var tick = 0;
    window.ERD.onChange = function () { if (tick) return; tick = setTimeout(function () { tick = 0; paintBtn(); if (!veil.hidden && !busy) render(); }, 60); };
  }

  if (sb) {
    sb.auth.getSession().then(function (r) { user = r.data && r.data.session ? r.data.session.user : null; paintBtn(); });
    sb.auth.onAuthStateChange(function (ev, session) {
      var was = user; user = session ? session.user : null; paintBtn();
      if (ev === 'SIGNED_IN' && !was) { hint('로그인했어요. 저장 버튼이나 Ctrl+S로 저장할 수 있어요'); }
      if (!veil.hidden) { render(); if (user) refreshList(); }
    });
  }
  paintBtn();

  /* ?share=<id> : open someone's public ERD (read-only copy) */
  var share = new URLSearchParams(location.search).get('share');
  if (share) {
    var clean = location.origin + location.pathname;
    if (!sb) { hint(configured ? '공유된 ERD를 불러오지 못했어요' : '이 사이트는 아직 Supabase가 연결되지 않아 공유 링크를 열 수 없어요', true, 4200); }
    else {
      sb.rpc('get_shared_erd', { p_share_id: share }).then(function (r) {
        var row = r.data && r.data[0];
        if (r.error || !row) { hint('공유된 ERD를 찾을 수 없어요. 링크가 맞는지, 공유가 켜져 있는지 확인해 주세요', true, 4800); return; }
        try { window.ERD.load(row.data); } catch (e) { hint('공유된 ERD의 형식이 맞지 않아요', true, 4200); return; }
        setCur(null);
        try { history.replaceState(null, '', clean); } catch (e) { /* ignore */ }
        hint('공유받은 “' + row.title + '”을(를) 열었어요 (읽기 전용 사본). 원본은 바뀌지 않아요', false, 5200);
      });
    }
  }
})();
