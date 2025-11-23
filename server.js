// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;

// 공통 미들웨어
app.use(cors());
app.use(express.json());

// 정적 파일 (프론트)
app.use(express.static(path.join(__dirname, 'public')));

// OpenAI 클라이언트
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 심리테스트 생성 API
app.post('/api/generate-test', async (req, res) => {
  console.log('[/api/generate-test] 요청 도착:', req.body);
  const { category } = req.body || {};

  if (!category) {
    return res.status(400).json({ error: 'category 값이 필요합니다.' });
  }

  // 프롬프트 한 줄로 정리
  const prompt = `
카테고리: ${category} 에 대한 심리테스트를 하나 만들어 주세요.

요구사항:
- 한국어로 작성
- 문제 5~8개
- 각 문제는 객관식 4지선다 (A/B/C/D)
- 마지막에 결과 유형을 3~4개로 나눠서,
  각 유형마다:
  - 유형 이름
  - 성향 설명
  - 간단한 조언
을 포함해 주세요.
  `.trim();

  try {
    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'user',
          content: [
            {
              // ❗ Responses API에서 허용하는 타입: input_text
              type: 'input_text',
              text: prompt,
            },
          ],
        },
      ],
      max_output_tokens: 1500,
    });

    // 결과 파싱: output[0].content 배열에서 output_text 찾기
    const contents = response.output[0].content;
    const textPart = contents.find((part) => part.type === 'output_text');

    const resultText =
      textPart?.text ||
      contents
        .map((part) => part.text || '')
        .join('\n')
        .trim();

    console.log('생성된 심리테스트 텍스트 길이:', resultText.length);

    return res.json({ test: resultText });
  } catch (error) {
    // 에러 자세히 로그
    const detail =
      error.response?.data || error.response?.body || error.message || error;
    console.error('[OpenAI API 오류]', detail);

    return res
      .status(500)
      .json({ error: 'OpenAI API 호출 중 오류가 발생했습니다.' });
  }
});

// 나머지 요청은 모두 index.html로 (SPA용)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 서버 시작
app.listen(port, () => {
  console.log(`AI Test Generator Server Running on port ${port}`);
});
