// server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { OpenAI } = require('openai');

const app = express();
const port = process.env.PORT || 10000;

// ====== OpenAI 클라이언트 설정 ======
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ====== 미들웨어 ======
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ====== JSON DB 설정 (심리테스트 메타데이터 저장용) ======
const DB_DIR = path.join(__dirname, 'db');
const TEST_DB_PATH = path.join(DB_DIR, 'tests.json');

function ensureDb() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR);
  }
  if (!fs.existsSync(TEST_DB_PATH)) {
    fs.writeFileSync(TEST_DB_PATH, '[]', 'utf8');
  }
}

function readTests() {
  ensureDb();
  try {
    const raw = fs.readFileSync(TEST_DB_PATH, 'utf8');
    const data = JSON.parse(raw || '[]');
    if (Array.isArray(data)) return data;
    return [];
  } catch (e) {
    console.error('readTests error:', e);
    return [];
  }
}

function writeTests(tests) {
  ensureDb();
  fs.writeFileSync(TEST_DB_PATH, JSON.stringify(tests, null, 2), 'utf8');
}

// ====== 1. AI 심리테스트 자동 생성 API ======
app.post('/api/generate-test', async (req, res) => {
  const { category } = req.body;

  if (!category || typeof category !== 'string') {
    return res.status(400).json({ error: 'category 를 보내주세요.' });
  }

  const prompt = `
당신은 재미있는 한국형 심리테스트를 만드는 작가입니다.
카테고리: ${category}

형식에 맞춰서 하나의 심리테스트를 만들어 주세요.

[필수 조건]
- 질문은 총 7문항
- 각 문항은 보기 4개 (A, B, C, D)
- 결과 타입은 A, B, C, D 총 4가지
- 엔터테인먼트용, 과몰입 금지 멘트 포함
- 결과는 "타이틀 + 한줄 요약 + 상세 설명 + 어울리는 상황 예시"까지 작성

[출력 포맷 예시]

---
### 심리테스트 제목

### Q1. 첫 번째 질문은?
A) 보기1
B) 보기2
C) 보기3
D) 보기4

...

### 결과 해석
A가 가장 많은 사람: ...
B가 가장 많은 사람: ...
C가 가장 많은 사람: ...
D가 가장 많은 사람: ...

※ 이 테스트는 어디까지나 엔터테인먼트용입니다.
---

위와 같은 형식을 그대로 한국어로만 출력해 주세요.
`;

  try {
    const response = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: prompt,
            },
          ],
        },
      ],
      max_output_tokens: 1800,
    });

    // Responses API 결과에서 텍스트 추출
    const firstOutput = response.output[0];
    const firstContent = firstOutput?.content?.[0];
    const text = firstContent?.text || '결과를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.';

    return res.json({ test: text });
  } catch (error) {
    console.error('OpenAI API error:', error?.response?.data || error.message || error);
    return res.status(500).json({
      error: 'OpenAI API 호출 중 오류가 발생했습니다.',
    });
  }
});

// ====== 2. 관리자용 테스트 등록 API ======
// POST /api/admin/tests  (새 테스트 등록)
app.post('/api/admin/tests', (req, res) => {
  try {
    const {
      title,
      category,
      description,
      imageUrl,
      playUrl,
      tags,
      isFeatured,
    } = req.body;

    if (!title || !category || !playUrl) {
      return res.status(400).json({
        error: 'title, category, playUrl 은 필수입니다.',
      });
    }

    const tests = readTests();

    const newTest = {
      id: Date.now().toString(),
      title: title.trim(),
      category: category.trim(),
      description: (description || '').trim(),
      imageUrl:
        imageUrl?.trim() ||
        'https://images.pexels.com/photos/3760852/pexels-photo-3760852.jpeg?auto=compress&cs=tinysrgb&w=800',
      playUrl: playUrl.trim(), // 실제 테스트 풀기 링크(내 서비스든 외부든)
      tags: Array.isArray(tags)
        ? tags.map((t) => String(t).trim()).filter(Boolean)
        : typeof tags === 'string'
        ? tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      createdAt: new Date().toISOString(),
      views: 0,
      likes: 0,
      isFeatured: Boolean(isFeatured),
    };

    tests.push(newTest);
    writeTests(tests);

    return res.json({ success: true, test: newTest });
  } catch (err) {
    console.error('POST /api/admin/tests error:', err);
    return res.status(500).json({ error: '테스트 저장 중 오류가 발생했습니다.' });
  }
});

// ====== 3. 테스트 목록 조회 API (홈 화면용) ======
// GET /api/tests?sort=latest|popular&limit=12
app.get('/api/tests', (req, res) => {
  try {
    let tests = readTests();
    const sort = req.query.sort || 'latest';
    const limit = parseInt(req.query.limit || '12', 10);

    // createdAt 파싱
    tests = tests.map((t) => ({
      ...t,
      createdAt: t.createdAt || new Date().toISOString(),
      views: typeof t.views === 'number' ? t.views : 0,
      likes: typeof t.likes === 'number' ? t.likes : 0,
    }));

    if (sort === 'popular') {
      tests.sort((a, b) => {
        if (b.views !== a.views) return b.views - a.views;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    } else {
      // latest
      tests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const sliced = tests.slice(0, limit);

    return res.json({ tests: sliced });
  } catch (err) {
    console.error('GET /api/tests error:', err);
    return res.status(500).json({ error: '테스트 조회 중 오류가 발생했습니다.' });
  }
});

// ====== 4. 조회수 증가 API (선택) ======
// POST /api/tests/:id/view
app.post('/api/tests/:id/view', (req, res) => {
  try {
    const { id } = req.params;
    const tests = readTests();
    const idx = tests.findIndex((t) => t.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: '테스트를 찾을 수 없습니다.' });
    }
    tests[idx].views = (tests[idx].views || 0) + 1;
    writeTests(tests);
    return res.json({ success: true });
  } catch (err) {
    console.error('POST /api/tests/:id/view error:', err);
    return res.status(500).json({ error: '조회수 증가 중 오류가 발생했습니다.' });
  }
});

// ====== 에러 핸들러 ======
app.use((err, req, res, next) => {
  console.error('Unexpected error middleware:', err);
  res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
});

// ====== 서버 시작 ======
app.listen(port, () => {
  console.log(`AI 심리테스트 서버가 포트 ${port}에서 실행 중입니다.`);
});
