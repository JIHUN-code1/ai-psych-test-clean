const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();

// JSON 바디 파싱
app.use(express.json({ limit: "10mb" }));
app.use(cors());

// 🔐 Render 에서 쓰기 가능한 위치: /tmp
const TESTS_FILE = path.join("/tmp", "tests.json");

// tests.json 읽기
function readTests() {
  try {
    if (!fs.existsSync(TESTS_FILE)) {
      return [];
    }
    const text = fs.readFileSync(TESTS_FILE, "utf8");
    if (!text.trim()) return [];
    return JSON.parse(text);
  } catch (err) {
    console.error("readTests error:", err);
    return [];
  }
}

// tests.json 쓰기
function writeTests(list) {
  try {
    fs.writeFileSync(TESTS_FILE, JSON.stringify(list, null, 2), "utf8");
  } catch (err) {
    console.error("writeTests error:", err);
  }
}

// 정적 파일 서빙 (public 폴더)
app.use("/", express.static(path.join(__dirname, "public")));

// ✅ 테스트 목록 불러오기 (홈 화면/관리자 공용)
app.get("/api/tests", (req, res) => {
  const tests = readTests();

  // 최신 등록 순으로 정렬
  tests.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  res.json({
    success: true,
    tests,
  });
});

// ✅ 단일 테스트 조회 (필요하면 index.html에서 사용 가능)
app.get("/api/tests/:id", (req, res) => {
  const tests = readTests();
  const found = tests.find((t) => t.id === req.params.id);
  if (!found) {
    return res.status(404).json({ success: false, message: "테스트를 찾을 수 없습니다." });
  }
  res.json({ success: true, test: found });
});

// ✅ 테스트 등록 (관리자 페이지에서 호출)
app.post("/api/tests", (req, res) => {
  try {
    const body = req.body || {};
    const { title, category, tag, description, content, image, hot } = body;

    if (!title || !category) {
      return res
        .status(400)
        .json({ success: false, message: "제목과 카테고리는 필수입니다." });
    }

    let tests = readTests();

    const now = new Date().toISOString();
    const newTest = {
      id: Date.now().toString(),
      title,
      category,
      tag: tag || "",
      description: description || "",
      content: content || "",
      image: image || "", // (지금은 Base64 또는 URL 문자열, 나중에 업로드 기능 붙일 수 있음)
      hot: !!hot,
      createdAt: now,
      views: 0,
    };

    tests.push(newTest);
    writeTests(tests);

    return res.json({
      success: true,
      message: "테스트가 성공적으로 저장되었습니다.",
      test: newTest,
    });
  } catch (err) {
    console.error("POST /api/tests error:", err);
    return res
      .status(500)
      .json({ success: false, message: "서버 내부 오류가 발생했습니다." });
  }
});

// 서버 시작
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`심마켓 서버 실행 중: http://localhost:${PORT}`);
});
