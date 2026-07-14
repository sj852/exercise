/* =========================================================================
   운동 인증 챌린지 — 뷰 계층
   데이터는 전부 DB(js/data.js)를 통해서만 읽고 쓴다. (Local/Firebase 자동 전환)
   ========================================================================= */
(function () {
  'use strict';

  var today = DB.today, addDays = DB.addDays;
  var EXERCISE_TYPES = DB.EXERCISE_TYPES;
  var DEMO_FRIENDS = [{ id: 'minji', name: '민지' }, { id: 'taeho', name: '태호' }];

  var state = null;                 // 최신 스냅샷
  var currentScreen = 'home';
  var appEl = document.getElementById('app');
  var gateEl = document.getElementById('gate');
  var view = document.getElementById('view');
  var screens = {};
  var deferredInstall = null;       // PWA 설치 프롬프트

  function ME() { return state.me.id; }
  function person(uid) { return state.people[uid] || { name: '친구', avatar: '?', color: 'var(--ink-mute)' }; }
  function personColor(uid) { return person(uid).color; }

  /* ---------- 파생 계산 ---------- */
  function verifsByUser(uid) { return state.verifications.filter(function (v) { return v.userId === uid; }); }
  function didVerify(uid, date) { return state.verifications.some(function (v) { return v.userId === uid && v.date === date; }); }
  function streak(uid) {
    var cur = didVerify(uid, today()) ? today() : addDays(today(), -1);
    if (!didVerify(uid, cur)) return 0;
    var n = 0; while (didVerify(uid, cur)) { n++; cur = addDays(cur, -1); } return n;
  }
  function monthlyCount(uid) { var p = today().slice(0, 7); return verifsByUser(uid).filter(function (v) { return v.date.slice(0, 7) === p; }).length; }
  function totalCount(uid) { return verifsByUser(uid).length; }
  function dDay() {
    var end = addDays(state.challenge.startDate, state.challenge.durationDays);
    return Math.round((new Date(end + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);
  }
  function relTime(iso) {
    var diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return '방금 전';
    if (diff < 3600) return Math.floor(diff / 60) + '분 전';
    if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
    return Math.floor(diff / 86400) + '일 전';
  }

  /* ---------- 미니 DOM 헬퍼 ---------- */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k === 'style') el.style.cssText = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c == null || c === false) return; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function avatar(uid, size) {
    var p = person(uid);
    return h('div', { class: 'avatar', style: 'width:' + size + 'px;height:' + size + 'px;background:' + p.color + ';font-size:' + Math.round(size * 0.42) + 'px;' }, [p.avatar]);
  }
  var toastEl = document.getElementById('toast'), toastTimer;
  function toast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2200); }

  /* ---------- 네비게이션 / 렌더 ---------- */
  function navTo(name) {
    currentScreen = name; render();
    document.querySelectorAll('.nav-item').forEach(function (b) { b.classList.toggle('active', b.dataset.screen === name); });
    view.scrollTop = 0;
  }
  function render() {
    if (!state || appEl.hidden) return;
    view.innerHTML = ''; view.appendChild(screens[currentScreen]());
  }

  /* =====================================================================
     로그인 / 온보딩 게이트
     ===================================================================== */
  function showGate() {
    appEl.hidden = true; gateEl.hidden = false;
    var params = new URLSearchParams(location.search);
    var nameInput = h('input', { class: 'gate-input', placeholder: '닉네임 (예: 상준)', maxlength: '12' });
    var roomInput = h('input', { class: 'gate-input', placeholder: '방 코드 (친구와 같은 코드)', value: params.get('room') || '' });

    var startBtn = h('button', { class: 'btn-primary', onclick: function () {
      var name = nameInput.value.trim();
      if (!name) { toast('닉네임을 입력해주세요'); return; }
      startBtn.disabled = true; startBtn.textContent = '입장 중...';
      DB.login({ name: name, room: roomInput.value.trim() }).then(showApp).catch(function (e) {
        console.error(e); toast('로그인 실패: ' + (e && e.message || '')); startBtn.disabled = false; startBtn.textContent = '시작하기 🔥';
      });
    } }, ['시작하기 🔥']);

    gateEl.innerHTML = '';
    gateEl.appendChild(h('div', { class: 'gate-inner' }, [
      h('div', { class: 'gate-logo' }, ['🏋️‍♀️']),
      h('div', { class: 'gate-title' }, ['운동 인증 챌린지']),
      h('div', { class: 'gate-sub' }, ['친구들과 매일 운동 인증하고,', h('br'), '랭킹 겨루고, 벌금은 피하자!']),
      h('div', { class: 'gate-form' }, [
        nameInput,
        DB.mode === 'firebase' ? roomInput : null,
        startBtn,
        DB.mode === 'firebase'
          ? h('div', { class: 'gate-hint' }, ['같은 방 코드를 입력한 친구끼리 인증을 공유해요. 처음 쓰는 코드면 새 챌린지가 만들어져요.'])
          : h('div', { class: 'gate-hint' }, ['지금은 체험(데모) 모드예요. 친구와 실시간 공유하려면 README의 Firebase 연동을 켜세요.'])
      ]),
      installButton()
    ]));
  }
  function showApp() {
    gateEl.hidden = true; appEl.hidden = false;
    navTo('home');
  }

  /* =====================================================================
     화면 1 · 홈 피드
     ===================================================================== */
  screens.home = function () {
    var s = state.challenge, myStreak = streak(ME()), doneToday = didVerify(ME(), today());

    var header = h('div', { class: 'home-header' }, [
      h('div', { class: 'row' }, [
        h('div', { class: 'greeting' }, [doneToday ? '오늘도 완료! 💪' : '오늘도 가보자고! 🔥']),
        avatar(ME(), 38)
      ]),
      h('div', { class: 'streak-line' }, [myStreak > 0 ? myStreak + '일 연속 인증 중이에요, 대단해요!' : '오늘부터 다시 시작해봐요!'])
    ]);

    var reminder = doneToday
      ? h('div', { class: 'reminder done' }, [h('div', { style: 'font-size:20px' }, ['✅']), h('div', { class: 'r-text' }, ['오늘 인증 완료!', h('br'), h('span', {}, ['내일도 이어가봐요 🔥'])])])
      : h('div', { class: 'reminder', onclick: function () { navTo('verify'); } }, [h('div', { style: 'font-size:20px' }, ['⏰']), h('div', { class: 'r-text' }, ['오늘 아직 인증 안 했어요!', h('br'), h('span', {}, [(s.deadline || '23:00') + '까지 인증해야 벌금 면제 💸'])])]);

    var chips = s.participants.map(function (uid) {
      return h('div', { class: 'p-chip' }, [avatar(uid, 32), h('div', { class: 'p-name' }, [person(uid).name]), h('div', { class: 'p-status' }, [didVerify(uid, today()) ? '✅' : '⏳'])]);
    });
    var challengeCard = h('div', { class: 'card challenge-card' }, [
      h('div', { class: 'cc-head' }, [h('div', { class: 'cc-name' }, [s.name]), h('div', { class: 'badge-dday' }, ['D-' + Math.max(0, dDay())])]),
      h('div', { class: 'participants' }, chips)
    ]);

    var recent = state.verifications.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).slice(0, 15);
    var feedCards = recent.map(function (v) {
      return h('div', { class: 'feed-card' }, [
        v.photo ? h('div', { class: 'feed-photo' }, [h('img', { src: v.photo, alt: '인증샷' })])
                : h('div', { class: 'feed-photo', style: 'background:' + hatch(v.userId) + ';color:' + personColor(v.userId) }, ['운동 인증샷']),
        h('div', { class: 'feed-body' }, [
          h('div', { class: 'fb-head' }, [h('div', { class: 'fb-who' }, [person(v.userId).name + ' · ' + v.type + ' ' + v.duration + '분']), h('div', { class: 'fb-time' }, [relTime(v.createdAt)])]),
          v.message ? h('div', { class: 'fb-msg' }, [v.message]) : null,
          h('button', { class: 'cheer-btn' + (v.cheeredByMe ? ' cheered' : ''), onclick: function () { DB.toggleCheer(v.id); } }, ['👏 응원하기 ' + v.cheers])
        ])
      ]);
    });

    return h('div', { class: 'screen' }, [
      header, reminder, challengeCard,
      h('div', { class: 'section-label' }, ['친구들 인증 피드']),
      recent.length ? h('div', { class: 'feed' }, feedCards) : h('div', { class: 'empty' }, ['아직 인증이 없어요. 첫 인증을 남겨보세요! 📸'])
    ]);
  };
  function hatch(uid) {
    var hue = uid === 'minji' ? 25 : uid === ME() ? 155 : 300;
    return 'repeating-linear-gradient(45deg, oklch(88% 0.05 ' + hue + '), oklch(88% 0.05 ' + hue + ') 10px, oklch(92% 0.04 ' + hue + ') 10px, oklch(92% 0.04 ' + hue + ') 20px)';
  }

  /* =====================================================================
     화면 2 · 인증 업로드
     ===================================================================== */
  var draft = { photo: null, type: null, duration: 30, message: '' };
  screens.verify = function () {
    var uploaderInner = draft.photo ? [h('img', { src: draft.photo, alt: '미리보기' })] : [h('div', { class: 'u-icon' }, ['📷']), h('div', { class: 'u-text' }, ['사진 찍어서 인증하기'])];
    var fileInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none', id: 'photoInput' });
    fileInput.addEventListener('change', function (e) { var f = e.target.files[0]; if (f) downscaleImage(f, function (u) { draft.photo = u; render(); }); });

    var chips = EXERCISE_TYPES.map(function (t) { return h('button', { class: 'chip' + (draft.type === t ? ' active' : ''), onclick: function () { draft.type = draft.type === t ? null : t; render(); } }, [t]); });
    var msgArea = h('textarea', { class: 'msg-input', placeholder: '오늘 운동 어땠나요?' }, []);
    msgArea.value = draft.message; msgArea.addEventListener('input', function () { draft.message = msgArea.value; });

    return h('div', { class: 'screen' }, [
      h('div', { class: 'topbar' }, [h('button', { class: 'back', onclick: function () { navTo('home'); } }, ['←']), h('div', { class: 'topbar-title' }, ['오늘 운동 인증하기'])]),
      h('label', { class: 'uploader', for: 'photoInput', style: 'margin-top:10px' }, uploaderInner), fileInput,
      h('div', { class: 'form-group', style: 'margin-top:16px' }, [h('div', { class: 'field-label' }, ['운동 종류']), h('div', { class: 'chips' }, chips)]),
      h('div', { class: 'form-group', style: 'margin-top:16px' }, [h('div', { class: 'field-label' }, ['운동 시간']),
        h('div', { class: 'stepper' }, [
          h('button', { onclick: function () { draft.duration = Math.max(10, draft.duration - 10); render(); } }, ['–']),
          h('div', { class: 'step-val' }, [draft.duration + '분']),
          h('button', { onclick: function () { draft.duration = Math.min(300, draft.duration + 10); render(); } }, ['+'])
        ])]),
      h('div', { class: 'form-group', style: 'margin-top:16px' }, [h('div', { class: 'field-label' }, ['한마디 남기기']), msgArea]),
      h('button', { class: 'btn-primary', style: 'margin-top:24px', onclick: submitVerification }, ['인증 완료하기 🔥'])
    ]);
  };
  function submitVerification() {
    if (!draft.type) { toast('운동 종류를 선택해주세요'); return; }
    var payload = { type: draft.type, duration: draft.duration, message: draft.message.trim(), photo: draft.photo };
    toast('저장 중...');
    DB.saveVerification(payload).then(function () {
      draft = { photo: null, type: null, duration: 30, message: '' };
      navTo('home'); toast('인증 완료! 🎉');
    }).catch(function (e) { console.error(e); toast('저장 실패: ' + (e && e.message || '')); });
  }
  function downscaleImage(file, cb) {
    var img = new Image(), reader = new FileReader();
    reader.onload = function () {
      img.onload = function () {
        var max = 900, w = img.width, hh = img.height;
        if (w > max || hh > max) { var r = Math.min(max / w, max / hh); w = Math.round(w * r); hh = Math.round(hh * r); }
        var c = document.createElement('canvas'); c.width = w; c.height = hh; c.getContext('2d').drawImage(img, 0, 0, w, hh);
        try { cb(c.toDataURL('image/jpeg', 0.7)); } catch (e) { cb(reader.result); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* =====================================================================
     화면 3 · 캘린더
     ===================================================================== */
  var calMonth = new Date();
  screens.calendar = function () {
    var year = calMonth.getFullYear(), month = calMonth.getMonth();
    var startDow = new Date(year, month, 1).getDay(), daysInMonth = new Date(year, month + 1, 0).getDate();
    var cells = [];
    for (var i = 0; i < startDow; i++) cells.push(h('div', {}, []));
    for (var d = 1; d <= daysInMonth; d++) {
      var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var dots = state.challenge.participants.filter(function (uid) { return didVerify(uid, dateStr); }).map(function (uid) { return h('div', { class: 'cal-dot', style: 'background:' + personColor(uid) }); });
      var isToday = dateStr === today();
      cells.push(h('div', { class: 'cal-cell' + (isToday ? ' today' : ''), style: dots.length ? 'background:oklch(96% 0.02 75)' : '' }, [
        h('div', { class: 'cal-day', style: 'color:' + (isToday ? 'var(--primary-d)' : 'var(--ink-soft)') }, [String(d)]),
        h('div', { class: 'cal-dots' }, dots)
      ]));
    }
    var legend = state.challenge.participants.map(function (uid) { return h('div', { class: 'legend-item' }, [h('div', { class: 'legend-dot', style: 'background:' + personColor(uid) }), person(uid).name]); });
    return h('div', { class: 'screen' }, [
      h('div', { class: 'cal-head' }, [
        h('button', { onclick: function () { calMonth = new Date(year, month - 1, 1); render(); } }, ['‹']),
        h('div', { class: 'cal-title' }, [year + '년 ' + (month + 1) + '월']),
        h('button', { onclick: function () { calMonth = new Date(year, month + 1, 1); render(); } }, ['›'])
      ]),
      h('div', { class: 'card cal-card' }, [
        h('div', { class: 'cal-dow' }, ['일', '월', '화', '수', '목', '금', '토'].map(function (x) { return h('div', {}, [x]); })),
        h('div', { class: 'cal-grid' }, cells)
      ]),
      h('div', { class: 'legend' }, legend)
    ]);
  };

  /* =====================================================================
     화면 4 · 랭킹
     ===================================================================== */
  screens.ranking = function () {
    var ranked = state.challenge.participants.map(function (uid) { return { uid: uid, streak: streak(uid), total: totalCount(uid) }; })
      .sort(function (a, b) { return (b.streak - a.streak) || (b.total - a.total); });
    var medals = ['👑', '🥈', '🥉'];
    var cards = ranked.map(function (r, i) {
      return h('div', { class: 'rank-card' + (i === 0 ? ' first' : '') }, [
        h('div', { class: 'rank-medal' }, [medals[i] || '🏅']), avatar(r.uid, 46),
        h('div', { class: 'rank-info' }, [h('div', { class: 'rank-name' }, [person(r.uid).name]), h('div', { class: 'rank-stat' }, ['연속 ' + r.streak + '일 · 누적 ' + r.total + '회'])]),
        h('div', { class: 'rank-pos' }, [(i + 1) + '위'])
      ]);
    });
    var last = ranked[ranked.length - 1];
    return h('div', { class: 'screen' }, [
      h('div', { style: 'padding:8px 0 4px' }, [h('div', { class: 'h-title' }, ['이번 주 랭킹 🏆']), h('div', { class: 'h-sub' }, ['1등은 이번주 커피 안 사도 돼요'])]),
      h('div', { style: 'display:flex;flex-direction:column;gap:12px;margin-top:16px' }, cards.concat([
        last ? h('div', { class: 'penalty-note' }, [h('div', { style: 'font-size:16px' }, ['💸']), h('div', {}, ['이번 주 꼴찌는 벌금 ' + (state.challenge.penalty || 0).toLocaleString() + '원! ' + person(last.uid).name + ' 조심해요 😬'])]) : null
      ]))
    ]);
  };

  /* =====================================================================
     화면 5 · 챌린지 설정
     ===================================================================== */
  screens.setup = function () {
    var s = state.challenge;
    var nameInput = h('input', { class: 'text-input', value: s.name, placeholder: '챌린지 이름' }, []);
    var durations = [30, 60];
    var segButtons = durations.map(function (d) { return h('button', { class: s.durationDays === d ? 'active' : '', onclick: function () { DB.saveChallenge({ durationDays: d }); } }, [d + '일']); });
    segButtons.push(h('button', { class: durations.indexOf(s.durationDays) < 0 ? 'active' : '', onclick: function () { var v = prompt('챌린지 기간(일)', String(s.durationDays)); if (v && +v > 0) DB.saveChallenge({ durationDays: +v }); } }, ['직접입력']));

    // 참여 친구 영역 (모드별로 다름)
    var friendsSection;
    if (state.mode === 'firebase') {
      var invite = DB.inviteInfo();
      var participantRows = s.participants.map(function (uid) {
        return h('div', { class: 'friend-row' }, [avatar(uid, 34), h('div', { class: 'fr-name' }, [person(uid).name + (uid === ME() ? ' (나)' : '')]), h('div', { style: 'font-size:16px' }, ['✅'])]);
      });
      friendsSection = h('div', { style: 'display:flex;flex-direction:column;gap:10px' }, participantRows.concat([
        h('div', { class: 'invite-box' }, [
          h('div', { class: 'invite-code' }, ['방 코드: ' + invite.room]),
          h('button', { class: 'chip active', onclick: function () {
            var text = invite.url;
            if (navigator.share) { navigator.share({ title: '운동 인증 챌린지', text: '같이 운동 인증하자! 방 코드: ' + invite.room, url: text }); }
            else if (navigator.clipboard) { navigator.clipboard.writeText(text); toast('초대 링크 복사됨 📋'); }
            else { prompt('초대 링크', text); }
          } }, ['친구 초대 링크 공유 📤'])
        ])
      ]));
    } else {
      var rows = s.participants.filter(function (u) { return u !== ME(); }).map(function (uid) {
        return h('div', { class: 'friend-row' }, [avatar(uid, 34), h('div', { class: 'fr-name' }, [person(uid).name]),
          h('button', { class: 'fr-remove', title: '제외', onclick: function () { DB.saveChallenge({ participants: s.participants.filter(function (x) { return x !== uid; }) }); } }, ['✅'])]);
      });
      var invitable = DEMO_FRIENDS.filter(function (f) { return s.participants.indexOf(f.id) < 0; });
      rows.push(h('div', { class: 'friend-row add', onclick: function () {
        if (!invitable.length) { toast('초대할 친구가 더 없어요'); return; }
        DB.saveChallenge({ participants: s.participants.concat([invitable[0].id]) });
      } }, [h('div', { class: 'avatar' }, ['+']), h('div', { class: 'fr-name', style: 'color:var(--ink-mute)' }, ['친구 초대하기'])]));
      friendsSection = h('div', { style: 'display:flex;flex-direction:column;gap:10px' }, rows);
    }

    var penaltyInput = h('input', { type: 'number', value: s.penalty }, []);
    var rewardInput = h('input', { value: s.reward, placeholder: '보상 규칙' }, []);
    return h('div', { class: 'screen' }, [
      h('div', { class: 'topbar' }, [h('button', { class: 'back', onclick: function () { navTo('profile'); } }, ['←']), h('div', { class: 'topbar-title' }, ['챌린지 설정'])]),
      field('챌린지 이름', nameInput),
      field('기간', h('div', { class: 'seg' }, segButtons)),
      field('참여 친구', friendsSection),
      field('벌금 규칙', h('div', { class: 'rule-box penalty' }, [h('div', {}, ['미인증 1회당']), h('div', { style: 'display:flex;align-items:center;gap:4px' }, [penaltyInput, '원'])])),
      field('보상 규칙', h('div', { class: 'rule-box reward' }, [rewardInput])),
      h('button', { class: 'btn-primary', style: 'margin-top:24px', onclick: function () {
        DB.saveChallenge({ name: nameInput.value.trim() || s.name, penalty: Math.max(0, +penaltyInput.value || 0), reward: rewardInput.value.trim() || s.reward })
          .then(function () { toast('저장됐어요 🚀'); navTo('home'); });
      } }, ['저장하기 🚀'])
    ]);
  };
  function field(label, control) { return h('div', { class: 'form-group', style: 'margin-top:18px' }, [h('div', { class: 'field-label' }, [label]), control]); }

  /* =====================================================================
     화면 6 · 내 정보 · 통계
     ===================================================================== */
  screens.profile = function () {
    var weeks = [];
    for (var w = 3; w >= 0; w--) { var cnt = 0; for (var day = 0; day < 7; day++) { if (didVerify(ME(), addDays(today(), -(w * 7 + day)))) cnt++; } weeks.push(Math.round((cnt / 7) * 100)); }
    var avg = Math.round(weeks.reduce(function (a, b) { return a + b; }, 0) / weeks.length);
    var maxPct = Math.max.apply(null, weeks.concat([1]));
    var bars = weeks.map(function (pct) { return h('div', { class: 'bar' + (pct === maxPct ? ' best' : ''), style: 'height:' + Math.max(6, (pct / maxPct) * 100) + '%' }, [h('div', { class: 'bar-cap' }, [pct + '%'])]); });

    var historyItems = (state.history || []).map(function (hi) {
      return h('div', { class: 'history-item' }, [h('div', {}, [h('div', { class: 'hi-name' }, [hi.name]), h('div', { class: 'hi-sub' }, [hi.result])]), h('div', { style: 'font-size:18px' }, [hi.medal])]);
    });

    return h('div', { class: 'screen' }, [
      h('div', { class: 'profile-top' }, [avatar(ME(), 72), h('div', { class: 'p-title' }, [person(ME()).name + '님의 기록']), h('div', { class: 'p-mode' }, [state.mode === 'firebase' ? '실시간 공유 모드 · 방 ' + (DB.inviteInfo().room) : '체험(데모) 모드'])]),
      h('div', { class: 'stat-row' }, [
        statTile(streak(ME()) + '일', '연속 인증', 'var(--primary-d)'),
        statTile(monthlyCount(ME()) + '회', '이번달 누적', 'var(--green)'),
        statTile(countMyPenalties() + '회', '벌금 낸 횟수', 'var(--taeho)')
      ]),
      h('div', { class: 'card chart-card' }, [
        h('div', { class: 'chart-head' }, [h('div', { class: 'ch-title' }, ['최근 4주 인증률']), h('div', { class: 'ch-avg' }, ['평균 ' + avg + '%'])]),
        h('div', { class: 'bars' }, bars)
      ]),
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin:4px 0 8px' }, [
        h('div', { class: 'section-label', style: 'margin:0' }, ['챌린지']),
        h('button', { class: 'chip', style: 'padding:6px 12px', onclick: function () { navTo('setup'); } }, ['⚙️ 설정'])
      ]),
      historyItems.length ? h('div', {}, historyItems) : h('div', { class: 'empty', style: 'padding:14px' }, ['지난 챌린지 기록이 여기에 쌓여요']),
      installButton(),
      state.mode === 'local' ? h('button', { class: 'reset-link', onclick: resetData }, ['데이터 초기화 (데모 다시 채우기)']) : null,
      h('button', { class: 'reset-link', onclick: function () { DB.logout().then(function () { location.reload(); }); } }, ['로그아웃'])
    ]);
  };
  function statTile(num, cap, color) { return h('div', { class: 'stat-tile' }, [h('div', { class: 'stat-num', style: 'color:' + color }, [num]), h('div', { class: 'stat-cap' }, [cap])]); }
  function countMyPenalties() { var cur = state.challenge.startDate, cnt = 0; while (cur < today()) { if (!didVerify(ME(), cur)) cnt++; cur = addDays(cur, 1); } return cnt; }
  function resetData() { if (!confirm('모든 기록을 지우고 데모 데이터로 초기화할까요?')) return; DB.reset(); draft = { photo: null, type: null, duration: 30, message: '' }; calMonth = new Date(); navTo('home'); toast('초기화 완료'); }

  /* ---------- PWA 설치 버튼 ---------- */
  function installButton() {
    if (!deferredInstall) return null;
    return h('button', { class: 'install-btn', onclick: function () {
      deferredInstall.prompt();
      deferredInstall.userChoice.then(function () { deferredInstall = null; render(); });
    } }, ['📲 홈 화면에 앱 설치하기']);
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; render(); });

  /* ---------- 네비 바인딩 ---------- */
  document.querySelectorAll('.nav-item').forEach(function (btn) { btn.addEventListener('click', function () { navTo(btn.dataset.screen); }); });

  /* ---------- 부트스트랩 ---------- */
  DB.onData(function (snap) { state = snap; render(); });
  DB.init().then(function () {
    if (DB.needsLogin()) showGate(); else showApp();
  }).catch(function (e) {
    console.error(e);
    // Firebase 초기화 실패 시에도 앱이 죽지 않게 안내
    gateEl.hidden = false; appEl.hidden = true;
    gateEl.innerHTML = '';
    gateEl.appendChild(h('div', { class: 'gate-inner' }, [
      h('div', { class: 'gate-logo' }, ['⚠️']),
      h('div', { class: 'gate-title' }, ['초기화 실패']),
      h('div', { class: 'gate-sub' }, [String(e && e.message || e)]),
      h('div', { class: 'gate-hint' }, ['firebase-config.js 설정 또는 네트워크를 확인해주세요.'])
    ]));
  });

  /* ---------- 서비스 워커(PWA/오프라인) ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
