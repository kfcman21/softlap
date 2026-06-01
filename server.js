const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
let oracledb;

try {
  oracledb = require('oracledb');
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
} catch (e) {
  console.warn("⚠️ 'oracledb' 드라이버를 로드할 수 없습니다. 로컬 JSON 모드로 강제 기동합니다.");
}

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');
const CONFIG_FILE = path.join(__dirname, 'oracle-config.json');

app.use(cors());
app.use(express.json({ limit: '15mb' })); // Support base64 canvas compressed images
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Serve static frontend files from current directory
app.use(express.static(__dirname));

// ==================== ORACLE DATABASE CONFIGURATION ====================
let pool = null;
let useOracle = false;

// Default Oracle DB Configuration Template
const defaultOracleConfig = {
  enabled: false,
  user: "admin",
  password: "YourOraclePassword123",
  connectString: "(description=(retry_count=20)(retry_delay=3)(address=(protocol=tcps)(port=1522)(host=adb.ap-seoul-1.oraclecloud.com))(connect_data=(service_name=your_db_high.adb.oraclecloud.com))(security=(ssl_server_dn_match=yes)))"
};

// Load or create Oracle Config file
function loadOracleConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultOracleConfig, null, 2), 'utf8');
    return defaultOracleConfig;
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    return defaultOracleConfig;
  }
}

const dbConfig = loadOracleConfig();

// Initialize Oracle Connection Pool and Tables
async function initOracleDatabase() {
  if (!oracledb || !dbConfig.enabled) {
    console.log("☁️ 오라클 클라우드 DB 연동이 비활성화 상태입니다. 로컬 파일 DB(db.json) 모드로 기동합니다.");
    return;
  }

  try {
    console.log("☁️ 오라클 클라우드 Autonomous DB 커넥션 풀을 초기화합니다...");
    
    // Node-oracledb v6.0+ is pure JS Thin Mode by default (no wallet/client required for TLS)
    pool = await oracledb.createPool({
      user: dbConfig.user,
      password: dbConfig.password,
      connectString: dbConfig.connectString,
      poolMin: 1,
      poolMax: 5,
      poolIncrement: 1
    });

    useOracle = true;
    console.log("🎉 오라클 클라우드 Autonomous DB 커커넥션 풀 생성 성공!");

    // Create Tables if not exist
    await createOracleTables();
  } catch (err) {
    console.error("❌ 오라클 클라우드 DB 연결 실패:", err.message);
    console.log("⚠️ 로컬 파일 데이터베이스(db.json)로 대체하여 안전하게 시동합니다.");
  }
}

async function createOracleTables() {
  let conn;
  try {
    conn = await pool.getConnection();

    // 1. Users Table
    try {
      await conn.execute(`
        CREATE TABLE SOFTLAP_USERS (
          EMAIL VARCHAR2(100) PRIMARY KEY,
          PASSWORD VARCHAR2(100) NOT NULL,
          NAME VARCHAR2(100) NOT NULL,
          SCHOOL VARCHAR2(200),
          ROLE VARCHAR2(50) DEFAULT 'teacher',
          IS_ENTERPRISE NUMBER(1) DEFAULT 0
        )
      `);
      console.log("📊 [DB] SOFTLAP_USERS 테이블 신규 생성 완료!");
      
      // Seed default accounts in Oracle
      await seedDefaultOracleAccounts(conn);
    } catch (e) {
      if (e.message.indexOf("ORA-00955") === -1) throw e; // ORA-00955: table already exists
    }

    // 2. Projects Table
    try {
      await conn.execute(`
        CREATE TABLE SOFTLAP_PROJECTS (
          EMAIL VARCHAR2(100),
          PROJECT_ID VARCHAR2(100),
          PROJECT_DATA CLOB,
          PRIMARY KEY (EMAIL, PROJECT_ID)
        )
      `);
      console.log("📊 [DB] SOFTLAP_PROJECTS 테이블 신규 생성 완료!");
    } catch (e) {
      if (e.message.indexOf("ORA-00955") === -1) throw e;
    }

    // 3. Submitted Table
    try {
      await conn.execute(`
        CREATE TABLE SOFTLAP_SUBMITTED (
          PROJECT_ID VARCHAR2(100) PRIMARY KEY,
          EMAIL VARCHAR2(100),
          STATUS VARCHAR2(50) DEFAULT '피드백 대기',
          TEACHER_NAME VARCHAR2(100),
          SCHOOL_NAME VARCHAR2(200),
          SUBMIT_DATE VARCHAR2(50),
          PROJECT_DATA CLOB,
          FEEDBACK CLOB
        )
      `);
      console.log("📊 [DB] SOFTLAP_SUBMITTED 테이블 신규 생성 완료!");
    } catch (e) {
      if (e.message.indexOf("ORA-00955") === -1) throw e;
    }

    // 4. Registry Table
    try {
      await conn.execute(`
        CREATE TABLE SOFTLAP_REGISTRY (
          NAME VARCHAR2(200) PRIMARY KEY,
          COMPANY VARCHAR2(200)
        )
      `);
      console.log("📊 [DB] SOFTLAP_REGISTRY 테이블 신규 생성 완료!");
      await seedDefaultOracleRegistry(conn);
    } catch (e) {
      if (e.message.indexOf("ORA-00955") === -1) throw e;
    }

  } catch (err) {
    console.error("❌ 테이블 스키마 초기화 실패:", err);
  } finally {
    if (conn) {
      try { await conn.close(); } catch(e) {}
    }
  }
}

