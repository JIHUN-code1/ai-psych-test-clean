// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const port = process.env.PORT || 10000;

// --- OpenAI 클라이언트 ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- 미들웨어 설정 ---
app.use(cors());
app.use(express.json());

// 정적 파일 제공 (public 폴더)
app.use(express.static(path.join(__dirname, 'public')));

// ------------ AI 심리테스트 생성 API ------------
// POST /api/generate-test
// body: { category: "연애 심리테스트" | ... }
app.post('/api/generate-test', async (req, res) => {
  try {
    const { category } = req.body || {};

    if (!category) {
      return res.status(400).json({ error: 'category 필드가 필요합니다.' });
    }

    const prompt = `
당신은 재미있는 심리테스트를 만드는 작가입니다.
아래 조건을 만족하는 한국어 심리테스트를 만들어 주세요.

[카테고리]
${category}

[조건]
- 총 7문항
- 각 문항마다 보기 4개 (A, B, C, D)
- 질문은 일상/연애/소비/직장 등 실제 상황을 떠올릴 수 있게 구체적이고, 살짝 웃기거나 공감되는 톤이면 좋음
- 너무 무겁지 않고, 엔터테인먼트 예능 느낌으로 가볍게 즐길 수 있는 스타일
- 질문은 번호로, 보기에는 항상 A) B) C) D) 형식을 사용

[출력 형식 예시]
1. 질문 내용...
A) 보기1
B) 보기2
C) 보기3
D) 보기4

2. 질문 내용...
A) ...
B) ...
C) ...
D) ...

(중략)

[마지막에 아래처럼 간단한 결과 유형 4개도 추가]
[결과 유형]
A 타입: ~~~
B 타입: ~~~
C 타입: ~~~
D 타입: ~~~
`;

    const completion = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: prompt,
      max_output_tokens: 1200,
    });

    const text = completion.output[0].content[0].text;
    res.json({ test: text });
  } catch (error) {
    console.error('[/api/generate-test] error:', error);
    res.status(500).json({ error: error.message || 'OpenAI 호출 중 오류가 발생했습니다.' });
  }
});

// ------------ AI 결과 해석 API ------------
// POST /api/analyze-result
// body: { category, testText, summary: { totalQuestions, totalAnswered, counts: {A,B,C,D} } }
app.post('/api/analyze-result', async (req, res) => {
  try {
    const { category, testText, summary } = req.body || {};
    if (!testText || !summary) {
      return res.status(400).json({ error: 'testText와 summary가 필요합니다.' });
    }

    const safeCategory = category || '심리테스트';

    const prompt = `
당신은 예능 프로그램에서 심리테스트 결과를 재미있게 풀어주는 MC입니다.
아래 정보를 기반으로 사용자를 위한 "엔터테인먼트 스타일" 결과 리포트를 작성하세요.

[카테고리]
${safeCategory}

[원본 심리테스트 텍스트]
""" 
${testText}
"""

[사용자 선택 요약]
- 총 문항 수: ${summary.totalQuestions}
- 실제 답변한 문항 수: ${summary.totalAnswered}
- A 선택: ${summary.counts?.A ?? 0}개
- B 선택: ${summary.counts?.B ?? 0}개
- C 선택: ${summary.counts?.C ?? 0}개
- D 선택: ${summary.counts?.D ?? 0}개

[요청 스타일]
- 너무 진지한 상담이 아니라, "예능/엔터테인먼트" 느낌의 가벼운 해석
- 하지만 사용자가 알아들을 수 있는 나름 그럴듯한 분석도 포함
- 반말/존댓말 섞어서 친근한 MC 톤 (예: "자, 그러면 결과 한번 볼까요?" 느낌)
- 사용자를 놀리진 말고, 귀엽게 놀리는 정도까지만

[결과 구성]
1) 한 줄 타이틀 (예: "당신은 계획형 욜로 소비러!")
2) 한 줄 캐치프레이즈 (짧게)
3) 전체 성향 요약 (2~3문장)
4) 상세 분석 (4~6문장)
   - 인간관계/연애/소비/직장 등 카테고리에 맞춰 포인트 언급
5) 이런 사람과 잘 맞아요 / 이런 상황에서 빛나요 (각 2~3줄)
6) 마지막에 가볍게 웃기면서 "재미로만 참고하세요" 한 줄

문단 사이에는 빈 줄을 넣어 가독성을 좋게 해 주세요.
`;

    const completion = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: prompt,
      max_output_tokens: 900,
    });

    const text = completion.output[0].content[0].text;
    res.json({ result: text });
  } catch (error) {
    console.error('[/api/analyze-result] error:', error);
    res.status(500).json({ error: error.message || 'OpenAI 호출 중 오류가 발생했습니다.' });
  }
});

// SPA 지원을 위해 나머지 모든 경로는 index.html 반환
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 서버 시작
app.listen(port, () => {
  console.log(`AI Test Generator Server Running on port ${port}`);
});
