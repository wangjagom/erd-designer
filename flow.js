/* 프로그램 흐름: 일반 플로우차트(시작/끝 · 처리 · 판단)에
   1) ABAP 이벤트 레인(가로 띠) 2) 처리 단계가 조회하는 ERD 테이블(DB 칩)만 얹어서 보여 줘요.
   흐름은 ERD와 같은 문서(S.flows)에 들어가서 저장·실행 취소·클라우드·버전 기록·공유가 그대로 따라가요.

   S.flows = [{ id, name, desc,
     lanesOn: boolean,                      // 꺼도 레인 설정과 노드 소속은 남아요
     lanes: [{ id, name }],                 // 배열 순서 = 실행 순서
     nodes: [{ id, kind: 'terminal'|'process'|'decision', text, x, y, lane: laneId|null,
               reads: [{ table: tableId, cols: [colId], op: 'R' }] }],   // op: 나중에 C/U/D
     edges: [{ id, from, to, label }] }]
   레인이 켜져 있으면 y는 자기 띠 안에서의 위치, 꺼져 있으면 캔버스 위치예요. */
(function () {
  'use strict';
  var E = window.ERD; if (!E || !E.state) return;
  var U = E.ui, esc = function (s) { return U.esc(s == null ? '' : s); };
  var NS = 'http://www.w3.org/2000/svg';
  var $ = function (s) { return document.querySelector(s); };

  var KINDS = { terminal: '시작/끝', process: '처리', decision: '판단' };
  var ORDER = ['terminal', 'process', 'decision'];
  var PRESET = ['INITIALIZATION', 'AT SELECTION-SCREEN OUTPUT', 'AT SELECTION-SCREEN', 'START-OF-SELECTION'];
  var DEFAULT_LANES = ['INITIALIZATION', 'AT SELECTION-SCREEN', 'START-OF-SELECTION'];

  /* ---------------- 문서 접근 + 예전 형식 변환 ---------------- */
  function S() { return E.state(); }
  function ro() { return E.isPreviewing && E.isPreviewing(); }
  var CUR_KEY = 'erd-flow-cur', curId = null;
  try { curId = localStorage.getItem(CUR_KEY); } catch (e) { /* ignore */ }
  function setCur(id) { curId = id; try { localStorage.setItem(CUR_KEY, id || ''); } catch (e) { /* ignore */ } }

  var OLD_EV = { INIT: 'INITIALIZATION', SSO: 'AT SELECTION-SCREEN OUTPUT', SS: 'AT SELECTION-SCREEN', SOS: 'START-OF-SELECTION' };
  var OLD_KIND = { perform: 1, select: 1, 'if': 1, 'case': 1, message: 1, write: 1, end: 1 };
  /* 1차 버전(이벤트·FORM·전용 노드) → 플로우차트. 텍스트와 이벤트 소속, 조회 테이블은 살려요 */
  function migrate(f) {
    var forms = f.forms || [], formName = {}, laneOf = {}, lanes = [];
    forms.forEach(function (m) { formName[m.id] = m.name || 'form'; });
    function lane(key) {
      if (!laneOf[key]) { laneOf[key] = 'l' + f.id + '_' + key; lanes.push({ id: laneOf[key], name: OLD_EV[key] }); }
      return laneOf[key];
    }
    DEFAULT_LANES.forEach(function (n) { for (var k in OLD_EV) if (OLD_EV[k] === n) lane(k); });
    var byId = {}; (f.nodes || []).forEach(function (n) { byId[n.id] = n; });
    var callerOf = {}; (f.nodes || []).forEach(function (n) { if (n.kind === 'perform' && n.form && !callerOf[n.form] && OLD_EV[n.lane]) callerOf[n.form] = n; });
    var stack = {};
    f.nodes = (f.nodes || []).map(function (n) {
      var kind = 'process', text = '', rd = [];
      if (n.kind === 'perform') text = 'PERFORM ' + (formName[n.form] || '?');
      else if (n.kind === 'select') { text = '조회' + (n.where ? '\n조건: ' + n.where : ''); if (n.table) rd.push({ table: n.table, cols: (n.fields || []).slice(), op: 'R' }); }
      else if (n.kind === 'if') { kind = 'decision'; text = (n.conds || []).filter(Boolean).join(' / ') || '조건'; }
      else if (n.kind === 'case') { kind = 'decision'; text = (n.subject || '값') + '?'; }
      else if (n.kind === 'message') text = '메시지 ' + (n.type || 'I') + ': ' + (n.type || 'i').toLowerCase() + (n.no || '000') + '(' + (n.cls || '') + ')';
      else if (n.kind === 'write') text = '출력: ' + (n.text || '');
      else if (n.kind === 'end') { kind = 'terminal'; text = '끝'; }
      else if (KINDS[n.kind]) { kind = n.kind; text = n.text || ''; }
      var x = n.x || 0, y = n.y || 0, ln;
      if (OLD_EV[n.lane]) ln = lane(n.lane);
      else {  /* FORM 안의 노드: 그 FORM을 부르는 첫 PERFORM 옆으로 */
        var c = callerOf[n.lane];
        ln = lane(c ? c.lane : 'SOS');
        text = '[' + (formName[n.lane] || 'FORM') + '] ' + text;
        stack[n.lane] = (stack[n.lane] || 0) + 1;
        x = (c ? c.x : 0) + 270; y = (c ? c.y : 0) + (stack[n.lane] - 1) * 90;
      }
      return { id: n.id, kind: kind, text: text, x: x, y: y, lane: ln, reads: rd };
    });
    lanes.sort(function (a, b) { return PRESET.indexOf(a.name) - PRESET.indexOf(b.name); });
    f.lanes = lanes;
    f.lanesOn = true;
    f.edges = (f.edges || []).filter(function (e) { return byId[e.from] && byId[e.to]; })
      .map(function (e) { return { id: e.id, from: e.from, to: e.to, label: e.label === '참' ? '예' : e.label === '거짓' ? '아니오' : (e.label || '') }; });
    delete f.forms;
    restack(f);   /* 도형 크기가 달라졌으니 줄 간격을 다시 맞춰요 */
  }
  function norm(f) {
    if (f.forms || (f.nodes || []).some(function (n) { return OLD_KIND[n.kind]; })) migrate(f);
    if (!Array.isArray(f.lanes)) f.lanes = [];
    if (typeof f.lanesOn !== 'boolean') f.lanesOn = f.lanes.length > 0;
    if (!Array.isArray(f.nodes)) f.nodes = [];
    if (!Array.isArray(f.edges)) f.edges = [];
    var lid = {}; f.lanes.forEach(function (l) { lid[l.id] = 1; });
    f.nodes.forEach(function (n) {
      if (!KINDS[n.kind]) n.kind = 'process';
      if (n.text == null) n.text = '';
      if (!Array.isArray(n.reads)) n.reads = [];
      if (f.lanesOn && f.lanes.length && !lid[n.lane]) n.lane = f.lanes[f.lanes.length - 1].id;
    });
    return f;
  }
  function flows() { var fs = S().flows || []; fs.forEach(norm); return fs; }
  function cur() {
    var fs = flows(), f = null;
    for (var i = 0; i < fs.length; i++) if (fs[i].id === curId) f = fs[i];
    if (!f && fs.length) { f = fs[0]; setCur(f.id); }
    return f;
  }
  function N(f, id) { for (var i = 0; i < f.nodes.length; i++) if (f.nodes[i].id === id) return f.nodes[i]; return null; }
  function ED(f, id) { for (var i = 0; i < f.edges.length; i++) if (f.edges[i].id === id) return f.edges[i]; return null; }
  function LN(f, id) { for (var i = 0; i < f.lanes.length; i++) if (f.lanes[i].id === id) return f.lanes[i]; return null; }
  function TB(id) { var t = S().tables; for (var i = 0; i < t.length; i++) if (t[i].id === id) return t[i]; return null; }
  function laneNo(f, id) { for (var i = 0; i < f.lanes.length; i++) if (f.lanes[i].id === id) return i + 1; return 0; }
  function laneLabel(f, n) { if (!f.lanesOn) return ''; var l = LN(f, n.lane); return l ? laneNo(f, l.id) + '. ' + l.name : ''; }
  function reads(n) { return n.kind === 'process' ? (n.reads || []) : []; }
  function oneLine(s) { return String(s || '').replace(/\s*\n\s*/g, ' ').trim(); }

  var fsel = null;        /* { type: 'node'|'edge'|'lane', id } */
  var connect = false, connFrom = null;
  var FV = { x: 40, y: 40, k: 1 }, fitted = {};
  var dbOpen = {};        /* "DB 조회"를 켰지만 아직 테이블을 안 고른 단계(화면 상태만, 문서에는 저장 안 함) */

  function save() { E.commit(); draw(); E.renderSide(); }
  function selectF(s) { fsel = s; if (U.sheet) U.sheet(null); draw(); E.renderSide(); }

  /* ---------------- 글자 폭 · 줄바꿈 ---------------- */
  function tw(s, fs) { var w = 0; for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 0x2e80 ? fs : fs * 0.56; return w; }
  function wrap(text, px, fs, max) {
    var out = [];
    String(text || '').split('\n').forEach(function (para) {
      var line = '';
      para.split(/(\s+)/).forEach(function (word) {
        if (tw(line + word, fs) <= px) { line += word; return; }
        if (line.trim()) out.push(line.trim());
        line = word.trim();
        while (tw(line, fs) > px) {   /* 한 단어가 너무 길면 글자 단위로 */
          var cut = line.length; while (cut > 1 && tw(line.slice(0, cut), fs) > px) cut--;
          out.push(line.slice(0, cut)); line = line.slice(cut);
        }
      });
      out.push(line.trim());
    });
    while (out.length > 1 && !out[out.length - 1]) out.pop();
    if (out.length > max) { out = out.slice(0, max); out[max - 1] = out[max - 1].replace(/.$/, '') + '…'; }
    return out;
  }

  /* ---------------- 크기 · 배치 ---------------- */
  var FS = 13, LH = 18, HW = 196, PAD = 24, EMPTY_H = 52, CHIP_H = 28, CHIP_GAP = 6;
  function nodeSize(n) {
    if (n.kind === 'terminal') return { w: 124, h: 44, lines: wrap(n.text || '시작', 104, FS, 1) };
    if (n.kind === 'decision') { var dl = wrap(n.text || '판단', 112, FS, 3); return { w: 176, h: Math.max(100, dl.length * LH + 64), lines: dl }; }
    var pl = wrap(n.text || '처리', 168, FS, 5);
    return { w: 192, h: Math.max(54, pl.length * LH + 24), lines: pl };
  }
  function chipW(r) { var t = TB(r.table); return Math.min(220, 40 + tw(t ? t.name : '연결 끊김', 12) + 12); }
  function chipsW(n) { var w = 0; reads(n).forEach(function (r) { w = Math.max(w, chipW(r)); }); return w ? w + 34 : 0; }
  function layout(f) {
    var bands = [], byId = {}, W = 0;
    if (f.lanesOn && f.lanes.length) {
      var top = 0;
      f.lanes.forEach(function (l, i) {
        var ns = f.nodes.filter(function (n) { return n.lane === l.id; }), h = 0;
        ns.forEach(function (n) { var s = nodeSize(n), ch = reads(n).length * (CHIP_H + CHIP_GAP); h = Math.max(h, n.y + Math.max(s.h, ch)); W = Math.max(W, HW + PAD + n.x + s.w + chipsW(n)); });
        var B = { id: l.id, name: l.name, no: i + 1, top: top, h: ns.length ? h + PAD * 2 : EMPTY_H, empty: !ns.length };
        bands.push(B); byId[l.id] = B; top += B.h;
      });
      W = Math.max(W + PAD * 2, 980);
    }
    function pos(n) {
      if (!bands.length) return { x: n.x, y: n.y };
      var B = byId[n.lane] || bands[bands.length - 1];
      return { x: HW + PAD + n.x, y: B.top + PAD + n.y };
    }
    return { bands: bands, byId: byId, W: W, pos: pos };
  }
  function box(lay, n) { var p = lay.pos(n), s = nodeSize(n); return { x: p.x, y: p.y, w: s.w, h: s.h, lines: s.lines }; }

  /* ---------------- 스타일 ---------------- */
  var css = [
    '#fstage { position: absolute; inset: 0; width: 100%; height: 100%; display: none; touch-action: none; background: var(--bg); }',
    'html.mode-flow #fstage { display: block; }',
    '#fstage.panning { cursor: grabbing; }',
    '#fstage.connecting .fnode { cursor: crosshair; }',
    '#fstage text { pointer-events: none; }',
    '#fstage, #fstage * { -webkit-user-select: none; user-select: none; }',
    '.fband-bg { fill: var(--panel); }',
    '.fband.alt .fband-bg { fill: var(--bg); }',
    '.fband-line { stroke: var(--line-2); stroke-width: 1; }',
    '.fband-head { fill: var(--head); cursor: pointer; }',
    '.fband.sel .fband-head { fill: var(--accent-soft); }',
    '.fb-no { fill: var(--accent); } .fb-no-t { font: 700 11px var(--font-ui); fill: #fff; }',
    '.fb-name { font: 700 12.5px var(--font-mono); fill: var(--ink); }',
    '.fband.empty .fb-name { opacity: .6; }',
    '.fb-empty { font: 400 12px var(--font-ui); fill: var(--muted); }',
    '.fnode { cursor: grab; }',
    '.fn-shape { fill: var(--node); stroke: var(--card-line-2); stroke-width: 1.3; filter: drop-shadow(0 1px 2px rgb(16 24 40 / .06)) drop-shadow(0 3px 8px rgb(16 24 40 / .06)); }',
    '.fnode.terminal .fn-shape { fill: var(--accent-soft); stroke: var(--accent); }',
    '.fnode.decision .fn-shape { fill: var(--h2); stroke: var(--s2); }',
    '.fnode:hover .fn-shape { stroke-width: 1.8; }',
    '.fnode.sel .fn-shape { stroke: var(--accent); stroke-width: 2.4; }',
    '.fnode.from .fn-shape { stroke: var(--accent); stroke-width: 2.4; stroke-dasharray: 6 4; }',
    '.fn-t { font: 500 13px var(--font-ui); fill: var(--ink); }',
    '.fnode.terminal .fn-t { font-weight: 700; }',
    '.fchip { cursor: pointer; }',
    '.fchip-bg { fill: var(--panel); stroke: var(--s0); stroke-width: 1.3; }',
    '.fchip:hover .fchip-bg { fill: var(--h0); }',
    '.fchip-ic { fill: var(--h0); stroke: var(--s0); stroke-width: 1.3; }',
    '.fchip-t { font: 600 12px var(--font-mono); fill: var(--ink); }',
    '.fchip-r { font: 700 9.5px var(--font-mono); fill: var(--s0); }',
    '.fchip.broken .fchip-bg { stroke: var(--danger); stroke-dasharray: 4 3; }',
    '.fchip.broken .fchip-ic { stroke: var(--danger); fill: none; }',
    '.fchip.broken .fchip-t { fill: var(--danger); }',
    '.fchip-link { fill: none; stroke: var(--s0); stroke-width: 1.3; stroke-dasharray: 4 4; }',
    '.fchip-link.broken { stroke: var(--danger); }',
    '.fedge path.l { fill: none; stroke: var(--edge); stroke-width: 1.6; stroke-linejoin: round; }',
    '.fedge.sel path.l, .fedge.hot path.l, .fedge:hover path.l { stroke: var(--accent); stroke-width: 2; }',
    '.fedge path.h { fill: none; stroke: transparent; stroke-width: 16; cursor: pointer; }',
    '.fe-chip { fill: var(--panel); stroke: var(--line-2); } .fedge.sel .fe-chip { stroke: var(--accent); }',
    '.fe-t { font: 600 11.5px var(--font-ui); fill: var(--ink-2); }',
    '#farrow path { fill: var(--edge); } #farrow-hot path { fill: var(--accent); }',
    /* toolbar */
    '.ftools { display: flex; align-items: center; gap: 8px; }',
    '.ftools select.btn { max-width: 190px; }',
    '#f-connect[aria-pressed="true"], #f-lanes[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }',
    '.fsh { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.7; }',
    /* empty */
    '.fempty { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; padding: 24px; text-align: center; pointer-events: none; }',
    'html.mode-flow .fempty.on { display: flex; }',
    '.fempty .box { pointer-events: auto; max-width: 420px; display: flex; flex-direction: column; align-items: center; gap: 12px; }',
    '.fempty h3 { margin: 0; font-size: 17px; }',
    '.fempty p { margin: 0; color: var(--muted); font-size: 13.5px; line-height: 1.7; }',
    /* side panel */
    '.fwarn { margin: 0; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--danger); color: var(--danger); font-size: 12.5px; line-height: 1.6; }',
    '.fnote { margin: 0; color: var(--muted); font-size: 12.5px; line-height: 1.6; }',
    '.fkind { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }',
    '.fkind button, .fquick button { display: flex; align-items: center; justify-content: center; gap: 6px; height: 36px; border: 1px solid var(--line); border-radius: 9px; background: var(--panel); color: var(--ink-2); font-size: 13px; font-weight: 500; }',
    '.fkind button[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); font-weight: 600; }',
    '.fquick { display: flex; gap: 6px; }',
    '.fquick button { padding: 0 14px; }',
    '.ftables { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }',
    '.ftables > li + li { border-top: 1px solid var(--line); }',
    '.ftables .tr { display: flex; align-items: center; gap: 10px; padding: 9px 12px; font-size: 13px; cursor: pointer; }',
    '.ftables .tr:hover { background: var(--bg); }',
    '.ftables input { accent-color: var(--accent); width: 16px; height: 16px; margin: 0; flex: none; }',
    '.ftables .tn { font: 600 12.5px var(--font-mono); }',
    '.ftables .tk { color: var(--muted); font-size: 12px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.ftables .go { height: 26px; padding: 0 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel); font-size: 11.5px; color: var(--ink-2); flex: none; }',
    '.ftables .go:hover { border-color: var(--accent); color: var(--accent); }',
    '.ftables details { padding: 0 12px 10px 38px; }',
    '.ftables summary { font-size: 12px; color: var(--muted); cursor: pointer; padding: 2px 0 6px; }',
    '.ftables .cols { display: flex; flex-wrap: wrap; gap: 6px 12px; }',
    '.ftables .cols label { display: inline-flex; align-items: center; gap: 5px; font: 500 12px var(--font-mono); color: var(--ink-2); cursor: pointer; }',
    '.ftables .cols input { width: 14px; height: 14px; }',
    '.ftables li.gone .tr { color: var(--danger); }',
    '.flanes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }',
    '.flanes li { display: grid; grid-template-columns: 22px minmax(0, 1fr) 30px 30px 30px; gap: 4px; align-items: center; }',
    '.flanes .no { font: 700 12px var(--font-ui); color: var(--accent); text-align: center; }',
    '.flanes .in { height: 32px; font: 500 12.5px var(--font-mono); }',
    '.flanes .ib { width: 30px; height: 30px; }',
    '.flanes .ib:disabled { opacity: .3; cursor: default; }',
    '.fladd { display: flex; gap: 6px; }',
    '.fladd select { flex: 1; min-width: 0; }',
    '.fbtns { display: flex; gap: 6px; flex-wrap: wrap; }',
    '.fbtns .btn { height: 32px; font-size: 12.5px; padding: 0 10px; }',
    '.flist { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }',
    '.flist li + li { border-top: 1px solid var(--line); }',
    '.flist button { display: flex; gap: 8px; align-items: center; width: 100%; padding: 9px 12px; border: 0; background: var(--panel); text-align: left; font-size: 12.5px; color: var(--ink-2); }',
    '.flist button:hover { background: var(--bg); }',
    '.flist .tag { font: 600 10.5px var(--font-ui); color: var(--muted); border: 1px solid var(--line-2); border-radius: 5px; padding: 0 5px; flex: none; }',
    '.flist .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    /* usage table */
    '.fu .modal { width: min(920px, 100%); }',
    '.fu-wrap { overflow: auto; max-height: min(60vh, 520px); border: 1px solid var(--line); border-radius: 12px; }',
    '.fu table { border-collapse: collapse; width: 100%; font-size: 13px; }',
    '.fu th, .fu td { border-bottom: 1px solid var(--line); border-right: 1px solid var(--line); padding: 8px 10px; text-align: center; white-space: nowrap; }',
    '.fu thead th { position: sticky; top: 0; background: var(--head); font: 700 12px var(--font-mono); z-index: 1; }',
    '.fu thead th small { display: block; font: 500 11px var(--font-ui); color: var(--muted); }',
    '.fu tbody th { text-align: left; font: 500 13px var(--font-ui); background: var(--panel); position: sticky; left: 0; max-width: 260px; overflow: hidden; text-overflow: ellipsis; }',
    '.fu tr.lane th { font: 700 12.5px var(--font-mono); background: var(--bg); color: var(--accent); }',
    '.fu tr.lane td { background: var(--bg); }',
    '.fu tr.step th { padding-left: 24px; }',
    '.fu td.on { font: 700 13px var(--font-mono); color: var(--accent); background: var(--accent-soft); }',
    '.fu thead th.gone { color: var(--danger); }',
    '.fu .head { display: flex; align-items: center; gap: 10px; }',
    '.fu .head h3 { flex: 1; }',
    /* mobile dock */
    '.fdock { display: none; }',
    '@media (max-width: 860px) {',
    '  html.mode-flow .dock { display: none !important; }',
    '  html.mode-flow .fdock { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); position: absolute; left: 12px; right: 12px; bottom: 22px; z-index: 3; gap: 2px; padding: 4px; border-radius: 16px; background: var(--panel); border: 1px solid var(--line); box-shadow: 0 6px 18px rgb(16 24 40 / .12); }',
    '  .fdock button { display: flex; align-items: center; justify-content: center; gap: 6px; height: 44px; padding: 0 6px; border: 0; border-radius: 12px; background: transparent; color: var(--ink-2); font-size: 13px; font-weight: 500; }',
    '  .fdock button[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); font-weight: 600; }',
    '  html.previewing .fdock { display: none !important; }',
    '}'
  ].join('\n');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var SH = {
    terminal: '<svg class="fsh" viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="6" width="16" height="8" rx="4"/></svg>',
    process: '<svg class="fsh" viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="5" width="15" height="10" rx="1.5"/></svg>',
    decision: '<svg class="fsh" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5L17.5 10L10 17.5L2.5 10Z"/></svg>',
    connect: '<svg class="fsh" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h11M10 6l4 4-4 4"/></svg>'
  };

  /* ---------------- 캔버스 ---------------- */
  var wrapEl = $('.stage-wrap');
  var svg = document.createElementNS(NS, 'svg');
  svg.id = 'fstage'; svg.setAttribute('role', 'application'); svg.setAttribute('aria-label', '프로그램 흐름 그림판');
  svg.innerHTML = '<defs><pattern id="fdots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.2" fill="var(--dot)"/></pattern>' +
    '<marker id="farrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker>' +
    '<marker id="farrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>' +
    '<rect width="100%" height="100%" fill="url(#fdots)"/><g id="fworld"><g id="f-bands"></g><g id="f-links"></g><g id="f-edges"></g><g id="f-nodes"></g><g id="f-chips"></g></g>';
  wrapEl.insertBefore(svg, $('#stage').nextSibling);
  var world = svg.querySelector('#fworld'), gB = svg.querySelector('#f-bands'), gK = svg.querySelector('#f-links'), gE = svg.querySelector('#f-edges'), gN = svg.querySelector('#f-nodes'), gC = svg.querySelector('#f-chips');
  var empty = document.createElement('div');
  empty.className = 'fempty';
  empty.innerHTML = '<div class="box"><h3>프로그램 흐름이 아직 없어요</h3><p>시작 → 처리 → 판단 → 끝 순서로 그리고, 각 단계가 어느 이벤트에서 일어나는지와 어떤 테이블을 조회하는지 함께 표시해요.</p><button class="btn primary" type="button" data-fa="newflow">+ 새 흐름 만들기</button></div>';
  wrapEl.appendChild(empty);
  var fdock = document.createElement('div');
  fdock.className = 'fdock'; fdock.setAttribute('role', 'group'); fdock.setAttribute('aria-label', '흐름 도구');
  wrapEl.appendChild(fdock);

  function el(name, attrs, parent, text) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n); return n;
  }
  function clear(g) { while (g.firstChild) g.removeChild(g.firstChild); }
  function applyView() {
    world.setAttribute('transform', 'translate(' + FV.x + ',' + FV.y + ') scale(' + FV.k + ')');
    svg.querySelector('#fdots').setAttribute('patternTransform', 'translate(' + FV.x + ',' + FV.y + ') scale(' + FV.k + ')');
    if (E.mode() === 'flow') $('#zoom-val').textContent = Math.round(FV.k * 100) + '%';
  }

  /* 직각 화살표: 꺾이는 점 목록, 모서리를 둥글린 경로, 가운데 점(라벨 자리) */
  function route(A, B) {
    if (B.y >= A.y + A.h + 16) {
      var x1 = A.x + A.w / 2, y1 = A.y + A.h, x2 = B.x + B.w / 2, y2 = B.y, my = Math.round(y1 + Math.max(16, (y2 - y1) / 2));
      if (Math.abs(x1 - x2) < 14) return [[x1, y1], [x1, y2]];   /* 조금만 어긋나면 곧게 */
      return [[x1, y1], [x1, my], [x2, my], [x2, y2]];
    }
    if (B.x >= A.x + A.w + 16 || B.x + B.w <= A.x - 16) {
      var right = B.x > A.x, sx = right ? A.x + A.w : A.x, ex = right ? B.x : B.x + B.w, sy = A.y + A.h / 2, ey = B.y + B.h / 2, mx = Math.round((sx + ex) / 2);
      return Math.abs(sy - ey) < 1 ? [[sx, sy], [ex, ey]] : [[sx, sy], [mx, sy], [mx, ey], [ex, ey]];
    }
    var rx = Math.max(A.x + A.w, B.x + B.w) + 32, ay = A.y + A.h / 2, by = B.y + B.h / 2;
    return [[A.x + A.w, ay], [rx, ay], [rx, by], [B.x + B.w, by]];
  }
  function pathOf(pts) {
    var d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (var i = 1; i < pts.length - 1; i++) {
      var a = pts[i - 1], b = pts[i], c = pts[i + 1], r = Math.min(10, Math.hypot(a[0] - b[0], a[1] - b[1]) / 2, Math.hypot(c[0] - b[0], c[1] - b[1]) / 2);
      d += 'L' + (b[0] + Math.sign(a[0] - b[0]) * r) + ' ' + (b[1] + Math.sign(a[1] - b[1]) * r) + 'Q' + b[0] + ' ' + b[1] + ' ' + (b[0] + Math.sign(c[0] - b[0]) * r) + ' ' + (b[1] + Math.sign(c[1] - b[1]) * r);
    }
    var l = pts[pts.length - 1], q = pts[pts.length - 2];
    return d + 'L' + (l[0] - Math.sign(l[0] - q[0]) * 2) + ' ' + (l[1] - Math.sign(l[1] - q[1]) * 2);
  }
  function midOf(pts) {
    var tot = 0, i, seg = [];
    for (i = 0; i < pts.length - 1; i++) { var L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(L); tot += L; }
    var h = tot / 2;
    for (i = 0; i < seg.length; i++) { if (h <= seg[i] || i === seg.length - 1) { var t = seg[i] ? h / seg[i] : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]; } h -= seg[i]; }
    return pts[0];
  }

  function draw() {
    paintTools();
    if (E.mode() !== 'flow') return;
    var f = (S().flows || []).length ? cur() : null;
    empty.classList.toggle('on', !f);
    clear(gB); clear(gK); clear(gE); clear(gN); clear(gC);
    if (!f) { applyView(); return; }
    if (!fitted[f.id]) { fitted[f.id] = 1; requestAnimationFrame(fit); }
    var lay = layout(f), sn = fsel && fsel.type === 'node' ? N(f, fsel.id) : null;

    /* 이벤트 레인(가로 띠): 위 → 아래가 실행 순서 */
    lay.bands.forEach(function (B, i) {
      var on = fsel && fsel.type === 'lane' && fsel.id === B.id;
      var g = el('g', { 'class': 'fband' + (i % 2 ? ' alt' : '') + (B.empty ? ' empty' : '') + (on ? ' sel' : ''), transform: 'translate(0,' + B.top + ')' }, gB);
      el('rect', { width: lay.W, height: B.h, 'class': 'fband-bg' }, g);
      el('rect', { width: HW, height: B.h, 'class': 'fband-head', 'data-l': B.id }, g);
      el('line', { x1: 0, x2: lay.W, y1: 0, y2: 0, 'class': 'fband-line' }, g);
      if (i === lay.bands.length - 1) el('line', { x1: 0, x2: lay.W, y1: B.h, y2: B.h, 'class': 'fband-line' }, g);
      el('line', { x1: HW, x2: HW, y1: 0, y2: B.h, 'class': 'fband-line' }, g);
      var cy = B.empty ? B.h / 2 : 26;
      el('circle', { cx: 22, cy: cy, r: 10, 'class': 'fb-no' }, g);
      el('text', { x: 22, y: cy + 4, 'text-anchor': 'middle', 'class': 'fb-no-t' }, g, String(B.no));
      var nl = B.empty ? wrap(B.name, HW - 52, 12.5, 1) : wrap(B.name, HW - 52, 12.5, 3);
      nl.forEach(function (t, k) { el('text', { x: 40, y: cy + 4 + k * 17, 'class': 'fb-name' }, g, t); });
      if (B.empty) el('text', { x: HW + PAD, y: B.h / 2 + 4, 'class': 'fb-empty' }, g, '비어 있음');
    });

    /* 화살표 */
    f.edges.forEach(function (e) {
      var a = N(f, e.from), b = N(f, e.to); if (!a || !b) return;
      var pts = route(box(lay, a), box(lay, b));
      var on = fsel && fsel.type === 'edge' && fsel.id === e.id, hot = sn && (sn.id === a.id || sn.id === b.id);
      var g = el('g', { 'class': 'fedge' + (on ? ' sel' : '') + (hot ? ' hot' : ''), 'data-e': e.id }, gE), d = pathOf(pts);
      el('path', { d: d, 'class': 'l', 'marker-end': on || hot ? 'url(#farrow-hot)' : 'url(#farrow)' }, g);
      el('path', { d: d, 'class': 'h' }, g);
      if (e.label) {
        var m = midOf(pts), w = Math.min(170, tw(e.label, 11.5) + 18);
        el('rect', { x: m[0] - w / 2, y: m[1] - 11, width: w, height: 22, rx: 11, 'class': 'fe-chip' }, g);
        el('text', { x: m[0], y: m[1] + 4, 'text-anchor': 'middle', 'class': 'fe-t' }, g, e.label.length > 22 ? e.label.slice(0, 21) + '…' : e.label);
      }
    });

    /* 단계 + DB 칩 */
    f.nodes.forEach(function (n) {
      var b = box(lay, n), on = sn && sn.id === n.id;
      var g = el('g', { 'class': 'fnode ' + n.kind + (on ? ' sel' : '') + (connFrom === n.id ? ' from' : ''), 'data-n': n.id, transform: 'translate(' + b.x + ',' + b.y + ')' }, gN);
      if (n.kind === 'terminal') el('rect', { width: b.w, height: b.h, rx: b.h / 2, 'class': 'fn-shape' }, g);
      else if (n.kind === 'decision') el('path', { d: 'M' + b.w / 2 + ' 0L' + b.w + ' ' + b.h / 2 + 'L' + b.w / 2 + ' ' + b.h + 'L0 ' + b.h / 2 + 'Z', 'class': 'fn-shape' }, g);
      else el('rect', { width: b.w, height: b.h, rx: 8, 'class': 'fn-shape' }, g);
      var y0 = b.h / 2 - (b.lines.length - 1) * LH / 2 + 4.5;
      b.lines.forEach(function (t, i) { el('text', { x: b.w / 2, y: y0 + i * LH, 'text-anchor': 'middle', 'class': 'fn-t' }, g, t); });

      var rs = reads(n); if (!rs.length) return;
      var total = rs.length * CHIP_H + (rs.length - 1) * CHIP_GAP, cx = b.x + b.w + 30, cy0 = b.y + b.h / 2 - total / 2;
      rs.forEach(function (r, i) {
        var t = TB(r.table), w = chipW(r), y = cy0 + i * (CHIP_H + CHIP_GAP), bad = !t;
        el('path', { d: 'M' + (b.x + b.w) + ' ' + (b.y + b.h / 2) + 'H' + (cx - 14) + 'V' + (y + CHIP_H / 2) + 'H' + cx, 'class': 'fchip-link' + (bad ? ' broken' : '') }, gK);
        var c = el('g', { 'class': 'fchip' + (bad ? ' broken' : ''), 'data-chip': n.id + '|' + i, transform: 'translate(' + cx + ',' + y + ')' }, gC);
        el('title', {}, c, bad ? '연결 끊김: ERD에서 이 테이블이 지워졌어요' : (t.name + (t.ko ? ' ' + t.ko : '') + ' 조회 (R) · 누르면 ERD에서 보기'));
        el('rect', { width: w, height: CHIP_H, rx: 8, 'class': 'fchip-bg' }, c);
        el('path', { d: 'M9 9v10a6 2.4 0 0 0 12 0V9', 'class': 'fchip-ic' }, c);
        el('ellipse', { cx: 15, cy: 9, rx: 6, ry: 2.4, 'class': 'fchip-ic' }, c);
        el('text', { x: 28, y: 18, 'class': 'fchip-t' }, c, bad ? '연결 끊김' : (t.name.length > 20 ? t.name.slice(0, 19) + '…' : t.name));
        el('text', { x: w - 8, y: 11, 'text-anchor': 'end', 'class': 'fchip-r' }, c, r.op || 'R');
      });
    });
    applyView();
  }

  /* ---------------- 화면 맞춤 · 확대 ---------------- */
  function bounds(f) {
    var lay = layout(f), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    f.nodes.forEach(function (n) { var b = box(lay, n); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w + chipsW(n)); y1 = Math.max(y1, b.y + b.h); });
    if (lay.bands.length) { var last = lay.bands[lay.bands.length - 1]; x0 = 0; y0 = 0; x1 = Math.max(x1, lay.W); y1 = Math.max(y1, last.top + last.h); }
    if (x0 > x1) { x0 = 0; y0 = 0; x1 = 600; y1 = 400; }
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  function fit() {
    var f = (S().flows || []).length ? cur() : null, r = svg.getBoundingClientRect(); if (!f || !r.width) return;
    var b = bounds(f), small = r.width < 600, m = small ? 12 : 40, dockH = small ? 90 : 0;
    var k = Math.min((r.width - m * 2) / (b.x1 - b.x0), (r.height - m * 2 - dockH) / (b.y1 - b.y0), 1.1);
    k = Math.max(small ? 0.4 : 0.3, k);
    FV.k = k; FV.x = Math.max(m, (r.width - (b.x1 - b.x0) * k) / 2) - b.x0 * k; FV.y = Math.max(m, (r.height - dockH - (b.y1 - b.y0) * k) / 2) - b.y0 * k;
    applyView();
  }
  function zoomAt(cx, cy, fct) {
    var r = svg.getBoundingClientRect(), nk = Math.max(0.2, Math.min(2.5, FV.k * fct)), px = cx - r.left, py = cy - r.top;
    FV.x = px - (px - FV.x) * (nk / FV.k); FV.y = py - (py - FV.y) * (nk / FV.k); FV.k = nk; applyView();
  }
  function toWorld(cx, cy) { var r = svg.getBoundingClientRect(); return [(cx - r.left - FV.x) / FV.k, (cy - r.top - FV.y) / FV.k]; }
  function centerOn(f, n) {
    var b = box(layout(f), n), r = svg.getBoundingClientRect(); if (!r.width) return;
    FV.x = r.width / 2 - (b.x + b.w / 2) * FV.k; FV.y = r.height / 3 - (b.y + b.h / 2) * FV.k; applyView();
  }
  [['#zoom-in', 1.2], ['#zoom-out', 1 / 1.2], ['#zoom-fit', 0]].forEach(function (z) {
    var b = $(z[0]); if (!b) return;
    b.addEventListener('click', function (e) {
      if (E.mode() !== 'flow') return;
      e.stopImmediatePropagation();
      if (!z[1]) { fit(); return; }
      var r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, z[1]);
    }, true);
  });

  /* 캔버스 좌표 → 단계 좌표(레인이 켜져 있으면 어느 띠인지까지 정해요) */
  function place(f, lay, n, ax, ay) {
    if (!lay.bands.length) { n.x = Math.round(ax / 10) * 10; n.y = Math.round(ay / 10) * 10; return; }
    var mid = ay + nodeSize(n).h / 2, B = lay.bands[lay.bands.length - 1];
    for (var i = 0; i < lay.bands.length; i++) if (mid < lay.bands[i].top + lay.bands[i].h) { B = lay.bands[i]; break; }
    n.lane = B.id;
    n.x = Math.max(0, Math.round((ax - HW - PAD) / 10) * 10);
    n.y = Math.max(0, Math.round((ay - B.top - PAD) / 10) * 10);
  }

  /* ---------------- 포인터 ---------------- */
  var ptrs = {}, drag = null, pinch = null;
  svg.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(ptrs);
    if (ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; return; }
    try { svg.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    var t = e.target, nEl = t.closest('[data-n]'), cEl = t.closest('[data-chip]'), eEl = t.closest('[data-e]'), lEl = t.closest('[data-l]');
    var base = { sx: e.clientX, sy: e.clientY, vx: FV.x, vy: FV.y, moved: false, kind: 'tap', pan: true };
    if (cEl && !connect) { base.fn = function () { chipClick(cEl.getAttribute('data-chip')); }; drag = base; return; }
    if (nEl) {
      var f = cur(), n = N(f, nEl.getAttribute('data-n')), lay = layout(f), bx = box(lay, n), w = toWorld(e.clientX, e.clientY);
      drag = { kind: 'node', id: n.id, lay: lay, ox: w[0] - bx.x, oy: w[1] - bx.y, sx: e.clientX, sy: e.clientY, moved: false };
      return;
    }
    if (eEl && !connect) base.fn = function () { selectF({ type: 'edge', id: eEl.getAttribute('data-e') }); };
    else if (lEl) base.fn = function () { selectF({ type: 'lane', id: lEl.getAttribute('data-l') }); };
    else base.fn = function () { if (connFrom) { connFrom = null; draw(); hintConnect(); } else selectF(null); };
    drag = base;
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
      place(f, drag.lay, n, w[0] - drag.ox, w[1] - drag.oy);   /* 드래그를 시작할 때의 띠를 기준으로 판단해서 흔들리지 않아요 */
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
  svg.addEventListener('dblclick', function (e) {
    if (e.target.closest('[data-n],[data-chip],[data-e]') || ro()) return;
    var f = (S().flows || []).length ? cur() : null; if (!f) return;
    var w = toWorld(e.clientX, e.clientY);
    fsel = null; addNode('process', { x: w[0] - 96, y: w[1] - 27 });
  });
  function chipClick(key) {
    var p = key.split('|'), f = cur(), n = N(f, p[0]); if (!n) return;
    var r = reads(n)[+p[1]];
    if (r && TB(r.table)) E.focusTable(r.table, (r.cols || []).slice());
    else { selectF({ type: 'node', id: n.id }); E.hint('ERD에서 이 테이블이 지워졌어요. 다른 테이블을 고르거나 ERD에서 되돌리기로 살릴 수 있어요', true, 4200); }
  }

  /* ---------------- 연결 ---------------- */
  function setConnect(on, from) {
    connect = !!on; connFrom = on ? (from || null) : null;
    svg.classList.toggle('connecting', connect);
    draw(); hintConnect();
  }
  function hintConnect() {
    if (!connect) { E.hint(''); return; }
    E.hint(connFrom ? '이어 줄 다음 단계를 누르세요 (Esc로 끝내기)' : '연결: 먼저 출발할 단계를 누르세요');
  }
  function addEdge(f, from, to) {
    var a = N(f, from), label = '';
    if (a && a.kind === 'decision') {
      var used = f.edges.filter(function (x) { return x.from === from; }).map(function (x) { return x.label; });
      label = used.indexOf('예') < 0 ? '예' : used.indexOf('아니오') < 0 ? '아니오' : '';
    }
    var e = { id: E.uid('e'), from: from, to: to, label: label };
    f.edges.push(e); return e;
  }
  function clickConnect(id) {
    if (ro()) return;
    var f = cur();
    if (!connFrom) { connFrom = id; draw(); hintConnect(); return; }
    if (connFrom === id) { connFrom = null; draw(); hintConnect(); return; }
    if (f.edges.some(function (x) { return x.from === connFrom && x.to === id; })) { E.hint('이미 이어져 있어요', true, 2000); connFrom = null; draw(); return; }
    addEdge(f, connFrom, id);
    connFrom = id;   /* 이어서 다음 단계를 바로 이을 수 있게 */
    save(); hintConnect();
  }

  /* ---------------- 만들기 · 지우기 ---------------- */
  function newFlow() {
    if (ro()) return;
    var s = S(); if (!s.flows) s.flows = [];
    var f = { id: E.uid('f'), name: '흐름 ' + (s.flows.length + 1), desc: '', lanesOn: true, lanes: DEFAULT_LANES.map(function (x) { return { id: E.uid('l'), name: x }; }), nodes: [], edges: [] };
    s.flows.push(f); setCur(f.id); fsel = null; fitted[f.id] = 0;
    if (E.mode() !== 'flow') E.setMode('flow');
    save();
    E.hint('새 흐름을 만들었어요. [시작/끝]부터 추가해 보세요', false, 3600);
  }
  function addNode(kind, at) {
    if (ro()) return;
    var f = (S().flows || []).length ? cur() : null; if (!f) { newFlow(); f = cur(); }
    var lay = layout(f), after = fsel && fsel.type === 'node' ? N(f, fsel.id) : null;
    var n = { id: E.uid('n'), kind: kind, text: kind === 'terminal' ? (f.nodes.some(function (x) { return x.kind === 'terminal'; }) ? '끝' : '시작') : kind === 'decision' ? '조건?' : '처리', x: 0, y: 0, lane: null, reads: [] };
    if (at) place(f, lay, n, at.x, at.y);
    else if (after) {   /* 고른 단계 바로 아래, 같은 레인에(띠는 알아서 늘어나요) */
      var as = nodeSize(after);
      n.lane = after.lane; n.x = Math.max(0, Math.round((after.x + as.w / 2 - nodeSize(n).w / 2) / 10) * 10); n.y = Math.round((after.y + as.h + 44) / 10) * 10;
    }
    else {
      var maxY = -1, lx = 0, lane = null;
      if (lay.bands.length) {
        lane = fsel && fsel.type === 'lane' ? fsel.id : f.nodes.length ? f.nodes[f.nodes.length - 1].lane : lay.bands[0].id;
        n.lane = lane;
      }
      f.nodes.forEach(function (o) { if ((!lane || o.lane === lane) && o.y + nodeSize(o).h > maxY) { maxY = o.y + nodeSize(o).h; lx = o.x; } });
      n.x = lx; n.y = maxY < 0 ? 0 : Math.round((maxY + 44) / 10) * 10;
    }
    f.nodes.push(n);
    if (after && !at) addEdge(f, after.id, n.id);
    fsel = { type: 'node', id: n.id };
    save();
    var t = document.getElementById('fn-text'); if (t && !U.mobile()) { t.focus(); t.select(); }
  }
  function delSel() {
    if (ro() || !fsel) return;
    var f = cur(); if (!f) return;
    if (fsel.type === 'node') {
      var id = fsel.id, n = N(f, id);
      f.nodes = f.nodes.filter(function (x) { return x.id !== id; });
      f.edges = f.edges.filter(function (e) { return e.from !== id && e.to !== id; });
      fsel = null; save(); E.toast('“' + oneLine(n.text).slice(0, 20) + '” 단계를 지웠어요', E.undo);
    } else if (fsel.type === 'edge') {
      var eid = fsel.id; f.edges = f.edges.filter(function (e) { return e.id !== eid; }); fsel = null; save(); E.toast('화살표를 지웠어요', E.undo);
    } else if (fsel.type === 'lane') delLane(f, fsel.id);
  }
  function delLane(f, id) {
    var i = -1; f.lanes.forEach(function (l, k) { if (l.id === id) i = k; }); if (i < 0) return;
    var l = f.lanes[i], inside = f.nodes.filter(function (n) { return n.lane === id; }), to = f.lanes[i - 1] || f.lanes[i + 1];
    if (inside.length && !to) { E.hint('단계가 들어 있는 마지막 레인은 지울 수 없어요. 레인 사용을 꺼 주세요', true, 3600); return; }
    if (inside.length) {
      var base = 0; f.nodes.forEach(function (n) { if (n.lane === to.id) base = Math.max(base, n.y + nodeSize(n).h + 44); });
      inside.forEach(function (n) { n.lane = to.id; n.y += base; });
    }
    f.lanes.splice(i, 1); fsel = null; save();
    E.toast('“' + l.name + '” 레인을 지웠어요' + (inside.length ? ' (단계 ' + inside.length + '개는 “' + to.name + '”로 옮김)' : ''), E.undo);
  }
  function delFlow() {
    var f = cur(); if (!f || ro()) return;
    if (!confirm('“' + f.name + '” 흐름을 지울까요? 단계 ' + f.nodes.length + '개가 함께 지워져요. (지운 뒤 되돌리기로 살릴 수 있어요)')) return;
    var s = S(); s.flows = s.flows.filter(function (x) { return x.id !== f.id; });
    if (!s.flows.length) delete s.flows;
    setCur(null); fsel = null; save(); E.toast('“' + f.name + '” 흐름을 지웠어요', E.undo);
  }
  /* 레인 켜기/끄기: 화면에 보이는 위치가 그대로 남게 좌표를 바꿔요 */
  function setLanes(on) {
    var f = (S().flows || []).length ? cur() : null; if (!f || ro() || f.lanesOn === on) return;
    var lay = layout(f);
    if (!on) {
      f.nodes.forEach(function (n) { var p = lay.pos(n); n.x = p.x; n.y = p.y; });
      f.lanesOn = false;
    } else {
      if (!f.lanes.length) f.lanes = DEFAULT_LANES.map(function (x) { return { id: E.uid('l'), name: x }; });
      var lid = {}; f.lanes.forEach(function (l) { lid[l.id] = 1; });
      f.nodes.forEach(function (n) { if (!lid[n.lane]) n.lane = null; });
      var free = f.nodes.filter(function (n) { return !n.lane; }).sort(function (a, b) { return a.y - b.y; });
      if (free.length) {   /* 소속이 없으면 위에서부터 레인 수만큼 나눠 담아요 */
        var per = Math.ceil(free.length / f.lanes.length);
        free.forEach(function (n, k) { n.lane = f.lanes[Math.min(f.lanes.length - 1, Math.floor(k / per))].id; });
      }
      f.lanes.forEach(function (l) {
        var ns = f.nodes.filter(function (n) { return n.lane === l.id; }), my = 1e9, mx = 1e9;
        ns.forEach(function (n) { my = Math.min(my, n.y); mx = Math.min(mx, n.x); });
        ns.forEach(function (n) { n.y = Math.max(0, n.y - my); n.x = Math.max(0, n.x - Math.min(mx, HW + PAD)); });
      });
      f.lanesOn = true;
    }
    save(); fit();
  }
  /* 위 → 아래 단순 정렬: 비슷한 높이끼리 한 줄로 묶어 줄 간격만 맞춰요 */
  function tidy() {
    var f = (S().flows || []).length ? cur() : null; if (!f || ro() || !f.nodes.length) return;
    restack(f);
    save(); E.hint('위에서 아래로 줄을 맞췄어요', false, 2000);
  }
  function restack(f) {
    var groups = {};
    f.nodes.forEach(function (n) { var k = f.lanesOn ? n.lane : '_'; (groups[k] = groups[k] || []).push(n); });
    Object.keys(groups).forEach(function (k) {
      var ns = groups[k].sort(function (a, b) { return a.y - b.y || a.x - b.x; }), rows = [];
      ns.forEach(function (n) { var r = rows[rows.length - 1]; if (r && n.y - r.y0 < 40) r.ns.push(n); else rows.push({ y0: n.y, ns: [n] }); });
      var y = f.lanesOn ? 0 : rows[0].y0;
      rows.forEach(function (r) {
        var h = 0;
        r.ns.forEach(function (n) { h = Math.max(h, nodeSize(n).h); });
        r.ns.forEach(function (n) { n.y = y + Math.round((h - nodeSize(n).h) / 2); n.x = Math.max(0, Math.round(n.x / 20) * 20); });
        y += h + 44;
      });
    });
  }

  /* ---------------- 툴바 ---------------- */
  var ftools = $('#ftools');
  function paintTools() {
    var fs = S().flows || [], f = fs.length ? cur() : null, dis = !f || ro() ? ' disabled' : '';
    var h = '<select class="btn" id="f-pick" aria-label="흐름 고르기">' +
      fs.map(function (x) { return '<option value="' + esc(x.id) + '"' + (f && x.id === f.id ? ' selected' : '') + '>' + esc(x.name || '(이름 없음)') + '</option>'; }).join('') +
      (fs.length ? '' : '<option value="" selected>흐름 없음</option>') + '<option value="__new">+ 새 흐름</option></select>' +
      '<div class="seg" role="group" aria-label="단계 추가">' + ORDER.map(function (k) { return '<button type="button" data-add="' + k + '"' + dis + '>' + SH[k] + KINDS[k] + '</button>'; }).join('') + '</div>' +
      '<button class="btn" type="button" id="f-connect" aria-pressed="' + connect + '" title="단계끼리 화살표로 잇기"' + dis + '>' + SH.connect + '연결</button>' +
      '<span class="vr" aria-hidden="true"></span>' +
      '<button class="btn" type="button" id="f-lanes" aria-pressed="' + !!(f && f.lanesOn) + '" title="이벤트 레인(실행 순서 띠) 켜기/끄기"' + dis + '>레인</button>' +
      '<button class="btn ghost" type="button" id="f-tidy" title="위에서 아래로 줄 맞추기"' + dis + '>정렬</button>' +
      '<button class="btn ghost" type="button" id="f-usage" title="단계 × 테이블 사용표"' + (f ? '' : ' disabled') + '>사용표</button>';
    if (ftools && ftools.getAttribute('data-h') !== h) { ftools.innerHTML = h; ftools.setAttribute('data-h', h); }
    var dh = ORDER.map(function (k) { return '<button type="button" data-add="' + k + '"' + dis + '>' + SH[k] + KINDS[k] + '</button>'; }).join('') +
      '<button type="button" id="fd-connect" aria-pressed="' + connect + '"' + dis + '>' + SH.connect + '연결</button>';
    if (fdock.getAttribute('data-h') !== dh) { fdock.innerHTML = dh; fdock.setAttribute('data-h', dh); }
  }
  function onTool(e) {
    var b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.hasAttribute('data-add')) { if (connect) setConnect(false); addNode(b.getAttribute('data-add')); return; }
    if (b.id === 'f-connect' || b.id === 'fd-connect') { setConnect(!connect, fsel && fsel.type === 'node' ? fsel.id : null); return; }
    if (b.id === 'f-lanes') { var f = cur(); if (f) setLanes(!f.lanesOn); return; }
    if (b.id === 'f-tidy') { tidy(); return; }
    if (b.id === 'f-usage') { openUsage(); return; }
  }
  if (ftools) {
    ftools.addEventListener('click', onTool);
    ftools.addEventListener('change', function (e) {
      if (e.target.id !== 'f-pick') return;
      if (e.target.value === '__new') newFlow(); else pick(e.target.value);
    });
  }
  fdock.addEventListener('click', onTool);
  empty.addEventListener('click', function (e) { if (e.target.closest('[data-fa="newflow"]')) newFlow(); });
  function pick(id) { setCur(id); fsel = null; if (connect) setConnect(false); draw(); E.renderSide(); fit(); }

  /* ---------------- 오른쪽 패널 ---------------- */
  var FI = { flow: U.t3('erd', 'teal'), db: U.t3('db', 'teal') };
  function sec(title, body, count) { return '<div class="sec"><div class="sec-h"><h2>' + title + '</h2>' + (count != null ? '<span class="count">' + count + '</span>' : '') + '</div>' + body + '</div>'; }
  function delBtn(label) { return '<div class="ph-act"><button type="button" class="ib danger" data-fa="del" aria-label="' + label + '" title="' + label + ' (Delete)">' + U.IC.trash + '</button></div>'; }
  var UP = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>', DOWN = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  function lanesEditor(f) {
    var have = {}; f.lanes.forEach(function (l) { have[l.name] = 1; });
    return '<ul class="flanes">' + f.lanes.map(function (l, i) {
      return '<li><span class="no">' + (i + 1) + '</span><input class="in" data-ff="lname" data-id="' + esc(l.id) + '" value="' + esc(l.name) + '" aria-label="' + (i + 1) + '번 레인 이름" autocomplete="off" spellcheck="false">' +
        '<button type="button" class="ib" data-fa="lup" data-id="' + esc(l.id) + '" aria-label="위로"' + (i ? '' : ' disabled') + '>' + UP + '</button>' +
        '<button type="button" class="ib" data-fa="ldown" data-id="' + esc(l.id) + '" aria-label="아래로"' + (i < f.lanes.length - 1 ? '' : ' disabled') + '>' + DOWN + '</button>' +
        '<button type="button" class="ib danger" data-fa="ldel" data-id="' + esc(l.id) + '" aria-label="레인 지우기">' + U.IC.x + '</button></li>';
    }).join('') + '</ul>' +
      '<div class="fladd"><select class="in" id="fl-add" aria-label="추가할 레인">' + PRESET.filter(function (p) { return !have[p]; }).map(function (p) { return '<option>' + esc(p) + '</option>'; }).join('') + '<option value="__custom">직접 입력…</option></select>' +
      '<button class="btn" type="button" data-fa="ladd">레인 추가</button></div>';
  }
  function edgeList(f, n) {
    var out = f.edges.filter(function (e) { return e.from === n.id; }), inn = f.edges.filter(function (e) { return e.to === n.id; });
    function row(e, other, dir) {
      var o = N(f, other);
      return '<li><button type="button" data-fa="seledge" data-id="' + esc(e.id) + '"><span class="tag">' + dir + '</span><span class="t">' + esc(o ? oneLine(o.text) : '?') + '</span>' + (e.label ? '<span class="tag">' + esc(e.label) + '</span>' : '') + '</button></li>';
    }
    var h = out.map(function (e) { return row(e, e.to, '다음'); }).join('') + inn.map(function (e) { return row(e, e.from, '이전'); }).join('');
    return (h ? '<ul class="flist">' + h + '</ul>' : '<p class="fnote">아직 이어진 단계가 없어요.</p>') +
      '<div class="fbtns"><button class="btn" type="button" data-fa="connectfrom">여기서 연결 그리기</button></div>';
  }
  function readsEditor(n) {
    var tables = S().tables, rs = n.reads || [], on = {};
    rs.forEach(function (r) { on[r.table] = r; });
    var h = '<ul class="ftables">' + tables.map(function (t) {
      var r = on[t.id];
      return '<li><label class="tr"><input type="checkbox" data-ff="rtable" value="' + esc(t.id) + '"' + (r ? ' checked' : '') + '><span class="tn">' + esc(t.name) + '</span><span class="tk">' + esc(t.ko || '') + '</span>' +
        (r ? '<button type="button" class="go" data-fa="toerd" data-id="' + esc(t.id) + '">ERD에서 보기</button>' : '') + '</label>' +
        (r ? '<details' + ((r.cols || []).length ? ' open' : '') + '><summary>필드 고르기 (선택 사항' + ((r.cols || []).length ? ' · ' + r.cols.length + '개' : '') + ')</summary><div class="cols">' + t.cols.map(function (c) {
          return '<label><input type="checkbox" data-ff="rcol" data-t="' + esc(t.id) + '" value="' + esc(c.id) + '"' + ((r.cols || []).indexOf(c.id) >= 0 ? ' checked' : '') + '>' + esc(c.name) + '</label>';
        }).join('') + '</div></details>' : '') + '</li>';
    }).join('') + rs.filter(function (r) { return !TB(r.table); }).map(function (r) {
      return '<li class="gone"><label class="tr"><input type="checkbox" data-ff="rtable" value="' + esc(r.table) + '" checked><span class="tn">연결 끊김</span><span class="tk">ERD에서 지워진 테이블</span></label></li>';
    }).join('') + '</ul>';
    if (!tables.length) h += '<p class="fnote">ERD에 테이블이 없어요. ERD 화면에서 먼저 테이블을 만들어 주세요.</p>';
    return h;
  }

  function renderSideFlow() {
    var f = (S().flows || []).length ? cur() : null, h = '';
    if (!f) {
      return U.ph(FI.flow, '프로그램 흐름', '흐름이 없어요') +
        sec('시작하기', '<p class="fnote">시작 → 처리 → 판단 → 끝 순서로 플로우차트를 그리고, 각 단계가 어느 이벤트에서 일어나는지(레인)와 어떤 테이블을 조회하는지(ERD 연결)를 함께 표시해요.</p><div class="fbtns"><button class="btn primary" type="button" data-fa="newflow">+ 새 흐름 만들기</button></div>');
    }
    var sn = fsel && fsel.type === 'node' ? N(f, fsel.id) : null, se = fsel && fsel.type === 'edge' ? ED(f, fsel.id) : null, sl = fsel && fsel.type === 'lane' ? LN(f, fsel.id) : null;

    if (sn) {
      h += U.ph(reads(sn).length ? FI.db : '', esc(KINDS[sn.kind]), esc(laneLabel(f, sn) || '단계'), delBtn('단계 삭제'));
      h += sec('단계', '<div class="fkind" role="group" aria-label="도형">' + ORDER.map(function (k) {
        return '<button type="button" data-fa="kind" data-v="' + k + '" aria-pressed="' + (sn.kind === k) + '">' + SH[k] + KINDS[k] + '</button>';
      }).join('') + '</div>' +
        '<div class="field"><label for="fn-text">내용</label><textarea class="in" id="fn-text" data-ff="text" rows="3" placeholder="예: 과목 조회">' + esc(sn.text) + '</textarea></div>' +
        (f.lanesOn && f.lanes.length ? '<div class="field"><label for="fn-lane">레인 (이벤트)</label><select class="in mono" id="fn-lane" data-ff="lane">' + f.lanes.map(function (l, i) { return '<option value="' + esc(l.id) + '"' + (sn.lane === l.id ? ' selected' : '') + '>' + (i + 1) + '. ' + esc(l.name) + '</option>'; }).join('') + '</select></div>' : ''));
      if (sn.kind === 'process') {
        var dbOn = (sn.reads || []).length > 0 || !!dbOpen[sn.id], bad = (sn.reads || []).filter(function (r) { return !TB(r.table); }).length;
        h += '<div class="sec"><div class="sec-h"><h2>DB 조회</h2>' + ((sn.reads || []).length ? '<span class="count">' + sn.reads.length + '</span>' : '') + '</div>' +
          '<label class="switch" for="fn-db"><input type="checkbox" id="fn-db" data-ff="dbon"' + (dbOn ? ' checked' : '') + '><span class="tr"></span>이 단계에서 테이블을 조회해요</label>' +
          (dbOn ? readsEditor(sn) : '') +
          (bad ? '<p class="fwarn">연결 끊김 ' + bad + '개: ERD에서 지워진 테이블이에요. 흐름은 그대로 두었어요. 체크를 풀면 지워지고, ERD에서 되돌리기로 테이블을 살리면 다시 이어져요.</p>' : '') + '</div>';
      }
      h += sec('연결', edgeList(f, sn));
      return h;
    }

    if (se) {
      var a = N(f, se.from), b = N(f, se.to);
      h += U.ph('', '화살표', esc(a ? oneLine(a.text) : '?') + ' → ' + esc(b ? oneLine(b.text) : '?'), delBtn('화살표 삭제'));
      h += sec('라벨', '<div class="field"><label for="fe-label">선 가운데에 표시할 글</label><input class="in" id="fe-label" data-ff="elabel" value="' + esc(se.label || '') + '" placeholder="예: 예 / 아니오" autocomplete="off"></div>' +
        '<div class="fquick"><button type="button" data-fa="elabel" data-v="예">예</button><button type="button" data-fa="elabel" data-v="아니오">아니오</button><button type="button" data-fa="elabel" data-v="">지우기</button></div>' +
        '<div class="fbtns"><button class="btn" type="button" data-fa="flipedge">방향 바꾸기</button></div>');
      return h;
    }

    if (sl) {
      var no = laneNo(f, sl.id), cnt = f.nodes.filter(function (n) { return n.lane === sl.id; }).length;
      h += U.ph('', no + '. ' + esc(sl.name), '레인 · 단계 ' + cnt + '개', delBtn('레인 삭제'));
      h += sec('레인', '<div class="field"><label for="fl-one">이름</label><input class="in mono" id="fl-one" data-ff="lname" data-id="' + esc(sl.id) + '" value="' + esc(sl.name) + '" autocomplete="off" spellcheck="false"></div>' +
        '<div class="fbtns"><button class="btn" type="button" data-fa="lup" data-id="' + esc(sl.id) + '"' + (no > 1 ? '' : ' disabled') + '>위로</button><button class="btn" type="button" data-fa="ldown" data-id="' + esc(sl.id) + '"' + (no < f.lanes.length ? '' : ' disabled') + '>아래로</button></div>');
      return h;
    }

    var used = {}; f.nodes.forEach(function (n) { reads(n).forEach(function (r) { used[r.table] = 1; }); });
    h += U.ph(FI.flow, esc(f.name || '(이름 없음)'), '흐름 · 단계 ' + f.nodes.length + '개 · 조회 테이블 ' + Object.keys(used).length + '개');
    h += sec('흐름', '<div class="field"><label for="fl-name">이름</label><input class="in mono" id="fl-name" data-ff="flname" value="' + esc(f.name) + '" placeholder="예: ZRC05W0261" autocomplete="off" spellcheck="false"></div>' +
      '<div class="field"><label for="fl-desc">설명</label><textarea class="in" id="fl-desc" data-ff="fldesc" rows="2" placeholder="이 프로그램이 하는 일">' + esc(f.desc || '') + '</textarea></div>' +
      '<div class="fbtns"><button class="btn" type="button" data-fa="usage">사용표</button><button class="btn" type="button" data-fa="tidy">정렬</button><button class="btn danger" type="button" data-fa="delflow">흐름 삭제</button></div>');
    h += sec('이벤트 레인', '<label class="switch" for="fl-on"><input type="checkbox" id="fl-on" data-ff="lanes"' + (f.lanesOn ? ' checked' : '') + '><span class="tr"></span>레인 사용 (위 → 아래 = 실행 순서)</label>' +
      (f.lanesOn ? lanesEditor(f) : '<p class="fnote">끄면 자유 캔버스예요. 레인 설정과 단계 소속은 남아 있어서 다시 켜면 그대로 나와요.</p>'), f.lanesOn ? f.lanes.length : null);
    return h;
  }

  /* 패널 입력: 글자는 바로 반영(저장은 index의 0.5초 저장), 칸을 벗어나면 실행 취소 기록에 남겨요 */
  var side = $('#side');
  function idx(t, id) { for (var i = 0; i < t.cols.length; i++) if (t.cols[i].id === id) return i; return 1e9; }
  function moveLane(f, id, d) {
    var i = -1; f.lanes.forEach(function (l, k) { if (l.id === id) i = k; });
    var j = i + d; if (i < 0 || j < 0 || j >= f.lanes.length) return false;
    var t = f.lanes[i]; f.lanes[i] = f.lanes[j]; f.lanes[j] = t; return true;
  }
  /* 반환: true = 문서가 바뀜(저장), 'ui' = 화면만 다시, false = 해당 없음 */
  function fromInput(t, live) {
    var ff = t.getAttribute('data-ff'); if (!ff || E.mode() !== 'flow' || ro()) return false;
    var f = cur(); if (!f) return false;
    var n = fsel && fsel.type === 'node' ? N(f, fsel.id) : null, e = fsel && fsel.type === 'edge' ? ED(f, fsel.id) : null;
    var v = t.type === 'checkbox' ? t.checked : t.value;
    if (ff === 'flname') { f.name = v; return true; }
    if (ff === 'fldesc') { f.desc = v; return true; }
    if (ff === 'text' && n) { n.text = v; return true; }
    if (ff === 'elabel' && e) { e.label = v; return true; }
    if (ff === 'lname') { var l = LN(f, t.getAttribute('data-id')); if (l) { l.name = v; return true; } return false; }
    if (live) return false;
    if (ff === 'lanes') { setLanes(v); return 'done'; }
    if (ff === 'lane' && n) {
      var y = 0; f.nodes.forEach(function (o) { if (o !== n && o.lane === v) y = Math.max(y, o.y + nodeSize(o).h + 44); });
      n.lane = v; n.y = y; return true;
    }
    if (ff === 'dbon' && n) {
      if (v) { dbOpen[n.id] = true; return 'ui'; }
      dbOpen[n.id] = false;
      if (!n.reads.length) return 'ui';
      n.reads = []; return true;
    }
    if (ff === 'rtable' && n) {
      var tid = t.value;
      n.reads = (n.reads || []).filter(function (r) { return r.table !== tid; });
      if (v) n.reads.push({ table: tid, cols: [], op: 'R' });
      dbOpen[n.id] = true;
      return true;
    }
    if (ff === 'rcol' && n) {
      var r = (n.reads || []).filter(function (x) { return x.table === t.getAttribute('data-t'); })[0], tb = r && TB(r.table); if (!r) return false;
      var cid = t.value, cols = (r.cols || []).filter(function (x) { return x !== cid; });
      if (v) cols.push(cid);
      if (tb) cols.sort(function (a, b) { return idx(tb, a) - idx(tb, b); });
      r.cols = cols; return true;
    }
    return false;
  }
  side.addEventListener('input', function (e) { if (fromInput(e.target, true)) draw(); });
  side.addEventListener('change', function (e) {
    if (E.mode() !== 'flow' || !e.target.getAttribute('data-ff')) return;
    var r = fromInput(e.target, false);
    if (r === true) save(); else if (r === 'ui') E.renderSide();
  });
  side.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.getAttribute('data-ff')) e.target.blur(); });
  side.addEventListener('click', function (e) {
    if (E.mode() !== 'flow') return;
    var b = e.target.closest('[data-fa]'); if (!b) return;
    var a = b.getAttribute('data-fa'), f = (S().flows || []).length ? cur() : null;
    if (a === 'newflow') { newFlow(); return; }
    if (!f) return;
    if (a === 'toerd') {
      e.preventDefault();
      var n0 = fsel && fsel.type === 'node' ? N(f, fsel.id) : null, r0 = n0 && (n0.reads || []).filter(function (x) { return x.table === b.getAttribute('data-id'); })[0];
      E.focusTable(b.getAttribute('data-id'), r0 ? (r0.cols || []).slice() : []); return;
    }
    if (a === 'usage') { openUsage(); return; }
    if (a === 'seledge') { selectF({ type: 'edge', id: b.getAttribute('data-id') }); return; }
    if (a === 'connectfrom' && fsel) { setConnect(true, fsel.id); return; }
    if (ro()) return;
    if (a === 'tidy') { tidy(); return; }
    if (a === 'delflow') { delFlow(); return; }
    if (a === 'del') { delSel(); return; }
    if (a === 'ldel') { delLane(f, b.getAttribute('data-id')); return; }
    if (a === 'lup' || a === 'ldown') { if (moveLane(f, b.getAttribute('data-id'), a === 'lup' ? -1 : 1)) save(); return; }
    if (a === 'ladd') {
      var sel = document.getElementById('fl-add'), name = sel ? sel.value : '';
      if (name === '__custom') { name = (prompt('레인 이름', '') || '').trim(); if (!name) return; }
      if (!name) return;
      /* 미리 정한 이벤트는 실행 순서 자리에 끼워 넣고, 직접 입력은 맨 아래에 */
      var nl = { id: E.uid('l'), name: name }, at = PRESET.indexOf(name), pos = f.lanes.length;
      if (at >= 0) for (var i = 0; i < f.lanes.length; i++) { var o = PRESET.indexOf(f.lanes[i].name); if (o > at) { pos = i; break; } }
      f.lanes.splice(pos, 0, nl); save(); return;
    }
    var n = fsel && fsel.type === 'node' ? N(f, fsel.id) : null, ed = fsel && fsel.type === 'edge' ? ED(f, fsel.id) : null;
    if (a === 'kind' && n) { n.kind = b.getAttribute('data-v'); if (n.kind !== 'process') n.reads = []; save(); return; }
    if (ed && a === 'elabel') { ed.label = b.getAttribute('data-v'); save(); return; }
    if (ed && a === 'flipedge') { var x = ed.from; ed.from = ed.to; ed.to = x; save(); return; }
  });

  /* ---------------- 사용표: 레인(이벤트) > 단계 × 테이블 ---------------- */
  var CRUD = ['C', 'R', 'U', 'D'];
  var uveil = document.createElement('div');
  uveil.className = 'veil fu'; uveil.hidden = true;
  uveil.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="fu-title"><div class="head"><h3 id="fu-title">테이블 사용표</h3>' +
    '<button class="btn ghost sq" type="button" data-u="close" aria-label="닫기">✕</button></div><div class="fu-wrap" id="fu-body"></div>' +
    '<p class="fnote">R = 조회. 저장·변경·삭제(C·U·D)는 나중에 같은 표에 함께 나와요.</p></div>';
  document.body.appendChild(uveil);
  function renderUsage() {
    var f = cur(); if (!f) return;
    $('#fu-title').textContent = '테이블 사용표 · ' + (f.name || '');
    var steps = f.nodes.filter(function (n) { return n.kind === 'process'; }), cols = [], seen = {};
    steps.forEach(function (n) { reads(n).forEach(function (r) { if (!seen[r.table]) { seen[r.table] = 1; cols.push(r.table); } }); });
    S().tables.forEach(function (t) { if (!seen[t.id]) { seen[t.id] = 1; cols.push(t.id); } });
    function cell(n, id) {
      var acc = {}; reads(n).forEach(function (r) { if (r.table === id) (r.op || 'R').split('').forEach(function (c) { acc[c] = 1; }); });
      var s = CRUD.filter(function (c) { return acc[c]; }).join('');
      return '<td' + (s ? ' class="on"' : '') + '>' + s + '</td>';
    }
    function stepRow(n) { return '<tr class="step"><th title="' + esc(oneLine(n.text)) + '">' + esc(oneLine(n.text) || '(내용 없음)') + '</th>' + cols.map(function (id) { return cell(n, id); }).join('') + '</tr>'; }
    var h = '<table><thead><tr><th>' + (f.lanesOn ? '레인 › 단계' : '단계') + '</th>' + cols.map(function (id) {
      var t = TB(id); return '<th' + (t ? '' : ' class="gone"') + '>' + esc(t ? t.name : '(연결 끊김)') + (t && t.ko ? '<small>' + esc(t.ko) + '</small>' : '') + '</th>';
    }).join('') + '</tr></thead><tbody>';
    if (f.lanesOn && f.lanes.length) {
      f.lanes.forEach(function (l, i) {
        h += '<tr class="lane"><th>' + (i + 1) + '. ' + esc(l.name) + '</th>' + cols.map(function () { return '<td></td>'; }).join('') + '</tr>';
        steps.filter(function (n) { return n.lane === l.id; }).forEach(function (n) { h += stepRow(n); });
      });
    } else steps.forEach(function (n) { h += stepRow(n); });
    if (!steps.length) h += '<tr><td colspan="' + (cols.length + 1) + '">처리 단계가 없어요</td></tr>';
    $('#fu-body').innerHTML = h + '</tbody></table>';
  }
  function openUsage() { if (!(S().flows || []).length) return; renderUsage(); uveil.hidden = false; var c = uveil.querySelector('[data-u="close"]'); if (c) c.focus(); }
  uveil.addEventListener('click', function (e) { if (e.target === uveil || e.target.closest('[data-u="close"]')) uveil.hidden = true; });
  uveil.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') uveil.hidden = true; });

  /* ---------------- ERD 쪽: 이 테이블을 조회하는 단계 ---------------- */
  E.tableUsageHtml = function (tid) {
    if (!(S().flows || []).length) return '';
    var u = [];
    flows().forEach(function (f) { f.nodes.forEach(function (n) { reads(n).forEach(function (r) { if (r.table === tid) u.push({ f: f, n: n, r: r }); }); }); });
    return '<div class="sec"><div class="sec-h"><h2>이 테이블을 조회하는 단계</h2><span class="count">' + u.length + '</span></div>' +
      (u.length ? '<ul class="fuse">' + u.map(function (x) {
        var lane = laneLabel(x.f, x.n);
        return '<li><button type="button" data-flowjump="' + esc(x.f.id + '|' + x.n.id) + '"><span class="fu-acc">' + esc(x.r.op || 'R') + '</span><span class="fu-t">' + esc(oneLine(x.n.text) || '(내용 없음)') +
          '<small>' + esc(x.f.name + (lane ? ' › ' + lane : '')) + '</small></span></button></li>';
      }).join('') + '</ul>' : '<p class="fuse-empty">아직 이 테이블을 조회하는 단계가 없어요.</p>') + '</div>';
  };
  E.onFlowJump = function (key) {
    var p = String(key).split('|'), f = null;
    flows().forEach(function (x) { if (x.id === p[0]) f = x; });
    if (!f) return;
    setCur(f.id); fsel = { type: 'node', id: p[1] };
    E.setMode('flow');
    var n = N(f, p[1]); if (n) requestAnimationFrame(function () { centerOn(f, n); });
  };

  /* ---------------- index.html에 연결 ---------------- */
  E.renderFlowSide = renderSideFlow;
  E.flowHasSel = function () { return !!fsel; };
  E.onDraw = function () {
    var f = (S().flows || []).length ? cur() : null;
    if (fsel && f) {
      var ok = fsel.type === 'node' ? N(f, fsel.id) : fsel.type === 'edge' ? ED(f, fsel.id) : LN(f, fsel.id);
      if (!ok) fsel = null;
    } else if (!f) fsel = null;
    draw();
  };
  E.onModeChange = function (m) {
    if (m !== 'flow') { if (connect) setConnect(false); return; }
    var f = (S().flows || []).length ? cur() : null;
    if (f && !fitted[f.id]) { fitted[f.id] = 1; requestAnimationFrame(fit); }
    requestAnimationFrame(applyView);
  };
  E.flowKey = function (e, typing) {
    if (!uveil.hidden) return;
    if (e.key === 'Escape') { if (connect) setConnect(false); else if (fsel) selectF(null); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && fsel) { e.preventDefault(); delSel(); }
  };
  E.flowApi = {
    list: function () { return (S().flows || []).map(function (f) { return { id: f.id, name: f.name }; }); },
    current: function () { var f = (S().flows || []).length ? cur() : null; return f ? f.id : null; },
    lanesOn: function () { var f = (S().flows || []).length ? cur() : null; return !!(f && f.lanesOn); },
    pick: pick, newFlow: newFlow, setLanes: setLanes, tidy: tidy, usage: openUsage
  };
  window.addEventListener('resize', function () { if (E.mode() === 'flow') applyView(); });

  paintTools();
  if (E.mode() === 'flow') { E.refresh(); requestAnimationFrame(function () { var f = (S().flows || []).length ? cur() : null; if (f) { fitted[f.id] = 1; fit(); } }); }
})();
