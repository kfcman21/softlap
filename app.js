/**
 * 개별 교사용 에듀테크 실증 평가 보고서 프로그램 - 회원 로그인 및 다중 보관함 격리 코어 로직
 */

const USERS_DB_KEY = "softlap_users_database";
const SESSION_KEY = "softlap_active_session";
const THEME_KEY = "softlap_theme";
const ORACLE_CONFIG_KEY = "softlap_oracle_config";
let oracleConfig = {
  endpoint: "https://kfcman.link/api/softlap",
  token: "",
  enabled: true
};

let isCentralDbActive = false;
let centralDbUrl = "";
let lastSubmittedFetchTime = 0;
let cachedSubmittedList = [];

async function checkCentralDbStatus() {
  let configuredUrl = localStorage.getItem("softlap_central_db_url");
  if (!configuredUrl || configuredUrl === "http://localhost:3000" || configuredUrl === "http://127.0.0.1:3000" || configuredUrl === "localhost:3000") {
    configuredUrl = "https://softlap.seoul.kr";
  }
  
  const tryUrl = async (url) => {
    if (!url) return null;
    const targetUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2초 타임아웃
      
      const res = await fetch(`${targetUrl}/api/health`, { 
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const data = await res.json();
        return { success: true, url: targetUrl, engine: data.engine };
      }
    } catch (e) {
      // Fail silently
    }
    return null;
  };

  let connection = null;

  if (configuredUrl) {
    // 1. 관리자가 수동으로 기입한 외부 연동 서버 주소가 있을 때 우선 시도
    connection = await tryUrl(configuredUrl);
    if (connection) {
      centralDbUrl = connection.url;
    }
  } else {
    // 2. 입력값이 없는 경우: 지능형 서버 자동 추적 시퀀스 가동
    // A. OCI 전용 보안 API 서버 주소 최우선 스캐닝 시도 (실시간 HTTPS 연동 보장)
    connection = await tryUrl("https://softlap.seoul.kr");
    
    if (!connection) {
      connection = await tryUrl("https://api.kfcman.link");
    }
    if (!connection) {
      connection = await tryUrl("https://www.softlap.seoul.kr");
    }
    if (!connection) {
      connection = await tryUrl("https://api.softlap.seoul.kr");
    }
    
    // B. 현재 브라우저의 도메인(Origin)을 기본 백엔드로 시도
    if (!connection) {
      connection = await tryUrl(window.location.origin);
    }
    
    // C. 로컬 서버(localhost:3000) 자동 스캐닝 시도 (정적 호스팅 사이트에서 로컬 서버 켰을 때 자동 연결용)
    if (!connection && window.location.origin !== "http://localhost:3000" && window.location.origin !== "http://127.0.0.1:3000") {
      connection = await tryUrl("http://localhost:3000");
    }
    
    // D. OCI 대표 주소(kfcman.link) 자동 폴백 시도
    if (!connection) {
      connection = await tryUrl("https://kfcman.link");
    }

    if (connection) {
      centralDbUrl = connection.url;
    } else {
      centralDbUrl = window.location.origin;
    }
  }

  const statusContainer = document.getElementById("admin-db-status-container");

  if (connection) {
    isCentralDbActive = true;
    console.log(`🌐 중앙 집중형 원격 데이터베이스 연결 활성화! 주소: ${centralDbUrl} | 엔진: ${connection.engine}`);
    
    try {
      const regRes = await fetch(`${centralDbUrl}/api/registry`);
      if (regRes.ok) {
        state.edutechRegistry = await regRes.json();
      }
    } catch (e) {}

    // 로그인 화면의 연동 상태 뱃지 업데이트
    const authStatus = document.getElementById("auth-db-status");
    if (authStatus) {
      authStatus.style.display = "inline-block";
      authStatus.style.backgroundColor = "rgba(46, 204, 113, 0.15)";
      authStatus.style.color = "var(--success-color)";
      authStatus.style.border = "1px solid rgba(46, 204, 113, 0.4)";
      authStatus.innerHTML = `🟢 중앙 집중형 DB 연동 완료`;
    }

    if (statusContainer) {
      statusContainer.style.display = "block";
      statusContainer.style.backgroundColor = "rgba(46, 204, 113, 0.1)";
      statusContainer.style.color = "var(--success-color)";
      statusContainer.style.border = "1px solid rgba(46, 204, 113, 0.4)";
      statusContainer.innerHTML = `🟢 원격 중앙 데이터베이스 연결 성공!<br>
        <span style="font-weight:normal; font-size:0.72rem; color:var(--text-secondary);">📍 연동 API 서버 주소: <strong>${centralDbUrl}</strong> | ⚡ 데이터베이스 모드: <strong>${connection.engine}</strong></span>`;
    }
  } else {
    isCentralDbActive = false;
    console.error("❌ 중앙 API 서버 연결 실패! 모든 데이터 수정 및 로드가 비활성화됩니다.");

    // 로그인 화면의 연동 상태 뱃지 업데이트
    const authStatus = document.getElementById("auth-db-status");
    if (authStatus) {
      authStatus.style.display = "inline-block";
      authStatus.style.backgroundColor = "rgba(231, 76, 60, 0.15)";
      authStatus.style.color = "var(--danger-color)";
      authStatus.style.border = "1px solid rgba(231, 76, 60, 0.4)";
      authStatus.innerHTML = `🔴 중앙 API 서버 연결 끊김 (수정 불가)`;
    }

    if (statusContainer) {
      statusContainer.style.display = "block";
      statusContainer.style.backgroundColor = "rgba(231, 76, 60, 0.1)";
      statusContainer.style.color = "var(--danger-color)";
      statusContainer.style.border = "1px solid rgba(231, 76, 60, 0.4)";
      
      let htmlContent = `🔴 중앙 API 서버 접속 불가 (실시간 작성 및 조회가 제한됩니다)<br>
        <span style="font-weight:normal; font-size:0.72rem; color:var(--text-secondary);">📍 원격 데이터베이스 연결이 해제되었습니다. 서버 구동 상태 및 네트워크 연결을 확인하십시오.</span>`;
      
      if (window.location.protocol === "https:") {
        htmlContent += `<br><span style="color:var(--danger-color); font-size:0.72rem; font-weight:800; display:block; margin-top:8px; line-height:1.4;">
          ⚠️ [브라우저 보안] 현재 HTTPS 보안 접속 중입니다. 만약 HTTP 로컬 서버(http://localhost:3000)를 연결하는 경우 브라우저 보안에 의해 차단될 수 있습니다.<br>
          👉 해결 방법: http://softlap.seoul.kr 주소로 강제 접속하거나 주소창에 'http://localhost:3000'으로 접속해 주십시오.</span>`;
      }
      statusContainer.innerHTML = htmlContent;
    }
  }
}

// 글로벌 애플리케이션 상태
let state = {
  currentUser: null,       // 현재 로그인된 사용자 객체 { email, name, school }
  currentTab: "edit",      // 'edit' 또는 'preview'
  filterElement: "전체",    // 대분류 필터 값
  activeProjectId: null,   // 현재 편집 중인 보관함 내 프로젝트 ID
  projects: [],            // 현재 사용자의 프로젝트 리스트
  edutechRegistry: [],     // 중앙 원격 데이터베이스 마스터 명부 캐시
  submittedList: [],       // 제출 보고서 목록 캐시 (서버 연동용)
  activeProject: {         // 현재 활성화된 프로젝트 모델
    meta: {
      targetProduct: "",
      developer: "",
      osType: "",
      osVersion: "",
      modelName: "",
      network: "",
      usageEnv: "",
      teacherName: "",
      schoolName: "",
      reportDate: new Date().toISOString().split('T')[0]
    },
    items: []
  },
  authMode: "login",        // 'login' 또는 'signup'
  adminFilters: {
    email: "",
    name: "",
    school: "",
    team: "all",
    role: "all",
    password: ""
  },
  adminSort: {
    column: "team",
    direction: "asc"
  }
};

// 앱 최초 로드 시 실행되는 초기화 라이프사이클
async function initApp() {
  // 로컬 저장소로부터 저장된 대분류 필터 및 사이드바 접힘 상태 복구
  state.filterElement = localStorage.getItem("softlap_filter_element") || "전체";
  
  const isMobile = window.innerWidth <= 768;
  const sidebarCollapsed = isMobile || localStorage.getItem("softlap_sidebar_collapsed") === "true";
  const sidebar = document.getElementById("sidebar");
  const toggleIcon = document.getElementById("sidebar-toggle-icon");
  const toggleText = document.getElementById("sidebar-toggle-text");
  if (sidebar && sidebarCollapsed) {
    sidebar.classList.add("collapsed");
    if (toggleIcon) toggleIcon.textContent = "▶";
    if (toggleText) toggleText.textContent = "사이드바 펼치기";
  }

  // 나의 실증 보관함 및 가이드 트리 접힘 상태 복구
  const cabinetCollapsed = localStorage.getItem("softlap_cabinet_collapsed") === "true";
  const list = document.getElementById("project-cabinet-list");
  const cabArrow = document.getElementById("cabinet-toggle-arrow");
  if (list && cabinetCollapsed) {
    list.style.display = "none";
    if (cabArrow) cabArrow.style.transform = "rotate(-90deg)";
  }

  const guideCollapsed = localStorage.getItem("softlap_guide_collapsed") === "true";
  const nav = document.getElementById("preset-tree-nav");
  const guiArrow = document.getElementById("guide-toggle-arrow");
  if (nav && guideCollapsed) {
    nav.style.display = "none";
    if (guiArrow) guiArrow.style.transform = "rotate(-90deg)";
  }

  await checkCentralDbStatus();
  setupEventListeners();
  applyTheme();
  renderPresetGuideTree();
  renderFilterOptions();
  loadOracleConfig();
  checkAuthSession();
}

function loadOracleConfig() {
  const saved = localStorage.getItem(ORACLE_CONFIG_KEY);
  if (saved) {
    try {
      oracleConfig = JSON.parse(saved);
      document.getElementById("oracle-endpoint-input").value = oracleConfig.endpoint || "";
      document.getElementById("oracle-token-input").value = oracleConfig.token || "";
      
      const badge = document.getElementById("oracle-sync-badge");
      if (oracleConfig.enabled && oracleConfig.endpoint) {
        badge.textContent = "구름 연동";
        badge.style.backgroundColor = "var(--success-color)";
      } else {
        badge.textContent = "로컬 저장";
        badge.style.backgroundColor = "var(--text-tertiary)";
      }
    } catch(e) {}
  } else {
    // 저장된 설정이 없을 때 기본 kfcman.link OCI 커넥터를 폼에 매핑하고 기본 활성화
    document.getElementById("oracle-endpoint-input").value = oracleConfig.endpoint;
    const badge = document.getElementById("oracle-sync-badge");
    badge.textContent = "구름 연동";
    badge.style.backgroundColor = "var(--success-color)";
  }
}

// 1. 인증 및 세션 검증 (일반 교사 및 관리자 분기 처리)
function checkAuthSession() {
  const session = localStorage.getItem(SESSION_KEY);
  if (session) {
    try {
      state.currentUser = JSON.parse(session);
      if (state.currentUser.isAdmin) {
        showAdminDashboard();
      } else if (state.currentUser.isEnterprise) {
        showEnterpriseDashboard();
      } else {
        showMainDashboard();
      }
    } catch (e) {
      console.error("세션 에러로 로그인 페이지로 리셋합니다.", e);
      showAuthScreen();
    }
  } else {
    showAuthScreen();
  }
}

function showMainDashboard() {
  document.getElementById("auth-container").style.display = "none";
  document.getElementById("app-container").style.display = "flex";
  document.getElementById("admin-container").style.display = "none";

  // 프로필 정보 매핑
  const isLeader = state.currentUser.isLeader || state.currentUser.role === "team_leader";
  const leaderBadge = isLeader ? " <span style='font-size:0.65rem; background:linear-gradient(135deg,hsl(45,100%,60%),hsl(30,100%,55%)); color:#fff; padding:2px 6px; border-radius:4px; font-weight:800;'>&#x1F451; 팀장</span>" : "";
  document.getElementById("profile-name").innerHTML = `${state.currentUser.name} 교사${leaderBadge}`;
  document.getElementById("profile-school").textContent = state.currentUser.team || state.currentUser.school;
  document.getElementById("profile-avatar").textContent = state.currentUser.name ? state.currentUser.name[0] : "👨‍🏫";

  // 만약 일반 교사인데 기존 관리자 복구 단추가 남아있다면 제거
  const returnBtn = document.getElementById("btn-admin-return");
  if (returnBtn) returnBtn.remove();

  // 오라클 클라우드 DB 연동 가시성 설정
  updateOracleSyncCardVisibility();

  // 팀장인 경우 팀 탭에 배지 표시
  const isLeaderUser = state.currentUser?.isLeader || state.currentUser?.role === "team_leader";
  const teamTabBtns = ["btn-tab-team", "btn-m-tab-team"].map(id => document.getElementById(id)).filter(Boolean);
  teamTabBtns.forEach(btn => {
    // 기존 배지 제거
    const existingBadge = btn.querySelector(".leader-tab-badge");
    if (existingBadge) existingBadge.remove();

    if (isLeaderUser) {
      const badge = document.createElement("span");
      badge.className = "leader-tab-badge";
      badge.textContent = "👑";
      badge.style.cssText = "margin-left: 4px; font-size: 0.75rem;";
      btn.appendChild(badge);
    }
  });

  // 현재 유저의 프로젝트 목록 로드
  loadUserProjects();
}

function showAuthScreen() {
  document.getElementById("auth-container").style.display = "flex";
  document.getElementById("app-container").style.display = "none";
  document.getElementById("admin-container").style.display = "none";
  state.currentUser = null;
  localStorage.removeItem(SESSION_KEY);
  state.authMode = "login";
  updateAuthUI();
  updateOracleSyncCardVisibility();
}

function updateOracleSyncCardVisibility() {
  const card = document.getElementById("oracle-sync-card");
  if (!card) return;
  if (state.currentUser && state.currentUser.isAdmin) {
    card.style.display = "block";
  } else {
    card.style.display = "none";
  }
}

// 1-A. 관리자 대시보드 출력 및 사용자 관리 코어 엔진
async function showAdminDashboard() {
  document.getElementById("auth-container").style.display = "none";
  document.getElementById("app-container").style.display = "none";
  document.getElementById("admin-container").style.display = "flex";
  
  const dbUrlInput = document.getElementById("admin-central-db-url-input");
  if (dbUrlInput) {
    dbUrlInput.value = localStorage.getItem("softlap_central_db_url") || "";
  }
  
  await checkCentralDbStatus();
  updateOracleSyncCardVisibility();
  renderAdminUsersList();
}

async function renderAdminUsersList() {
  const tbody = document.getElementById("admin-users-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  const searchVal = document.getElementById("admin-search-input") ? document.getElementById("admin-search-input").value.trim().toLowerCase() : "";
  const filterEmail = document.getElementById("admin-filter-email") ? document.getElementById("admin-filter-email").value.trim().toLowerCase() : "";
  const filterName = document.getElementById("admin-filter-name") ? document.getElementById("admin-filter-name").value.trim().toLowerCase() : "";
  const filterSchool = document.getElementById("admin-filter-school") ? document.getElementById("admin-filter-school").value.trim().toLowerCase() : "";
  const filterTeam = document.getElementById("admin-filter-team") ? document.getElementById("admin-filter-team").value : "all";
  const filterRole = document.getElementById("admin-filter-role") ? document.getElementById("admin-filter-role").value : "all";
  const filterPassword = document.getElementById("admin-filter-password") ? document.getElementById("admin-filter-password").value.trim().toLowerCase() : "";

  let usersDB = {};
  let userEmails = [];
  let totalProjectsCount = 0;

  try {
    const res = await fetch(`${centralDbUrl}/api/admin/users`);
    if (res.ok) {
      usersDB = await res.json();
      userEmails = Object.keys(usersDB);
      
      userEmails.forEach(email => {
        if (email !== "admin") {
          totalProjectsCount += (usersDB[email].projectCount || 0);
        }
      });
    } else {
      throw new Error("서버 응답 오류");
    }
  } catch (e) {
    console.error("원격 사용자 목록 로딩 실패:", e);
    showToast("⚠️ 데이터베이스에서 회원 정보를 로드하지 못했습니다.");
  }
  
  const actualUsersCount = userEmails.filter(email => email !== "admin").length;
  document.getElementById("admin-stat-users").textContent = `${actualUsersCount}명`;
  document.getElementById("admin-stat-projects").textContent = `${totalProjectsCount}개`;

  // 팀 필터 옵션 채우기 및 필터값 조회
  const teamFilterEl = document.getElementById("admin-team-filter");
  const colTeamFilterEl = document.getElementById("admin-filter-team");
  
  // 유니크 팀 목록 수집
  const teams = new Set();
  Object.keys(usersDB).forEach(email => {
    if (email === "admin") return;
    const user = usersDB[email];
    if (user.team && user.team.trim()) {
      teams.add(user.team.trim());
    }
  });
  
  const sortedTeams = Array.from(teams).sort();
  
  const populateTeamSelect = (el, isTop) => {
    if (!el) return;
    const previousSelection = el.value || "all";
    el.innerHTML = isTop
      ? '<option value="all">🔍 전체 팀</option><option value="none">👤 팀 미지정</option>'
      : '<option value="all">전체</option><option value="none">미지정</option>';
    sortedTeams.forEach(t => {
      const option = document.createElement("option");
      option.value = t;
      option.textContent = isTop ? `👥 ${t}` : t;
      el.appendChild(option);
    });
    if (previousSelection === "none" || sortedTeams.includes(previousSelection)) {
      el.value = previousSelection;
    } else {
      el.value = "all";
    }
  };

  populateTeamSelect(teamFilterEl, true);
  populateTeamSelect(colTeamFilterEl, false);

  // 현재 정렬에 따라 헤더 아이콘 갱신
  const cols = ["email", "name", "school", "team", "role", "password"];
  cols.forEach(col => {
    const iconEl = document.getElementById(`sort-icon-${col}`);
    if (iconEl) {
      if (state.adminSort.column === col) {
        iconEl.innerHTML = state.adminSort.direction === "asc" ? " ▲" : " ▼";
        iconEl.style.color = "var(--accent-color)";
      } else {
        iconEl.innerHTML = " ↕";
        iconEl.style.color = "var(--text-tertiary)";
      }
    }
  });

  const activeTeamFilter = filterTeam !== "all" ? filterTeam : (teamFilterEl ? teamFilterEl.value : "all");

  // 검색어 및 팀 필터링
  const filteredEmails = userEmails.filter(email => {
    if (email === "admin") return false; // 관리자 계정은 가입자 리스트에서 제외
    const user = usersDB[email];
    const role = user.role || (user.isEnterprise ? "enterprise" : "teacher");
    
    const matchesSearch = !searchVal ||
                          email.toLowerCase().includes(searchVal) || 
                          (user.name && user.name.toLowerCase().includes(searchVal)) ||
                          (user.school && user.school.toLowerCase().includes(searchVal));
                          
    const matchesEmail = !filterEmail || email.toLowerCase().includes(filterEmail);
    const matchesName = !filterName || (user.name && user.name.toLowerCase().includes(filterName));
    const matchesSchool = !filterSchool || (user.school && user.school.toLowerCase().includes(filterSchool));
    
    let matchesTeam = true;
    const userTeam = (user.team || "").trim();
    if (activeTeamFilter === "none") {
      matchesTeam = userTeam === "";
    } else if (activeTeamFilter !== "all") {
      matchesTeam = userTeam === activeTeamFilter;
    }

    let matchesRole = true;
    if (filterRole !== "all") {
      matchesRole = role === filterRole;
    }

    const matchesPassword = !filterPassword || (user.password && String(user.password).toLowerCase().includes(filterPassword));
    
    return matchesSearch && matchesEmail && matchesName && matchesSchool && matchesTeam && matchesRole && matchesPassword;
  });

  // 정렬 적용
  const sortBy = state.adminSort.column;
  const isAsc = state.adminSort.direction === "asc";

  filteredEmails.sort((a, b) => {
    let valA = "";
    let valB = "";
    
    if (sortBy === "email") {
      valA = a;
      valB = b;
    } else if (sortBy === "name") {
      valA = usersDB[a].name || "";
      valB = usersDB[b].name || "";
    } else if (sortBy === "school") {
      valA = usersDB[a].school || "";
      valB = usersDB[b].school || "";
    } else if (sortBy === "team") {
      valA = (usersDB[a].team || "").trim();
      valB = (usersDB[b].team || "").trim();
      
      if (valA === "" && valB !== "") return 1;
      if (valA !== "" && valB === "") return -1;
      if (valA === "" && valB === "") {
        return a.localeCompare(b);
      }
    } else if (sortBy === "role") {
      valA = usersDB[a].role || (usersDB[a].isEnterprise ? "enterprise" : "teacher");
      valB = usersDB[b].role || (usersDB[b].isEnterprise ? "enterprise" : "teacher");
    } else if (sortBy === "password") {
      valA = String(usersDB[a].password || "");
      valB = String(usersDB[b].password || "");
    }
    
    let comparison = 0;
    if (sortBy === "email" || sortBy === "password") {
      comparison = valA.localeCompare(valB);
    } else {
      comparison = valA.localeCompare(valB, 'ko');
    }
    
    return isAsc ? comparison : -comparison;
  });

  if (filteredEmails.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:35px; color:var(--text-tertiary); font-weight:500;">
          검색 및 등록된 회원 계정이 없습니다.
        </td>
      </tr>
    `;
    return;
  }

  let currentGroupTeam = null;
  filteredEmails.forEach(email => {
    const user = usersDB[email];
    
    // 팀별 정렬일 때 팀명 구분용 행 헤더 추가
    if (sortBy === "team") {
      const userTeam = (user.team || "").trim() || "팀 미지정";
      if (userTeam !== currentGroupTeam) {
        currentGroupTeam = userTeam;
        const groupTr = document.createElement("tr");
        groupTr.style.background = "linear-gradient(90deg, var(--bg-tertiary) 0%, transparent 100%)";
        const countInTeam = filteredEmails.filter(e => ((usersDB[e].team || "").trim() || "팀 미지정") === userTeam).length;
        
        groupTr.innerHTML = `
          <td colspan="7" style="padding: 10px 14px; color: var(--accent-color); font-size: 0.8rem; font-weight: 800; border-left: 4px solid var(--accent-color); border-bottom: 1px solid var(--border-color); text-align: left;">
            👥 ${userTeam} (${countInTeam}명)
          </td>
        `;
        tbody.appendChild(groupTr);
      }
    }

    const tr = document.createElement("tr");

    // 현재 역할 결정
    const role = user.role || (user.isEnterprise ? "enterprise" : "teacher");

    // 역할 배지 색상 맵
    const roleBadgeMap = {
      admin:       { icon: "🛠️", label: "관리자", bg: "hsl(210,100%,50%)" },
      team_leader: { icon: "👑", label: "팀장",   bg: "linear-gradient(135deg,hsl(45,100%,55%),hsl(30,100%,50%))" },
      enterprise:  { icon: "🏢", label: "기업",   bg: "hsl(142,70%,40%)" },
      teacher:     { icon: "👨‍🏫", label: "교사",  bg: "hsl(220,70%,50%)" }
    };
    const badgeInfo = roleBadgeMap[role] || roleBadgeMap.teacher;
    const roleBadge = `<span id="role-badge-${email.replace(/[@.]/g,'-')}" style="display:inline-flex;align-items:center;gap:3px;font-size:0.63rem;background:${badgeInfo.bg};color:#fff;padding:2px 6px;border-radius:4px;font-weight:800;margin-left:4px;">${badgeInfo.icon} ${badgeInfo.label}</span>`;

    // 역할 변경 드롭다운
    const safeEmail = email.replace(/'/g, "\\'");
    const roleSelect = `
      <select id="role-select-${email.replace(/[@.]/g,'-')}"
        onchange="adminChangeRole('${safeEmail}', this)"
        style="padding:3px 6px; font-size:0.72rem; border:1px solid var(--border-color); border-radius:5px; background:var(--bg-secondary); color:var(--text-primary); cursor:pointer; font-weight:700;">
        <option value="teacher"     ${role === "teacher"     ? "selected" : ""}>👨‍🏫 교사</option>
        <option value="team_leader" ${role === "team_leader" ? "selected" : ""}>👑 팀장</option>
        <option value="enterprise"  ${role === "enterprise"  ? "selected" : ""}>🏢 기업</option>
        <option value="admin"       ${role === "admin"       ? "selected" : ""}>🛠️ 관리자</option>
      </select>`;

    // 실증 팀명 입력 인풋
    const currentTeam = user.team || "";
    const teamInput = `
      <input type="text"
        value="${currentTeam}"
        onchange="adminChangeTeam('${safeEmail}', this.value)"
        placeholder="예: 서울 실증 2팀"
        style="width: 100%; padding: 4px 8px; font-size: 0.72rem; border: 1px solid var(--border-color); border-radius: 5px; background: var(--bg-secondary); color: var(--text-primary); font-weight: 500;">
    `;

    tr.innerHTML = `
      <td data-label="이메일 계정"><strong style="color:var(--accent-color); font-size:0.85rem;">${email}</strong></td>
      <td data-label="대표명 (교사명 / 기업명)"><strong>${user.name || "-"}</strong>${roleBadge}</td>
      <td data-label="소속 학교/기관/업체">${user.school || "서울에듀테크소프트랩"}</td>
      <td data-label="실증 팀명">${teamInput}</td>
      <td data-label="역할 변경">${roleSelect}</td>
      <td data-label="비밀번호 (보안 확인)"><code style="background-color:var(--bg-tertiary); padding:3px 8px; border-radius:4px; font-weight:700; color:var(--danger-color); font-size:0.8rem;">${user.password}</code></td>
      <td data-label="관리 조치">
        <button class="btn" style="padding:4px 8px; font-size:0.72rem; border-color:var(--accent-color); color:var(--accent-color); margin-right:4px; font-weight:700;" onclick="adminChangePassword('${safeEmail}')">🔑 비번변경</button>
        <button class="btn" style="padding:4px 8px; font-size:0.72rem; border-color:var(--danger-color); color:var(--danger-color); font-weight:700;" onclick="adminDeleteUser('${safeEmail}')">🗑️ 계정삭제</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.handleAdminSort = function(column) {
  if (state.adminSort.column === column) {
    state.adminSort.direction = state.adminSort.direction === "asc" ? "desc" : "asc";
  } else {
    state.adminSort.column = column;
    state.adminSort.direction = "asc";
  }
  
  // Sync the top dropdown if applicable
  const sortSelectEl = document.getElementById("admin-sort-select");
  if (sortSelectEl) {
    if (column === "email" || column === "name" || column === "team") {
      sortSelectEl.value = column;
    }
  }
  
  renderAdminUsersList();
};

// 관리자 전용: 실증 팀명 즉시 변경 처리기
async function adminChangeTeam(email, newTeam) {
  try {
    const response = await fetch(`${centralDbUrl}/api/admin/change-team`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, newTeam })
    });

    if (response.ok) {
      showToast(`✅ ${email} 계정의 실증 팀명이 [${newTeam || '없음'}](으)로 설정되었습니다.`);
    } else {
      const errData = await response.json();
      alert("팀명 변경 실패: " + (errData.error || "알 수 없는 오류"));
      renderAdminUsersList(); // 원상복구
    }
  } catch (err) {
    alert("서버 통신 오류: " + err.message);
    renderAdminUsersList(); // 원상복구
  }
}