async function seedDefaultOracleRegistry(conn) {
  const defaultRegistry = [
    { name: "엔트리봇 코딩 마스터 AI v2.0", company: "에듀크리에이티브 주식회사" },
    { name: "클래스팅 AI", company: "클래스팅" },
    { name: "홈런 초등 AI", company: "아이스크림에듀" },
    { name: "엘리하이 초등", company: "메가스터디교육" },
    { name: "똑똑 수학탐험대", company: "교육부 / 한국교육학술정보원" },
    { name: "리딩앤", company: "아이포트폴리오" },
    { name: "호두잉글리시", company: "호두랩스" },
    { name: "스마트올 초등", company: "웅진씽크빅" },
    { name: "AI 나누미", company: "(주)인텔리콘연구소" },
    { name: "AI 헬피챗", company: "(주)엘리스그룹" },
    { name: "꾸럼e", company: "(주)추론" },
    { name: "스픽마스터", company: "(주)에듀템" },
    { name: "알콩", company: "(주)AI DATA" },
    { name: "클래스사티", company: "태그하이브" },
    { name: "클래시파이", company: "클래시파이랩스" },
    { name: "투닝", company: "(주)툰스퀘어" }
  ];

  for (const item of defaultRegistry) {
    await conn.execute(
      `INSERT INTO SOFTLAP_REGISTRY (NAME, COMPANY) VALUES (:name, :company)`,
      [item.name, item.company]
    );
  }
  await conn.commit();
  console.log("🌱 [DB] 오라클 DB에 에듀테크 마스터 명부 초기 Seeding 완료!");
}

async function seedDefaultOracleAccounts(conn) {
  // Seed admin
  await conn.execute(`
    INSERT INTO SOFTLAP_USERS (EMAIL, PASSWORD, NAME, SCHOOL, ROLE, IS_ENTERPRISE) 
    VALUES ('admin', 'admin123', '관리자', '에듀테크소프트랩', 'admin', 0)
  `);

  // Seed default companies
  const defaultRegistry = [
    { name: "엔트리봇 코딩 마스터 AI v2.0", company: "에듀크리에이티브 주식회사" },
    { name: "클래스팅 AI", company: "클래스팅" },
    { name: "홈런 초등 AI", company: "아이스크림에듀" },
    { name: "엘리하이 초등", company: "메가스터디교육" },
    { name: "똑똑 수학탐험대", company: "교육부 / 한국교육학술정보원" },
    { name: "리딩앤", company: "아이포트폴리오" },
    { name: "호두잉글리시", company: "호두랩스" },
    { name: "스마트올 초등", company: "웅진씽크빅" },
    { name: "AI 나누미", company: "(주)인텔리콘연구소" },
    { name: "AI 헬피챗", company: "(주)엘리스그룹" },
    { name: "꾸럼e", company: "(주)추론" },
    { name: "스픽마스터", company: "(주)에듀템" },
    { name: "알콩", company: "(주)AI DATA" },
    { name: "클래스사티", company: "태그하이브" },
    { name: "클래시파이", company: "클래시파이랩스" },
    { name: "투닝", company: "(주)툰스퀘어" }
  ];

  for (const item of defaultRegistry) {
    await conn.execute(`
      INSERT INTO SOFTLAP_USERS (EMAIL, PASSWORD, NAME, SCHOOL, ROLE, IS_ENTERPRISE) 
      VALUES (:email, '1234', :name, :school, 'enterprise', 1)
    `, {
      email: item.name,
      name: item.name,
      school: item.company
    });
  }
  await conn.commit();
  console.log("🌱 [DB] 오라클 DB에 관리자 및 기본 기업 로그인 계정 Seeding 완료!");
}

