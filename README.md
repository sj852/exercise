# 운동 인증 챌린지 🏋️‍♀️

친구들과 함께하는 운동 인증 챌린지 **모바일 웹앱(PWA)**. 매일 운동을 인증하고, 캘린더·랭킹으로 서로를 자극하고, 벌금은 피하자!

- **설치형 앱**처럼 동작 (홈 화면에 추가, 오프라인 지원)
- **로그인 → 방 코드로 친구와 실시간 공유** (Firebase 연동 시)
- 빌드 도구 없이 순수 HTML/CSS/JS — `index.html`만 열면 바로 실행

## 두 가지 실행 모드 (자동 전환)

| | 데모 모드 (기본) | 실시간 모드 (Firebase 연동) |
|---|---|---|
| 조건 | `js/firebase-config.js` 비어 있음 | 설정값 채움 |
| 데이터 저장 | 내 브라우저(localStorage) | 클라우드(Firestore, 사진 포함) |
| 친구와 공유 | ❌ (친구는 데모 데이터) | ✅ **같은 방 코드면 실시간 공유** |
| 로그인 | 닉네임만 | 닉네임 + 방 코드(익명 인증) |
| 용도 | 체험·포트폴리오 | 진짜 서비스 |

> 코드는 하나입니다. `firebase-config.js`에 값을 채우면 앱이 알아서 실시간 모드로 바뀝니다.

## 구현된 기능 (화면)

**운동과 식단을 따로 관리**합니다. streak·캘린더 등 통계는 운동 인증만 기준으로 계산됩니다.

| 화면 | 기능 |
|------|------|
| 🏠 **운동(홈)** | 연속 인증일(streak), 오늘 인증 여부 리마인더, 참여자 오늘 상태(✅/⏳), **운동** 인증 피드, 응원, 본인 인증 **수정** |
| 🍽️ **식단** | 끼니별(아침·점심·저녁·간식) 기록, 오늘 참여자별 섭취 칼로리 요약, 식단 피드, 본인 기록 **수정** |
| 📸 **인증** | 상단 **운동/식단 전환**. 카메라/사진 업로드(자동 축소). 운동: 종류·시간. 식단: 끼니 + **사진으로 AI 칼로리 추정**(선택) + **총 칼로리 직접 수정·음식 삭제** |
| 📅 **캘린더** | 실제 달 렌더, 참여자별 색상 점(운동 기준), 월 이동 |
| 👤 **내정보** | 통계 3종, 최근 4주 인증률 차트, 챌린지 설정, 관리자 콘솔, 로그아웃 |

> 참여자가 적어 **랭킹 화면은 제거**했습니다. (streak·통계는 내정보에서 확인)

## 파일 구조

```
index.html              앱 셸 + 로그인 게이트 + 하단 탭
admin.html              전용 관리자 페이지 (비밀번호 로그인)
manifest.webmanifest    PWA 매니페스트 (설치용)
sw.js                   서비스 워커 (오프라인 캐시)
icon.svg                앱 아이콘
css/styles.css          디자인 팔레트(oklch)·레이아웃
js/firebase-config.js   ← Firebase 값 넣는 곳 (비우면 데모)
js/data.js              데이터 어댑터 (Local/Firebase 자동 전환)
js/app.js               화면 렌더링·상호작용
js/admin.js             관리자 콘솔 로직
firestore.rules         Firestore 보안 규칙 (복붙용)
storage.rules           Storage 보안 규칙 (복붙용)
worker/                 (선택) 식단 칼로리 분석 서버 (Cloudflare Worker + Gemini)
```

## 로컬 실행

```bash
python -m http.server 8000   # → http://localhost:8000
# 또는 index.html 더블클릭 (데모 모드는 file:// 로도 대부분 동작)
```
> PWA(서비스워커)·카메라·Firebase는 `http://localhost` 또는 `https://` 에서 동작합니다. `file://` 에선 데모 열람까지만 됩니다.

---

## GitHub Pages 배포 (무료·바로 사용 가능)

```bash
git init
git add .
git commit -m "운동 인증 챌린지 웹앱"
git branch -M main
git remote add origin https://github.com/<사용자명>/<저장소명>.git
git push -u origin main
```
GitHub 저장소 → **Settings → Pages** → Source: **main / (root)** 저장 →
1~2분 뒤 `https://<사용자명>.github.io/<저장소명>/` 접속.