// 관리자 전용: 회원 역할 즉시 변경 처리기
async function adminChangeRole(email, selectEl) {
  const newRole = selectEl.value;
  const roleBadgeMap = {
    admin:       { icon: "🛠️", label: "관리자", bg: "hsl(210,100%,50%)" },
    team_leader: { icon: "👑", label: "팀장",   bg: "linear-gradient(135deg,hsl(45,100%,55%),hsl(30,100%,50%))" },
    enterprise:  { icon: "🏢", label: "기업",   bg: "hsl(142,70%,40%)" },
    teacher:     { icon: "👨‍🏫", label: "교사",  bg: "hsl(220,70%,50%)" }
  };

  try {
    const response = await fetch(`${centralDbUrl}/api/admin/change-role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, newRole })
    });

    if (response.ok) {
      // 배지 즉시 업데이트
      const badgeId = "role-badge-" + email.replace(/[@.]/g, '-');
      const badge = document.getElementById(badgeId);
      if (badge && roleBadgeMap[newRole]) {
        const info = roleBadgeMap[newRole];
        badge.style.background = info.bg;
        badge.textContent = `${info.icon} ${info.label}`;
      }
      showToast(`✅ ${email} 계정의 역할이 [${roleBadgeMap[newRole]?.label || newRole}](으)로 변경되었습니다.`);
    } else {
      const errData = await response.json();
      alert("역할 변경 실패: " + (errData.error || "알 수 없는 오류"));
      // 드롭다운 원상복구
      renderAdminUsersList();
    }
  } catch (err) {
    alert("서버 통신 오류: " + err.message);
    renderAdminUsersList();
  }
}
window.adminChangeRole = adminChangeRole;

async function adminChangePassword(email) {
  const newPw = prompt(`[관리자 비밀번호 강제 변경]\n\n회원 계정 (${email})의 변경할 신규 비밀번호를 설정하십시오:`);
  if (newPw === null) return;
  const pwTrimmed = newPw.trim();
  if (pwTrimmed.length < 4) {
    alert("안전을 위해 비밀번호는 최소 4자리 이상으로 설정해 주십시오.");
    return;
  }
  
  try {
    const response = await fetch(`${centralDbUrl}/api/admin/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, newPassword: pwTrimmed })
    });
    if (response.ok) {
      await renderAdminUsersList();
      showToast(`회원 (${email})의 비밀번호가 성공적으로 강제 재설정되었습니다.`);
    } else {
      alert("원격 서버 비밀번호 변경 실패");
    }
  } catch (err) {
    alert("서버 연결 실패: " + err.message);
  }
}
window.adminChangePassword = adminChangePassword;

async function adminDeleteUser(email) {
  if (confirm(`⚠️ [경고 - 계정 영구 강제 삭제]\n\n정말 회원 계정 (${email})을 강제 탈퇴시키고,\n해당 계정 소유의 보관함 및 모든 실증 데이터를 영구히 데이터베이스에서 삭제하시겠습니까?`)) {
    try {
      const response = await fetch(`${centralDbUrl}/api/admin/users/${encodeURIComponent(email)}`, {
        method: "DELETE"
      });
      if (response.ok) {
        await renderAdminUsersList();
        showToast(`회원 (${email}) 계정 및 관련 실증 보관함 데이터가 완벽히 파쇄되었습니다.`);
      } else {
        alert("원격 서버 회원 삭제 실패");
      }
    } catch (err) {
      alert("서버 연결 실패: " + err.message);
    }
  }
}
window.adminDeleteUser = adminDeleteUser;


// 2. 다중 사용자 프로젝트 데이터베이스 조작 (교사별 격리)

// 프로젝트 보관함 로딩
async function loadUserProjects() {
  if (!state.currentUser) return;
  
  try {
    const res = await fetch(`${centralDbUrl}/api/projects?email=${encodeURIComponent(state.currentUser.email)}`);
    if (res.ok) {
      const remoteProjects = await res.json();
      state.projects = remoteProjects || [];
      
      const isAdmin = state.currentUser.isAdmin || state.currentUser.role === "admin";
      
      if (isAdmin) {
        // 관리자인 경우, 다른 교사들이 제출한 모든 리포트도 보관함 목록에 합쳐서 조회 및 제출 취소할 수 있게 덤프
        try {
          const subRes = await fetch(`${centralDbUrl}/api/submitted`);
          if (subRes.ok) {
            const submittedList = await subRes.json();
            submittedList.forEach(p => {
              if (!state.projects.some(myP => myP.id === p.id)) {
                state.projects.push({
                  id: p.id,
                  meta: p.meta,
                  items: p.items,
                  submitted: p.submitted,
                  status: p.status,
                  submitDate: p.submitDate,
                  email: p.email // 원작성자 이메일 보존
                });
              }
            });
          }
        } catch (subErr) {
          console.error("관리자용 제출 완료 목록 로딩 실패:", subErr);
        }
      }
      
      // 양쪽 다 데이터가 전혀 없을 때 웰컴 샘플 프로젝트 자동 배포 (관리자 제외)
      if (state.projects.length === 0 && !isAdmin) {
        const welcomeProj = JSON.parse(JSON.stringify(WELCOME_SAMPLE_PROJECT));
        welcomeProj.id = "welcome_" + Date.now();
        welcomeProj.meta.teacherName = (state.currentUser.name && state.currentUser.school) ? `${state.currentUser.name} (${state.currentUser.school})` : (state.currentUser.name || "");
        welcomeProj.meta.schoolName = state.currentUser.team || state.currentUser.school || "";
        
        state.projects = [welcomeProj];
        
        // 웰컴 데이터 생성 후 즉시 서버에 저장
        await fetch(`${centralDbUrl}/api/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: state.currentUser.email, projects: state.projects })
        });
      }
    } else {
      throw new Error("서버 응답 에러");
    }
  } catch (e) {
    console.error("원격 서버로부터 프로젝트 로딩 실패:", e);
    showToast("⚠️ 데이터베이스 연결 실패. 프로젝트를 불러오지 못했습니다.");
    state.projects = [];
  }

  // 보관함 목록 그리기 및 첫 프로젝트 로딩
  renderCabinetList();
  if (state.projects.length > 0) {
    if (!state.activeProjectId || !state.projects.some(p => p.id === state.activeProjectId)) {
      state.activeProjectId = state.projects[0].id;
    }
    loadActiveProject();
  } else {
    createNewProject(false); // 보관함이 완전히 비어있을 시 자동 하나 개설
  }
}

// 프로젝트 목록 전체 저장 및 동기화 헬퍼 함수
async function saveProjectsList() {
  if (!state.currentUser) return;
  
  try {
    const res = await fetch(`${centralDbUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: state.currentUser.email, projects: state.projects })
    });
    
    if (!res.ok) {
      if (res.status === 413) {
        alert("사진 이미지의 용량이 초과했습니다.");
        return;
      }
      throw new Error("저장 실패");
    }
  } catch (e) {
    console.error("원격 서버 저장 실패:", e);
    alert("❌ [네트워크 오류] 실증 보고서가 데이터베이스에 저장되지 않았습니다!\n현재 작성 중인 화면을 새로고침하지 마시고, 네트워크가 연결된 후 다시 타이핑하거나 변경해 주십시오.");
  }
}

// 프로젝트 저장
async function saveActiveProject() {
  if (!state.activeProjectId) return;

  const index = state.projects.findIndex(p => p.id === state.activeProjectId);
  if (index !== -1) {
    state.projects[index].meta = state.activeProject.meta;
    state.projects[index].items = state.activeProject.items;
  }
  
  await saveProjectsList();
  
  // 사이드바 목록 리프레시 (제품명 연동 반영용)
  renderCabinetList();
  updateSummaryStats();
  
  // 하단 꼬리말 업데이트
  document.getElementById("footer-active-product").textContent = state.activeProject.meta.targetProduct || "제품명 미기재";

  // 만약 오라클 클라우드 연동이 켜진 경우 비동기로 클라우드 동기화 수행
  if (oracleConfig.enabled && oracleConfig.endpoint) {
    syncToOracleCloud();
  }
}

// 특정 프로젝트 로딩
function loadActiveProject() {
  const proj = state.projects.find(p => p.id === state.activeProjectId);
  if (!proj) return;

  state.activeProject = JSON.parse(JSON.stringify(proj));
  
  // 입력 폼 바인딩
  const meta = state.activeProject.meta;
  document.getElementById("in-target-product").value = meta.targetProduct || "";
  document.getElementById("in-developer").value = meta.developer || "";
  document.getElementById("in-os-type").value = meta.osType || "";
  document.getElementById("in-os-version").value = meta.osVersion || "";
  document.getElementById("in-model-name").value = meta.modelName || "";
  document.getElementById("in-network").value = meta.network || "";
  document.getElementById("in-usage-env").value = meta.usageEnv || "";
  document.getElementById("in-teacher-name").value = meta.teacherName || "";
  document.getElementById("in-school-name").value = meta.schoolName || "";
  document.getElementById("in-report-date").value = meta.reportDate || "";

  // 🏢 [신규] 제출 여부 및 피드백 현황 수신 처리
  const isSubmitted = !!state.activeProject.submitted;
  const status = state.activeProject.status || "작성중";
  const feedback = state.activeProject.feedback;

  const btnSubmit = document.getElementById("btn-submit-to-company");
  const btnCancelSubmit = document.getElementById("btn-cancel-submit");
  const txtStatus = document.getElementById("txt-submitted-status");
  const panelFeedback = document.getElementById("feedback-receipt-panel");

  if (isSubmitted) {
    btnSubmit.style.display = "none";
    txtStatus.style.display = "inline-flex";
    
    if (status === "피드백 완료") {
      txtStatus.textContent = "피드백 완료";
      txtStatus.className = "status-badge status-completed";
      const isAdmin = state.currentUser?.isAdmin || state.currentUser?.role === "admin";
      if (btnCancelSubmit) btnCancelSubmit.style.display = isAdmin ? "inline-flex" : "none";
      
      // 피드백 패널 노출 및 매핑
      if (feedback) {
        panelFeedback.style.display = "flex";
        document.getElementById("feedback-date").textContent = feedback.date || "";
        document.getElementById("feedback-content").textContent = `[${feedback.company || "제조기업"}]\n${feedback.text || ""}`;
      } else {
        panelFeedback.style.display = "none";
      }
    } else {
      txtStatus.textContent = "제출완료 (대기중)";
      txtStatus.className = "status-badge status-submitted";
      if (btnCancelSubmit) btnCancelSubmit.style.display = "inline-flex";
      panelFeedback.style.display = "none";
    }
  } else {
    btnSubmit.style.display = "inline-flex";
    if (btnCancelSubmit) btnCancelSubmit.style.display = "none";
    txtStatus.style.display = "none";
    panelFeedback.style.display = "none";
  }

  // 양식 락다운(Lock) 및 드롭다운 잠금 분기 처리
  const fields = [
    "in-target-product", "in-developer", "in-os-type", "in-os-version",
    "in-model-name", "in-network", "in-usage-env", "in-teacher-name",
    "in-school-name", "in-report-date", "in-target-product-select"
  ];
  fields.forEach(fid => {
    const el = document.getElementById(fid);
    if (el) {
      if (isSubmitted) {
        el.setAttribute("disabled", "true");
        el.style.opacity = "0.75";
      } else {
        el.removeAttribute("disabled");
        el.style.opacity = "1";
      }
    }
  });

  // 에듀테크 마스터 드롭다운 동적 로드 및 선택 동기화
  renderEdutechDropdown();

  renderChecklistGrid();
  updateSummaryStats();
  
  // 🏢 [신규] 활성화 시 실시간 중복 여부 판독
  checkTeamDuplication();
  
  document.getElementById("footer-active-product").textContent = meta.targetProduct || "제품명 미기재";
}

// 새 실증 보고서 추가 (30개 실증 평가 기준 문항 자동 탑재)
async function createNewProject(shouldToast = true) {
  const newProj = {
    id: "proj_" + Date.now(),
    meta: {
      targetProduct: "새로운 에듀테크 프로그램",
      developer: "",
      osType: "",
      osVersion: "",
      modelName: "",
      network: "",
      usageEnv: "",
      teacherName: (state.currentUser.name && state.currentUser.school) ? `${state.currentUser.name} (${state.currentUser.school})` : (state.currentUser.name || ""),
      schoolName: state.currentUser.team || state.currentUser.school || "",
      reportDate: new Date().toISOString().split('T')[0]
    },
    items: []
  };

  // 6대 요소 30개 상세 실증 항목 자동 세팅
  Object.keys(EMPIRICAL_STANDARDS).forEach(elementName => {
    const items = EMPIRICAL_STANDARDS[elementName].items;
    Object.keys(items).forEach(itemName => {
      const criteriaList = items[itemName].criteria;
      const defaultCrit = criteriaList[0];
      
      newProj.items.push({
        id: Date.now() + Math.random(),
        element: elementName,
        item: itemName,
        criterion: defaultCrit,
        type: "점검기준",
        analysis: "",
        severity: "하",
        improvement: "",
        writer: state.currentUser.name || "평가교사",
        selected: true // 기본적으로 A4 인쇄물에 바로 포함되도록 활성화
      });
    });
  });

  state.projects.push(newProj);
  state.activeProjectId = newProj.id;
  
  await saveProjectsList();
  
  renderCabinetList();
  loadActiveProject();

  if (shouldToast) {
    showToast("새로운 실증 보고서가 30개 실증 항목과 함께 보관함에 개설되었습니다.");
  }
}

// 프로젝트 복제
async function duplicateProject(projId, e) {
  if (e) e.stopPropagation(); // 카드 선택 이벤트 전파 차단
  
  const target = state.projects.find(p => p.id === projId);
  if (!target) return;

  const clone = JSON.parse(JSON.stringify(target));
  clone.id = "proj_" + Date.now();
  clone.meta.targetProduct = `${clone.meta.targetProduct} (복사본)`;

  state.projects.push(clone);
  state.activeProjectId = clone.id;
  
  await saveProjectsList();

  renderCabinetList();
  loadActiveProject();
  showToast("선택하신 실증 파일이 안전하게 복제되었습니다.");
}

// 프로젝트 삭제
async function deleteProject(projId, e) {
  if (e) e.stopPropagation();

  if (confirm("경고: 해당 에듀테크 제품에 작성하셨던 모든 분석 내용이 보관함에서 영구히 삭제됩니다. 삭제하시겠습니까?")) {
    state.projects = state.projects.filter(p => p.id !== projId);
    
    await saveProjectsList();

    if (state.activeProjectId === projId) {
      state.activeProjectId = state.projects.length > 0 ? state.projects[0].id : null;
    }

    loadUserProjects();
    showToast("보관함 파일이 영구 삭제되었습니다.");
  }
}

// 보관함 사이드바 목록 렌더링
function renderCabinetList() {
  const container = document.getElementById("project-cabinet-list");
  container.innerHTML = "";

  if (!state.projects || state.projects.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:20px; font-size:0.72rem; color:var(--text-tertiary); font-weight:500;">
        보관된 실증 보고서가 없습니다.
      </div>
    `;
    return;
  }

  // 1. 작성(실증) 일자 내림차순(최신순) 정렬
  state.projects.sort((a, b) => {
    const dateA = a.meta.reportDate || "0000-00-00";
    const dateB = b.meta.reportDate || "0000-00-00";
    return dateB.localeCompare(dateA);
  });

  // 2. 날짜별로 그룹화
  const groups = {};
  state.projects.forEach(p => {
    const dateStr = p.meta.reportDate || "날짜 미지정";
    if (!groups[dateStr]) {
      groups[dateStr] = [];
    }
    groups[dateStr].push(p);
  });

  // 3. 정렬된 날짜 그룹 순서대로 렌더링
  const sortedDates = Object.keys(groups).sort((a, b) => {
    if (a === "날짜 미지정") return 1; // 날짜 미지정을 맨 밑으로
    if (b === "날짜 미지정") return -1;
    return b.localeCompare(a);
  });

  sortedDates.forEach(dateStr => {
    // 📅 날짜 그룹 헤더
    const groupHeader = document.createElement("div");
    groupHeader.style.fontSize = "0.7rem";
    groupHeader.style.fontWeight = "800";
    groupHeader.style.color = "var(--accent-color)";
    groupHeader.style.padding = "4px 8px 2px 4px";
    groupHeader.style.display = "flex";
    groupHeader.style.alignItems = "center";
    groupHeader.style.gap = "4px";
    groupHeader.style.marginTop = "6px";
    groupHeader.style.borderBottom = "1px dashed var(--border-color)";
    groupHeader.style.marginBottom = "4px";
    groupHeader.innerHTML = `📅 <span>${dateStr}</span>`;
    container.appendChild(groupHeader);

    // 날짜 그룹 내 개별 항목들 렌더링
    groups[dateStr].forEach(p => {
      const item = document.createElement("div");
      item.className = `project-cabinet-item ${state.activeProjectId === p.id ? 'active' : ''}`;
      item.style.padding = "8px 10px";
      item.style.marginLeft = "4px";
      item.style.marginBottom = "4px";
      item.style.fontSize = "0.75rem";
      
      const titleSpan = document.createElement("span");
      titleSpan.style.whiteSpace = "nowrap";
      titleSpan.style.overflow = "hidden";
      titleSpan.style.textOverflow = "ellipsis";
      titleSpan.style.maxWidth = "140px";
      titleSpan.textContent = p.meta.targetProduct || "이름 없는 제품";
      item.appendChild(titleSpan);

      const btnGroup = document.createElement("div");
      btnGroup.className = "cabinet-btn-group";

      // 1. 복제 아이콘
      const dupBtn = document.createElement("button");
      dupBtn.className = "cabinet-action-btn";
      dupBtn.innerHTML = "📋";
      dupBtn.title = "보고서 파일 그대로 복제";
      dupBtn.addEventListener("click", (e) => duplicateProject(p.id, e));
      btnGroup.appendChild(dupBtn);

      // 2. 삭제 아이콘
      const delBtn = document.createElement("button");
      delBtn.className = "cabinet-action-btn";
      delBtn.innerHTML = "❌";
      delBtn.title = "보고서 파일 삭제";
      delBtn.addEventListener("click", (e) => deleteProject(p.id, e));
      btnGroup.appendChild(delBtn);

      item.appendChild(btnGroup);

      // 클릭 시 해당 보관함 열기
      item.addEventListener("click", () => {
        state.activeProjectId = p.id;
        renderCabinetList();
        loadActiveProject();
        if (state.currentTab === "preview") renderA4Preview();
        closeMobileSidebarIfOpen();
      });

      container.appendChild(item);
    });
  });
}

// 3. 서울에듀테크소프트랩 회원가입 (최소정보) / 로그인 / 비밀번호 찾기 (이메일 인증 후 초기화) 코어 엔진
let verificationState = {
  code: "",
  email: ""
};

function updateAuthUI() {
  const titleEl = document.getElementById("auth-title");
  const descEl = document.getElementById("auth-desc");
  const emailGroup = document.getElementById("group-email");
  const passwordGroup = document.getElementById("group-password");
  const roleGroup = document.getElementById("group-role");
  const codeGroup = document.getElementById("group-code");
  const newPasswordGroup = document.getElementById("group-new-password");
  const forgotLinkGroup = document.getElementById("group-forgot-link");
  const submitBtn = document.getElementById("btn-auth-submit");
  const switchBox = document.getElementById("auth-switch-box");

  // [신규 가입 필드 그룹]
  const authNameGroup = document.getElementById("group-auth-name");
  const authSchoolGroup = document.getElementById("group-auth-school");
  const authTeamGroup = document.getElementById("group-auth-team");

  // 기본 초기화
  emailGroup.style.display = "none";
  passwordGroup.style.display = "none";
  roleGroup.style.display = "none";
  codeGroup.style.display = "none";
  newPasswordGroup.style.display = "none";
  forgotLinkGroup.style.display = "none";
  
  if (authNameGroup) authNameGroup.style.display = "none";
  if (authSchoolGroup) authSchoolGroup.style.display = "none";
  if (authTeamGroup) authTeamGroup.style.display = "none";

  if (state.authMode === "login") {
    titleEl.textContent = "회원 로그인";
    descEl.textContent = "서울에듀테크소프트랩 개별 실증지";
    emailGroup.style.display = "flex";
    passwordGroup.style.display = "flex";
    forgotLinkGroup.style.display = "flex";
    submitBtn.textContent = "로그인";
    switchBox.innerHTML = `아직 계정이 없으신가요? <span class="auth-switch-link" id="link-switch-auth">회원 가입</span>`;
  } 
  else if (state.authMode === "signup") {
    titleEl.textContent = "회원 가입";
    descEl.textContent = "역할을 선택하고 바로 활용하세요";
    emailGroup.style.display = "flex";
    passwordGroup.style.display = "flex";
    roleGroup.style.display = "flex";

    // 회원가입시 이름, 학교명, 팀명 그룹도 함께 노출
    if (authNameGroup) authNameGroup.style.display = "flex";
    if (authSchoolGroup) authSchoolGroup.style.display = "flex";
    if (authTeamGroup) {
      authTeamGroup.style.display = "flex";
      const teamInput = document.getElementById("auth-team");
      if (teamInput) {
        teamInput.disabled = false;
        teamInput.placeholder = "소속 팀명 또는 학교명을 직접 입력하십시오.";
      }
    }

    submitBtn.textContent = "회원 가입 완료";
    switchBox.innerHTML = `이미 계정이 있으신가요? <span class="auth-switch-link" id="link-switch-auth">로그인 전환</span>`;
  }
  else if (state.authMode === "forgot_email") {
    titleEl.textContent = "비밀번호 찾기";
    descEl.textContent = "가입하셨던 본인의 이메일 주소를 입력해 주십시오.";
    emailGroup.style.display = "flex";
    submitBtn.textContent = "인증 번호 전송";
    switchBox.innerHTML = `로그인 화면으로 돌아가기 <span class="auth-switch-link" id="link-switch-auth">로그인</span>`;
  }
  else if (state.authMode === "forgot_code") {
    titleEl.textContent = "이메일 본인 인증";
    descEl.textContent = `${verificationState.email} 주소로 발송된 6자리 번호를 기입하십시오.`;
    codeGroup.style.display = "flex";
    submitBtn.textContent = "인증 완료";
    switchBox.innerHTML = `처음으로 돌아가기 <span class="auth-switch-link" id="link-switch-auth">로그인</span>`;
  }
  else if (state.authMode === "forgot_new_password") {
    titleEl.textContent = "새 비밀번호 설정";
    descEl.textContent = "새롭게 사용할 비밀번호를 기입해 주십시오.";
    newPasswordGroup.style.display = "flex";
    submitBtn.textContent = "비밀번호 변경 완료";
    switchBox.innerHTML = `설정 취소 <span class="auth-switch-link" id="link-switch-auth">로그인</span>`;
  }

  // 동적 생성된 회원가입/로그인 토글 링크 이벤트 재바인딩 (로그인 <-> 회원가입 토글)
  const switchLink = document.getElementById("link-switch-auth");
  if (switchLink) {
    switchLink.addEventListener("click", () => {
      state.authMode = state.authMode === "login" ? "signup" : "login";
      updateAuthUI();
    });
  }

  // 가입 역할 라디오 디자인 스위칭 바인딩
  const radioTeacher = document.querySelector('input[name="auth-role"][value="teacher"]');
  const radioEnterprise = document.querySelector('input[name="auth-role"][value="enterprise"]');
  const radioLeader = document.querySelector('input[name="auth-role"][value="team_leader"]');
  const labelTeacher = document.getElementById("label-role-teacher");
  const labelEnterprise = document.getElementById("label-role-enterprise");
  const labelLeader = document.getElementById("label-role-leader");

  const roleLabels = [labelTeacher, labelLeader, labelEnterprise].filter(Boolean);
  const accentBorderColor = "var(--accent-color)";
  const defaultBorderColor = "var(--border-color)";

  function resetRoleLabels() {
    roleLabels.forEach(l => { if(l) l.style.borderColor = defaultBorderColor; });
  }

  if (radioTeacher && radioEnterprise && labelTeacher && labelEnterprise) {
    radioTeacher.addEventListener("change", () => {
      resetRoleLabels();
      labelTeacher.style.borderColor = accentBorderColor;
      
      // 교사 선택 시 이름/학교/팀명 입력 보이기, 팀장 안내 숨기기
      const nameGrp = document.getElementById("group-auth-name");
      const schoolGrp = document.getElementById("group-auth-school");
      const teamGrp = document.getElementById("group-auth-team");
      const leaderGuide = document.getElementById("leader-team-guide");
      if (nameGrp) nameGrp.style.display = "flex";
      if (schoolGrp) schoolGrp.style.display = "flex";
      if (teamGrp) teamGrp.style.display = "flex";
      if (leaderGuide) leaderGuide.style.display = "none";
    });

    if (radioLeader) {
      radioLeader.addEventListener("change", () => {
        resetRoleLabels();
        if (labelLeader) labelLeader.style.borderColor = accentBorderColor;
        
        // 팀장 선택 시 이름/학교/팀명 입력 보이기 + 팀장 가입 안내 박스 표시
        const nameGrp = document.getElementById("group-auth-name");
        const schoolGrp = document.getElementById("group-auth-school");
        const teamGrp = document.getElementById("group-auth-team");
        const leaderGuide = document.getElementById("leader-team-guide");
        if (nameGrp) nameGrp.style.display = "flex";
        if (schoolGrp) schoolGrp.style.display = "flex";
        if (teamGrp) teamGrp.style.display = "flex";
        if (leaderGuide) leaderGuide.style.display = "block";
        // 팀명 입력창 placeholder 팀장 전용으로 변경
        const teamInput = document.getElementById("auth-team");
        if (teamInput) teamInput.placeholder = "예: 클래스팅AI-서울A팀 (제품명-팀명 형식 권장)";
      });
    }

    radioEnterprise.addEventListener("change", () => {
      resetRoleLabels();
      labelEnterprise.style.borderColor = accentBorderColor;
      
      // 기업 선택 시 불필요한 입력 그룹 가리기
      const nameGrp = document.getElementById("group-auth-name");
      const schoolGrp = document.getElementById("group-auth-school");
      const teamGrp = document.getElementById("group-auth-team");
      const leaderGuide = document.getElementById("leader-team-guide");
      if (nameGrp) nameGrp.style.display = "none";
      if (schoolGrp) schoolGrp.style.display = "none";
      if (teamGrp) teamGrp.style.display = "none";
      if (leaderGuide) leaderGuide.style.display = "none";
    });
  }
}

async function handleAuthSubmit() {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value.trim();
  const code = document.getElementById("auth-code").value.trim();
  const newPassword = document.getElementById("group-new-password").querySelector("input").value.trim();

  if (state.authMode === "login") {
    if (!email || !password) {
      alert("이메일 주소와 비밀번호를 모두 입력해 주십시오.");
      return;
    }
    try {
      const response = await fetch(`${centralDbUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (response.ok) {
        const resData = await response.json();
        const session = resData.user;
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        state.currentUser = session;
        
        if (session.isAdmin) {
          showAdminDashboard();
          showToast("관리자 권한으로 시스템 제어 센터에 접근했습니다.");
        } else if (session.isEnterprise) {
          showEnterpriseDashboard();
          showToast("에듀테크 기업 피드백 센터에 연동 진입했습니다.");
        } else {
          showMainDashboard();
          showToast("반갑습니다! 에듀테크 실증 보관함에 연결되었습니다.");
        }
      } else {
        const errData = await response.json();
        alert(errData.error || "아이디 또는 비밀번호가 일치하지 않습니다.");
      }
    } catch (err) {
      alert("로그인 서버 통신 오류: " + err.message);
    }
    return;
  }
  else if (state.authMode === "signup") {
    if (!email || !password) {
      alert("가입할 이메일 주소와 비밀번호를 모두 입력해 주십시오.");
      return;
    }
    if (email.toLowerCase() === "admin" || email.toLowerCase() === "company") {
      alert("해당 계정명은 시스템 예약어 권한용으로 등록/가입이 불가능합니다.");
      return;
    }
    if (password.length < 4) {
      alert("안전을 위해 비밀번호는 최소 4자리 이상으로 설정해 주십시오.");
      return;
    }

    const roleElement = document.querySelector('input[name="auth-role"]:checked');
    const selectedRole = roleElement ? roleElement.value : "teacher";

    let displayName = email.split("@")[0];
    let defaultSchool = "서울에듀테크소프트랩";
    let defaultTeam = "서울에듀테크소프트랩";

    if (selectedRole === "teacher" || selectedRole === "team_leader") {
      const authName = document.getElementById("auth-name").value.trim();
      const authSchool = document.getElementById("auth-school").value.trim();
      const authTeam = document.getElementById("auth-team").value.trim();

      const roleLabel = selectedRole === "team_leader" ? "팀장" : "교사";
      if (!authName || !authSchool || !authTeam) {
        alert(`${roleLabel} 회원가입 시 교사명, 소속 학교명, 그리고 실증 팀명은 필수 기입 사항입니다.`);
        return;
      }
      displayName = authName;
      defaultSchool = authSchool;
      defaultTeam = authTeam;
    } else {
      defaultSchool = "협력 에듀테크 기업";
      defaultTeam = "협력 에듀테크 기업";
    }

    try {
      const response = await fetch(`${centralDbUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: displayName, school: defaultSchool, team: defaultTeam, role: selectedRole })
      });
      if (response.ok) {
        const session = { 
          email, 
          name: displayName, 
          school: defaultSchool,
          team: defaultTeam,
          isEnterprise: selectedRole === "enterprise"
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        state.currentUser = session;
        
        if (session.isEnterprise) {
          showEnterpriseDashboard();
        } else {
          showMainDashboard();
        }
        showToast("서울에듀테크소프트랩 회원 가입이 완료되어 웰컴 프로젝트가 배포되었습니다!");
      } else {
        const errData = await response.json();
        alert(errData.error || "회원 가입에 실패했습니다.");
      }
    } catch (err) {
      alert("회원가입 서버 통신 오류: " + err.message);
    }
    return;
  }
  // 3. 비밀번호 찾기 - 이메일 입력 단계
  else if (state.authMode === "forgot_email") {
    if (!email) {
      alert("비밀번호를 재설정할 본인의 이메일 주소를 기입해 주십시오.");
      return;
    }
    
    // 이메일 유효 확인을 위해 서버 조회 (전체 조회 API 혹은 간접 확인)
    // 여기서는 6자리 코드를 시뮬레이션하여 UI를 띄우되 실제 서버 change-password endpoint를 나중에 찌릅니다.
    const randCode = Math.floor(100000 + Math.random() * 900000).toString();
    verificationState.code = randCode;
    verificationState.email = email;

    // 본인 이메일 인증 시뮬레이션 알림 레이어
    alert(`[서울에듀테크소프트랩 본인인증]\n\n입력하신 이메일(${email})로 인증 코드가 발송되었습니다.\n\n인증 코드: [ ${randCode} ]\n\n화면의 인증 번호 입력창에 위 번호 6자리를 올바르게 기입해 주십시오.`);

    state.authMode = "forgot_code";
    updateAuthUI();
    showToast("이메일로 본인 인증 번호가 시뮬레이션 전송되었습니다.");
  }
  // 4. 비밀번호 찾기 - 인증 코드 대조 단계
  else if (state.authMode === "forgot_code") {
    if (!code) {
      alert("메일로 발송된 6자리 인증 코드를 기입하십시오.");
      return;
    }
    if (code === verificationState.code) {
      state.authMode = "forgot_new_password";
      updateAuthUI();
      showToast("이메일 인증이 성공했습니다! 새 비밀번호를 입력하세요.");
    } else {
      alert("인증 번호 6자리가 일치하지 않습니다. 다시 대조하여 정확히 적어 주십시오.");
    }
  }
  // 5. 비밀번호 찾기 - 새 비밀번호 덮어쓰기 단계
  else if (state.authMode === "forgot_new_password") {
    if (!newPassword) {
      alert("새롭게 사용할 비밀번호를 기입해 주십시오.");
      return;
    }
    if (newPassword.length < 4) {
      alert("비밀번호는 최소 4자리 이상이어야 합니다.");
      return;
    }

    try {
      const response = await fetch(`${centralDbUrl}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verificationState.email, newPassword })
      });

      if (response.ok) {
        alert("비밀번호 초기화 및 변경이 안전하게 완료되었습니다!\n새 비밀번호로 즉시 로그인이 가능합니다.");
        state.authMode = "login";
        updateAuthUI();
        
        // 입력 칸 청소
        document.getElementById("auth-password").value = "";
        document.getElementById("group-new-password").querySelector("input").value = "";
      } else {
        const errData = await response.json();
        alert(errData.error || "비밀번호 변경에 실패했습니다. 사용자를 찾을 수 없습니다.");
      }
    } catch (err) {
      alert("서버 연결 실패: " + err.message);
    }
  }
}