// ==================== LOCAL FILE DB SYSTEM (FALLBACK) ====================
function readLocalDb() {
  if (!fs.existsSync(DB_FILE)) {
    const initialDb = { users: {}, projects: {}, submitted: [], registry: [] };
    
    // Seed locally
    initialDb.users["admin"] = { password: "admin123", name: "관리자", school: "에듀테크소프트랩", role: "admin", isAdmin: true };
    const defaultRegistry = [
      { name: "엔트리봇 코딩 마스터 AI v2.0", company: "에듀크리에이티브 주식회사" },
      { name: "클래스팅 AI", company: "클래스팅" },
      { name: "홈런 초등 AI", company: "아이스크림에듀" },
      { name: "엘리하이 초등", company: "메가스터디교육" },
      { name: "똑똑 수학탐험대", company: "교육부 / 한국교육학술정보원" },
      { name: "리딩앤", company: "아이포트폴리오" },
      { name: "호두잉글리시", company: "호두랩스" },
      { name: "스마트올 초등", company: "웅진씽크빅" },
      { name: "AI 나누미", company: "(주)인텔리콘연구소" },
      { name: "AI 헬피챗", company: "(주)엘리스그룹" },
      { name: "꾸럼e", company: "(주)추론" },
      { name: "스픽마스터", company: "(주)에듀템" },
      { name: "알콩", company: "(주)AI DATA" },
      { name: "클래스사티", company: "태그하이브" },
      { name: "클래시파이", company: "클래시파이랩스" },
      { name: "투닝", company: "(주)툰스퀘어" }
    ];
    initialDb.registry = defaultRegistry;
    defaultRegistry.forEach(item => {
      initialDb.users[item.name] = { password: "1234", name: item.name, school: item.company, role: "enterprise", isEnterprise: true };
    });
    
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf8');
    return initialDb;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    return { users: {}, projects: {}, submitted: [], registry: [] };
  }
}

function writeLocalDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

// ==================== REST API ENDPOINTS (DUAL SYSTEM) ====================

// A. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', engine: useOracle ? 'Oracle Cloud DB' : 'Local JSON File', time: new Date() });
});

