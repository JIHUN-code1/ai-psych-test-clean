require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 10000;

// OpenAI 클라이언트
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 정적 파일 & 기본 미들웨어
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// 데이터 파일 경로
const DATA_DIR = path.join(__dirname, 'data');
const TESTS_DB_PATH = path.join(DATA_DIR, 'tests.json');

// data 폴더 & tests.json 없으면 생성
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}
if (!fs.existsSync(TESTS_DB_PATH)) {
  fs.writeFileSync(TESTS_DB_PATH, '[]', 'utf-8');
}

// JSON DB 헬퍼
function loadTests() {
  try {
    const raw = fs.readFileSync(TESTS_DB_PATH, 'utf-8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error('Failed to load tests.json', err);
    return [];
  }
}

function saveTests(tests) {
  try {
    fs.writeFileSync(TESTS_DB_PATH, JSON.stringify(tests, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save tests.json', err);
    return false;
  }
}

// 업로드 디렉토리 준비
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// multer 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || '');
    cb(null, unique + ext);
  },
});
const upload = multer({ storage });

// 라우팅: 페이지
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// 테스트 목록 API (홈/관리자 공용)
app.get('/api/tests', (req, res) => {
  const tests = loadTests();
  res.json(tests);
});

// 관리자: 새 테스트 등록
app.post('/api/admin/tests', (req, res) => {
  try {
    const {
      title,
      category,
      tag,
      shortDesc,
      link,
      bodyText,
      isHot,
      imageUrl,
    } = req.body || {};

    if (!title) {
      return res.status(400).json({ ok: false, message: 'title is required' });
    }

    const tests = loadTests();

    const now = new Date().toISOString();
    const newTest = {
      id: Date.now().toString(),
      title: String(title),
      category: category || '',
      tag: tag || '',
      shortDesc: shortDesc || '',
      link: link || '',
      bodyText: bodyText || '',
      isHot: Boolean(isHot),
      imageUrl: imageUrl || '',
      createdAt: now,
      views: 0,
    };

    tests.push(newTest);

    if (!saveTests(tests)) {
      return res.status(500).json({ ok: false, message: 'Failed to save DB' });
    }

    res.json({ ok: true, test: newTest });
  } catch (err) {
    console.error('Error in /api/admin/tests', err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// 이미지 업로드 API
app.post('/api/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const publicPath = '/uploads/' + req.file.filename;
    res.json({ imageUrl: publicPath });
  } catch (err) {
    console.error('Upload error', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// AI 심리테스트 자동 생성 API
app.post('/api/generate-test', async (req, res) => {
  try {
    const { category } = req.body || {};
    const cat = category || '연애 심리테스트';

    const prompt = `
당신은 한국의 재미있는 심리테스트 작가입니다.
아래 조건을 모두 지키면서 "${cat}" 한 편을 만들어 주세요.

[필수 형식]
- 제목 1줄
- 간단한 인트로 2~3줄
- 번호가 붙은 질문 6~8개
- 각 질문마다 보기 A,B,C,D 4개
- 마지막에 결과 유형 4가지 (A,B,C,D 위주로) 를 엔터테인먼트 느낌으로 해석

[스타일]
- 말투는 가볍고 즐거운 톤
- 심리학 용어를 남발하지 말고, 일상적인 예시 위주로 설명
- 너무 길게 쓰지 말고, 모바일에서 읽기 편한 길이로 작성
`.trim();

    const resp = await openai.responses.create({
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
    });

    const text =
      resp.output &&
      resp.output[0] &&
      resp.output[0].content &&
      resp.output[0].content[0] &&
      resp.output[0].content[0].text
        ? resp.output[0].content[0].text
        : '';

    res.json({ test: text });
  } catch (err) {
    console.error('Error in /api/generate-test', err);
    res.status(500).json({ error: 'OpenAI API error' });
  }
});

// 헬스체크
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`AI Test Generator Server Running on port ${PORT}`);
});
