/* =========================================================================
   데이터 계층 (어댑터 패턴)
   - firebase-config.js 의 값을 채우면  → FirebaseStore (실시간·다기기 공유)
   - 비워두면                            → LocalStore (브라우저 데모)
   앱(app.js)은 아래 DB 인터페이스만 사용하고, 어느 모드인지 신경 쓰지 않는다.

   DB 공개 API
     DB.init()                         → Promise, 초기화(필요 시 Firebase SDK 로드)
     DB.mode                           → 'firebase' | 'local'
     DB.needsLogin()                   → 로그인 화면을 보여야 하는가
     DB.login({ name, room })          → Promise, 세션 시작/참여
     DB.logout()                       → Promise
     DB.onData(cb)                     → 데이터 스냅샷 구독. cb(snapshot)
     DB.saveChallenge(patch)           → 챌린지 설정 변경
     DB.saveVerification(payload)      → 오늘 인증 등록/수정 (payload.photo = dataURL|null)
     DB.toggleCheer(verifId)           → 응원 토글
     DB.reset()                        → (로컬 전용) 데모 데이터 재시드
     DB.inviteInfo()                   → { room, url } 초대 정보

   snapshot 형태 (두 모드 공통 정규화)
     { mode, me:{id,name,color}, challenge, people:{uid:{id,name,avatar,color}},
       verifications:[{id,userId,date,createdAt,type,duration,message,photo,cheers,cheeredByMe}],
       history }
   ========================================================================= */