// B. Auth API
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name, school, role } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: "필수 정보가 누락되었습니다." });
  }

  const lowerEmail = email.toLowerCase();
  const isEnt = role === "enterprise" ? 1 : 0;

  if (useOracle) {
    let conn;
    try {
      conn = await pool.getConnection();
      
      // Check exists
      const check = await conn.execute(`SELECT EMAIL FROM SOFTLAP_USERS WHERE LOWER(EMAIL) = :email`, [lowerEmail]);
      if (check.rows.length > 0 || lowerEmail === "admin") {
        return res.status(400).json({ error: "이미 가입되어 있는 계정입니다." });
      }

      await conn.execute(`
        INSERT INTO SOFTLAP_USERS (EMAIL, PASSWORD, NAME, SCHOOL, ROLE, IS_ENTERPRISE)
        VALUES (:email, :password, :name, :school, :role, :is_ent)
      `, [lowerEmail, password, name, school || "", role || "teacher", isEnt]);
      
      await conn.commit();
      res.json({ success: true, user: { email: lowerEmail, name, school, role } });
    } catch (err) {
      res.status(500).json({ error: "DB 처리 오류: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    // Fallback Local JSON DB
    const dbData = readLocalDb();
    if (dbData.users[lowerEmail] || lowerEmail === "admin") {
      return res.status(400).json({ error: "이미 가입되어 있는 계정입니다." });
    }
    dbData.users[lowerEmail] = { password, name, school: school || "", role: role || "teacher", isEnterprise: role === "enterprise" };
    writeLocalDb(dbData);
    res.json({ success: true, user: { email: lowerEmail, name, school, role } });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "아이디와 비밀번호를 모두 입력해 주십시오." });
  }

  const lowerEmail = email.toLowerCase();

  if (useOracle) {
    let conn;
    try {
      conn = await pool.getConnection();
      // Match direct and lower
      const result = await conn.execute(
        `SELECT EMAIL, PASSWORD, NAME, SCHOOL, ROLE, IS_ENTERPRISE FROM SOFTLAP_USERS WHERE LOWER(EMAIL) = :email OR EMAIL = :raw_email`,
        [lowerEmail, email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
      }

      const user = result.rows[0];
      if (user.PASSWORD !== password) {
        return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
      }

      res.json({
        success: true,
        user: {
          email: user.EMAIL,
          name: user.NAME,
          school: user.SCHOOL || "",
          team: user.SCHOOL || "",
          role: user.ROLE || (user.IS_ENTERPRISE === 1 ? "enterprise" : "teacher"),
          isEnterprise: user.IS_ENTERPRISE === 1 || user.ROLE === "enterprise",
          isAdmin: user.ROLE === "admin"
        }
      });
    } catch (err) {
      res.status(500).json({ error: "DB 로그인 오류: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    // Local JSON
    const dbData = readLocalDb();
    const user = dbData.users[lowerEmail] || dbData.users[email];
    if (!user || user.password !== password) {
      return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
    }
    res.json({
      success: true,
      user: {
        email: email,
        name: user.name,
        school: user.school || "",
        team: user.school || "",
        role: user.role || (user.isEnterprise ? "enterprise" : "teacher"),
        isEnterprise: user.isEnterprise || user.role === "enterprise",
        isAdmin: user.isAdmin || user.role === "admin"
      }
    });
  }
});

app.post('/api/auth/change-password', async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) {
    return res.status(400).json({ error: "정보가 누락되었습니다." });
  }

  if (useOracle) {
    let conn;
    try {
      conn = await pool.getConnection();
      const check = await conn.execute(`SELECT EMAIL FROM SOFTLAP_USERS WHERE EMAIL = :email OR LOWER(EMAIL) = :lower`, [email, email.toLowerCase()]);
      if (check.rows.length === 0) {
        return res.status(404).json({ error: "해당 사용자를 찾을 수 없습니다." });
      }
      const actualEmail = check.rows[0].EMAIL;
      await conn.execute(`UPDATE SOFTLAP_USERS SET PASSWORD = :pwd WHERE EMAIL = :email`, [newPassword, actualEmail]);
      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "DB 비밀번호 변경 오류: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    const dbData = readLocalDb();
    const user = dbData.users[email] || dbData.users[email.toLowerCase()];
    if (!user) return res.status(404).json({ error: "해당 사용자를 찾을 수 없습니다." });
    user.password = newPassword;
    writeLocalDb(dbData);
    res.json({ success: true });
  }
});

// C. Project CRUD API
app.get('/api/projects', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "이메일이 누락되었습니다." });

  const lowerEmail = email.toLowerCase();

  if (useOracle) {
    let conn;
    try {
      conn = await pool.getConnection();
      const result = await conn.execute(
        `SELECT PROJECT_DATA FROM SOFTLAP_PROJECTS WHERE LOWER(EMAIL) = :email OR EMAIL = :raw_email`,
        [lowerEmail, email]
      );
      
      const projects = [];
      for (const row of result.rows) {
        try {
          // Read LOB data
          let clobData = "";
          if (row.PROJECT_DATA) {
            clobData = await row.PROJECT_DATA.getData();
          }
          projects.push(JSON.parse(clobData));
        } catch(e) {}
      }
      res.json(projects);
    } catch (err) {
      res.status(500).json({ error: "DB 프로젝트 조회 실패: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    const dbData = readLocalDb();
    res.json(dbData.projects[lowerEmail] || dbData.projects[email] || []);
  }
});

app.post('/api/projects', async (req, res) => {
  const { email, projects } = req.body;
  if (!email || !Array.isArray(projects)) {
    return res.status(400).json({ error: "데이터 형식이 올바르지 않습니다." });
  }

  const lowerEmail = email.toLowerCase();

  if (useOracle) {
    let conn;
    try {
      conn = await pool.getConnection();
      
      // Delete old projects for this user
      await conn.execute(`DELETE FROM SOFTLAP_PROJECTS WHERE LOWER(EMAIL) = :email OR EMAIL = :raw_email`, [lowerEmail, email]);
      
      // Insert new projects one by one
      for (const proj of projects) {
        await conn.execute(
          `INSERT INTO SOFTLAP_PROJECTS (EMAIL, PROJECT_ID, PROJECT_DATA) VALUES (:email, :proj_id, :proj_data)`,
          [lowerEmail, proj.id, JSON.stringify(proj)]
        );
      }
      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "DB 프로젝트 저장 실패: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    const dbData = readLocalDb();
    dbData.projects[lowerEmail] = projects;
    writeLocalDb(dbData);
    res.json({ success: true });
  }
});

// D. Edutech Registry API
app.get('/api/registry', async (req, res) => {
  if (useOracle) {
    let conn;
    try {
      conn = await pool.getConnection();
      const result = await conn.execute(`SELECT NAME, COMPANY FROM SOFTLAP_REGISTRY`);
      const list = result.rows.map(row => ({ name: row.NAME, company: row.COMPANY }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: "DB 레지스트리 조회 실패: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    const dbData = readLocalDb();
    res.json(dbData.registry || []);
  }
});

app.post('/api/registry', async (req, res) => {
  const newRegistry = req.body;
  if (!Array.isArray(newRegistry)) return res.status(400).json({ error: "데이터 에러" });

  if (useOracle) {
    let conn;
    try {
      conn = await pool.getConnection();
      // Reset registry table
      await conn.execute(`DELETE FROM SOFTLAP_REGISTRY`);
      
      for (const item of newRegistry) {
        await conn.execute(
          `INSERT INTO SOFTLAP_REGISTRY (NAME, COMPANY) VALUES (:name, :company)`,
          [item.name, item.company]
        );

        // Seed enterprise account automatically if new
        const lowerName = item.name.toLowerCase();
        const check = await conn.execute(`SELECT EMAIL FROM SOFTLAP_USERS WHERE LOWER(EMAIL) = :email OR EMAIL = :raw`, [lowerName, item.name]);
        if (check.rows.length === 0) {
          await conn.execute(`
            INSERT INTO SOFTLAP_USERS (EMAIL, PASSWORD, NAME, SCHOOL, ROLE, IS_ENTERPRISE) 
            VALUES (:email, '1234', :name, :school, 'enterprise', 1)
          `, [item.name, item.name, item.company]);
        }
      }
      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "DB 레지스트리 업데이트 실패: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    const dbData = readLocalDb();
    dbData.registry = newRegistry;
    newRegistry.forEach(item => {
      if (!dbData.users[item.name]) {
        dbData.users[item.name] = { password: "1234", name: item.name, school: item.company, role: "enterprise", isEnterprise: true };
      }
    });
    writeLocalDb(dbData);
    res.json({ success: true });
  }
});

// E. Enterprise Submissions API
app.get('/api/submitted', async (req, res) => {
  if (useOracle) {
    let conn;
    try {
      conn = await pool.getConnection();
      const result = await conn.execute(`SELECT PROJECT_ID, EMAIL, STATUS, TEACHER_NAME, SCHOOL_NAME, SUBMIT_DATE, PROJECT_DATA, FEEDBACK FROM SOFTLAP_SUBMITTED`);
      
      const submitted = [];
      for (const row of result.rows) {
        try {
          let pData = "";
          let fData = "";
          if (row.PROJECT_DATA) pData = await row.PROJECT_DATA.getData();
          if (row.FEEDBACK) fData = await row.FEEDBACK.getData();

          const baseProj = JSON.parse(pData);
          baseProj.status = row.STATUS;
          baseProj.teacherName = row.TEACHER_NAME;
          baseProj.schoolName = row.SCHOOL_NAME;
          baseProj.submitDate = row.SUBMIT_DATE;
          baseProj.email = row.EMAIL;
          baseProj.feedback = fData || "";

          submitted.push(baseProj);
        } catch(e) {}
      }
      res.json(submitted);
    } catch (err) {
      res.status(500).json({ error: "DB 제출 목록 조회 실패: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    const dbData = readLocalDb();
    res.json(dbData.submitted || []);
  }
});

app.post('/api/submitted', async (req, res) => {
  const { submittedList } = req.body;
  if (!Array.isArray(submittedList)) return res.status(400).json({ error: "데이터 오류" });

  if (useOracle) {
    let conn;
    try {
      conn = await pool.getConnection();
      
      // Wipe old submitted and insert new ones
      await conn.execute(`DELETE FROM SOFTLAP_SUBMITTED`);
      
      for (const item of submittedList) {
        await conn.execute(`
          INSERT INTO SOFTLAP_SUBMITTED (PROJECT_ID, EMAIL, STATUS, TEACHER_NAME, SCHOOL_NAME, SUBMIT_DATE, PROJECT_DATA, FEEDBACK)
          VALUES (:proj_id, :email, :status, :teacher_name, :school_name, :submit_date, :proj_data, :feedback)
        `, {
          proj_id: item.id,
          email: item.email || "anonymous",
          status: item.status || "피드백 대기",
          teacher_name: item.teacherName || "",
          school_name: item.schoolName || "",
          submit_date: item.submitDate || "",
          proj_data: JSON.stringify(item),
          feedback: item.feedback || ""
        });
      }
      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "DB 제출 등록 실패: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    const dbData = readLocalDb();
    dbData.submitted = submittedList;
    writeLocalDb(dbData);
    res.json({ success: true });
  }
});

app.post('/api/feedback', async (req, res) => {
  const { projectId, feedbackContent } = req.body;
  if (!projectId || !feedbackContent) return res.status(400).json({ error: "피드백 정보 누락" });

  if (useOracle) {
    let conn;
    try {
      conn = await pool.getConnection();
      
      // 1. Get submission
      const check = await conn.execute(`SELECT EMAIL, PROJECT_DATA FROM SOFTLAP_SUBMITTED WHERE PROJECT_ID = :id`, [projectId]);
      if (check.rows.length === 0) return res.status(404).json({ error: "제출물을 찾을 수 없습니다." });

      const email = check.rows[0].EMAIL;
      let pData = "";
      if (check.rows[0].PROJECT_DATA) pData = await check.rows[0].PROJECT_DATA.getData();

      // 2. Update Submission Feedback
      await conn.execute(
        `UPDATE SOFTLAP_SUBMITTED SET STATUS = '피드백 완료', FEEDBACK = :feedback WHERE PROJECT_ID = :id`,
        [feedbackContent, projectId]
      );

      // 3. Sync into User Projects
      const lowerEmail = email ? email.toLowerCase() : "";
      if (lowerEmail && pData) {
        const userProjectsResult = await conn.execute(
          `SELECT PROJECT_DATA FROM SOFTLAP_PROJECTS WHERE PROJECT_ID = :proj_id AND LOWER(EMAIL) = :email`,
          [projectId, lowerEmail]
        );

        if (userProjectsResult.rows.length > 0) {
          let oldProjData = "";
          if (userProjectsResult.rows[0].PROJECT_DATA) {
            oldProjData = await userProjectsResult.rows[0].PROJECT_DATA.getData();
          }
          if (oldProjData) {
            const oldProjObj = JSON.parse(oldProjData);
            oldProjObj.status = "피드백 완료";
            oldProjObj.feedback = feedbackContent;

            await conn.execute(
              `UPDATE SOFTLAP_PROJECTS SET PROJECT_DATA = :data WHERE PROJECT_ID = :proj_id AND LOWER(EMAIL) = :email`,
              [JSON.stringify(oldProjObj), projectId, lowerEmail]
            );
          }
        }
      }
      
      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "DB 피드백 반영 실패: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    // Local JSON
    const dbData = readLocalDb();
    const item = dbData.submitted.find(p => p.id === projectId);
    if (!item) return res.status(404).json({ error: "제출 내역 없음" });

    item.feedback = feedbackContent;
    item.status = "피드백 완료";
    
    const teacherEmail = item.email ? item.email.toLowerCase() : "";
    if (teacherEmail && dbData.projects[teacherEmail]) {
      const proj = dbData.projects[teacherEmail].find(p => p.id === projectId);
      if (proj) {
        proj.status = "피드백 완료";
        proj.feedback = feedbackContent;
      }
    }
    writeLocalDb(dbData);
    res.json({ success: true });
  }
});

// F. Admin Dashboard API
app.get('/api/admin/users', async (req, res) => {
  if (useOracle) {
    let conn;
    try {
      conn = await pool.getConnection();
      const result = await conn.execute(`SELECT EMAIL, PASSWORD, NAME, SCHOOL, ROLE, IS_ENTERPRISE FROM SOFTLAP_USERS`);
      
      // Query project counts per user
      const countsResult = await conn.execute(`SELECT EMAIL, COUNT(*) AS CNT FROM SOFTLAP_PROJECTS GROUP BY EMAIL`);
      const projectCounts = {};
      countsResult.rows.forEach(r => {
        if (r.EMAIL) projectCounts[r.EMAIL.toLowerCase()] = r.CNT;
      });

      const usersList = {};
      result.rows.forEach(row => {
        const lowerEmail = row.EMAIL.toLowerCase();
        usersList[row.EMAIL] = {
          password: row.PASSWORD,
          name: row.NAME,
          school: row.SCHOOL || "",
          team: row.SCHOOL || "",
          role: row.ROLE || (row.IS_ENTERPRISE === 1 ? "enterprise" : "teacher"),
          isEnterprise: row.IS_ENTERPRISE === 1 || row.ROLE === "enterprise",
          isAdmin: row.ROLE === "admin",
          projectCount: projectCounts[lowerEmail] || 0
        };
      });
      res.json(usersList);
    } catch (err) {
      res.status(500).json({ error: "DB 관리 사용자 목록 조회 실패: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    const dbData = readLocalDb();
    const usersList = {};
    Object.keys(dbData.users).forEach(key => {
      const u = dbData.users[key];
      const lowerKey = key.toLowerCase();
      usersList[key] = {
        password: u.password,
        name: u.name,
        school: u.school || "",
        team: u.school || "",
        role: u.role || (u.isEnterprise ? "enterprise" : "teacher"),
        isEnterprise: u.isEnterprise || u.role === "enterprise",
        isAdmin: u.isAdmin || u.role === "admin",
        projectCount: (dbData.projects[lowerKey] || dbData.projects[key] || []).length
      };
    });
    res.json(usersList);
  }
});

app.post('/api/admin/change-password', async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) return res.status(400).json({ error: "누락" });

  if (useOracle) {
    let conn;
    try {
      conn = await pool.getConnection();
      const check = await conn.execute(`SELECT EMAIL FROM SOFTLAP_USERS WHERE EMAIL = :email OR LOWER(EMAIL) = :lower`, [email, email.toLowerCase()]);
      if (check.rows.length === 0) return res.status(404).json({ error: "유저 없음" });

      const actualEmail = check.rows[0].EMAIL;
      await conn.execute(`UPDATE SOFTLAP_USERS SET PASSWORD = :pwd WHERE EMAIL = :email`, [newPassword, actualEmail]);
      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "DB 비밀번호 강제변경 실패: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    const dbData = readLocalDb();
    const user = dbData.users[email] || dbData.users[email.toLowerCase()];
    if (!user) return res.status(404).json({ error: "유저 없음" });
    user.password = newPassword;
    writeLocalDb(dbData);
    res.json({ success: true });
  }
});

app.delete('/api/admin/users/:email', async (req, res) => {
  const email = req.params.email;
  if (!email) return res.status(400).json({ error: "누락" });

  if (useOracle) {
    let conn;
    try {
      conn = await pool.getConnection();
      const check = await conn.execute(`SELECT EMAIL FROM SOFTLAP_USERS WHERE EMAIL = :email OR LOWER(EMAIL) = :lower`, [email, email.toLowerCase()]);
      if (check.rows.length === 0) return res.status(404).json({ error: "유저 없음" });

      const actualEmail = check.rows[0].EMAIL;
      await conn.execute(`DELETE FROM SOFTLAP_USERS WHERE EMAIL = :email`, [actualEmail]);
      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "DB 회원 강제삭제 실패: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    const dbData = readLocalDb();
    const lowerEmail = email.toLowerCase();
    if (dbData.users[lowerEmail]) delete dbData.users[lowerEmail];
    else if (dbData.users[email]) delete dbData.users[email];
    else return res.status(404).json({ error: "유저 없음" });
    writeLocalDb(dbData);
    res.json({ success: true });
  }
});

// CATCH-ALL: SPA Router Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server & Init DB
app.listen(PORT, async () => {
  console.log(`==================================================`);
  console.log(`🚀 Seoul Edutech Softlap Central API Server Active!`);
  console.log(`🔊 Listening at: http://localhost:${PORT}`);
  await initOracleDatabase();
  console.log(`==================================================`);
});