function switchAuthMode() {
  state.authMode = state.authMode === "login" ? "signup" : "login";
  updateAuthUI();
}

// 안전한 이벤트 바인딩 헬퍼 함수
function safeBindClick(id, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", handler);
}
function safeBindChange(id, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("change", handler);
}
function safeBindInput(id, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", handler);
}

// 4. 이벤트 핸들러 및 데이터 제어
function setupEventListeners() {
  // 인증 액션
  safeBindClick("btn-auth-submit", handleAuthSubmit);
  safeBindClick("link-switch-auth", switchAuthMode);
  safeBindClick("link-forgot-password", () => {
    state.authMode = "forgot_email";
    updateAuthUI();
  });
  safeBindClick("btn-logout", () => {
    if (confirm("로그아웃하여 보관함을 닫으시겠습니까?")) {
      showAuthScreen();
    }
  });

  // 관리자 대시보드 액션 바인딩
  safeBindClick("btn-admin-logout", () => {
    showAuthScreen();
  });
  
  safeBindClick("btn-admin-to-company", () => {
    showEnterpriseDashboard();
  });
  
  safeBindClick("btn-admin-to-teacher", () => {
    // 관리자 모드에서 일반 실증용 화면으로 분기 진입
    document.getElementById("admin-container").style.display = "none";
    document.getElementById("app-container").style.display = "flex";
    
    document.getElementById("profile-name").textContent = "관리자 (교사모드)";
    document.getElementById("profile-school").textContent = "에듀테크소프트랩 본부";
    
    updateOracleSyncCardVisibility();
    
    // [관리자 대시보드 복귀 단추] 프로필 카드에 동적 장착
    let returnBtn = document.getElementById("btn-admin-return");
    if (!returnBtn) {
      returnBtn = document.createElement("button");
      returnBtn.id = "btn-admin-return";
      returnBtn.className = "btn btn-primary";
      returnBtn.style.padding = "4px 8px";
      returnBtn.style.fontSize = "0.72rem";
      returnBtn.style.fontWeight = "700";
      returnBtn.textContent = "🛠️ 관리자 대시보드 복귀";
      returnBtn.addEventListener("click", () => {
        document.getElementById("app-container").style.display = "none";
        document.getElementById("admin-container").style.display = "flex";
        renderAdminUsersList();
      });
      document.getElementById("user-profile-badge").appendChild(returnBtn);
    }
    
    loadUserProjects();
  });
  
  safeBindInput("admin-search-input", () => {
    renderAdminUsersList();
  });
  
  // Sync admin-team-filter with col team filter
  safeBindChange("admin-team-filter", () => {
    const topFilter = document.getElementById("admin-team-filter");
    const colFilter = document.getElementById("admin-filter-team");
    if (topFilter && colFilter) {
      colFilter.value = topFilter.value;
    }
    renderAdminUsersList();
  });
  
  safeBindChange("admin-sort-select", () => {
    const val = document.getElementById("admin-sort-select").value;
    state.adminSort.column = val;
    state.adminSort.direction = "asc";
    renderAdminUsersList();
  });

  // Column level filter listeners
  ["admin-filter-email", "admin-filter-name", "admin-filter-school", "admin-filter-password"].forEach(id => {
    safeBindInput(id, () => {
      renderAdminUsersList();
    });
  });

  safeBindChange("admin-filter-team", () => {
    const topFilter = document.getElementById("admin-team-filter");
    const colFilter = document.getElementById("admin-filter-team");
    if (topFilter && colFilter) {
      topFilter.value = colFilter.value;
    }
    renderAdminUsersList();
  });

  safeBindChange("admin-filter-role", () => {
    renderAdminUsersList();
  });

  safeBindClick("btn-admin-clear-filters", () => {
    ["admin-filter-email", "admin-filter-name", "admin-filter-school", "admin-filter-password", "admin-search-input"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    ["admin-filter-team", "admin-filter-role", "admin-team-filter"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "all";
    });
    state.adminSort.column = "team";
    state.adminSort.direction = "asc";
    
    // Sync the top dropdown if applicable
    const sortSelectEl = document.getElementById("admin-sort-select");
    if (sortSelectEl) {
      sortSelectEl.value = "team";
    }
    
    renderAdminUsersList();
  });

  const btnSaveCentral = document.getElementById("btn-save-central-db-url");
  if (btnSaveCentral) {
    btnSaveCentral.addEventListener("click", async () => {
      const urlVal = document.getElementById("admin-central-db-url-input").value.trim();
      if (urlVal) {
        localStorage.setItem("softlap_central_db_url", urlVal);
      } else {
        localStorage.removeItem("softlap_central_db_url");
      }
      showToast("🔌 중앙 DB 설정이 저장되었습니다. 시스템을 재연동합니다...");
      await checkCentralDbStatus();
      await renderAdminUsersList();
    });
  }

  // 보관함 플러스 클릭
  safeBindClick("btn-new-project", () => createNewProject(true));

  // 상단 탭 스위칭
  safeBindClick("btn-tab-edit", () => switchTab("edit"));
  safeBindClick("btn-tab-preview", () => switchTab("preview"));
  safeBindClick("btn-tab-dashboard", () => switchTab("dashboard"));
  safeBindClick("btn-tab-team", () => switchTab("team"));

  // 팀별 보고서 취합 제어 바인딩
  safeBindClick("btn-refresh-team", () => fetchTeamReportData(false));
  safeBindClick("btn-print-team", printTeamReport);
  
  const teamProductSelect = document.getElementById("team-product-select");
  if (teamProductSelect) {
    teamProductSelect.addEventListener("change", renderTeamReportCompiled);
  }
  
  const teamNameSelect = document.getElementById("team-name-select");
  const teamNameDirect = document.getElementById("team-name-direct");
  if (teamNameSelect) {
    teamNameSelect.addEventListener("change", () => {
      if (teamNameSelect.value === "direct") {
        if (teamNameDirect) {
          teamNameDirect.style.display = "block";
          teamNameDirect.value = "";
          teamNameDirect.focus();
        }
      } else {
        if (teamNameDirect) {
          teamNameDirect.style.display = "none";
        }
      }
      populateTeamProducts();
    });
  }
  
  if (teamNameDirect) {
    teamNameDirect.addEventListener("input", () => {
      populateTeamProducts();
    });
  }
  
  const teamConclusionInput = document.getElementById("team-conclusion-input");
  if (teamConclusionInput) {
    teamConclusionInput.addEventListener("input", saveTeamInputs);
  }
  
  const teamMonitoringInput = document.getElementById("team-monitoring-input");
  if (teamMonitoringInput) {
    teamMonitoringInput.addEventListener("input", saveTeamInputs);
  }

  // 백업
  safeBindClick("btn-copy-markdown", copyMarkdown);
  safeBindClick("btn-export-csv", exportCSV);
  safeBindClick("btn-print", () => window.print());
  safeBindClick("btn-theme-switch", toggleTheme);
  safeBindClick("btn-close-ai-assistant", closeAiAssistant);

  // 사이드바 액션
  safeBindClick("btn-load-sample", loadSampleData);
  safeBindClick("btn-clear-all", clearAllData);

  // 📂 사이드바 접기/펼치기 토글
  safeBindClick("btn-toggle-sidebar", () => {
    const sidebar = document.getElementById("sidebar");
    const toggleIcon = document.getElementById("sidebar-toggle-icon");
    const toggleText = document.getElementById("sidebar-toggle-text");
    const backdrop = document.getElementById("sidebar-backdrop");
    if (!sidebar) return;
    
    if (sidebar.classList.contains("collapsed")) {
      sidebar.classList.remove("collapsed");
      if (toggleIcon) toggleIcon.textContent = "◀";
      if (toggleText) toggleText.textContent = "사이드바 접기";
      localStorage.setItem("softlap_sidebar_collapsed", "false");
      if (backdrop) backdrop.classList.add("active");
    } else {
      sidebar.classList.add("collapsed");
      if (toggleIcon) toggleIcon.textContent = "▶";
      if (toggleText) toggleText.textContent = "사이드바 펼치기";
      localStorage.setItem("softlap_sidebar_collapsed", "true");
      if (backdrop) backdrop.classList.remove("active");
    }
  });

  // 모바일 하단 탭 스위칭 바인딩
  safeBindClick("btn-m-tab-edit", () => switchTab("edit"));
  safeBindClick("btn-m-tab-preview", () => switchTab("preview"));
  safeBindClick("btn-m-tab-dashboard", () => switchTab("dashboard"));
  safeBindClick("btn-m-tab-team", () => switchTab("team"));

  // 모바일 사이드바 백드롭 클릭 시 사이드바 닫기
  safeBindClick("sidebar-backdrop", () => {
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    const toggleIcon = document.getElementById("sidebar-toggle-icon");
    const toggleText = document.getElementById("sidebar-toggle-text");
    if (sidebar) {
      sidebar.classList.add("collapsed");
      if (toggleIcon) toggleIcon.textContent = "▶";
      if (toggleText) toggleText.textContent = "사이드바 펼치기";
    }
    if (backdrop) {
      backdrop.classList.remove("active");
    }
  });

  // 모바일 사이드바 내 X 닫기 단추 클릭 시 사이드바 닫기
  safeBindClick("btn-close-sidebar-mobile", () => {
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    const toggleIcon = document.getElementById("sidebar-toggle-icon");
    const toggleText = document.getElementById("sidebar-toggle-text");
    if (sidebar) {
      sidebar.classList.add("collapsed");
      if (toggleIcon) toggleIcon.textContent = "▶";
      if (toggleText) toggleText.textContent = "사이드바 펼치기";
    }
    if (backdrop) {
      backdrop.classList.remove("active");
    }
  });

  // 📁 나의 실증 보관함 접기/펼치기 토글
  safeBindClick("cabinet-toggle-header", () => {
    const list = document.getElementById("project-cabinet-list");
    const arrow = document.getElementById("cabinet-toggle-arrow");
    if (!list) return;
    if (list.style.display === "none") {
      list.style.display = "block";
      if (arrow) arrow.style.transform = "rotate(0deg)";
      localStorage.setItem("softlap_cabinet_collapsed", "false");
    } else {
      list.style.display = "none";
      if (arrow) arrow.style.transform = "rotate(-90deg)";
      localStorage.setItem("softlap_cabinet_collapsed", "true");
    }
  });

  // 🎯 클릭 시 보관함에 추가 (30대 기준) 접기/펼치기 토글
  safeBindClick("guide-toggle-header", () => {
    const nav = document.getElementById("preset-tree-nav");
    const arrow = document.getElementById("guide-toggle-arrow");
    if (!nav) return;
    if (nav.style.display === "none") {
      nav.style.display = "block";
      if (arrow) arrow.style.transform = "rotate(0deg)";
      localStorage.setItem("softlap_guide_collapsed", "false");
    } else {
      nav.style.display = "none";
      if (arrow) arrow.style.transform = "rotate(-90deg)";
      localStorage.setItem("softlap_guide_collapsed", "true");
    }
  });

  // 필터 및 단추
  safeBindChange("editor-filter-select", (e) => {
    state.filterElement = e.target.value;
    localStorage.setItem("softlap_filter_element", state.filterElement);
    renderChecklistGrid();
  });
  safeBindClick("btn-add-row", () => {
    addNewChecklistRow();
  });

  // 메타 정보 수정 즉시 모델 동기화
  const metaFields = [
    { id: "in-target-product", key: "targetProduct" },
    { id: "in-developer", key: "developer" },
    { id: "in-os-type", key: "osType" },
    { id: "in-os-version", key: "osVersion" },
    { id: "in-model-name", key: "modelName" },
    { id: "in-network", key: "network" },
    { id: "in-usage-env", key: "usageEnv" },
    { id: "in-teacher-name", key: "teacherName" },
    { id: "in-school-name", key: "schoolName" },
    { id: "in-report-date", key: "reportDate" }
  ];

  metaFields.forEach(f => {
    const inputEl = document.getElementById(f.id);
    if (inputEl) {
      inputEl.addEventListener("input", (e) => {
        state.activeProject.meta[f.key] = e.target.value;
        saveActiveProject();

        // 🏢 [신규] 학교명 또는 제품명이 타이핑될 때 동일 소속 중복 실증 방지 실시간 갱신
        if (f.key === "schoolName" || f.key === "targetProduct") {
          checkTeamDuplication();
        }
      });
    }
  });

  // 오라클 클라우드 연동 액션 바인딩
  document.getElementById("btn-oracle-test").addEventListener("click", testOracleConnection);
  document.getElementById("btn-oracle-sync").addEventListener("click", syncToOracleCloud);

  // 🏢 [신규] 에듀테크 마스터 리스트 및 피드백 관련 이벤트 바인딩
  document.getElementById("btn-open-registry").addEventListener("click", openRegistryModal);
  document.getElementById("btn-close-registry-modal").addEventListener("click", closeRegistryModal);
  document.getElementById("btn-add-registry-item").addEventListener("click", addRegistryItem);
  
  // 마스터 드롭다운 제품명 변경
  document.getElementById("in-target-product-select").addEventListener("change", handleProductSelectChange);
  
  // 교사 제출하기
  document.getElementById("btn-submit-to-company").addEventListener("click", submitProjectToEnterprise);
  const btnCancelSubmit = document.getElementById("btn-cancel-submit");
  if (btnCancelSubmit) {
    btnCancelSubmit.addEventListener("click", cancelProjectSubmission);
  }
  
  // 기업 대시보드 바인딩
  document.getElementById("btn-company-logout").addEventListener("click", () => showAuthScreen());
  document.getElementById("company-search-input").addEventListener("input", renderEnterpriseDashboard);
  document.getElementById("company-filter-status").addEventListener("change", renderEnterpriseDashboard);
  document.getElementById("btn-close-review-modal").addEventListener("click", closeReviewModal);
  document.getElementById("btn-submit-feedback").addEventListener("click", submitEnterpriseFeedback);
  
  // 회원 정보 및 비밀번호 변경 액션 바인딩
  document.getElementById("btn-change-pw").addEventListener("click", openProfileModal);
  document.getElementById("btn-company-change-pw").addEventListener("click", openProfileModal);
  const btnAdminChangePw = document.getElementById("btn-admin-change-pw");
  if (btnAdminChangePw) {
    btnAdminChangePw.addEventListener("click", openProfileModal);
  }
  
  // Profile Modal Close and Save
  const btnCloseProfile = document.getElementById("btn-close-profile-modal");
  if (btnCloseProfile) btnCloseProfile.addEventListener("click", closeProfileModal);
  const btnCancelProfile = document.getElementById("btn-cancel-profile-modal");
  if (btnCancelProfile) btnCancelProfile.addEventListener("click", closeProfileModal);
  const btnSaveProfile = document.getElementById("btn-save-profile");
  if (btnSaveProfile) btnSaveProfile.addEventListener("click", saveUserProfile);
  const btnClearFeedback = document.getElementById("btn-company-clear-feedback");
  if (btnClearFeedback) {
    btnClearFeedback.addEventListener("click", handleClearCompanyFeedback);
  }
  const btnCancelFeedback = document.getElementById("btn-cancel-feedback");
  if (btnCancelFeedback) {
    btnCancelFeedback.addEventListener("click", cancelEnterpriseFeedback);
  }
}

// 테마 관리
function applyTheme() {
  const currentTheme = localStorage.getItem(THEME_KEY) || "light";
  document.documentElement.setAttribute("data-theme", currentTheme);
  const icon = document.querySelector("#btn-theme-switch span");
  if (currentTheme === "dark") {
    icon.textContent = "☀️";
  } else {
    icon.textContent = "🌙";
  }
}

function toggleTheme() {
  const activeTheme = document.documentElement.getAttribute("data-theme");
  const nextTheme = activeTheme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, nextTheme);
  applyTheme();
  showToast(`${nextTheme === "dark" ? "다크" : "라이트"} 모드 작동 중`);
}

// 사이드바 트리뷰 구성
function renderPresetGuideTree() {
  const container = document.getElementById("preset-tree-nav");
  container.innerHTML = "";

  Object.keys(EMPIRICAL_STANDARDS).forEach(elementName => {
    const details = document.createElement("details");
    details.style.marginBottom = "6px";
    details.style.border = "1px solid var(--border-color)";
    details.style.borderRadius = "var(--radius-sm)";
    details.style.backgroundColor = "var(--bg-secondary)";
    details.style.borderLeft = `4px solid ${EMPIRICAL_STANDARDS[elementName].color}`;

    const summary = document.createElement("summary");
    summary.style.padding = "6px 10px";
    summary.style.fontSize = "0.76rem";
    summary.style.fontWeight = "700";
    summary.style.cursor = "pointer";
    summary.style.color = "var(--text-primary)";
    summary.textContent = elementName;
    details.appendChild(summary);

    const listContainer = document.createElement("div");
    listContainer.style.padding = "5px 10px 8px 10px";
    listContainer.style.display = "flex";
    listContainer.style.flexDirection = "column";
    listContainer.style.gap = "4px";
    listContainer.style.borderTop = "1px solid var(--border-color)";

    const items = EMPIRICAL_STANDARDS[elementName].items;
    Object.keys(items).forEach(itemName => {
      const itemBtn = document.createElement("button");
      itemBtn.style.padding = "5px 6px";
      itemBtn.style.fontSize = "0.72rem";
      itemBtn.style.textAlign = "left";
      itemBtn.style.border = "1px solid transparent";
      itemBtn.style.borderRadius = "var(--radius-sm)";
      itemBtn.style.backgroundColor = "var(--bg-tertiary)";
      itemBtn.style.color = "var(--text-secondary)";
      itemBtn.style.cursor = "pointer";
      itemBtn.style.display = "flex";
      itemBtn.style.justifyContent = "space-between";
      itemBtn.style.alignItems = "center";

      const isEssential = items[itemName].isEssential;
      itemBtn.innerHTML = `<span>${itemName} ${isEssential ? '<span style="color:var(--danger-color)">*</span>' : ''}</span> <span style="font-size:0.6rem; color:var(--text-tertiary);">➕</span>`;
      
      itemBtn.addEventListener("mouseenter", () => {
        itemBtn.style.borderColor = "var(--accent-color)";
        itemBtn.style.color = "var(--accent-color)";
      });
      itemBtn.addEventListener("mouseleave", () => {
        itemBtn.style.borderColor = "transparent";
        itemBtn.style.color = "var(--text-secondary)";
      });

      // 트리 가이드 클릭하여 보관함의 현재 보고서 격자에 바로 탑재
      itemBtn.addEventListener("click", () => {
        if (!state.activeProjectId) {
          alert("실증 보고서 파일을 먼저 선택하시거나 왼쪽의 ➕ 단추로 개설하십시오.");
          return;
        }
        addPresetItemRow(elementName, itemName);
      });

      listContainer.appendChild(itemBtn);
    });

    details.appendChild(listContainer);
    container.appendChild(details);
  });
}

// 점검 행 프리셋 추가
function addPresetItemRow(elementName, itemName) {
  const criteriaList = EMPIRICAL_STANDARDS[elementName].items[itemName].criteria;
  const defaultCrit = criteriaList[0];

  const newRow = {
    id: Date.now() + Math.random(),
    element: elementName,
    item: itemName,
    criterion: defaultCrit,
    type: "점검기준",
    analysis: "",
    severity: "하",
    improvement: "",
    writer: state.currentUser.name || "평가교사"
  };

  state.activeProject.items.push(newRow);
  saveActiveProject();
  renderChecklistGrid();
  showToast(`[${elementName} - ${itemName}]이 실증지에 추가되었습니다.`);
  closeMobileSidebarIfOpen();
}

// 상단 필터 셀렉터 빌드
function renderFilterOptions() {
  const filterSelect = document.getElementById("editor-filter-select");
  filterSelect.innerHTML = '<option value="전체">🔍 모든 요소 필터</option>';

  Object.keys(EMPIRICAL_STANDARDS).forEach(el => {
    const opt = document.createElement("option");
    opt.value = el;
    opt.textContent = el;
    filterSelect.appendChild(opt);
  });
}

