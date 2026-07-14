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

## 구현된 기능 (6개 화면)

| 화면 | 기능 |
|------|------|
| 🏠 **홈** | 연속 인증일(streak), 오늘 인증 여부에 따른 리마인더, 참여자 오늘 상태(✅/⏳), 인증 피드, **응원(좋아요)** |
| 📸 **인증** | 카메라/사진 업로드(자동 축소), 운동 종류·시간·한마디 → 저장 시 전 화면 즉시 반영, 당일 재인증은 수정 |
| 📅 **캘린더** | 실제 달 렌더, 참여자별 색상 점, 월 이동 |
| 🏆 **랭킹** | 연속·누적으로 자동 계산·정렬, 꼴찌 벌금 안내 |
| ⚙️ **설정** | 이름·기간·벌금·보상 편집, 친구 초대(데모: 추가/제외, 실시간: 초대 링크 공유) |
| 👤 **내정보** | 통계 3종, 최근 4주 인증률 차트, 히스토리, 로그아웃 |

## 파일 구조

```
index.html              앱 셸 + 로그인 게이트 + 하단 탭
manifest.webmanifest    PWA 매니페스트 (설치용)
sw.js                   서비스 워커 (오프라인 캐시)
icon.svg                앱 아이콘
css/styles.css          디자인 팔레트(oklch)·레이아웃
js/firebase-config.js   ← Firebase 값 넣는 곳 (비우면 데모)
js/data.js              데이터 어댑터 (Local/Firebase 자동 전환)
js/app.js               화면 렌더링·상호작용
firestore.rules         Firestore 보안 규칙 (복붙용)
storage.rules           Storage 보안 규칙 (복붙용)
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

### 데이터 구조 (참고)
```
challenges/{방코드}                     설정 + participants{uid:{name,joinedAt}}
challenges/{방코드}/verifications/{id}  {uid,name,date,type,duration,message,photoUrl(dataURL),cheers{uid:true}}
```
> 사진(photoUrl)은 압축된 dataURL 로 문서 안에 저장됩니다(문서당 1MB 한도 내로 자동 축소).

### 비용
- Spark(무료): 문서 읽기 5만/일, 저장 1GB, Storage 5GB 등. 친구 몇 명 규모면 **무료로 충분**합니다.

---

## 자주 묻는 것
- **Q. 지금 그냥 써도 되나요?** → 네. 설정 안 하면 데모 모드로 혼자 완전하게 동작합니다.
- **Q. 로그인이 부담돼요.** → 익명 인증이라 이메일·비번 없이 닉네임만으로 입장합니다.
- **Q. 사진이 안 올라가요.** → 사진은 Firestore에 바로 저장되므로 Storage 설정이 없어도 됩니다. 카메라/사진 권한과 `https`/`localhost` 접속인지 확인하세요. (너무 큰 사진은 자동 축소되며, 그래도 1MB를 넘으면 사진 없이 저장됩니다.)
- **Q. Google 로그인 추가하려면?** → Authentication에서 Google 공급자를 켜고, `data.js`의 `signInAnonymously()`를 `signInWithPopup(googleProvider)`로 바꾸면 됩니다.
