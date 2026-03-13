// Popup 스크립트 - Python 코드카타 Chrome Extension (OAuth 버전)
console.log('[SPARTA Python] popup.js 로드됨');

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[SPARTA Python] DOMContentLoaded 실행');

  // DOM 요소 - 프로필
  const profileSetup = document.getElementById('profileSetup');
  const profileDisplay = document.getElementById('profileDisplay');
  const studentNameInput = document.getElementById('studentName');
  const saveNameBtn = document.getElementById('saveNameBtn');
  const changeNameBtn = document.getElementById('changeNameBtn');
  const currentNameSpan = document.getElementById('currentName');

  // DOM 요소 - 진행률
  const headerStats = document.getElementById('headerStats');
  const totalPercent = document.getElementById('totalPercent');
  const progCount = document.getElementById('progCount');
  const baekCount = document.getElementById('baekCount');

  // DOM 요소 - 탭
  const progTabCount = document.getElementById('progTabCount');
  const baekTabCount = document.getElementById('baekTabCount');
  const beginnerTabCount = document.getElementById('beginnerTabCount');
  const beginnerCount = document.getElementById('beginnerCount');

  // DOM 요소 - 다음 문제
  const nextProblemContainer = document.getElementById('nextProblemContainer');
  const completeContainer = document.getElementById('completeContainer');
  const nextProblem = document.getElementById('nextProblem');
  const nextTitle = document.getElementById('nextTitle');
  const nextDifficulty = document.getElementById('nextDifficulty');
  const nextPlatform = document.getElementById('nextPlatform');

  // DOM 요소 - 메인 UI GitHub OAuth
  const mainGithubLogin = document.getElementById('mainGithubLogin');
  const loginSection = document.getElementById('loginSection');
  const loginWithGithub = document.getElementById('loginWithGithub');
  const deviceCodeSection = document.getElementById('deviceCodeSection');
  const userCodeDisplay = document.getElementById('userCode');
  const verificationLink = document.getElementById('verificationLink');
  const userSection = document.getElementById('userSection');
  const userAvatar = document.getElementById('userAvatar');
  const userName = document.getElementById('userName');
  const userLogin = document.getElementById('userLogin');
  const logoutBtn = document.getElementById('logoutBtn');
  const repoSelect = document.getElementById('repoSelect');
  const createRepoBtn = document.getElementById('createRepoBtn');

  // DOM 요소 - 설정 탭 GitHub OAuth
  const settingsLoginSection = document.getElementById('settingsLoginSection');
  const settingsLoginBtn = document.getElementById('settingsLoginBtn');
  const settingsUserSection = document.getElementById('settingsUserSection');
  const settingsUserAvatar = document.getElementById('settingsUserAvatar');
  const settingsUserName = document.getElementById('settingsUserName');
  const settingsUserLogin = document.getElementById('settingsUserLogin');
  const settingsLogoutBtn = document.getElementById('settingsLogoutBtn');
  const settingsRepoSelect = document.getElementById('settingsRepoSelect');
  const settingsCreateRepoBtn = document.getElementById('settingsCreateRepoBtn');

  // DOM 요소 - 기능 설정
  const autoSubmitToggle = document.getElementById('autoSubmitToggle');

  const resetBtn = document.getElementById('resetBtn');

  // 현재 추천 문제
  let currentNextProblem = null;

  // 인증 상태 감시 인터벌 (최상단에 선언해야 temporal dead zone 회피)
  let authWatchInterval = null;

  // 로그인 완료 처리 중복 방지 플래그
  let loginProcessed = false;

  // ========== 인증 상태 자동 업데이트 리스너 ==========

  // 인증 상태 확인 및 UI 업데이트 함수 (재사용)
  async function checkAndUpdateAuthState() {
    // 로그인 성공 처리가 이미 완료된 경우 스킵
    if (loginProcessed) {
      console.log('[SPARTA Python] 로그인 이미 처리됨, 스킵');
      return;
    }

    try {
      const authResult = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
      console.log('[SPARTA Python] 인증 상태 업데이트:', authResult);

      if (authResult.success && authResult.authenticated && authResult.user) {
        // 첫 번째 성공 감지 시 플래그 설정
        loginProcessed = true;

        showLoggedInState(authResult.user, authResult.repo);
        nextProblemContainer.classList.remove('hidden');
        await loadUserRepos();

        // progress 데이터 로드 및 UI 업데이트
        const { progress = {} } = await chrome.storage.sync.get(['progress']);
        updateProgress(progress);
        showNextProblem(progress);

        showToast('GitHub 로그인 성공!');
        resetLoginUI();
      }
    } catch (error) {
      console.error('[SPARTA Python] 인증 상태 업데이트 오류:', error);
    }
  }

  // Storage 변경 감지 리스너 - 토큰/진행률 변경 시 즉시 UI 업데이트
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      // 토큰이 추가됨 (로그인 성공)
      if (changes.githubToken?.newValue && !changes.githubToken?.oldValue) {
        console.log('[SPARTA Python] 토큰 감지됨 - UI 업데이트');
        checkAndUpdateAuthState();
      }
      // 토큰이 삭제됨 (로그아웃)
      if (!changes.githubToken?.newValue && changes.githubToken?.oldValue) {
        console.log('[SPARTA Python] 토큰 삭제됨 - 로그아웃 상태로 전환');
        showLoggedOutState();
        nextProblemContainer.classList.add('hidden');
      }
    }
    // 진행률 변경 감지 (sync storage)
    if (areaName === 'sync' && changes.progress) {
      console.log('[SPARTA Python] 진행률 변경 감지됨');
      const updatedProgress = changes.progress.newValue || {};
      progress = updatedProgress;
      updateProgress(progress);
      showNextProblem(progress);
      renderAllPlatforms(progress);  // 전체 UI 즉시 업데이트
    }
  });

  // Background에서 브로드캐스트 수신 - 즉시 UI 업데이트
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'AUTH_SUCCESS') {
      console.log('[SPARTA Python] AUTH_SUCCESS 브로드캐스트 수신');
      checkAndUpdateAuthState();
    }
    // 진행률 업데이트 브로드캐스트 수신
    if (message.type === 'PROGRESS_UPDATED') {
      console.log('[SPARTA Python] PROGRESS_UPDATED 브로드캐스트 수신:', message.problemId);
      chrome.storage.sync.get(['progress']).then(({ progress: updatedProgress }) => {
        progress = updatedProgress || {};
        updateProgress(progress);
        showNextProblem(progress);
        renderAllPlatforms(progress);
      });
    }
  });

  // 저장된 진행률 및 설정 로드
  const syncData = await chrome.storage.sync.get(['progress', 'studentName', 'githubRepo', 'autoSubmitEnabled']);
  let progress = syncData.progress || {};

  // 자동 제출 토글 초기화 (기본값: true)
  const autoSubmitEnabled = syncData.autoSubmitEnabled !== false;
  autoSubmitToggle.checked = autoSubmitEnabled;

  // 플랫폼별 문제 수
  const PLATFORM_COUNTS = {
    programmers: 170,  // L1~L7 (중복 10개 제거됨)
    baekjoon: 38,
    beginner: 223  // 기초·입문 (코딩테스트 입문 100 + 코딩 기초 트레이닝 123)
  };

  // 총 문제 수
  const TOTAL_PROBLEMS = 431;

  // 플랫폼 이름
  const PLATFORM_NAMES = {
    programmers: '프로그래머스',
    baekjoon: '백준'
  };

  // 초기화 - 이름
  if (syncData.studentName) {
    showNameDisplay(syncData.studentName);
  } else {
    showNameSetup();
  }

  // 인증 상태 확인 (강화된 검증)
  try {
    const authResult = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
    console.log('[SPARTA Python] 인증 상태:', authResult);

    // user 객체까지 확인하여 완전한 로그인 상태 검증
    if (authResult.success && authResult.authenticated && authResult.user) {
      // 로그인됨
      showLoggedInState(authResult.user, authResult.repo);
      nextProblemContainer.classList.remove('hidden');
      // 저장소 목록도 로드
      await loadUserRepos();
    } else {
      // 로그인 안됨
      showLoggedOutState();
      nextProblemContainer.classList.add('hidden');
    }
  } catch (error) {
    console.error('[SPARTA Python] 초기 인증 상태 확인 실패:', error);
    showLoggedOutState();
    nextProblemContainer.classList.add('hidden');
  }

  // UI 업데이트
  updateProgress(progress);
  showNextProblem(progress);
  initTabs();
  renderAllPlatforms(progress);

  // ========== OAuth 이벤트 리스너 ==========

  // 메인 로그인 버튼
  loginWithGithub.addEventListener('click', startOAuthFlow);

  // 설정 탭 로그인 버튼
  settingsLoginBtn.addEventListener('click', startOAuthFlow);

  // 로그아웃 버튼
  logoutBtn.addEventListener('click', handleLogout);
  settingsLogoutBtn.addEventListener('click', handleLogout);

  // 저장소 선택
  repoSelect.addEventListener('change', handleRepoSelect);
  settingsRepoSelect.addEventListener('change', handleRepoSelect);

  // 저장소 생성
  createRepoBtn.addEventListener('click', handleCreateRepo);
  settingsCreateRepoBtn.addEventListener('click', handleCreateRepo);

  // GitHub 영역 클릭 시 레포지토리로 이동 (버튼/select 제외)
  userSection.addEventListener('click', (e) => {
    // 버튼, select, option 클릭은 무시
    const target = e.target;
    if (target.tagName === 'BUTTON' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'OPTION' ||
        target.closest('button') ||
        target.closest('select')) {
      return;
    }

    // 선택된 저장소가 있으면 해당 레포지토리로 이동
    const selectedRepo = repoSelect.value;
    if (selectedRepo) {
      const repoUrl = `https://github.com/${selectedRepo}`;
      chrome.tabs.create({ url: repoUrl });
    }
  });

  // 자동 제출 토글
  autoSubmitToggle.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    await chrome.storage.sync.set({ autoSubmitEnabled: enabled });
    showToast(enabled ? 'GitHub 자동 제출 활성화' : 'GitHub 자동 제출 비활성화');
  });

  // ========== 기존 이벤트 리스너 ==========

  // 이름 저장
  saveNameBtn.addEventListener('click', async () => {
    const name = studentNameInput.value.trim();
    if (!name) {
      showToast('이름을 입력해주세요');
      return;
    }
    await chrome.storage.sync.set({ studentName: name });
    showNameDisplay(name);
    showToast('저장되었습니다');
  });

  // 이름 변경
  changeNameBtn.addEventListener('click', () => {
    showNameSetup();
    studentNameInput.value = currentNameSpan.textContent;
    studentNameInput.focus();
  });

  // 다음 문제 클릭
  nextProblem.addEventListener('click', () => {
    if (currentNextProblem) {
      const url = getProblemUrl(currentNextProblem);
      chrome.tabs.create({ url });
    }
  });

  // 진행률 초기화
  resetBtn.addEventListener('click', async () => {
    if (confirm('모든 진행 상황을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
      await chrome.storage.sync.set({ progress: {} });
      progress = {};
      updateProgress(progress);
      showNextProblem(progress);
      renderAllPlatforms(progress);
      showToast('진행 상황이 초기화되었습니다');
    }
  });

  // ========== OAuth 함수 ==========

  // 복사 버튼 요소
  const copyCodeBtn = document.getElementById('copyCodeBtn');
  const codeCopiedMsg = document.getElementById('codeCopiedMsg');

  // 복사 버튼 클릭 이벤트
  if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', async () => {
      const code = userCodeDisplay.textContent;
      if (code && code !== 'XXXX-XXXX') {
        await copyToClipboard(code);
      }
    });
  }

  // 클립보드 복사 함수
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      // 복사 완료 메시지 표시
      if (codeCopiedMsg) {
        codeCopiedMsg.classList.remove('hidden');
        setTimeout(() => {
          codeCopiedMsg.classList.add('hidden');
        }, 2000);
      }
      console.log('[SPARTA Python] 코드 클립보드 복사 완료:', text);
    } catch (err) {
      console.error('[SPARTA Python] 클립보드 복사 실패:', err);
    }
  }

  // OAuth 플로우 시작 (백그라운드 자동화 버전)
  async function startOAuthFlow() {
    try {
      // 양쪽 버튼 모두 비활성화 (이중 클릭 방지)
      loginWithGithub.disabled = true;
      loginWithGithub.textContent = '연결 중...';
      settingsLoginBtn.disabled = true;
      settingsLoginBtn.textContent = '연결 중...';

      // Step 1: Device Flow 시작
      const deviceResult = await chrome.runtime.sendMessage({ type: 'START_DEVICE_FLOW' });
      console.log('[SPARTA Python] Device Flow 결과:', deviceResult);

      if (!deviceResult.success) {
        throw new Error(deviceResult.message || 'Device Flow 시작 실패');
      }

      // Device Code 표시
      userCodeDisplay.textContent = deviceResult.user_code;
      verificationLink.href = deviceResult.verification_uri;
      deviceCodeSection.classList.remove('hidden');
      loginWithGithub.classList.add('hidden');

      // 자동으로 코드 클립보드에 복사
      await copyToClipboard(deviceResult.user_code);

      // 자동으로 GitHub 인증 페이지 새 탭에서 열기
      chrome.tabs.create({ url: deviceResult.verification_uri });

      // Step 2: 백그라운드에 폴링 시작 요청 (await 하지 않음!)
      // 팝업이 닫혀도 백그라운드에서 계속 폴링 진행
      chrome.runtime.sendMessage({
        type: 'START_POLLING_BACKGROUND',
        data: {
          device_code: deviceResult.device_code,
          interval: deviceResult.interval,
          expires_in: deviceResult.expires_in
        }
      }).catch(() => {
        // 팝업이 닫혀있어도 무시 - 백그라운드는 계속 진행
        console.log('[SPARTA Python] 백그라운드에서 폴링 계속 진행');
      });

      // Step 3: 인증 상태 변화 감시 시작
      watchAuthStatusChanges();

    } catch (error) {
      console.error('[SPARTA Python] OAuth 오류:', error);
      showToast('로그인 실패: ' + error.message);
      resetLoginUI();
    }
  }

  // 인증 상태 변화 감시 (백그라운드 폴링 결과 확인)
  function watchAuthStatusChanges() {
    // 기존 인터벌 정리
    if (authWatchInterval) {
      clearInterval(authWatchInterval);
    }

    console.log('[SPARTA Python] 인증 상태 감시 시작');

    authWatchInterval = setInterval(async () => {
      try {
        // 이미 다른 메커니즘(storage.onChanged, AUTH_SUCCESS)에서 처리됨
        if (loginProcessed) {
          clearInterval(authWatchInterval);
          authWatchInterval = null;
          return;
        }

        const authResult = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });

        if (authResult.success && authResult.authenticated) {
          // 로그인 성공!
          console.log('[SPARTA Python] 인증 성공 감지!');
          clearInterval(authWatchInterval);
          authWatchInterval = null;

          // checkAndUpdateAuthState에서 중복 방지 처리
          await checkAndUpdateAuthState();
        }
      } catch (error) {
        // 에러 무시 (팝업이 닫히면 발생할 수 있음)
        console.log('[SPARTA Python] 인증 상태 확인 중 오류 (무시됨):', error.message);
      }
    }, 1000); // 1초마다 확인

    // 15분 후 자동 중단 (토큰 만료 시간)
    setTimeout(() => {
      if (authWatchInterval) {
        console.log('[SPARTA Python] 인증 감시 타임아웃 (15분)');
        clearInterval(authWatchInterval);
        authWatchInterval = null;
        resetLoginUI();
      }
    }, 15 * 60 * 1000);
  }

  // 로그아웃 처리 (완전한 상태 초기화)
  async function handleLogout() {
    try {
      // 진행 중인 인증 폴링 중지
      if (authWatchInterval) {
        clearInterval(authWatchInterval);
        authWatchInterval = null;
      }

      const result = await chrome.runtime.sendMessage({ type: 'LOGOUT' });

      if (result.success) {
        // 로그인 플래그 리셋 (재로그인 가능하도록)
        loginProcessed = false;

        // UI 상태 완전 초기화
        showLoggedOutState();
        resetLoginUI();  // 로그인 UI도 초기 상태로
        nextProblemContainer.classList.add('hidden');

        // 저장소 선택 상태 초기화
        repoSelect.innerHTML = '<option value="">저장소를 선택하세요...</option>';
        settingsRepoSelect.innerHTML = '<option value="">저장소를 선택하세요...</option>';

        showToast('로그아웃되었습니다');
      } else {
        showToast('로그아웃 실패: ' + (result.message || '알 수 없는 오류'), 'error');
      }
    } catch (error) {
      console.error('[SPARTA Python] 로그아웃 오류:', error);
      showToast('로그아웃 실패: ' + error.message, 'error');
    }
  }

  // 저장소 선택 처리
  async function handleRepoSelect(e) {
    const repoFullName = e.target.value;
    if (!repoFullName) return;

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'SELECT_REPO',
        data: { repoFullName }
      });

      if (result.success) {
        // 두 select 동기화
        repoSelect.value = repoFullName;
        settingsRepoSelect.value = repoFullName;
        showToast('저장소가 선택되었습니다');
      } else {
        showToast('저장소 선택 실패: ' + result.message);
      }
    } catch (error) {
      console.error('[SPARTA Python] 저장소 선택 오류:', error);
      showToast('저장소 선택 실패');
    }
  }

  // 저장소 생성 처리
  async function handleCreateRepo() {
    try {
      createRepoBtn.disabled = true;
      settingsCreateRepoBtn.disabled = true;
      createRepoBtn.textContent = '생성 중...';
      settingsCreateRepoBtn.textContent = '생성 중...';

      const result = await chrome.runtime.sendMessage({
        type: 'CREATE_REPO',
        data: { repoName: 'python-codekata' }
      });

      if (result.success) {
        showToast('저장소가 생성되었습니다!');

        const fullName = result.repo.full_name;
        const repoName = result.repo.name;

        // Optimistic UI Update: 새 저장소를 드롭다운에 즉시 추가
        addRepoToDropdown(fullName, repoName);

        // 새 저장소 선택
        repoSelect.value = fullName;
        settingsRepoSelect.value = fullName;

        // 저장소 선택 저장
        await chrome.runtime.sendMessage({
          type: 'SELECT_REPO',
          data: { repoFullName: fullName }
        });

        // 백그라운드에서 API 목록 새로고침 (동기화 목적)
        setTimeout(async () => {
          await loadUserRepos();
          // 새로고침 후에도 선택 유지
          repoSelect.value = fullName;
          settingsRepoSelect.value = fullName;
        }, 2000);
      } else {
        showToast('저장소 생성 실패: ' + result.message);
      }
    } catch (error) {
      console.error('[SPARTA Python] 저장소 생성 오류:', error);
      showToast('저장소 생성 실패');
    } finally {
      createRepoBtn.disabled = false;
      settingsCreateRepoBtn.disabled = false;
      createRepoBtn.textContent = '+ 새 저장소 만들기 (python-codekata)';
      settingsCreateRepoBtn.textContent = '+ 새 저장소 만들기 (python-codekata)';
    }
  }

  // 드롭다운에 새 저장소 추가 (Optimistic UI)
  function addRepoToDropdown(fullName, repoName) {
    // 이미 존재하는지 확인
    const existsInMain = Array.from(repoSelect.options).some(opt => opt.value === fullName);
    const existsInSettings = Array.from(settingsRepoSelect.options).some(opt => opt.value === fullName);

    if (!existsInMain) {
      const option = document.createElement('option');
      option.value = fullName;
      option.textContent = repoName;
      // 첫 번째 옵션(placeholder) 다음에 추가
      if (repoSelect.options.length > 1) {
        repoSelect.insertBefore(option, repoSelect.options[1]);
      } else {
        repoSelect.appendChild(option);
      }
    }

    if (!existsInSettings) {
      const option = document.createElement('option');
      option.value = fullName;
      option.textContent = repoName;
      if (settingsRepoSelect.options.length > 1) {
        settingsRepoSelect.insertBefore(option, settingsRepoSelect.options[1]);
      } else {
        settingsRepoSelect.appendChild(option);
      }
    }
  }

  // 사용자 저장소 목록 로드
  async function loadUserRepos() {
    try {
      // 로딩 중 피드백 표시
      repoSelect.innerHTML = '<option value="">로딩 중...</option>';
      settingsRepoSelect.innerHTML = '<option value="">로딩 중...</option>';

      const result = await chrome.runtime.sendMessage({ type: 'GET_USER_REPOS' });

      if (result.success) {
        // select 옵션 업데이트
        const options = '<option value="">저장소를 선택하세요...</option>' +
          result.repos.map(repo =>
            `<option value="${repo.full_name}">${repo.name}${repo.private ? ' 🔒' : ''}</option>`
          ).join('');

        repoSelect.innerHTML = options;
        settingsRepoSelect.innerHTML = options;

        // 이전에 선택한 저장소 복원
        const { githubRepo } = await chrome.storage.sync.get(['githubRepo']);
        if (githubRepo) {
          repoSelect.value = githubRepo;
          settingsRepoSelect.value = githubRepo;
        }
      }
    } catch (error) {
      console.error('[SPARTA Python] 저장소 목록 로드 오류:', error);
      // 로딩 실패 시 기본 상태로 복원
      repoSelect.innerHTML = '<option value="">저장소를 선택하세요...</option>';
      settingsRepoSelect.innerHTML = '<option value="">저장소를 선택하세요...</option>';
    }
  }

  // 로그인 상태 UI 표시
  function showLoggedInState(user, repo) {
    // 방어 코드: user 정보가 없으면 리턴
    if (!user || !user.login) {
      console.warn('[SPARTA Python] showLoggedInState: user 정보 없음, 건너뜀');
      return;
    }

    // 메인 UI
    loginSection.classList.add('hidden');
    userSection.classList.remove('hidden');
    userAvatar.src = user.avatar_url || '';
    userName.textContent = user.name || user.login;
    userLogin.textContent = '@' + user.login;

    // 설정 탭
    settingsLoginSection.classList.add('hidden');
    settingsUserSection.classList.remove('hidden');
    settingsUserAvatar.src = user.avatar_url || '';
    settingsUserName.textContent = user.name || user.login;
    settingsUserLogin.textContent = '@' + user.login;

    // 저장소 로드
    loadUserRepos();
  }

  // 로그아웃 상태 UI 표시
  function showLoggedOutState() {
    // 메인 UI
    loginSection.classList.remove('hidden');
    userSection.classList.add('hidden');
    resetLoginUI();

    // 설정 탭
    settingsLoginSection.classList.remove('hidden');
    settingsUserSection.classList.add('hidden');
  }

  // 로그인 UI 리셋
  function resetLoginUI() {
    // 인증 감시 인터벌 정리
    if (authWatchInterval) {
      clearInterval(authWatchInterval);
      authWatchInterval = null;
    }

    loginWithGithub.disabled = false;
    loginWithGithub.innerHTML = `
      <svg viewBox="0 0 16 16">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
      GitHub로 로그인
    `;
    loginWithGithub.classList.remove('hidden');
    deviceCodeSection.classList.add('hidden');

    // 설정 탭 로그인 버튼도 리셋
    settingsLoginBtn.disabled = false;
    settingsLoginBtn.innerHTML = `
      <svg viewBox="0 0 16 16">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
      GitHub로 로그인
    `;
  }

  // ========== 기존 함수 ==========

  // 프로필 UI
  function showNameSetup() {
    profileSetup.classList.remove('hidden');
    profileSetup.style.display = 'flex';
    profileDisplay.classList.add('hidden');
  }

  function showNameDisplay(name) {
    profileSetup.classList.add('hidden');
    profileSetup.style.display = 'none';
    profileDisplay.classList.remove('hidden');
    currentNameSpan.textContent = name;
  }

  // 진행률 업데이트
  function updateProgress(progress) {
    const solvedIds = Object.keys(progress).filter(id => progress[id]?.completed);
    const total = solvedIds.length;

    // 프로그래머스 (difficulty > 0인 문제들만)
    const progSolved = solvedIds.filter(id => {
      const p = PROBLEMS.find(pr => pr.id === parseInt(id));
      return p && p.platform === 'programmers' && p.difficulty > 0;
    }).length;

    // 백준
    const baekSolved = solvedIds.filter(id => {
      const p = PROBLEMS.find(pr => pr.id === parseInt(id));
      return p && p.platform === 'baekjoon';
    }).length;

    // 기초·입문 (difficulty === 0인 문제들)
    const beginnerSolved = solvedIds.filter(id => {
      const p = PROBLEMS.find(pr => pr.id === parseInt(id));
      return p && p.difficulty === 0;
    }).length;

    headerStats.textContent = `${total}/${TOTAL_PROBLEMS}`;
    totalPercent.textContent = `${Math.round((total / TOTAL_PROBLEMS) * 100)}%`;
    progCount.textContent = progSolved;
    baekCount.textContent = baekSolved;
    beginnerCount.textContent = beginnerSolved;
    progTabCount.textContent = `${progSolved}/${PLATFORM_COUNTS.programmers}`;
    baekTabCount.textContent = `${baekSolved}/${PLATFORM_COUNTS.baekjoon}`;
    beginnerTabCount.textContent = `${beginnerSolved}/${PLATFORM_COUNTS.beginner}`;
  }

  // 다음 문제 추천
  function showNextProblem(progress) {
    const solvedIds = new Set(
      Object.keys(progress)
        .filter(id => progress[id]?.completed)
        .map(id => parseInt(id))
    );

    // 미풀이 문제 중 난이도 낮은 순
    const unsolved = PROBLEMS.filter(p => !solvedIds.has(p.id))
      .sort((a, b) => a.difficulty - b.difficulty || a.id - b.id);

    if (unsolved.length === 0) {
      nextProblemContainer.classList.add('hidden');
      completeContainer.classList.remove('hidden');
      currentNextProblem = null;
      return;
    }

    completeContainer.classList.add('hidden');

    currentNextProblem = unsolved[0];
    const diffInfo = DIFFICULTY_INFO[currentNextProblem.difficulty];

    nextTitle.textContent = `#${currentNextProblem.id} ${currentNextProblem.title}`;
    nextDifficulty.textContent = diffInfo.display;
    nextPlatform.textContent = PLATFORM_NAMES[currentNextProblem.platform];
  }

  // 탭 초기화
  function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const tabId = btn.dataset.tab;
        document.getElementById(`tab-${tabId}`).classList.add('active');
      });
    });
  }

  // 플랫폼별 문제 렌더링
  function renderAllPlatforms(progress) {
    renderPlatformProblems('programmers', 'progDifficultyList', progress);
    renderPlatformProblems('baekjoon', 'baekDifficultyList', progress);
    renderBeginnerProblems(progress);
  }

  function renderPlatformProblems(platform, containerId, progress) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    // 프로그래머스는 difficulty > 0인 문제만 (기초·입문 제외)
    const platformProblems = PROBLEMS.filter(p =>
      p.platform === platform && (platform !== 'programmers' || p.difficulty > 0)
    );

    // 난이도별 그룹화
    const difficultyGroups = {};
    platformProblems.forEach(p => {
      if (!difficultyGroups[p.difficulty]) {
        difficultyGroups[p.difficulty] = [];
      }
      difficultyGroups[p.difficulty].push(p);
    });

    // 난이도 순서대로 정렬
    const sortedDifficulties = Object.keys(difficultyGroups)
      .map(Number)
      .sort((a, b) => {
        // 1-5, 7, 8 순서
        if (a <= 5 && b <= 5) return a - b;
        if (a <= 5) return -1;
        if (b <= 5) return 1;
        return a - b;
      });

    sortedDifficulties.forEach(difficulty => {
      const problems = difficultyGroups[difficulty];
      const diffInfo = DIFFICULTY_INFO[difficulty];

      const solvedCount = problems.filter(p => progress[p.id]?.completed).length;
      const progressPercent = Math.round((solvedCount / problems.length) * 100);

      const groupDiv = document.createElement('div');
      groupDiv.className = 'difficulty-group';
      groupDiv.innerHTML = `
        <div class="difficulty-header" data-difficulty="${difficulty}">
          <div class="difficulty-label">
            <span class="difficulty-stars">${diffInfo.display}</span>
            <span class="difficulty-name">${diffInfo.name} ${diffInfo.label}</span>
          </div>
          <div class="difficulty-stats">
            <span class="difficulty-count">${solvedCount}/${problems.length}</span>
            <div class="difficulty-progress">
              <div class="difficulty-progress-fill" style="width: ${progressPercent}%"></div>
            </div>
            <span class="difficulty-arrow">▼</span>
          </div>
        </div>
        <div class="problem-list" data-difficulty="${difficulty}">
          ${problems.map(p => renderProblemItem(p, progress)).join('')}
        </div>
      `;

      container.appendChild(groupDiv);
    });

    // 난이도 헤더 클릭 이벤트
    container.querySelectorAll('.difficulty-header').forEach(header => {
      header.addEventListener('click', () => {
        const difficulty = header.dataset.difficulty;
        const list = container.querySelector(`.problem-list[data-difficulty="${difficulty}"]`);

        header.classList.toggle('expanded');
        list.classList.toggle('show');
      });
    });

    // 체크박스 및 링크 이벤트
    container.querySelectorAll('.problem-check').forEach(check => {
      check.addEventListener('click', async (e) => {
        e.stopPropagation();
        const problemId = parseInt(check.dataset.id);
        const item = check.closest('.problem-item');
        const isSolved = item.classList.contains('solved');

        if (isSolved) {
          delete progress[problemId];
          item.classList.remove('solved');
          check.textContent = '';
        } else {
          progress[problemId] = { completed: true, completedAt: new Date().toISOString() };
          item.classList.add('solved');
          check.textContent = '✓';
        }

        await chrome.storage.sync.set({ progress });
        updateProgress(progress);
        showNextProblem(progress);
      });
    });

    container.querySelectorAll('.problem-title, .problem-go').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const problemId = parseInt(el.closest('.problem-item').querySelector('.problem-check').dataset.id);
        const problem = PROBLEMS.find(p => p.id === problemId);
        if (problem) {
          chrome.tabs.create({ url: getProblemUrl(problem) });
        }
      });
    });
  }

  function renderProblemItem(problem, progress) {
    const isSolved = progress[problem.id]?.completed;
    return `
      <div class="problem-item ${isSolved ? 'solved' : ''}">
        <div class="problem-check" data-id="${problem.id}">${isSolved ? '✓' : ''}</div>
        <span class="problem-num">#${problem.id}</span>
        <span class="problem-title">${problem.title}</span>
        <span class="problem-go">→</span>
      </div>
    `;
  }

  // 기초·입문 탭 문제 렌더링
  function renderBeginnerProblems(progress) {
    // 코딩테스트 입문 (category === '코딩테스트입문')
    const introProblems = PROBLEMS.filter(p => p.difficulty === 0 && p.category === '코딩테스트입문');
    // 코딩 기초 트레이닝 (category === '코딩기초트레이닝')
    const trainingProblems = PROBLEMS.filter(p => p.difficulty === 0 && p.category === '코딩기초트레이닝');

    // 코딩테스트 입문 섹션 렌더링
    const introContainer = document.getElementById('introProblems');
    const introSolved = introProblems.filter(p => progress[p.id]?.completed).length;
    const introProgressPercent = Math.round((introSolved / introProblems.length) * 100);

    document.getElementById('introCount').textContent = `${introSolved}/${introProblems.length}`;
    document.getElementById('introProgressFill').style.width = `${introProgressPercent}%`;
    introContainer.innerHTML = introProblems.map(p => renderProblemItem(p, progress)).join('');

    // 코딩 기초 트레이닝 섹션 렌더링
    const trainingContainer = document.getElementById('trainingProblems');
    const trainingSolved = trainingProblems.filter(p => progress[p.id]?.completed).length;
    const trainingProgressPercent = Math.round((trainingSolved / trainingProblems.length) * 100);

    document.getElementById('trainingCount').textContent = `${trainingSolved}/${trainingProblems.length}`;
    document.getElementById('trainingProgressFill').style.width = `${trainingProgressPercent}%`;
    trainingContainer.innerHTML = trainingProblems.map(p => renderProblemItem(p, progress)).join('');

    // 기초·입문 탭 이벤트 바인딩
    const beginnerTab = document.getElementById('tab-beginner');

    // 헤더 클릭 이벤트 (접기/펼치기)
    beginnerTab.querySelectorAll('.difficulty-header').forEach(header => {
      header.addEventListener('click', () => {
        const category = header.dataset.category;
        const list = beginnerTab.querySelector(`#${category}Problems`);

        header.classList.toggle('expanded');
        list.classList.toggle('show');
      });
    });

    // 체크박스 및 링크 이벤트
    beginnerTab.querySelectorAll('.problem-check').forEach(check => {
      check.addEventListener('click', async (e) => {
        e.stopPropagation();
        const problemId = parseInt(check.dataset.id);
        const item = check.closest('.problem-item');
        const isSolved = item.classList.contains('solved');

        if (isSolved) {
          delete progress[problemId];
          item.classList.remove('solved');
          check.textContent = '';
        } else {
          progress[problemId] = { completed: true, completedAt: new Date().toISOString() };
          item.classList.add('solved');
          check.textContent = '✓';
        }

        await chrome.storage.sync.set({ progress });
        updateProgress(progress);
        showNextProblem(progress);

        // 진행률 UI 업데이트 (기초·입문 탭 내)
        const introSolvedNow = PROBLEMS.filter(p => p.difficulty === 0 && p.category === '코딩테스트입문' && progress[p.id]?.completed).length;
        const trainingSolvedNow = PROBLEMS.filter(p => p.difficulty === 0 && p.category === '코딩기초트레이닝' && progress[p.id]?.completed).length;

        document.getElementById('introCount').textContent = `${introSolvedNow}/100`;
        document.getElementById('introProgressFill').style.width = `${introSolvedNow}%`;
        document.getElementById('trainingCount').textContent = `${trainingSolvedNow}/123`;
        document.getElementById('trainingProgressFill').style.width = `${Math.round((trainingSolvedNow / 123) * 100)}%`;
      });
    });

    beginnerTab.querySelectorAll('.problem-title, .problem-go').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const problemId = parseInt(el.closest('.problem-item').querySelector('.problem-check').dataset.id);
        const problem = PROBLEMS.find(p => p.id === problemId);
        if (problem) {
          chrome.tabs.create({ url: getProblemUrl(problem) });
        }
      });
    });
  }

  // 토스트 메시지 (타입별 스타일 지원)
  function showToast(message, type = 'success', duration = 2500) {
    const toast = document.createElement('div');
    toast.textContent = message;

    // 타입별 배경색
    let bgColor = 'rgba(0,0,0,0.8)';
    if (type === 'error') bgColor = '#dc3545';
    else if (type === 'warning') bgColor = '#ffc107';

    // 타입별 글자색
    let textColor = 'white';
    if (type === 'warning') textColor = '#000';

    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${bgColor};
      color: ${textColor};
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 12px;
      z-index: 1000;
      animation: fadeIn 0.2s;
      max-width: 280px;
      text-align: center;
      word-break: keep-all;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }
});
