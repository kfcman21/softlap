/**
 * 개별 교사용 에듀테크 실증 평가 보고서 프로그램 - 회원 로그인 및 다중 보관함 격리 코어 로직
 */

const USERS_DB_KEY = "softlap_users_database";
const SESSION_KEY = "softlap_active_session";
const THEME_KEY = "softlap_theme";

// 글로벌 애플리케이션 상태
let state = {
  currentUser: null,       // 현재 로그인된 사용자 객체 { email, name, school }
  currentTab: "edit",      // 'edit' 또는 'preview'
  filterElement: "전체",    // 대분류 필터 값
  activeProjectId: null,   // 현재 편집 중인 보관함 내 프로젝트 ID
  projects: [],            // 현재 사용자의 프로젝트 리스트
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
  authMode: "login"        // 'login' 또는 'signup'
};

// 앱 최초 로드 시 실행되는 초기화 라이프사이클
function initApp() {
  setupEventListeners();
  applyTheme();
  renderPresetGuideTree();
  renderFilterOptions();
  checkAuthSession();
}

// 1. 인증 및 세션 검증 (일반 교사 및 관리자 분기 처리)
function checkAuthSession() {
  const session = localStorage.getItem(SESSION_KEY);
  if (session) {
    try {
      state.currentUser = JSON.parse(session);
      if (state.currentUser.isAdmin) {
        showAdminDashboard();
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
  document.getElementById("profile-name").textContent = `${state.currentUser.name} 교사`;
  document.getElementById("profile-school").textContent = state.currentUser.school;
  document.getElementById("profile-avatar").textContent = state.currentUser.name ? state.currentUser.name[0] : "👨‍🏫";

  // 만약 일반 교사인데 기존 관리자 복구 단추가 남아있다면 제거
  const returnBtn = document.getElementById("btn-admin-return");
  if (returnBtn) returnBtn.remove();

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
}

// 1-A. 관리자 대시보드 출력 및 사용자 관리 코어 엔진
function showAdminDashboard() {
  document.getElementById("auth-container").style.display = "none";
  document.getElementById("app-container").style.display = "none";
  document.getElementById("admin-container").style.display = "flex";
  
  renderAdminUsersList();
}

function renderAdminUsersList() {
  const tbody = document.getElementById("admin-users-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  const searchVal = document.getElementById("admin-search-input").value.trim().toLowerCase();
  const usersDB = JSON.parse(localStorage.getItem(USERS_DB_KEY) || "{}");
  
  const userEmails = Object.keys(usersDB);
  
  // 관리자 통계 카드 수치 업데이트
  document.getElementById("admin-stat-users").textContent = `${userEmails.length}명`;
  
  let totalProjectsCount = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("softlap_projects_")) {
      try {
        const projs = JSON.parse(localStorage.getItem(key) || "[]");
        totalProjectsCount += projs.length;
      } catch (e) {}
    }
  }
  document.getElementById("admin-stat-projects").textContent = `${totalProjectsCount}개`;

  // 검색어 필터링
  const filteredEmails = userEmails.filter(email => {
    const user = usersDB[email];
    return email.toLowerCase().includes(searchVal) || 
           (user.name && user.name.toLowerCase().includes(searchVal)) ||
           (user.school && user.school.toLowerCase().includes(searchVal));
  });

  if (filteredEmails.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:35px; color:var(--text-tertiary); font-weight:500;">
          검색 및 등록된 교사 회원 계정이 없습니다.
        </td>
      </tr>
    `;
    return;
  }

  filteredEmails.forEach(email => {
    const user = usersDB[email];
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><strong style="color:var(--accent-color); font-size:0.85rem;">${email}</strong></td>
      <td><strong>${user.name || "-"}</strong></td>
      <td>${user.school || "서울에듀테크소프트랩"}</td>
      <td><code style="background-color:var(--bg-tertiary); padding:3px 8px; border-radius:4px; font-weight:700; color:var(--danger-color); font-size:0.8rem;">${user.password}</code></td>
      <td>
        <button class="btn" style="padding:4px 8px; font-size:0.72rem; border-color:var(--accent-color); color:var(--accent-color); margin-right:4px; font-weight:700;" onclick="adminChangePassword('${email}')">🔑 비번변경</button>
        <button class="btn" style="padding:4px 8px; font-size:0.72rem; border-color:var(--danger-color); color:var(--danger-color); font-weight:700;" onclick="adminDeleteUser('${email}')">🗑️ 계정삭제</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function adminChangePassword(email) {
  const newPw = prompt(`[관리자 비밀번호 강제 변경]\n\n교사 계정 (${email})의 변경할 신규 비밀번호를 설정하십시오:`);
  if (newPw === null) return;
  const pwTrimmed = newPw.trim();
  if (pwTrimmed.length < 4) {
    alert("안전을 위해 비밀번호는 최소 4자리 이상으로 설정해 주십시오.");
    return;
  }
  
  const usersDB = JSON.parse(localStorage.getItem(USERS_DB_KEY) || "{}");
  if (usersDB[email]) {
    usersDB[email].password = pwTrimmed;
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(usersDB));
    renderAdminUsersList();
    showToast(`교사 (${email})의 비밀번호가 성공적으로 강제 재설정되었습니다.`);
  }
}
window.adminChangePassword = adminChangePassword;

function adminDeleteUser(email) {
  if (confirm(`⚠️ [경고 - 계정 영구 강제 삭제]\n\n정말 교사 계정 (${email})을 강제 탈퇴시키고,\n해당 교사 소유의 보관함 및 모든 실증 데이터를 영구히 데이터베이스에서 삭제하시겠습니까?`)) {
    const usersDB = JSON.parse(localStorage.getItem(USERS_DB_KEY) || "{}");
    delete usersDB[email];
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(usersDB));
    
    // 해당 사용자의 프로젝트 보관함도 로컬스토리지에서 동시 제거
    const userStorageKey = `softlap_projects_${email.replace(/[@.]/g, '_')}`;
    localStorage.removeItem(userStorageKey);
    
    renderAdminUsersList();
    showToast(`교사 (${email}) 계정 및 관련 실증 보관함 데이터가 완벽히 파쇄되었습니다.`);
  }
}
window.adminDeleteUser = adminDeleteUser;


// 2. 다중 사용자 프로젝트 데이터베이스 조작 (교사별 격리)
function getUserStorageKey() {
  if (!state.currentUser) return "guest_projects";
  // 이메일 주소를 기반으로 고유 격리 보관함 키 생성
  return `softlap_projects_${state.currentUser.email.replace(/[@.]/g, '_')}`;
}

// 프로젝트 보관함 로딩
function loadUserProjects() {
  const key = getUserStorageKey();
  const saved = localStorage.getItem(key);
  
  if (saved) {
    try {
      state.projects = JSON.parse(saved);
    } catch (e) {
      console.error("보관함 분석 에러", e);
      state.projects = [];
    }
  } else {
    // 신규 교사의 경우 기본 웰컴 샘플 프로젝트를 자동으로 복제 매핑 탑재
    const welcomeProj = JSON.parse(JSON.stringify(WELCOME_SAMPLE_PROJECT));
    welcomeProj.id = "welcome_" + Date.now();
    // 가입한 교사의 프로필 명칭으로 디폴트 보완 기재
    welcomeProj.meta.teacherName = state.currentUser.name;
    welcomeProj.meta.schoolName = state.currentUser.school;
    
    state.projects = [welcomeProj];
    localStorage.setItem(key, JSON.stringify(state.projects));
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

// 프로젝트 저장
function saveActiveProject() {
  if (!state.activeProjectId) return;

  const key = getUserStorageKey();
  const index = state.projects.findIndex(p => p.id === state.activeProjectId);
  
  if (index !== -1) {
    state.projects[index].meta = state.activeProject.meta;
    state.projects[index].items = state.activeProject.items;
  }
  
  localStorage.setItem(key, JSON.stringify(state.projects));
  
  // 사이드바 목록 리프레시 (제품명 연동 반영용)
  renderCabinetList();
  updateSummaryStats();
  
  // 하단 꼬리말 업데이트
  document.getElementById("footer-active-product").textContent = state.activeProject.meta.targetProduct || "제품명 미기재";
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

  renderChecklistGrid();
  updateSummaryStats();
  
  document.getElementById("footer-active-product").textContent = meta.targetProduct || "제품명 미기재";
}

// 새 실증 보고서 추가 (예시 텍스트는 인풋 박스의 회색 플레이스홀더를 통해 보이고, 실제 데이터는 비어 있는 클린 캔버스 상태로 개설)
function createNewProject(shouldToast = true) {
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
      teacherName: state.currentUser.name || "",
      schoolName: state.currentUser.school || "",
      reportDate: new Date().toISOString().split('T')[0]
    },
    items: []
  };

  state.projects.push(newProj);
  state.activeProjectId = newProj.id;
  
  const key = getUserStorageKey();
  localStorage.setItem(key, JSON.stringify(state.projects));
  
  renderCabinetList();
  loadActiveProject();

  if (shouldToast) {
    showToast("새로운 실증 보고서가 보관함에 개설되었습니다.");
  }
}

// 프로젝트 복제
function duplicateProject(projId, e) {
  if (e) e.stopPropagation(); // 카드 선택 이벤트 전파 차단
  
  const target = state.projects.find(p => p.id === projId);
  if (!target) return;

  const clone = JSON.parse(JSON.stringify(target));
  clone.id = "proj_" + Date.now();
  clone.meta.targetProduct = `${clone.meta.targetProduct} (복사본)`;

  state.projects.push(clone);
  state.activeProjectId = clone.id;
  
  const key = getUserStorageKey();
  localStorage.setItem(key, JSON.stringify(state.projects));

  renderCabinetList();
  loadActiveProject();
  showToast("선택하신 실증 파일이 안전하게 복제되었습니다.");
}

// 프로젝트 삭제
function deleteProject(projId, e) {
  if (e) e.stopPropagation();

  if (confirm("경고: 해당 에듀테크 제품에 작성하셨던 모든 분석 내용이 보관함에서 영구히 삭제됩니다. 삭제하시겠습니까?")) {
    state.projects = state.projects.filter(p => p.id !== projId);
    
    const key = getUserStorageKey();
    localStorage.setItem(key, JSON.stringify(state.projects));

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

  state.projects.forEach(p => {
    const item = document.createElement("div");
    item.className = `project-cabinet-item ${state.activeProjectId === p.id ? 'active' : ''}`;
    
    const titleSpan = document.createElement("span");
    titleSpan.style.whiteSpace = "nowrap";
    titleSpan.style.overflow = "hidden";
    titleSpan.style.textOverflow = "ellipsis";
    titleSpan.style.maxWidth = "160px";
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
    });

    container.appendChild(item);
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
  const codeGroup = document.getElementById("group-code");
  const newPasswordGroup = document.getElementById("group-new-password");
  const forgotLinkGroup = document.getElementById("group-forgot-link");
  const submitBtn = document.getElementById("btn-auth-submit");
  const switchBox = document.getElementById("auth-switch-box");

  // 기본 초기화
  emailGroup.style.display = "none";
  passwordGroup.style.display = "none";
  codeGroup.style.display = "none";
  newPasswordGroup.style.display = "none";
  forgotLinkGroup.style.display = "none";

  if (state.authMode === "login") {
    titleEl.textContent = "교사 회원 로그인";
    descEl.textContent = "서울에듀테크소프트랩 개별 실증지";
    emailGroup.style.display = "flex";
    passwordGroup.style.display = "flex";
    forgotLinkGroup.style.display = "flex";
    submitBtn.textContent = "로그인";
    switchBox.innerHTML = `아직 계정이 없으신가요? <span class="auth-switch-link" id="link-switch-auth">회원 가입</span>`;
  } 
  else if (state.authMode === "signup") {
    titleEl.textContent = "교사 회원 가입";
    descEl.textContent = "이메일과 비밀번호만 기입하는 초간편 최소정보 가입";
    emailGroup.style.display = "flex";
    passwordGroup.style.display = "flex";
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
}

function handleAuthSubmit() {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value.trim();
  const code = document.getElementById("auth-code").value.trim();
  const newPassword = document.getElementById("group-new-password").querySelector("input").value.trim();

  const usersDB = JSON.parse(localStorage.getItem(USERS_DB_KEY) || "{}");

  // 1. 로그인 단계
  if (state.authMode === "login") {
    if (!email || !password) {
      alert("이메일 주소와 비밀번호를 모두 입력해 주십시오.");
      return;
    }
    
    // [관리자 권한 진입 백도어]
    if (email === "admin" && password === "admin123") {
      const session = { 
        email: "admin", 
        name: "관리자", 
        school: "서울에듀테크소프트랩 본부", 
        isAdmin: true 
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      state.currentUser = session;
      showAdminDashboard();
      showToast("관리자 권한으로 시스템 제어 센터에 접근했습니다.");
      return;
    }

    const user = usersDB[email];
    if (user && user.password === password) {
      const session = { 
        email, 
        name: user.name || email.split("@")[0], 
        school: user.school || "서울에듀테크소프트랩" 
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      state.currentUser = session;
      showMainDashboard();
      showToast("반갑습니다! 에듀테크 실증 보관함에 연결되었습니다.");
    } else {
      alert("이메일 주소 또는 비밀번호가 일치하지 않습니다.");
    }
  }
  // 2. 최소 정보 회원 가입 단계
  else if (state.authMode === "signup") {
    if (!email || !password) {
      alert("가입할 이메일 주소와 비밀번호를 모두 입력해 주십시오.");
      return;
    }
    if (email.toLowerCase() === "admin") {
      alert("admin 계정명은 시스템 최고 관리자 권한용으로 등록/가입이 불가능합니다.");
      return;
    }
    if (password.length < 4) {
      alert("안전을 위해 비밀번호는 최소 4자리 이상으로 설정해 주십시오.");
      return;
    }
    if (usersDB[email]) {
      alert("이미 해당 이메일로 등록된 교사 계정이 존재합니다.");
      return;
    }

    // 이메일 주소만으로 가입 완료 (이름은 이메일 앞부분 추출, 소속은 기본값 처리)
    const displayName = email.split("@")[0];
    usersDB[email] = { 
      password, 
      name: displayName, 
      school: "서울에듀테크소프트랩" 
    };
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(usersDB));

    const session = { 
      email, 
      name: displayName, 
      school: "서울에듀테크소프트랩" 
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    state.currentUser = session;
    
    showMainDashboard();
    showToast("서울에듀테크소프트랩 교사 계정이 가입되어 웰컴 프로젝트가 배포되었습니다!");
  }
  // 3. 비밀번호 찾기 - 이메일 입력 단계
  else if (state.authMode === "forgot_email") {
    if (!email) {
      alert("비밀번호를 재설정할 본인의 이메일 주소를 기입해 주십시오.");
      return;
    }
    if (!usersDB[email]) {
      alert("죄송합니다. 등록된 교사 회원 중 해당 이메일 정보를 찾을 수 없습니다.");
      return;
    }

    // 임의의 6자리 인증 번호 오프라인 난수 생성
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

    // 새 비밀번호 데이터 저장
    usersDB[verificationState.email].password = newPassword;
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(usersDB));

    alert("비밀번호 초기화 및 변경이 안전하게 완료되었습니다!\n새 비밀번호로 즉시 로그인이 가능합니다.");

    state.authMode = "login";
    updateAuthUI();
    
    // 입력 칸 청소
    document.getElementById("auth-password").value = "";
    document.getElementById("group-new-password").querySelector("input").value = "";
  }
}

function switchAuthMode() {
  state.authMode = state.authMode === "login" ? "signup" : "login";
  updateAuthUI();
}

// 4. 이벤트 핸들러 및 데이터 제어
function setupEventListeners() {
  // 인증 액션
  document.getElementById("btn-auth-submit").addEventListener("click", handleAuthSubmit);
  document.getElementById("link-switch-auth").addEventListener("click", switchAuthMode);
  document.getElementById("link-forgot-password").addEventListener("click", () => {
    state.authMode = "forgot_email";
    updateAuthUI();
  });
  document.getElementById("btn-logout").addEventListener("click", () => {
    if (confirm("로그아웃하여 보관함을 닫으시겠습니까?")) {
      showAuthScreen();
    }
  });

  // 관리자 대시보드 액션 바인딩
  document.getElementById("btn-admin-logout").addEventListener("click", () => {
    showAuthScreen();
  });
  
  document.getElementById("btn-admin-to-teacher").addEventListener("click", () => {
    // 관리자 모드에서 일반 실증용 화면으로 분기 진입
    document.getElementById("admin-container").style.display = "none";
    document.getElementById("app-container").style.display = "flex";
    
    document.getElementById("profile-name").textContent = "관리자 (교사모드)";
    document.getElementById("profile-school").textContent = "에듀테크소프트랩 본부";
    
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
  
  document.getElementById("admin-search-input").addEventListener("input", () => {
    renderAdminUsersList();
  });

  // 보관함 플러스 클릭
  document.getElementById("btn-new-project").addEventListener("click", () => createNewProject(true));

  // 상단 탭 스위칭
  document.getElementById("btn-tab-edit").addEventListener("click", () => switchTab("edit"));
  document.getElementById("btn-tab-preview").addEventListener("click", () => switchTab("preview"));

  // 백업
  document.getElementById("btn-copy-markdown").addEventListener("click", copyMarkdown);
  document.getElementById("btn-print").addEventListener("click", () => window.print());
  document.getElementById("btn-theme-switch").addEventListener("click", toggleTheme);

  // 사이드바 액션
  document.getElementById("btn-load-sample").addEventListener("click", loadSampleData);
  document.getElementById("btn-clear-all").addEventListener("click", clearAllData);
  document.getElementById("btn-export-json").addEventListener("click", exportJSON);
  document.getElementById("btn-import-json").addEventListener("click", () => document.getElementById("import-file-input").click());
  document.getElementById("import-file-input").addEventListener("change", importJSON);

  // 필터 및 단추
  document.getElementById("editor-filter-select").addEventListener("change", (e) => {
    state.filterElement = e.target.value;
    renderChecklistGrid();
  });
  document.getElementById("btn-add-row").addEventListener("click", () => {
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
      });
    }
  });
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

  const rows = state.activeProject.items || [];
  const filtered = state.filterElement === "전체"
    ? rows
    : rows.filter(r => r.element === state.filterElement);

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center; padding:40px; color:var(--text-tertiary);">
          추가된 평가 기준 문항이 없습니다.<br>
          왼쪽의 <strong>[클릭 시 보관함에 추가]</strong> 가이드를 통해 분석할 세부 항목들을 터치해 추가하세요.
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(rowData => {
    const tr = document.createElement("tr");
    tr.dataset.id = rowData.id;

    // 0. 인쇄용 선택 체크박스 (rowData.selected === undefined 이면 true가 디폴트)
    const tdSelect = document.createElement("td");
    tdSelect.style.textAlign = "center";
    tdSelect.style.verticalAlign = "middle";
    
    const selectCheck = document.createElement("input");
    selectCheck.type = "checkbox";
    selectCheck.checked = rowData.selected !== false;
    selectCheck.style.width = "17px";
    selectCheck.style.height = "17px";
    selectCheck.style.cursor = "pointer";
    selectCheck.title = "A4 보고서 인쇄물에 포함할지 여부 결정";
    
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
    const elSelect = document.createElement("select");
    elSelect.className = "table-select";
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
    const itemSelect = document.createElement("select");
    itemSelect.className = "table-select";
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
    const critWrapper = document.createElement("div");
    critWrapper.style.display = "flex";
    critWrapper.style.flexDirection = "column";
    critWrapper.style.gap = "4px";

    const critSelect = document.createElement("select");
    critSelect.className = "table-select";
    critSelect.style.fontSize = "0.72rem";
    critSelect.style.padding = "3px";

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
    const typeSelect = document.createElement("select");
    typeSelect.className = "table-select";
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
    const analysisArea = document.createElement("textarea");
    analysisArea.className = "table-textarea";
    analysisArea.value = rowData.analysis || "";
    analysisArea.placeholder = "교실 속 실증 상황에서 수집된 버그 및 학생의 행동 현상을 기록하세요.";
    analysisArea.style.minHeight = "54px";
    analysisArea.addEventListener("input", (e) => {
      rowData.analysis = e.target.value;
      saveActiveProject();
    });
    tdAnalysis.appendChild(analysisArea);
    tr.appendChild(tdAnalysis);

    // 6. 심각성
    const tdSeverity = document.createElement("td");
    const sevSelect = document.createElement("select");
    sevSelect.className = "table-select";
    sevSelect.style.fontWeight = "bold";

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
    const impArea = document.createElement("textarea");
    impArea.className = "table-textarea";
    impArea.value = rowData.improvement || "";
    impArea.placeholder = "안전 조치 및 개선되어야 할 규격 요구사항 기재";
    impArea.style.minHeight = "54px";
    impArea.addEventListener("input", (e) => {
      rowData.improvement = e.target.value;
      saveActiveProject();
    });
    tdImprovement.appendChild(impArea);
    tr.appendChild(tdImprovement);

    // 8. 행 삭제
    const tdDelete = document.createElement("td");
    const delBtn = document.createElement("button");
    delBtn.className = "btn-delete";
    delBtn.innerHTML = "🗑️";
    delBtn.addEventListener("click", () => {
      deleteChecklistRow(rowData.id);
    });
    tdDelete.appendChild(delBtn);
    tr.appendChild(tdDelete);

    tbody.appendChild(tr);
  });
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

// 탭 스위칭
function switchTab(tabId) {
  state.currentTab = tabId;
  document.getElementById("btn-tab-edit").classList.toggle("active", tabId === "edit");
  document.getElementById("btn-tab-preview").classList.toggle("active", tabId === "preview");

  const editorArea = document.getElementById("editor-area");
  const previewArea = document.getElementById("preview-area");

  if (tabId === "edit") {
    editorArea.style.display = "block";
    previewArea.style.display = "none";
  } else {
    editorArea.style.display = "none";
    previewArea.style.display = "flex";
    renderA4Preview();
  }
}

// A4 실시간 인쇄용 프리뷰 렌더러 (다중 페이지 완벽 분할 페이징 처리 엔진)
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

  // 페이징 분할 설계 (1페이지는 메타카드 포함하므로 7개, 2페이지부터는 11개씩 균등 분할)
  const ITEMS_PAGE_1 = 7;
  const ITEMS_PAGE_REST = 11;

  let currentPageIndex = 1;
  let currentItemOffset = 0;

  while (currentItemOffset < items.length) {
    const page = document.createElement("div");
    page.className = "report-a4-page";
    
    // A. 1페이지 구성 (로고 배너, 대제목, 메타 테이블 포함)
    if (currentPageIndex === 1) {
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

      // 1페이지용 아이템 슬라이싱 (최대 7개)
      const pageItems = items.slice(currentItemOffset, currentItemOffset + ITEMS_PAGE_1);
      renderTableForPage(page, pageItems);
      currentItemOffset += pageItems.length;
    } 
    // B. 2페이지 이상 구성 (미니 헤더 및 추가 아이템 테이블 슬롯)
    else {
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
        <span>Page ${currentPageIndex}</span>
      `;
      page.appendChild(miniHeader);

      // 2페이지 이후용 아이템 슬라이싱 (최대 11개)
      const pageItems = items.slice(currentItemOffset, currentItemOffset + ITEMS_PAGE_REST);
      renderTableForPage(page, pageItems);
      currentItemOffset += pageItems.length;
    }

    container.appendChild(page);
    currentPageIndex++;
  }
}

// 메타 테이블 HTML 헬퍼
function createMetaTableA4(meta) {
  const metaTable = document.createElement("table");
  metaTable.className = "report-meta-table";
  metaTable.innerHTML = `
    <tr>
      <td class="label-td">실증 대상 제품</td>
      <td><strong>${meta.targetProduct || "미기재"}</strong></td>
      <td class="label-td">제조사/기업</td>
      <td>${meta.developer || "미기재"}</td>
    </tr>
    <tr>
      <td class="label-td">OS 종류 (대표적)</td>
      <td>${meta.osType || "미기재"}</td>
      <td class="label-td">OS 버전</td>
      <td>${meta.osVersion || "미기재"}</td>
    </tr>
    <tr>
      <td class="label-td">사용 기기 모델명</td>
      <td>${meta.modelName || "미기재"}</td>
      <td class="label-td">네트워크 환경</td>
      <td>${meta.network || "미기재"}</td>
    </tr>
    <tr>
      <td class="label-td">적용(활용) 교과</td>
      <td>${meta.usageEnv || "미기재"}</td>
      <td class="label-td">소속 학교명</td>
      <td>${meta.schoolName || "미기재"}</td>
    </tr>
    <tr>
      <td class="label-td">실증 담당 교사</td>
      <td><strong>${meta.teacherName || "미기재"}</strong></td>
      <td class="label-td">작성 일자</td>
      <td>${meta.reportDate}</td>
    </tr>
  `;
  return metaTable;
}

// 테이블 렌더링 서브 헬퍼
function renderTableForPage(pageElement, pageItems) {
  const table = document.createElement("table");
  table.className = "report-checklist-grid";
  table.innerHTML = `
    <thead>
      <tr>
        <th style="width: 12%">대분류 (요소)</th>
        <th style="width: 14%">중분류 (실증항목)</th>
        <th style="width: 25%">점검 기준 (교사 커스텀 재수정 ✍️)</th>
        <th style="width: 8%">구분</th>
        <th style="width: 24%">실제 교실 분석내용 및 현상</th>
        <th style="width: 7%">심각성</th>
        <th style="width: 10%">개선 요청사항</th>
      </tr>
    </thead>
    <tbody>
      ${pageItems.map(r => `
        <tr>
          <td>
            <span class="report-element-badge" style="background-color: ${EMPIRICAL_STANDARDS[r.element]?.bg || '#f1f5f9'}; color: ${EMPIRICAL_STANDARDS[r.element]?.color || '#334155'}; border: 1px solid ${EMPIRICAL_STANDARDS[r.element]?.borderColor || '#cbd5e1'}">
              ${r.element}
            </span>
          </td>
          <td><strong>${r.item}</strong></td>
          <td style="font-size:0.75rem; color:#475569; white-space: pre-wrap;">${r.criterion}</td>
          <td style="text-align:center;">${r.type}</td>
          <td style="white-space: pre-wrap;">${r.analysis || "<span style='color:#94a3b8'>현상분석 없음</span>"}</td>
          <td style="text-align:center;">
            <span class="severity-badge ${r.severity === '상' ? 'high' : r.severity === '중' ? 'mid' : 'low'}">${r.severity}</span>
          </td>
          <td style="white-space: pre-wrap;">${r.improvement || "<span style='color:#94a3b8'>요청없음</span>"}</td>
        </tr>
      `).join("")}
    </tbody>
  `;
  pageElement.appendChild(table);
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
    state.activeProject.meta.teacherName = state.currentUser.name;
    state.activeProject.meta.schoolName = state.currentUser.school;

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
    state.activeProject.meta = {
      targetProduct: "새로운 에듀테크 프로그램",
      developer: "",
      osType: "크롬북",
      osVersion: "OS v120",
      modelName: "Lenovo Duet",
      network: "학내 무선 AP",
      usageEnv: "",
      teacherName: state.currentUser.name,
      schoolName: state.currentUser.school,
      reportDate: new Date().toISOString().split('T')[0]
    };
    saveActiveProject();
    loadActiveProject();
    if (state.currentTab === "preview") renderA4Preview();
    showToast("선택된 보고서가 완전 포맷되었습니다.");
  }
}

// 오프라인 백업 JSON 추출
function exportJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.activeProject, null, 2));
  const dl = document.createElement("a");
  dl.setAttribute("href", dataStr);
  const name = (state.activeProject.meta.targetProduct || "empirical_report").replace(/\s+/g, '_');
  dl.setAttribute("download", `empirical_${name}_individual.json`);
  document.body.appendChild(dl);
  dl.click();
  dl.remove();
  showToast("보고서 백업 JSON 다운로드를 개시했습니다.");
}

// 오프라인 백업 JSON 복원
function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (parsed && parsed.meta && parsed.items) {
        state.activeProject.meta = parsed.meta;
        state.activeProject.items = parsed.items;
        
        saveActiveProject();
        loadActiveProject();
        if (state.currentTab === "preview") renderA4Preview();
        showToast("오프라인 JSON 백업 데이터가 정상 복원되어 로드되었습니다.");
      } else {
        alert("이 파일은 올바른 개별 실증 보고서 백업 규격이 아닙니다.");
      }
    } catch (err) {
      alert("백업 파일 파싱 중 오류: " + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
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

// 초기 로딩 바인딩
window.addEventListener("DOMContentLoaded", initApp);
