/* =========================================================================
   운동 인증 챌린지 — 뷰 계층
   데이터는 전부 DB(js/data.js)를 통해서만 읽고 쓴다. (Local/Firebase 자동 전환)
   ========================================================================= */
(function () {
  'use strict';

  var today = DB.today, addDays = DB.addDays;
  var EXERCISE_TYPES = DB.EXERCISE_TYPES;
  var MEAL_SLOTS = DB.MEAL_SLOTS, slotLabel = DB.slotLabel;
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

  /* ---------- 파생 계산 (운동/식단 분리) ---------- */
  function isWorkout(v) { return (v.category || 'workout') === 'workout'; }
  function isMeal(v) { return v.category === 'meal'; }
  function workoutVerifs() { return state.verifications.filter(isWorkout); }
  function mealVerifs() { return state.verifications.filter(isMeal); }
  // 운동 기준 통계 (streak·캘린더·랭킹성 계산은 전부 운동 인증만 본다)
  function verifsByUser(uid) { return workoutVerifs().filter(function (v) { return v.userId === uid; }); }
  function didVerify(uid, date) { return workoutVerifs().some(function (v) { return v.userId === uid && v.date === date; }); }
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
    if (name === 'meals') { mealState.date = today(); mealState.uid = null; }  // 식단 탭은 항상 오늘·나부터
    if (name === 'home') { homeState.date = today(); homeState.uid = null; }   // 운동 탭도 항상 오늘·나부터
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
      installButton(),
      h('a', { href: 'admin.html', style: 'display:block;margin-top:18px;font-size:12px;color:var(--ink-mute);text-decoration:underline;' }, ['🛠 관리자 콘솔'])
    ]));
  }
  function showApp() {
    console.log('[wc] ⑥ showApp 호출 → 앱 화면 표시' + (state ? ' (데이터 있음)' : ' (데이터 대기중)'));
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

    // 바로 운동 인증으로 넘어가는 버튼
    var verifyCta = h('button', { class: 'home-cta', onclick: function () { draft = freshDraft(); draft.category = 'workout'; draft.date = homeState.date; navTo('verify'); } },
      [doneToday ? '💪 운동 한 번 더 인증하기' : '🔥 운동 인증하기']);

    // 운동 기록 — 식단처럼 날짜 이동 + 참여자 필터(기본은 전체)
    var hd = homeState.date, hIsToday = hd === today();
    var hUid = homeState.uid; // null = 전체
    if (hUid && s.participants.indexOf(hUid) < 0) hUid = homeState.uid = null;

    var dayNav = h('div', { class: 'day-nav' }, [
      h('button', { class: 'day-arrow', onclick: function () { homeState.date = addDays(hd, -1); render(); } }, ['‹']),
      h('div', { class: 'day-label' }, [hIsToday ? '오늘 · ' + dateLabel(hd) : dateLabel(hd)]),
      h('button', { class: 'day-arrow' + (hIsToday ? ' disabled' : ''), onclick: function () { if (!hIsToday) { homeState.date = addDays(hd, 1); render(); } } }, ['›'])
    ]);

    // 전체/참여자 필터 칩 — 탭하면 그 사람만, "전체"면 모두
    var allChip = h('div', { class: 'p-chip sel' + (hUid == null ? ' active' : ''), onclick: function () { homeState.uid = null; render(); } }, [
      h('div', { class: 'avatar allav', style: 'width:30px;height:30px;font-size:15px' }, ['👥']),
      h('div', { class: 'p-name' }, ['전체']),
      h('div', { class: 'kcal-sum' }, [allWorkoutsOn(hd).length + '회'])
    ]);
    var pChips = s.participants.map(function (uid) {
      var cnt = workoutsOn(uid, hd).length, b = burnOn(uid, hd);
      return h('div', { class: 'p-chip sel' + (uid === hUid ? ' active' : ''), onclick: function () { homeState.uid = uid; render(); } },
        [avatar(uid, 30), h('div', { class: 'p-name' }, [person(uid).name]), h('div', { class: 'kcal-sum' }, [cnt ? cnt + '회 · ' + b.toLocaleString() + 'kcal' : '기록 없음'])]);
    });
    var wTotals = h('div', { class: 'participants', style: 'margin-top:4px' }, [allChip].concat(pChips));

    var dayWk = hUid ? workoutsOn(hUid, hd) : allWorkoutsOn(hd);
    var wSummary = hUid
      ? h('div', { class: 'meal-daytotal' }, [(hUid === ME() ? '내' : person(hUid).name) + ' 소모 ', h('b', {}, [burnOn(hUid, hd).toLocaleString()]), ' kcal · ', h('b', {}, [String(dayWk.length)]), '회'])
      : h('div', { class: 'meal-daytotal' }, ['이 날 운동 ', h('b', {}, [String(dayWk.length)]), '회']);
    var wList = dayWk.length
      ? h('div', { class: 'feed' }, dayWk.map(feedCard))
      : h('div', { class: 'empty' }, [hIsToday ? '아직 운동 기록이 없어요. 위 버튼으로 인증해보세요! 📸' : '이 날은 운동 기록이 없어요']);

    return h('div', { class: 'screen' }, [
      header, reminder, challengeCard, verifyCta,
      h('div', { class: 'section-label' }, ['운동 기록']),
      dayNav, wTotals, wSummary, wList
    ]);
  };
  function hatch(uid) {
    var hue = uid === 'minji' ? 25 : uid === ME() ? 155 : 300;
    return 'repeating-linear-gradient(45deg, oklch(88% 0.05 ' + hue + '), oklch(88% 0.05 ' + hue + ') 10px, oklch(92% 0.04 ' + hue + ') 10px, oklch(92% 0.04 ' + hue + ') 20px)';
  }

  /* 피드 카드 (운동/식단 공용). 본인 인증엔 수정 버튼 노출 */
  function feedCard(v) {
    var meal = isMeal(v);
    var title = meal
      ? person(v.userId).name + ' · ' + slotLabel(v.slot)
      : person(v.userId).name + ' · ' + (v.type || '운동') + (v.duration != null ? ' ' + v.duration + '분' : '');
    var placeholder = meal ? '식단 인증샷' : '운동 인증샷';
    return h('div', { class: 'feed-card' }, [
      v.photo ? h('div', { class: 'feed-photo' }, [h('img', { src: v.photo, alt: '인증샷' })])
              : h('div', { class: 'feed-photo', style: 'background:' + hatch(v.userId) + ';color:' + personColor(v.userId) }, [placeholder]),
      h('div', { class: 'feed-body' }, [
        h('div', { class: 'fb-head' }, [h('div', { class: 'fb-who' }, [title]), h('div', { class: 'fb-time' }, [relTime(v.createdAt)])]),
        meal && v.kcal != null ? h('div', { class: 'kcal-badge' }, ['🍽 약 ' + v.kcal + ' kcal' + (v.foods && v.foods.length ? ' · ' + v.foods.map(function (f) { return f.name; }).join(', ') : '')]) : null,
        !meal && v.kcal != null ? h('div', { class: 'kcal-badge burn' }, ['🔥 약 ' + v.kcal.toLocaleString() + ' kcal 소모']) : null,
        v.message ? h('div', { class: 'fb-msg' }, [v.message]) : null,
        h('div', { class: 'fb-actions' }, [
          h('button', { class: 'cheer-btn' + (v.cheeredByMe ? ' cheered' : ''), onclick: function () { DB.toggleCheer(v.id); } }, ['👏 응원 ' + v.cheers]),
          v.userId === ME() ? h('button', { class: 'edit-btn', onclick: function () { editVerification(v); } }, ['✏️ 수정']) : null,
          v.userId === ME() ? h('button', { class: 'del-btn', onclick: function () { removeVerification(v); } }, ['🗑 삭제']) : null
        ])
      ])
    ]);
  }
  // 인증 삭제 (본인 것만 UI에 노출). onData 리스너가 자동 재렌더
  function removeVerification(v) {
    if (!confirm(isMeal(v) ? '이 식단 기록을 삭제할까요?' : '이 운동 인증을 삭제할까요?')) return;
    DB.deleteVerification(v.id).then(function () { toast('삭제됐어요'); })
      .catch(function (e) { console.error(e); toast('삭제 실패: ' + (e && e.message || '')); });
  }
  // 기존 인증을 수정: 값을 draft 로 불러와 인증 화면으로 이동 (같은 끼니/운동은 덮어쓰기됨)
  function editVerification(v) {
    draft = freshDraft();
    draft.id = v.id;                     // 이 id 가 있으면 새로 만들지 않고 해당 기록만 갱신
    draft.date = v.date || today();       // 원래 날짜 유지
    draft.category = isMeal(v) ? 'meal' : 'workout';
    draft.photo = v.photo || null;
    draft.message = v.message || '';
    if (draft.category === 'meal') { draft.slot = v.slot || 'lunch'; draft.kcal = v.kcal != null ? v.kcal : null; draft.foods = v.foods || null; }
    else { draft.type = v.type || null; draft.duration = v.duration || 30; }
    navTo('verify');
    toast('수정 후 다시 저장하면 갱신돼요');
  }

  /* =====================================================================
     화면 2 · 인증 업로드
     ===================================================================== */
  function freshDraft() { return { id: null, date: today(), category: 'workout', slot: 'lunch', photo: null, type: null, duration: 30, message: '', kcal: null, foods: null, analyzing: false }; }
  var draft = freshDraft();
  screens.verify = function () {
    var meal = draft.category === 'meal';
    var uploaderInner = draft.photo ? [h('img', { src: draft.photo, alt: '미리보기' })]
      : [h('div', { class: 'u-icon' }, [meal ? '🍽' : '📷']), h('div', { class: 'u-text' }, [meal ? '식단 사진 올리기' : '사진 찍어서 인증하기'])];
    // capture 속성을 빼면 모바일에서 '사진 찍기 / 앨범에서 선택' 을 모두 고를 수 있음
    var fileInput = h('input', { type: 'file', accept: 'image/*', style: 'display:none', id: 'photoInput' });
    // 사진이 바뀌면 이전 칼로리 분석 결과는 무효화
    fileInput.addEventListener('change', function (e) { var f = e.target.files[0]; if (f) downscaleImage(f, function (u) { draft.photo = u; draft.kcal = null; draft.foods = null; render(); }); });

    // 운동/식단 전환 토글
    var catToggle = h('div', { class: 'cat-toggle' }, [
      h('button', { class: 'cat-btn' + (!meal ? ' active' : ''), onclick: function () { if (draft.category !== 'workout') { draft.category = 'workout'; render(); } } }, ['🏋️ 운동']),
      h('button', { class: 'cat-btn' + (meal ? ' active' : ''), onclick: function () { if (draft.category !== 'meal') { draft.category = 'meal'; if (!draft.slot) draft.slot = 'lunch'; render(); } } }, ['🍽️ 식단'])
    ]);

    var msgArea = h('textarea', { class: 'msg-input', placeholder: meal ? '식단 메모 (선택)' : '오늘 운동 어땠나요?' }, []);
    msgArea.value = draft.message; msgArea.addEventListener('input', function () { draft.message = msgArea.value; });

    var body;
    if (meal) {
      var slotChips = MEAL_SLOTS.map(function (s) { return h('button', { class: 'chip' + (draft.slot === s.key ? ' active' : ''), onclick: function () { draft.slot = s.key; render(); } }, [s.label]); });
      body = [
        h('div', { class: 'form-group', style: 'margin-top:16px' }, [h('div', { class: 'field-label' }, ['끼니']), h('div', { class: 'chips' }, slotChips)]),
        h('div', { class: 'form-group', style: 'margin-top:16px' }, [h('div', { class: 'field-label' }, ['칼로리']), caloriePanel()])
      ];
    } else {
      var chips = EXERCISE_TYPES.map(function (t) { return h('button', { class: 'chip' + (draft.type === t ? ' active' : ''), onclick: function () { draft.type = draft.type === t ? null : t; render(); } }, [t]); });
      // 예상 소모 칼로리 (몸무게 × MET × 시간). 몸무게는 기기에 저장돼 유지됨.
      function burnText() { var b = draft.type ? DB.estimateBurn(draft.type, draft.duration, DB.getWeight()) : null; return b != null ? '약 ' + b.toLocaleString() + ' kcal' : '운동 종류를 선택하면 계산돼요'; }
      var estSpan = h('span', { class: 'burn-val' }, [burnText()]);
      var weightInput = h('input', { type: 'number', class: 'kcal-input', min: '20', max: '250', inputmode: 'numeric', value: String(DB.getWeight()) });
      weightInput.addEventListener('input', function () { DB.setWeight(+weightInput.value || 0); estSpan.textContent = burnText(); });
      body = [
        h('div', { class: 'form-group', style: 'margin-top:16px' }, [h('div', { class: 'field-label' }, ['운동 종류']), h('div', { class: 'chips' }, chips)]),
        h('div', { class: 'form-group', style: 'margin-top:16px' }, [h('div', { class: 'field-label' }, ['운동 시간']),
          h('div', { class: 'stepper' }, [
            h('button', { onclick: function () { draft.duration = Math.max(5, draft.duration - 5); render(); } }, ['–']),
            h('div', { class: 'step-val' }, [draft.duration + '분']),
            h('button', { onclick: function () { draft.duration = Math.min(300, draft.duration + 5); render(); } }, ['+'])
          ])]),
        h('div', { class: 'form-group', style: 'margin-top:16px' }, [h('div', { class: 'field-label' }, ['몸무게 (소모 칼로리 계산용)']),
          h('div', { class: 'kcal-input-row' }, [weightInput, h('span', { class: 'kie-unit' }, ['kg'])])]),
        h('div', { class: 'burn-box' }, [h('span', {}, ['🔥 예상 소모 칼로리 ']), estSpan])
      ];
    }

    // 인증 날짜 선택 — 전날 등 과거 날짜도 기록 가능(미래는 불가)
    var vIsToday = draft.date === today();
    var dateNav = h('div', { class: 'form-group', style: 'margin-top:14px' }, [
      h('div', { class: 'field-label' }, ['인증 날짜']),
      h('div', { class: 'day-nav' }, [
        h('button', { class: 'day-arrow', onclick: function () { draft.date = addDays(draft.date, -1); render(); } }, ['‹']),
        h('div', { class: 'day-label' }, [vIsToday ? '오늘 · ' + dateLabel(draft.date) : dateLabel(draft.date)]),
        h('button', { class: 'day-arrow' + (vIsToday ? ' disabled' : ''), onclick: function () { if (!vIsToday) { draft.date = addDays(draft.date, 1); render(); } } }, ['›'])
      ])
    ]);

    return h('div', { class: 'screen' }, [
      h('div', { class: 'topbar' }, [h('button', { class: 'back', onclick: function () { navTo(meal ? 'meals' : 'home'); } }, ['←']), h('div', { class: 'topbar-title' }, [meal ? '식단 기록하기' : '운동 인증하기'])]),
      catToggle,
      dateNav,
      h('label', { class: 'uploader', for: 'photoInput', style: 'margin-top:14px' }, uploaderInner), fileInput
    ].concat(body).concat([
      h('div', { class: 'form-group', style: 'margin-top:16px' }, [h('div', { class: 'field-label' }, ['한마디 남기기']), msgArea]),
      h('button', { class: 'btn-primary', style: 'margin-top:24px', onclick: submitVerification }, [meal ? '식단 기록하기 🍽️' : '인증 완료하기 🔥'])
    ]));
  };

  /* 식단 칼로리 패널 — AI 분석 + 직접 수정(총 칼로리 입력, 음식 제거) */
  function caloriePanel() {
    var configured = !!window.CALORIE_API_URL;
    var kids = [];
    if (draft.analyzing) {
      kids.push(h('div', { class: 'kcal-analyzing' }, ['🍽 분석 중… 잠시만요']));
    } else {
      kids.push(h('button', { class: 'analyze-btn' + (configured && draft.photo ? '' : ' disabled'), onclick: analyzeCalories },
        [draft.kcal != null ? '↻ 사진으로 다시 분석' : '🍽 사진으로 AI 칼로리 분석']));
    }
    var hasFoods = !!(draft.foods && draft.foods.length);
    // 음식 목록 — 이름/칼로리 모두 직접 수정, 항목 제거 가능
    if (hasFoods) {
      var sumSpan = h('b', {}, [foodSum().toLocaleString()]);
      kids.push(h('div', { class: 'kcal-foods' }, draft.foods.map(function (f, i) {
        var nameIn = h('input', { class: 'kf-name-in', placeholder: '음식 이름', value: f.name || '' });
        nameIn.addEventListener('input', function () { f.name = nameIn.value; });
        var calIn = h('input', { type: 'number', class: 'kf-cal-in', min: '0', inputmode: 'numeric', value: f.kcal != null ? String(f.kcal) : '' });
        // 칼로리 편집 시 총합을 즉시 갱신(재렌더 없이) — 커서 튐 방지
        calIn.addEventListener('input', function () { f.kcal = Math.max(0, Math.round(+calIn.value) || 0); draft.kcal = foodSum(); sumSpan.textContent = draft.kcal.toLocaleString(); });
        return h('div', { class: 'kcal-food' }, [
          nameIn,
          h('div', { class: 'kf-cal-wrap' }, [calIn, h('span', { class: 'kf-unit' }, ['kcal'])]),
          h('button', { class: 'kf-x', title: '제거', onclick: function () { removeFood(i); } }, ['✕'])
        ]);
      })));
      kids.push(h('button', { class: 'kf-add', onclick: function () { draft.foods.push({ name: '', kcal: 0 }); render(); } }, ['+ 음식 추가']));
      kids.push(h('div', { class: 'kcal-total-edit' }, [
        h('div', { class: 'kcal-sumline' }, ['총 칼로리 ', sumSpan, ' kcal']),
        h('div', { class: 'kcal-hint' }, ['AI 추정치는 오차가 있어요. 음식 이름·칼로리를 직접 고치거나 지울 수 있어요.'])
      ]));
    } else {
      // 음식 목록이 없을 때 — 총 칼로리 직접 입력 + 항목 추가
      var totalInput = h('input', { type: 'number', class: 'kcal-input', min: '0', inputmode: 'numeric', placeholder: '예: 650', value: draft.kcal != null ? String(draft.kcal) : '' });
      totalInput.addEventListener('input', function () { var val = totalInput.value.trim(); draft.kcal = val === '' ? null : Math.max(0, Math.round(+val) || 0); });
      kids.push(h('div', { class: 'kcal-total-edit' }, [
        h('div', { class: 'kcal-input-row' }, [h('span', { class: 'kie-label' }, ['총 칼로리']), totalInput, h('span', { class: 'kie-unit' }, ['kcal'])]),
        h('button', { class: 'kf-add', onclick: function () { draft.foods = [{ name: '', kcal: draft.kcal || 0 }]; render(); } }, ['+ 음식별로 나눠 입력']),
        h('div', { class: 'kcal-hint' }, [configured
          ? 'AI 추정치는 오차가 있어요. 숫자를 직접 고치거나 음식별로 나눠 입력할 수 있어요.'
          : '분석 서버 미설정 — 칼로리를 직접 입력하세요. (설정법은 README 참고)'])
      ]));
    }
    return h('div', {}, kids);
  }
  function foodSum() { return (draft.foods || []).reduce(function (a, f) { return a + (f.kcal || 0); }, 0); }
  function removeFood(i) {
    if (!draft.foods) return;
    draft.foods = draft.foods.filter(function (_, j) { return j !== i; });
    // 음식 목록이 남아 있으면 총합으로 동기화, 다 지우면 kcal 유지(직접입력 모드로 복귀)
    if (draft.foods.length) draft.kcal = foodSum();
    render();
  }
  function analyzeCalories() {
    if (draft.analyzing) return;
    if (!window.CALORIE_API_URL) { toast('분석 서버가 설정되지 않았어요'); return; }
    if (!draft.photo) { toast('먼저 식단 사진을 올려주세요'); return; }
    draft.analyzing = true; render();
    DB.estimateCalories(draft.photo).then(function (res) {
      draft.analyzing = false;
      draft.foods = res.foods;
      // 음식이 인식되면 총 칼로리는 항목 합계로 맞춤(표시와 저장값 일치)
      draft.kcal = res.foods && res.foods.length ? foodSum() : res.totalKcal;
      if (!res.foods.length && res.note) toast(res.note);
      render();
    }).catch(function (e) {
      draft.analyzing = false; render();
      console.error(e); toast('칼로리 분석 실패: ' + (e && e.message || ''));
    });
  }
  function submitVerification() {
    var payload, dest;
    var savedDate = draft.date || today();
    if (draft.category === 'meal') {
      if (!draft.slot) draft.slot = 'lunch';
      payload = { id: draft.id, date: savedDate, category: 'meal', slot: draft.slot, message: draft.message.trim(), photo: draft.photo, kcal: draft.kcal, foods: draft.foods };
      dest = 'meals';
    } else {
      if (!draft.type) { toast('운동 종류를 선택해주세요'); return; }
      var burned = DB.estimateBurn(draft.type, draft.duration, DB.getWeight());  // 소모 칼로리 계산·저장
      // id 가 있으면 그 운동 기록만 수정, 없으면 하루에 여러 건 누적(새 기록)
      payload = { id: draft.id, date: savedDate, category: 'workout', type: draft.type, duration: draft.duration, message: draft.message.trim(), photo: draft.photo, kcal: burned };
      dest = 'home';
    }
    toast('저장 중...');
    DB.saveVerification(payload).then(function () {
      draft = freshDraft();
      navTo(dest);
      // 방금 기록한 날짜의 하루 보기로 이동 (과거 날짜 기록도 바로 확인)
      if (dest === 'meals') mealState.date = savedDate; else homeState.date = savedDate;
      render();
      toast(dest === 'meals' ? '식단 기록 완료! 🍽️' : '인증 완료! 🎉');
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
     화면 4 · 식단 (하루 보기 · 날짜 이동)
     ===================================================================== */
  var mealState = { date: today(), uid: null };
  var homeState = { date: today(), uid: null };
  var WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  function dateLabel(d) { var dt = new Date(d + 'T00:00:00'); return (dt.getMonth() + 1) + '월 ' + dt.getDate() + '일 (' + WEEK[dt.getDay()] + ')'; }
  function mealsOn(uid, d) { return mealVerifs().filter(function (v) { return v.userId === uid && v.date === d; }); }
  function kcalOn(uid, d) { return mealsOn(uid, d).reduce(function (a, v) { return a + (v.kcal || 0); }, 0); }
  function burnOn(uid, d) { return workoutsOn(uid, d).reduce(function (a, v) { return a + (v.kcal || 0); }, 0); }
  function workoutsOn(uid, d) { return workoutVerifs().filter(function (v) { return v.userId === uid && v.date === d; }).sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }); }
  function allWorkoutsOn(d) { return workoutVerifs().filter(function (v) { return v.date === d; }).sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }); }
  function energyCell(label, val, cls) { return h('div', { class: 'energy-cell ' + cls }, [h('div', { class: 'ec-val' }, [val.toLocaleString()]), h('div', { class: 'ec-label' }, [label])]); }

  screens.meals = function () {
    var d = mealState.date, isToday = d === today();
    // 보고 있는 사람 (참여자 칩을 눌러 전환). 기본은 나.
    var viewUid = mealState.uid || ME();
    if (state.challenge.participants.indexOf(viewUid) < 0) viewUid = ME();
    var mine = viewUid === ME();

    // 날짜 네비 (미래로는 이동 불가)
    var nav = h('div', { class: 'day-nav' }, [
      h('button', { class: 'day-arrow', onclick: function () { mealState.date = addDays(d, -1); render(); } }, ['‹']),
      h('div', { class: 'day-label' }, [isToday ? '오늘 · ' + dateLabel(d) : dateLabel(d)]),
      h('button', { class: 'day-arrow' + (isToday ? ' disabled' : ''), onclick: function () { if (!isToday) { mealState.date = addDays(d, 1); render(); } } }, ['›'])
    ]);

    // 참여자별 그날 총 칼로리 — 탭하면 그 사람 하루 보기로 전환
    var totals = h('div', { class: 'participants', style: 'margin-top:4px' }, state.challenge.participants.map(function (uid) {
      return h('div', { class: 'p-chip sel' + (uid === viewUid ? ' active' : ''), onclick: function () { mealState.uid = uid; render(); } },
        [avatar(uid, 30), h('div', { class: 'p-name' }, [person(uid).name]), h('div', { class: 'kcal-sum' }, [kcalOn(uid, d).toLocaleString() + ' kcal'])]);
    }));

    // 선택한 사람의 끼니별 기록 (본인이면 과거 날짜도 수정/추가 가능)
    var canEdit = mine;
    var meals = mealsOn(viewUid, d);
    var dayTotal = kcalOn(viewUid, d);
    var slotRows = MEAL_SLOTS.map(function (s) {
      var entry = meals.find(function (v) { return (v.slot || 'lunch') === s.key; });
      if (entry) {
        return h('div', { class: 'meal-slot filled' }, [
          entry.photo ? h('img', { class: 'ms-photo', src: entry.photo, alt: '' }) : h('div', { class: 'ms-emoji' }, ['🍽']),
          h('div', { class: 'ms-body' }, [
            h('div', { class: 'ms-top' }, [h('span', { class: 'ms-slot' }, [s.label]), h('span', { class: 'ms-cal' }, [entry.kcal != null ? entry.kcal.toLocaleString() + ' kcal' : '-'])]),
            h('div', { class: 'ms-foods' }, [entry.foods && entry.foods.length ? entry.foods.map(function (f) { return f.name; }).join(', ') : (entry.message || '기록됨')])
          ]),
          canEdit ? h('div', { class: 'ms-tools' }, [
            h('button', { class: 'ms-edit', title: '수정', onclick: function () { editVerification(entry); } }, ['✏️']),
            h('button', { class: 'ms-del', title: '삭제', onclick: function () { removeVerification(entry); } }, ['🗑'])
          ]) : null
        ]);
      }
      return h('div', { class: 'meal-slot empty' }, [
        h('div', { class: 'ms-emoji faded' }, ['🍽']),
        h('div', { class: 'ms-body' }, [h('div', { class: 'ms-top' }, [h('span', { class: 'ms-slot' }, [s.label]), h('span', { class: 'ms-none' }, ['기록 없음'])])]),
        canEdit ? h('button', { class: 'ms-add', onclick: function () { draft = freshDraft(); draft.category = 'meal'; draft.slot = s.key; draft.date = d; navTo('verify'); } }, ['+ 기록']) : null
      ]);
    });

    // 에너지 요약(섭취·소모·기초대사량·순) — 기초대사량은 내 신체정보 기반이라 나에게만 표시
    var burn = burnOn(viewUid, d);
    var energyCard;
    if (mine) {
      // 기초대사량은 "그 날의 몸무게"로 계산 — 날짜가 바뀌면 그 날 기록된 몸무게가 적용됨
      var wUsed = DB.weightOn(d);
      var bmr = DB.estimateBMRon(d);
      var net = dayTotal - burn - bmr; // 순 = 섭취 − 운동소모 − 기초대사량
      // 값 갱신용 노드 참조(몸무게를 바꾸면 재렌더 없이 즉시 반영)
      var bmrVal = h('div', { class: 'ec-val' }, [bmr.toLocaleString()]);
      var bmrCell = h('div', { class: 'energy-cell bmr' }, [bmrVal, h('div', { class: 'ec-label' }, ['기초대사량'])]);
      var netB = h('b', {}, [(net > 0 ? '+' : '') + net.toLocaleString() + ' kcal']);
      var netTip = h('span', { class: 'en-tip' }, [net > 0 ? '섭취 초과' : '소모 우위']);
      var netRow = h('div', { class: 'energy-net ' + (net > 0 ? 'plus' : 'minus') }, [h('span', { class: 'en-label' }, ['순 칼로리']), netB, netTip]);
      function refreshEnergy() {
        var nb = DB.estimateBMRon(d), nn = dayTotal - burn - nb;
        bmrVal.textContent = nb.toLocaleString();
        netB.textContent = (nn > 0 ? '+' : '') + nn.toLocaleString() + ' kcal';
        netTip.textContent = nn > 0 ? '섭취 초과' : '소모 우위';
        netRow.className = 'energy-net ' + (nn > 0 ? 'plus' : 'minus');
      }
      var footer;
      if (canEdit) {
        // 몸무게를 "보고 있는 날짜"에 기록 — 다른 날짜 값은 그대로 보존됨
        var wIn = h('input', { type: 'number', class: 'w-day-in', inputmode: 'numeric', min: '20', max: '250', value: String(wUsed) });
        wIn.addEventListener('input', function () { var w = +wIn.value || 0; if (w > 0) DB.logWeight(d, w); refreshEnergy(); });
        footer = h('div', { class: 'energy-weight' }, [h('span', { class: 'ew-label' }, [isToday ? '오늘 몸무게' : '이 날 몸무게']), wIn, h('span', { class: 'ew-unit' }, ['kg']), h('span', { class: 'ew-note' }, ['(이 날 기준 저장)'])]);
      } else {
        footer = h('div', { class: 'energy-hint' }, ['이 날 몸무게 ' + wUsed.toLocaleString() + 'kg 기준 · 기초대사량은 신체정보로 대략 계산돼요.']);
      }
      energyCard = h('div', { class: 'energy-card' }, [
        h('div', { class: 'energy-row' }, [
          energyCell('섭취', dayTotal, 'in'),
          h('span', { class: 'energy-op' }, ['−']),
          energyCell('운동 소모', burn, 'burn'),
          h('span', { class: 'energy-op' }, ['−']),
          bmrCell
        ]),
        netRow,
        footer
      ]);
    } else {
      energyCard = h('div', { class: 'meal-daytotal' }, [person(viewUid).name + ' 섭취 ', h('b', {}, [dayTotal.toLocaleString()]), ' kcal · 운동 소모 ', h('b', {}, [burn.toLocaleString()]), ' kcal']);
    }

    return h('div', { class: 'screen' }, [
      h('div', { style: 'padding:8px 0 4px' }, [h('div', { class: 'h-title' }, ['식단 기록 🍽️'])]),
      nav,
      totals,
      energyCard,
      h('div', { style: 'display:flex;flex-direction:column;gap:8px;margin-top:8px' }, slotRows)
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
  // 신체 정보 카드 — 기기에 저장(다음에도 유지), 소모 칼로리·기초대사량 계산에 사용
  function bodyCard() {
    var b = DB.getBody();
    var bmrSpan = h('b', {}, [DB.estimateBMR(b).toLocaleString()]);
    function sync() { b = DB.getBody(); bmrSpan.textContent = DB.estimateBMR(b).toLocaleString(); }
    function numField(label, key, unit, min, max) {
      var inp = h('input', { type: 'number', class: 'body-in', inputmode: 'numeric', min: String(min), max: String(max), value: String(b[key]) });
      inp.addEventListener('input', function () { var patch = {}; patch[key] = +inp.value || 0; DB.setBody(patch); sync(); });
      return h('div', { class: 'body-field' }, [h('label', {}, [label]), h('div', { class: 'body-in-row' }, [inp, h('span', { class: 'body-unit' }, [unit])])]);
    }
    var sexSeg = h('div', { class: 'sex-seg' }, [
      h('button', { class: 'sex-btn' + (b.sex === 'male' ? ' active' : ''), onclick: function () { DB.setBody({ sex: 'male' }); render(); } }, ['남']),
      h('button', { class: 'sex-btn' + (b.sex === 'female' ? ' active' : ''), onclick: function () { DB.setBody({ sex: 'female' }); render(); } }, ['여'])
    ]);
    return h('div', { class: 'card body-card' }, [
      h('div', { class: 'chart-head' }, [h('div', { class: 'ch-title' }, ['내 신체 정보']), h('div', { class: 'ch-avg' }, ['기초대사량 약 ', bmrSpan, ' kcal'])]),
      h('div', { class: 'body-grid' }, [
        numField('몸무게', 'weight', 'kg', 20, 250),
        numField('키', 'height', 'cm', 100, 250),
        numField('나이', 'age', '세', 5, 120),
        h('div', { class: 'body-field' }, [h('label', {}, ['성별']), sexSeg])
      ]),
      h('div', { class: 'kcal-hint', style: 'margin-top:2px' }, ['몸무게는 오늘 날짜로 기록돼요(매일 바뀌어도 그 날 값이 그 날 기초대사량에 적용). 키·나이·성별은 계속 유지돼요.'])
    ]);
  }

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
      bodyCard(),
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin:4px 0 8px' }, [
        h('div', { class: 'section-label', style: 'margin:0' }, ['챌린지']),
        h('button', { class: 'chip', style: 'padding:6px 12px', onclick: function () { navTo('setup'); } }, ['⚙️ 설정'])
      ]),
      historyItems.length ? h('div', {}, historyItems) : h('div', { class: 'empty', style: 'padding:14px' }, ['지난 챌린지 기록이 여기에 쌓여요']),
      h('button', { class: 'admin-open', style: 'margin-top:14px', onclick: openAdmin }, [state.isAdmin ? '🛠 관리자 콘솔 열기' : '🛠 관리자 콘솔 (비밀번호)']),
      installButton(),
      state.mode === 'local' ? h('button', { class: 'reset-link', onclick: resetData }, ['데이터 초기화 (데모 다시 채우기)']) : null,
      h('button', { class: 'reset-link', onclick: function () { DB.logout().then(function () { location.reload(); }); } }, ['로그아웃'])
    ]);
  };

  /* =====================================================================
     관리자 콘솔 (전체 방 관리) — 관리자만 접근
     ===================================================================== */
  var adminState = { view: 'list', rooms: null, detail: null };
  // 내정보 → 관리자 콘솔 진입. 아직 관리자 인증 전이면 비밀번호로 인증 후 이동
  function openAdmin() {
    adminState = { view: 'list', rooms: null, detail: null };
    if (state.isAdmin) { navTo('admin'); return; }
    var pw = prompt('관리자 비밀번호를 입력하세요');
    if (pw == null || pw === '') return;
    DB.adminAuthenticate(pw).then(function () { toast('관리자 인증됨'); navTo('admin'); })
      .catch(function (e) { console.error(e); toast('관리자 인증 실패 — 비밀번호를 확인하세요'); });
  }
  screens.admin = function () {
    if (adminState.view === 'detail') return adminDetailScreen();
    if (!adminState.rooms) {
      DB.adminListRooms().then(function (rooms) { adminState.rooms = rooms; if (currentScreen === 'admin') render(); })
        .catch(function (e) { console.error(e); toast('방 목록 로드 실패: ' + (e && e.message || '')); });
    }
    var rows = (adminState.rooms || []).map(function (r) {
      return h('div', { class: 'admin-room', onclick: function () { adminState.view = 'detail'; adminState.detail = { code: r.code, data: null }; render(); loadDetail(r.code); } }, [
        h('div', { style: 'flex:1;min-width:0' }, [
          h('div', { class: 'ar-name' }, [r.name || '(이름 없음)']),
          h('div', { class: 'ar-code' }, ['코드: ' + r.code + ' · 참여 ' + r.participants + '명 · 시작 ' + (r.startDate || '-')])
        ]),
        h('div', { class: 'ar-arrow' }, ['›'])
      ]);
    });
    return h('div', { class: 'screen' }, [
      h('div', { class: 'topbar' }, [h('button', { class: 'back', onclick: function () { navTo('profile'); } }, ['←']), h('div', { class: 'topbar-title' }, ['🛠 관리자 콘솔'])]),
      h('div', { class: 'h-sub', style: 'padding:2px 0 12px' }, ['전체 방(챌린지) · ' + (adminState.rooms ? adminState.rooms.length + '개' : '불러오는 중…')]),
      adminState.rooms
        ? (rows.length ? h('div', { style: 'display:flex;flex-direction:column;gap:10px' }, rows) : h('div', { class: 'empty' }, ['방이 없습니다']))
        : h('div', { class: 'empty' }, ['불러오는 중…']),
      h('button', { class: 'chip', style: 'margin-top:16px;padding:8px 14px', onclick: function () { adminState.rooms = null; render(); } }, ['↻ 새로고침'])
    ]);
  };
  function loadDetail(code) {
    DB.adminRoomDetail(code).then(function (d) { if (adminState.detail && adminState.detail.code === code) { adminState.detail.data = d; if (currentScreen === 'admin') render(); } })
      .catch(function (e) { console.error(e); toast('상세 로드 실패: ' + (e && e.message || '')); });
    DB.adminListVerifs(code).then(function (list) { if (adminState.detail && adminState.detail.code === code) { adminState.detail.verifs = list; if (currentScreen === 'admin') render(); } })
      .catch(function (e) { console.error(e); toast('인증 기록 로드 실패: ' + (e && e.message || '')); });
  }
  // 관리자: 방 안의 개별 인증(운동/식단) 기록 목록 + 삭제
  function adminVerifSection(det) {
    var list = det.verifs;
    var filter = det.filter || 'all';
    var chips = [['all', '전체'], ['workout', '🏋️ 운동'], ['meal', '🍽 식단']].map(function (f) {
      return h('button', { class: 'chip' + (filter === f[0] ? ' active' : ''), style: 'padding:6px 12px', onclick: function () { det.filter = f[0]; render(); } }, [f[1]]);
    });
    var inner;
    if (!list) inner = h('div', { class: 'empty', style: 'padding:12px' }, ['기록 불러오는 중…']);
    else {
      var shown = list.filter(function (v) { return filter === 'all' || v.category === filter; });
      if (!shown.length) inner = h('div', { class: 'empty', style: 'padding:12px' }, ['해당 기록 없음']);
      else inner = h('div', { class: 'admin-verifs' }, shown.map(function (v) {
        var mealV = v.category === 'meal';
        var label = mealV ? ('🍽 ' + slotLabel(v.slot)) : ('🏋️ ' + (v.type || '운동'));
        return h('div', { class: 'admin-verif' }, [
          h('div', { class: 'av-body' }, [
            h('div', { class: 'av-top' }, [h('span', { class: 'av-name' }, [v.name]), h('span', { class: 'av-date' }, [v.date || '-'])]),
            h('div', { class: 'av-sub' }, [label + (v.kcal != null ? ' · ' + v.kcal.toLocaleString() + ' kcal' : '')])
          ]),
          h('button', { class: 'av-del', title: '삭제', onclick: function () {
            if (!confirm(v.name + '님의 ' + (v.date || '') + ' ' + label + ' 기록을 삭제할까요?')) return;
            DB.adminDeleteVerification(det.code, v.id).then(function () { loadDetail(det.code); toast('삭제됨'); })
              .catch(function (e) { console.error(e); toast('삭제 실패: ' + (e && e.message || '')); });
          } }, ['🗑'])
        ]);
      }));
    }
    return h('div', {}, [
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin:2px 0 8px' }, [
        h('div', { class: 'field-label', style: 'margin:0' }, ['인증 기록 (개별 삭제)']),
        h('div', { class: 'chips', style: 'gap:6px' }, chips)
      ]),
      inner
    ]);
  }
  function adminDetailScreen() {
    var det = adminState.detail, d = det.data, body;
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
        h('div', { style: 'margin-top:20px' }, [adminVerifSection(det)]),
        h('div', { style: 'margin-top:22px;display:flex;flex-direction:column;gap:10px' }, [
          h('button', { class: 'admin-danger', onclick: function () {
            if (confirm('이 방의 인증 기록을 전부 삭제할까요? (참여자·설정은 유지)')) DB.adminResetVerifs(det.code).then(function () { loadDetail(det.code); toast('인증 기록 초기화됨'); });
          } }, ['인증 기록 전체 삭제']),
          h('button', { class: 'admin-danger strong', onclick: function () {
            if (confirm('⚠️ 방("' + det.code + '")을 완전히 삭제합니다. 되돌릴 수 없어요. 진행할까요?')) DB.adminDeleteRoom(det.code).then(function () { adminState.view = 'list'; adminState.rooms = null; render(); toast('방 삭제됨'); });
          } }, ['방 완전 삭제'])
        ])
      ]);
    }
    return h('div', { class: 'screen' }, [
      h('div', { class: 'topbar' }, [h('button', { class: 'back', onclick: function () { adminState.view = 'list'; adminState.detail = null; render(); } }, ['←']), h('div', { class: 'topbar-title' }, ['방 관리'])]),
      body
    ]);
  }
  function statTile(num, cap, color) { return h('div', { class: 'stat-tile' }, [h('div', { class: 'stat-num', style: 'color:' + color }, [num]), h('div', { class: 'stat-cap' }, [cap])]); }
  function countMyPenalties() { var cur = state.challenge.startDate, cnt = 0; while (cur < today()) { if (!didVerify(ME(), cur)) cnt++; cur = addDays(cur, 1); } return cnt; }
  function resetData() { if (!confirm('모든 기록을 지우고 데모 데이터로 초기화할까요?')) return; DB.reset(); draft = freshDraft(); calMonth = new Date(); navTo('home'); toast('초기화 완료'); }

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
  var _gotFirst = false;
  DB.onData(function (snap) {
    if (!_gotFirst) { _gotFirst = true; console.log('[wc] ⑦ 첫 데이터 스냅샷 수신 → 화면 렌더'); }
    state = snap; render();
  });
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

  /* ---------- 서비스 워커: 옛 캐시가 낡은 코드를 서빙하는 문제를 막기 위해 해제 ----------
     (오프라인/설치 PWA가 다시 필요하면 아래 블록을 navigator.serviceWorker.register('sw.js') 로 되돌리세요) */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (rs) {
      rs.forEach(function (r) { r.unregister(); });
    }).catch(function () {});
  }
  if (window.caches && caches.keys) {
    caches.keys().then(function (ks) { ks.forEach(function (k) { caches.delete(k); }); }).catch(function () {});
  }
})();
