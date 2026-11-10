/* Mobile layout (≤ 860px): compact header with the ERD name, a ≡ menu for everything else,
   and the drawing tools in a dock floating over the canvas. Desktop is left untouched. */
(function () {
  'use strict';
  var mq = window.matchMedia('(max-width: 860px)');
  var $ = function (s) { return document.querySelector(s); };
  var bar = $('.bar'), seg = bar.querySelector('.seg'), add = $('#add-table'), wrap = $('.stage-wrap');
  var relId = $('#rel-id'), detailOn = $('#detail-on'), example = $('#example'), viewPop = $('#view-pop');
  var cloud = { configured: false, user: null };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ic(d) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>'; }
  var CHEV = '<svg class="i chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  /* ---- header: ERD name + status, and the ≡ button ---- */
  var title = document.createElement('div');
  title.className = 'm-title';
  title.innerHTML = '<b id="m-name"></b><small id="m-sub"></small>';
  bar.querySelector('.brand').insertAdjacentElement('afterend', title);
  var menuBtn = document.createElement('button');
  menuBtn.type = 'button'; menuBtn.id = 'm-menu-btn';
  menuBtn.setAttribute('aria-label', '메뉴 열기'); menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.setAttribute('aria-controls', 'm-menu');
  menuBtn.innerHTML = ic('<path d="M4 7h16M4 12h16M4 17h16"/>');
  bar.appendChild(menuBtn);

  function paintTitle() {
    var n = window.ERD && window.ERD.dbName ? window.ERD.dbName() : '';
    var c = window.ERD && window.ERD.counts ? window.ERD.counts() : { tables: 0, rels: 0 };
    $('#m-name').textContent = n || (cloud.title) || '이름 없는 ERD';
    var sub = '표 ' + c.tables + ' · 관계 ' + c.rels;
    var st = '';
    if (cloud.user && cloud.busy) st = ' · 저장 중…';
    else if (cloud.user && cloud.saved) st = cloud.dirty ? ' · <span class="dirty">저장 안 됨</span>' : ' · 저장됨';
    $('#m-sub').innerHTML = esc(sub) + st;
  }

  /* ---- dock: the drawing tools and "add table" float over the canvas on phones ---- */
  var dock = document.createElement('div');
  dock.className = 'dock'; dock.id = 'dock';
  wrap.appendChild(dock);
  var segHome = document.createComment('seg'), addHome = document.createComment('add');
  seg.parentNode.insertBefore(segHome, seg); add.parentNode.insertBefore(addHome, add);
  add.setAttribute('aria-label', '표 추가');
  function place() {
    if (mq.matches) { if (seg.parentNode !== dock) { dock.appendChild(seg); dock.appendChild(add); } }
    else if (seg.parentNode === dock) { segHome.parentNode.insertBefore(add, addHome.nextSibling); segHome.parentNode.insertBefore(seg, segHome.nextSibling); }
    if (!mq.matches) setMenu(false);
  }

  /* ---- ≡ menu ---- */
  var veil = document.createElement('div');
  veil.className = 'm-veil'; veil.hidden = true;
  veil.innerHTML = '<nav class="m-menu" id="m-menu" aria-label="메뉴"></nav>';
  document.body.appendChild(veil);
  var menu = veil.firstChild;

  function lineNow() { var b = viewPop.querySelector('[data-line][aria-pressed="true"]'); return b ? b.getAttribute('data-line') : 'ortho'; }
  function render() {
    var h = '';
    if (cloud.configured) {
      h += '<p class="m-h">계정 · 저장</p>';
      if (!cloud.user) {
        h += '<button type="button" class="m-row" data-m="cloud">' + ic('<path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 9.1 4.5 4.5 0 0 0 7 18z"/>') +
          '<span class="grow">로그인<small>Google · GitHub로 로그인하고 클라우드에 저장</small></span>' + CHEV + '</button>';
      } else {
        var u = cloud.user, clean = cloud.saved && !cloud.dirty;
        h += '<div class="m-row">' + (u.avatar ? '<img class="m-av" src="' + esc(u.avatar) + '" alt="" referrerpolicy="no-referrer">' : '<span class="m-av" aria-hidden="true">' + esc(u.name.slice(0, 1).toUpperCase()) + '</span>') +
          '<span class="grow">' + esc(u.name) + '<small>' + esc(cloud.saved ? cloud.title : '아직 클라우드에 저장하지 않았어요') + '</small></span>' +
          '<button type="button" class="btn ' + (clean ? 'clean' : 'primary') + '" data-m="save"' + (cloud.busy ? ' disabled' : '') + '>' + esc(cloud.saveLabel || '저장') + '</button></div>' +
          '<button type="button" class="m-row" data-m="cloud">' + ic('<path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 9.1 4.5 4.5 0 0 0 7 18z"/>') +
          '<span class="grow">내 ERD 목록 · 공유 · 계정</span>' + CHEV + '</button>';
      }
      h += '<div class="m-sep"></div>';
    }
    h += '<p class="m-h">그리기 옵션</p>' +
      '<label class="m-row" for="m-rel-id"><span class="grow">식별 관계<small>새 관계에서 자식 표의 키에 부모 키를 넣어요</small></span>' +
      '<span class="switch"><input type="checkbox" id="m-rel-id" data-m="ident"' + (relId.checked ? ' checked' : '') + '><span class="tr"></span></span></label>' +
      '<label class="m-row" for="m-detail"><span class="grow">상세 설정<small>데이터 타입 · 필수 · SQL 보기</small></span>' +
      '<span class="switch"><input type="checkbox" id="m-detail" data-m="detail"' + (detailOn.checked ? ' checked' : '') + '><span class="tr"></span></span></label>' +
      '<div class="m-row"><span class="grow" id="m-lines-l">선 모양</span><span class="m-lines" role="group" aria-labelledby="m-lines-l">' +
      [['curve', '곡선'], ['ortho', '직각'], ['straight', '직선']].map(function (l) { return '<button type="button" data-m="line" data-v="' + l[0] + '" aria-pressed="' + (lineNow() === l[0]) + '">' + l[1] + '</button>'; }).join('') +
      '</span></div>' +
      '<div class="m-sep"></div><p class="m-h">파일</p>' +
      '<label class="m-row" for="m-example">' + ic('<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M9 9.5V20"/>') + '<span class="grow">예제 불러오기</span>' +
      '<select class="m-sel" id="m-example" data-m="example"><option value="">고르기</option>' +
      Array.prototype.slice.call(example.options, 1).map(function (o) { return '<option value="' + esc(o.value) + '">' + esc(o.textContent) + '</option>'; }).join('') + '</select></label>' +
      (detailOn.checked ? '<button type="button" class="m-row" data-m="sql">' + ic('<path d="M8 8l-5 4 5 4M16 8l5 4-5 4M14 5l-4 14"/>') + '<span class="grow">SQL 보기</span>' + CHEV + '</button>' : '') +
      '<button type="button" class="m-row" data-m="json">' + ic('<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>') + '<span class="grow">JSON 내보내기 · 가져오기</span>' + CHEV + '</button>';
    menu.innerHTML = h;
  }
  function setMenu(on) {
    if (on === !veil.hidden) return;
    veil.hidden = !on;
    menuBtn.setAttribute('aria-expanded', String(on));
    menuBtn.setAttribute('aria-label', on ? '메뉴 닫기' : '메뉴 열기');
    menuBtn.innerHTML = on ? ic('<path d="M6 6l12 12M18 6L6 18"/>') : ic('<path d="M4 7h16M4 12h16M4 17h16"/>');
    if (on) { render(); var f = menu.querySelector('button, input, select'); if (f) f.focus({ preventScroll: true }); }
  }
  function fire(el) { el.dispatchEvent(new Event('change', { bubbles: true })); }

  menuBtn.addEventListener('click', function (e) { e.stopPropagation(); setMenu(veil.hidden); });
  veil.addEventListener('click', function (e) {
    e.stopPropagation();
    if (e.target === veil) { setMenu(false); return; }
    var b = e.target.closest('button[data-m]'); if (!b) return;
    var m = b.getAttribute('data-m');
    if (m === 'line') { var o = viewPop.querySelector('[data-line="' + b.getAttribute('data-v') + '"]'); if (o) o.click(); render(); return; }
    setMenu(false);
    if (m === 'cloud') $('#cloud-btn').click();
    else if (m === 'save') $('#cloud-save').click();
    else if (m === 'sql') $('#show-sql').click();
    else if (m === 'json') $('#show-json').click();
  });
  veil.addEventListener('change', function (e) {
    var m = e.target.getAttribute('data-m');
    if (m === 'ident') { relId.checked = e.target.checked; fire(relId); }
    else if (m === 'detail') { detailOn.checked = e.target.checked; fire(detailOn); render(); }
    else if (m === 'example' && e.target.value) { example.value = e.target.value; setMenu(false); fire(example); }
  });
  /* keep editor shortcuts (Delete, Ctrl+Z…) from acting while the menu has focus */
  veil.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') { setMenu(false); menuBtn.focus(); } });

  document.addEventListener('erd:change', paintTitle);
  document.addEventListener('erd:cloud', function (e) { cloud = e.detail || cloud; paintTitle(); if (!veil.hidden) render(); });

  /* iOS: after the keyboard closes the page can stay scrolled up and hide the header */
  function unscroll() { if (window.scrollY || document.documentElement.scrollTop) window.scrollTo(0, 0); }
  document.addEventListener('focusout', function () { setTimeout(unscroll, 60); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', function () { setTimeout(unscroll, 60); });

  if (mq.addEventListener) mq.addEventListener('change', place); else mq.addListener(place);
  if (window.ERD && window.ERD.cloudState) cloud = window.ERD.cloudState;
  place(); paintTitle();
})();
