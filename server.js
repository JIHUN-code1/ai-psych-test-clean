const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors());

// ✔ Render 서버에서 read/write 가능한 유일한 폴더
const TESTS_FILE = "/tmp/tests.json";

// ✔ tests.json 자동 생성
if (!fs.existsSync(TESTS_FILE)) {
  fs.writeFileSync(TESTS_FILE, "[]", "utf8");
}

// ✔ static 페이지
app.use("/", express.static(path.join(__dirname, "public")));

// 📌 테스트 목록 조회
app.get("/api/tests", (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(TESTS_FILE, "utf8"));
    res.json({ success: true, tests: data });
  } catch (err) {
    console.error("GET /tests error:", err);
    res.json({ success: false, message: "테스트 목록 불러오기 오류" });
  }
});

// 📌 테스트 저장
app.post("/api/tests", (req, res) => {
  try {
    const body = req.body;
    let list = [];

    if (fs.existsSync(TESTS_FILE)) {
      list = JSON.parse(fs.readFileSync(TESTS_FILE, "utf8"));
    }

    const newTest = {
      id: Date.now().toString(),
      title: body.title,
      category: body.category,
      tag: body.tag,
      description: body.description,
      image: body.image,
      content: body.content,
      createdAt: new Date().toISOString(),
      hot: body.hot ? true : false
    };

    list.push(newTest);

    fs.writeFileSync(TESTS_FILE, JSON.stringify(list, null, 2), "utf8");

    res.json({ success: true, message: "등록 성공!", test: newTest });
  } catch (err) {
    console.error("POST /tests error:", err);
    res.json({ success: false, message: "테스트 저장 오류" });
  }
});

// 서버 실행
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("서버 실행 중:", PORT));
