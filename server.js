// server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { OpenAI } = require('openai');

const app = express();
const PORT = process.env.PORT || 10000;

// ===== 공통 설정 =====
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// 정적 파일
app.use(express.static(path.join(__dirname, 'public')));

// 업로드 디렉토리 설정
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Multer 설정 (썸네일/배너 이미지용)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});
const upload = multer({ storage });

// JSON 파일 경로
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const testsFile = path.join(dataDir, 'tests.json');
const bannersFile = path.join(dataDir, 'banners.json');

// JSON 유틸
function readJson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('JSON read error:', filePath, e);
    return [];
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ===== OpenAI 설정 (심리테스트 자동 생성용) =====
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 심리테스트 자동 생성 API
app.post('/api/generate-test', async (req, res) => {
  const { category } = req.body;

  if (!category) {
    return res.status(400).json({ error: 'category is required' });
  }

  try {
    const prompt = `
당신은 재미있는 심리테스트를 만드는 작가입니다.
카테고리: ${category}

형식:
1) 제목
2) 질문 8개 (각 질문마다 보기 A/B/C/D)
3) 결과 유형 4개 (A/B/C/D 선택 수에 따른 엔터테인먼트형 해석)

사용자가 그대로 카피해서 쓸 수 있도록 마크다운 없이 순수 텍스트로 작성해 주세요.
`;

    const response = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: prompt }]
        }
      ],
      output: [{ type: 'output_text' }]
    });

    const text = response.output[0].content[0].text;
    res.json({ test: text });
  } catch (err) {
    console.error('OpenAI error:', err);
    res.status(500).json({ error: 'OpenAI API error' });
  }
});

// ===== 심리테스트 DB API =====

// 전체 테스트 목록
app.get('/api/tests', (req, res) => {
  const tests = readJson(testsFile);
  res.json(tests);
});

// 새 테스트 등록 (이미지 업로드 포함)
app.post('/api/tests', upload.single('image'), (req, res) => {
  try {
    const tests = readJson(testsFile);

    const {
      title,
      category,
      tag,
      description,
      text,
      isHot
    } = req.body;

    if (!title || !category) {
      return res.status(400).json({ error: 'title, category are required' });
    }

    const now = new Date().toISOString();
    const id = Date.now().toString();

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : '';

    const newTest = {
      id,
      title,
      category,
      tag: tag || '',
      description: description || '',
      text: text || '',
      image: imageUrl,
      isHot: isHot === 'true' || isHot === true,
      views: 0,
      createdAt: now
    };

    tests.push(newTest);
    writeJson(testsFile, tests);

    res.json(newTest);
  } catch (e) {
    console.error('POST /api/tests error:', e);
    res.status(500).json({ error: 'Failed to save test' });
  }
});

// 단일 테스트 조회 (테스트 풀기 화면에서 사용 가능)
app.get('/api/tests/:id', (req, res) => {
  const tests = readJson(testsFile);
  const test = tests.find(t => t.id === req.params.id);
  if (!test) return res.status(404).json({ error: 'Not found' });
  res.json(test);
});

// ===== 홈 배너(슬라이드) DB API =====

// 배너 목록 조회
app.get('/api/banners', (req, res) => {
  const banners = readJson(bannersFile);
  // 최신 등록 순으로 정렬
  banners.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(banners);
});

// 새 배너 등록 (이미지 업로드)
app.post('/api/banners', upload.single('bannerImage'), (req, res) => {
  try {
    const banners = readJson(bannersFile);
    const { title, subtitle, link, isActive } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const now = new Date().toISOString();
    const id = Date.now().toString();

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : '';

    const newBanner = {
      id,
      title,
      subtitle: subtitle || '',
      link: link || '',
      image: imageUrl,
      isActive: isActive === 'true' || isActive === true,
      createdAt: now
    };

    banners.push(newBanner);
    writeJson(bannersFile, banners);

    res.json(newBanner);
  } catch (e) {
    console.error('POST /api/banners error:', e);
    res.status(500).json({ error: 'Failed to save banner' });
  }
});

// ===== 페이지 라우팅 =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// ===== 서버 시작 =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
