const fs = require('fs');
const path = require('path');

console.log("==================================================");
console.log("🔍 [SOFTLAP] 오라클 클라우드 DB 연결 자가진단 유틸리티");
console.log("==================================================");

let oracledb;
try {
  oracledb = require('oracledb');
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  console.log("🟢 'oracledb' 드라이버 로드 성공 (Thin Mode 활성)");
} catch (e) {
  console.error("❌ 'oracledb' 드라이버를 로드할 수 없습니다.");
  console.error("👉 해결책: 터미널에서 'npm install oracledb'를 실행해 주십시오.");
  process.exit(1);
}

const CONFIG_FILE = path.join(__dirname, 'oracle-config.json');

if (!fs.existsSync(CONFIG_FILE)) {
  console.error("❌ 'oracle-config.json' 파일이 존재하지 않습니다.");
  console.log("👉 해결책: 백엔드 서버('npm start')를 최소 1회 실행하여 템플릿 파일을 생성해 주십시오.");
  process.exit(1);
}

let dbConfig;
try {
  dbConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  console.log("🟢 'oracle-config.json' 설정 파일을 성공적으로 불러왔습니다.");
} catch (e) {
  console.error("❌ 설정 파일의 JSON 형식이 올바르지 않습니다.");
  process.exit(1);
}

if (!dbConfig.enabled) {
  console.log("⚠️ [주의] 현재 설정 상 오라클 연동이 비활성화('enabled': false) 상태입니다.");
  console.log("👉 실제 연동 테스트를 위해 'oracle-config.json'의 'enabled' 값을 true로 변경해 주십시오.");
}

console.log(`📡 연결 대상 유저: ${dbConfig.user}`);
console.log(`📡 커넥션 주소: ${dbConfig.connectString.substring(0, 100)}...`);

async function runDiagnostics() {
  let conn;
  try {
    console.log("\n⚡ 오라클 클라우드 Autonomous DB에 연결을 시도하는 중... (10~15초 소요될 수 있음)");
    
    conn = await oracledb.getConnection({
      user: dbConfig.user,
      password: dbConfig.password,
      connectString: dbConfig.connectString
    });

    console.log("🎉 [성공] 오라클 클라우드 DB 연결에 완벽히 성공하였습니다!");
    console.log("==================================================");

    // Test query 1
    const timeResult = await conn.execute("SELECT TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS') AS CURR_TIME FROM DUAL");
    console.log(`⏰ DB 현재 서버 시간: ${timeResult.rows[0].CURR_TIME}`);

    // Test query 2: Check softlap tables
    console.log("\n📊 생성된 테이블 목록 조회 및 스키마 검증:");
    const tablesResult = await conn.execute(`
      SELECT TABLE_NAME 
      FROM USER_TABLES 
      WHERE TABLE_NAME IN ('SOFTLAP_USERS', 'SOFTLAP_PROJECTS', 'SOFTLAP_SUBMITTED', 'SOFTLAP_REGISTRY')
    `);

    const tables = tablesResult.rows.map(r => r.TABLE_NAME);
    const expected = ['SOFTLAP_USERS', 'SOFTLAP_PROJECTS', 'SOFTLAP_SUBMITTED', 'SOFTLAP_REGISTRY'];
    
    expected.forEach(t => {
      if (tables.includes(t)) {
        console.log(`  🟢 ${t} : 온라인 확인됨 (정상)`);
      } else {
        console.log(`  🔴 ${t} : 존재하지 않음 (백엔드 서버 최초 시동 시 자동 생성 예정)`);
      }
    });

    console.log("\n👍 검증 결과: 오라클 자율운영 DB와의 통신에 이상이 없습니다. 서비스를 기동해도 안전합니다.");

  } catch (err) {
    console.error("\n❌ [실패] 오라클 클라우드 DB 접속 실패!");
    console.error("--------------------------------------------------");
    console.error(`에러 내용: ${err.message}`);
    console.error("--------------------------------------------------");
    console.log("\n💡 자가진단 및 조치 가이드:");
    if (err.message.includes("ORA-12170") || err.message.includes("ETIMEDOUT")) {
      console.log("  1. 인터넷 회선 연결 상태를 점검해 주십시오.");
      console.log("  2. OCI 콘솔의 Autonomous DB 네트워크 액세스 설정이 '모든 곳에서 보안 액세스 허용'으로 되어 있는지 확인하십시오.");
    } else if (err.message.includes("ORA-01017")) {
      console.log("  1. 패스워드가 다릅니다. 'oracle-config.json'의 'password'가 올바른지 확인해 주십시오.");
      console.log("  2. OCI ADMIN 비밀번호는 대소문자 구분이 엄격합니다.");
    } else if (err.message.includes("ORA-12541") || err.message.includes("ORA-12506")) {
      console.log("  1. 'connectString' 포트 번호(1522) 및 호스트 주소가 올바른지 복사 상태를 체크해 주십시오.");
      console.log("  2. TLS 연결 설정을 선택하셨는지 점검하십시오.");
    } else {
      console.log("  1. 'oracle-config.json' 내의 유저명, 패스워드, 연결 문자열 오탈자를 확인하십시오.");
      console.log("  2. Node.js 버전 호환성을 체크해 주십시오.");
    }
  } finally {
    if (conn) {
      try {
        await conn.close();
        console.log("\n🔒 DB 커넥션 풀을 안전하게 해제하였습니다.");
      } catch (e) {}
    }
    console.log("==================================================");
  }
}

runDiagnostics();
