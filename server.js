// server.js - 심마켓 통합 서버
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;

// ----- 기본 미들웨어 -----
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 정적 파일 (HTML / CSS / JS / 업로드 이미지)
app.use(express.static(path.join(__dirname, 'public')));

// ----- 데이터 파일 / 업로드 폴더 설정 -----
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'tests.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ----- 파일 업로드(multer) 설정 -----
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '');
    cb(null, `${Date.now()}-${base || 'image'}${ext}`);
  },
});
const upload = multer({ storage });

// ----- JSON DB helper -----
function readTests() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    if (!raw.trim()) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('tests.json 읽기 오류:', e.message);
    return [];
  }
}

function writeTests(tests) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(tests, null, 2), 'utf-8');
  } catch (e) {
    console.error('tests.json 쓰기 오류:', e.message);
  }
}

// ----- OpenAI 클라이언트 -----
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===== 1. AI 심리테스트 자동 생성 API =====
app.post('/api/generate-test', async (req, res) => {
  const { category } = req.body;
  if (!category) {
    return res.status(400).json({ error: 'category 값이 필요합니다.' });
  }

  try {
    const completion = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: `
당신은 재미있는 온라인 심리테스트를 만드는 전문가입니다.
아래 조건에 맞는 심리테스트를 하나 만들어 주세요.

[카테고리]
- ${category}

[구성]
- 제목 1개
- 간단한 도입 설명 2~3줄
- 객관식 질문 6~8개 (각 질문마다 보기 A,B,C,D 4개)
- 마지막에 결과 유형은 3~4가지로 나누고, 각 유형마다:
  - 유형 이름 (재미있는 별명 느낌)
  - 한 줄 요약
  - 특징 3~5개
  - 연애/성격/금전/커리어 등 카테고리에 맞는 조언 2~3줄

[형식]
- 마크다운 같은 특수 포맷 없이, 사람이 보기 편한 한국어 텍스트로만 작성
- 질문 앞에는 "Q1.", "Q2." 이런 식으로 번호를 붙이고
- 보기에는 "A)", "B)", "C)", "D)" 형식 사용
      `.trim(),
    });

    const text = completion.output[0].content[0].text;
    return res.json({ test: text });
  } catch (error) {
    console.error('OpenAI API 오류:', error);
    return res.status(500).json({ error: error.message || 'OpenAI 호출 중 오류' });
  }
});

// ===== 2. 이미지 업로드 API (관리자 전용) =====
app.post('/api/admin/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '이미지 파일이 필요합니다.' });
  }
  // 클라이언트에서 바로 사용할 수 있는 경로 (정적 폴더 기준)
  const url = `/uploads/${req.file.filename}`;
  return res.json({ url });
});

// ===== 3. 테스트 CRUD API =====

// 관리자용 전체 목록
app.get('/api/admin/tests', (req, res) => {
  const tests = readTests().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json(tests);
});

// 공개용 목록 (홈 화면)
app.get('/api/tests', (req, res) => {
  const tests = readTests()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      summary: t.summary,
      tags: t.tags || [],
      thumbnail: t.thumbnail,
      playUrl: t.playUrl || `/index.html?testId=${t.id}`,
      createdAt: t.createdAt,
      views: t.views || 0,
      isHot: !!t.isHot,
    }));

  res.json(tests);
});

// 단일 테스트 조회 (테스트 풀기용)
app.get('/api/tests/:id', (req, res) => {
  const tests = readTests();
  const test = tests.find((t) => t.id === req.params.id);
  if (!test) return res.status(404).json({ error: '테스트를 찾을 수 없습니다.' });
  res.json(test);
});

// 테스트 등록
app.post('/api/admin/tests', (req, res) => {
  const { title, category, summary, tags, imageUrl, playUrl, isHot, content } = req.body;

  if (!title || !category) {
    return res.status(400).json({ error: 'title, category는 필수입니다.' });
  }

  const tests = readTests();
  const id = Date.now().toString(); // 간단한 ID
  const newTest = {
    id,
    title,
    category,
    summary: summary || '',
    tags: Array.isArray(tags)
      ? tags
      : typeof tags === 'string'
      ? tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [],
    thumbnail: imageUrl || '',
    playUrl: playUrl || `/index.html?testId=${id}`,
    isHot: !!isHot,
    views: 0,
    content: content || '',
    createdAt: Date.now(),
  };

  tests.push(newTest);
  writeTests(tests);

  res.status(201).json(newTest);
});

// 테스트 수정 (핫 토글 / 메타 수정 등)
app.put('/api/admin/tests/:id', (req, res) => {
  const tests = readTests();
  const idx = tests.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '테스트를 찾을 수 없습니다.' });

  const allowed = ['title', 'category', 'summary', 'tags', 'thumbnail', 'playUrl', 'isHot', 'content'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      if (key === 'tags') {
        tests[idx].tags = Array.isArray(req.body.tags)
          ? req.body.tags
          : typeof req.body.tags === 'string'
          ? req.body.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : [];
      } else {
        tests[idx][key] = req.body[key];
      }
    }
  }

  writeTests(tests);
  res.json(tests[idx]);
});

// 테스트 삭제
app.delete('/api/admin/tests/:id', (req, res) => {
  const tests = readTests();
  const next = tests.filter((t) => t.id !== req.params.id);
  if (next.length === tests.length) {
    return res.status(404).json({ error: '테스트를 찾을 수 없습니다.' });
  }
  writeTests(next);
  res.json({ ok: true });
});

// ----- 서버 시작 -----
app.listen(port, () => {
  console.log(`심마켓 서버가 포트 ${port}에서 실행 중입니다.`);
});
