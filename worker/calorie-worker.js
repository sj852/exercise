/* =========================================================================
   식단 사진 → 칼로리 추정 Worker (Cloudflare Workers AI, 무료 티어)
   - 브라우저에서 POST { image: dataURL } 를 받아 Workers AI 비전 모델로 분석
   - Google 키/결제 불필요. Cloudflare 계정의 Workers AI 무료 할당만으로 동작.
   - 응답: { foods:[{name,kcal}], totalKcal, note }

   필요한 설정: wrangler.toml 에 AI 바인딩([ai] binding="AI")  — 이미 포함됨.
   배포:        npx wrangler deploy
   환경변수(선택): ALLOW_ORIGIN(허용 도메인), AI_MODEL(기본 llama-3.2-11b-vision-instruct)
   ========================================================================= */
export default {
  async fetch(request, env) {
    const allow = env.ALLOW_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': allow,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      return await handle(request, env, cors);
    } catch (e) {
      // 어떤 오류든 CORS 헤더와 함께 실제 메시지를 반환 (CORS 로 가려지지 않게)
      return json({ error: '서버 오류: ' + String((e && e.stack) || (e && e.message) || e).slice(0, 500) }, 500, cors);
    }
  }
};

async function handle(request, env, cors) {
    if (!env.AI) return json({ error: 'AI 바인딩이 없습니다 (wrangler.toml 의 [ai] binding="AI" 확인)' }, 500, cors);

    const model = env.AI_MODEL || '@cf/meta/llama-3.2-11b-vision-instruct';

    // 일회성 라이선스 동의 (gated 모델용). 브라우저로 /agree 한 번 방문하면 됨.
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    if (request.method === 'GET' && path.endsWith('/agree')) {
      try {
        const r = await env.AI.run(model, { prompt: 'agree' });
        return json({ ok: true, message: '라이선스 동의 완료. 이제 식단 분석을 사용할 수 있어요.', result: r }, 200, cors);
      } catch (e) {
        return json({ ok: false, error: String(e && e.message || e) }, 502, cors);
      }
    }

    if (request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다 (동의는 /agree 로 GET)' }, 405, cors);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'JSON 파싱 실패' }, 400, cors); }
    const image = body && body.image;
    if (!image) return json({ error: 'image 필드(dataURL)가 필요합니다' }, 400, cors);

    // dataURL("data:image/jpeg;base64,....") → base64 → 바이트 배열
    const m = /^data:[^;]+;base64,([\s\S]*)$/.exec(image);
    const b64 = m ? m[1] : image;
    let bytes;
    try {
      const bin = atob(b64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch { return json({ error: '이미지 디코딩 실패 (base64 형식 확인)' }, 400, cors); }

    const instruction =
      '너는 영양 분석 도우미다. 사진 속 음식을 보고 각 음식의 이름과 1인분 기준 대략적 칼로리(kcal), ' +
      '그리고 전체 합계를 추정한다. 반드시 아래 JSON 형식으로만, 다른 말 없이 답한다:\n' +
      '{"foods":[{"name":"음식명","kcal":숫자}],"totalKcal":숫자,"note":""}\n' +
      '한국 음식은 한국어 이름으로. 사진에 음식이 없으면 foods 는 빈 배열, note 에 "음식을 찾지 못했어요".';

    let out;
    try {
      out = await env.AI.run(model, {
        image: [...bytes],
        messages: [
          { role: 'system', content: instruction },
          { role: 'user', content: '이 식단 사진을 분석해서 JSON 으로만 답해줘.' }
        ],
        max_tokens: 512
      });
    } catch (e) {
      return json({ error: 'Workers AI 호출 실패: ' + (e && e.message || e) }, 502, cors);
    }

    // 모델 출력에서 결과 뽑기 (문자열/객체 어느 쪽이든 처리)
    let text = out && (out.response !== undefined ? out.response
                     : out.description !== undefined ? out.description
                     : out.result);
    // 이미 구조화된 객체로 왔으면 그대로 사용
    if (text && typeof text === 'object') {
      if (Array.isArray(text.foods) || typeof text.totalKcal !== 'undefined') return json(text, 200, cors);
      text = JSON.stringify(text);
    }
    text = typeof text === 'string' ? text : String(text || '');
    const parsed = extractJson(text);
    if (!parsed) return json({ foods: [], totalKcal: 0, note: '분석 결과를 해석하지 못했어요', raw: text.slice(0, 300) }, 200, cors);
    return json(parsed, 200, cors);
}

/* 모델이 코드펜스/설명을 섞어 내보내도 첫 번째 {...} 를 뽑아 파싱 */
function extractJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(text.slice(s, e + 1)); } catch {} }
  return null;
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors)
  });
}
