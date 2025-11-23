// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const port = process.env.PORT || 10000;

// --- 미들웨어 설정 ---
app.use(cors());
app.use(express.json());

// 정적 파일 제공 (public 폴더)
app.use(express.static(path.join(__dirname, 'public')));

// 루트("/")로 들어오면 index.html 내려주기
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- OpenAI 클라이언트 설정 ---
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 공통: 에러 로깅 헬퍼
function logError(context, err) {
  console.error(`❌ [${context}]`, err?.response?.data || err?.message || err);
}

// AI 심리 테스트 자동 생성 API
app.post('/api/generate-test', async (req, res) => {
  try {
    const { category } = req.body;

    const systemPrompt = `
당신은 재미있는 한국어 심리테스트를 만드는 전문 작가입니다.
엔터테인먼트용이지만, 질문과 보기, 결과가 자연스럽고 설득력 있게 느껴져야 합니다.

출력 형식은 반드시 아래 예시를 꼭 지켜주세요. (형식을 벗어나지 말 것!)

[제목]
(한 줄 제목)

[설명]
(테스트를 소개하는 1~2문장)

[질문]
1. 첫 번째 질문 문장?
A) 보기 1
B) 보기 2
C) 보기 3
D) 보기 4

2. 두 번째 질문 문장?
A) 보기 1
B) 보기 2
C) 보기 3
D) 보기 4

(총 6~8문항 정도 생성)

[결과 해석]
A 타입: (A를 많이 고른 사람에 대한 성향 설명, 5~7문장)
B 타입: (B를 많이 고른 사람에 대한 성향 설명, 5~7문장)
C 타입: (C를 많이 고른 사람에 대한 성향 설명, 5~7문장)
D 타입: (D를 많이 고른 사람에 대한 성향 설명, 5~7문장)

주의:
- "A 선택 1점, B 선택 2점" 이런 점수 표기는 넣지 마세요.
- 오직 A/B/C/D 유형으로만 결과를 나눠 주세요.
- 가능한 한 질문과 결과 모두 카테고리와 잘 맞게 작성하세요.
`;

    const userPrompt = `
카테고리: ${category}

위 카테고리에 어울리는 심리테스트를 하나 만들어 주세요.
설명과 결과는 너무 무겁지 않게, 가볍고 재밌는 엔터테인먼트 톤으로 써 주세요.
`;

    const completion = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      max_output_tokens: 1200,
    });

    const text = completion.output[0].content[0].text;
    res.json({ test: text });
  } catch (error) {
    logError('generate-test', error);
    res.status(500).json({ error: '심리테스트 생성 중 오류가 발생했습니다.' });
  }
});

// AI 엔터테인먼트 해석 API
app.post('/api/analyze-result', async (req, res) => {
  try {
    const { category, testText, summary } = req.body;

    const systemPrompt = `
당신은 연애·성격·금전·직장 등 다양한 주제의 심리테스트를
엔터테인먼트 스타일로 해석해 주는 한국어 심리 분석가입니다.

톤 & 스타일:
- 심각한 상담 느낌 X, 친구처럼 재밌게 말해주는 느낌
- 가끔 가벼운 농담, 공감 멘트 OK
- 하지만 선 넘는 비하 / 혐오 / 위험한 조언은 절대 금지
- "의학적 진단이 아니다" 정도의 가벼운 안내는 한 줄 정도만

출력 형식:
1) 한 줄 요약 타이틀 (예: "당신은 차분한 분석가형, C타입!")
2) 전체 성향 설명 (3~5문단)
3) 연애/대인관계에서의 모습
4) 일/학업/일상에서의 모습
5) 이런 사람과 잘 맞아요
6) 이런 상황에서 빛납니다
7) 마지막에 한 줄 정도로 "너무 심각하게 받아들이지 말고 재미로만 보세요~" 같은 멘트
`;

    const userPrompt = `
[테스트 카테고리]
${category}

[테스트 전체 내용]
${testText}

[사용자 선택 요약(JSON)]
${JSON.stringify(summary, null, 2)}

위 정보를 바탕으로, 사용자의 "전체적인 성향"을 A/B/C/D 점수에 맞춰 재밌게 해석해 주세요.
사용자가 가장 많이 고른 선택지(예: C가 제일 많음)를 중심으로 스토리를 만들어 주세요.
`;

    const completion = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_output_tokens: 900,
    });

    const text = completion.output[0].content[0].text;
    res.json({ result: text });
  } catch (error) {
    logError('analyze-result', error);
    res.status(500).json({ error: '결과 해석 생성 중 오류가 발생했습니다.' });
  }
});

// 서버 시작
app.listen(port, () => {
  console.log(`AI Test Generator Server Running on port ${port}`);
});
