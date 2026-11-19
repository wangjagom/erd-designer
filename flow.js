/* ABAP 프로그램 흐름(Program Flow)
   리포트 프로그램의 실행 흐름(이벤트 → PERFORM/FORM → SELECT …)을 코드 짜기 전에 설계하는 화면.
   흐름은 ERD와 같은 문서(S.flows)에 들어가서 저장·실행 취소·클라우드·버전 기록·공유가 그대로 따라가요.

   S.flows = [{ id, name, desc,
     forms: [{ id, name, desc, params: [{ id, mode: 'USING'|'CHANGING', byValue, name, type }] }],
     nodes: [{ id, lane: 'INIT'|'SSO'|'SS'|'SOS'|<form id>, kind, x, y, ...종류별 속성 }],
     edges: [{ id, from, to, label }] }]
   종류별 속성
     perform: { form, using: [], changing: [] }
     select:  { table, fields: [colId], single, into, where, access: 'R' }   (access: 사용표 C/R/U/D 자리)
     if:      { conds: [] }            case: { subject, whens: [] }
     message: { type: 'S'|'I'|'W'|'E'|'A'|'X', cls, no, with }
     write:   { text }                 end:  { op: 'RETURN'|'EXIT' } */
(function () {
  'use strict';
  var E = window.ERD; if (!E || !E.state) return;
  var U = E.ui, esc = function (s) { return U.esc(s == null ? '' : s); };
  var NS = 'http://www.w3.org/2000/svg';
  var $ = function (s) { return document.querySelector(s); };

  /* ---------------- ABAP 기준 정보 ---------------- */
  var EVENTS = [
    { id: 'INIT', name: 'INITIALIZATION', ko: '프로그램 시작', tip: '선택 화면이 뜨기 전에 한 번 실행돼요. 파라미터에 기본값을 넣을 때 써요.' },
    { id: 'SSO', name: 'AT SELECTION-SCREEN OUTPUT', ko: '선택 화면 표시 전', tip: '선택 화면이 화면에 그려지기 직전마다 실행돼요. 화면 모양(입력 가능 여부 등)을 바꿀 때 써요.' },
    { id: 'SS', name: 'AT SELECTION-SCREEN', ko: '입력 검사', tip: '실행(F8)을 누르면 입력값을 검사해요. 여기서 MESSAGE 타입 E를 띄우면 입력 화면에 머물고 START-OF-SELECTION은 실행되지 않아요.' },
    { id: 'SOS', name: 'START-OF-SELECTION', ko: '본 처리', tip: '입력 검사를 통과하면 실행돼요. 데이터를 읽고 출력해요.' }
  ];
  var EV = {}; EVENTS.forEach(function (e, i) { EV[e.id] = e; e.no = i + 1; });
  var KINDS = {
    perform: { label: 'PERFORM', ko: '서브루틴 호출', c: 's1' },
    select: { label: 'SELECT', ko: 'DB 읽기', c: 's0' },
    'if': { label: 'IF', ko: '조건 분기', c: 's2' },
    'case': { label: 'CASE', ko: '값별 분기', c: 's2' },
    message: { label: 'MESSAGE', ko: '메시지', c: 's4' },
    write: { label: 'WRITE', ko: '출력', c: 's5' },
    end: { label: '종료', ko: 'RETURN · EXIT', c: 's5' }
  };
  var ORDER = ['perform', 'select', 'if', 'case', 'message', 'write', 'end'];
  var MSG = {
    S: '상태 표시줄에 보여 주고 계속 진행해요.',
    I: '팝업 창으로 보여 주고, 확인을 누르면 계속 진행해요.',
    W: '경고예요. 입력 검사(AT SELECTION-SCREEN)에서는 입력 화면에 머물러요.',
    E: '오류예요. AT SELECTION-SCREEN에서는 입력 화면에 머물고 START-OF-SELECTION은 실행되지 않아요. 다른 이벤트에서는 처리가 끝나요.',
    A: '중단이에요. 프로그램을 끝내요.',
    X: '런타임 오류(덤프)를 내고 끝내요.'
  };
  var END = {
    RETURN: 'FORM 안에서는 FORM을 끝내고 PERFORM한 곳으로 돌아가요. 이벤트 블록에서는 그 이벤트 처리를 끝내요.',
    EXIT: '반복문(LOOP, 아직 안 배움) 밖에서 쓰면 RETURN처럼 지금 처리 블록(FORM·이벤트)을 끝내요.'
  };

  /* ---------------- 문서 접근 ---------------- */
  function S() { return E.state(); }
  function flows() { return S().flows || []; }
  function ro() { return E.isPreviewing && E.isPreviewing(); }
  var CUR_KEY = 'erd-flow-cur', curId = null;
  try { curId = localStorage.getItem(CUR_KEY); } catch (e) { /* ignore */ }
  function norm(f) { if (!f.forms) f.forms = []; if (!f.nodes) f.nodes = []; if (!f.edges) f.edges = []; return f; }
  function cur() {
    var fs = flows(), f = null;
    for (var i = 0; i < fs.length; i++) if (fs[i].id === curId) f = fs[i];
    if (!f && fs.length) { f = fs[0]; setCur(f.id); }
    return f ? norm(f) : null;
  }
  function setCur(id) { curId = id; try { localStorage.setItem(CUR_KEY, id || ''); } catch (e) { /* ignore */ } }
  function N(f, id) { for (var i = 0; i < f.nodes.length; i++) if (f.nodes[i].id === id) return f.nodes[i]; return null; }
  function FM(f, id) { for (var i = 0; i < f.forms.length; i++) if (f.forms[i].id === id) return f.forms[i]; return null; }
  function ED(f, id) { for (var i = 0; i < f.edges.length; i++) if (f.edges[i].id === id) return f.edges[i]; return null; }
  function TB(id) { var t = S().tables; for (var i = 0; i < t.length; i++) if (t[i].id === id) return t[i]; return null; }
  function COL(t, id) { for (var i = 0; i < t.cols.length; i++) if (t.cols[i].id === id) return t.cols[i]; return null; }
  function laneName(f, lane) { return EV[lane] ? EV[lane].name : (FM(f, lane) ? 'FORM ' + (FM(f, lane).name || '(이름 없음)') : '(지워진 FORM)'); }
  function access(n) { return n.access || (n.kind === 'select' ? 'R' : ''); }
  function words(s) { return String(s || '').split(/[\s,]+/).filter(Boolean); }
  /* 글자 폭으로 자르기: 한글은 넓게, 영문·숫자는 좁게 셈해요 */
  function fitText(str, px, fs, mono) {
    str = String(str == null ? '' : str);
    var w = 0, lat = fs * (mono ? 0.6 : 0.56);
    for (var i = 0; i < str.length; i++) {
      w += str.charCodeAt(i) > 0x2e80 ? fs : lat;
      if (w > px) return str.slice(0, Math.max(0, i - 1)) + '…';
    }
    return str;
  }
  function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  var fsel = null;        /* { type: 'node'|'lane'|'edge', id } */
  var connect = false, connFrom = null;
  var FV = { x: 40, y: 40, k: 1 }, fitted = {};

  function save() { E.commit(); draw(); E.renderSide(); paintTools(); }
  function selectF(s) { fsel = s; if (U.sheet) U.sheet(null); draw(); E.renderSide(); }

  /* ---------------- ABAP 한 줄 미리보기 (2단계 뼈대 코드 생성에도 그대로 씀) ---------------- */
  function selectFields(n, t) { return (n.fields || []).map(function (id) { var c = t && COL(t, id); return c ? c.name.toLowerCase() : null; }).filter(Boolean); }
  function abapOf(f, n) {
    var k = n.kind;
    if (k === 'perform') {
      var fm = FM(f, n.form), s = 'PERFORM ' + (fm ? (fm.name || '?').toLowerCase() : '?');
      if ((n.using || []).length) s += ' USING ' + n.using.join(' ');
      if ((n.changing || []).length) s += ' CHANGING ' + n.changing.join(' ');
      return s + '.';
    }
    if (k === 'select') {
      var t = TB(n.table), fl = selectFields(n, t);
      return 'SELECT ' + (n.single !== false ? 'SINGLE ' : '') + (fl.length ? fl.join(' ') : '*') + ' FROM ' + (t ? t.name.toLowerCase() : '?') +
        (n.into ? ' INTO ' + n.into : '') + (n.where ? ' WHERE ' + n.where : '') + '.';
    }
    if (k === 'if') return (n.conds || []).map(function (c, i) { return (i ? 'ELSEIF ' : 'IF ') + (c || '…') + '.'; }).join(' ') + ' ELSE. ENDIF.';
    if (k === 'case') return 'CASE ' + (n.subject || '…') + '. ' + (n.whens || []).map(function (w) { return 'WHEN ' + (w || '…') + '.'; }).join(' ') + ' WHEN OTHERS. ENDCASE.';
    if (k === 'message') return 'MESSAGE ' + (n.type || 'I').toLowerCase() + (n.no || '000') + '(' + (n.cls || 'zmc05c') + ')' + (n.with ? ' WITH ' + n.with : '') + '.';
    if (k === 'write') return 'WRITE ' + (n.text || "/ '…'") + '.';
    if (k === 'end') return (n.op || 'RETURN') + '.';
    return '';
  }

  /* 분기 노드에서 나가는 연결에 붙일 수 있는 라벨 */
  function branchLabels(n) {
    if (n.kind === 'if') { var c = (n.conds || []).filter(function (x) { return x !== undefined; }); return c.length <= 1 ? ['참', '거짓'] : c.map(function (x, i) { return (i ? 'ELSEIF ' : 'IF ') + (x || '…'); }).concat(['ELSE']); }
    if (n.kind === 'case') return (n.whens || []).map(function (w) { return 'WHEN ' + (w || '…'); }).concat(['WHEN OTHERS']);
    return [];
  }

  /* ---------------- 노드 내용(그림용 줄) ---------------- */
  function brokenOf(f, n) {
    if (n.kind === 'perform') return n.form && !FM(f, n.form) ? 'FORM이 지워졌어요' : '';
    if (n.kind === 'select') {
      if (n.table && !TB(n.table)) return '연결 끊김 · ERD에서 표가 지워졌어요';
      var t = TB(n.table), gone = t ? (n.fields || []).filter(function (id) { return !COL(t, id); }).length : 0;
      return gone ? '연결 끊김 · 지워진 필드 ' + gone + '개' : '';
    }
    return '';
  }
  function linesOf(f, n) {
    var L = [], k = n.kind;
    if (k === 'perform') {
      var fm = FM(f, n.form);
      L.push({ t: fm ? (fm.name || '(이름 없음)').toLowerCase() : n.form ? '(지워진 FORM)' : 'FORM을 고르세요', c: fm ? 'fn-main mono' : 'fn-main muted' });
      if ((n.using || []).length) L.push({ t: 'USING ' + n.using.join(' '), c: 'fn-code' });
      if ((n.changing || []).length) L.push({ t: 'CHANGING ' + n.changing.join(' '), c: 'fn-code' });
    } else if (k === 'select') {
      var t = TB(n.table);
      L.push({ t: t ? t.name + (t.ko ? '  ' + t.ko : '') : n.table ? '(지워진 표)' : '테이블을 고르세요', c: t ? 'fn-main mono' : 'fn-main muted' });
      var fl = t ? selectFields(n, t) : [];
      L.push({ t: (n.single !== false ? 'SINGLE ' : '') + (fl.length ? fl.join(' ') : '필드 선택 안 됨'), c: 'fn-code' });
      if (n.where) L.push({ t: 'WHERE ' + n.where, c: 'fn-code' });
    } else if (k === 'if') {
      (n.conds || ['']).forEach(function (c, i) { L.push({ t: (i ? 'ELSEIF ' : 'IF ') + (c || '조건을 적으세요'), c: c ? 'fn-code' : 'fn-code muted' }); });
    } else if (k === 'case') {
      L.push({ t: 'CASE ' + (n.subject || '…'), c: 'fn-code' });
      L.push({ t: (n.whens || []).map(function (w) { return 'WHEN ' + (w || '…'); }).join(' · ') + ' · OTHERS', c: 'fn-code' });
    } else if (k === 'message') {
      L.push({ t: (n.type || 'I').toLowerCase() + (n.no || '000') + '(' + (n.cls || 'zmc05c') + ')' + (n.with ? ' WITH ' + n.with : ''), c: 'fn-main mono' });
      if (n.type === 'E' && n.lane === 'SS') L.push({ t: '→ 화면에 머묾 · 4번 실행 안 됨', c: 'fn-warn' });
      else if (n.type === 'E' || n.type === 'A' || n.type === 'X') L.push({ t: '→ 여기서 처리가 끝나요', c: 'fn-warn' });
    } else if (k === 'write') {
      L.push({ t: n.text || "/ '출력할 내용'", c: n.text ? 'fn-code' : 'fn-code muted' });
    } else if (k === 'end') {
      L.push({ t: n.op || 'RETURN', c: 'fn-main mono' });
    }
    return L;
  }

  /* ---------------- 배치 계산 ---------------- */
  var NW = 236, LH = 18, HEAD = 58, PAD = 16, GAP = 40, ROWGAP = 90, MINW = 268, MINH = 150;
  function nodeH(f, n) { return 30 + linesOf(f, n).length * LH + (brokenOf(f, n) ? LH : 0) + 8; }
  function layout(f) {
    var lanes = [], byId = {};
    function mk(id, kind) {
      var ns = f.nodes.filter(function (n) { return n.lane === id; }), w = MINW, h = MINH;
      ns.forEach(function (n) { w = Math.max(w, n.x + NW + PAD * 2); h = Math.max(h, HEAD + n.y + nodeH(f, n) + PAD * 2); });
      var L = { id: id, kind: kind, w: w, h: h, nodes: ns }; lanes.push(L); byId[id] = L; return L;
    }
    var x = 0, rowH = 0;
    EVENTS.forEach(function (e) { var L = mk(e.id, 'event'); L.x = x; L.y = 0; x += L.w + GAP; rowH = Math.max(rowH, L.h); });
    EVENTS.forEach(function (e) { byId[e.id].h = rowH; });   /* 이벤트 줄은 높이를 맞춰요 */
    x = 0;
    var y2 = rowH + ROWGAP;
    f.forms.forEach(function (fm) { var L = mk(fm.id, 'form'); L.x = x; L.y = y2; x += L.w + GAP; });
    /* 지워진 FORM을 가리키는 노드가 남아 있으면 보이게 따로 모아 둬요 */
    var orphan = f.nodes.filter(function (n) { return !EV[n.lane] && !FM(f, n.lane); });
    if (orphan.length) { orphan.forEach(function (n) { n.lane = 'SOS'; }); return layout(f); }
    return { lanes: lanes, byId: byId };
  }
  function nodeBox(f, lay, n) {
    var L = lay.byId[n.lane]; if (!L) return null;
    return { x: L.x + PAD + n.x, y: L.y + HEAD + PAD + n.y, w: NW, h: nodeH(f, n) };
  }

  /* ---------------- 스타일 ---------------- */
  var css = [
    '#fstage { position: absolute; inset: 0; width: 100%; height: 100%; display: none; touch-action: none; background: var(--bg); }',
    'html.mode-flow #fstage { display: block; }',
    '#fstage.panning { cursor: grabbing; }',
    '#fstage.connecting .fnode { cursor: crosshair; }',
    '#fstage text { pointer-events: none; }',
    '#fstage, #fstage * { -webkit-user-select: none; user-select: none; }',
    '.flane-bg { fill: var(--panel); stroke: var(--line); stroke-width: 1; }',
    '.flane.form .flane-bg { fill: var(--bg); stroke: var(--line-2); stroke-dasharray: 6 4; }',
    '.flane.empty .flane-bg { fill: none; }',
    '.flane.sel .flane-bg { stroke: var(--accent); stroke-width: 2; stroke-dasharray: none; }',
    '.flane-head { fill: var(--head); }',
    '.flane.form .flane-head { fill: transparent; }',
    '.fl-no { fill: var(--accent); } .fl-no-t { font: 700 11px var(--font-ui); fill: #fff; }',
    '.fl-name { font: 700 13px var(--font-mono); fill: var(--ink); }',
    '.fl-ko { font: 500 12px var(--font-ui); fill: var(--muted); }',
    '.flane.empty .fl-name, .flane.empty .fl-ko { opacity: .55; }',
    '.fl-hint { font: 400 12px var(--font-ui); fill: var(--muted); opacity: .8; }',
    '.fl-arrow { fill: none; stroke: var(--line-2); stroke-width: 1.6; }',
    '.fnode { cursor: grab; }',
    '.fn-box { fill: var(--node); stroke: var(--card-line); stroke-width: 1; filter: drop-shadow(0 1px 2px rgb(16 24 40 / .06)) drop-shadow(0 3px 8px rgb(16 24 40 / .06)); }',
    '.fnode:hover .fn-box { stroke: var(--card-line-2); }',
    '.fnode.sel .fn-box { stroke: var(--accent); stroke-width: 2; }',
    '.fnode.from .fn-box { stroke: var(--accent); stroke-width: 2; stroke-dasharray: 6 4; }',
    '.fnode.broken .fn-box { stroke: var(--danger); }',
    '.fnode.dim { opacity: .4; }',
    '.fn-bar.s0 { fill: var(--s0); } .fn-bar.s1 { fill: var(--s1); } .fn-bar.s2 { fill: var(--s2); } .fn-bar.s3 { fill: var(--s3); } .fn-bar.s4 { fill: var(--s4); } .fn-bar.s5 { fill: var(--s5); }',
    '.fn-kind { font: 700 10.5px var(--font-mono); fill: var(--muted); letter-spacing: .04em; }',
    '.fn-ko { font: 500 11px var(--font-ui); fill: var(--muted); }',
    '.fn-main { font: 600 13px var(--font-ui); fill: var(--ink); }',
    '.fn-main.mono { font: 600 12.5px var(--font-mono); }',
    '.fn-code { font: 400 11.5px var(--font-mono); fill: var(--ink-2); }',
    '.fnode .muted { fill: var(--muted); font-style: italic; }',
    '.fn-warn { font: 600 11px var(--font-ui); fill: var(--danger); }',
    '.fn-broken { font: 600 11px var(--font-ui); fill: var(--danger); }',
    '.fedge path.l { fill: none; stroke: var(--edge); stroke-width: 1.6; stroke-linejoin: round; }',
    '.fedge.sel path.l, .fedge.hot path.l, .fedge:hover path.l { stroke: var(--accent); stroke-width: 2; }',
    '.fedge path.h { fill: none; stroke: transparent; stroke-width: 16; cursor: pointer; }',
    '.fe-chip { fill: var(--panel); stroke: var(--line-2); } .fedge.sel .fe-chip { stroke: var(--accent); }',
    '.fe-t { font: 600 11px var(--font-ui); fill: var(--ink-2); }',
    '.fcall { fill: none; stroke: var(--s1); stroke-width: 1.4; stroke-dasharray: 5 5; opacity: .55; }',
    '.fcall.hot { opacity: 1; stroke-width: 2; }',
    '#farrow path { fill: var(--edge); } #farrow-hot path { fill: var(--accent); } #fcallarrow path { fill: var(--s1); }',
    /* toolbar */
    '.ftools { display: flex; align-items: center; gap: 8px; }',
    '.ftools select.btn { max-width: 190px; }',
    '.ftools .seg button { font-family: var(--font-mono); font-size: 12px; letter-spacing: .02em; }',
    '.ftools .seg button.k-end { font-family: var(--font-ui); }',
    '#f-connect[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }',
    /* empty state */
    '.fempty { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; padding: 24px; text-align: center; }',
    'html.mode-flow .fempty.on { display: flex; }',
    '.fempty .box { max-width: 420px; display: flex; flex-direction: column; align-items: center; gap: 12px; }',
    '.fempty h3 { margin: 0; font-size: 17px; }',
    '.fempty p { margin: 0; color: var(--muted); font-size: 13.5px; line-height: 1.7; }',
    /* inspector */
    '.fcode { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--bg); border: 1px solid var(--line); font: 400 12px/1.6 var(--font-mono); color: var(--ink-2); white-space: pre-wrap; word-break: break-all; }',
    '.fwarn { margin: 0; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--danger); color: var(--danger); font-size: 12.5px; line-height: 1.6; }',
    '.ftip { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--bg); color: var(--ink-2); font-size: 12.5px; line-height: 1.65; }',
    '.ffields { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }',
    '.ffields li + li { border-top: 1px solid var(--line); }',
    '.ffields label { display: flex; align-items: center; gap: 10px; padding: 8px 12px; cursor: pointer; font-size: 13px; }',
    '.ffields label:hover { background: var(--bg); }',
    '.ffields input { accent-color: var(--accent); width: 16px; height: 16px; margin: 0; }',
    '.ffields .fk-n { font: 600 12.5px var(--font-mono); min-width: 0; }',
    '.ffields .fk-d { color: var(--muted); font-size: 12px; margin-left: auto; text-align: right; }',
    '.ffields .fk-pk { font: 700 9.5px var(--font-mono); color: var(--pk); border: 1px solid var(--pk); border-radius: 4px; padding: 0 4px; }',
    '.ffields li.gone label { color: var(--danger); }',
    '.frow { display: flex; gap: 6px; align-items: center; }',
    '.frow .in { flex: 1; min-width: 0; }',
    '.frow .lbl { font: 600 11px var(--font-mono); color: var(--muted); width: 58px; flex: none; }',
    '.fparams { display: flex; flex-direction: column; gap: 8px; }',
    '.fparam { display: grid; grid-template-columns: 96px minmax(0, 1fr) 32px; gap: 6px; align-items: center; padding: 8px; border: 1px solid var(--line); border-radius: 10px; }',
    '.fparam .in { height: 32px; font-size: 12.5px; }',
    '.fparam .wide { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px; }',
    '.fparam .chk { font-size: 12px; color: var(--ink-2); grid-column: 1 / -1; }',
    '.fadd { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }',
    '.fadd button { height: 34px; border: 1px solid var(--line); border-radius: 9px; background: var(--panel); color: var(--ink-2); font: 600 11.5px var(--font-mono); }',
    '.fadd button:hover { border-color: var(--accent); color: var(--accent); }',
    '.flist { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }',
    '.flist li + li { border-top: 1px solid var(--line); }',
    '.flist button { display: flex; gap: 8px; align-items: center; width: 100%; padding: 9px 12px; border: 0; background: var(--panel); text-align: left; font-size: 12.5px; color: var(--ink-2); }',
    '.flist button:hover { background: var(--bg); }',
    '.flist .tag { font: 600 10.5px var(--font-mono); color: var(--muted); border: 1px solid var(--line-2); border-radius: 5px; padding: 0 5px; flex: none; }',
    '.flist .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.fsegm { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px; }',
    '.fsegm button { height: 34px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); font: 700 13px var(--font-mono); color: var(--ink-2); }',
    '.fsegm button[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }',
    '.fsegm.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }',
    '.fbtns { display: flex; gap: 6px; flex-wrap: wrap; }',
    '.fbtns .btn { height: 32px; font-size: 12.5px; padding: 0 10px; }',
    /* usage table */
    '.fu .modal { width: min(920px, 100%); }',
    '.fu-wrap { overflow: auto; max-height: min(60vh, 520px); border: 1px solid var(--line); border-radius: 12px; }',
    '.fu table { border-collapse: collapse; width: 100%; font-size: 13px; }',
    '.fu th, .fu td { border-bottom: 1px solid var(--line); border-right: 1px solid var(--line); padding: 8px 10px; text-align: center; white-space: nowrap; }',
    '.fu thead th { position: sticky; top: 0; background: var(--head); font: 700 12px var(--font-mono); z-index: 1; }',
    '.fu thead th small { display: block; font: 500 11px var(--font-ui); color: var(--muted); }',
    '.fu tbody th { text-align: left; font: 600 12.5px var(--font-mono); background: var(--panel); position: sticky; left: 0; }',
    '.fu tbody th small { display: block; font: 500 11px var(--font-ui); color: var(--muted); }',
    '.fu td.on { font: 700 13px var(--font-mono); color: var(--accent); background: var(--accent-soft); }',
    '.fu td.via { font: 600 12.5px var(--font-mono); color: var(--accent); opacity: .7; }',
    '.fu thead th.gone { color: var(--danger); }',
    '.fu .head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }',
    '.fu .head h3 { flex: 1; }',
    /* mobile dock */
    '.fdock { display: none; }',
    '@media (max-width: 860px) {',
    '  html.mode-flow .dock { display: none !important; }',
    '  html.mode-flow .fdock { display: flex; position: absolute; left: 12px; right: 12px; bottom: 22px; z-index: 3; gap: 4px; padding: 4px; overflow-x: auto; border-radius: 16px; background: var(--panel); border: 1px solid var(--line); box-shadow: 0 6px 18px rgb(16 24 40 / .12); scrollbar-width: none; }',
    '  .fdock button { flex: none; height: 44px; padding: 0 12px; border: 0; border-radius: 12px; background: transparent; color: var(--ink-2); font: 600 12px var(--font-mono); }',
    '  .fdock button[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }',
    '  html.previewing .fdock { display: none !important; }',
    '  .fadd { grid-template-columns: repeat(3, minmax(0, 1fr)); }',
    '}'
  ].join('\n');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ---------------- 캔버스 ---------------- */
  var wrap = $('.stage-wrap');
  var svg = document.createElementNS(NS, 'svg');
  svg.id = 'fstage'; svg.setAttribute('role', 'application'); svg.setAttribute('aria-label', '프로그램 흐름 그림판');
  svg.innerHTML = '<defs><pattern id="fdots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.2" fill="var(--dot)"/></pattern>' +
    '<marker id="farrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker>' +
    '<marker id="farrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker>' +
    '<marker id="fcallarrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>' +
    '<rect width="100%" height="100%" fill="url(#fdots)" id="fgrid"/><g id="fworld"><g id="f-lanes"></g><g id="f-calls"></g><g id="f-edges"></g><g id="f-nodes"></g></g>';
  wrap.insertBefore(svg, $('#stage').nextSibling);
  var world = svg.querySelector('#fworld'), gL = svg.querySelector('#f-lanes'), gC = svg.querySelector('#f-calls'), gE = svg.querySelector('#f-edges'), gN = svg.querySelector('#f-nodes');
  var empty = document.createElement('div');
  empty.className = 'fempty';
  empty.innerHTML = '<div class="box"><h3>프로그램 흐름이 아직 없어요</h3><p>리포트 프로그램의 실행 순서(이벤트 → PERFORM/FORM → SELECT)를 코드 짜기 전에 그려 보세요. SELECT는 이 ERD의 표·필드와 이어져요.</p><button class="btn primary" type="button" data-fa="newflow">+ 새 흐름 만들기</button></div>';
  wrap.appendChild(empty);
  var fdock = document.createElement('div');
  fdock.className = 'fdock'; fdock.setAttribute('role', 'group'); fdock.setAttribute('aria-label', '흐름 노드 추가');
  wrap.appendChild(fdock);

  function el(name, attrs, parent, text) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n); return n;
  }
  function applyView() {
    world.setAttribute('transform', 'translate(' + FV.x + ',' + FV.y + ') scale(' + FV.k + ')');
    svg.querySelector('#fdots').setAttribute('patternTransform', 'translate(' + FV.x + ',' + FV.y + ') scale(' + FV.k + ')');
    if (E.mode() === 'flow') $('#zoom-val').textContent = Math.round(FV.k * 100) + '%';
  }
  function clear(g) { while (g.firstChild) g.removeChild(g.firstChild); }

  function draw() {
    paintTools();
    if (E.mode() !== 'flow') return;
    var f = cur();
    empty.classList.toggle('on', !f);
    clear(gL); clear(gC); clear(gE); clear(gN);
    if (!f) { applyView(); return; }
    if (!fitted[f.id]) { fitted[f.id] = 1; requestAnimationFrame(fit); }
    var lay = layout(f), sn = fsel && fsel.type === 'node' ? N(f, fsel.id) : null;

    /* 이벤트 블록(실행 순서 고정)과 FORM 블록 */
    lay.lanes.forEach(function (L, i) {
      var isEv = L.kind === 'event', on = fsel && fsel.type === 'lane' && fsel.id === L.id;
      var g = el('g', { 'class': 'flane ' + L.kind + (on ? ' sel' : '') + (!L.nodes.length ? ' empty' : ''), 'data-l': L.id, transform: 'translate(' + L.x + ',' + L.y + ')' }, gL);
      el('rect', { width: L.w, height: L.h, rx: 14, 'class': 'flane-bg' }, g);
      el('path', { d: 'M0 ' + HEAD + 'V14a14 14 0 0 1 14-14H' + (L.w - 14) + 'a14 14 0 0 1 14 14V' + HEAD + 'Z', 'class': 'flane-head' }, g);
      if (isEv) {
        el('circle', { cx: 24, cy: 22, r: 10, 'class': 'fl-no' }, g);
        el('text', { x: 24, y: 26, 'text-anchor': 'middle', 'class': 'fl-no-t' }, g, String(EV[L.id].no));
        el('text', { x: 42, y: 26, 'class': 'fl-name' }, g, EV[L.id].name);
        el('text', { x: 42, y: 44, 'class': 'fl-ko' }, g, EV[L.id].ko);
        if (i < EVENTS.length - 1) el('path', { d: 'M' + (L.w + 6) + ' 22H' + (L.w + GAP - 6), 'class': 'fl-arrow', 'marker-end': 'url(#farrow)' }, g);
      } else {
        var fm = FM(f, L.id);
        el('text', { x: 16, y: 26, 'class': 'fl-name' }, g, fitText('FORM ' + (fm.name || '(이름 없음)').toLowerCase(), L.w - 32, 13, true));
        el('text', { x: 16, y: 44, 'class': 'fl-ko' }, g, fitText(signature(fm) || fm.desc || '파라미터 없음', L.w - 32, 12, false));
      }
      if (!L.nodes.length) el('text', { x: 16, y: HEAD + 30, 'class': 'fl-hint' }, g, isEv ? '이 블록은 비어 있어요' : '노드를 추가해 FORM 안을 채우세요');
    });

    /* PERFORM → FORM 호출선(저장하지 않고 그때그때 그려요) */
    f.nodes.forEach(function (n) {
      if (n.kind !== 'perform' || !FM(f, n.form) || !lay.byId[n.form]) return;
      var b = nodeBox(f, lay, n), L = lay.byId[n.form], hot = (sn && sn.id === n.id) || (fsel && fsel.type === 'lane' && fsel.id === n.form);
      var left = L.x + L.w / 2 < b.x, x1 = left ? b.x : b.x + b.w, y1 = b.y + 18, x2 = L.x + L.w / 2, y2 = L.y - 4;
      el('path', { d: 'M' + x1 + ' ' + y1 + 'C' + (x1 + (left ? -70 : 70)) + ' ' + y1 + ' ' + x2 + ' ' + (y2 - 90) + ' ' + x2 + ' ' + y2, 'class': 'fcall' + (hot ? ' hot' : ''), 'marker-end': 'url(#fcallarrow)' }, gC);
    });

    /* 순서 화살표 */
    f.edges.forEach(function (e) {
      var a = N(f, e.from), b = N(f, e.to); if (!a || !b) return;
      var A = nodeBox(f, lay, a), B = nodeBox(f, lay, b); if (!A || !B) return;
      var on = fsel && fsel.type === 'edge' && fsel.id === e.id, hot = sn && (sn.id === a.id || sn.id === b.id);
      var g = el('g', { 'class': 'fedge' + (on ? ' sel' : '') + (hot ? ' hot' : ''), 'data-e': e.id }, gE), d, lx, ly;
      if (B.y >= A.y + A.h + 12) {               /* 아래로 */
        var x1 = A.x + A.w / 2, y1 = A.y + A.h, x2 = B.x + B.w / 2, y2 = B.y, my = y1 + Math.max(14, (y2 - y1) / 2);
        d = x1 === x2 ? 'M' + x1 + ' ' + y1 + 'V' + (y2 - 2) : 'M' + x1 + ' ' + y1 + 'V' + my + 'H' + x2 + 'V' + (y2 - 2);
        lx = x1; ly = y1 + 14;
      } else if (B.x >= A.x + A.w + 12 || B.x + B.w <= A.x - 12) {   /* 옆으로 */
        var right = B.x > A.x, sx = right ? A.x + A.w : A.x, ex = right ? B.x : B.x + B.w, sy = A.y + A.h / 2, ey = B.y + B.h / 2, mx = (sx + ex) / 2;
        d = 'M' + sx + ' ' + sy + 'H' + mx + 'V' + ey + 'H' + (ex + (right ? -2 : 2));
        lx = sx + (right ? 26 : -26); ly = sy;
      } else {                                    /* 위로 되돌아가기 */
        var rx = Math.max(A.x + A.w, B.x + B.w) + 28, ay = A.y + A.h / 2, by = B.y + B.h / 2;
        d = 'M' + (A.x + A.w) + ' ' + ay + 'H' + rx + 'V' + by + 'H' + (B.x + B.w + 2);
        lx = A.x + A.w + 16; ly = ay;
      }
      el('path', { d: d, 'class': 'l', 'marker-end': on || hot ? 'url(#farrow-hot)' : 'url(#farrow)' }, g);
      el('path', { d: d, 'class': 'h' }, g);
      if (e.label) {
        var tw = Math.min(160, e.label.length * 7 + 16);
        el('rect', { x: lx - tw / 2, y: ly - 10, width: tw, height: 20, rx: 10, 'class': 'fe-chip' }, g);
        el('text', { x: lx, y: ly + 4, 'text-anchor': 'middle', 'class': 'fe-t' }, g, clip(e.label, 22));
      }
    });

    /* 노드 */
    f.nodes.forEach(function (n) {
      var b = nodeBox(f, lay, n); if (!b) return;
      var K = KINDS[n.kind] || KINDS.write, bad = brokenOf(f, n);
      var c = n.kind === 'message' && /[EAX]/.test(n.type || '') ? 's3' : K.c;
      var on = sn && sn.id === n.id;
      var g = el('g', { 'class': 'fnode' + (on ? ' sel' : '') + (connFrom === n.id ? ' from' : '') + (bad ? ' broken' : ''), 'data-n': n.id, transform: 'translate(' + b.x + ',' + b.y + ')' }, gN);
      el('rect', { width: b.w, height: b.h, rx: 10, 'class': 'fn-box' }, g);
      el('path', { d: 'M10 0H4a4 4 0 0 0-4 4V' + (b.h - 4) + 'a4 4 0 0 0 4 4H10Z', 'class': 'fn-bar ' + c }, g);
      var kindTxt = n.kind === 'select' ? (n.single !== false ? 'SELECT SINGLE' : 'SELECT') : n.kind === 'message' ? 'MESSAGE ' + (n.type || 'I') : K.label;
      el('text', { x: 18, y: 20, 'class': 'fn-kind' }, g, kindTxt);
      el('text', { x: b.w - 12, y: 20, 'text-anchor': 'end', 'class': 'fn-ko' }, g, n.kind === 'select' ? '읽기 R' : K.ko);
      var y = 40;
      linesOf(f, n).forEach(function (l) {
        var main = l.c.indexOf('fn-main') >= 0, mono = l.c.indexOf('mono') >= 0 || l.c.indexOf('fn-code') >= 0;
        el('text', { x: 18, y: y, 'class': l.c }, g, fitText(l.t, b.w - 30, main ? (mono ? 12.5 : 13) : l.c.indexOf('fn-code') >= 0 ? 11.5 : 11, mono)); y += LH;
      });
      if (bad) el('text', { x: 18, y: y, 'class': 'fn-broken' }, g, fitText('⚠ ' + bad, b.w - 30, 11, false));
    });
    applyView();
  }
  function signature(fm) {
    if (!fm) return '';
    var u = fm.params.filter(function (p) { return p.mode !== 'CHANGING'; }), c = fm.params.filter(function (p) { return p.mode === 'CHANGING'; });
    function one(p) { return p.byValue ? 'VALUE(' + (p.name || '?') + ')' : (p.name || '?'); }
    return (u.length ? 'USING ' + u.map(one).join(' ') : '') + (c.length ? (u.length ? ' ' : '') + 'CHANGING ' + c.map(one).join(' ') : '');
  }

  /* ---------------- 화면 맞춤 · 확대 ---------------- */
  function fit() {
    var f = cur(), r = svg.getBoundingClientRect(); if (!f || !r.width) return;
    var lay = layout(f), x0 = 0, y0 = 0, x1 = 0, y1 = 0;
    lay.lanes.forEach(function (L) { x1 = Math.max(x1, L.x + L.w); y1 = Math.max(y1, L.y + L.h); });
    var m = r.width < 600 ? 16 : 48, k = Math.min((r.width - m * 2) / (x1 - x0), (r.height - m * 2 - (r.width < 600 ? 80 : 0)) / (y1 - y0), 1.1);
    k = Math.max(r.width < 600 ? 0.45 : 0.3, k);
    FV.k = k; FV.x = Math.max(m, (r.width - (x1 - x0) * k) / 2); FV.y = Math.max(m, (r.height - (y1 - y0) * k) / 2 - (r.width < 600 ? 40 : 0));
    applyView();
  }
  function zoomAt(cx, cy, fct) {
    var r = svg.getBoundingClientRect(), nk = Math.max(0.2, Math.min(2.5, FV.k * fct)), px = cx - r.left, py = cy - r.top;
    FV.x = px - (px - FV.x) * (nk / FV.k); FV.y = py - (py - FV.y) * (nk / FV.k); FV.k = nk; applyView();
  }
  function toWorld(cx, cy) { var r = svg.getBoundingClientRect(); return [(cx - r.left - FV.x) / FV.k, (cy - r.top - FV.y) / FV.k]; }
  function centerOn(f, n) {
    var lay = layout(f), b = nodeBox(f, lay, n), r = svg.getBoundingClientRect(); if (!b || !r.width) return;
    FV.x = r.width / 2 - (b.x + b.w / 2) * FV.k; FV.y = r.height / 3 - (b.y + b.h / 2) * FV.k; applyView();
  }
  /* 공용 확대 버튼: 흐름 화면에서는 이 그림판을 움직여요 */
  [['#zoom-in', 1.2], ['#zoom-out', 1 / 1.2], ['#zoom-fit', 0]].forEach(function (z) {
    var b = $(z[0]); if (!b) return;
    b.addEventListener('click', function (e) {
      if (E.mode() !== 'flow') return;
      e.stopImmediatePropagation();
      if (!z[1]) { fit(); return; }
      var r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, z[1]);
    }, true);
  });

  /* ---------------- 포인터 ---------------- */
  var ptrs = {}, drag = null, pinch = null;
  svg.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(ptrs);
    if (ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; return; }
    try { svg.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    var t = e.target, nEl = t.closest('[data-n]'), eEl = t.closest('[data-e]'), lEl = t.closest('[data-l]');
    if (nEl) {
      var f = cur(), n = N(f, nEl.getAttribute('data-n')), w = toWorld(e.clientX, e.clientY);
      drag = { kind: 'node', id: n.id, sx: e.clientX, sy: e.clientY, wx: w[0], wy: w[1], nx: n.x, ny: n.y, moved: false };
      return;
    }
    if (eEl && !connect) { drag = { kind: 'tap', fn: function () { selectF({ type: 'edge', id: eEl.getAttribute('data-e') }); }, sx: e.clientX, sy: e.clientY, vx: FV.x, vy: FV.y, moved: false, pan: true }; return; }
    drag = { kind: 'tap', fn: lEl ? function () { selectF({ type: 'lane', id: lEl.getAttribute('data-l') }); } : function () { if (connFrom) { connFrom = null; draw(); hintConnect(); } else selectF(null); }, sx: e.clientX, sy: e.clientY, vx: FV.x, vy: FV.y, moved: false, pan: true };
  });
  svg.addEventListener('pointermove', function (e) {
    if (!ptrs[e.pointerId]) return;
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(ptrs);
    if (pinch && ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y); zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.d); pinch.d = d; return; }
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < 5) return;
    if (!drag.moved) { drag.moved = true; if (drag.pan) svg.classList.add('panning'); }
    if (drag.pan) { FV.x = drag.vx + (e.clientX - drag.sx); FV.y = drag.vy + (e.clientY - drag.sy); applyView(); return; }
    if (drag.kind === 'node' && !connect && !ro()) {
      var f = cur(), n = N(f, drag.id), w = toWorld(e.clientX, e.clientY);
      n.x = Math.max(0, Math.round((drag.nx + w[0] - drag.wx) / 10) * 10);
      n.y = Math.max(0, Math.round((drag.ny + w[1] - drag.wy) / 10) * 10);
      draw();
    }
  });
  function endPtr(e) {
    delete ptrs[e.pointerId];
    if (Object.keys(ptrs).length < 2) pinch = null;
    if (!drag) return;
    var d = drag; drag = null; svg.classList.remove('panning');
    if (d.kind === 'node') {
      if (d.moved && !connect) { if (!ro()) save(); return; }
      if (connect) { clickConnect(d.id); return; }
      selectF({ type: 'node', id: d.id });
      return;
    }
    if (!d.moved && d.fn) d.fn();
  }
  svg.addEventListener('pointerup', endPtr);
  svg.addEventListener('pointercancel', function (e) { delete ptrs[e.pointerId]; drag = null; pinch = null; svg.classList.remove('panning'); });
  svg.addEventListener('wheel', function (e) { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0016)); }, { passive: false });

  /* ---------------- 연결 그리기 ---------------- */
  function setConnect(on, from) {
    connect = !!on; connFrom = on ? (from || null) : null;
    svg.classList.toggle('connecting', connect);
    paintTools(); draw(); hintConnect();
  }
  function hintConnect() {
    if (!connect) { E.hint(''); return; }
    E.hint(connFrom ? '이어 줄 다음 노드를 누르세요 (Esc로 끝내기)' : '연결: 먼저 출발할 노드를 누르세요');
  }
  function clickConnect(id) {
    if (ro()) return;
    var f = cur();
    if (!connFrom) { connFrom = id; draw(); hintConnect(); return; }
    if (connFrom === id) { connFrom = null; draw(); hintConnect(); return; }
    if (f.edges.some(function (x) { return x.from === connFrom && x.to === id; })) { E.hint('이미 이어져 있어요', true, 2000); connFrom = null; draw(); return; }
    var e = addEdge(f, connFrom, id);
    connFrom = null; fsel = { type: 'edge', id: e.id };
    save(); hintConnect();
  }
  function addEdge(f, from, to) {
    var a = N(f, from), labels = branchLabels(a), used = f.edges.filter(function (x) { return x.from === from; }).map(function (x) { return x.label; });
    var label = ''; for (var i = 0; i < labels.length; i++) if (used.indexOf(labels[i]) < 0) { label = labels[i]; break; }
    var e = { id: E.uid('e'), from: from, to: to, label: label };
    f.edges.push(e); return e;
  }

  /* ---------------- 만들기 · 지우기 ---------------- */
  function newFlow() {
    if (ro()) return;
    var s = S(); if (!s.flows) s.flows = [];
    var n = s.flows.length + 1, name = 'ZREPORT_' + (n < 10 ? '0' : '') + n;
    var f = { id: E.uid('f'), name: name, desc: '', forms: [], nodes: [], edges: [] };
    s.flows.push(f); setCur(f.id); fsel = null;
    if (E.mode() !== 'flow') E.setMode('flow');
    save(); fitted[f.id] = 0;
    E.hint('새 흐름을 만들었어요. 노드를 추가해 실행 순서를 그려 보세요', false, 3600);
  }
  function defaults(kind) {
    if (kind === 'perform') return { form: null, using: [], changing: [] };
    if (kind === 'select') return { table: null, fields: [], single: true, into: '', where: '', access: 'R' };
    if (kind === 'if') return { conds: [''] };
    if (kind === 'case') return { subject: '', whens: [''] };
    if (kind === 'message') return { type: 'I', cls: '', no: '', with: '' };
    if (kind === 'write') return { text: '' };
    return { op: 'RETURN' };
  }
  function addNode(kind, lane) {
    if (ro()) return;
    var f = cur(); if (!f) { newFlow(); f = cur(); }
    var after = fsel && fsel.type === 'node' ? N(f, fsel.id) : null;
    if (!lane) lane = after ? after.lane : fsel && fsel.type === 'lane' ? fsel.id : 'SOS';
    var x = 0, y = 0;
    if (after && after.lane === lane) { x = after.x; y = after.y + nodeH(f, after) + 40; }
    else f.nodes.forEach(function (o) { if (o.lane === lane) y = Math.max(y, o.y + nodeH(f, o) + 40); });
    /* 같은 자리에 다른 노드가 있으면 옆으로 비켜요 */
    while (f.nodes.some(function (o) { return o.lane === lane && Math.abs(o.x - x) < NW && y < o.y + nodeH(f, o) && y + 60 > o.y; })) x += NW + 30;
    var n = { id: E.uid('n'), lane: lane, kind: kind, x: x, y: y };
    var d = defaults(kind); for (var k in d) n[k] = d[k];
    f.nodes.push(n);
    if (after && after.lane === lane) addEdge(f, after.id, n.id);
    fsel = { type: 'node', id: n.id };
    save();
  }
  function addForm(name) {
    if (ro()) return null;
    var f = cur(); if (!f) return null;
    var i = f.forms.length + 1;
    var fm = { id: E.uid('m'), name: name || 'form_' + i, desc: '', params: [] };
    f.forms.push(fm); fsel = { type: 'lane', id: fm.id }; save();
    return fm;
  }
  function delNode(f, id) {
    var n = N(f, id); if (!n) return;
    f.nodes = f.nodes.filter(function (x) { return x.id !== id; });
    f.edges = f.edges.filter(function (e) { return e.from !== id && e.to !== id; });
    fsel = null; save();
    E.toast((KINDS[n.kind] || {}).label + ' 노드를 지웠어요', E.undo);
  }
  function delSel() {
    if (ro() || !fsel) return;
    var f = cur(); if (!f) return;
    if (fsel.type === 'node') delNode(f, fsel.id);
    else if (fsel.type === 'edge') { f.edges = f.edges.filter(function (e) { return e.id !== fsel.id; }); fsel = null; save(); E.toast('연결을 지웠어요', E.undo); }
    else if (fsel.type === 'lane' && FM(f, fsel.id)) {
      var fm = FM(f, fsel.id), gone = f.nodes.filter(function (n) { return n.lane === fm.id; }).map(function (n) { return n.id; });
      f.forms = f.forms.filter(function (x) { return x.id !== fm.id; });
      f.nodes = f.nodes.filter(function (n) { return gone.indexOf(n.id) < 0; });
      f.edges = f.edges.filter(function (e) { return gone.indexOf(e.from) < 0 && gone.indexOf(e.to) < 0; });
      fsel = null; save(); E.toast('FORM ' + (fm.name || '') + '을(를) 지웠어요', E.undo);
    }
  }
  function delFlow() {
    var f = cur(); if (!f || ro()) return;
    if (!confirm('“' + f.name + '” 흐름을 지울까요? 노드 ' + f.nodes.length + '개가 함께 지워져요. (지운 뒤 되돌리기로 살릴 수 있어요)')) return;
    var s = S(); s.flows = s.flows.filter(function (x) { return x.id !== f.id; });
    if (!s.flows.length) delete s.flows;
    setCur(null); fsel = null; save(); E.toast('“' + f.name + '” 흐름을 지웠어요', E.undo);
  }

  /* 자동 정렬: 블록마다 연결 순서대로 위에서 아래로, 분기는 옆으로 펼쳐요 */
  function autoLayout() {
    var f = cur(); if (!f || ro()) return;
    var lanes = {}; f.nodes.forEach(function (n) { (lanes[n.lane] = lanes[n.lane] || []).push(n); });
    Object.keys(lanes).forEach(function (lid) {
      var ns = lanes[lid], ids = {}; ns.forEach(function (n) { ids[n.id] = n; });
      var inner = f.edges.filter(function (e) { return ids[e.from] && ids[e.to]; });
      var depth = {}, indeg = {};
      ns.forEach(function (n) { indeg[n.id] = 0; });
      inner.forEach(function (e) { indeg[e.to]++; });
      var roots = ns.filter(function (n) { return !indeg[n.id]; }).sort(function (a, b) { return a.y - b.y || a.x - b.x; });
      if (!roots.length && ns.length) roots = [ns.slice().sort(function (a, b) { return a.y - b.y; })[0]];
      /* 가장 긴 경로 기준 깊이(되돌아가는 연결은 무시) */
      function walk(id, d, path) {
        if (path[id]) return;
        if (depth[id] !== undefined && depth[id] >= d) return;
        depth[id] = d; path[id] = 1;
        inner.forEach(function (e) { if (e.from === id) walk(e.to, d + 1, path); });
        delete path[id];
      }
      roots.forEach(function (r) { walk(r.id, 0, {}); });
      ns.forEach(function (n) { if (depth[n.id] === undefined) depth[n.id] = 0; });
      var rows = {}; ns.forEach(function (n) { (rows[depth[n.id]] = rows[depth[n.id]] || []).push(n); });
      var y = 0;
      Object.keys(rows).map(Number).sort(function (a, b) { return a - b; }).forEach(function (d) {
        var row = rows[d].sort(function (a, b) { return a.x - b.x || a.y - b.y; }), h = 0;
        row.forEach(function (n, i) { n.x = i * (NW + 30); n.y = y; h = Math.max(h, nodeH(f, n)); });
        y += h + 40;
      });
    });
    save(); fit();
    E.hint('블록마다 연결 순서대로 정리했어요', false, 2200);
  }

  /* ---------------- 툴바 ---------------- */
  var ftools = $('#ftools');
  function paintTools() {
    if (!ftools) return;
    var fs = flows(), f = cur(), dis = !f || ro() ? ' disabled' : '';
    var h = '<select class="btn" id="f-pick" aria-label="흐름 고르기">' +
      fs.map(function (x) { return '<option value="' + esc(x.id) + '"' + (f && x.id === f.id ? ' selected' : '') + '>' + esc(x.name || '(이름 없음)') + '</option>'; }).join('') +
      (fs.length ? '' : '<option value="" selected>흐름 없음</option>') + '<option value="__new">+ 새 흐름</option></select>' +
      '<div class="seg" role="group" aria-label="노드 추가">' + ORDER.map(function (k) {
        return '<button type="button" data-add="' + k + '" class="k-' + k + '" title="' + esc(KINDS[k].ko) + ' 노드 추가"' + dis + '>' + esc(k === 'end' ? '종료' : KINDS[k].label) + '</button>';
      }).join('') + '</div>' +
      '<button class="btn" type="button" id="f-connect" aria-pressed="' + connect + '" title="노드끼리 화살표로 잇기"' + dis + '>연결</button>' +
      '<button class="btn" type="button" id="f-form"' + dis + '>+ FORM</button>' +
      '<span class="vr" aria-hidden="true"></span>' +
      '<button class="btn ghost" type="button" id="f-auto" title="블록마다 연결 순서대로 정리"' + dis + '>자동 정렬</button>' +
      '<button class="btn ghost" type="button" id="f-usage" title="흐름 × 테이블 사용표"' + (fs.length ? '' : ' disabled') + '>사용표</button>';
    if (ftools.getAttribute('data-h') !== h) { ftools.innerHTML = h; ftools.setAttribute('data-h', h); }
    var dh = ORDER.map(function (k) { return '<button type="button" data-add="' + k + '"' + dis + '>' + esc(k === 'end' ? '종료' : KINDS[k].label) + '</button>'; }).join('') +
      '<button type="button" id="fd-connect" aria-pressed="' + connect + '"' + dis + '>연결</button>';
    if (fdock.getAttribute('data-h') !== dh) { fdock.innerHTML = dh; fdock.setAttribute('data-h', dh); }
  }
  function onTool(e) {
    var b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.hasAttribute('data-add')) { if (connect) setConnect(false); addNode(b.getAttribute('data-add')); return; }
    if (b.id === 'f-connect' || b.id === 'fd-connect') { setConnect(!connect, fsel && fsel.type === 'node' ? fsel.id : null); return; }
    if (b.id === 'f-form') { addForm(); return; }
    if (b.id === 'f-auto') { autoLayout(); return; }
    if (b.id === 'f-usage') { openUsage(); return; }
  }
  if (ftools) {
    ftools.addEventListener('click', onTool);
    ftools.addEventListener('change', function (e) {
      if (e.target.id !== 'f-pick') return;
      var v = e.target.value;
      if (v === '__new') { newFlow(); return; }
      pick(v);
    });
  }
  fdock.addEventListener('click', onTool);
  empty.addEventListener('click', function (e) { if (e.target.closest('[data-fa="newflow"]')) newFlow(); });
  function pick(id) { setCur(id); fsel = null; if (connect) setConnect(false); draw(); E.renderSide(); fit(); }

  /* ---------------- 오른쪽 패널 ---------------- */
  var FI = {
    flow: U.t3('erd', 'teal'), select: U.t3('db', 'teal'), perform: U.t3('chain', 'indigo'), form: U.t3('copy', 'blue'),
    other: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12M6 20h12M12 4v16"/></svg>'
  };
  function sec(title, body, count) { return '<div class="sec"><div class="sec-h"><h2>' + title + '</h2>' + (count != null ? '<span class="count">' + count + '</span>' : '') + '</div>' + body + '</div>'; }
  function field(label, id, inner) { return '<div class="field"><label for="' + id + '">' + label + '</label>' + inner + '</div>'; }
  function input(id, ff, val, ph, mono) { return '<input class="in' + (mono ? ' mono' : '') + '" id="' + id + '" data-ff="' + ff + '" value="' + esc(val) + '" placeholder="' + esc(ph || '') + '" autocomplete="off" spellcheck="false">'; }
  function delBtn(label) { return '<div class="ph-act"><button type="button" class="ib danger" data-fa="del" aria-label="' + label + '" title="' + label + ' (Delete)">' + U.IC.trash + '</button></div>'; }
  function addButtons(lane) {
    return '<div class="fadd">' + ORDER.map(function (k) { return '<button type="button" data-fa="addin" data-k="' + k + '" data-lane="' + esc(lane) + '">' + esc(k === 'end' ? '종료' : KINDS[k].label) + '</button>'; }).join('') + '</div>';
  }
  function code(f, n) { return '<pre class="fcode">' + esc(abapOf(f, n)) + '</pre>'; }
  function laneOptions(f, cur) {
    return EVENTS.map(function (e) { return '<option value="' + e.id + '"' + (cur === e.id ? ' selected' : '') + '>' + e.no + '. ' + e.name + '</option>'; }).join('') +
      f.forms.map(function (m) { return '<option value="' + esc(m.id) + '"' + (cur === m.id ? ' selected' : '') + '>FORM ' + esc(m.name || '(이름 없음)') + '</option>'; }).join('');
  }
  function edgeList(f, n) {
    var out = f.edges.filter(function (e) { return e.from === n.id; }), inn = f.edges.filter(function (e) { return e.to === n.id; });
    function row(e, other, dir) {
      var o = N(f, other);
      return '<li><button type="button" data-fa="seledge" data-id="' + esc(e.id) + '"><span class="tag">' + dir + '</span><span class="t">' + esc(o ? (KINDS[o.kind] || {}).label + ' · ' + clip(linesOf(f, o)[0].t, 26) : '?') + '</span>' + (e.label ? '<span class="tag">' + esc(e.label) + '</span>' : '') + '</button></li>';
    }
    var h = out.map(function (e) { return row(e, e.to, '다음'); }).join('') + inn.map(function (e) { return row(e, e.from, '이전'); }).join('');
    return (h ? '<ul class="flist">' + h + '</ul>' : '<p class="fuse-empty">아직 이어진 노드가 없어요.</p>') +
      '<div class="fbtns"><button class="btn" type="button" data-fa="connectfrom">여기서 연결 그리기</button></div>';
  }

  function renderSideFlow() {
    var f = cur(), h = '';
    if (!f) {
      return U.ph(FI.flow, '프로그램 흐름', '흐름이 없어요') +
        sec('시작하기', '<p class="ftip">리포트 프로그램이 어떤 순서로 실행되고, 어느 단계에서 어떤 표를 읽는지 코드보다 먼저 그려 보는 화면이에요. 흐름은 이 ERD와 함께 저장돼요.</p><div class="fbtns"><button class="btn primary" type="button" data-fa="newflow">+ 새 흐름 만들기</button></div>');
    }
    var sn = fsel && fsel.type === 'node' ? N(f, fsel.id) : null;
    var se = fsel && fsel.type === 'edge' ? ED(f, fsel.id) : null;
    var sl = fsel && fsel.type === 'lane' ? fsel.id : null;

    if (sn) {
      var K = KINDS[sn.kind] || KINDS.write;
      h += U.ph(sn.kind === 'select' ? FI.select : sn.kind === 'perform' ? FI.perform : '', esc(K.label) + ' <span class="arrow">·</span> ' + esc(K.ko), esc(laneName(f, sn.lane)), delBtn('노드 삭제'));
      var bad = brokenOf(f, sn);
      if (bad) h += '<div class="sec"><p class="fwarn">⚠ ' + esc(bad) + (sn.kind === 'select' ? '. 흐름은 그대로 두었어요. 다른 표를 고르거나, ERD에서 되돌리기로 표를 살리면 다시 이어져요.' : '. 다른 FORM을 고르세요.') + '</p></div>';
      if (sn.kind === 'perform') {
        var opts = '<option value="">FORM 고르기</option>' + f.forms.map(function (m) { return '<option value="' + esc(m.id) + '"' + (sn.form === m.id ? ' selected' : '') + '>' + esc(m.name || '(이름 없음)') + '</option>'; }).join('') + '<option value="__new">+ 새 FORM 만들기</option>';
        var fm = FM(f, sn.form), warn = '';
        if (fm) {
          var nu = fm.params.filter(function (p) { return p.mode !== 'CHANGING'; }).length, nc = fm.params.filter(function (p) { return p.mode === 'CHANGING'; }).length;
          if (nu !== (sn.using || []).length || nc !== (sn.changing || []).length) warn = '<p class="fwarn">FORM은 USING ' + nu + '개 · CHANGING ' + nc + '개를 받는데, 지금 USING ' + (sn.using || []).length + '개 · CHANGING ' + (sn.changing || []).length + '개를 넘겨요. 개수와 순서가 맞아야 해요.</p>';
        }
        h += sec('호출', field('FORM', 'fp-form', '<select class="in mono" id="fp-form" data-ff="pform">' + opts + '</select>') +
          field('USING (넘길 값, 띄어쓰기로 구분)', 'fp-using', input('fp-using', 'pusing', (sn.using || []).join(' '), '예: pa_objid', true)) +
          field('CHANGING (돌려받을 변수)', 'fp-chg', input('fp-chg', 'pchanging', (sn.changing || []).join(' '), '예: gs_sbj gv_subrc', true)) + warn +
          (fm ? '<div class="fbtns"><button class="btn" type="button" data-fa="gotoform">FORM ' + esc(fm.name) + ' 보기</button></div>' : ''));
      } else if (sn.kind === 'select') {
        var t = TB(sn.table), tables = S().tables;
        var topt = '<option value="">테이블 고르기</option>' + (sn.table && !t ? '<option value="' + esc(sn.table) + '" selected>(지워진 표)</option>' : '') +
          tables.map(function (x) { return '<option value="' + esc(x.id) + '"' + (sn.table === x.id ? ' selected' : '') + '>' + esc(x.name + (x.ko ? '  ' + x.ko : '')) + '</option>'; }).join('');
        var body = field('테이블 (이 ERD의 표)', 'fs-table', '<select class="in mono" id="fs-table" data-ff="stable">' + topt + '</select>');
        if (!tables.length) body += '<p class="fuse-empty">ERD에 표가 없어요. ERD 화면에서 먼저 표를 만들어 주세요.</p>';
        body += '<label class="chk" for="fs-single"><input type="checkbox" id="fs-single" data-ff="ssingle"' + (sn.single !== false ? ' checked' : '') + '>SELECT SINGLE (한 줄만 읽기)</label>';
        if (t) {
          var gone = (sn.fields || []).filter(function (id) { return !COL(t, id); });
          body += '<div class="field"><span class="lab">읽을 필드</span><ul class="ffields">' + t.cols.map(function (c) {
            var on = (sn.fields || []).indexOf(c.id) >= 0;
            return '<li><label><input type="checkbox" data-ff="sfield" value="' + esc(c.id) + '"' + (on ? ' checked' : '') + '>' + (c.pk ? '<span class="fk-pk">PK</span>' : '') + '<span class="fk-n">' + esc(c.name) + '</span><span class="fk-d">' + esc(c.desc || '') + '</span></label></li>';
          }).join('') + gone.map(function () { return '<li class="gone"><label><input type="checkbox" checked disabled>지워진 필드</label></li>'; }).join('') + '</ul>' +
            '<div class="fbtns"><button class="btn" type="button" data-fa="sall">모두</button><button class="btn" type="button" data-fa="skeys">키만</button><button class="btn" type="button" data-fa="snone">비우기</button>' +
            (gone.length ? '<button class="btn" type="button" data-fa="sgone">지워진 필드 정리</button>' : '') + '</div></div>';
          body += '<div class="fbtns"><button class="btn primary" type="button" data-fa="toerd">ERD에서 보기</button></div>';
        }
        body += field('INTO (받을 변수)', 'fs-into', input('fs-into', 'sinto', sn.into, '예: CORRESPONDING FIELDS OF cs_sbj', true)) +
          field('WHERE 조건 메모', 'fs-where', '<textarea class="in mono" id="fs-where" data-ff="swhere" rows="2" placeholder="예: objid = pv_objid">' + esc(sn.where || '') + '</textarea>');
        h += sec('DB 읽기', body);
      } else if (sn.kind === 'if') {
        var conds = sn.conds && sn.conds.length ? sn.conds : [''];
        h += sec('조건', conds.map(function (c, i) {
          return '<div class="frow"><span class="lbl">' + (i ? 'ELSEIF' : 'IF') + '</span>' + input('fi-c' + i, 'cond', c, '예: gv_subrc <> 0', true).replace('data-ff="cond"', 'data-ff="cond" data-i="' + i + '"') +
            (i ? '<button type="button" class="ib" data-fa="delcond" data-i="' + i + '" aria-label="조건 지우기">' + U.IC.x + '</button>' : '') + '</div>';
        }).join('') + '<div class="fbtns"><button class="btn" type="button" data-fa="addcond">+ ELSEIF</button></div>' +
          '<p class="ftip">조건이 하나면 나가는 연결 라벨은 <b>참/거짓</b>, 여러 개면 조건별 라벨과 <b>ELSE</b>가 붙어요.</p>');
      } else if (sn.kind === 'case') {
        var whens = sn.whens && sn.whens.length ? sn.whens : [''];
        h += sec('값별 분기', field('CASE 대상', 'fc-sub', input('fc-sub', 'csub', sn.subject, '예: pa_type', true)) +
          whens.map(function (w, i) {
            return '<div class="frow"><span class="lbl">WHEN</span>' + input('fc-w' + i, 'when', w, "예: 'A'", true).replace('data-ff="when"', 'data-ff="when" data-i="' + i + '"') +
              (whens.length > 1 ? '<button type="button" class="ib" data-fa="delwhen" data-i="' + i + '" aria-label="WHEN 지우기">' + U.IC.x + '</button>' : '') + '</div>';
          }).join('') + '<div class="fbtns"><button class="btn" type="button" data-fa="addwhen">+ WHEN</button></div><p class="ftip">어느 WHEN에도 맞지 않으면 <b>WHEN OTHERS</b>로 가요.</p>');
      } else if (sn.kind === 'message') {
        var ty = sn.type || 'I';
        h += sec('메시지', '<div class="field"><span class="lab">타입</span><div class="fsegm" role="group" aria-label="메시지 타입">' + ['S', 'I', 'W', 'E', 'A', 'X'].map(function (x) {
          return '<button type="button" data-fa="mtype" data-v="' + x + '" aria-pressed="' + (ty === x) + '">' + x + '</button>';
        }).join('') + '</div></div><p class="ftip"><b>' + ty + '</b> · ' + esc(MSG[ty]) + '</p>' +
          (ty === 'E' && sn.lane === 'SS' ? '<p class="fwarn">AT SELECTION-SCREEN의 E 메시지: 입력 화면에 머물고 START-OF-SELECTION은 실행되지 않아요.</p>' : '') +
          '<div class="grid2">' + field('메시지 클래스', 'fm-cls', input('fm-cls', 'mcls', sn.cls, 'zmc05c', true)) + field('번호', 'fm-no', input('fm-no', 'mno', sn.no, '003', true)) + '</div>' +
          field('WITH (자리표시자 값)', 'fm-with', input('fm-with', 'mwith', sn['with'], '예: pa_objid', true)));
      } else if (sn.kind === 'write') {
        h += sec('출력', field('WRITE 내용', 'fw-t', '<textarea class="in mono" id="fw-t" data-ff="wtext" rows="3" placeholder="예: / \'기준일에 담당 강사가 없습니다.\'(t10)">' + esc(sn.text || '') + '</textarea>') +
          '<p class="ftip">cl_demo_output=&gt;display_data( )로 보여 줄 때도 이 노드를 쓰고 내용에 적어 두세요.</p>');
      } else if (sn.kind === 'end') {
        var op = sn.op || 'RETURN';
        h += sec('종료', '<div class="fsegm two" role="group" aria-label="종료 종류">' + ['RETURN', 'EXIT'].map(function (x) { return '<button type="button" data-fa="endop" data-v="' + x + '" aria-pressed="' + (op === x) + '">' + x + '</button>'; }).join('') + '</div><p class="ftip">' + esc(END[op]) + '</p>');
      }
      h += sec('ABAP 미리보기', code(f, sn));
      h += sec('블록', field('어느 블록에 있나요', 'fn-lane', '<select class="in mono" id="fn-lane" data-ff="lane">' + laneOptions(f, sn.lane) + '</select>'));
      h += sec('연결', edgeList(f, sn));
      return h;
    }

    if (se) {
      var a = N(f, se.from), b = N(f, se.to), labels = a ? branchLabels(a) : [];
      h += U.ph('', '연결', esc(a ? KINDS[a.kind].label : '?') + ' → ' + esc(b ? KINDS[b.kind].label : '?'), delBtn('연결 삭제'));
      h += sec('라벨', field('라벨 (분기 결과)', 'fe-label', '<input class="in" id="fe-label" data-ff="elabel" list="fe-labels" value="' + esc(se.label || '') + '" placeholder="' + (labels.length ? '예: ' + esc(labels[0]) : '없어도 돼요') + '" autocomplete="off"><datalist id="fe-labels">' + labels.map(function (l) { return '<option value="' + esc(l) + '"></option>'; }).join('') + '</datalist>') +
        (labels.length ? '<div class="fbtns">' + labels.map(function (l) { return '<button class="btn" type="button" data-fa="elabel" data-v="' + esc(l) + '">' + esc(l) + '</button>'; }).join('') + '</div>' : '') +
        '<div class="fbtns"><button class="btn" type="button" data-fa="flipedge">방향 바꾸기</button></div>');
      return h;
    }

    if (sl && EV[sl]) {
      var ev = EV[sl], cnt = f.nodes.filter(function (n) { return n.lane === sl; }).length;
      h += U.ph('', ev.no + '. ' + esc(ev.name), esc(ev.ko) + ' · 노드 ' + cnt + '개');
      h += sec('언제 실행되나요', '<p class="ftip">' + esc(ev.tip) + '</p><p class="fuse-empty">실행 순서는 코드에 적은 순서가 아니라 1 → 4 순서로 고정이에요.</p>');
      h += sec('이 블록에 추가', addButtons(sl));
      return h;
    }
    if (sl && FM(f, sl)) {
      var m = FM(f, sl), callers = f.nodes.filter(function (n) { return n.kind === 'perform' && n.form === m.id; });
      h += U.ph(FI.form, 'FORM ' + esc(m.name || '(이름 없음)'), '서브루틴 · 파라미터 ' + m.params.length + '개', delBtn('FORM 삭제'));
      h += sec('기본 정보', field('FORM 이름', 'ff-name', input('ff-name', 'fname', m.name, '예: get_sbjinfo', true)) +
        field('설명', 'ff-desc', '<textarea class="in" id="ff-desc" data-ff="fdesc" rows="2" placeholder="이 FORM이 하는 일">' + esc(m.desc || '') + '</textarea>'));
      h += sec('파라미터', '<div class="fparams">' + m.params.map(function (p, i) {
        return '<div class="fparam"><select class="in mono" data-ff="pmode" data-i="' + i + '" aria-label="전달 방식"><option' + (p.mode !== 'CHANGING' ? ' selected' : '') + '>USING</option><option' + (p.mode === 'CHANGING' ? ' selected' : '') + '>CHANGING</option></select>' +
          '<label class="chk"><input type="checkbox" data-ff="pval" data-i="' + i + '"' + (p.byValue ? ' checked' : '') + '>VALUE( ) 값으로 받기</label>' +
          '<button type="button" class="ib" data-fa="delparam" data-i="' + i + '" aria-label="파라미터 지우기">' + U.IC.x + '</button>' +
          '<div class="wide"><input class="in mono" data-ff="pname" data-i="' + i + '" value="' + esc(p.name) + '" placeholder="pv_objid" aria-label="파라미터 이름" autocomplete="off" spellcheck="false">' +
          '<input class="in mono" data-ff="ptype" data-i="' + i + '" value="' + esc(p.type) + '" placeholder="TYPE ztc0503-objid" aria-label="타입" autocomplete="off" spellcheck="false"></div></div>';
      }).join('') + '</div><div class="fbtns"><button class="btn" type="button" data-fa="addparam" data-v="USING">+ USING</button><button class="btn" type="button" data-fa="addparam" data-v="CHANGING">+ CHANGING</button></div>' +
        '<pre class="fcode">' + esc('FORM ' + (m.name || '?').toLowerCase() + (signature(m) ? ' ' + signature(m) : '') + '.\n  …\nENDFORM.') + '</pre>' +
        '<p class="ftip">이름 관례: USING은 pv_, CHANGING은 cv_/cs_. VALUE( )로 받으면 FORM 안에서 바꿔도 호출한 쪽 값은 그대로예요.</p>', m.params.length);
      h += sec('이 FORM을 부르는 곳', callers.length ? '<ul class="flist">' + callers.map(function (n) {
        return '<li><button type="button" data-fa="selnode" data-id="' + esc(n.id) + '"><span class="tag">PERFORM</span><span class="t">' + esc(laneName(f, n.lane)) + '</span></button></li>';
      }).join('') + '</ul>' : '<p class="fuse-empty">아직 이 FORM을 PERFORM하는 노드가 없어요.</p>', callers.length);
      h += sec('FORM 안에 추가', addButtons(sl));
      return h;
    }

    /* 아무것도 고르지 않았을 때: 흐름 정보 */
    var tablesUsed = {}; f.nodes.forEach(function (n) { if (n.kind === 'select' && n.table) tablesUsed[n.table] = 1; });
    h += U.ph(FI.flow, esc(f.name || '(이름 없음)'), '흐름 · 노드 ' + f.nodes.length + '개 · FORM ' + f.forms.length + '개 · 표 ' + Object.keys(tablesUsed).length + '개');
    h += sec('프로그램', field('프로그램 이름 (REPORT)', 'fl-name', input('fl-name', 'flname', f.name, 'ZRC05W0261', true)) +
      field('설명', 'fl-desc', '<textarea class="in" id="fl-desc" data-ff="fldesc" rows="3" placeholder="이 프로그램이 하는 일, 선택 화면에서 받는 값 등">' + esc(f.desc || '') + '</textarea>') +
      '<div class="fbtns"><button class="btn" type="button" data-fa="usage">사용표</button><button class="btn" type="button" data-fa="auto">자동 정렬</button><button class="btn danger" type="button" data-fa="delflow">흐름 삭제</button></div>');
    h += sec('실행 순서', '<ul class="flist">' + EVENTS.map(function (e) {
      return '<li><button type="button" data-fa="sellane" data-id="' + e.id + '"><span class="tag">' + e.no + '</span><span class="t">' + esc(e.name) + '</span><span class="tag">' + f.nodes.filter(function (n) { return n.lane === e.id; }).length + '</span></button></li>';
    }).join('') + '</ul><p class="ftip">AT SELECTION-SCREEN에서 MESSAGE 타입 E를 띄우면 입력 화면에 머물고 START-OF-SELECTION은 실행되지 않아요.</p>');
    h += sec('만드는 법', '<ol class="steps"><li>위쪽 <b>PERFORM · SELECT · IF</b> 버튼으로 노드를 추가해요. 노드를 고른 채 추가하면 그 아래에 이어서 붙어요.</li>' +
      '<li><b>+ FORM</b>으로 서브루틴 블록을 만들고, PERFORM 노드에서 고르면 호출선이 이어져요.</li>' +
      '<li>SELECT 노드에서 ERD의 표와 읽을 필드를 고르면, ERD 화면에서도 그 표를 쓰는 흐름이 보여요.</li></ol>');
    return h;
  }

  /* 패널 입력: 글자는 바로 반영(저장은 index의 0.5초 저장), 칸을 벗어나면 실행 취소 기록에 남겨요 */
  var side = $('#side');
  function fromInput(t, live) {
    var ff = t.getAttribute('data-ff'); if (!ff || E.mode() !== 'flow' || ro()) return false;
    var f = cur(); if (!f) return false;
    var n = fsel && fsel.type === 'node' ? N(f, fsel.id) : null, m = fsel && fsel.type === 'lane' ? FM(f, fsel.id) : null, e = fsel && fsel.type === 'edge' ? ED(f, fsel.id) : null;
    var v = t.type === 'checkbox' ? t.checked : t.value, i = parseInt(t.getAttribute('data-i'), 10);
    switch (ff) {
      case 'flname': f.name = v; break;
      case 'fldesc': f.desc = v; break;
      case 'pusing': if (n) n.using = words(v); break;
      case 'pchanging': if (n) n.changing = words(v); break;
      case 'sinto': if (n) n.into = v; break;
      case 'swhere': if (n) n.where = v; break;
      case 'cond': if (n) n.conds[i] = v; break;
      case 'csub': if (n) n.subject = v; break;
      case 'when': if (n) n.whens[i] = v; break;
      case 'mcls': if (n) n.cls = v; break;
      case 'mno': if (n) n.no = v; break;
      case 'mwith': if (n) n['with'] = v; break;
      case 'wtext': if (n) n.text = v; break;
      case 'elabel': if (e) e.label = v; break;
      case 'fname': if (m) m.name = v; break;
      case 'fdesc': if (m) m.desc = v; break;
      case 'pname': if (m) m.params[i].name = v; break;
      case 'ptype': if (m) m.params[i].type = v; break;
      default:
        if (live) return false;
        if (ff === 'pform' && n) {
          if (v === '__new') { var fm = { id: E.uid('m'), name: 'form_' + (f.forms.length + 1), desc: '', params: [] }; f.forms.push(fm); n.form = fm.id; }
          else n.form = v || null;
        } else if (ff === 'stable' && n) { if (n.table !== v) { n.table = v || null; n.fields = []; } }
        else if (ff === 'ssingle' && n) n.single = v;
        else if (ff === 'sfield' && n) {
          var id = t.value, fl = (n.fields || []).filter(function (x) { return x !== id; });
          if (v) { var tb = TB(n.table); fl.push(id); if (tb) fl.sort(function (a, b) { return idx(tb, a) - idx(tb, b); }); }
          n.fields = fl;
        }
        else if (ff === 'lane' && n) {
          n.lane = v; n.x = 0; n.y = 0;
          f.nodes.forEach(function (o) { if (o !== n && o.lane === v) n.y = Math.max(n.y, o.y + nodeH(f, o) + 40); });
        }
        else if (ff === 'pmode' && m) m.params[i].mode = v;
        else if (ff === 'pval' && m) m.params[i].byValue = v;
        else return false;
    }
    return true;
  }
  function idx(t, id) { for (var i = 0; i < t.cols.length; i++) if (t.cols[i].id === id) return i; return 1e9; }
  side.addEventListener('input', function (e) { if (fromInput(e.target, true)) draw(); });
  side.addEventListener('change', function (e) { if (E.mode() === 'flow' && e.target.getAttribute('data-ff')) { if (fromInput(e.target, false) !== false) save(); } });
  side.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.getAttribute('data-ff')) e.target.blur(); });
  side.addEventListener('click', function (e) {
    if (E.mode() !== 'flow') return;
    var b = e.target.closest('[data-fa]'); if (!b) return;
    var a = b.getAttribute('data-fa'), f = cur();
    if (a === 'newflow') { newFlow(); return; }
    if (!f) return;
    var n = fsel && fsel.type === 'node' ? N(f, fsel.id) : null, m = fsel && fsel.type === 'lane' ? FM(f, fsel.id) : null, ed = fsel && fsel.type === 'edge' ? ED(f, fsel.id) : null;
    var i = parseInt(b.getAttribute('data-i'), 10), v = b.getAttribute('data-v');
    if (a === 'usage') { openUsage(); return; }
    if (a === 'sellane') { selectF({ type: 'lane', id: b.getAttribute('data-id') }); return; }
    if (a === 'selnode') { selectF({ type: 'node', id: b.getAttribute('data-id') }); centerOn(f, N(f, b.getAttribute('data-id'))); return; }
    if (a === 'seledge') { selectF({ type: 'edge', id: b.getAttribute('data-id') }); return; }
    if (a === 'gotoform' && n) { selectF({ type: 'lane', id: n.form }); return; }
    if (a === 'toerd' && n) { E.focusTable(n.table, (n.fields || []).slice()); return; }
    if (a === 'connectfrom' && n) { setConnect(true, n.id); return; }
    if (ro()) return;
    if (a === 'auto') { autoLayout(); return; }
    if (a === 'delflow') { delFlow(); return; }
    if (a === 'del') { delSel(); return; }
    if (a === 'addin') { fsel = { type: 'lane', id: b.getAttribute('data-lane') }; addNode(b.getAttribute('data-k'), b.getAttribute('data-lane')); return; }
    if (n) {
      var t = TB(n.table);
      if (a === 'sall' && t) n.fields = t.cols.map(function (c) { return c.id; });
      else if (a === 'skeys' && t) n.fields = t.cols.filter(function (c) { return c.pk; }).map(function (c) { return c.id; });
      else if (a === 'snone') n.fields = [];
      else if (a === 'sgone' && t) n.fields = (n.fields || []).filter(function (id) { return COL(t, id); });
      else if (a === 'addcond') n.conds = (n.conds || ['']).concat(['']);
      else if (a === 'delcond') n.conds.splice(i, 1);
      else if (a === 'addwhen') n.whens = (n.whens || ['']).concat(['']);
      else if (a === 'delwhen') n.whens.splice(i, 1);
      else if (a === 'mtype') n.type = v;
      else if (a === 'endop') n.op = v;
      else return;
      save(); return;
    }
    if (ed) {
      if (a === 'elabel') ed.label = v;
      else if (a === 'flipedge') { var x = ed.from; ed.from = ed.to; ed.to = x; }
      else return;
      save(); return;
    }
    if (m) {
      if (a === 'addparam') m.params.push({ id: E.uid('p'), mode: v, byValue: v === 'USING', name: '', type: '' });
      else if (a === 'delparam') m.params.splice(i, 1);
      else return;
      save();
    }
  });

  /* ---------------- 테이블 사용표 ---------------- */
  var CRUD = ['C', 'R', 'U', 'D'];
  var uveil = document.createElement('div');
  uveil.className = 'veil fu'; uveil.hidden = true;
  uveil.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="fu-title"><div class="head"><h3 id="fu-title">테이블 사용표</h3>' +
    '<div class="seg" role="group" aria-label="행 기준"><button type="button" data-u="flow" aria-pressed="true">흐름별</button><button type="button" data-u="block" aria-pressed="false">블록별 (지금 흐름)</button></div>' +
    '<button class="btn ghost sq" type="button" data-u="close" aria-label="닫기">✕</button></div><div class="fu-wrap" id="fu-body"></div>' +
    '<p class="fuse-empty">R 읽기(SELECT). 블록별에서 (R)은 PERFORM으로 부른 FORM 안에서 읽는다는 뜻이에요. C 생성 · U 수정 · D 삭제는 INSERT/UPDATE/DELETE를 배운 뒤 같은 표에 함께 나와요.</p></div>';
  document.body.appendChild(uveil);
  var umode = 'flow';
  function usageRows() {
    var rows = [], fs = flows();
    if (umode === 'flow') fs.forEach(function (f) { rows.push({ name: f.name || '(이름 없음)', sub: (f.desc || '').slice(0, 30), nodes: norm(f).nodes, f: f }); });
    else {
      var f = cur(); if (!f) return rows;
      EVENTS.forEach(function (e) { rows.push({ name: e.name, sub: e.ko, nodes: f.nodes.filter(function (n) { return n.lane === e.id; }), f: f }); });
      f.forms.forEach(function (m) { rows.push({ name: 'FORM ' + (m.name || ''), sub: m.desc || '', nodes: f.nodes.filter(function (n) { return n.lane === m.id; }), f: f }); });
    }
    return rows;
  }
  /* 블록이 PERFORM으로 부른 FORM(그 FORM이 다시 부른 FORM까지)이 읽는 표 */
  function viaCalls(f, nodes) {
    var acc = {}, seenF = {};
    (function walk(ns) {
      ns.forEach(function (n) {
        if (n.kind !== 'perform' || !n.form || seenF[n.form]) return;
        seenF[n.form] = 1;
        var inner = f.nodes.filter(function (x) { return x.lane === n.form; });
        inner.forEach(function (x) { if (x.table) access(x).split('').forEach(function (c) { (acc[x.table] = acc[x.table] || {})[c] = 1; }); });
        walk(inner);
      });
    })(nodes);
    return acc;
  }
  function renderUsage() {
    var rows = usageRows(), cols = [], seen = {};
    rows.forEach(function (r) { r.nodes.forEach(function (n) { if (n.table && access(n) && !seen[n.table]) { seen[n.table] = 1; cols.push(n.table); } }); });
    S().tables.forEach(function (t) { if (!seen[t.id]) { seen[t.id] = 1; cols.push(t.id); } });
    var h = '<table><thead><tr><th>' + (umode === 'flow' ? '흐름' : '블록') + '</th>' + cols.map(function (id) {
      var t = TB(id); return '<th' + (t ? '' : ' class="gone"') + '>' + esc(t ? t.name : '(지워진 표)') + (t && t.ko ? '<small>' + esc(t.ko) + '</small>' : '') + '</th>';
    }).join('') + '</tr></thead><tbody>';
    if (!rows.length) h += '<tr><td colspan="' + (cols.length + 1) + '">흐름이 없어요</td></tr>';
    rows.forEach(function (r) {
      var via = umode === 'block' ? viaCalls(r.f, r.nodes) : {};
      h += '<tr><th>' + esc(r.name) + (r.sub ? '<small>' + esc(r.sub) + '</small>' : '') + '</th>' + cols.map(function (id) {
        var acc = {}; r.nodes.forEach(function (n) { if (n.table === id) access(n).split('').forEach(function (c) { acc[c] = 1; }); });
        var s = CRUD.filter(function (c) { return acc[c]; }).join('');
        if (s) return '<td class="on">' + s + '</td>';
        var v = CRUD.filter(function (c) { return via[id] && via[id][c]; }).join('');
        return v ? '<td class="via" title="PERFORM으로 부른 FORM에서 읽어요">(' + v + ')</td>' : '<td></td>';
      }).join('') + '</tr>';
    });
    $('#fu-body').innerHTML = h + '</tbody></table>';
    Array.prototype.forEach.call(uveil.querySelectorAll('[data-u="flow"],[data-u="block"]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-u') === umode)); });
  }
  function openUsage() { if (!flows().length) return; renderUsage(); uveil.hidden = false; var c = uveil.querySelector('[data-u="close"]'); if (c) c.focus(); }
  uveil.addEventListener('click', function (e) {
    if (e.target === uveil) { uveil.hidden = true; return; }
    var b = e.target.closest('[data-u]'); if (!b) return;
    var u = b.getAttribute('data-u');
    if (u === 'close') uveil.hidden = true; else { umode = u; renderUsage(); }
  });
  uveil.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') uveil.hidden = true; });

  /* ---------------- ERD 쪽 연동: 이 표를 쓰는 흐름 ---------------- */
  function usesOf(tid) {
    var out = [];
    flows().forEach(function (f) { norm(f).nodes.forEach(function (n) { if (n.table === tid && access(n)) out.push({ f: f, n: n }); }); });
    return out;
  }
  E.tableUsageHtml = function (tid) {
    if (!flows().length) return '';
    var u = usesOf(tid);
    return '<div class="sec"><div class="sec-h"><h2>이 표를 쓰는 흐름</h2><span class="count">' + u.length + '</span></div>' +
      (u.length ? '<ul class="fuse">' + u.map(function (x) {
        var t = TB(tid), fl = t ? selectFields(x.n, t) : [];
        return '<li><button type="button" data-flowjump="' + esc(x.f.id + '|' + x.n.id) + '"><span class="fu-acc">' + esc(access(x.n)) + '</span><span class="fu-t">' + esc(x.f.name) + ' › ' + esc(laneName(x.f, x.n.lane)) +
          '<small>' + esc(fl.length ? fl.join(' ') : '필드 선택 안 됨') + '</small></span></button></li>';
      }).join('') + '</ul>' : '<p class="fuse-empty">아직 이 표를 읽는 SELECT 노드가 없어요.</p>') + '</div>';
  };
  E.onFlowJump = function (key) {
    var p = String(key).split('|'), f = null;
    flows().forEach(function (x) { if (x.id === p[0]) f = x; });
    if (!f) return;
    setCur(f.id); fsel = { type: 'node', id: p[1] };
    E.setMode('flow');
    var n = N(norm(f), p[1]); if (n) requestAnimationFrame(function () { centerOn(f, n); });
  };

  /* ---------------- index.html에 연결 ---------------- */
  E.renderFlowSide = renderSideFlow;
  E.flowHasSel = function () { return !!fsel; };
  E.onDraw = function () {
    var f = cur();
    if (fsel && f) {   /* 실행 취소 등으로 사라진 선택은 풀어요 */
      var ok = fsel.type === 'node' ? N(f, fsel.id) : fsel.type === 'edge' ? ED(f, fsel.id) : (EV[fsel.id] || FM(f, fsel.id));
      if (!ok) fsel = null;
    } else if (!f) fsel = null;
    draw();
  };
  E.onModeChange = function (m) {
    if (m !== 'flow') { if (connect) setConnect(false); return; }
    var f = cur(); if (f && !fitted[f.id]) { fitted[f.id] = 1; requestAnimationFrame(fit); }
    requestAnimationFrame(applyView);
  };
  E.flowKey = function (e, typing) {
    if (!uveil.hidden) return;
    if (e.key === 'Escape') { if (connect) setConnect(false); else if (fsel) selectF(null); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && fsel) { e.preventDefault(); delSel(); }
  };
  /* 모바일 메뉴 등에서 쓰는 손잡이 */
  E.flowApi = {
    list: function () { return flows().map(function (f) { return { id: f.id, name: f.name }; }); },
    current: function () { var f = cur(); return f ? f.id : null; },
    pick: pick, newFlow: newFlow, addForm: function () { addForm(); }, autoLayout: autoLayout, usage: openUsage
  };
  window.addEventListener('resize', function () { if (E.mode() === 'flow') applyView(); });

  paintTools();
  if (E.mode() === 'flow') { E.refresh(); requestAnimationFrame(function () { var f = cur(); if (f) { fitted[f.id] = 1; fit(); } }); }
})();