(function () {
  'use strict';

  var PALETTE = [
    'oklch(80% 0.13 155)', // 초록
    'oklch(75% 0.16 25)',  // 빨강
    'oklch(78% 0.13 300)', // 보라
    'oklch(78% 0.13 230)', // 파랑
    'oklch(80% 0.14 60)',  // 주황
    'oklch(75% 0.13 330)'  // 핑크
  ];
  var EXERCISE_TYPES = ['웨이트', '러닝', '홈트', '요가', '수영', '자전거', '등산', '줄넘기'];
  // 식단 끼니 구분
  var MEAL_SLOTS = [
    { key: 'breakfast', label: '아침' },
    { key: 'lunch', label: '점심' },
    { key: 'dinner', label: '저녁' },
    { key: 'snack', label: '간식' }
  ];
  function slotLabel(key) { for (var i = 0; i < MEAL_SLOTS.length; i++) if (MEAL_SLOTS[i].key === key) return MEAL_SLOTS[i].label; return '식사'; }

  // 운동별 MET(활동대사량). 소모 kcal ≈ MET × 체중(kg) × 시간(h)
  var MET = { '웨이트': 5, '러닝': 9.5, '홈트': 5, '요가': 3, '수영': 7, '자전거': 7, '등산': 6.5, '줄넘기': 11 };
  function estimateBurn(type, minutes, weightKg) {
    var met = MET[type] || 4;
    var w = weightKg > 0 ? weightKg : 65;
    return Math.max(0, Math.round(met * w * ((minutes || 0) / 60)));
  }
  var WEIGHT_KEY = 'wchallenge:weight';
  function getWeight() { var w = +(typeof localStorage !== 'undefined' && localStorage.getItem(WEIGHT_KEY)); return w > 0 ? w : 65; }
  function setWeight(w) { try { localStorage.setItem(WEIGHT_KEY, String(Math.max(0, Math.round(w) || 0))); } catch (e) {} }

  /* ---------- 날짜 유틸 ---------- */
  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function today() { return ymd(new Date()); }
  function addDays(dateStr, n) { var d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
  function avatarOf(name) { return (name || '?').trim().charAt(0) || '?'; }

  /* ---------- 구독/알림 ---------- */
  var listeners = [];
  var snapshot = null;
  function onData(cb) { listeners.push(cb); if (snapshot) cb(snapshot); }
  function emit(snap) { snapshot = snap; listeners.forEach(function (f) { f(snap); }); }

  /* people 맵 만들기: 참여자 uid 배열 + 이름맵 → 색상 배정 */
  function buildPeople(participantIds, nameOf) {
    var people = {};
    participantIds.forEach(function (uid, i) {
      var nm = nameOf(uid);
      people[uid] = { id: uid, name: nm, avatar: avatarOf(nm), color: PALETTE[i % PALETTE.length] };
    });
    return people;
  }

  /* =====================================================================
     LocalStore — 브라우저 localStorage 데모 모드
     ===================================================================== */
  var STORE_KEY = 'wchallenge:v1';
  var SESS_KEY = 'wchallenge:session';

  var LocalStore = {
    mode: 'local',
    raw: null,
    session: null,

    init: function () {
      try { this.session = JSON.parse(localStorage.getItem(SESS_KEY)); } catch (e) {}
      try { this.raw = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) {}
      return Promise.resolve();
    },
    needsLogin: function () { return !this.session; },

    login: function (opts) {
      this.session = { name: (opts.name || '나').trim() };
      localStorage.setItem(SESS_KEY, JSON.stringify(this.session));
      if (!this.raw) { this.raw = this._seed(); this._save(); }
      else { this.raw.names.me = this.session.name; this._save(); }
      this._emit();
      return Promise.resolve();
    },
    logout: function () {
      localStorage.removeItem(SESS_KEY);
      this.session = null;
      return Promise.resolve();
    },

    saveChallenge: function (patch) {
      Object.assign(this.raw.challenge, patch);
      // 데모: 참여자 add/remove, 이름 변경도 patch 로 넘어옴
      if (patch.participants) this.raw.challenge.participants = patch.participants;
      this._save(); this._emit(); return Promise.resolve();
    },
    saveVerification: function (payload) {
      var cat = payload.category || 'workout';
      var slot = payload.slot || null;
      // 운동은 (나,오늘) 1건, 식단은 (나,오늘,끼니) 1건으로 중복 없이 갱신
      var existing = this.raw.verifications.find(function (v) {
        if (v.userId !== 'me' || v.date !== today()) return false;
        var vcat = v.category || (v.type === '식단' ? 'meal' : 'workout');
        if (vcat !== cat) return false;
        if (cat === 'meal') return (v.slot || null) === slot;
        return true;
      });
      if (existing) { Object.assign(existing, payload); existing.createdAt = new Date().toISOString(); }
      else {
        var maxId = this.raw.verifications.reduce(function (m, v) { return Math.max(m, v.id); }, 0);
        this.raw.verifications.push(Object.assign({ id: maxId + 1, userId: 'me', date: today(), createdAt: new Date().toISOString(), cheers: 0 }, payload));
      }
      this._save(); this._emit(); return Promise.resolve();
    },
    toggleCheer: function (id) {
      var v = this.raw.verifications.find(function (x) { return x.id === id; });
      if (!v) return Promise.resolve();
      if (this.raw.cheeredByMe[id]) { this.raw.cheeredByMe[id] = false; v.cheers = Math.max(0, v.cheers - 1); }
      else { this.raw.cheeredByMe[id] = true; v.cheers++; }
      this._save(); this._emit(); return Promise.resolve();
    },
    reset: function () { this.raw = this._seed(); this._save(); this._emit(); return Promise.resolve(); },
    inviteInfo: function () { return { room: null, url: null }; },

    _save: function () { localStorage.setItem(STORE_KEY, JSON.stringify(this.raw)); },
    _emit: function () {
      var raw = this.raw;
      var people = buildPeople(raw.challenge.participants, function (uid) { return raw.names[uid] || uid; });
      emit({
        mode: 'local',
        me: people['me'],
        challenge: raw.challenge,
        people: people,
        verifications: raw.verifications.map(function (v) {
          var cat = v.category || (v.type === '식단' ? 'meal' : 'workout');
          return Object.assign({}, v, { category: cat, slot: v.slot || null, cheeredByMe: !!raw.cheeredByMe[v.id] });
        }),
        history: raw.history,
        isAdmin: true   // 데모에선 본인이 방장이므로 관리자 UI 미리보기 허용
      });
    },

    /* ---------- 관리자 기능 (데모: 단일 방 대상) ---------- */
    adminAuthenticate: function () { return Promise.resolve(true); }, // 데모는 비번 없이 열람
    adminListRooms: function () {
      var raw = this.raw || (this.raw = this._seed());
      return Promise.resolve([{ code: '(데모방)', name: raw.challenge.name, participants: raw.challenge.participants.length, startDate: raw.challenge.startDate, penalty: raw.challenge.penalty }]);
    },
    adminRoomDetail: function () {
      var raw = this.raw;
      var participants = raw.challenge.participants.map(function (uid) {
        return { uid: uid, name: raw.names[uid] || uid, count: raw.verifications.filter(function (v) { return v.userId === uid; }).length };
      });
      return Promise.resolve({ code: '(데모방)', challenge: raw.challenge, participants: participants, verifCount: raw.verifications.length });
    },
    adminResetVerifs: function () { this.raw.verifications = []; this.raw.cheeredByMe = {}; this._save(); this._emit(); return Promise.resolve(); },
    adminDeleteRoom: function () { this.raw = this._seed(); this._save(); this._emit(); return Promise.resolve(); },
    adminRemoveParticipant: function (code, uid) {
      this.raw.challenge.participants = this.raw.challenge.participants.filter(function (x) { return x !== uid; });
      this._save(); this._emit(); return Promise.resolve();
    },

    _seed: function () {
      var verifications = [], id = 1;
      var pattern = { minji: 1.0, me: 0.85, taeho: 0.6 };
      var msgs = {
        minji: ['오늘도 하체 부셨습니다 🍗', '아침 러닝 완료!', '어깨 뿌셨다', '요가로 몸 풀기'],
        me: ['비 오는데 뛰었다 칭찬해줘', '오늘 컨디션 최고', '겨우 했다...', '홈트 30분'],
        taeho: ['퇴근하고 헬스장', '오랜만에 운동', '살려주세요', '등산 다녀옴']
      };
      var types = { minji: ['웨이트', '러닝', '요가'], me: ['러닝', '홈트', '웨이트'], taeho: ['웨이트', '등산', '홈트'] };
      function pseudo(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; }
      for (var back = 14; back >= 1; back--) {
        var date = addDays(today(), -back);
        Object.keys(pattern).forEach(function (pid) {
          if (pseudo(pid + date) < pattern[pid]) {
            verifications.push({
              id: id++, userId: pid, date: date, createdAt: new Date(date + 'T19:30:00').toISOString(),
              type: types[pid][Math.floor(pseudo('t' + pid + date) * types[pid].length)],
              duration: 30 + Math.floor(pseudo('d' + pid + date) * 6) * 10,
              message: msgs[pid][Math.floor(pseudo('m' + pid + date) * msgs[pid].length)],
              photo: null, cheers: Math.floor(pseudo('c' + pid + date) * 4)
            });
          }
        });
      }
      verifications.push({ id: id++, userId: 'minji', date: today(), createdAt: new Date(Date.now() - 6e5).toISOString(), category: 'workout', type: '웨이트', duration: 45, kcal: estimateBurn('웨이트', 45, 60), message: '오늘도 하체 부셨습니다 🍗', photo: null, cheers: 2 });
      verifications.push({ id: id++, userId: 'me', date: today(), createdAt: new Date(Date.now() - 3e5).toISOString(), category: 'meal', slot: 'lunch', message: '닭가슴살 도시락', photo: null, kcal: 620, foods: [{ name: '닭가슴살 도시락', kcal: 620 }], cheers: 0 });
      verifications.push({ id: id++, userId: 'minji', date: today(), createdAt: new Date(Date.now() - 2e5).toISOString(), category: 'meal', slot: 'breakfast', message: '아침 오트밀', photo: null, kcal: 350, foods: [{ name: '오트밀', kcal: 250 }, { name: '바나나', kcal: 100 }], cheers: 1 });
      return {
        names: { me: (this.session && this.session.name) || '나', minji: '민지', taeho: '태호' },
        challenge: {
          name: '운동 미루면 치킨값 내기', durationDays: 30, startDate: addDays(today(), -18),
          participants: ['me', 'minji', 'taeho'], penalty: 5000, reward: '주간 1등에게 나머지가 커피 쏘기 ☕', deadline: '23:00'
        },
        verifications: verifications, cheeredByMe: {},
        history: [
          { name: '6월 홈트 챌린지', result: '2등 · 12,000원 받음', medal: '🥈' },
          { name: '5월 러닝 챌린지', result: '1등 · 커피 받음 ☕', medal: '👑' }
        ]
      };
    }
  };

  /* =====================================================================
     FirebaseStore — Firestore + Auth(익명) + Storage 실시간 모드
     ===================================================================== */
  var FirebaseStore = {
    mode: 'firebase',
    fb: null, db: null, auth: null, storage: null, isAdmin: false,
    uid: null, pid: null, session: null, room: null,
    challengeData: null, verifs: [], unsub: [],

    init: function () {
      var self = this;
      try { self.session = JSON.parse(localStorage.getItem(SESS_KEY)); } catch (e) {}
      return loadFirebaseSdk().then(function () {
        self.fb = window.firebase;
        self.fb.initializeApp(window.FIREBASE_CONFIG);
        self.auth = self.fb.auth();
        self.db = self.fb.firestore();
        // 일부 네트워크/브라우저 확장이 실시간 스트리밍(WebChannel)을 막아 멈추는 것 방지
        // 스트리밍(WebChannel)이 막히는 환경에서도 실시간 리스너가 동작하도록 long-polling 강제
        // (merge:true 를 쓰면 내부 autoDetect 설정과 충돌하므로 force 만 단독 지정)
        try { self.db.settings({ experimentalForceLongPolling: true }); } catch (e) { console.warn('[wc] firestore settings 실패:', e && e.message); }
        return new Promise(function (resolve) {
          self.auth.onAuthStateChanged(function (user) {
            self.uid = user ? user.uid : null;
            // 이미 세션(방+이름)이 있으면 자동 재참여
            if (user && self.session && self.session.room) {
              self._join(self.session.name, self.session.room).then(resolve, resolve);
            } else { resolve(); }
          });
        });
      });
    },
    needsLogin: function () { return !(this.uid && this.session && this.session.room); },

    login: function (opts) {
      var self = this;
      var name = (opts.name || '나').trim();
      var room = (opts.room || 'my-crew').trim().toLowerCase().replace(/\s+/g, '-');
      console.log('[wc] ① 익명 인증 요청...');
      var flow = this.auth.signInAnonymously().then(function (cred) {
        self.uid = cred.user.uid;
        console.log('[wc] ② 인증 성공 uid=' + self.uid + ' → 방(' + room + ') 참여 시도');
        return self._join(name, room);
      }).then(function () {
        console.log('[wc] ⑤ 참여 완료 → 화면 전환');
      });
      return withTimeout(flow, 15000, 'Firebase 연결이 지연됩니다.\n① Authentication에서 "익명 로그인"이 켜져 있는지\n② Firestore 데이터베이스가 생성됐는지\n③ 광고차단/보안 확장을 잠시 꺼보세요.\n(콘솔의 [wc] 로그가 어디서 멈췄는지 알려주세요)');
    },
    logout: function () {
      var self = this;
      this._detach();
      localStorage.removeItem(SESS_KEY);
      this.session = null;
      return this.auth.signOut().catch(function () {});
    },

    _join: function (name, room) {
      var self = this;
      self.room = room;
      // 방 안에서의 신원 = 닉네임 기반 안정 키.
      // → 같은 방 + 같은 닉네임이면 기기/브라우저가 달라도 항상 같은 참여자로 로그인(기록 이어받음).
      self.pid = keyOf(name);
      self.session = { name: name, room: room };
      localStorage.setItem(SESS_KEY, JSON.stringify(self.session));
      var ref = self.db.collection('challenges').doc(room);
      // 트랜잭션은 스트리밍 연결이 막히면 멈추므로, 단순 읽기+쓰기로 참여 처리
      console.log('[wc] ③ 방 문서 읽는 중...');
      return ref.get().then(function (doc) {
        console.log('[wc] ④ 방 문서 읽기 완료 (존재=' + doc.exists + ')');
        if (!doc.exists) {
          // 방이 없으면 새 챌린지 생성 (첫 사람이 방장)
          var fresh = {
            name: '운동 인증 챌린지', durationDays: 30, startDate: today(),
            penalty: 5000, reward: '주간 1등에게 나머지가 커피 쏘기 ☕', deadline: '23:00',
            participants: makeParticipant({}, self.pid, name)
          };
          return ref.set(fresh).then(function () { return fresh; });
        }
        var data = doc.data();
        var p = data.participants || {};
        var mine = p[self.pid];
        // 같은 닉네임이 이미 있으면 → 그 참여자로 그대로 로그인(신규 추가 없음, 기존 기록 유지).
        // 없을 때만 신규 참여자 등록 (dot-path 로 다른 참여자 보존)
        if (!mine) {
          var joinedAt = Date.now();
          var patch = {}; patch['participants.' + self.pid] = { name: name, joinedAt: joinedAt };
          p[self.pid] = { name: name, joinedAt: joinedAt }; data.participants = p;  // 로컬에도 즉시 반영
          return ref.update(patch).then(function () { return data; });
        }
        return data; // 기존 동일 닉네임 참여자 → 이어서 로그인
      }).then(function (challengeData) {
        // 방금 읽은 데이터로 즉시 첫 화면 렌더(실시간 리스너를 기다리지 않음)
        self.challengeData = challengeData;
        self._attach();  // 이후 실시간 갱신
        // 관리자 여부 확인 (admins/{uid} 문서 존재 시 관리자)
        self.db.collection('admins').doc(self.uid).get()
          .then(function (d) { self.isAdmin = d.exists; self._emit(); })
          .catch(function () {});
        console.log('[wc] ④-b 초기 데이터 확보 → 인증목록 로드');
        return ref.collection('verifications').orderBy('createdAt', 'desc').limit(200).get()
          .then(function (snap) { self.verifs = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); })
          .catch(function (e) { console.warn('[wc] 초기 인증 로드 실패(무시):', e && e.message); })
          .then(function () { self._emit(); });
      });
    },

    _attach: function () {
      var self = this;
      this._detach();
      var ref = self.db.collection('challenges').doc(self.room);
      this.unsub.push(ref.onSnapshot(function (doc) { self.challengeData = doc.data(); self._emit(); }));
      this.unsub.push(ref.collection('verifications').orderBy('createdAt', 'desc').limit(200)
        .onSnapshot(function (snap) {
          self.verifs = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
          self._emit();
        }));
    },
    _detach: function () { this.unsub.forEach(function (u) { u(); }); this.unsub = []; },

    saveChallenge: function (patch) {
      // participants 는 클라이언트가 직접 수정하지 않음(각자 방코드로 참여)
      var clean = {};
      ['name', 'durationDays', 'startDate', 'penalty', 'reward', 'deadline'].forEach(function (k) {
        if (patch[k] !== undefined) clean[k] = patch[k];
      });
      return this.db.collection('challenges').doc(this.room).update(clean);
    },
    saveVerification: function (payload) {
      var self = this;
      var col = self.db.collection('challenges').doc(self.room).collection('verifications');
      var name = self.session.name;
      var cat = payload.category || 'workout';
      var slot = cat === 'meal' ? (payload.slot || 'lunch') : null;
      // 사진은 Firestore 문서에 압축 dataURL 로 인라인 저장 (별도 Storage 설정 불필요)
      var photo = payload.photo || null;
      if (photo && photo.length > 950000) { photo = null; console.warn('[wc] 사진 용량이 커서 제외됨(문서 1MB 한도)'); }
      // 운동은 (나,오늘) 1건, 식단은 (나,오늘,끼니) 1건으로 중복 없이 갱신.
      // (uid,date)로만 조회하고 category/slot은 클라이언트에서 매칭 → 별도 색인 불필요
      return col.where('uid', '==', self.pid).where('date', '==', today()).get().then(function (qs) {
        var match = null;
        qs.docs.forEach(function (d) {
          var dd = d.data(), dcat = dd.category || (dd.type === '식단' ? 'meal' : 'workout');
          if (dcat !== cat) return;
          if (cat === 'meal') { if ((dd.slot || null) === slot) match = d; }
          else match = d;
        });
        var data = {
          uid: self.pid, name: name, date: today(), createdAt: self.fb.firestore.FieldValue.serverTimestamp(),
          createdAtMs: Date.now(), category: cat, slot: slot,
          type: payload.type != null ? payload.type : null, duration: payload.duration != null ? payload.duration : null,
          message: payload.message || '', photoUrl: photo,
          kcal: payload.kcal != null ? payload.kcal : null,           // 식단 총 칼로리
          foods: Array.isArray(payload.foods) ? payload.foods : null   // [{name,kcal}]
        };
        if (match) {
          var prev = match.data();
          if (!photo && prev.photoUrl) data.photoUrl = prev.photoUrl; // 사진 안 바꾸면 기존 유지
          data.cheers = prev.cheers || {};
          return match.ref.set(data);
        }
        data.cheers = {};
        return col.add(data);
      });
    },
    toggleCheer: function (id) {
      var self = this;
      var ref = self.db.collection('challenges').doc(self.room).collection('verifications').doc(id);
      var v = self.verifs.find(function (x) { return x.id === id; });
      var mine = v && v.cheers && v.cheers[self.pid];
      var patch = {};
      patch['cheers.' + self.pid] = mine ? self.fb.firestore.FieldValue.delete() : true;
      return ref.update(patch);
    },
    reset: function () { return Promise.resolve(); }, // 실서비스에선 초기화 없음
    inviteInfo: function () {
      var base = location.origin + location.pathname;
      return { room: this.room, url: base + '?room=' + encodeURIComponent(this.room) };
    },

    _emit: function () {
      if (!this.challengeData) return;
      var self = this;
      var pmap = this.challengeData.participants || {};
      // joinedAt 순으로 정렬해 색상 안정적으로 배정
      var ids = Object.keys(pmap).sort(function (a, b) { return (pmap[a].joinedAt || 0) - (pmap[b].joinedAt || 0); });
      // 나를 항상 첫 번째(초록)로
      ids = [self.pid].concat(ids.filter(function (x) { return x !== self.pid; }));
      var people = buildPeople(ids, function (uid) { return (pmap[uid] && pmap[uid].name) || '친구'; });
      var challenge = Object.assign({}, this.challengeData, { participants: ids });
      var verifs = this.verifs.map(function (v) {
        var cheers = v.cheers || {};
        var cat = v.category || (v.type === '식단' ? 'meal' : 'workout');
        return {
          id: v.id, userId: v.uid, date: v.date,
          createdAt: v.createdAtMs ? new Date(v.createdAtMs).toISOString() : new Date().toISOString(),
          category: cat, slot: v.slot || null,
          type: v.type, duration: v.duration, message: v.message, photo: v.photoUrl || null,
          kcal: v.kcal != null ? v.kcal : null, foods: v.foods || null,
          cheers: Object.keys(cheers).length, cheeredByMe: !!cheers[self.pid]
        };
      });
      emit({
        mode: 'firebase', me: people[self.pid], challenge: challenge, people: people,
        verifications: verifs, history: [], isAdmin: !!self.isAdmin
      });
    },

    /* ---------- 관리자 기능 (전체 방 관리) ---------- */
    // 비밀번호로 관리자 인증 → config/admin.code 와 일치하면 스스로 admins 등록
    adminAuthenticate: function (password) {
      var self = this;
      var pre = self.uid ? Promise.resolve() : self.auth.signInAnonymously().then(function (c) { self.uid = c.user.uid; });
      return pre.then(function () {
        return self.db.collection('admins').doc(self.uid).set({ code: password, since: Date.now() });
      }).then(function () { self.isAdmin = true; return true; });
    },
    adminListRooms: function () {
      return this.db.collection('challenges').get().then(function (snap) {
        return snap.docs.map(function (d) {
          var data = d.data(), p = data.participants || {};
          return { code: d.id, name: data.name, participants: Object.keys(p).length, startDate: data.startDate, penalty: data.penalty };
        }).sort(function (a, b) { return (b.startDate || '').localeCompare(a.startDate || ''); });
      });
    },
    adminRoomDetail: function (code) {
      var ref = this.db.collection('challenges').doc(code);
      return ref.get().then(function (doc) {
        var data = doc.data() || {}, p = data.participants || {};
        return ref.collection('verifications').get().then(function (vs) {
          var counts = {};
          vs.docs.forEach(function (v) { var u = v.data().uid; counts[u] = (counts[u] || 0) + 1; });
          var participants = Object.keys(p).map(function (uid) { return { uid: uid, name: (p[uid] && p[uid].name) || uid, count: counts[uid] || 0 }; });
          return { code: code, challenge: data, participants: participants, verifCount: vs.size };
        });
      });
    },
    adminResetVerifs: function (code) {
      var self = this, ref = this.db.collection('challenges').doc(code);
      return ref.collection('verifications').get().then(function (vs) {
        var batch = self.db.batch();
        vs.docs.forEach(function (v) { batch.delete(v.ref); });
        return batch.commit();
      });
    },
    adminDeleteRoom: function (code) {
      var self = this, ref = this.db.collection('challenges').doc(code);
      return self.adminResetVerifs(code).then(function () { return ref.delete(); });
    },
    adminRemoveParticipant: function (code, uid) {
      var patch = {}; patch['participants.' + uid] = this.fb.firestore.FieldValue.delete();
      return this.db.collection('challenges').doc(code).update(patch);
    }
  };

  function makeParticipant(p, uid, name) {
    var next = Object.assign({}, p);
    next[uid] = { name: name, joinedAt: Date.now() };
    return next;
  }

  /* 닉네임 → 방 안에서의 안정적 신원 키.
     - 대소문자/앞뒤 공백 무시 → 같은 닉네임은 항상 같은 키(같은 참여자)로 로그인.
     - 결과는 영숫자라 Firestore 맵 키/dot-path 업데이트에 안전. */
  function keyOf(name) {
    var n = (name || '').trim().toLowerCase();
    var h = 2166136261;
    for (var i = 0; i < n.length; i++) { h ^= n.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'p' + (h >>> 0).toString(36);
  }

  /* 프라미스 타임아웃 (무한 대기 방지) */
  function withTimeout(p, ms, msg) {
    return Promise.race([p, new Promise(function (_, reject) { setTimeout(function () { reject(new Error(msg)); }, ms); })]);
  }

  /* Firebase compat SDK 동적 로드 (설정이 있을 때만) */
  function loadFirebaseSdk() {
    if (window.firebase && window.firebase.firestore) return Promise.resolve();
    var V = '10.12.2';
    var base = 'https://www.gstatic.com/firebasejs/' + V + '/';
    var files = ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js'];
    return files.reduce(function (chain, f) {
      return chain.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = base + f; s.onload = resolve; s.onerror = function () { reject(new Error('Firebase SDK 로드 실패: ' + f)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve());
  }

  /* ---------- 모드 판별 & 공개 DB 객체 ---------- */
  function firebaseConfigured() {
    var c = window.FIREBASE_CONFIG;
    return !!(c && c.apiKey && c.projectId && c.apiKey.indexOf('여기에') < 0);
  }
  var impl = firebaseConfigured() ? FirebaseStore : LocalStore;

  window.DB = {
    mode: impl.mode,
    EXERCISE_TYPES: EXERCISE_TYPES,
    MEAL_SLOTS: MEAL_SLOTS,
    slotLabel: slotLabel,
    estimateBurn: estimateBurn, getWeight: getWeight, setWeight: setWeight,
    ymd: ymd, today: today, addDays: addDays,
    init: function () { return impl.init(); },
    needsLogin: function () { return impl.needsLogin(); },
    login: function (o) { return impl.login(o); },
    logout: function () { return impl.logout(); },
    onData: onData,
    saveChallenge: function (p) { return impl.saveChallenge(p); },
    saveVerification: function (p) { return impl.saveVerification(p); },
    toggleCheer: function (id) { return impl.toggleCheer(id); },
    reset: function () { return impl.reset(); },
    inviteInfo: function () { return impl.inviteInfo(); },
    adminAuthenticate: function (pw) { return impl.adminAuthenticate(pw); },
    adminListRooms: function () { return impl.adminListRooms(); },
    adminRoomDetail: function (code) { return impl.adminRoomDetail(code); },
    adminResetVerifs: function (code) { return impl.adminResetVerifs(code); },
    adminDeleteRoom: function (code) { return impl.adminDeleteRoom(code); },
    adminRemoveParticipant: function (code, uid) { return impl.adminRemoveParticipant(code, uid); },
    estimateCalories: estimateCalories,
    _impl: impl
  };

  /* =====================================================================
     식단 사진 → 칼로리 추정 (Cloudflare Worker 중계 → Gemini Vision)
     - window.CALORIE_API_URL 로 POST { image: dataURL }
     - 응답 { foods:[{name,kcal}], totalKcal, note }
     모드(Local/Firebase)와 무관하게 동작 (순수 네트워크 호출)
     ===================================================================== */
  function estimateCalories(dataUrl) {
    var url = window.CALORIE_API_URL;
    if (!url) return Promise.reject(new Error('칼로리 분석 서버가 설정되지 않았습니다. firebase-config.js 의 CALORIE_API_URL 을 채워주세요.'));
    if (!dataUrl) return Promise.reject(new Error('먼저 식단 사진을 올려주세요.'));
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl })
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('분석 실패(' + r.status + ') ' + (t || '').slice(0, 900)); });
      return r.json();
    }).then(function (j) {
      var foods = Array.isArray(j && j.foods) ? j.foods.filter(function (f) { return f && f.name; }).map(function (f) {
        return { name: String(f.name), kcal: Math.max(0, Math.round(+f.kcal || 0)) };
      }) : [];
      var total = Math.round(+((j && j.totalKcal)) || foods.reduce(function (a, f) { return a + f.kcal; }, 0));
      return { foods: foods, totalKcal: total, note: (j && j.note) || '' };
    });
  }
})();
