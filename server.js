const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // 강력한 단방향 암호화를 위해 Node.js 내장 crypto 라이브러리 추가
const fsPromises = fs.promises; // 로컬 DB 파일 비동기 I/O 처리를 위한 fs.promises 선언
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

// Serve static frontend files from current directory with HTML caching disabled
app.use(express.static(__dirname, {
  setHeaders: function (res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// ==================== SECURITY & CRYPTOGRAPHY (암호화 모듈) ====================

/**
 * 비밀번호를 단방향 PBKDF2 방식으로 안전하게 해싱하여 저장합니다.
 * @param {string} password 평문 비밀번호
 * @returns {string} salt와 해시값이 콜론(:)으로 결합된 암호화 텍스트
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * 입력된 평문 비밀번호와 DB에 저장된 솔트+해시 비밀번호가 일치하는지 검증합니다.
 * 기존에 가입된 사용자의 평문 비밀번호 마이그레이션을 위한 호환 처리도 내장되어 있습니다.
 * @param {string} password 검증할 평문 비밀번호
 * @param {string} storedPassword DB에 저장된 비밀번호 (솔트:해시 형태 또는 평문)
 * @returns {boolean} 비밀번호 일치 여부
 */
function verifyPassword(password, storedPassword) {
  if (!storedPassword) return false;
  
  // 마이그레이션 호환성 지원: DB 내 비밀번호가 솔트(:) 구분 기호가 없으면 평문 계정으로 간주하여 직접 비교
  if (!storedPassword.includes(':')) {
    return password === storedPassword;
  }
  
  const [salt, hash] = storedPassword.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

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
    
    pool = await oracledb.createPool({
      user: dbConfig.user,
      password: dbConfig.password,
      connectString: dbConfig.connectString,
      poolMin: 1,
      poolMax: 5,
      poolIncrement: 1
    });

    useOracle = true;
    console.log("🎉 오라클 클라우드 Autonomous DB 커넥션 풀 생성 성공!");

    // Create Tables if not exist
    await createOracleTables();
  } catch (err) {
    console.error("❌ 오라클 클라우드 DB 연결 실패:", err.message);
    console.log("⚠️ 로컬 파일 데이터베이스(db.json)로 대체하여 안전하게 시동합니다.");
  }
}

// ==================== ORACLE CONNECTION RETRY HELPER (커넥션 재시도) ====================

/**
 * 일시적인 네트워크 끊김이나 커넥션 대기에 대응하기 위해 지수 백오프 기반으로 커넥션 획득을 재시도합니다.
 * @param {number} retries 최대 재시도 횟수 (기본 3회)
 * @param {number} delay 첫 지연 시간 (기본 1000ms)
 * @returns {Promise<oracledb.Connection>} Oracle Connection 객체
 */
async function getConnectionWithRetry(retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      if (!pool) {
        throw new Error("Oracle connection pool이 초기화되지 않았습니다.");
      }
      return await pool.getConnection();
    } catch (err) {
      if (i === retries - 1) throw err;
      const currentDelay = delay * Math.pow(2, i);
      console.warn(`⚠️ Oracle DB 커넥션 획득 실패. ${currentDelay}ms 후 재시도합니다... (시도 ${i + 1}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, currentDelay));
    }
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
          TEAM VARCHAR2(200),
          ROLE VARCHAR2(50) DEFAULT 'teacher',
          IS_ENTERPRISE NUMBER(1) DEFAULT 0
        )
      `);
      console.log("📊 [DB] SOFTLAP_USERS 테이블 신규 생성 완료!");
      
      // Seed default accounts in Oracle
      await seedDefaultOracleAccounts(conn);
    } catch (e) {
      if (e.message.indexOf("ORA-00955") === -1) throw e; // ORA-00955: table already exists
      
      // ALTER TABLE to ensure TEAM column exists
      try {
        await conn.execute(`ALTER TABLE SOFTLAP_USERS ADD (TEAM VARCHAR2(200))`);
        console.log("📊 [DB] SOFTLAP_USERS 테이블에 TEAM 컬럼 추가 완료!");
      } catch (alterError) {
        if (alterError.message.indexOf("ORA-01430") === -1) {
          console.error("TEAM 컬럼 추가 실패:", alterError);
        }
      }
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

    // 5. Index for Projects Table (PROJECT_ID 검색 최적화)
    try {
      await conn.execute(`CREATE INDEX IDX_PROJECTS_ID ON SOFTLAP_PROJECTS(PROJECT_ID)`);
      console.log("📊 [DB] IDX_PROJECTS_ID 인덱스 생성 완료!");
    } catch (e) {
      if (e.message.indexOf("ORA-00955") === -1 && e.message.indexOf("ORA-01408") === -1) {
        console.error("IDX_PROJECTS_ID 인덱스 생성 오류:", e);
      }
    }

    // 6. Index for Submitted Table (EMAIL 검색 최적화)
    try {
      await conn.execute(`CREATE INDEX IDX_SUBMITTED_EMAIL ON SOFTLAP_SUBMITTED(EMAIL)`);
      console.log("📊 [DB] IDX_SUBMITTED_EMAIL 인덱스 생성 완료!");
    } catch (e) {
      if (e.message.indexOf("ORA-00955") === -1 && e.message.indexOf("ORA-01408") === -1) {
        console.error("IDX_SUBMITTED_EMAIL 인덱스 생성 오류:", e);
      }
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
  // Seed admin (비밀번호 단방향 해싱 후 인서트)
  const hashedAdminPw = hashPassword('admin123');
  await conn.execute(`
    INSERT INTO SOFTLAP_USERS (EMAIL, PASSWORD, NAME, SCHOOL, TEAM, ROLE, IS_ENTERPRISE) 
    VALUES ('admin', :pwd, '관리자', '에듀테크소프트랩', '에듀테크소프트랩', 'admin', 0)
  `, [hashedAdminPw]);

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

  const hashedCompanyPw = hashPassword('1234');
  for (const item of defaultRegistry) {
    await conn.execute(`
      INSERT INTO SOFTLAP_USERS (EMAIL, PASSWORD, NAME, SCHOOL, TEAM, ROLE, IS_ENTERPRISE) 
      VALUES (:email, :password, :name, :school, :team, 'enterprise', 1)
    `, {
      email: item.name,
      password: hashedCompanyPw,
      name: item.name,
      school: item.company,
      team: item.company
    });
  }
  await conn.commit();
  console.log("🌱 [DB] 오라클 DB에 관리자 및 기본 기업 로그인 계정 Seeding 완료!");
}

// ==================== LOCAL FILE DB SYSTEM (FALLBACK - ASYNC) ====================

/**
 * 로컬 JSON DB(db.json) 파일을 비동기적으로 안전하게 조회합니다.
 * 파일이 없는 경우, 초기 데이터를 빌드하고 관리자 및 기본 가입 계정들의 비밀번호를 암호화하여 Seeding합니다.
 * @returns {Promise<object>} 데이터베이스 객체
 */
async function readLocalDbAsync() {
  if (!fs.existsSync(DB_FILE)) {
    const initialDb = { users: {}, projects: {}, submitted: [], registry: [] };
    
    // Seed locally (관리자 비밀번호 해싱 적용)
    initialDb.users["admin"] = { password: hashPassword("admin123"), name: "관리자", school: "에듀테크소프트랩", role: "admin", isAdmin: true };
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
      initialDb.users[item.name] = { password: hashPassword("1234"), name: item.name, school: item.company, role: "enterprise", isEnterprise: true };
    });
    
    await fsPromises.writeFile(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf8');
    return initialDb;
  }
  try {
    const data = await fsPromises.readFile(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return { users: {}, projects: {}, submitted: [], registry: [] };
  }
}

/**
 * 로컬 JSON DB(db.json) 파일을 비동기적 원자 쓰기(Atomic Write) 기법으로 저장합니다.
 * 임시 임시파일(.tmp)에 비동기로 우선 쓰고 완료된 후 rename함으로써 동시 요청 시의 파일 손상을 방지합니다.
 * @param {object} data 쓸 데이터 객체
 */
async function writeLocalDbAsync(data) {
  const tempFile = DB_FILE + '.tmp';
  try {
    await fsPromises.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf8');
    await fsPromises.rename(tempFile, DB_FILE);
  } catch (e) {
    console.error("❌ 로컬 JSON DB 비동기 쓰기 오류:", e);
  }
}

// ==================== REST API ENDPOINTS (DUAL SYSTEM) ====================

// A. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', engine: useOracle ? 'Oracle Cloud DB' : 'Local JSON File', time: new Date() });
});

// B. Auth API
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name, school, team, role } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: "필수 정보가 누락되었습니다." });
  }

  const lowerEmail = email.toLowerCase();
  const isEnt = role === "enterprise" ? 1 : 0;
  const hashedPw = hashPassword(password); // 가입 비밀번호 단방향 암호화

  if (useOracle) {
    let conn;
    try {
      conn = await getConnectionWithRetry(); // 커넥션 재시도 헬퍼 사용
      
      // Check exists
      const check = await conn.execute(`SELECT EMAIL FROM SOFTLAP_USERS WHERE LOWER(EMAIL) = :email`, [lowerEmail]);
      if (check.rows.length > 0 || lowerEmail === "admin") {
        return res.status(400).json({ error: "이미 가입되어 있는 계정입니다." });
      }

      await conn.execute(`
        INSERT INTO SOFTLAP_USERS (EMAIL, PASSWORD, NAME, SCHOOL, TEAM, ROLE, IS_ENTERPRISE)
        VALUES (:email, :password, :name, :school, :team, :role, :is_ent)
      `, [lowerEmail, hashedPw, name, school || "", team || "", role || "teacher", isEnt]);
      
      await conn.commit();
      res.json({ success: true, user: { email: lowerEmail, name, school, team, role } });
    } catch (err) {
      res.status(500).json({ error: "DB 처리 오류: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    // Fallback Local JSON DB - 비동기 조회 및 저장 처리
    const dbData = await readLocalDbAsync();
    if (dbData.users[lowerEmail] || lowerEmail === "admin") {
      return res.status(400).json({ error: "이미 가입되어 있는 계정입니다." });
    }
    dbData.users[lowerEmail] = { password: hashedPw, name, school: school || "", team: team || "", role: role || "teacher", isEnterprise: role === "enterprise" };
    await writeLocalDbAsync(dbData);
    res.json({ success: true, user: { email: lowerEmail, name, school, team, role } });
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
      conn = await getConnectionWithRetry(); // 커넥션 재시도 헬퍼 사용
      // Match direct and lower
      const result = await conn.execute(
        `SELECT EMAIL, PASSWORD, NAME, SCHOOL, TEAM, ROLE, IS_ENTERPRISE FROM SOFTLAP_USERS WHERE LOWER(EMAIL) = :email OR EMAIL = :raw_email`,
        [lowerEmail, email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
      }

      const user = result.rows[0];
      
      // 암호화된 비밀번호 검증 헬퍼 연동 (하위 평문 계정 로그인도 자동 지원)
      if (!verifyPassword(password, user.PASSWORD)) {
        return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
      }

      res.json({
        success: true,
        user: {
          email: user.EMAIL,
          name: user.NAME,
          school: user.SCHOOL || "",
          team: user.TEAM || user.SCHOOL || "",
          role: user.ROLE || (user.IS_ENTERPRISE === 1 ? "enterprise" : "teacher"),
          isEnterprise: user.IS_ENTERPRISE === 1 || user.ROLE === "enterprise",
          isLeader: user.ROLE === "team_leader",
          isAdmin: user.ROLE === "admin"
        }
      });
    } catch (err) {
      res.status(500).json({ error: "DB 로그인 오류: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    // Local JSON - 비동기 조회 및 검증 연동
    const dbData = await readLocalDbAsync();
    const user = dbData.users[lowerEmail] || dbData.users[email];
    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
    }
    res.json({
      success: true,
      user: {
        email: email,
        name: user.name,
        school: user.school || "",
        team: user.team || user.school || "",
        role: user.role || (user.isEnterprise ? "enterprise" : "teacher"),
        isEnterprise: user.isEnterprise || user.role === "enterprise",
        isLeader: user.role === "team_leader" || user.isLeader === true,
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

  const hashedNewPw = hashPassword(newPassword); // 신규 패스워드 해싱

  if (useOracle) {
    let conn;
    try {
      conn = await getConnectionWithRetry();
      const check = await conn.execute(`SELECT EMAIL FROM SOFTLAP_USERS WHERE EMAIL = :email OR LOWER(EMAIL) = :lower`, [email, email.toLowerCase()]);
      if (check.rows.length === 0) {
        return res.status(404).json({ error: "해당 사용자를 찾을 수 없습니다." });
      }
      const actualEmail = check.rows[0].EMAIL;
      await conn.execute(`UPDATE SOFTLAP_USERS SET PASSWORD = :pwd WHERE EMAIL = :email`, [hashedNewPw, actualEmail]);
      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "DB 비밀번호 변경 오류: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    // Local JSON - 비동기 패스워드 변경
    const dbData = await readLocalDbAsync();
    const user = dbData.users[email] || dbData.users[email.toLowerCase()];
    if (!user) return res.status(404).json({ error: "해당 사용자를 찾을 수 없습니다." });
    user.password = hashedNewPw;
    await writeLocalDbAsync(dbData);
    res.json({ success: true });
  }
});

app.post('/api/auth/update-profile', async (req, res) => {
  const { email, school, team, newPassword } = req.body;
  if (!email) {
    return res.status(400).json({ error: "아이디가 누락되었습니다." });
  }

  const hashedNewPw = newPassword ? hashPassword(newPassword) : null;

  if (useOracle) {
    let conn;
    try {
      conn = await getConnectionWithRetry();
      const check = await conn.execute(`SELECT EMAIL FROM SOFTLAP_USERS WHERE EMAIL = :email OR LOWER(EMAIL) = :lower`, [email, email.toLowerCase()]);
      if (check.rows.length === 0) {
        return res.status(404).json({ error: "해당 사용자를 찾을 수 없습니다." });
      }
      const actualEmail = check.rows[0].EMAIL;
      
      if (hashedNewPw) {
        await conn.execute(
          `UPDATE SOFTLAP_USERS SET SCHOOL = :school, TEAM = :team, PASSWORD = :pwd WHERE EMAIL = :email`,
          [school || "", team || "", hashedNewPw, actualEmail]
        );
      } else {
        await conn.execute(
          `UPDATE SOFTLAP_USERS SET SCHOOL = :school, TEAM = :team WHERE EMAIL = :email`,
          [school || "", team || "", actualEmail]
        );
      }
      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "DB 회원정보 수정 오류: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    // Local JSON - 비동기 회원정보 변경
    const dbData = await readLocalDbAsync();
    const user = dbData.users[email] || dbData.users[email.toLowerCase()];
    if (!user) return res.status(404).json({ error: "해당 사용자를 찾을 수 없습니다." });
    
    user.school = school || "";
    user.team = team || "";
    if (hashedNewPw) {
      user.password = hashedNewPw;
    }
    await writeLocalDbAsync(dbData);
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
      conn = await getConnectionWithRetry();
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
    // Local JSON - 비동기 프로젝트 조회
    const dbData = await readLocalDbAsync();
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
      conn = await getConnectionWithRetry();
      
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
    // Local JSON - 비동기 프로젝트 저장
    const dbData = await readLocalDbAsync();
    dbData.projects[lowerEmail] = projects;
    await writeLocalDbAsync(dbData);
    res.json({ success: true });
  }
});

// D. Edutech Registry API
app.get('/api/registry', async (req, res) => {
  if (useOracle) {
    let conn;
    try {
      conn = await getConnectionWithRetry();
      const result = await conn.execute(`SELECT NAME, COMPANY FROM SOFTLAP_REGISTRY`);
      const list = result.rows.map(row => ({ name: row.NAME, company: row.COMPANY }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: "DB 레지스트리 조회 실패: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    // Local JSON - 비동기 레지스트리 조회
    const dbData = await readLocalDbAsync();
    res.json(dbData.registry || []);
  }
});

app.post('/api/registry', async (req, res) => {
  const newRegistry = req.body;
  if (!Array.isArray(newRegistry)) return res.status(400).json({ error: "데이터 에러" });

  if (useOracle) {
    let conn;
    try {
      conn = await getConnectionWithRetry();
      // Reset registry table
      await conn.execute(`DELETE FROM SOFTLAP_REGISTRY`);
      
      const hashedCompanyPw = hashPassword('1234');
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
            VALUES (:email, :pwd, :name, :school, 'enterprise', 1)
          `, [item.name, hashedCompanyPw, item.name, item.company]);
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
    // Local JSON - 비동기 레지스트리 등록 및 신규 기업 계정 암호화 Seeding
    const dbData = await readLocalDbAsync();
    dbData.registry = newRegistry;
    
    const hashedCompanyPw = hashPassword('1234');
    newRegistry.forEach(item => {
      if (!dbData.users[item.name]) {
        dbData.users[item.name] = { password: hashedCompanyPw, name: item.name, school: item.company, role: "enterprise", isEnterprise: true };
      }
    });
    await writeLocalDbAsync(dbData);
    res.json({ success: true });
  }
});

// E. Enterprise Submissions API
app.get('/api/submitted', async (req, res) => {
  if (useOracle) {
    let conn;
    try {
      conn = await getConnectionWithRetry();
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
          if (fData) {
            try {
              baseProj.feedback = JSON.parse(fData);
            } catch (jsonErr) {
              baseProj.feedback = fData;
            }
          } else {
            baseProj.feedback = "";
          }

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
    // Local JSON - 비동기 제출 목록 조회
    const dbData = await readLocalDbAsync();
    res.json(dbData.submitted || []);
  }
});

app.post('/api/submitted', async (req, res) => {
  const { submittedList } = req.body;
  if (!Array.isArray(submittedList)) return res.status(400).json({ error: "데이터 오류" });

  if (useOracle) {
    let conn;
    try {
      conn = await getConnectionWithRetry();
      
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
          feedback: typeof item.feedback === 'object' ? JSON.stringify(item.feedback) : (item.feedback || "")
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
    // Local JSON - 비동기 제출 등록
    const dbData = await readLocalDbAsync();
    dbData.submitted = submittedList;
    await writeLocalDbAsync(dbData);
    res.json({ success: true });
  }
});

app.post('/api/feedback', async (req, res) => {
  const { projectId, feedbackContent, items } = req.body;
  if (!projectId || !feedbackContent) return res.status(400).json({ error: "피드백 정보 누락" });

  if (useOracle) {
    let conn;
    try {
      conn = await getConnectionWithRetry();
      
      // 1. Get submission
      const check = await conn.execute(`SELECT EMAIL, PROJECT_DATA FROM SOFTLAP_SUBMITTED WHERE PROJECT_ID = :id`, [projectId]);
      if (check.rows.length === 0) return res.status(404).json({ error: "제출물을 찾을 수 없습니다." });

      const email = check.rows[0].EMAIL;
      let pData = "";
      if (check.rows[0].PROJECT_DATA) pData = await check.rows[0].PROJECT_DATA.getData();

      // Update project data with new items and feedback status
      let updatedProjData = "";
      if (pData) {
        try {
          const baseProj = JSON.parse(pData);
          if (items) baseProj.items = items;
          baseProj.status = "피드백 완료";
          baseProj.feedback = feedbackContent;
          updatedProjData = JSON.stringify(baseProj);
        } catch (parseErr) {
          console.error("제출물 프로젝트 JSON 파싱 실패:", parseErr);
        }
      }

      // 2. Update Submission Feedback and PROJECT_DATA
      const feedbackStr = typeof feedbackContent === 'object' ? JSON.stringify(feedbackContent) : feedbackContent;
      if (updatedProjData) {
        await conn.execute(
          `UPDATE SOFTLAP_SUBMITTED SET STATUS = '피드백 완료', FEEDBACK = :feedback, PROJECT_DATA = :proj_data WHERE PROJECT_ID = :id`,
          { feedback: feedbackStr, proj_data: updatedProjData, id: projectId }
        );
      } else {
        await conn.execute(
          `UPDATE SOFTLAP_SUBMITTED SET STATUS = '피드백 완료', FEEDBACK = :feedback WHERE PROJECT_ID = :id`,
          { feedback: feedbackStr, id: projectId }
        );
      }

      // 3. Sync into User Projects
      const lowerEmail = email ? email.toLowerCase() : "";
      if (lowerEmail && updatedProjData) {
        await conn.execute(
          `UPDATE SOFTLAP_PROJECTS SET PROJECT_DATA = :data WHERE PROJECT_ID = :proj_id AND LOWER(EMAIL) = :email`,
          { data: updatedProjData, proj_id: projectId, email: lowerEmail }
        );
      }
      
      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "DB 피드백 반영 실패: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    // Local JSON - 비동기 피드백 반영
    const dbData = await readLocalDbAsync();
    const item = dbData.submitted.find(p => p.id === projectId);
    if (!item) return res.status(404).json({ error: "제출 내역 없음" });

    item.feedback = feedbackContent;
    item.status = "피드백 완료";
    if (items) item.items = items;
    
    const teacherEmail = item.email ? item.email.toLowerCase() : "";
    if (teacherEmail && dbData.projects[teacherEmail]) {
      const proj = dbData.projects[teacherEmail].find(p => p.id === projectId);
      if (proj) {
        proj.status = "피드백 완료";
        proj.feedback = feedbackContent;
        if (items) proj.items = items;
      }
    }
    await writeLocalDbAsync(dbData);
    res.json({ success: true });
  }
});

app.post('/api/feedback/cancel', async (req, res) => {
  const { projectId } = req.body;
  if (!projectId) return res.status(400).json({ error: "프로젝트 ID 누락" });

  if (useOracle) {
    let conn;
    try {
      conn = await getConnectionWithRetry();
      
      const check = await conn.execute(`SELECT EMAIL FROM SOFTLAP_SUBMITTED WHERE PROJECT_ID = :id`, [projectId]);
      if (check.rows.length === 0) return res.status(404).json({ error: "제출물을 찾을 수 없습니다." });

      const email = check.rows[0].EMAIL;

      await conn.execute(
        `UPDATE SOFTLAP_SUBMITTED SET STATUS = '제출완료', FEEDBACK = NULL WHERE PROJECT_ID = :id`,
        [projectId]
      );

      const lowerEmail = email ? email.toLowerCase() : "";
      if (lowerEmail) {
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
            oldProjObj.status = "제출완료";
            delete oldProjObj.feedback;

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
      res.status(500).json({ error: "DB 피드백 취소 실패: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    // Local JSON - 비동기 피드백 취소
    const dbData = await readLocalDbAsync();
    const item = dbData.submitted.find(p => p.id === projectId);
    if (!item) return res.status(404).json({ error: "제출 내역 없음" });

    delete item.feedback;
    item.status = "제출완료";
    
    const teacherEmail = item.email ? item.email.toLowerCase() : "";
    if (teacherEmail && dbData.projects[teacherEmail]) {
      const proj = dbData.projects[teacherEmail].find(p => p.id === projectId);
      if (proj) {
        proj.status = "제출완료";
        delete proj.feedback;
      }
    }
    await writeLocalDbAsync(dbData);
    res.json({ success: true });
  }
});

app.post('/api/feedback/clear-all', async (req, res) => {
  const { companyProduct } = req.body;
  if (!companyProduct) return res.status(400).json({ error: "기업 제품명 누락" });

  const targetCompProduct = companyProduct.trim().toLowerCase().replace(/\s+/g, '');

  if (useOracle) {
    let conn;
    try {
      conn = await getConnectionWithRetry();
      
      const submissionsResult = await conn.execute(`SELECT PROJECT_ID, EMAIL, PROJECT_DATA FROM SOFTLAP_SUBMITTED`);
      const rows = submissionsResult.rows;
      
      let modifiedCount = 0;
      for (const row of rows) {
        let projData = "";
        if (row.PROJECT_DATA) projData = await row.PROJECT_DATA.getData();
        if (projData) {
          const projObj = JSON.parse(projData);
          const pProduct = (projObj.meta?.targetProduct || "").trim().toLowerCase().replace(/\s+/g, '');
          if (pProduct === targetCompProduct) {
            const projectId = row.PROJECT_ID;
            const email = row.EMAIL;

            await conn.execute(
              `UPDATE SOFTLAP_SUBMITTED SET STATUS = '제출완료', FEEDBACK = NULL WHERE PROJECT_ID = :id`,
              [projectId]
            );

            const lowerEmail = email ? email.toLowerCase() : "";
            if (lowerEmail) {
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
                  oldProjObj.status = "제출완료";
                  delete oldProjObj.feedback;

                  await conn.execute(
                    `UPDATE SOFTLAP_PROJECTS SET PROJECT_DATA = :data WHERE PROJECT_ID = :proj_id AND LOWER(EMAIL) = :email`,
                    [JSON.stringify(oldProjObj), projectId, lowerEmail]
                  );
                }
              }
            }
            modifiedCount++;
          }
        }
      }
      
      await conn.commit();
      res.json({ success: true, count: modifiedCount });
    } catch (err) {
      res.status(500).json({ error: "DB 피드백 전체 초기화 실패: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    // Local JSON - 비동기 피드백 전체 초기화
    const dbData = await readLocalDbAsync();
    let modifiedCount = 0;
    
    dbData.submitted.forEach(p => {
      const pProduct = (p.meta?.targetProduct || "").trim().toLowerCase().replace(/\s+/g, '');
      if (pProduct === targetCompProduct) {
        delete p.feedback;
        p.status = "제출완료";

        const teacherEmail = p.email ? p.email.toLowerCase() : "";
        if (teacherEmail && dbData.projects[teacherEmail]) {
          const proj = dbData.projects[teacherEmail].find(projItem => projItem.id === p.id);
          if (proj) {
            proj.status = "제출완료";
            delete proj.feedback;
          }
        }
        modifiedCount++;
      }
    });

    await writeLocalDbAsync(dbData);
    res.json({ success: true, count: modifiedCount });
  }
});

// F. Admin Dashboard API
app.get('/api/admin/users', async (req, res) => {
  if (useOracle) {
    let conn;
    try {
      conn = await getConnectionWithRetry();
      const result = await conn.execute(`SELECT EMAIL, PASSWORD, NAME, SCHOOL, TEAM, ROLE, IS_ENTERPRISE FROM SOFTLAP_USERS`);
      
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
          team: row.TEAM || row.SCHOOL || "",
          role: row.ROLE || (row.IS_ENTERPRISE === 1 ? "enterprise" : "teacher"),
          isEnterprise: row.IS_ENTERPRISE === 1 || row.ROLE === "enterprise",
          isLeader: row.ROLE === "team_leader",
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
    // Local JSON - 비동기 사용자 조회
    const dbData = await readLocalDbAsync();
    const usersList = {};
    Object.keys(dbData.users).forEach(key => {
      const u = dbData.users[key];
      const lowerKey = key.toLowerCase();
      usersList[key] = {
        password: u.password,
        name: u.name,
        school: u.school || "",
        team: u.team || u.school || "",
        role: u.role || (u.isEnterprise ? "enterprise" : "teacher"),
        isEnterprise: u.isEnterprise || u.role === "enterprise",
        isLeader: u.role === "team_leader" || u.isLeader === true,
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

  const hashedNewPw = hashPassword(newPassword); // 새 패스워드 암호화

  if (useOracle) {
    let conn;
    try {
      conn = await getConnectionWithRetry();
      const check = await conn.execute(`SELECT EMAIL FROM SOFTLAP_USERS WHERE EMAIL = :email OR LOWER(EMAIL) = :lower`, [email, email.toLowerCase()]);
      if (check.rows.length === 0) return res.status(404).json({ error: "유저 없음" });

      const actualEmail = check.rows[0].EMAIL;
      await conn.execute(`UPDATE SOFTLAP_USERS SET PASSWORD = :pwd WHERE EMAIL = :email`, [hashedNewPw, actualEmail]);
      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "DB 비밀번호 강제변경 실패: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    // Local JSON - 비동기 관리자 비밀번호 변경
    const dbData = await readLocalDbAsync();
    const user = dbData.users[email] || dbData.users[email.toLowerCase()];
    if (!user) return res.status(404).json({ error: "유저 없음" });
    user.password = hashedNewPw;
    await writeLocalDbAsync(dbData);
    res.json({ success: true });
  }
});

// 관리자 전용: 회원 역할 변경 API
app.post('/api/admin/change-role', async (req, res) => {
  const { email, newRole } = req.body;
  if (!email || !newRole) return res.status(400).json({ error: "이메일 또는 역할 값이 누락되었습니다." });

  const allowedRoles = ["teacher", "team_leader", "enterprise", "admin"];
  if (!allowedRoles.includes(newRole)) {
    return res.status(400).json({ error: "유효하지 않은 역할 값입니다." });
  }

  const isEnt = newRole === "enterprise" ? 1 : 0;

  if (useOracle) {
    let conn;
    try {
      conn = await getConnectionWithRetry();
      const check = await conn.execute(
        `SELECT EMAIL FROM SOFTLAP_USERS WHERE EMAIL = :email OR LOWER(EMAIL) = :lower`,
        [email, email.toLowerCase()]
      );
      if (check.rows.length === 0) return res.status(404).json({ error: "해당 사용자를 찾을 수 없습니다." });

      const actualEmail = check.rows[0].EMAIL;
      await conn.execute(
        `UPDATE SOFTLAP_USERS SET ROLE = :role, IS_ENTERPRISE = :is_ent WHERE EMAIL = :email`,
        [newRole, isEnt, actualEmail]
      );
      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "DB 역할 변경 오류: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    // Local JSON - 비동기 역할 변경
    const dbData = await readLocalDbAsync();
    const user = dbData.users[email] || dbData.users[email.toLowerCase()];
    if (!user) return res.status(404).json({ error: "해당 사용자를 찾을 수 없습니다." });

    user.role = newRole;
    user.isEnterprise = newRole === "enterprise";
    user.isLeader = newRole === "team_leader";
    user.isAdmin = newRole === "admin";
    await writeLocalDbAsync(dbData);
    res.json({ success: true });
  }
});

// 관리자 전용: 회원 실증 팀명 변경 API
app.post('/api/admin/change-team', async (req, res) => {
  const { email, newTeam } = req.body;
  if (!email) return res.status(400).json({ error: "이메일 정보가 누락되었습니다." });

  if (useOracle) {
    let conn;
    try {
      conn = await getConnectionWithRetry();
      const check = await conn.execute(
        `SELECT EMAIL FROM SOFTLAP_USERS WHERE EMAIL = :email OR LOWER(EMAIL) = :lower`,
        [email, email.toLowerCase()]
      );
      if (check.rows.length === 0) return res.status(404).json({ error: "해당 사용자를 찾을 수 없습니다." });

      const actualEmail = check.rows[0].EMAIL;
      await conn.execute(
        `UPDATE SOFTLAP_USERS SET TEAM = :team WHERE EMAIL = :email`,
        [newTeam || "", actualEmail]
      );
      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "DB 팀명 변경 오류: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    // Local JSON - 비동기 팀명 변경
    const dbData = await readLocalDbAsync();
    const user = dbData.users[email] || dbData.users[email.toLowerCase()];
    if (!user) return res.status(404).json({ error: "해당 사용자를 찾을 수 없습니다." });

    user.team = newTeam || "";
    await writeLocalDbAsync(dbData);
    res.json({ success: true });
  }
});

app.delete('/api/admin/users/:email', async (req, res) => {
  const email = req.params.email;
  if (!email) return res.status(400).json({ error: "누락" });

  if (useOracle) {
    let conn;
    try {
      conn = await getConnectionWithRetry();
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
    // Local JSON - 비동기 회원 삭제
    const dbData = await readLocalDbAsync();
    const lowerEmail = email.toLowerCase();
    if (dbData.users[lowerEmail]) delete dbData.users[lowerEmail];
    else if (dbData.users[email]) delete dbData.users[email];
    else return res.status(404).json({ error: "유저 없음" });
    await writeLocalDbAsync(dbData);
    res.json({ success: true });
  }
});

// G. Team Leader APIs

// 팀장 전용: 팀 소속 멤버 조회
app.get('/api/team/members', async (req, res) => {
  const { leaderEmail, teamName } = req.query;
  if (!leaderEmail || !teamName) return res.status(400).json({ error: "팀장 이메일과 팀명이 필요합니다." });

  const teamLower = teamName.trim().toLowerCase();

  if (useOracle) {
    let conn;
    try {
      conn = await getConnectionWithRetry();
      // 팀장 본인 확인
      const leaderCheck = await conn.execute(
        `SELECT ROLE, TEAM FROM SOFTLAP_USERS WHERE LOWER(EMAIL) = :email OR EMAIL = :raw`,
        [leaderEmail.toLowerCase(), leaderEmail]
      );
      if (leaderCheck.rows.length === 0) return res.status(403).json({ error: "팀장 정보를 찾을 수 없습니다." });
      const leader = leaderCheck.rows[0];
      if (leader.ROLE !== 'team_leader' && leader.ROLE !== 'admin') {
        return res.status(403).json({ error: "팀장 또는 관리자만 팀원 목록을 조회할 수 있습니다." });
      }

      // 같은 팀명인 교사 조회 (팀장·기업·관리자 제외)
      const result = await conn.execute(
        `SELECT EMAIL, NAME, SCHOOL, TEAM, ROLE FROM SOFTLAP_USERS
         WHERE LOWER(TEAM) LIKE :teamLike
           AND LOWER(EMAIL) != :leaderLower
           AND ROLE NOT IN ('enterprise', 'admin', 'team_leader')`,
        [`%${teamLower}%`, leaderEmail.toLowerCase()]
      );
      const members = result.rows.map(r => ({
        email: r.EMAIL, name: r.NAME, school: r.SCHOOL || '', team: r.TEAM || '', role: r.ROLE || 'teacher'
      }));
      res.json(members);
    } catch (err) {
      res.status(500).json({ error: "DB 팀원 조회 오류: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    // Local JSON - 비동기 팀원 목록 조회
    const dbData = await readLocalDbAsync();
    // 팀장 권한 확인 - 키로 먼저 찾고, 없으면 email 속성으로 검색
    let leader = dbData.users[leaderEmail] || dbData.users[leaderEmail.toLowerCase()];
    if (!leader) {
      // email 필드로 순회 검색
      leader = Object.values(dbData.users).find(u => 
        (u.email || '').toLowerCase() === leaderEmail.toLowerCase()
      );
    }
    if (!leader || (leader.role !== 'team_leader' && leader.role !== 'admin' && !leader.isLeader && !leader.isAdmin)) {
      return res.status(403).json({ error: "팀장 또는 관리자만 조회할 수 있습니다." });
    }
    
    // 팀명 매칭: 클라이언트에서 받은 teamName + 팀장 DB 객체의 team/school 값 모두 사용
    const leaderTeamFromDb = (leader.team || leader.school || '').trim().toLowerCase();
    const effectiveTeamLower = teamLower || leaderTeamFromDb;

    // 팀원 조회: 팀명 유사 매칭
    const members = Object.entries(dbData.users)
      .filter(([key, user]) => {
        // 팀장 본인 제외 (키 또는 email 속성 기준)
        const userEmail = (user.email || key).toLowerCase();
        if (userEmail === leaderEmail.toLowerCase() || key === leaderEmail) return false;
        // 특수 역할 제외
        if (user.role === 'enterprise' || user.role === 'admin' || user.role === 'team_leader' || user.isEnterprise || user.isAdmin || user.isLeader) return false;
        // 팀명 매칭 - 팀명이 없으면 모두 포함 (관리자 모드)
        if (!effectiveTeamLower) return true;
        const userTeam = (user.team || user.school || '').toLowerCase();
        return userTeam && (userTeam.includes(effectiveTeamLower) || effectiveTeamLower.includes(userTeam));
      })
      .map(([key, user]) => ({ 
        email: user.email || key, 
        name: user.name, 
        school: user.school || '', 
        team: user.team || '', 
        role: user.role || 'teacher' 
      }));
    res.json(members);
  }
});

// 팀장 전용: 팀원 내보내기 (팀 필드를 비워 팀 소속 해제)
app.post('/api/team/kick', async (req, res) => {
  const { leaderEmail, targetEmail } = req.body;
  if (!leaderEmail || !targetEmail) return res.status(400).json({ error: "팀장 이메일과 대상 이메일이 필요합니다." });

  if (useOracle) {
    let conn;
    try {
      conn = await getConnectionWithRetry();
      // 팀장 권한 확인
      const leaderCheck = await conn.execute(
        `SELECT ROLE, TEAM FROM SOFTLAP_USERS WHERE LOWER(EMAIL) = :email OR EMAIL = :raw`,
        [leaderEmail.toLowerCase(), leaderEmail]
      );
      if (leaderCheck.rows.length === 0) return res.status(403).json({ error: "팀장 정보를 찾을 수 없습니다." });
      const leader = leaderCheck.rows[0];
      if (leader.ROLE !== 'team_leader' && leader.ROLE !== 'admin') {
        return res.status(403).json({ error: "팀장 또는 관리자만 팀원을 내보낼 수 있습니다." });
      }

      // 대상 유저의 팀을 빈 값으로 초기화 (소속 해제)
      const targetCheck = await conn.execute(
        `SELECT EMAIL, ROLE FROM SOFTLAP_USERS WHERE LOWER(EMAIL) = :email OR EMAIL = :raw`,
        [targetEmail.toLowerCase(), targetEmail]
      );
      if (targetCheck.rows.length === 0) return res.status(404).json({ error: "대상 사용자를 찾을 수 없습니다." });
      const target = targetCheck.rows[0];
      if (target.ROLE === 'admin' || target.ROLE === 'enterprise' || target.ROLE === 'team_leader') {
        return res.status(400).json({ error: "관리자, 기업, 팀장 계정은 내보낼 수 없습니다." });
      }

      await conn.execute(
        `UPDATE SOFTLAP_USERS SET TEAM = '' WHERE EMAIL = :email`,
        [target.EMAIL]
      );
      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "DB 팀원 내보내기 오류: " + err.message });
    } finally {
      if (conn) await conn.close();
    }
  } else {
    // Local JSON - 비동기 팀원 강퇴
    const dbData = await readLocalDbAsync();
    // 팀장 권한 확인 (키 또는 email 속성)
    let leader = dbData.users[leaderEmail] || dbData.users[leaderEmail.toLowerCase()];
    if (!leader) {
      leader = Object.values(dbData.users).find(u => (u.email || '').toLowerCase() === leaderEmail.toLowerCase());
    }
    if (!leader || (leader.role !== 'team_leader' && leader.role !== 'admin' && !leader.isLeader && !leader.isAdmin)) {
      return res.status(403).json({ error: "팀장 또는 관리자만 내보내기를 할 수 있습니다." });
    }
    // 대상 사용자 찾기 (키 또는 email 속성)
    let targetKey = null;
    let target = dbData.users[targetEmail] || dbData.users[targetEmail.toLowerCase()];
    if (!target) {
      const found = Object.entries(dbData.users).find(([k, u]) => (u.email || '').toLowerCase() === targetEmail.toLowerCase());
      if (found) { targetKey = found[0]; target = found[1]; }
    } else {
      targetKey = targetEmail;
    }
    if (!target) return res.status(404).json({ error: "대상 사용자를 찾을 수 없습니다." });
    if (target.role === 'admin' || target.role === 'enterprise' || target.role === 'team_leader' || target.isAdmin || target.isEnterprise || target.isLeader) {
      return res.status(400).json({ error: "관리자, 기업, 팀장 계정은 내보낼 수 없습니다." });
    }
    target.team = '';
    await writeLocalDbAsync(dbData);
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
