// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const OpenAI = require('openai');

// 로컬 개발할 때 .env 사용 (Render에서는 무시됨)
require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;

// --- 미들웨어 설정 ---
app.use(cors());
app.use(express.json());

// 정적 파일 제공 (public 폴더)
app.use(express.static(path.join(__dirname, 'public')));

// --- OpenAI 클라이언트 설정 ---
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// API 라우트: 심리테스트 생성
app.post('/api/generate-test', async (req, res) => {
  console.log('[/api/generate-test] 요청 도착:', req.body);

  const { category } = req.body;

  if (!category) {
    return res.status(400).json({ error: 'category 값이 필요합니다.' });
  }

  try {
    const completion = await client.responses.create({
      model: 'gpt-4.1-mini', // 필요하면 다른 모델명으로 변경 가능
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text:
                '당신은 심리테스트 출제 전문가입니다. ' +
                '연애, 성격, 금전/소비, 직장/커리어, 우정/대인관계, 라이프스타일 등 다양한 주제의 심리테스트를 한국어로 재미있고 이해하기 쉽게 만듭니다.'
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                `카테고리: ${category} 에 대한 심리테스트를 하나 만들어 주세요. ` +
                '문제 5~8개 정도, 각 문제는 객관식 4지선다로 만들고, ' +
                '마지막에 유형별 결과 해석(3~4유형)을 간단한 설명과 조언과 함께 정리해 주세요.'
            }
          ]
        }
      ],
      max_output_tokens: 1200,
    });

    // Responses API 결과 파싱
    const text = completion.output[0].content[0].text;
    console.log('생성된 심리테스트 텍스트 길이:', text.length);

    res.json({ test: text });
  } catch (error) {
    console.error('[OpenAI API 오류]', error.response?.data || error.message || error);
    res.status(500).json({ error: 'OpenAI API 호출 중 오류가 발생했습니다.' });
  }
});

// SPA 지원용: 나머지 모든 요청은 index.html 반환
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 서버 시작
app.listen(port, () => {
  console.log(`AI Test Generator Server Running on port ${port}`);
});
