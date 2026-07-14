# 식단 칼로리 분석 서버 (Cloudflare Workers AI)

식단 사진을 받아 **Cloudflare Workers AI 비전 모델(Llama 3.2 Vision)** 로 칼로리를 추정해 돌려주는 작은 Worker 입니다.
**Google 계정·API 키·결제가 전혀 필요 없습니다.** Cloudflare 계정의 **Workers AI 무료 할당**만으로 동작합니다.

## 왜 이렇게 하나
앱은 GitHub Pages(정적 프론트엔드)라 서버가 없습니다. 사진 분석 AI는 서버에서 호출해야 하는데,
Cloudflare Worker 안에서 **Workers AI 바인딩**으로 바로 추론하면 외부 키 없이 무료로 됩니다.

## 응답 형식
```
POST { image: "data:image/jpeg;base64,..." }
→ { foods: [{ name, kcal }], totalKcal, note }
```

---

## 배포 (3단계)
이 `worker/` 폴더에서:
```bash
# 최초 1회 로그인 (브라우저 열림)
npx wrangler login

# 배포 (wrangler.toml 에 [ai] 바인딩이 이미 있어 별도 설정 불필요)
npx wrangler deploy
```
배포가 끝나면 이런 주소가 출력됩니다:
```
https://calorie.<본인계정>.workers.dev
```

## 앱에 연결
`js/firebase-config.js` 의 이 줄을 배포 주소로 채웁니다:
```js
window.CALORIE_API_URL = "https://calorie.<본인계정>.workers.dev";
```
저장 → 앱 새로고침 → 인증 화면에서 **종류 "식단"** → 사진 올리고 **🍽 AI 칼로리 분석**.

---

## (선택) 내 사이트만 허용
기본값 `ALLOW_ORIGIN = "*"` 는 누구나 호출할 수 있습니다. `wrangler.toml` 의 값을 본인 GitHub Pages 주소로 바꾸고 다시 배포하세요:
```toml
[vars]
ALLOW_ORIGIN = "https://<사용자명>.github.io"
```

## 모델 교체
`wrangler.toml` 의 `AI_MODEL` 을 다른 Workers AI 비전 모델로 바꿀 수 있습니다.
- `@cf/meta/llama-3.2-11b-vision-instruct` (기본, 지시 따르기·JSON 출력 좋음)
- `@cf/llava-hf/llava-1.5-7b-hf` (가벼움)

## 동작 방식
```
브라우저(앱)  ──POST {image}──►  Worker  ──env.AI.run──►  Workers AI (Llama Vision)
             ◄──{foods,totalKcal,note}──                ◄── 텍스트(JSON)
```

## 비용 / 정확도
- **무료**: Workers AI 무료 일일 할당(뉴런) 내에서 동작. 친구 몇 명이 하루 몇 끼 올리는 정도면 충분.
- **정확도**: 사진만으로는 양·기름·소스를 정확히 알 수 없어 **추정치**입니다. 앱에도 "AI 추정치"로 표시됩니다.
  (정확도가 더 필요하면 Google Gemini 유료 티어로 바꾸는 방법도 있지만, 무료로는 이 구성이 가장 실용적입니다.)

> 참고: 예전에 넣었던 `GEMINI_API_KEY` 비밀값은 더 이상 쓰지 않습니다. 남겨둬도 무해하며, 지우려면 `npx wrangler secret delete GEMINI_API_KEY`.