**GitHub Pages는 정적 호스팅이지만 이 앱은 전부 프론트엔드라 그대로 잘 돌아갑니다.** 실시간 공유가 필요하면 아래 Firebase만 연동하면 되고, **GitHub Pages는 그대로 둡니다**(Firebase가 백엔드 역할).

---

## 🔥 Firebase 연동 (친구와 실시간 공유하기)

무료 요금제(Spark)로 충분합니다. **10분**이면 됩니다.

### 1) 프로젝트 만들기
1. https://console.firebase.google.com → **프로젝트 추가** → 이름 입력 → 생성.

### 2) 웹앱 등록 & 설정값 복사
1. 프로젝트 개요 → **웹(`</>`) 아이콘** 클릭 → 앱 닉네임 입력 → 등록.
2. 표시되는 `firebaseConfig` 객체의 값들을 복사.
3. **`js/firebase-config.js`** 를 열어 그 값들을 붙여넣기:
   ```js
   window.FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "내프로젝트.firebaseapp.com",
     projectId: "내프로젝트",
     storageBucket: "내프로젝트.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234...:web:abcd..."
   };
   ```

### 3) 익명 로그인 켜기
- 콘솔 → **빌드 → Authentication → 시작하기 → Sign-in method → 익명(Anonymous) → 사용 설정**.
  (닉네임만으로 바로 입장하는 방식. 나중에 Google 로그인으로 확장 가능.)

### 4) Firestore 만들기 + 규칙 넣기
- 콘솔 → **빌드 → Firestore Database → 데이터베이스 만들기** (프로덕션 모드, 지역 선택).
- **규칙** 탭 → 이 저장소의 **`firestore.rules`** 내용을 그대로 붙여넣고 **게시**.

### 5) (선택) Storage — 지금은 필요 없음
사진은 **Firestore 문서에 압축해서 직접 저장**하도록 되어 있어 **Storage를 만들지 않아도 사진 인증이 됩니다.** (별도 요금제 불필요)
> 나중에 대용량/원본 사진을 Storage로 옮기고 싶을 때만 `storage.rules`를 쓰면 됩니다.

### 6) 도메인 허용
- Authentication → **설정 → 승인된 도메인**에 배포 주소 추가
  (예: `<사용자명>.github.io`). `localhost`는 기본 포함.

### 7) 끝! 사용법
- 앱 접속 → **닉네임 + 방 코드** 입력(예: `우리크루`).
- **친구에게 같은 방 코드**를 알려주거나, 설정 화면의 **초대 링크 공유** 버튼 사용.
- 같은 방 코드를 쓰는 사람끼리 인증·피드·랭킹·캘린더가 **실시간 동기화**됩니다.
- **같은 방 + 같은 닉네임이면 같은 사람으로 로그인**됩니다. 폰을 바꾸거나 브라우저를 다시 열어도, 방 코드와 닉네임만 같으면 이전 인증 기록·연속일이 그대로 이어집니다. (대소문자·앞뒤 공백은 무시) → 그래서 **한 방 안에서는 닉네임이 겹치지 않게** 정하세요.

### 8) 관리자 페이지 — 비밀번호로 전체 방 관리
전용 관리자 페이지 **`admin.html`** 에서 **비밀번호만 입력하면** 전체 방(챌린지)을 관리합니다: 방 목록 보기 · 방 삭제 · 인증 기록 초기화 · 참여자 제외. (uid를 하나씩 등록할 필요 없음)

**설정 (한 번만, 30초):** 관리자 비밀번호를 Firestore에 저장합니다.
1. Firebase 콘솔 → **Firestore Database → 컬렉션 시작** → 컬렉션 ID `config`
2. **문서 ID** = `admin`
3. 필드 추가: 이름 `code`, 타입 string, 값 = **원하는 관리자 비밀번호**(예: `mySecret123`) → 저장

**사용:**
- `https://<사용자명>.github.io/<저장소명>/admin.html` 접속 (또는 앱 로그인 화면 하단 **🛠 관리자 콘솔** 링크)
- 위에서 정한 비밀번호 입력 → 관리자 콘솔 진입

