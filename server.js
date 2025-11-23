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

// AI 심리 테스트 자동 생성 API
app.post('/generate-test', async (req, res) => {
  try {
    const { category } = req.body;

    const prompt = `심리테스트를 하나 만들어줘.
카테고리: ${category}
형식:
- 제목
- 설명
- 질문 5개
- 각 질문당 보기 4개
- 결과 4개 (A/B/C/D) 형태`;

    const completion = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: prompt,
    });

    const text = completion.output[0].content[0].text;
    res.json({ test: text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// 서버 시작
app.listen(port, () => {
  console.log(`AI Test Generator Server Running on port ${port}`);
});
