/* =========================================================================
   관리자 콘솔 (전용 페이지) — 비밀번호로 로그인해서 전체 방 관리
   보안: 비밀번호는 Firestore config/admin.code 와 규칙으로 서버측 검증
   ========================================================================= */
(function () {
  'use strict';

  var gate = document.getElementById('admin-gate');
  var appEl = document.getElementById('admin-app');
  var toastEl = document.getElementById('toast');
  var state = { view: 'list', rooms: null, detail: null };
  var toastTimer;

  /* ---- 미니 DOM 헬퍼 ---- */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'style') el.style.cssText = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c == null || c === false) return; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function toast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2400); }

  /* ---- 비밀번호 게이트 ---- */
  function showGate() {
    appEl.hidden = true; gate.hidden = false;
    var pw = h('input', { class: 'gate-input', type: 'password', placeholder: '관리자 비밀번호' });
    var btn = h('button', { class: 'btn-primary', onclick: function () {
      btn.disabled = true; btn.textContent = '확인 중...';
      DB.adminAuthenticate(pw.value.trim()).then(showConsole).catch(function (e) {
        console.error(e); toast('비밀번호가 올바르지 않습니다'); btn.disabled = false; btn.textContent = '관리자 로그인';
      });
    } }, ['관리자 로그인']);
    pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') btn.click(); });
    gate.innerHTML = '';
    gate.appendChild(h('div', { class: 'gate-inner' }, [
      h('div', { class: 'gate-logo' }, ['🛠']),
      h('div', { class: 'gate-title' }, ['관리자 콘솔']),
      h('div', { class: 'gate-sub' }, ['전체 방을 한 곳에서 관리합니다']),
      h('div', { class: 'gate-form' }, [
        pw, btn,
        h('div', { class: 'gate-hint' }, [DB.mode === 'firebase'
          ? 'Firestore의 config/admin 문서 code 값에 설정한 비밀번호를 입력하세요.'
          : '데모 모드: 비밀번호 없이 입장됩니다.']),
        h('a', { href: 'index.html', style: 'font-size:12px;color:var(--ink-mute);text-decoration:underline;display:block;margin-top:8px' }, ['← 앱으로 돌아가기'])
      ])
    ]));
  }
  function showConsole() { gate.hidden = true; appEl.hidden = false; state = { view: 'list', rooms: null, detail: null }; render(); }
  function render() { appEl.innerHTML = ''; appEl.appendChild(state.view === 'detail' ? detailScreen() : listScreen()); }

  /* ---- 방 목록 ---- */
  function listScreen() {
    if (!state.rooms) {
      DB.adminListRooms().then(function (r) { state.rooms = r; render(); })
        .catch(function (e) { console.error(e); toast('방 목록 로드 실패: ' + (e && e.message || '')); });
    }
    var rows = (state.rooms || []).map(function (r) {
      return h('div', { class: 'admin-room', onclick: function () { state.view = 'detail'; state.detail = { code: r.code, data: null }; render(); loadDetail(r.code); } }, [
        h('div', { style: 'flex:1;min-width:0' }, [
          h('div', { class: 'ar-name' }, [r.name || '(이름 없음)']),
          h('div', { class: 'ar-code' }, ['코드: ' + r.code + ' · 참여 ' + r.participants + '명 · 시작 ' + (r.startDate || '-')])
        ]),
        h('div', { class: 'ar-arrow' }, ['›'])
      ]);
    });
    return h('div', { class: 'screen' }, [
      h('div', { class: 'topbar' }, [
        h('div', { class: 'topbar-title' }, ['🛠 관리자 콘솔']),
        h('button', { class: 'chip', style: 'margin-left:auto;padding:6px 12px', onclick: showGate }, ['나가기'])
      ]),
      h('div', { class: 'h-sub', style: 'padding:2px 0 12px' }, ['전체 방(챌린지) · ' + (state.rooms ? state.rooms.length + '개' : '불러오는 중…')]),
      state.rooms
        ? (rows.length ? h('div', { style: 'display:flex;flex-direction:column;gap:10px' }, rows) : h('div', { class: 'empty' }, ['방이 없습니다']))
        : h('div', { class: 'empty' }, ['불러오는 중…']),
      h('button', { class: 'chip', style: 'margin-top:16px;padding:8px 14px', onclick: function () { state.rooms = null; render(); } }, ['↻ 새로고침'])
    ]);
  }

  /* ---- 방 상세 + 관리 액션 ---- */
  function loadDetail(code) {
    DB.adminRoomDetail(code).then(function (d) { if (state.detail && state.detail.code === code) { state.detail.data = d; render(); } })
      .catch(function (e) { console.error(e); toast('상세 로드 실패: ' + (e && e.message || '')); });
  }
  function detailScreen() {
    var det = state.detail, d = det.data, body;
    if (!d) body = h('div', { class: 'empty' }, ['불러오는 중…']);
    else {
      var partRows = d.participants.map(function (p) {
        return h('div', { class: 'friend-row' }, [
          h('div', { class: 'fr-name' }, [p.name + ' · ' + p.count + '회']),
          h('button', { class: 'fr-remove', title: '제외', onclick: function () {
            if (confirm('"' + p.name + '" 님을 이 방에서 제외할까요?')) DB.adminRemoveParticipant(det.code, p.uid).then(function () { loadDetail(det.code); toast('제외됨'); });
          } }, ['🗑'])
        ]);
      });
      body = h('div', {}, [
        h('div', { class: 'card', style: 'padding:16px;margin-bottom:14px' }, [
          h('div', { class: 'ar-name' }, [d.challenge.name || '(이름 없음)']),
          h('div', { class: 'ar-code', style: 'margin-top:4px' }, ['코드 ' + det.code + ' · 시작 ' + (d.challenge.startDate || '-')]),
          h('div', { class: 'ar-code' }, ['참여 ' + d.participants.length + '명 · 인증 ' + d.verifCount + '건 · 벌금 ' + (d.challenge.penalty || 0).toLocaleString() + '원'])
        ]),
        h('div', { class: 'field-label' }, ['참여자']),
        d.participants.length ? h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, partRows) : h('div', { class: 'empty', style: 'padding:12px' }, ['참여자 없음']),
        h('div', { style: 'margin-top:22px;display:flex;flex-direction:column;gap:10px' }, [
          h('button', { class: 'admin-danger', onclick: function () {
            if (confirm('이 방의 인증 기록을 전부 삭제할까요? (참여자·설정은 유지)')) DB.adminResetVerifs(det.code).then(function () { loadDetail(det.code); toast('인증 기록 초기화됨'); });
          } }, ['인증 기록 전체 삭제']),
          h('button', { class: 'admin-danger strong', onclick: function () {
            if (confirm('⚠️ 방("' + det.code + '")을 완전히 삭제합니다. 되돌릴 수 없어요. 진행할까요?')) DB.adminDeleteRoom(det.code).then(function () { state.view = 'list'; state.rooms = null; render(); toast('방 삭제됨'); });
          } }, ['방 완전 삭제'])
        ])
      ]);
    }
    return h('div', { class: 'screen' }, [
      h('div', { class: 'topbar' }, [h('button', { class: 'back', onclick: function () { state.view = 'list'; state.detail = null; render(); } }, ['←']), h('div', { class: 'topbar-title' }, ['방 관리'])]),
      body
    ]);
  }

  /* ---- 부트스트랩 ---- */
  DB.init().then(showGate).catch(function (e) {
    console.error(e);
    gate.hidden = false; appEl.hidden = true;
    gate.innerHTML = '';
    gate.appendChild(h('div', { class: 'gate-inner' }, [
      h('div', { class: 'gate-logo' }, ['⚠️']),
      h('div', { class: 'gate-title' }, ['초기화 실패']),
      h('div', { class: 'gate-sub' }, [String(e && e.message || e)])
    ]));
  });
})();