> **보안 방식**: 비밀번호는 공개 코드가 아니라 **Firestore(클라이언트가 못 읽는 config/admin)** 에 저장되고, `firestore.rules`가 서버측에서 검증합니다. 비밀번호를 맞힌 사람은 자동으로 `admins`에 등록돼 관리 권한을 얻습니다. 비밀번호를 모르면 방 목록 조회·삭제가 규칙 단에서 막힙니다. 비밀번호는 콘솔에서 언제든 바꿀 수 있어요.
> **데모(로컬) 모드**에서는 비밀번호 없이 `admin.html` 이 열려 UI를 미리 볼 수 있습니다.

---

## 🍽 식단 칼로리 분석 (선택 기능)

인증 화면에서 **종류 "식단"** 을 고르고 음식 사진을 올린 뒤 **🍽 AI 칼로리 분석** 을 누르면,
사진 속 음식을 인식해 **예상 칼로리와 음식 목록**을 추정해 인증에 함께 기록합니다. (피드에도 표시)

- **무료** 구성: **Cloudflare Workers AI(Llama 3.2 Vision)**. Google 계정·API 키·결제 **불필요**.
- 사진 분석은 Cloudflare Worker 안에서 **Workers AI 바인딩**으로 바로 처리됩니다.
- 설정을 안 하면 이 버튼은 비활성(안내) 상태로만 보이고, 나머지 앱 기능은 그대로 동작합니다.

**설정 2단계:**
1. **Worker 배포**: `worker/` 폴더에서 아래 실행 (자세한 설명은 `worker/README.md`)
   ```bash
   npx wrangler login
   npx wrangler deploy                      # → https://calorie.<계정>.workers.dev 출력
   ```
2. **앱에 연결**: `js/firebase-config.js` 의 `window.CALORIE_API_URL` 에 위 주소 붙여넣기
   ```js
   window.CALORIE_API_URL = "https://calorie.<계정>.workers.dev";
   ```

> **정확도**: 사진만으로는 양·기름·소스를 정확히 알 수 없어 **추정치**입니다. 앱에도 "AI 추정치"로 표시됩니다.
> **quota 보호**: `worker/wrangler.toml` 의 `ALLOW_ORIGIN` 을 내 GitHub Pages 주소로 바꾸면 남이 내 무료 할당을 쓰는 걸 막을 수 있어요.

### 데이터 구조 (참고)
```
challenges/{방코드}                     설정 + participants{pid:{name,joinedAt}}
challenges/{방코드}/verifications/{id}  {uid(=pid),name,date,category('workout'|'meal'),slot('breakfast'|'lunch'|'dinner'|'snack'),type,duration,message,photoUrl(dataURL),kcal,foods[{name,kcal}],cheers{pid:true}}
admins/{authUid}                        관리자 명단 (문서 존재 = 관리자). 비밀번호 맞히면 자동 등록
config/admin                            { code: "관리자 비밀번호" } — 콘솔에서만 설정
```
> **pid(참여자 신원)** = 닉네임을 정규화(소문자·공백제거)한 안정 키. 로그인 시 이 값으로 참여자를 찾으므로 **같은 방·같은 닉네임 = 같은 사람**. (익명 인증 uid 는 접근 통제·관리자 판정에만 쓰이고, 방 안 신원으로는 쓰지 않습니다.)
> 사진(photoUrl)은 압축된 dataURL 로 문서 안에 저장됩니다(문서당 1MB 한도 내로 자동 축소).

### 비용
- Spark(무료): 문서 읽기 5만/일, 저장 1GB, Storage 5GB 등. 친구 몇 명 규모면 **무료로 충분**합니다.

---

## 자주 묻는 것
- **Q. 지금 그냥 써도 되나요?** → 네. 설정 안 하면 데모 모드로 혼자 완전하게 동작합니다.
- **Q. 로그인이 부담돼요.** → 익명 인증이라 이메일·비번 없이 닉네임만으로 입장합니다.
- **Q. 사진이 안 올라가요.** → 사진은 Firestore에 바로 저장되므로 Storage 설정이 없어도 됩니다. 카메라/사진 권한과 `https`/`localhost` 접속인지 확인하세요. (너무 큰 사진은 자동 축소되며, 그래도 1MB를 넘으면 사진 없이 저장됩니다.)
- **Q. Google 로그인 추가하려면?** → Authentication에서 Google 공급자를 켜고, `data.js`의 `signInAnonymously()`를 `signInWithPopup(googleProvider)`로 바꾸면 됩니다.