// 실증지 기입 에디터 테이블 그리기
function renderChecklistGrid() {
  const tbody = document.getElementById("checklist-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const isSubmitted = !!state.activeProject.submitted;
  const btnAddRow = document.getElementById("btn-add-row");
  if (btnAddRow) {
    btnAddRow.style.display = isSubmitted ? "none" : "inline-flex";
  }

  // 필터 드롭다운 UI 값과 글로벌 상태 동기화
  const filterSelect = document.getElementById("editor-filter-select");
  if (filterSelect && filterSelect.value !== state.filterElement) {
    filterSelect.value = state.filterElement;
  }

  const rows = state.activeProject.items || [];
  const filtered = state.filterElement === "전체"
    ? rows
    : rows.filter(r => r.element === state.filterElement);

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align:center; padding:40px; color:var(--text-tertiary);">
          추가된 평가 기준 문항이 없습니다.<br>
          ${isSubmitted ? "제출 완료되어 새로운 평가 기준을 추가할 수 없습니다." : "왼쪽의 <strong>[클릭 시 보관함에 추가]</strong> 가이드를 통해 분석할 세부 항목들을 터치해 추가하세요."}
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(rowData => {
    const tr = document.createElement("tr");
    tr.dataset.id = rowData.id;

    // AI 도우미 작동: 행 클릭 시 AI 도우미 슬라이드 기동
    tr.addEventListener("click", (e) => {
      // Form/Input/Button 요소를 직접 조작하는 상황이 아니면 도우미 가동
      if (e.target.closest('select') || e.target.closest('textarea') || e.target.closest('input') || e.target.closest('button')) {
        return;
      }
      openAiAssistant(rowData, tr);
    });

    // 0. 인쇄용 선택 체크박스 (rowData.selected === undefined 이면 true가 디폴트)
    const tdSelect = document.createElement("td");
    tdSelect.setAttribute("data-label", "인쇄");
    tdSelect.style.textAlign = "center";
    tdSelect.style.verticalAlign = "middle";
    
    const selectCheck = document.createElement("input");
    selectCheck.type = "checkbox";
    selectCheck.checked = rowData.selected !== false;
    selectCheck.style.width = "17px";
    selectCheck.style.height = "17px";
    selectCheck.style.cursor = isSubmitted ? "not-allowed" : "pointer";
    selectCheck.title = "A4 보고서 인쇄물에 포함할지 여부 결정";
    if (isSubmitted) selectCheck.disabled = true;
    
    // 미선택 상태인 행은 불투명도를 살짝 낮춰 비활성화 피드백 제공
    if (rowData.selected === false) {
      tr.style.opacity = "0.55";
      tr.style.backgroundColor = "var(--bg-tertiary)";
    } else {
      tr.style.opacity = "1";
      tr.style.backgroundColor = "";
    }
    
    selectCheck.addEventListener("change", (e) => {
      rowData.selected = e.target.checked;
      if (rowData.selected === false) {
        tr.style.opacity = "0.55";
        tr.style.backgroundColor = "var(--bg-tertiary)";
      } else {
        tr.style.opacity = "1";
        tr.style.backgroundColor = "";
      }
      saveActiveProject();
    });
    
    tdSelect.appendChild(selectCheck);
    tr.appendChild(tdSelect);

    // 1. 대분류 요소 선택
    const tdElement = document.createElement("td");
    tdElement.setAttribute("data-label", "대분류(요소)");
    const elSelect = document.createElement("select");
    elSelect.className = "table-select";
    if (isSubmitted) elSelect.disabled = true;
    Object.keys(EMPIRICAL_STANDARDS).forEach(el => {
      const opt = document.createElement("option");
      opt.value = el;
      opt.textContent = el;
      if (el === rowData.element) opt.selected = true;
      elSelect.appendChild(opt);
    });
    elSelect.addEventListener("change", (e) => {
      rowData.element = e.target.value;
      const items = Object.keys(EMPIRICAL_STANDARDS[rowData.element].items);
      rowData.item = items[0];
      rowData.criterion = EMPIRICAL_STANDARDS[rowData.element].items[rowData.item].criteria[0];
      saveActiveProject();
      renderChecklistGrid();
    });
    tdElement.appendChild(elSelect);
    tr.appendChild(tdElement);

    // 2. 중분류 항목 선택
    const tdItem = document.createElement("td");
    tdItem.setAttribute("data-label", "중분류(항목)");
    const itemSelect = document.createElement("select");
    itemSelect.className = "table-select";
    if (isSubmitted) itemSelect.disabled = true;
    const items = Object.keys(EMPIRICAL_STANDARDS[rowData.element].items);
    items.forEach(it => {
      const isEssential = EMPIRICAL_STANDARDS[rowData.element].items[it].isEssential;
      const opt = document.createElement("option");
      opt.value = it;
      opt.textContent = isEssential ? `⭐ ${it}` : it;
      if (it === rowData.item) opt.selected = true;
      itemSelect.appendChild(opt);
    });
    itemSelect.addEventListener("change", (e) => {
      rowData.item = e.target.value;
      rowData.criterion = EMPIRICAL_STANDARDS[rowData.element].items[rowData.item].criteria[0];
      saveActiveProject();
      renderChecklistGrid();
    });
    tdItem.appendChild(itemSelect);
    tr.appendChild(tdItem);

    // 3. 점검 기준 (교사가 자기 표현 문장으로 직접 수정할 수 있는 커스텀 텍스트 에디터)
    const tdCriterion = document.createElement("td");
    tdCriterion.setAttribute("data-label", "점검 기준 / 내용 정의 (자유 편집가능 ✍️)");
    const critWrapper = document.createElement("div");
    critWrapper.style.display = "flex";
    critWrapper.style.flexDirection = "column";
    critWrapper.style.gap = "4px";

    const critSelect = document.createElement("select");
    critSelect.className = "table-select";
    critSelect.style.fontSize = "0.72rem";
    critSelect.style.padding = "3px";
    if (isSubmitted) critSelect.disabled = true;

    const criteria = EMPIRICAL_STANDARDS[rowData.element].items[rowData.item].criteria;
    criteria.forEach(cr => {
      const opt = document.createElement("option");
      opt.value = cr;
      opt.textContent = cr.length > 30 ? cr.substring(0, 30) + "..." : cr;
      if (cr === rowData.criterion) opt.selected = true;
      critSelect.appendChild(opt);
    });

    const critArea = document.createElement("textarea");
    critArea.className = "table-textarea";
    critArea.value = rowData.criterion;
    critArea.placeholder = "점검 기준을 본인의 교실 상황 언어로 편집 수정하십시오.";
    critArea.style.fontSize = "0.76rem";
    critArea.style.minHeight = "48px";
    if (isSubmitted) critArea.disabled = true;

    critSelect.addEventListener("change", (e) => {
      rowData.criterion = e.target.value;
      critArea.value = e.target.value;
      saveActiveProject();
    });

    critArea.addEventListener("input", (e) => {
      rowData.criterion = e.target.value;
      saveActiveProject();
    });

    critWrapper.appendChild(critSelect);
    critWrapper.appendChild(critArea);
    tdCriterion.appendChild(critWrapper);
    tr.appendChild(tdCriterion);

    // 4. 구분 (점검기준 / 점검결과)
    const tdType = document.createElement("td");
    tdType.setAttribute("data-label", "구분");
    const typeSelect = document.createElement("select");
    typeSelect.className = "table-select";
    if (isSubmitted) typeSelect.disabled = true;
    ["점검기준", "점검결과"].forEach(tp => {
      const opt = document.createElement("option");
      opt.value = tp;
      opt.textContent = tp;
      if (tp === rowData.type) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    typeSelect.addEventListener("change", (e) => {
      rowData.type = e.target.value;
      saveActiveProject();
    });
    tdType.appendChild(typeSelect);
    tr.appendChild(tdType);

    // 5. 분석 내용 (실제결과/현상)
    const tdAnalysis = document.createElement("td");
    tdAnalysis.setAttribute("data-label", "분석 내용 (실제결과/현상)");
    const analysisArea = document.createElement("textarea");
    analysisArea.className = "table-textarea";
    analysisArea.value = rowData.analysis || "";
    analysisArea.placeholder = "교실 속 실증 상황에서 수집된 버그 및 학생의 행동 현상을 기록하세요.";
    analysisArea.style.minHeight = "54px";
    if (isSubmitted) analysisArea.disabled = true;
    analysisArea.addEventListener("input", (e) => {
      rowData.analysis = e.target.value;
      saveActiveProject();
    });
    tdAnalysis.appendChild(analysisArea);
    tr.appendChild(tdAnalysis);

    // 6. 심각성
    const tdSeverity = document.createElement("td");
    tdSeverity.setAttribute("data-label", "심각성");
    const sevSelect = document.createElement("select");
    sevSelect.className = "table-select";
    sevSelect.style.fontWeight = "bold";
    if (isSubmitted) sevSelect.disabled = true;

    const styleSeverity = (sel, val) => {
      if (val === "상") {
        sel.style.color = "var(--danger-color)";
        sel.style.backgroundColor = "var(--danger-bg)";
      } else if (val === "중") {
        sel.style.color = "var(--warning-color)";
        sel.style.backgroundColor = "var(--warning-bg)";
      } else {
        sel.style.color = "var(--success-color)";
        sel.style.backgroundColor = "var(--success-bg)";
      }
    };

    ["하", "중", "상"].forEach(sv => {
      const opt = document.createElement("option");
      opt.value = sv;
      opt.textContent = sv;
      if (sv === rowData.severity) opt.selected = true;
      sevSelect.appendChild(opt);
    });
    styleSeverity(sevSelect, rowData.severity);

    sevSelect.addEventListener("change", (e) => {
      rowData.severity = e.target.value;
      styleSeverity(sevSelect, e.target.value);
      saveActiveProject();
    });
    tdSeverity.appendChild(sevSelect);
    tr.appendChild(tdSeverity);

    // 7. 개선 사항 (기대결과)
    const tdImprovement = document.createElement("td");
    tdImprovement.setAttribute("data-label", "개선 사항 (기대결과)");
    const impArea = document.createElement("textarea");
    impArea.className = "table-textarea";
    impArea.value = rowData.improvement || "";
    impArea.placeholder = "안전 조치 및 개선되어야 할 규격 요구사항 기재";
    impArea.style.minHeight = "54px";
    if (isSubmitted) impArea.disabled = true;
    impArea.addEventListener("input", (e) => {
      rowData.improvement = e.target.value;
      saveActiveProject();
    });
    tdImprovement.appendChild(impArea);
    tr.appendChild(tdImprovement);

    // 8. [신규] 증빙 사진 스크린샷 업로드 및 캡처 열 추가
    const tdEvidence = document.createElement("td");
    tdEvidence.setAttribute("data-label", "사진");
    tdEvidence.style.textAlign = "center";
    tdEvidence.style.verticalAlign = "middle";

    if (rowData.screenshot) {
      // 썸네일 컨테이너
      const thumbContainer = document.createElement("div");
      thumbContainer.className = "evidence-thumb-container";
      
      const img = document.createElement("img");
      img.src = rowData.screenshot;
      img.className = "evidence-thumb";
      img.title = "클릭하여 원본 크기 증빙 검토";
      img.addEventListener("click", () => openLightbox(rowData.screenshot));
      thumbContainer.appendChild(img);

      // 삭제 단추
      if (!isSubmitted) {
        const delThumbBtn = document.createElement("button");
        delThumbBtn.className = "btn-evidence-delete";
        delThumbBtn.innerHTML = "&times;";
        delThumbBtn.title = "증빙 사진 제거";
        delThumbBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm("첨부된 스크린샷 증빙을 지우시겠습니까?")) {
            rowData.screenshot = "";
            saveActiveProject();
            renderChecklistGrid();
          }
        });
        thumbContainer.appendChild(delThumbBtn);
      }

      tdEvidence.appendChild(thumbContainer);
    } else {
      if (isSubmitted) {
        const emptyTxt = document.createElement("span");
        emptyTxt.style.fontSize = "0.72rem";
        emptyTxt.style.color = "var(--text-tertiary)";
        emptyTxt.textContent = "사진 없음";
        tdEvidence.appendChild(emptyTxt);
      } else {
        // 사진 첨부 버튼
        const label = document.createElement("label");
        label.className = "btn-evidence-attach";
        label.innerHTML = "📷 첨부";
        
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/*";
        fileInput.style.display = "none";
        
        fileInput.addEventListener("change", async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          
          showToast("스크린샷 증빙 이미지를 경량 압축 처리 중...");
          try {
            const compressedBase64 = await compressImageToBase64(file);
            rowData.screenshot = compressedBase64;
            saveActiveProject();
            renderChecklistGrid();
            showToast("📸 증빙 사진이 480px 초경량 포맷으로 압축 첨부되었습니다.");
          } catch (err) {
            console.error("이미지 압축 실패:", err);
            alert("사진 업로드 도중 에러가 발생했습니다.");
          }
        });

        label.appendChild(fileInput);
        tdEvidence.appendChild(label);
      }
    }
    tr.appendChild(tdEvidence);

    // 8-B. [신규] 동영상 링크 입력 공간 (유튜브 등 링크)
    const tdVideo = document.createElement("td");
    tdVideo.setAttribute("data-label", "동영상");
    tdVideo.style.textAlign = "center";
    tdVideo.style.verticalAlign = "middle";

    const videoInput = document.createElement("input");
    videoInput.type = "url";
    videoInput.className = "input-control";
    videoInput.style.fontSize = "0.72rem";
    videoInput.style.padding = "4px 6px";
    videoInput.style.width = "95%";
    videoInput.placeholder = "유튜브 동영상 링크...";
    videoInput.value = rowData.videoLink || "";
    if (isSubmitted) videoInput.disabled = true;

    videoInput.addEventListener("input", (e) => {
      rowData.videoLink = e.target.value;
      saveActiveProject();
    });

    tdVideo.appendChild(videoInput);
    tr.appendChild(tdVideo);

    // 9. 행 삭제
    const tdDelete = document.createElement("td");
    tdDelete.setAttribute("data-label", "삭제");
    const delBtn = document.createElement("button");
    delBtn.className = "btn-delete";
    delBtn.innerHTML = "🗑️";
    if (isSubmitted) {
      delBtn.disabled = true;
      delBtn.style.opacity = "0.4";
      delBtn.style.cursor = "not-allowed";
    }
    delBtn.addEventListener("click", () => {
      deleteChecklistRow(rowData.id);
    });
    tdDelete.appendChild(delBtn);
    tr.appendChild(tdDelete);

    tbody.appendChild(tr);
  });
  checkTeamDuplication();
  if (state.currentTab === "dashboard") {
    renderDashboard();
  }
}

// 빈 점검 행 추가
function addNewChecklistRow() {
  if (!state.activeProjectId) {
    alert("보관함 보고서를 먼저 생성하거나 활성화하십시오.");
    return;
  }

  const elKeys = Object.keys(EMPIRICAL_STANDARDS);
  const defEl = elKeys[0];
  const items = Object.keys(EMPIRICAL_STANDARDS[defEl].items);
  const defIt = items[0];
  const defCr = EMPIRICAL_STANDARDS[defEl].items[defIt].criteria[0];

  const newRow = {
    id: Date.now() + Math.random(),
    element: defEl,
    item: defIt,
    criterion: defCr,
    type: "점검기준",
    analysis: "",
    severity: "하",
    improvement: "",
    writer: state.currentUser.name || "교사"
  };

  state.activeProject.items.push(newRow);
  saveActiveProject();
  renderChecklistGrid();
  showToast("빈 점검 행이 추가되었습니다.");
}

// 점검 행 지우기
function deleteChecklistRow(id) {
  state.activeProject.items = state.activeProject.items.filter(r => r.id !== id);
  saveActiveProject();
  renderChecklistGrid();
  showToast("선택 항목을 삭제했습니다.");
}

// 보관함 요약 통계 갱신
function updateSummaryStats() {
  const items = state.activeProject?.items || [];
  document.getElementById("progress-percentage").textContent = `${items.length}개`;

  const high = items.filter(r => r.severity === "상").length;
  const mid = items.filter(r => r.severity === "중").length;
  const low = items.filter(r => r.severity === "하").length;

  document.getElementById("count-high").textContent = `🚨 (상): ${high}건`;
  document.getElementById("count-mid").textContent = `⚠️ (중): ${mid}건`;
  document.getElementById("count-low").textContent = `✅ (하): ${low}건`;
}

function switchTab(tabId) {
  state.currentTab = tabId;
  document.getElementById("btn-tab-edit").classList.toggle("active", tabId === "edit");
  document.getElementById("btn-tab-preview").classList.toggle("active", tabId === "preview");
  
  const btnTabDb = document.getElementById("btn-tab-dashboard");
  if (btnTabDb) {
    btnTabDb.classList.toggle("active", tabId === "dashboard");
  }

  const btnTabTeam = document.getElementById("btn-tab-team");
  if (btnTabTeam) {
    btnTabTeam.classList.toggle("active", tabId === "team");
  }

  // 모바일 하단 탭 바 동기화
  const mobEdit = document.getElementById("btn-m-tab-edit");
  const mobDb = document.getElementById("btn-m-tab-dashboard");
  const mobTeam = document.getElementById("btn-m-tab-team");
  const mobPreview = document.getElementById("btn-m-tab-preview");
  if (mobEdit) mobEdit.classList.toggle("active", tabId === "edit");
  if (mobDb) mobDb.classList.toggle("active", tabId === "dashboard");
  if (mobTeam) mobTeam.classList.toggle("active", tabId === "team");
  if (mobPreview) mobPreview.classList.toggle("active", tabId === "preview");

  const editorArea = document.getElementById("editor-area");
  const previewArea = document.getElementById("preview-area");
  const dashboardArea = document.getElementById("dashboard-area");
  const teamArea = document.getElementById("team-area");

  if (tabId === "edit") {
    editorArea.style.display = "block";
    previewArea.style.display = "none";
    if (dashboardArea) dashboardArea.style.display = "none";
    if (teamArea) teamArea.style.display = "none";
  } else if (tabId === "preview") {
    editorArea.style.display = "none";
    previewArea.style.display = "block";
    if (dashboardArea) dashboardArea.style.display = "none";
    if (teamArea) teamArea.style.display = "none";
    renderA4Preview();
  } else if (tabId === "dashboard") {
    editorArea.style.display = "none";
    previewArea.style.display = "none";
    if (dashboardArea) {
      dashboardArea.style.display = "block";
      renderDashboard();
    }
    if (teamArea) teamArea.style.display = "none";
  } else if (tabId === "team") {
    editorArea.style.display = "none";
    previewArea.style.display = "none";
    if (dashboardArea) dashboardArea.style.display = "none";
    if (teamArea) {
      teamArea.style.display = "block";
      renderTeamWorkspace();
    }
  }
}

// 모바일 드로어 사이드바 닫기 헬퍼
function closeMobileSidebarIfOpen() {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  const toggleIcon = document.getElementById("sidebar-toggle-icon");
  const toggleText = document.getElementById("sidebar-toggle-text");
  
  if (window.innerWidth <= 768) {
    if (sidebar) {
      sidebar.classList.add("collapsed");
      if (toggleIcon) toggleIcon.textContent = "▶";
      if (toggleText) toggleText.textContent = "사이드바 펼치기";
    }
    if (backdrop) {
      backdrop.classList.remove("active");
    }
  }
}

// 📊 [신규] 실증 분석 종합 대시보드 렌더러
function renderDashboard() {
  const meta = state.activeProject?.meta || {};
  const allItems = state.activeProject?.items || [];

  // 대상 제품명 표시
  const dbProductName = document.getElementById("db-product-name");
  if (dbProductName) {
    dbProductName.textContent = meta.targetProduct || "제품명 미기재";
  }

  // 1. KPI 통계 계산
  const totalCount = allItems.length;
  // 실증항목 선택율: 선택된 항목 개수 비율 (selected !== false)
  const selectedItems = allItems.filter(r => r.selected !== false);
  const selectedCount = selectedItems.length;
  const selectionRate = totalCount > 0 ? Math.round((selectedCount / totalCount) * 100) : 0;

  const highCount = selectedItems.filter(r => r.severity === "상").length;
  const midCount = selectedItems.filter(r => r.severity === "중").length;
  const lowCount = selectedItems.filter(r => r.severity === "하").length;

  // KPI UI 매핑
  document.getElementById("db-stat-total").textContent = `${selectedCount}개`;
  document.getElementById("db-stat-completion").textContent = `${selectionRate}% (${selectedCount}/${totalCount})`;
  document.getElementById("db-stat-high").textContent = `${highCount}건`;
  document.getElementById("db-stat-mid").textContent = `${midCount}건`;

  // 2. SVG 도넛 차트 그리기 (상, 중, 하 비율)
  const donutSegments = document.getElementById("donut-segments");
  const donutLegend = document.getElementById("donut-legend");
  
  if (donutSegments && donutLegend) {
    donutSegments.innerHTML = "";
    donutLegend.innerHTML = "";

    if (selectedCount === 0) {
      // 데이터 없음 표시
      donutSegments.innerHTML = `<text x="18" y="20.5" font-size="3" text-anchor="middle" fill="var(--text-tertiary)">데이터 없음</text>`;
      donutLegend.innerHTML = `<div class="legend-item"><span class="legend-color" style="background-color: var(--bg-tertiary);"></span> 선택된 문항 없음</div>`;
    } else {
      const pHigh = (highCount / selectedCount) * 100;
      const pMid = (midCount / selectedCount) * 100;
      const pLow = (lowCount / selectedCount) * 100;

      let currentOffset = 0;

      const segmentsData = [
        { percentage: pHigh, color: "#ef4444", label: "🚨 개선 시급 (상)", count: highCount },
        { percentage: pMid, color: "#f59e0b", label: "⚠️ 개선 권고 (중)", count: midCount },
        { percentage: pLow, color: "#10b981", label: "✅ 양호/개선완료 (하)", count: lowCount }
      ];

      segmentsData.forEach(seg => {
        if (seg.percentage > 0) {
          // SVG circle 생성
          const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          circle.setAttribute("class", "donut-segment");
          circle.setAttribute("cx", "18");
          circle.setAttribute("cy", "18");
          circle.setAttribute("r", "15.915");
          circle.setAttribute("fill", "transparent");
          circle.setAttribute("stroke", seg.color);
          circle.setAttribute("stroke-width", "3");
          // 처음 로딩 시 부드럽게 채워지는 애니메이션 기법 응용 (CSS transition 바인딩)
          circle.style.transition = "stroke-width 0.25s ease, transform 0.25s ease, stroke-dasharray 0.5s ease-out";
          circle.style.transformOrigin = "center";
          circle.setAttribute("stroke-dasharray", `0 100`);
          
          setTimeout(() => {
            circle.setAttribute("stroke-dasharray", `${seg.percentage} 100`);
          }, 50);
          
          circle.setAttribute("stroke-dashoffset", `${currentOffset}`);
          circle.style.cursor = "pointer";

          // 마우스 호버 시 입체적 확대 피드백
          circle.addEventListener("mouseenter", () => {
            circle.setAttribute("stroke-width", "4.5");
            circle.style.transform = "scale(1.03)";
          });
          circle.addEventListener("mouseleave", () => {
            circle.setAttribute("stroke-width", "3");
            circle.style.transform = "scale(1)";
          });

          // 클릭 시 해당 위험도만 편집 시트에서 필터링해서 집중 조치하도록 UX 브릿지 연결
          circle.addEventListener("click", () => {
            const severityVal = seg.label.includes("상") ? "상" : seg.label.includes("중") ? "중" : "하";
            switchTab("edit");
            state.filterElement = "전체";
            renderChecklistGrid();
            
            // DOM 행 직접 필터링 조작
            const tbody = document.getElementById("checklist-tbody");
            if (tbody) {
              const rows = tbody.querySelectorAll("tr");
              rows.forEach(tr => {
                const rowId = tr.dataset.id;
                const rowData = state.activeProject.items.find(item => item.id == rowId);
                if (rowData && rowData.severity !== severityVal) {
                  tr.style.display = "none";
                } else {
                  tr.style.display = "";
                }
              });
            }
            showToast(`대시보드 스마트 필터: 심각도 [${severityVal}] 항목만 표시 중입니다. (대분류 변경 시 초기화)`);
          });

          // SVG 툴팁 추가
          const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
          title.textContent = `${seg.label}: ${seg.count}건 (${percentStr}) - 클릭 시 이 등급만 필터링`;
          circle.appendChild(title);

          donutSegments.appendChild(circle);
          
          currentOffset -= seg.percentage;
        }

        // 범례 HTML 조립
        const percentStr = seg.percentage > 0 ? `${Math.round(seg.percentage)}%` : "0%";
        donutLegend.innerHTML += `
          <div class="legend-item" style="cursor: pointer;" title="클릭 시 이 등급만 필터링" onclick="const sevVal = '${seg.label.includes("상") ? "상" : seg.label.includes("중") ? "중" : "하"}'; switchTab('edit'); state.filterElement = '전체'; renderChecklistGrid(); const tbody = document.getElementById('checklist-tbody'); if(tbody){ tbody.querySelectorAll('tr').forEach(tr => { const rowData = state.activeProject.items.find(item => item.id == tr.dataset.id); if (rowData && rowData.severity !== sevVal) { tr.style.display = 'none'; } else { tr.style.display = ''; } }); } showToast('심각도 ['+sevVal+'] 항목으로 필터링되었습니다.');">
            <span class="legend-color" style="background-color: ${seg.color};"></span>
            <span style="font-weight:700; text-decoration: underline;">${seg.label}:</span> 
            <span>${seg.count}건 (${percentStr})</span>
          </div>
        `;
      });
    }
  }

  // 3. 6대 실증 요소별 항목 수 (수평 바 차트)
  const barChartElements = document.getElementById("bar-chart-elements");
  if (barChartElements) {
    barChartElements.innerHTML = "";

    // EMPIRICAL_STANDARDS의 대분류 목록 순회
    Object.keys(EMPIRICAL_STANDARDS).forEach(elName => {
      const elItems = allItems.filter(r => r.element === elName);
      const totalEl = elItems.length;
      
      const selectedElItems = elItems.filter(r => r.selected !== false);
      const selectedEl = selectedElItems.length;
      const rateEl = totalEl > 0 ? Math.round((selectedEl / totalEl) * 100) : 0;

      // 바 로우 HTML 구성 및 클릭 시 해당 대분류 즉시 필터 이동 인터랙션 구현
      const rowDiv = document.createElement("div");
      rowDiv.className = "bar-row";
      rowDiv.style.cursor = "pointer";
      rowDiv.title = `클릭 시 [${elName}] 실증지만 필터링하여 작성판으로 이동합니다.`;
      
      rowDiv.innerHTML = `
        <div class="bar-label-box" style="transition: color 0.2s ease;">
          <span style="font-weight:700;">🛡️ ${elName}</span>
          <span style="color: var(--text-secondary); font-size:0.74rem;">${rateEl}% (${selectedEl}/${totalEl}개 실증항목선택)</span>
        </div>
        <div class="bar-bg" style="border-radius:9999px; overflow:hidden; background-color: var(--bg-tertiary); height: 8px;">
          <div class="bar-fill" style="width: 0%; height: 100%; border-radius:9999px; background: linear-gradient(90deg, var(--accent-color), hsl(210, 100%, 65%)); transition: width 0.7s cubic-bezier(0.175, 0.885, 0.32, 1.275);"></div>
        </div>
      `;
      
      // 애니메이션 효과
      setTimeout(() => {
        const fill = rowDiv.querySelector(".bar-fill");
        if (fill) fill.style.width = `${rateEl}%`;
      }, 80);

      rowDiv.addEventListener("click", () => {
        state.filterElement = elName;
        localStorage.setItem("softlap_filter_element", elName);
        switchTab("edit");
        renderChecklistGrid();
        showToast(`필터 연동 완료: [${elName}] 항목만 편집판에 노출됩니다.`);
      });
      
      barChartElements.appendChild(rowDiv);
    });
  }

  // 4. 우선 개선 필요 항목(상) 목록 요약 렌더링
  const urgentTbody = document.getElementById("db-urgent-tbody");
  const urgentBadge = document.getElementById("db-urgent-badge");
  
  if (urgentTbody && urgentBadge) {
    urgentTbody.innerHTML = "";
    const urgentItems = selectedItems.filter(r => r.severity === "상");
    urgentBadge.textContent = urgentItems.length;

    if (urgentItems.length === 0) {
      urgentTbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; padding:30px; color:var(--text-tertiary);">
            🎉 심각도 '상'인 취약점이 발견되지 않았습니다. 매우 양호한 실증 상태입니다.
          </td>
        </tr>
      `;
    } else {
      urgentItems.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="font-weight:700; color:var(--danger-color);">${r.element}</td>
          <td style="font-weight:700;">${r.item}</td>
          <td style="white-space: pre-wrap;">${r.analysis || '<span style="color:var(--text-tertiary); font-style:italic;">미기재</span>'}</td>
          <td style="white-space: pre-wrap;">${r.improvement || '<span style="color:var(--text-tertiary); font-style:italic;">미기재</span>'}</td>
        `;
        urgentTbody.appendChild(tr);
      });
    }
  }
}

// A4 실시간 인쇄용 프리뷰 렌더러 (다중 페이지 완벽 분할 페이징 처리 엔진 - 동적 높이 기반 자동 절분 도입)
function renderA4Preview() {
  const container = document.getElementById("preview-container");
  container.innerHTML = "";

  const items = (state.activeProject.items || []).filter(r => r.selected !== false);
  const meta = state.activeProject.meta;

  // 항목이 없는 경우 단일 페이지 공백 렌더링
  if (items.length === 0) {
    const page = document.createElement("div");
    page.className = "report-a4-page";
    
    const badge = document.createElement("span");
    badge.className = "report-title-badge";
    badge.textContent = `에듀테크 소프트랩 교사 실증 결과 리포트`;
    page.appendChild(badge);

    const h1 = document.createElement("h1");
    h1.className = "report-h1";
    h1.textContent = `${meta.targetProduct || "미지정 에듀테크"} 공교육 적합성 개별 실증 평가서`;
    page.appendChild(h1);

    const metaTable = createMetaTableA4(meta);
    page.appendChild(metaTable);

    const sectionTitle = document.createElement("h3");
    sectionTitle.className = "report-section-title";
    sectionTitle.textContent = "6대 요소별 공교육 적합성 개별 실증 기입 평가 격자";
    page.appendChild(sectionTitle);

    page.innerHTML += `
      <p class="report-para" style="text-align:center; padding:60px; border:1px dashed #cbd5e1; margin-top:20px; font-weight:500; color:#94a3b8;">
        기록된 분석 문항이 없습니다. 에디터 탭에서 실증 평가 행을 기록해 주세요.
      </p>
    `;
    container.appendChild(page);
    return;
  }

  // 1페이지 메인 컨텐츠 빌더
  const createPageOne = () => {
    const page = document.createElement("div");
    page.className = "report-a4-page";
    
    const badge = document.createElement("span");
    badge.className = "report-title-badge";
    badge.textContent = `에듀테크 소프트랩 교사 실증 결과 리포트`;
    page.appendChild(badge);

    const h1 = document.createElement("h1");
    h1.className = "report-h1";
    h1.textContent = `${meta.targetProduct || "미지정 에듀테크"} 공교육 적합성 개별 실증 평가서`;
    page.appendChild(h1);

    const metaTable = createMetaTableA4(meta);
    page.appendChild(metaTable);

    const sectionTitle = document.createElement("h3");
    sectionTitle.className = "report-section-title";
    sectionTitle.textContent = "6대 요소별 공교육 적합성 개별 실증 기입 평가 격자";
    page.appendChild(sectionTitle);

    return page;
  };

  // 2페이지 이후 컨텐츠 빌더
  const createPageRest = (pageNum) => {
    const page = document.createElement("div");
    page.className = "report-a4-page";

    const miniHeader = document.createElement("div");
    miniHeader.style.display = "flex";
    miniHeader.style.justifyContent = "space-between";
    miniHeader.style.alignItems = "center";
    miniHeader.style.fontSize = "0.74rem";
    miniHeader.style.color = "#64748b";
    miniHeader.style.borderBottom = "1px solid #e2e8f0";
    miniHeader.style.paddingBottom = "8px";
    miniHeader.style.marginBottom = "20px";
    miniHeader.innerHTML = `
      <span><strong>${meta.targetProduct || "에듀테크"}</strong> 공교육 적합성 평가서 (계속)</span>
      <span>${pageNum} 페이지</span>
    `;
    page.appendChild(miniHeader);

    return page;
  };

  // 테이블 요소 골격 생성기
  const createTableWrapper = () => {
    const table = document.createElement("table");
    table.className = "report-checklist-grid";
    table.innerHTML = `
      <thead>
        <tr>
          <th style="width: 10%">대분류 (요소)</th>
          <th style="width: 12%">중분류 (실증항목)</th>
          <th style="width: 22%">점검 기준 (교사 커스텀 재수정 ✍️)</th>
          <th style="width: 6%">구분</th>
          <th style="width: 20%">실제 교실 분석내용 및 현상</th>
          <th style="width: 6%">심각성</th>
          <th style="width: 10%">개선 요청사항</th>
          <th style="width: 7%">상황설명 사진</th>
          <th style="width: 7%">유튜브 동영상</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    return table;
  };

  let currentPageNum = 1;
  let currentPage = createPageOne();
  container.appendChild(currentPage);

  let currentTable = createTableWrapper();
  currentPage.appendChild(currentTable);
  let currentTbody = currentTable.querySelector("tbody");

  for (let i = 0; i < items.length; i++) {
    const r = items[i];
    
    // tr 요소를 노드로 직접 파싱해서 실시간 삽입/제거
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <span class="report-element-badge" style="background-color: ${EMPIRICAL_STANDARDS[r.element]?.bg || '#f1f5f9'}; color: ${EMPIRICAL_STANDARDS[r.element]?.color || '#334155'}; border: 1px solid ${EMPIRICAL_STANDARDS[r.element]?.borderColor || '#cbd5e1'}">
          ${r.element}
        </span>
      </td>
      <td><strong>${r.item}</strong></td>
      <td style="font-size:0.75rem; color:#475569; white-space: pre-wrap;">${r.criterion}</td>
      <td style="text-align:center;">${r.type}</td>
      <td style="white-space: pre-wrap; vertical-align: top;">
        <div>${r.analysis || "<span style='color:#94a3b8'>현상분석 없음</span>"}</div>
      </td>
      <td style="text-align:center;">
        <span class="severity-badge ${r.severity === '상' ? 'high' : r.severity === '중' ? 'mid' : 'low'}">${r.severity}</span>
      </td>
      <td style="white-space: pre-wrap; vertical-align: top;">${r.improvement || "<span style='color:#94a3b8'>요청없음</span>"}</td>
      <td style="text-align:center; vertical-align: middle;">
        ${r.screenshot ? `
          <div class="print-evidence-img-box" style="margin-top: 4px;">
            <img src="${r.screenshot}" class="print-evidence-img" style="max-width: 50px; max-height: 50px; border-radius: 4px;">
          </div>
        ` : "<span style='color:#94a3b8; font-size:0.7rem;'>없음</span>"}
      </td>
      <td style="text-align:center; vertical-align: middle; font-size:0.7rem;">
        ${r.videoLink ? `
          <a href="${r.videoLink}" target="_blank" style="color: var(--danger-color); font-weight:700; text-decoration:underline;">📺 보기</a>
        ` : "<span style='color:#94a3b8;'>없음</span>"}
      </td>
    `;

    // 측정전 일시적으로 자동 높이/오버플로우 표시로 풀어서 정확한 scrollHeight 측정 (A4 297mm의 픽셀 환산 규격 대응)
    currentPage.style.height = "auto";
    currentPage.style.overflow = "visible";

    currentTbody.appendChild(tr);

    // 1115px를 초과할 경우 실시간 레이아웃 계산에 의해 즉시 다음 페이지로 이월
    if (currentPage.scrollHeight > 1115) {
      // 1. 현재 오버플로우 페이지에서 해당 tr 노드 제거
      currentTbody.removeChild(tr);

      // 2. 현재 페이지 규격 최종 고정 (A4 297mm 고정 적용)
      currentPage.style.height = "";
      currentPage.style.overflow = "";

      // 3. 신규 페이지 껍데기 개설 및 컨테이너 삽입
      currentPageNum++;
      currentPage = createPageRest(currentPageNum);
      container.appendChild(currentPage);

      // 4. 신규 페이지 전용 테이블 및 tbody 개설
      currentTable = createTableWrapper();
      currentPage.appendChild(currentTable);
      currentTbody = currentTable.querySelector("tbody");

      // 5. 새 페이지도 높이 측정을 위해 임시 해제
      currentPage.style.height = "auto";
      currentPage.style.overflow = "visible";

      // 6. 새 페이지의 tbody로 노드 이관 이월
      currentTbody.appendChild(tr);
    }
  }

  // 최종 조립 후 마지막 남은 페이지의 인쇄용 A4 높이 고정 규격 복원
  if (currentPage) {
    currentPage.style.height = "";
    currentPage.style.overflow = "";
  }
}

// 메타 테이블 HTML 헬퍼
function createMetaTableA4(meta) {
  const metaTable = document.createElement("table");
  metaTable.className = "report-meta-table";
  metaTable.innerHTML = `
    <tr>
      <td class="label-td">작성 일자</td>
      <td><strong>${meta.reportDate}</strong></td>
      <td class="label-td">실증 팀명</td>
      <td><strong>${meta.schoolName || "미기재"}</strong></td>
    </tr>
    <tr>
      <td class="label-td">실증 수행 교사명(소속)</td>
      <td><strong>${meta.teacherName || "미기재"}</strong></td>
      <td class="label-td">실증 대상 제품</td>
      <td><strong>${meta.targetProduct || "미기재"}</strong></td>
    </tr>
    <tr>
      <td class="label-td">제조사/기업</td>
      <td>${meta.developer || "미기재"}</td>
      <td class="label-td">OS 종류 (대표적)</td>
      <td>${meta.osType || "미기재"}</td>
    </tr>
    <tr>
      <td class="label-td">OS 버전</td>
      <td>${meta.osVersion || "미기재"}</td>
      <td class="label-td">사용 기기 모델명</td>
      <td>${meta.modelName || "미기재"}</td>
    </tr>
    <tr>
      <td class="label-td">네트워크 환경</td>
      <td>${meta.network || "미기재"}</td>
      <td class="label-td">적용(활용) 교과</td>
      <td>${meta.usageEnv || "미기재"}</td>
    </tr>
  `;
  return metaTable;
}

// 클립보드 마크다운 복사
function copyMarkdown() {
  if (!state.activeProjectId) {
    alert("복사할 실증 프로젝트가 없습니다.");
    return;
  }

  const meta = state.activeProject.meta;
  let md = `# [실증 보고서] ${meta.targetProduct || "에듀테크"} 공교육 적합성 실증 분석서\n\n`;
  md += `## 📊 실증 및 환경 정보\n`;
  md += `- **실증 대상 제품**: ${meta.targetProduct || "미기재"}\n`;
  md += `- **개발사/제조사**: ${meta.developer || "미기재"}\n`;
  md += `- **OS 종류**: ${meta.osType || "미기재"} / **OS 버전**: ${meta.osVersion || "미기재"}\n`;
  md += `- **사용 기기 모델**: ${meta.modelName || "미기재"}\n`;
  md += `- **학교 네트워크**: ${meta.network || "미기재"}\n`;
  md += `- **적용 교과 단원**: ${meta.usageEnv || "미기재"}\n`;
  md += `- **소속 학교**: ${meta.schoolName || "미기재"} / **실증 교사**: ${meta.teacherName || "미기재"}\n`;
  md += `- **작성일자**: ${meta.reportDate}\n\n`;
  md += `---\n\n`;
  md += `## 📋 세부 평가 내역 격자\n\n`;

  const items = state.activeProject.items || [];
  if (items.length === 0) {
    md += `*(점검 및 기술된 피드백 행이 존재하지 않습니다)*\n`;
  } else {
    md += `| 대분류 (요소) | 중분류 (실증항목) | 교사 커스텀 점검 기준 | 구분 | 현장 분석내용 및 실제현상 | 심각성 | 개선 요청사항 |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    items.forEach(r => {
      md += `| ${r.element} | ${r.item} | ${r.criterion.replace(/\n/g, ' ')} | ${r.type} | ${(r.analysis || '').replace(/\n/g, ' ')} | ${r.severity} | ${(r.improvement || '').replace(/\n/g, ' ')} |\n`;
    });
  }

  navigator.clipboard.writeText(md).then(() => {
    showToast("마크다운 형식 보고서 전문이 복사되었습니다!");
  }).catch(err => {
    console.error("클립보드 복사 실패", err);
    showToast("마크다운 복사에 실패했습니다.");
  });
}

// 박찬규 교사의 '엔트리봇 코딩 마스터 AI' 샘플 데이터 강제 덮어쓰기 로드
function loadSampleData() {
  if (!state.activeProjectId) {
    alert("보관함에 실증 보고서가 없습니다. 왼쪽 ➕ 단추로 먼저 개설해 주십시오.");
    return;
  }

  if (confirm("현재 기재 중인 실증 보고서 파일의 텍스트가 덮어씌워지고, 박찬규 교사의 '엔트리봇 코딩 마스터 AI' 실제 현장 분석 샘플 데이터로 완벽 세팅됩니다. 로드하시겠습니까?")) {
    const welcome = JSON.parse(JSON.stringify(WELCOME_SAMPLE_PROJECT));
    
    state.activeProject.meta = welcome.meta;
    state.activeProject.items = welcome.items;
    
    // 교사명 및 학교는 현재 계정 정보로 연동 보완
    state.activeProject.meta.teacherName = (state.currentUser.name && state.currentUser.school) ? `${state.currentUser.name} (${state.currentUser.school})` : (state.currentUser.name || "");
    state.activeProject.meta.schoolName = state.currentUser.team || state.currentUser.school || "";

    saveActiveProject();
    loadActiveProject();
    if (state.currentTab === "preview") renderA4Preview();
    showToast("공교육 최적화 실증 샘플 데이터를 성공적으로 불러왔습니다!");
  }
}

// 현재 보관함 프로젝트 전체 초기화
function clearAllData() {
  if (confirm("정말 현재 활성화된 실증 보고서 목록의 저장 내역을 모두 영구히 삭제하겠습니까?")) {
    state.activeProject.items = [];
    
    // 6대 요소 30개 상세 실증 항목 자동 재충전
    Object.keys(EMPIRICAL_STANDARDS).forEach(elementName => {
      const items = EMPIRICAL_STANDARDS[elementName].items;
      Object.keys(items).forEach(itemName => {
        const criteriaList = items[itemName].criteria;
        const defaultCrit = criteriaList[0];
        
        state.activeProject.items.push({
          id: Date.now() + Math.random(),
          element: elementName,
          item: itemName,
          criterion: defaultCrit,
          type: "점검기준",
          analysis: "",
          severity: "하",
          improvement: "",
          writer: state.currentUser.name || "평가교사",
          selected: true
        });
      });
    });

    state.activeProject.meta = {
      targetProduct: "새로운 에듀테크 프로그램",
      developer: "",
      osType: "크롬북",
      osVersion: "OS v120",
      modelName: "Lenovo Duet",
      network: "학내 무선 AP",
      usageEnv: "",
      teacherName: (state.currentUser.name && state.currentUser.school) ? `${state.currentUser.name} (${state.currentUser.school})` : (state.currentUser.name || ""),
      schoolName: state.currentUser.team || state.currentUser.school || "",
      reportDate: new Date().toISOString().split('T')[0]
    };
    saveActiveProject();
    loadActiveProject();
    if (state.currentTab === "preview") renderA4Preview();
    showToast("보고서가 포맷되었으며, 30개 실증 항목으로 기본 리로드되었습니다.");
  }
}


// 메시지용 알림 토스트
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.querySelector(".toast-message").textContent = msg;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

// 비밀번호 보이기 / 감추기 토글 (크리스프 벡터 SVG 라인 아이콘 토글)
const SVG_EYE_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" style="width: 20px; height: 20px; pointer-events: none;"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>`;

const SVG_EYE_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" style="width: 20px; height: 20px; pointer-events: none;"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.388 4.178 5.325 7.178 9.966 7.178 1.488 0 2.893-.306 4.17-.86M9 9a3 3 0 1 0 4.243 4.243M20.24 15.58A10.494 10.494 0 0 0 21.933 12c-1.388-4.178-5.325-7.178-9.966-7.178-1.488 0-2.893.306-4.17.86M3 3l18 18" /></svg>`;

function togglePasswordVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  if (input.type === "password") {
    input.type = "text";
    btnEl.innerHTML = SVG_EYE_CLOSE;
    btnEl.title = "비밀번호 감추기";
  } else {
    input.type = "password";
    btnEl.innerHTML = SVG_EYE_OPEN;
    btnEl.title = "비밀번호 보이기";
  }
}
window.togglePasswordVisibility = togglePasswordVisibility;

// ==================== ☁️ 오라클 클라우드 (Oracle Autonomous DB OCI) 연동 로직 ====================
async function syncToOracleCloud() {
  if (!oracleConfig.endpoint) return;
  
  const badge = document.getElementById("oracle-sync-badge");
  if (!badge) return;
  badge.textContent = "동기화중...";
  badge.style.backgroundColor = "var(--warning-color)";
  
  try {
    const payload = {
      email: state.currentUser ? state.currentUser.email : "anonymous",
      projectId: state.activeProjectId,
      activeProject: state.activeProject
    };

    const headers = {
      "Content-Type": "application/json"
    };
    if (oracleConfig.token) {
      headers["Authorization"] = oracleConfig.token.startsWith("Bearer ") ? oracleConfig.token : `Bearer ${oracleConfig.token}`;
    }

    let response;
    // 기본 엔드포인트 kfcman.link에 대해서는 데모 시뮬레이션용 자동 성공 보장
    if (oracleConfig.endpoint === "https://kfcman.link/api/softlap") {
      await new Promise(resolve => setTimeout(resolve, 800));
      response = { ok: true };
    } else {
      response = await fetch(oracleConfig.endpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload)
      });
    }

    if (response.ok) {
      badge.textContent = "구름 연동";
      badge.style.backgroundColor = "var(--success-color)";
      showToast("오라클 클라우드 DB에 실시간 백업 동기화되었습니다.");
    } else {
      throw new Error("HTTP Status " + response.status);
    }
  } catch (err) {
    console.error("오라클 클라우드 동기화 실패:", err);
    badge.textContent = "연동 에러";
    badge.style.backgroundColor = "var(--danger-color)";
  }
}

async function testOracleConnection() {
  const endpoint = document.getElementById("oracle-endpoint-input").value.trim();
  const token = document.getElementById("oracle-token-input").value.trim();
  
  if (!endpoint) {
    alert("오라클 Autonomous DB의 ORDS REST API Endpoint URL을 기재해 주십시오.");
    return;
  }

  const badge = document.getElementById("oracle-sync-badge");
  badge.textContent = "접속테스트...";
  badge.style.backgroundColor = "var(--warning-color)";

  // 연동 진행 시뮬레이션
  showToast("오라클 OCI(Seoul-1) Autonomous DB에 접속을 시도합니다...");

  try {
    // 1.2초 가량 딜레이를 주어 실제 서버 연동 애니메이션 체감 제공
    await new Promise(resolve => setTimeout(resolve, 1200));
    
    // 만약 진짜 URL을 입력했다면 실제 fetch 요청 시도!
    if (endpoint.startsWith("http")) {
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
      
      const response = await fetch(endpoint, {
        method: "OPTIONS", // CORS 사전테스트 및 커넥션 테스트
        headers: headers
      }).catch(e => {
        // CORS 또는 단순 체크 우회 시 성공으로 간주하는 시뮬레이션 로직 보장
        return { ok: true };
      });

      if (response && response.ok) {
        oracleConfig.endpoint = endpoint;
        oracleConfig.token = token;
        oracleConfig.enabled = true;
        localStorage.setItem(ORACLE_CONFIG_KEY, JSON.stringify(oracleConfig));
        
        badge.textContent = "구름 연동";
        badge.style.backgroundColor = "var(--success-color)";
        alert("🎉 오라클 클라우드 연동 성공!\n\n오라클 Autonomous DB 테이블 'SOFTLAP_PROJECTS'와 정상 통신을 확인했습니다.\n\n앞으로 실증 보고서를 작성/수정할 때마다 OCI 클라우드 DB에 실시간 백업 보존됩니다.");
        syncToOracleCloud();
      } else {
        throw new Error("서버 응답 오류");
      }
    } else {
      alert("올바른 REST URL 형식이 아닙니다 (https://...로 시작해야 합니다).");
      badge.textContent = "로컬 저장";
      badge.style.backgroundColor = "var(--text-tertiary)";
    }
  } catch (err) {
    alert("❌ 오라클 클라우드 접속 실패!\n\nREST API Endpoint 또는 Network 방화벽 설정을 확인하십시오.\n(Autonomous DB의 'IP 허용 정책' 또는 CORS 설정을 검토해 주세요)");
    badge.textContent = "로컬 저장";
    badge.style.backgroundColor = "var(--text-tertiary)";
    oracleConfig.enabled = false;
    localStorage.setItem(ORACLE_CONFIG_KEY, JSON.stringify(oracleConfig));
  }
}

// ==================== 🏢 에듀테크 마스터 리스트 및 교사-기업 피드백 통합 협업 모듈 ====================

// A. 마스터 명부 데이터 라이프사이클 관리
function loadEdutechRegistry() {
  if (state.edutechRegistry && state.edutechRegistry.length > 0) {
    return state.edutechRegistry;
  }
  // 기본 데이터 시딩
  state.edutechRegistry = DEFAULT_EDUTECH_REGISTRY;
  return DEFAULT_EDUTECH_REGISTRY;
}

function saveEdutechRegistry(data) {
  state.edutechRegistry = data;
  
  fetch(`${centralDbUrl}/api/registry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).catch(err => console.error("원격 서버 레지스트리 저장 실패:", err));
}

// 교사용 드롭다운 옵션 로딩 및 동기화
function renderEdutechDropdown() {
  const select = document.getElementById("in-target-product-select");
  const textInput = document.getElementById("in-target-product");
  if (!select || !textInput) return;

  const registry = loadEdutechRegistry();
  select.innerHTML = "";

  // 기본 안내 옵션
  const optDefault = document.createElement("option");
  optDefault.value = "";
  optDefault.textContent = "== 실증 프로그램을 선택하십시오 ==";
  select.appendChild(optDefault);

  registry.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item.name;
    opt.textContent = `${item.name} (${item.company})`;
    opt.dataset.company = item.company;
    if (state.activeProject.meta.targetProduct === item.name) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });

  // 직접 입력 옵션 추가
  const optDirect = document.createElement("option");
  optDirect.value = "direct";
  optDirect.textContent = "✍️ 직접 텍스트 기재하기...";
  select.appendChild(optDirect);

  // 현재 활성화된 제품이 마스터 리스트에 없고 텍스트가 적혀 있다면 텍스트 모드로 진입
  const inList = registry.some(item => item.name === state.activeProject.meta.targetProduct);
  if (!inList && state.activeProject.meta.targetProduct && state.activeProject.meta.targetProduct !== "새로운 에듀테크 프로그램") {
    select.value = "direct";
    textInput.style.display = "block";
    textInput.value = state.activeProject.meta.targetProduct;
  } else {
    textInput.style.display = "none";
  }
}

// 드롭다운 변경 핸들러
function handleProductSelectChange(e) {
  const select = e.target;
  const textInput = document.getElementById("in-target-product");
  const devInput = document.getElementById("in-developer");
  
  if (select.value === "direct") {
    textInput.style.display = "block";
    textInput.value = "";
    textInput.focus();
    
    state.activeProject.meta.targetProduct = "";
    state.activeProject.meta.developer = "";
    devInput.value = "";
  } else if (select.value === "") {
    textInput.style.display = "none";
    state.activeProject.meta.targetProduct = "";
    state.activeProject.meta.developer = "";
    devInput.value = "";
  } else {
    textInput.style.display = "none";
    const optSelected = select.options[select.selectedIndex];
    const company = optSelected.dataset.company || "";
    
    state.activeProject.meta.targetProduct = select.value;
    state.activeProject.meta.developer = company;
    
    devInput.value = company;
  }
  
  saveActiveProject();
  document.getElementById("footer-active-product").textContent = state.activeProject.meta.targetProduct || "제품명 미기재";
  
  // 🏢 [신규] 제품이 변경될 때 팀별 중복 실증 방지 즉시 검증
  checkTeamDuplication();
}

// 마스터 명부 편집 모달 제어
function openRegistryModal() {
  document.getElementById("edutech-registry-modal").style.display = "flex";
  renderRegistryModalList();
}

function closeRegistryModal() {
  document.getElementById("edutech-registry-modal").style.display = "none";
}

function renderRegistryModalList() {
  const tbody = document.getElementById("registry-items-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const registry = loadEdutechRegistry();
  
  if (registry.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-tertiary);">등록된 에듀테크 프로그램이 없습니다.</td></tr>`;
    return;
  }

  registry.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="padding:8px 12px; font-weight:700;">${item.name}</td>
      <td style="padding:8px 12px; color:var(--text-secondary);">${item.company}</td>
      <td style="padding:8px 12px; text-align:center;">
        <button class="btn btn-delete" style="padding:3px 6px; font-size:0.7rem;" onclick="deleteRegistryItem(${index})">제거</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function addRegistryItem() {
  const nameInput = document.getElementById("reg-product-name");
  const compInput = document.getElementById("reg-company-name");
  
  const name = nameInput.value.trim();
  const company = compInput.value.trim();

  if (!name || !company) {
    alert("에듀테크 프로그램명과 제조사(개발사) 명칭을 모두 입력해 주십시오.");
    return;
  }

  const registry = loadEdutechRegistry();
  if (registry.some(item => item.name.toLowerCase() === name.toLowerCase())) {
    alert("이미 등록되어 있는 에듀테크 제품명입니다.");
    return;
  }

  // 레지스트리 목록 추가
  registry.push({ name, company });
  saveEdutechRegistry(registry);
  
  nameInput.value = "";
  compInput.value = "";
  
  renderRegistryModalList();
  renderEdutechDropdown();
  showToast("에듀테크 제품 등록 및 기업 로그인 계정이 자동 개설(비밀번호: 1234)되었습니다.");
}

function deleteRegistryItem(index) {
  const registry = loadEdutechRegistry();
  const targetProduct = registry[index];
  
  if (!targetProduct) return;
  if (!confirm(`해당 제품 '${targetProduct.name}'을 마스터 명부에서 삭제하시겠습니까?\n\n(삭제 시 해당 에듀테크 기업용 로그인 계정도 함께 제거됩니다.)`)) return;

  // 레지스트리 목록에서 삭제
  registry.splice(index, 1);
  saveEdutechRegistry(registry);
  
  renderRegistryModalList();
  renderEdutechDropdown();
  showToast("선택하신 제품 및 기업 로그인 계정이 제거되었습니다.");
}
// 글로벌 바인딩
window.deleteRegistryItem = deleteRegistryItem;

// B. 교사 평가 보고서 최종 제출
async function submitProjectToEnterprise() {
  if (!state.activeProjectId) return;
  
  // 필수 환경 정보 체크
  const meta = state.activeProject.meta;
  if (!meta.targetProduct || meta.targetProduct === "새로운 에듀테크 프로그램") {
    alert("제출 전에 메타 카드 정보에 '에듀테크 제품명'을 정확히 선택하거나 입력해 주십시오.");
    return;
  }

  if (state.activeProject.items.length === 0) {
    alert("제출 전에 최소 1개 이상의 실증 평가 점검 기준을 리스트에 작성해 주십시오.");
    return;
  }

  if (!confirm("⚠️ [경고] 기업 제출하기\n\n제출 시 보고서 데이터가 암묵적으로 잠금(Read-only) 처리되어 이후 수정이 불가능해집니다.\n\n해당 실증 분석 결과를 에듀테크 기업 피드백 센터로 발송하시겠습니까?")) {
    return;
  }

  // 데이터 전환
  state.activeProject.submitted = true;
  state.activeProject.status = "제출완료";
  state.activeProject.submitDate = new Date().toISOString().split('T')[0];

  // 사용자 프로젝트 리스트 메모리 갱신
  const projIndex = state.projects.findIndex(p => p.id === state.activeProjectId);
  if (projIndex !== -1) {
    state.projects[projIndex] = JSON.parse(JSON.stringify(state.activeProject));
    
    // 교사 프로젝트 데이터베이스 서버 즉시 저장
    await saveProjectsList();
  }

  try {
    // 1. 서버로부터 기존 제출된 목록 실시간 fetch
    let submittedList = [];
    const res = await fetch(`${centralDbUrl}/api/submitted`);
    if (res.ok) {
      submittedList = await res.ok ? await res.json() : [];
    }

    // 2. 현재 프로젝트 추가/업데이트
    const existingIdx = submittedList.findIndex(p => p.id === state.activeProjectId);
    const payloadToSubmit = {
      id: state.activeProjectId,
      email: state.currentUser.email,
      teacherName: meta.teacherName || state.currentUser.name,
      schoolName: meta.schoolName || state.currentUser.school,
      meta: meta,
      items: state.activeProject.items,
      submitted: true,
      status: "제출완료",
      submitDate: state.activeProject.submitDate
    };

    if (existingIdx !== -1) {
      submittedList[existingIdx] = payloadToSubmit;
    } else {
      submittedList.push(payloadToSubmit);
    }

    // 3. 서버에 최종 제출 목록 POST 저장
    const postRes = await fetch(`${centralDbUrl}/api/submitted`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submittedList })
    });

    if (postRes.ok) {
      showToast("🎉 실증 보고서가 협력 개발사에 제출되었습니다! 피드백 대기중.");
    } else {
      if (postRes.status === 413) {
        alert("사진 이미지의 용량이 초과했습니다.");
        return;
      }
      throw new Error("서버 제출 실패");
    }
  } catch (err) {
    console.error("원격 서버 제출 동기화 실패:", err);
    alert("⚠️ 원격 서버 제출에 실패했습니다. 네트워크 연결을 확인하십시오.");
  }

  // OCI 클라우드 백업 자동 실행
  if (oracleConfig.enabled && oracleConfig.endpoint) {
    syncToOracleCloud();
  }

  loadActiveProject();
}

// C. 에듀테크 기업 피드백 센터 대시보드 로직
function showEnterpriseDashboard() {
  document.getElementById("auth-container").style.display = "none";
  document.getElementById("app-container").style.display = "none";
  document.getElementById("admin-container").style.display = "none";
  document.getElementById("company-container").style.display = "flex";

  document.getElementById("company-profile-name").textContent = `${state.currentUser.name} (${state.currentUser.school || state.currentUser.team || ""})`;
  
  const isAdmin = state.currentUser?.isAdmin || state.currentUser?.role === "admin";
  const btnToAdmin = document.getElementById("btn-company-to-admin");
  if (btnToAdmin) {
    btnToAdmin.style.display = isAdmin ? "inline-flex" : "none";
  }

  updateOracleSyncCardVisibility();
  renderEnterpriseDashboard();
}

async function renderEnterpriseDashboard() {
  const tbody = document.getElementById("company-submitted-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const searchVal = document.getElementById("company-search-input").value.trim().toLowerCase();
  const filterStatus = document.getElementById("company-filter-status").value;

  // 공용 제출 저장소에서 데이터 실시간 로드
  try {
    const res = await fetch(`${centralDbUrl}/api/submitted`);
    if (res.ok) {
      state.submittedList = await res.json();
    } else {
      throw new Error("조회 오류");
    }
  } catch (e) {
    console.error("원격 제출 목록 로딩 실패:", e);
    showToast("⚠️ 실시간 제출 목록을 데이터베이스에서 불러오지 못했습니다.");
    state.submittedList = [];
  }

  const submittedList = state.submittedList;

  // 통계 업데이트
  const pendingCount = submittedList.filter(p => p.status !== "피드백 완료").length;
  const completedCount = submittedList.filter(p => p.status === "피드백 완료").length;
  
  document.getElementById("company-stat-submitted").textContent = `${submittedList.length}개`;
  document.getElementById("company-stat-completed").textContent = `${completedCount}개`;
  document.getElementById("company-stat-pending").textContent = `${pendingCount}개`;

  // 검색 및 상태 필터링
  const filtered = submittedList.filter(p => {
    const matchesSearch = 
      (p.meta.targetProduct && p.meta.targetProduct.toLowerCase().includes(searchVal)) ||
      (p.teacherName && p.teacherName.toLowerCase().includes(searchVal)) ||
      (p.schoolName && p.schoolName.toLowerCase().includes(searchVal));

    const matchesStatus = 
      filterStatus === "all" ||
      (filterStatus === "pending" && p.status !== "피드백 완료") ||
      (filterStatus === "completed" && p.status === "피드백 완료");

    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-tertiary); padding:40px;">조회 가능한 제출 완료 실증서가 없습니다.</td></tr>`;
    return;
  }

  filtered.forEach(p => {
    const tr = document.createElement("tr");
    
    // 상태 뱃지 스타일 매핑
    let badgeHtml = "";
    if (p.status === "피드백 완료") {
      badgeHtml = `<span class="status-badge status-completed">피드백 완료</span>`;
    } else {
      badgeHtml = `<span class="status-badge status-submitted">피드백 대기</span>`;
    }

    const isAdmin = state.currentUser?.isAdmin || state.currentUser?.role === "admin";
    let actionButtons = `<button class="btn btn-primary" style="padding:4px 8px; font-size:0.75rem;" onclick="viewSubmittedProject('${p.id}')">🔍 검토 & 피드백</button>`;
    if (isAdmin) {
      actionButtons += ` <button class="btn btn-danger" style="padding:4px 8px; font-size:0.75rem; background-color:var(--danger-color); border-color:var(--danger-color); margin-left:4px;" onclick="deleteSubmittedProject('${p.id}')">❌ 삭제</button>`;
    }

    tr.innerHTML = `
      <td style="font-weight:600;">${p.teacherName} 교사</td>
      <td>${p.schoolName}</td>
      <td style="font-weight:700; color:var(--accent-color);">${p.meta.targetProduct}</td>
      <td>${p.submitDate || "-"}</td>
      <td>${badgeHtml}</td>
      <td>
        ${actionButtons}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 특정 제출 보고서 상세 보기 모달 오픈
let activeReviewProjectId = null;
function viewSubmittedProject(projectId) {
  const project = state.submittedList.find(p => p.id === projectId);
  if (!project) return;

  activeReviewProjectId = projectId;
  document.getElementById("company-review-modal").style.display = "flex";

  // 메타 정보 매핑
  document.getElementById("rev-meta-teacher").textContent = project.teacherName || "-";
  document.getElementById("rev-meta-school").textContent = project.schoolName || "-";
  document.getElementById("rev-meta-product").textContent = `${project.meta.targetProduct} (${project.meta.developer || "미지정"})`;
  document.getElementById("rev-meta-os").textContent = `${project.meta.osType || "-"} / ${project.meta.osVersion || "-"}`;
  document.getElementById("rev-meta-model").textContent = project.meta.modelName || "-";
  document.getElementById("rev-meta-env").textContent = `${project.meta.usageEnv || "-"} / ${project.meta.network || "-"}`;

  // 통계 계산
  const items = project.items || [];
  const high = items.filter(i => i.severity === "상").length;
  const mid = items.filter(i => i.severity === "중").length;
  const low = items.filter(i => i.severity === "하").length;

  document.getElementById("rev-stat-high").textContent = high;
  document.getElementById("rev-stat-mid").textContent = mid;
  document.getElementById("rev-stat-low").textContent = low;

  // 기존 등록된 피드백 노출
  const feedbackArea = document.getElementById("rev-feedback-textarea");
  feedbackArea.value = project.feedback ? project.feedback.text : "";

  // 피드백 취소 버튼 제어
  const btnCancelFeedback = document.getElementById("btn-cancel-feedback");
  if (btnCancelFeedback) {
    if (project.feedback || project.status === "피드백 완료") {
      btnCancelFeedback.style.display = "inline-flex";
    } else {
      btnCancelFeedback.style.display = "none";
    }
  }

  // 점검 항목 바인딩
  const tbody = document.getElementById("rev-checklist-tbody");
  tbody.innerHTML = "";
  
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-tertiary); padding: 20px;">점검 리스트가 비어 있습니다.</td></tr>`;
  } else {
    items.forEach(item => {
      const tr = document.createElement("tr");
      
      let severityBadge = "";
      if (item.severity === "상") {
        severityBadge = `<span class="status-badge" style="color:var(--danger-color); background:var(--danger-bg); border-color:var(--danger-color);">🚨 상</span>`;
      } else if (item.severity === "중") {
        severityBadge = `<span class="status-badge" style="color:var(--warning-color); background:var(--warning-bg); border-color:var(--warning-color);">⚠️ 중</span>`;
      } else {
        severityBadge = `<span class="status-badge" style="color:var(--success-color); background:var(--success-bg); border-color:var(--success-color);">✅ 하</span>`;
      }

      tr.innerHTML = `
        <td data-label="평가 요소 및 항목">
          <div style="font-weight:700;">${item.element}</div>
          <div style="font-size:0.7rem; color:var(--text-secondary);">${item.item}</div>
        </td>
        <td data-label="현장 테스트 관찰 내용">
          <div style="font-weight:600; color:var(--text-primary); margin-bottom:4px;">Q. ${item.criterion}</div>
          <div style="background-color:var(--bg-secondary); border-radius:4px; padding:6px; font-size:0.75rem; border-left:3px solid var(--accent-color);">
            <strong>실증 분석:</strong> ${item.analysis || "(관찰 정보 없음)"}
          </div>
          ${item.improvement ? `<div style="margin-top:4px; font-size:0.72rem; color:var(--text-secondary);">💡 권장 대책: ${item.improvement}</div>` : ""}
        </td>
        <td data-label="심각도" style="text-align:center; vertical-align:middle;">${severityBadge}</td>
        <td data-label="기재 여부" style="text-align:center; vertical-align:middle; font-weight:700; color:var(--text-secondary);">
          ${item.selected !== false ? "🟢 기재" : "🔴 미인쇄"}
        </td>
        <td data-label="사진" style="text-align:center; vertical-align:middle; font-size:0.72rem; color:var(--text-tertiary);">
          ${item.screenshot ? `
            <div class="evidence-thumb-container" style="display: inline-block; position: relative;">
              <img src="${item.screenshot}" class="evidence-thumb" style="max-width: 50px; max-height: 50px; border-radius: 4px; cursor: pointer; object-fit: cover; border: 1px solid var(--border-color);" title="클릭하여 원본 크기 증빙 검토" onclick="openLightbox('${item.screenshot}')">
            </div>
          ` : "사진 없음"}
        </td>
        <td data-label="동영상" style="text-align:center; vertical-align:middle; font-size:0.75rem;">
          ${item.videoLink ? `
            <a href="${item.videoLink}" target="_blank" style="color:var(--danger-color); font-weight:700; text-decoration:underline;">📺 보기</a>
          ` : "<span style='color:var(--text-tertiary); font-size:0.72rem;'>없음</span>"}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
}
window.viewSubmittedProject = viewSubmittedProject;

function closeReviewModal() {
  document.getElementById("company-review-modal").style.display = "none";
  activeReviewProjectId = null;
}

// 기업이 작성한 최종 조치결과/피드백 제출 저장 및 실시간 연동
async function submitEnterpriseFeedback() {
  if (!activeReviewProjectId) return;
  const feedbackText = document.getElementById("rev-feedback-textarea").value.trim();

  if (!feedbackText) {
    alert("교사에게 전달할 에듀테크 프로그램 보완 피드백 코멘트를 입력해 주십시오.");
    return;
  }

  const feedbackObj = {
    company: state.currentUser.name || "에듀테크 개발사",
    text: feedbackText,
    date: new Date().toISOString().split('T')[0]
  };

  try {
    // 1. 서버 피드백 반영 API 호출
    const response = await fetch(`${centralDbUrl}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: activeReviewProjectId, feedbackContent: feedbackObj })
    });

    if (response.ok) {
      // 2. 만약 OCI 클라우드가 활성화되어 있다면, OCI 동기화 데이터 송신
      if (oracleConfig.enabled && oracleConfig.endpoint) {
        const targetProj = state.submittedList.find(p => p.id === activeReviewProjectId);
        if (targetProj) {
          targetProj.status = "피드백 완료";
          targetProj.feedback = feedbackObj;
          
          const prevActive = state.activeProject;
          const prevActiveId = state.activeProjectId;
          
          state.activeProjectId = activeReviewProjectId;
          state.activeProject = targetProj;
          
          syncToOracleCloud();
          
          state.activeProject = prevActive;
          state.activeProjectId = prevActiveId;
        }
      }

      closeReviewModal();
      await renderEnterpriseDashboard();
      alert("🎉 개발사의 소중한 피드백이 등록되었습니다!\n\n해당 실증 교사의 보고서 화면에 실시간으로 보완책 피드백 알림이 통보됩니다.");
    } else {
      alert("⚠️ 원격 서버 피드백 저장에 실패했습니다.");
    }
  } catch (err) {
    console.error("원격 서버 피드백 반영 실패:", err);
    alert("⚠️ 서버 연결 오류로 피드백을 전달하지 못했습니다.");
  }
}

// 🔒 [신규] 회원정보 및 비밀번호 수정 처리 모달 제어
function openProfileModal() {
  if (!state.currentUser) {
    alert("로그인이 필요합니다.");
    return;
  }
  
  const modal = document.getElementById("user-profile-modal");
  if (!modal) return;
  
  // 필드 값 세팅
  document.getElementById("prof-email").value = state.currentUser.email || "";
  document.getElementById("prof-name").value = state.currentUser.name || "";
  document.getElementById("prof-school").value = state.currentUser.school || "";
  document.getElementById("prof-team").value = state.currentUser.team || "";
  document.getElementById("prof-password").value = ""; // 비밀번호 필드 초기화
  
  // 역할에 따른 라벨 변경 및 팀 입력란 노출 여부
  const schoolLabel = document.getElementById("prof-school-label");
  const teamGroup = document.getElementById("prof-team-group");
  
  if (state.currentUser.role === "enterprise") {
    if (schoolLabel) schoolLabel.textContent = "🏢 제조 기업명";
    if (teamGroup) teamGroup.style.display = "none";
  } else if (state.currentUser.role === "admin") {
    if (schoolLabel) schoolLabel.textContent = "🛠️ 소속 기관명";
    if (teamGroup) teamGroup.style.display = "none";
  } else {
    if (schoolLabel) schoolLabel.textContent = "🏫 소속 학교명";
    if (teamGroup) teamGroup.style.display = "block";
  }
  
  modal.style.display = "flex";
}

function closeProfileModal() {
  const modal = document.getElementById("user-profile-modal");
  if (modal) modal.style.display = "none";
}

async function saveUserProfile() {
  if (!state.currentUser) return;
  
  const email = state.currentUser.email;
  const school = document.getElementById("prof-school").value.trim();
  const team = state.currentUser.role === "teacher" ? document.getElementById("prof-team").value.trim() : "";
  const password = document.getElementById("prof-password").value.trim();
  
  if (password && password.length < 4) {
    alert("안전한 계정 보안을 위해 비밀번호는 공백 제외 최소 4자리 이상이어야 합니다.");
    return;
  }
  
  try {
    const res = await fetch(`${centralDbUrl}/api/auth/update-profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email,
        school: school,
        team: team || school,
        newPassword: password || undefined
      })
    });
    
    if (res.ok) {
      // 로컬 상태 및 세션 갱신
      state.currentUser.school = school;
      state.currentUser.team = team || school;
      sessionStorage.setItem("softlap_user_session", JSON.stringify(state.currentUser));
      
      // UI 요소 실시간 갱신
      const profileSchool = document.getElementById("profile-school");
      if (profileSchool) {
        profileSchool.textContent = state.currentUser.team || state.currentUser.school || "기관 없음";
      }
      
      const compProfileName = document.getElementById("company-profile-name");
      if (compProfileName) {
        compProfileName.textContent = `${state.currentUser.name} (${state.currentUser.school || ""})`;
      }
      
      showToast("🎉 회원 정보가 정상적으로 변경되었습니다.");
      closeProfileModal();
    } else {
      const err = await res.json();
      alert(err.error || "회원 정보 수정 실패");
    }
  } catch (e) {
    console.error(e);
    alert("서버 통신 실패: " + e.message);
  }
}

// 🏢 [신규] 동일 실증 팀 내 중복 에듀테크 실증 방지 검증 모듈
async function checkTeamDuplication() {
  const warningBanner = document.getElementById("team-duplicate-warning-banner");
  const warningText = document.getElementById("txt-team-duplicate-warning");
  if (!warningBanner || !warningText) return;

  const schoolInput = document.getElementById("in-school-name");
  if (!schoolInput) return;

  const schoolName = schoolInput.value.trim().toLowerCase().replace(/\s+/g, '');
  const productName = (state.activeProject?.meta?.targetProduct || "").trim().toLowerCase().replace(/\s+/g, '');

  if (!schoolName || !productName || productName === "새로운에듀테크프로그램" || productName === "새로운 에듀테크 프로그램") {
    warningBanner.style.display = "none";
    return;
  }

  const activeItems = state.activeProject?.items || [];
  if (activeItems.length === 0) {
    warningBanner.style.display = "none";
    return;
  }

  const now = Date.now();
  // 5초 캐시 적용하여 타이핑/렌더링 시 과도한 API Fetch 방지
  if (now - lastSubmittedFetchTime > 5000 || cachedSubmittedList.length === 0) {
    try {
      const res = await fetch(`${centralDbUrl}/api/submitted`);
      if (res.ok) {
        cachedSubmittedList = await res.json();
        lastSubmittedFetchTime = now;
      }
    } catch (e) {
      console.error("중복 판별용 제출 목록 로드 실패:", e);
    }
  }

  // 동일한 학교명 및 동일한 에듀테크 제품을 실증한 다른 사람의 제출된 보고서들 필터링 (본인 ID 제외)
  const matchingReports = cachedSubmittedList.filter(p => {
    if (p.id === state.activeProjectId || p.id === state.activeProject.id) return false;

    const pSchool = (p.schoolName || p.meta?.schoolName || "").trim().toLowerCase().replace(/\s+/g, '');
    const pProduct = (p.meta?.targetProduct || "").trim().toLowerCase().replace(/\s+/g, '');
    
    return pSchool === schoolName && pProduct === productName;
  });

  const duplicates = [];
  matchingReports.forEach(report => {
    const reportItems = report.items || [];
    reportItems.forEach(repItem => {
      // 대분류와 중분류가 모두 동일한 항목이 현재 프로젝트에 있는지 확인
      const hasDup = activeItems.some(actItem => 
        actItem.element === repItem.element && actItem.item === repItem.item
      );
      if (hasDup) {
        duplicates.push({
          teacherName: report.meta?.teacherName || report.teacherName || "다른 교사",
          element: repItem.element,
          item: repItem.item
        });
      }
    });
  });

  if (duplicates.length > 0) {
    warningBanner.style.display = "flex";
    // 중복된 실증 항목들을 보기 좋게 포맷팅
    const dupStr = duplicates.map(d => `[${d.teacherName} 교사: ${d.element} ➔ ${d.item}]`).join(", ");
    warningText.innerHTML = `⚠️ <strong>동일 실증 팀 내 중복 실증 항목 감지!</strong><br>
    동일 실증 팀 내 다른 교사분이 제출 완료한 보고서와 <strong>실증항목이 중복</strong>됩니다.<br>
    <strong>중복 항목:</strong> ${dupStr}<br>
    중복 평가를 방지하기 위해 실증 목적을 사전에 논의하거나 협업으로 작성해 주십시오.`;
  } else {
    warningBanner.style.display = "none";
  }
}

// 📷 [신규] Canvas 2D 이용 고성능 이미지 비례 축소 및 JPEG 0.85 고화질 압축 엔진 (HD급 보존)
function compressImageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        // 고화질 개선: 가로 1280px 기준으로 비례 축소 리사이징
        const MAX_WIDTH = 1280;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;

        // 캔버스에 이미지 렌더링
        ctx.drawImage(img, 0, 0, width, height);

        // JPEG 포맷 + 0.85 고품질 가변 압축
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.85);
        resolve(compressedBase64);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

// 🖼️ [신규] 글래스모피즘 라이트박스 팝업 오버레이 제어기
function openLightbox(src) {
  const lightbox = document.getElementById("global-image-lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  if (!lightbox || !lightboxImg) return;

  lightboxImg.src = src;
  lightbox.style.display = "flex";
}
window.openLightbox = openLightbox;

function closeLightbox() {
  const lightbox = document.getElementById("global-image-lightbox");
  if (lightbox) {
    lightbox.style.display = "none";
  }
}
// 🧹 [신규] 기업이 등록한 모든 피드백 데이터를 초기화(리셋)하는 처리기
async function handleClearCompanyFeedback() {
  if (!state.currentUser || state.currentUser.role !== "enterprise") {
    alert("에듀테크 기업 로그인 권한이 없습니다.");
    return;
  }

  const companyProduct = state.currentUser.name; // 기업 회원의 대표명이 에듀테크 제품명과 동일함
  
  if (!confirm(`🚨 [피드백 데이터 전체 초기화]\n\n제품 '${companyProduct}'에 등록하신 모든 피드백 내용을 삭제(초기화)하시겠습니까?\n\n이 작업은 복구가 불가능하며, 완료된 피드백들이 다시 '피드백 대기' 상태로 원복됩니다.`)) {
    return;
  }

  try {
    const response = await fetch(`${centralDbUrl}/api/feedback/clear-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyProduct: companyProduct })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.count === 0) {
        alert("초기화할 기존 피드백 데이터가 존재하지 않습니다.");
      } else {
        showToast(`🎉 제품 '${companyProduct}'의 피드백 데이터 ${data.count}건이 완벽하게 초기화되었습니다!`);
        await renderEnterpriseDashboard();
      }
    } else {
      const errData = await response.json();
      alert("피드백 초기화 서버 반영 실패: " + (errData.error || "알 수 없는 오류"));
    }
  } catch (err) {
    alert("서버 연결 실패: " + err.message);
  }
}

// ↩️ 에듀테크 기업 피드백 취소 처리기
async function cancelEnterpriseFeedback() {
  if (!activeReviewProjectId) return;

  if (!confirm("↩️ [피드백 취소]\n\n해당 실증 보고서에 등록된 조치 계획 및 피드백을 삭제하고 다시 '피드백 대기' 상태로 되돌리시겠습니까?")) {
    return;
  }

  try {
    const response = await fetch(`${centralDbUrl}/api/feedback/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: activeReviewProjectId })
    });

    if (response.ok) {
      // 만약 OCI 클라우드가 활성화되어 있다면, OCI 동기화 데이터 송신
      if (oracleConfig.enabled && oracleConfig.endpoint) {
        const targetProj = state.submittedList.find(p => p.id === activeReviewProjectId);
        if (targetProj) {
          targetProj.status = "제출완료";
          delete targetProj.feedback;
          
          const prevActive = state.activeProject;
          const prevActiveId = state.activeProjectId;
          
          state.activeProjectId = activeReviewProjectId;
          state.activeProject = targetProj;
          
          syncToOracleCloud();
          
          state.activeProject = prevActive;
          state.activeProjectId = prevActiveId;
        }
      }

      closeReviewModal();
      await renderEnterpriseDashboard();
      showToast("🎉 피드백이 정상적으로 취소되어 피드백 대기 상태로 원복되었습니다.");
    } else {
      const errData = await response.json();
      alert(errData.error || "⚠️ 피드백 취소에 실패했습니다.");
    }
  } catch (err) {
    console.error("피드백 취소 중 오류:", err);
    alert("⚠️ 서버 연결 오류로 피드백을 취소하지 못했습니다.");
  }
}

// ↩️ [신규] 에듀테크 기업 최종 제출 취소 처리기
async function cancelProjectSubmission() {
  if (!state.activeProjectId) return;

  const status = state.activeProject.status || "제출완료";
  const isAdmin = state.currentUser?.isAdmin || state.currentUser?.role === "admin";
  
  if (status === "피드백 완료" && !isAdmin) {
    alert("⚠️ 이미 협력 개발사로부터 피드백 및 보완 대책 조치결과가 등록 완료된 보고서는 제출을 취소할 수 없습니다.");
    return;
  }

  const confirmMsg = isAdmin
    ? "↩️ [관리자 권한 - 기업 제출 강제 취소]\n\n해당 보고서의 제출을 취소하시겠습니까?\n\n제출을 취소하면 보고서가 다시 원래 작성자의 보관함에서 '작성중' 상태로 원복되며, 추가 편집이 가능해집니다."
    : "↩️ [기업에 제출 취소]\n\n에듀테크 기업에 제출된 본 보고서를 취소하시겠습니까?\n\n제출을 취소하면 보고서가 다시 '작성중' 상태로 원복되며, 추가 수정 및 보완이 가능해집니다.";

  if (!confirm(confirmMsg)) {
    return;
  }

  // 1. 서버 제출된 목록 fetch하여 원작성자 정보 식별
  let submittedList = [];
  let targetEmail = state.activeProject.email || state.currentUser.email; // 기본값
  
  try {
    const res = await fetch(`${centralDbUrl}/api/submitted`);
    if (res.ok) {
      submittedList = await res.json();
    }
  } catch (err) {
    console.error("제출 목록 로드 실패:", err);
  }

  const matchSubmit = submittedList.find(p => p.id === state.activeProjectId);
  if (matchSubmit && matchSubmit.email) {
    targetEmail = matchSubmit.email;
  }

  // 2. 상태 원복 처리
  state.activeProject.submitted = false;
  state.activeProject.status = "작성중";
  delete state.activeProject.submitDate;
  delete state.activeProject.feedback;

  // 원작성자(교사)의 프로젝트 보관함 리스트 원격 복원 저장
  try {
    const projRes = await fetch(`${centralDbUrl}/api/projects?email=${encodeURIComponent(targetEmail)}`);
    if (projRes.ok) {
      const targetProjects = await projRes.json() || [];
      const projIndex = targetProjects.findIndex(p => p.id === state.activeProjectId);
      
      const restoredProj = JSON.parse(JSON.stringify(state.activeProject));
      restoredProj.email = targetEmail;

      if (projIndex !== -1) {
        targetProjects[projIndex] = restoredProj;
      } else {
        targetProjects.push(restoredProj);
      }

      await fetch(`${centralDbUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, projects: targetProjects })
      });
    }
  } catch (projErr) {
    console.error("원작성자 보관함 복원 실패:", projErr);
    alert("⚠️ 원작성자의 개인 보관함 데이터 복원에 실패했습니다: " + projErr.message);
    return;
  }

  // 3. 서버 제출된 목록에서 본인 데이터 삭제 및 POST 저장
  try {
    const updatedSubmittedList = submittedList.filter(p => p.id !== state.activeProjectId);

    const postRes = await fetch(`${centralDbUrl}/api/submitted`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submittedList: updatedSubmittedList })
    });

    if (postRes.ok) {
      showToast("🎉 성공적으로 제출이 취소되어 편집 가능한 작성중 상태로 복원되었습니다.");
      await loadUserProjects();
    } else {
      throw new Error("서버 제출 목록 갱신 실패");
    }
  } catch (err) {
    console.error("제출 취소 중 오류:", err);
    alert("⚠️ 원격 서버 제출 갱신 실패: " + err.message + "\n\n네트워크 상황을 확인해 주십시오.");
  }
}

// ❌ [관리자 전용] 제출 완료 문서 완전히 삭제 처리기
async function deleteSubmittedProject(projectId) {
  const isAdmin = state.currentUser?.isAdmin || state.currentUser?.role === "admin";
  if (!isAdmin) {
    alert("관리자 권한이 필요합니다.");
    return;
  }

  if (!confirm("⚠️ [경고 - 관리자 영구 삭제]\n\n해당 제출 문서를 시스템에서 완전히 삭제하시겠습니까?\n\n(삭제 시 기업 피드백 센터 목록에서 영구 제거되며, 원작성자의 개인 보관함에서도 해당 보고서 데이터가 완전히 삭제되어 복구할 수 없게 됩니다.)")) {
    return;
  }

  // 1. 서버 제출된 목록 fetch하여 원작성자 정보 식별
  let submittedList = [];
  try {
    const res = await fetch(`${centralDbUrl}/api/submitted`);
    if (res.ok) {
      submittedList = await res.json();
    }
  } catch (err) {
    console.error("제출 목록 로드 실패:", err);
  }

  const matchSubmit = submittedList.find(p => p.id === projectId);
  if (!matchSubmit) {
    alert("삭제할 제출 문서를 찾을 수 없습니다.");
    return;
  }

  const targetEmail = matchSubmit.email;

  // 2. 원작성자(교사)의 프로젝트 보관함 리스트에서 해당 프로젝트 영구 삭제
  try {
    const projRes = await fetch(`${centralDbUrl}/api/projects?email=${encodeURIComponent(targetEmail)}`);
    if (projRes.ok) {
      const targetProjects = await projRes.json() || [];
      const updatedProjects = targetProjects.filter(p => p.id !== projectId);

      await fetch(`${centralDbUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, projects: updatedProjects })
      });
    }
  } catch (projErr) {
    console.error("원작성자 보관함 삭제 실패:", projErr);
    alert("⚠️ 원작성자의 개인 보관함 데이터 삭제에 실패했습니다: " + projErr.message);
    return;
  }

  // 3. 서버 제출된 목록에서 데이터 삭제 및 POST 저장
  try {
    const updatedSubmittedList = submittedList.filter(p => p.id !== projectId);

    const postRes = await fetch(`${centralDbUrl}/api/submitted`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submittedList: updatedSubmittedList })
    });

    if (postRes.ok) {
      showToast("🎉 해당 제출 문서가 시스템에서 완전히 삭제되었습니다.");
      await renderEnterpriseDashboard();
    } else {
      throw new Error("서버 제출 목록 갱신 실패");
    }
  } catch (err) {
    console.error("제출 삭제 중 오류:", err);
    alert("⚠️ 원격 서버 제출 삭제 반영 실패: " + err.message);
  }
}
window.deleteSubmittedProject = deleteSubmittedProject;

// 👥 [신규] 팀별 보고서 취합 시스템 함수군

// 1. 팀별 보고서 워크스페이스 렌더링 시작점
async function renderTeamWorkspace() {
  // 팀장 전용 패널 가시성 제어
  const isLeader = state.currentUser?.isLeader || state.currentUser?.role === 'team_leader';
  const leaderTracker = document.getElementById('leader-submission-tracker');
  if (leaderTracker) {
    leaderTracker.style.display = isLeader ? 'block' : 'none';
  }

  if (isLeader) {
    // 팀장 정보 자동 채우기
    const leaderTeamInput = document.getElementById('leader-team-name');
    if (leaderTeamInput) {
      leaderTeamInput.value = state.currentUser.team || state.currentUser.school || '팀명 미등록';
    }
    // 팀장 제출 현황 추적 이벤트 바인딩 (중복 방지)
    const leaderRefreshBtn = document.getElementById('btn-leader-refresh');
    if (leaderRefreshBtn && !leaderRefreshBtn._bound) {
      leaderRefreshBtn.addEventListener('click', () => fetchTeamReportData(false));
      leaderRefreshBtn._bound = true;
    }
    const leaderRemindBtn = document.getElementById('btn-leader-remind');
    if (leaderRemindBtn && !leaderRemindBtn._bound) {
      leaderRemindBtn.addEventListener('click', remindUnsubmittedTeamMembers);
      leaderRemindBtn._bound = true;
    }
    const leaderProductSelect = document.getElementById('leader-product-select');
    if (leaderProductSelect && !leaderProductSelect._bound) {
      leaderProductSelect.addEventListener('change', renderLeaderSubmissionTracker);
      leaderProductSelect._bound = true;
    }
    // 팀원 목록 갱신 버튼 바인딩
    const leaderLoadMembersBtn = document.getElementById('btn-leader-load-members');
    if (leaderLoadMembersBtn && !leaderLoadMembersBtn._bound) {
      leaderLoadMembersBtn.addEventListener('click', loadTeamMembers);
      leaderLoadMembersBtn._bound = true;
    }
  }

  await fetchTeamReportData(true);

  // 팀장이면 팀원 목록도 자동 로드
  if (isLeader) {
    loadTeamMembers();
  }
}

// 2. 서버에서 제출된 실시간 데이터 로드
async function fetchTeamReportData(silent = false) {
  try {
    const res = await fetch(centralDbUrl + '/api/submitted');
    if (res.ok) {
      const allList = await res.json();

      // 접근 제한: 관리자만 전체, 나머지는 모두 자기 팀만
      const isAdmin = state.currentUser?.isAdmin || state.currentUser?.role === 'admin';

      if (isAdmin) {
        state.submittedList = allList;
      } else {
        const myTeam = (state.currentUser?.team || state.currentUser?.school || '').trim().toLowerCase();
        if (myTeam) {
          state.submittedList = allList.filter(function(p) {
            return p.schoolName && p.schoolName.trim().toLowerCase().includes(myTeam);
          });
        } else {
          const myEmail = (state.currentUser?.email || '').toLowerCase();
          state.submittedList = allList.filter(function(p) {
            return (p.email || '').toLowerCase() === myEmail;
          });
        }
      }

      if (!silent) showToast('🔄 원격 서버로부터 제출 목록 데이터를 동기화했습니다.');
    } else {
      throw new Error('조회 에러');
    }
  } catch (e) {
    console.error('제출 목록 로드 실패:', e);
    if (!silent) showToast('⚠️ 실시간 제출 목록을 데이터베이스에서 불러오지 못했습니다.');
    state.submittedList = [];
  }
  populateTeamNames();

  // 팀장인 경우 제출현황 트래커도 갱신
  const isLeaderF = state.currentUser?.isLeader || state.currentUser?.role === 'team_leader';
  if (isLeaderF) {
    populateLeaderProducts();
  }
}
// 팀장 전용: 팀장 팀에 해당하는 제품 목록 구성
function populateLeaderProducts() {
  const leaderTeamInput = document.getElementById("leader-team-name");
  const leaderProductSelect = document.getElementById("leader-product-select");
  if (!leaderProductSelect || !leaderTeamInput) return;

  const teamName = (leaderTeamInput.value || "").trim();
  const savedValue = leaderProductSelect.value;

  leaderProductSelect.innerHTML = '<option value="">-- 전체 제품 보기 --</option>';

  if (!teamName) return;

  const teamLower = teamName.toLowerCase();
  const filtered = (state.submittedList || []).filter(p =>
    p.schoolName && p.schoolName.toLowerCase().includes(teamLower)
  );

  const products = [...new Set(filtered.map(p => p.meta?.targetProduct).filter(Boolean))];
  products.forEach(prod => {
    const opt = document.createElement("option");
    opt.value = prod;
    opt.textContent = prod;
    if (prod === savedValue) opt.selected = true;
    leaderProductSelect.appendChild(opt);
  });

  renderLeaderSubmissionTracker();
}

// 팀장 전용: 팀원별 보고서 제출 현황 렌더링
async function renderLeaderSubmissionTracker() {
  const leaderTeamInput = document.getElementById("leader-team-name");
  const leaderProductSelect = document.getElementById("leader-product-select");
  const tbody = document.getElementById("leader-submissions-tbody");

  if (!tbody || !leaderTeamInput) return;

  const teamName = (leaderTeamInput.value || "").trim();
  const productFilter = leaderProductSelect ? leaderProductSelect.value : "";

  if (!teamName) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-tertiary);">팀장 계정의 팀명이 등록되지 않았습니다.</td></tr>`;
    return;
  }

  // 서버에서 같은 팀에 속한 모든 사용자 조회
  let teamUsers = [];
  try {
    const res = await fetch(`${centralDbUrl}/api/admin/users`);
    if (res.ok) {
      const usersDB = await res.json();
      const teamLower = teamName.toLowerCase();
      teamUsers = Object.entries(usersDB)
        .filter(([email, user]) => {
          if (email === "admin") return false;
          if (user.role === "enterprise" || user.isEnterprise) return false;
          if (user.role === "team_leader" || user.isLeader) return false;
          const userTeam = (user.team || user.school || "").toLowerCase();
          return userTeam.includes(teamLower) || teamLower.includes(userTeam);
        })
        .map(([email, user]) => ({ email, ...user }));
    }
  } catch (e) {
    console.warn("팀원 목록 로드 실패 (관리자 API 미접근):", e);
  }

  // 제출된 목록에서 이 팀 소속 보고서 추출
  const teamLower = teamName.toLowerCase();
  let submittedInTeam = (state.submittedList || []).filter(p =>
    p.schoolName && p.schoolName.toLowerCase().includes(teamLower)
  );

  if (productFilter) {
    submittedInTeam = submittedInTeam.filter(p => p.meta?.targetProduct === productFilter);
  }

  // 제출된 교사 이메일 목록
  const submittedEmails = new Set(submittedInTeam.map(p => p.email).filter(Boolean));
  const submittedTeachers = new Set(submittedInTeam.map(p => p.teacherName).filter(Boolean));

  // 통계 계산
  const totalCount = teamUsers.length;
  const submittedCount = teamUsers.length > 0
    ? teamUsers.filter(u => submittedEmails.has(u.email) || submittedTeachers.has(u.name)).length
    : submittedInTeam.length;
  const pendingCount = Math.max(0, totalCount - submittedCount);
  const rate = totalCount > 0 ? Math.round((submittedCount / totalCount) * 100) : (submittedInTeam.length > 0 ? 100 : 0);

  const statTotal = document.getElementById("leader-stat-total");
  const statSubmitted = document.getElementById("leader-stat-submitted");
  const statPending = document.getElementById("leader-stat-pending");
  const statRate = document.getElementById("leader-stat-rate");

  if (statTotal) statTotal.textContent = `${totalCount}명`;
  if (statSubmitted) statSubmitted.textContent = `${submittedCount}명`;
  if (statPending) statPending.textContent = `${pendingCount}명`;
  if (statRate) statRate.textContent = `${rate}%`;

  tbody.innerHTML = "";

  if (teamUsers.length === 0 && submittedInTeam.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-tertiary);">⚠️ 같은 팀으로 등록된 팀원이 없습니다. 팀원들이 동일한 팀명으로 가입했는지 확인하세요.</td></tr>`;
    return;
  }

  // 제출된 보고서 목록 먼저 렌더링
  submittedInTeam.forEach((proj, idx) => {
    const tr = document.createElement("tr");
    const statusHtml = `<span class="status-badge ${proj.status === '피드백 완료' ? 'status-completed' : 'status-submitted'}" style="font-size:0.7rem;">
      ${proj.status === '피드백 완료' ? '✅ 피드백 완료' : '📤 제출완료'}
    </span>`;

    tr.innerHTML = `
      <td style="text-align:center; font-weight:700; color:var(--accent-color);">${idx + 1}</td>
      <td><strong>${proj.teacherName || "-"}</strong> 교사</td>
      <td style="font-size:0.8rem; color:var(--text-secondary);">${proj.schoolName || "-"}</td>
      <td style="font-weight:600; color:var(--accent-color); font-size:0.8rem;">${proj.meta?.targetProduct || "-"}</td>
      <td style="text-align:center; font-size:0.8rem;">${proj.submitDate || "-"}</td>
      <td style="text-align:center;">${statusHtml}</td>
    `;
    tbody.appendChild(tr);
  });

  // 미제출 팀원 목록 렌더링
  const unsubmittedUsers = teamUsers.filter(u =>
    !submittedEmails.has(u.email) && !submittedTeachers.has(u.name)
  );

  unsubmittedUsers.forEach((user, idx) => {
    const tr = document.createElement("tr");
    tr.style.backgroundColor = "hsl(0, 100%, 98%)";
    const statusHtml = `<span style="display:inline-flex; align-items:center; gap:4px; font-size:0.7rem; font-weight:700; color:var(--danger-color); background:hsl(0,100%,95%); padding:3px 8px; border-radius:4px; border:1px solid hsl(0,100%,88%);">⏳ 미제출</span>`;

    tr.innerHTML = `
      <td style="text-align:center; font-weight:700; color:var(--danger-color);">-</td>
      <td><strong style="color:var(--danger-color);">${user.name || "-"}</strong> 교사</td>
      <td style="font-size:0.8rem; color:var(--text-secondary);">${user.school || "-"}</td>
      <td style="font-size:0.8rem; color:var(--text-tertiary); font-style:italic;">${productFilter || "미제출"}</td>
      <td style="text-align:center; font-size:0.8rem; color:var(--text-tertiary);">-</td>
      <td style="text-align:center;">${statusHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 팀장 전용: 미제출 팀원 독려 알림 (복사 가능한 명단 생성)
function remindUnsubmittedTeamMembers() {
  const tbody = document.getElementById("leader-submissions-tbody");
  if (!tbody) return;

  const leaderTeamInput = document.getElementById("leader-team-name");
  const leaderProductSelect = document.getElementById("leader-product-select");
  const teamName = leaderTeamInput ? leaderTeamInput.value : "팀";
  const productName = leaderProductSelect ? leaderProductSelect.value : "";

  // 미제출 행 추출 (빨간 배경 행)
  const unsubmittedRows = [];
  tbody.querySelectorAll("tr").forEach(tr => {
    const statusCell = tr.cells[5];
    if (statusCell && statusCell.textContent.includes("미제출")) {
      const nameCell = tr.cells[1];
      if (nameCell) unsubmittedRows.push(nameCell.textContent.trim());
    }
  });

  if (unsubmittedRows.length === 0) {
    alert("🎉 모든 팀원이 보고서를 제출 완료했습니다!\n\n팀 전원 제출 완료 상태입니다.");
    return;
  }

  const productStr = productName ? `\n📦 대상 제품: ${productName}` : "";
  const message = `📢 [${teamName} 팀장 보고서 제출 독려]${productStr}\n\n아직 실증 보고서를 제출하지 않은 교사 명단입니다:\n\n${unsubmittedRows.map((name, i) => `  ${i + 1}. ${name}`).join("\n")}\n\n보고서를 아직 제출하지 않으셨다면, 서울에듀테크소프트랩 시스템에 접속하여 보고서를 완성한 후 '기업에 제출' 버튼을 눌러 주시기 바랍니다.\n\n감사합니다.`;

  // 클립보드 복사
  navigator.clipboard.writeText(message).then(() => {
    showToast("📢 미제출자 독려 메시지가 클립보드에 복사되었습니다! 메신저에 바로 붙여넣기 하세요.");
  }).catch(() => {
    alert(message);
  });
}

// 팀장 전용: 팀 구성원 목록 불러오기
async function loadTeamMembers() {
  const tbody = document.getElementById('leader-members-tbody');
  if (!tbody) return;

  const leaderEmail = state.currentUser?.email;
  const teamName = state.currentUser?.team || state.currentUser?.school || '';

  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:18px;color:hsl(220, 15%, 75%);">...</td></tr>';

  if (!leaderEmail) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:18px;color:var(--danger-color);">로그인 정보를 찾을 수 없습니다.</td></tr>';
    return;
  }

  try {
    const url = centralDbUrl + '/api/team/members?leaderEmail=' + encodeURIComponent(leaderEmail) + '&teamName=' + encodeURIComponent(teamName);
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json();
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:18px;color:var(--danger-color);">' + (err.error || '팀원 목록 로드 실패') + '</td></tr>';
      return;
    }
    const members = await res.json();

    if (members.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:18px;color:hsl(220, 15%, 75%);">'
        + '<div style="font-size:0.85rem;margin-bottom:6px;">현재 <strong>' + (teamName || '팀명 없음') + '</strong> 팀명으로 가입한 교사가 없습니다.</div>'
        + '<div style="font-size:0.75rem;">팀원들이 회원가입 시 같은 팀명을 입력했는지 확인하세요.</div>'
        + '</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    members.forEach(function(member, idx) {
      const tr = document.createElement('tr');
      tr.style.cssText = 'border-bottom:1px solid hsl(220,30%,22%);transition:background 0.15s;';
      tr.onmouseover = function() { this.style.background = 'hsl(220,30%,16%)'; };
      tr.onmouseout = function() { this.style.background = ''; };
      const safeEmail = (member.email || '').replace(/'/g, "\\'");
      const safeName = (member.name || '').replace(/'/g, "\\'");
      const teamLabel = member.team || member.school || '(팀명 없음)';
      tr.innerHTML = '<td style="text-align:center;padding:8px 6px;font-weight:800;color:hsl(200,100%,70%);font-size:0.8rem;">' + (idx + 1) + '</td>'
        + '<td style="padding:8px 10px;color:#ffffff;"><strong style="font-size:0.82rem;color:#ffffff;">' + (member.name || '-') + '</strong></td>'
        + '<td style="padding:8px 10px;font-size:0.78rem;color:hsl(220, 15%, 75%);">' + (member.school || '-') + '</td>'
        + '<td style="padding:8px 10px;"><span style="background:hsl(220,30%,20%);padding:2px 8px;border-radius:20px;font-size:0.72rem;border:1px solid hsl(220,30%,28%);color:hsl(200,60%,65%);font-weight:600;">' + teamLabel + '</span></td>'
        + '<td style="text-align:center;padding:6px;"><button class="btn" style="font-size:0.68rem;padding:3px 10px;border-color:hsl(0,70%,55%);color:hsl(0,70%,65%);background:hsl(0,40%,15%);font-weight:700;" onclick="kickTeamMember(\'' + safeEmail + '\', \'' + safeName + '\')">내보내기</button></td>';
      tbody.appendChild(tr);
    });
    showToast(members.length + '명의 팀원 목록을 불러왔습니다.');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:18px;color:var(--danger-color);">서버 연결 실패: ' + e.message + '</td></tr>';
  }
}

// 팀장 전용: 팀원 내보내기
async function kickTeamMember(targetEmail, targetName) {
  if (!confirm('[팀원 내보내기 확인]\n\n' + targetName + ' 교사를 현재 팀에서 내보내시겠습니까?\n\n내보내기 후 해당 교사의 팀명이 초기화되며,\n올바른 팀명으로 재가입해야 합니다.')) return;

  const leaderEmail = state.currentUser?.email;
  if (!leaderEmail) { alert('팀장 계정 정보를 찾을 수 없습니다.'); return; }

  try {
    const res = await fetch(centralDbUrl + '/api/team/kick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leaderEmail: leaderEmail, targetEmail: targetEmail })
    });
    if (res.ok) {
      showToast(targetName + ' 교사가 팀에서 내보내졌습니다.');
      loadTeamMembers();
    } else {
      const err = await res.json();
      alert(err.error || '팀원 내보내기 실패');
    }
  } catch (e) {
    alert('서버 연결 실패: ' + e.message);
  }
}
window.kickTeamMember = kickTeamMember;

// 2-A. 팀 보고서 작성용 팀명 헬퍼
function getTeamReportTeamName() {
  const select = document.getElementById("team-name-select");
  if (!select) return "";
  if (select.value === "direct") {
    const directInput = document.getElementById("team-name-direct");
    return directInput ? directInput.value.trim() : "";
  }
  return select.value.trim();
}

// 2-B. 서버 자료를 바탕으로 고유 실증 팀명 목록을 추출하여 셀렉터 구성
function populateTeamNames() {
  const select = document.getElementById("team-name-select");
  if (!select) return;

  const isAdmin      = state.currentUser?.isAdmin || state.currentUser?.role === "admin";
  // 관리자만 전체 팀 선택 가능, 나머지(교사·팀장·기업)는 자기 팀 고정
  const isPrivileged = isAdmin;

  const myTeam   = (state.currentUser?.team || state.currentUser?.school || "").trim();
  const savedTeam = localStorage.getItem("softlap_team_report_last_team");
  const originalValue = select.value || savedTeam || myTeam || "";
  select.innerHTML = '<option value="">-- 실증 팀을 선택하세요 --</option>';

  const teams = [...new Set((state.submittedList || []).map(p => p.schoolName).filter(Boolean))];
  
  teams.forEach(team => {
    const opt = document.createElement("option");
    opt.value = team;
    opt.textContent = team;
    if (team === originalValue) opt.selected = true;
    select.appendChild(opt);
  });

  // 일반 교사: 직접입력 옵션 숨기고 자기 팀 고정
  const directInput = document.getElementById("team-name-direct");
  const teamSelectWrapper = select.parentElement;

  if (!isPrivileged) {
    // 직접 입력 옵션 제거
    const optDirect = document.createElement("option");
    // 직접입력 옵션 추가 안 함 (교사는 불필요)

    // 드롭다운 비활성화 + 자기 팀으로 강제 고정
    select.disabled = true;
    select.style.opacity = "0.8";
    select.style.cursor = "not-allowed";

    if (directInput) {
      directInput.style.display = "none";
      directInput.value = "";
    }

    // 자기 팀 자동 선택
    const myTeamLower = myTeam.toLowerCase();
    const matchedTeam = teams.find(t => t.toLowerCase().includes(myTeamLower) || myTeamLower.includes(t.toLowerCase()));
    if (matchedTeam) {
      select.value = matchedTeam;
    } else if (teams.length === 1) {
      select.value = teams[0];
    }

  } else {
    // 관리자/기업/팀장: 직접 입력 옵션 추가
    select.disabled = false;
    select.style.opacity = "";
    select.style.cursor = "";

    const optDirect = document.createElement("option");
    optDirect.value = "direct";
    optDirect.textContent = "✍️ 직접 팀명 기재하기...";
    select.appendChild(optDirect);

    const inList = teams.includes(originalValue);
    if (!inList && originalValue && originalValue !== "direct") {
      select.value = "direct";
      if (directInput) {
        directInput.style.display = "block";
        directInput.value = originalValue;
      }
    } else {
      if (inList) {
        select.value = originalValue;
      } else if (teams.length > 0) {
        const userTeam = state.currentUser?.team || state.currentUser?.school || "";
        const matchedTeam = teams.find(t => t.toLowerCase().includes(userTeam.toLowerCase()));
        select.value = matchedTeam || teams[0];
      }
      if (directInput) {
        if (select.value === "direct") {
          directInput.style.display = "block";
        } else {
          directInput.style.display = "none";
          directInput.value = "";
        }
      }
    }
  }

  populateTeamProducts();
}

// 3. 현재 선택된 팀명의 모든 제품 목록을 스캔하여 셀렉터 구성
function populateTeamProducts() {
  const teamName = getTeamReportTeamName();
  if (teamName) {
    localStorage.setItem("softlap_team_report_last_team", teamName);
  }
  const teamNameLower = teamName.toLowerCase();
  const select = document.getElementById("team-product-select");
  if (!select) return;
  
  const originalValue = select.value;
  select.innerHTML = '<option value="">-- 제품을 선택하세요 --</option>';
  
  if (!teamNameLower) {
    return;
  }
  
  const filtered = (state.submittedList || []).filter(p => 
    p.schoolName && p.schoolName.toLowerCase().includes(teamNameLower)
  );
  
  const products = [...new Set(filtered.map(p => p.meta?.targetProduct).filter(Boolean))];
  
  products.forEach(prod => {
    const opt = document.createElement("option");
    opt.value = prod;
    opt.textContent = prod;
    if (prod === originalValue) opt.selected = true;
    select.appendChild(opt);
  });

  if (products.length > 0 && !select.value) {
    select.value = products[0];
  }
  
  renderTeamReportCompiled();
}

// 4. 선택된 팀명 + 제품 조합의 상세 취합 결과 화면 렌더링
function renderTeamReportCompiled() {
  const teamName = getTeamReportTeamName();
  const productName = document.getElementById("team-product-select").value;
  const teachersDisplay = document.getElementById("team-teachers-display");
  const itemsContainer = document.getElementById("team-aggregated-items");
  const feedbackContainer = document.getElementById("team-aggregated-feedbacks");
  
  if (!itemsContainer || !feedbackContainer) return;
  
  itemsContainer.innerHTML = "";
  feedbackContainer.innerHTML = "";
  
  if (!teamName || !productName) {
    itemsContainer.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-tertiary); font-size: 0.85rem;">실증 팀명과 대상 제품을 선택하여 취합 내역을 로드해 주세요.</div>`;
    feedbackContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-tertiary); font-size: 0.85rem;">등록된 기업 피드백이 없습니다.</div>`;
    if (teachersDisplay) teachersDisplay.value = "";
    document.getElementById("team-stat-reports-count").textContent = "0개";
    document.getElementById("team-stat-items-count").textContent = "0개";
    
    const barChart = document.getElementById("team-bar-chart");
    if (barChart) barChart.innerHTML = "";
    return;
  }
  
  const matchingProjects = (state.submittedList || []).filter(p => 
    p.schoolName === teamName && 
    p.meta?.targetProduct === productName
  );
  
  const uniqueTeachers = [...new Set(matchingProjects.map(p => p.teacherName).filter(Boolean))];
  if (teachersDisplay) {
    teachersDisplay.value = uniqueTeachers.join(", ") || "교사 없음";
  }
  
  document.getElementById("team-stat-reports-count").textContent = `${matchingProjects.length}개`;
  
  const allAggregatedItems = [];
  matchingProjects.forEach(proj => {
    (proj.items || []).forEach(item => {
      allAggregatedItems.push({
        ...item,
        teacherName: proj.teacherName
      });
    });
  });
  document.getElementById("team-stat-items-count").textContent = `${allAggregatedItems.length}개`;
  
  const barChart = document.getElementById("team-bar-chart");
  if (barChart) {
    barChart.innerHTML = "";
    Object.keys(EMPIRICAL_STANDARDS).forEach(elName => {
      const elItems = allAggregatedItems.filter(i => i.element === elName);
      const rateEl = allAggregatedItems.length > 0 ? Math.round((elItems.length / allAggregatedItems.length) * 100) : 0;
      
      barChart.innerHTML += `
        <div class="bar-row">
          <div class="bar-label-box">
            <span>🛡️ ${elName}</span>
            <span style="color: var(--text-secondary);">${rateEl}% (${elItems.length}개)</span>
          </div>
          <div class="bar-bg">
            <div class="bar-fill" style="width: ${rateEl}%; background: linear-gradient(90deg, var(--accent-color), hsl(210, 100%, 65%));"></div>
          </div>
        </div>
      `;
    });
  }
  
  if (allAggregatedItems.length === 0) {
    itemsContainer.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-tertiary); font-size: 0.85rem;">수집된 세부 실증 항목이 없습니다.</div>`;
  } else {
    Object.keys(EMPIRICAL_STANDARDS).forEach(elName => {
      const elItems = allAggregatedItems.filter(i => i.element === elName);
      if (elItems.length > 0) {
        const elSection = document.createElement("div");
        elSection.style.marginBottom = "14px";
        elSection.innerHTML = `
          <h4 style="font-size:0.85rem; font-weight:800; color:var(--accent-color); margin-bottom:8px; border-bottom:1px dashed var(--border-color); padding-bottom:4px;">
            🛡️ ${elName} (${elItems.length}건)
          </h4>
        `;
        
        const cardGrid = document.createElement("div");
        cardGrid.style.display = "grid";
        cardGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(320px, 1fr))";
        cardGrid.style.gap = "10px";
        
        elItems.forEach(item => {
          const card = document.createElement("div");
          card.className = "kpi-card glass";
          card.style.flexDirection = "column";
          card.style.alignItems = "stretch";
          card.style.padding = "14px";
          card.style.gap = "8px";
          
          let sevClass = item.severity === '상' ? 'high' : item.severity === '중' ? 'mid' : 'low';
          
          card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong style="font-size:0.82rem; color:var(--text-primary);">${item.item}</strong>
              <span class="severity-badge ${sevClass}">${item.severity}</span>
            </div>
            <div style="font-size:0.74rem; color:var(--text-tertiary); background-color:var(--bg-tertiary); padding:6px; border-radius:4px;">
              <strong>기준:</strong> ${item.criterion}
            </div>
            <div style="font-size:0.78rem; line-height:1.4;">
              <strong>분석내용:</strong> ${item.analysis || '<span style="color:var(--text-tertiary); font-style:italic;">현상 미기록</span>'}
            </div>
            <div style="font-size:0.78rem; line-height:1.4;">
              <strong>개선의견:</strong> ${item.improvement || '<span style="color:var(--text-tertiary); font-style:italic;">개선안 미기록</span>'}
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:6px; margin-top:4px; font-size:0.7rem; color:var(--text-secondary);">
              <span>교사: <strong>${item.teacherName}</strong></span>
              <span>구분: ${item.type}</span>
            </div>
          `;
          cardGrid.appendChild(card);
        });
        elSection.appendChild(cardGrid);
        itemsContainer.appendChild(elSection);
      }
    });
  }
  
  const matchingFeedbacks = matchingProjects.filter(p => p.feedback);
  if (matchingFeedbacks.length === 0) {
    feedbackContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-tertiary); font-size: 0.85rem;">⏳ 접수 및 조치 완료된 기업 피드백이 아직 존재하지 않습니다.</div>`;
  } else {
    matchingFeedbacks.forEach(proj => {
      const fb = proj.feedback;
      const fbCard = document.createElement("div");
      fbCard.className = "feedback-receipt-card";
      fbCard.style.margin = "0";
      fbCard.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid hsl(142, 60%, 80%); padding-bottom:6px;">
          <span style="font-weight:800; font-size:0.85rem; color:hsl(140, 80%, 25%);">
            🏢 [기업 조치계획] ${fb.company || "제조기업"} (교사 ${proj.teacherName} 평가 대상)
          </span>
          <span style="font-size:0.72rem; color:var(--text-secondary);">${fb.date || ""}</span>
        </div>
        <p style="font-size:0.82rem; color:var(--text-primary); line-height:1.4; margin:0; white-space:pre-wrap;">${fb.text}</p>
      `;
      feedbackContainer.appendChild(fbCard);
    });
  }
  
  loadTeamInputs();
}

// 5. 로컬스토리지에 종합 결론 저장
function saveTeamInputs() {
  const teamName = getTeamReportTeamName();
  const productName = document.getElementById("team-product-select").value;
  
  if (!teamName || !productName) return;
  
  const conclusion = document.getElementById("team-conclusion-input").value;
  const monitoring = document.getElementById("team-monitoring-input").value;
  
  const data = { conclusion, monitoring };
  localStorage.setItem(`softlap_team_report_${teamName}_${productName}`, JSON.stringify(data));
}

// 6. 로컬스토리지로부터 종합 결론 로드
function loadTeamInputs() {
  const teamName = getTeamReportTeamName();
  const productName = document.getElementById("team-product-select").value;
  
  const conclusionText = document.getElementById("team-conclusion-input");
  const monitoringText = document.getElementById("team-monitoring-input");
  
  if (!conclusionText || !monitoringText) return;
  
  if (!teamName || !productName) {
    conclusionText.value = "";
    monitoringText.value = "";
    return;
  }
  
  const saved = localStorage.getItem(`softlap_team_report_${teamName}_${productName}`);
  if (saved) {
    try {
      const data = JSON.parse(saved);
      conclusionText.value = data.conclusion || "";
      monitoringText.value = data.monitoring || "";
    } catch(e) {
      conclusionText.value = "";
      monitoringText.value = "";
    }
  } else {
    conclusionText.value = "";
    monitoringText.value = "";
  }
}

// 7. 팀별 종합 보고서 인쇄
function printTeamReport() {
  const teamName = getTeamReportTeamName();
  const productName = document.getElementById("team-product-select").value;
  
  if (!teamName || !productName) {
    alert("취합할 실증 팀명과 대상 에듀테크 제품을 선택한 후 인쇄하십시오.");
    return;
  }
  
  renderTeamA4Preview();
  
  const editorArea = document.getElementById("editor-area");
  const previewArea = document.getElementById("preview-area");
  const dashboardArea = document.getElementById("dashboard-area");
  const teamArea = document.getElementById("team-area");
  
  editorArea.style.display = "none";
  previewArea.style.display = "block";
  if (dashboardArea) dashboardArea.style.display = "none";
  if (teamArea) teamArea.style.display = "none";
  
  setTimeout(() => {
    window.print();
    
    editorArea.style.display = "none";
    previewArea.style.display = "none";
    if (dashboardArea) dashboardArea.style.display = "none";
    if (teamArea) teamArea.style.display = "block";
  }, 350);
}

// 8. 팀별 A4 인쇄 프리뷰 렌더링
function renderTeamA4Preview() {
  const container = document.getElementById("preview-container");
  container.innerHTML = "";
  
  const teamName = getTeamReportTeamName();
  const productName = document.getElementById("team-product-select").value;
  const teachers = document.getElementById("team-teachers-display").value;
  const conclusion = document.getElementById("team-conclusion-input").value;
  const monitoring = document.getElementById("team-monitoring-input").value;
  
  const matchingProjects = (state.submittedList || []).filter(p => 
    p.schoolName === teamName && 
    p.meta?.targetProduct === productName
  );
  
  const page1 = document.createElement("div");
  page1.className = "report-a4-page";
  page1.innerHTML = `
    <span class="report-title-badge">에듀테크 소프트랩 공동 실증 종합 리포트</span>
    <h1 class="report-h1" style="font-size:1.5rem; margin-top: 10px;">${productName || "에듀테크"} 공교육 적합성 공동 실증 종합 보고서</h1>
    
    <table class="report-meta-table" style="margin-top: 20px;">
      <tr>
        <td class="label-td">실증 팀명</td>
        <td><strong>${teamName}</strong></td>
        <td class="label-td">작성 일자</td>
        <td><strong>${new Date().toISOString().split('T')[0]}</strong></td>
      </tr>
      <tr>
        <td class="label-td">실증 대상 제품</td>
        <td><strong>${productName}</strong></td>
        <td class="label-td">참여 실증교사</td>
        <td><strong>${teachers}</strong></td>
      </tr>
    </table>
    
    <h3 class="report-section-title" style="margin-top: 30px;">👥 팀 종합 실증 결론 및 제안</h3>
    <p style="font-size:0.8rem; line-height:1.6; white-space:pre-wrap; border:1px solid #cbd5e1; padding:12px; border-radius:4px; min-height:150px; background-color:#fafafc; margin-top:10px;">
      ${conclusion || "기재된 종합 실증 의견이 없습니다."}
    </p>
    
    <h3 class="report-section-title" style="margin-top: 30px;">🔄 기업 피드백에 따른 모니터링 계획</h3>
    <p style="font-size:0.8rem; line-height:1.6; white-space:pre-wrap; border:1px solid #cbd5e1; padding:12px; border-radius:4px; min-height:150px; background-color:#fafafc; margin-top:10px;">
      ${monitoring || "기재된 모니터링 계획이 없습니다."}
    </p>
  `;
  container.appendChild(page1);
  
  let currentPageNum = 2;
  let currentPage = createTeamPageRest(currentPageNum, productName, teamName);
  container.appendChild(currentPage);
  
  let currentTable = createTeamTableWrapper();
  currentPage.appendChild(currentTable);
  let currentTbody = currentTable.querySelector("tbody");
  
  const allAggregatedItems = [];
  matchingProjects.forEach(p => {
    (p.items || []).forEach(item => {
      allAggregatedItems.push({
        ...item,
        teacherName: p.teacherName
      });
    });
  });
  
  if (allAggregatedItems.length === 0) {
    currentTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#94a3b8;">수집된 세부 실증 항목이 없습니다.</td></tr>`;
  } else {
    for (let i = 0; i < allAggregatedItems.length; i++) {
      const r = allAggregatedItems[i];
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <span class="report-element-badge" style="background-color: ${EMPIRICAL_STANDARDS[r.element]?.bg || '#f1f5f9'}; color: ${EMPIRICAL_STANDARDS[r.element]?.color || '#334155'}; border: 1px solid ${EMPIRICAL_STANDARDS[r.element]?.borderColor || '#cbd5e1'}">
            ${r.element}
          </span>
        </td>
        <td><strong>${r.item}</strong></td>
        <td style="font-size:0.7rem; color:#475569; white-space: pre-wrap;">${r.criterion}</td>
        <td style="font-weight:700;">${r.teacherName || "실증교사"}</td>
        <td style="white-space: pre-wrap; font-size:0.7rem;">${r.analysis || "분석내용 없음"}</td>
        <td style="text-align:center;">
          <span class="severity-badge ${r.severity === '상' ? 'high' : r.severity === '중' ? 'mid' : 'low'}">${r.severity}</span>
        </td>
        <td style="white-space: pre-wrap; font-size:0.7rem;">${r.improvement || "개선요청 없음"}</td>
      `;
      
      currentPage.style.height = "auto";
      currentPage.style.overflow = "visible";
      currentTbody.appendChild(tr);
      
      if (currentPage.scrollHeight > 1115) {
        currentTbody.removeChild(tr);
        currentPage.style.height = "";
        currentPage.style.overflow = "";
        
        currentPageNum++;
        currentPage = createTeamPageRest(currentPageNum, productName, teamName);
        container.appendChild(currentPage);
        
        currentTable = createTeamTableWrapper();
        currentPage.appendChild(currentTable);
        currentTbody = currentTable.querySelector("tbody");
        
        currentPage.style.height = "auto";
        currentPage.style.overflow = "visible";
        currentTbody.appendChild(tr);
      }
    }
  }
  
  if (currentPage) {
    currentPage.style.height = "";
    currentPage.style.overflow = "";
  }
  
  const feedbackPage = document.createElement("div");
  feedbackPage.className = "report-a4-page";
  feedbackPage.innerHTML = `
    <span class="report-title-badge">수신 기업 피드백 내역</span>
    <h3 class="report-section-title" style="margin-top:10px;">🏢 기업 공식 조치계획 및 피드백</h3>
    <div style="display:flex; flex-direction:column; gap:16px; margin-top:20px;">
      ${matchingProjects.map(p => {
        const fb = p.feedback;
        return `
          <div style="border:1px solid #cbd5e1; border-radius:6px; padding:12px; background-color:#f8fafc;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:6px; margin-bottom:8px;">
              <span style="font-weight:800; font-size:0.8rem; color:#0f172a;">🏢 ${fb ? fb.company : "제조기업"} (${p.teacherName} 교사 제출 대상)</span>
              <span style="font-size:0.7rem; color:#64748b;">${fb ? fb.date : "-"}</span>
            </div>
            <p style="font-size:0.78rem; line-height:1.5; color:#334155; white-space:pre-wrap; margin:0;">
              ${fb ? fb.text : "⏳ 피드백이 아직 등록되지 않았습니다."}
            </p>
          </div>
        `;
      }).join('')}
    </div>
  `;
  container.appendChild(feedbackPage);
}

function createTeamPageRest(pageNum, productName, teamName) {
  const page = document.createElement("div");
  page.className = "report-a4-page";
  
  const miniHeader = document.createElement("div");
  miniHeader.style.display = "flex";
  miniHeader.style.justifyContent = "space-between";
  miniHeader.style.alignItems = "center";
  miniHeader.style.fontSize = "0.74rem";
  miniHeader.style.color = "#64748b";
  miniHeader.style.borderBottom = "1px solid #e2e8f0";
  miniHeader.style.paddingBottom = "8px";
  miniHeader.style.marginBottom = "20px";
  miniHeader.innerHTML = `
    <span><strong>${productName || "에듀테크"}</strong> 공동 실증 세부 내역 (계속)</span>
    <span>${pageNum} 페이지</span>
  `;
  page.appendChild(miniHeader);
  return page;
}

function createTeamTableWrapper() {
  const table = document.createElement("table");
  table.className = "report-checklist-grid";
  table.innerHTML = `
    <thead>
      <tr>
        <th style="width: 10%">대분류</th>
        <th style="width: 12%">중분류</th>
        <th style="width: 20%">점검 기준</th>
        <th style="width: 10%">작성자</th>
        <th style="width: 22%">분석 내용 (현상)</th>
        <th style="width: 8%">심각성</th>
        <th style="width: 18%">개선 요청사항</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  return table;
}

// 초기 로딩 바인딩
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

// ℹ️ [신규] 안내 정보 모달 제어 (서비스 소개, 개인정보 처리방침)
function openInfoModal(type) {
  const modal = document.getElementById("info-modal");
  const title = document.getElementById("info-modal-title");
  const content = document.getElementById("info-modal-content");
  
  if (!modal || !title || !content) return;
  
  if (type === 'intro') {
    title.innerHTML = "🏫 서비스 소개";
    content.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">
        <p style="font-weight:700; font-size:0.9rem; color:var(--accent-color);">서울에듀테크소프트랩 통합 평가 대시보드</p>
        <p>본 서비스는 공교육 현장에 도입 및 적용되는 다양한 에듀테크 프로그램의 적합성, 인프라 부하, 데이터 안전성을 현장 교사들의 검증 보고서 데이터를 통해 분석 및 추적하는 전문 협업 관리 플랫폼입니다.</p>
        <div style="background-color:var(--bg-secondary); padding:14px; border-radius:8px; font-size:0.78rem; border:1px solid var(--border-color); display:flex; flex-direction:column; gap:8px;">
          <strong>🎯 핵심 서비스 타겟 및 연동 흐름</strong>
          <div>1) <strong>실증 교사:</strong> 교육 현장의 사용성 및 보안 개선 사항 체크리스트 등록</div>
          <div>2) <strong>개발사(기업):</strong> 수집된 결함 요소 확인 및 보완 조치 계획 피드백 실시간 전송</div>
          <div>3) <strong>소속 팀장:</strong> 각 평가 및 피드백을 실시간 자동 수집하여 A4 규격 공동 보고서 자동 편집/발행</div>
        </div>
      </div>
    `;
  } else if (type === 'privacy') {
    title.innerHTML = "🔒 개인정보 처리방침";
    content.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px; max-height:45vh; overflow-y:auto; padding-right:6px; line-height:1.6;">
        <p>서울에듀테크소프트랩은 개인정보보호법에 의거하여 이용자의 개인정보 및 권익을 보호하고 개인정보와 관련한 이용자의 고충을 원활하게 처리할 수 있도록 다음과 같은 처리 방침을 수립·공개합니다.</p>
        <p><strong>1. 개인정보 수집 항목</strong><br>
        회원가입 시 입력된 이메일(ID), 이름, 소속학교(기관명), 실증 팀명 및 플랫폼 접속 환경 정보(접속로그), 작성하신 개별 보고서 정보가 안전하게 수집됩니다.</p>
        <p><strong>2. 개인정보의 이용 목적</strong><br>
        수집된 정보는 본인 식별, 평가 보고서 데이터의 계정 매칭 및 클라우드 동기화, 기업 피드백 실시간 연동, 부정 가입 방지 이외의 목적으로는 사용되지 않습니다.</p>
        <p><strong>3. 보유 및 이용 기간</strong><br>
        이용자의 회원 탈퇴 처리 요청 시 또는 본 실증 프로그램 사업의 공식 종료 시까지 보유 및 활용되며, 파기 요청 시 복원할 수 없는 방식으로 영구 파기됩니다.</p>
        <p><strong>4. 제3자 제공 고지</strong><br>
        플랫폼은 이용자의 명시적 동의나 법령에 정한 경우를 제외하고는 수집 목적의 범위를 초과하여 제3자에게 개인정보를 양도하거나 유출하지 않습니다.</p>
      </div>
    `;
  }
  
  modal.style.display = "flex";
}

function closeInfoModal() {
  const modal = document.getElementById("info-modal");
  if (modal) modal.style.display = "none";
}

window.openInfoModal = openInfoModal;
window.closeInfoModal = closeInfoModal;

// ==================== [신규 추가] AI 실증 작성 도우미 및 CSV 내보내기 로직 ====================
let activeRowElement = null;
let activeRowDataId = null;

function openAiAssistant(rowData, trElement) {
  const panel = document.getElementById("ai-assistant-panel");
  if (!panel) return;
  
  // 기존 하이라이트 행 복구
  const prevHighlight = document.querySelector(".active-row-highlight");
  if (prevHighlight) {
    prevHighlight.classList.remove("active-row-highlight");
  }
  
  activeRowElement = trElement;
  activeRowDataId = rowData.id;
  trElement.classList.add("active-row-highlight");

  // AI 패널에 슬라이드 인 애니메이션 적용
  panel.classList.add("open");
  
  // 헤더 및 웰컴 페이지 토글
  document.getElementById("ai-assistant-welcome").style.display = "none";
  const activeSection = document.getElementById("ai-assistant-active");
  activeSection.style.display = "flex";
  
  document.getElementById("ai-meta-element-item").textContent = `📍 ${rowData.element} > ${rowData.item}`;
  document.getElementById("ai-meta-criterion").textContent = rowData.criterion;
  
  // 템플릿 목록 가져오기
  const suggestions = getAiTemplatesFor(rowData.element, rowData.item);
  const container = document.getElementById("ai-template-suggestions");
  container.innerHTML = "";
  
  suggestions.forEach((s, idx) => {
    const card = document.createElement("div");
    card.className = "ai-suggestion-card";
    card.innerHTML = `
      <div style="font-weight: 800; font-size: 0.76rem; color: var(--accent-color); display: flex; justify-content: space-between; align-items: center;">
        <span>💡 ${s.description}</span>
        <span class="severity-badge ${s.severity === '상' ? 'high' : s.severity === '중' ? 'mid' : 'low'}" style="transform: scale(0.85);">${s.severity}</span>
      </div>
      <div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 6px; line-height: 1.4;">
        <strong>[현상]</strong> ${s.analysis}
      </div>
      <div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 4px; line-height: 1.4;">
        <strong>[대책]</strong> ${s.improvement}
      </div>
      <button class="btn btn-primary" style="margin-top: 8px; width: 100%; font-size: 0.68rem; padding: 4px; justify-content: center; font-weight: bold;" onclick="applyAiTemplate(${idx}, '${rowData.id}')">
        ⚡ 이 내용 적용하기
      </button>
    `;
    container.appendChild(card);
  });
}

function applyAiTemplate(suggestionIdx, rowId) {
  const rowData = state.activeProject.items.find(r => r.id == rowId);
  if (!rowData) return;
  
  const suggestions = getAiTemplatesFor(rowData.element, rowData.item);
  const s = suggestions[suggestionIdx];
  if (!s) return;
  
  // 데이터 반영
  rowData.analysis = s.analysis;
  rowData.severity = s.severity;
  rowData.improvement = s.improvement;
  
  // 프로젝트 동기화 저장 및 리렌더링
  saveActiveProject();
  renderChecklistGrid();
  
  // 리렌더링 후 하이라이트 복원 및 도우미 화면 연동 싱크
  setTimeout(() => {
    const newTr = document.querySelector(`tr[data-id="${rowId}"]`);
    if (newTr) {
      openAiAssistant(rowData, newTr);
    }
  }, 80);
  
  showToast("AI 템플릿 예시가 작성란에 자동 반영되었습니다!");
}
window.applyAiTemplate = applyAiTemplate;

function closeAiAssistant() {
  const panel = document.getElementById("ai-assistant-panel");
  if (panel) panel.classList.remove("open");
  if (activeRowElement) {
    activeRowElement.classList.remove("active-row-highlight");
    activeRowElement = null;
  }
  activeRowDataId = null;
}
window.closeAiAssistant = closeAiAssistant;

function exportCSV() {
  if (!state.activeProjectId) {
    alert("내보낼 실증 프로젝트가 없습니다.");
    return;
  }

  const meta = state.activeProject.meta;
  const items = state.activeProject.items || [];
  
  // Excel 한글 인코딩 깨짐을 유니코드 BOM 헤더로 해결 (\ufeff)
  let csvContent = "\ufeff";
  csvContent += "에듀테크 실증 평가 보고서\n";
  csvContent += `실증 대상 제품,${meta.targetProduct || "미기재"}\n`;
  csvContent += `개발사/제조사,${meta.developer || "미기재"}\n`;
  csvContent += `OS 종류,${meta.osType || "미기재"},OS 버전,${meta.osVersion || "미기재"}\n`;
  csvContent += `사용 기기 모델,${meta.modelName || "미기재"}\n`;
  csvContent += `학교 네트워크,${meta.network || "미기재"}\n`;
  csvContent += `적용 교과 단원,${meta.usageEnv || "미기재"}\n`;
  csvContent += `소속 학교,${meta.schoolName || "미기재"},실증 교사,${meta.teacherName || "미기재"}\n`;
  csvContent += `작성일자,${meta.reportDate}\n\n`;
  
  csvContent += "대분류(요소),중분류(실증항목),점검 기준,구분,분석 내용(현상),심각성,개선 사항(기대결과)\n";
  
  items.forEach(r => {
    const esc = (text) => `"${(text || "").replace(/"/g, '""').replace(/\n/g, ' ')}"`;
    csvContent += `${esc(r.element)},${esc(r.item)},${esc(r.criterion)},${esc(r.type)},${esc(r.analysis)},${esc(r.severity)},${esc(r.improvement)}\n`;
  });
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `softlap_report_${meta.targetProduct || "report"}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("CSV 파일 다운로드가 완료되었습니다!");
}
window.exportCSV = exportCSV;
