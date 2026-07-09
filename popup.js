// Popup 스크립트 - Python 알고리즘 Chrome Extension (OAuth 버전)
console.log('[Python 알고리즘] popup.js 로드됨');

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Python 알고리즘] DOMContentLoaded 실행');

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

  // DOM 요소 - 탭
  const progTabCount = document.getElementById('progTabCount');
  const beginnerTabCount = document.getElementById('beginnerTabCount');
  const beginnerCount = document.getElementById('beginnerCount');

  // DOM 요소 - 다음 문제
  const nextProblemContainer = document.getElementById('nextProblemContainer');
  const completeContainer = document.getElementById('completeContainer');
  const completeDesc = document.getElementById('completeDesc');
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
  const deviceCountdown = document.getElementById('deviceCountdown');
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

  // 진행률 (스토리지 로드 전 안전한 기본값)
  let progress = {};

  // 연결된 GitHub 저장소 "owner/repo" (없으면 빈 문자열)
  let currentRepo = '';

  // 현재 추천 문제
  let currentNextProblem = null;

  // Device Flow 남은 시간 카운트다운 인터벌 (표시 전용)
  let deviceCountdownInterval = null;

  // 로그인 완료 처리 중복 방지 플래그
  let loginProcessed = false;

  // 접기/펼치기 그룹 목록 (프로그래머스 난이도 + 기초·입문)
  // 각 그룹: { problems, listEl, countEl, fillEl, total, rendered }
  const groups = [];

  // 플랫폼 이름 (프로그래머스 단일)
  const PLATFORM_NAMES = {
    programmers: '프로그래머스'
  };

  // ========== 인증 상태 자동 업데이트 리스너 ==========

  // 인증 상태 확인 및 UI 업데이트 함수 (재사용)
  async function checkAndUpdateAuthState() {
    // 로그인 성공 처리가 이미 완료된 경우 스킵
    if (loginProcessed) {
      console.log('[Python 알고리즘] 로그인 이미 처리됨, 스킵');
      return;
    }

    try {
      const authResult = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
      console.log('[Python 알고리즘] 인증 상태 업데이트:', authResult);

      if (authResult.success && authResult.authenticated && authResult.user) {
        // 첫 번째 성공 감지 시 플래그 설정
        loginProcessed = true;

        showLoggedInState(authResult.user, authResult.repo);
        nextProblemContainer.classList.remove('hidden');
        await loadUserRepos();

        // progress 데이터 로드 및 UI 업데이트
        const { progress: syncProgress = {} } = await chrome.storage.sync.get(['progress']);
        reconcileProgress(syncProgress);

        showToast('GitHub 로그인 성공!');
        resetLoginUI();
      }
    } catch (error) {
      console.error('[Python 알고리즘] 인증 상태 업데이트 오류:', error);
    }
  }

  // Storage 변경 감지 리스너 - 토큰/진행률 변경 시 즉시 UI 업데이트
  // (기존 setInterval 기반 CHECK_AUTH 폴링을 대체)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      // 토큰이 추가됨 (로그인 성공)
      if (changes.githubToken?.newValue && !changes.githubToken?.oldValue) {
        console.log('[Python 알고리즘] 토큰 감지됨 - UI 업데이트');
        checkAndUpdateAuthState();
      }
      // 토큰이 삭제됨 (로그아웃)
      if (!changes.githubToken?.newValue && changes.githubToken?.oldValue) {
        console.log('[Python 알고리즘] 토큰 삭제됨 - 로그아웃 상태로 전환');
        showLoggedOutState();
        nextProblemContainer.classList.add('hidden');
      }
    }
    // 진행률 변경 감지 (sync storage) - 항목/카운터만 갱신 (전체 재렌더 X)
    if (areaName === 'sync' && changes.progress) {
      console.log('[Python 알고리즘] 진행률 변경 감지됨');
      reconcileProgress(changes.progress.newValue || {});
    }
  });

  // Background에서 브로드캐스트 수신 - 즉시 UI 업데이트
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'AUTH_SUCCESS') {
      console.log('[Python 알고리즘] AUTH_SUCCESS 브로드캐스트 수신');
      checkAndUpdateAuthState();
    }
    // 인증 만료/거부/실패 - 대기 화면을 접고 다시 시도할 수 있게 한다
    if (message.type === 'AUTH_FAILED') {
      console.warn('[Python 알고리즘] AUTH_FAILED 수신:', message.message);
      resetLoginUI();
      showToast(message.message || '인증에 실패했습니다. 다시 시도해주세요.', 'error');
    }
    // 진행률 업데이트 브로드캐스트 수신
    if (message.type === 'PROGRESS_UPDATED') {
      console.log('[Python 알고리즘] PROGRESS_UPDATED 브로드캐스트 수신:', message.problemId);
      chrome.storage.sync.get(['progress']).then(({ progress: updatedProgress }) => {
        reconcileProgress(updatedProgress || {});
      });
    }
  });

  // 저장된 진행률 및 설정 로드
  const syncData = await chrome.storage.sync.get(['progress', 'studentName', 'githubRepo', 'autoSubmitEnabled']);
  progress = syncData.progress || {};

  // 연결된 저장소 (owner/repo). 문제 항목의 GitHub 바로가기에 쓰인다.
  currentRepo = syncData.githubRepo || '';
  refreshGitHubLinks();

  // 자동 제출 토글 초기화 (기본값: true)
  const autoSubmitEnabled = syncData.autoSubmitEnabled !== false;
  autoSubmitToggle.checked = autoSubmitEnabled;

  // 초기화 - 이름
  if (syncData.studentName) {
    showNameDisplay(syncData.studentName);
  } else {
    showNameSetup();
  }

  // 인증 상태 확인 (강화된 검증)
  try {
    const authResult = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
    console.log('[Python 알고리즘] 인증 상태:', authResult);

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
      // 진행 중인 Device Flow가 있으면 인증 화면 복원
      await restorePendingDeviceAuth();
    }
  } catch (error) {
    console.error('[Python 알고리즘] 초기 인증 상태 확인 실패:', error);
    showLoggedOutState();
    nextProblemContainer.classList.add('hidden');
    await restorePendingDeviceAuth();
  }

  // UI 업데이트 (문제 목록은 lazy 렌더 - 헤더만 생성)
  initTabs();
  renderProblemLists();
  updateProgress(progress);
  showNextProblem(progress);

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
      reconcileProgress({});
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
      console.log('[Python 알고리즘] 코드 클립보드 복사 완료');
    } catch (err) {
      console.error('[Python 알고리즘] 클립보드 복사 실패:', err);
    }
  }

  // Device Code 인증 화면 표시 (신규 시작 / 재오픈 복원 공용)
  function showDeviceCodeScreen(auth) {
    userCodeDisplay.textContent = auth.user_code || 'XXXX-XXXX';
    if (auth.verification_uri) {
      verificationLink.href = auth.verification_uri;
    }

    // 로그인 버튼 숨기고 코드 화면 표시
    loginWithGithub.classList.add('hidden');
    deviceCodeSection.classList.remove('hidden');

    // 양쪽 로그인 버튼 비활성화 (진행 중 표시)
    loginWithGithub.disabled = true;
    settingsLoginBtn.disabled = true;

    // 남은 시간 카운트다운
    if (auth.expires_at) {
      startDeviceCountdown(auth.expires_at);
    }
  }

  // 남은 시간 카운트다운 (분:초, 표시 전용 - 인증 폴링 아님)
  function startDeviceCountdown(expiresAt) {
    stopDeviceCountdown();

    const tick = () => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        handleDeviceExpired();
        return;
      }
      const totalSec = Math.floor(remaining / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      if (deviceCountdown) {
        deviceCountdown.textContent = `${m}:${String(s).padStart(2, '0')} 남음`;
      }
    };

    tick();
    deviceCountdownInterval = setInterval(tick, 1000);
  }

  function stopDeviceCountdown() {
    if (deviceCountdownInterval) {
      clearInterval(deviceCountdownInterval);
      deviceCountdownInterval = null;
    }
    if (deviceCountdown) {
      deviceCountdown.textContent = '';
    }
  }

  // 인증 시간 만료 처리 - 로그인 버튼으로 자동 복귀
  async function handleDeviceExpired() {
    stopDeviceCountdown();
    try {
      await chrome.storage.local.remove('pendingDeviceAuth');
    } catch (e) {
      console.error('[Python 알고리즘] pendingDeviceAuth 정리 실패:', e);
    }
    resetLoginUI();
    showToast('인증 시간이 만료되었습니다. 다시 시도해주세요.', 'error');
  }

  // 팝업 재오픈 시 진행 중인 Device Flow 복원
  async function restorePendingDeviceAuth() {
    try {
      const { pendingDeviceAuth } = await chrome.storage.local.get('pendingDeviceAuth');
      if (!pendingDeviceAuth) return;

      // 만료된 경우 정리하고 로그인 버튼 유지
      if (!pendingDeviceAuth.expires_at || pendingDeviceAuth.expires_at <= Date.now()) {
        await chrome.storage.local.remove('pendingDeviceAuth');
        return;
      }

      console.log('[Python 알고리즘] 진행 중인 Device Flow 복원');
      showDeviceCodeScreen(pendingDeviceAuth);

      // 서비스 워커가 죽어 있었을 수 있다. 폴링을 되살리고 즉시 한 번 확인시킨다.
      chrome.runtime.sendMessage({ type: 'POLL_DEVICE_AUTH_NOW' }).catch(() => {});
    } catch (e) {
      console.error('[Python 알고리즘] pendingDeviceAuth 복원 실패:', e);
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
      console.log('[Python 알고리즘] Device Flow 결과:', deviceResult);

      if (!deviceResult.success) {
        throw new Error(deviceResult.message || 'Device Flow 시작 실패');
      }

      // 만료 시각 계산 후 인증 화면 표시 + 카운트다운
      const expiresAt = Date.now() + (deviceResult.expires_in || 900) * 1000;
      showDeviceCodeScreen({
        user_code: deviceResult.user_code,
        verification_uri: deviceResult.verification_uri,
        expires_at: expiresAt
      });

      // 자동으로 코드 클립보드에 복사 (자동 입력 실패 대비 폴백)
      await copyToClipboard(deviceResult.user_code);

      // 자동으로 GitHub 인증 페이지 새 탭에서 열기 (content script가 코드 자동 입력)
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
        console.log('[Python 알고리즘] 백그라운드에서 폴링 계속 진행');
      });

      // Step 3: 로그인 완료는 chrome.storage.onChanged(githubToken) /
      //         AUTH_SUCCESS 브로드캐스트로 감지 (별도 폴링 불필요)

    } catch (error) {
      console.error('[Python 알고리즘] OAuth 오류:', error);
      showToast('로그인 실패: ' + error.message, 'error');
      resetLoginUI();
    }
  }

  // 로그아웃 처리 (완전한 상태 초기화)
  async function handleLogout() {
    try {
      // 진행 중인 카운트다운 중지
      stopDeviceCountdown();

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
        currentRepo = '';
        refreshGitHubLinks();

        showToast('로그아웃되었습니다');
      } else {
        showToast('로그아웃 실패: ' + (result.message || '알 수 없는 오류'), 'error');
      }
    } catch (error) {
      console.error('[Python 알고리즘] 로그아웃 오류:', error);
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
        currentRepo = repoFullName;
        refreshGitHubLinks();
        updateCreateRepoEmphasis(true);
        showToast('저장소가 선택되었습니다');
      } else {
        showToast('저장소 선택 실패: ' + result.message);
      }
    } catch (error) {
      console.error('[Python 알고리즘] 저장소 선택 오류:', error);
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
        data: { repoName: 'python-algorithm' }
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
        currentRepo = fullName;
        refreshGitHubLinks();
        updateCreateRepoEmphasis(true);

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
      console.error('[Python 알고리즘] 저장소 생성 오류:', error);
      showToast('저장소 생성 실패');
    } finally {
      createRepoBtn.disabled = false;
      settingsCreateRepoBtn.disabled = false;
      createRepoBtn.textContent = '+ 새 저장소 만들기 (python-algorithm)';
      settingsCreateRepoBtn.textContent = '+ 새 저장소 만들기 (python-algorithm)';
    }
  }

  // 저장소 미선택 시 "저장소 만들기" 버튼 강조
  function updateCreateRepoEmphasis(hasRepo) {
    [createRepoBtn, settingsCreateRepoBtn].forEach(btn => {
      if (!btn) return;
      if (hasRepo) {
        btn.classList.remove('primary');
      } else {
        btn.classList.add('primary');
      }
    });
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
        currentRepo = githubRepo || '';
        refreshGitHubLinks();
        // 저장소 미선택 시 생성 버튼 강조
        updateCreateRepoEmphasis(!!githubRepo);
      }
    } catch (error) {
      console.error('[Python 알고리즘] 저장소 목록 로드 오류:', error);
      // 로딩 실패 시 기본 상태로 복원
      repoSelect.innerHTML = '<option value="">저장소를 선택하세요...</option>';
      settingsRepoSelect.innerHTML = '<option value="">저장소를 선택하세요...</option>';
      updateCreateRepoEmphasis(false);
    }
  }

  // 로그인 상태 UI 표시
  function showLoggedInState(user, repo) {
    // 방어 코드: user 정보가 없으면 리턴
    if (!user || !user.login) {
      console.warn('[Python 알고리즘] showLoggedInState: user 정보 없음, 건너뜀');
      return;
    }

    // 진행 중이던 인증 화면 정리
    stopDeviceCountdown();
    deviceCodeSection.classList.add('hidden');

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
    // 진행 중인 카운트다운 정리
    stopDeviceCountdown();

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

  // 진행률 업데이트 (헤더/진행률 카드/탭 카운트)
  // ⚠️ 삭제된 문제의 유령 id는 getProblemById로 존재 확인 후 제외 → 393 초과 방지
  function updateProgress(progress) {
    const solvedIds = Object.keys(progress).filter(id => progress[id]?.completed);

    let total = 0;          // 실제 존재하는 문제만 카운트
    let progSolved = 0;     // 프로그래머스 메인 (difficulty >= 1)
    let beginnerSolved = 0; // 기초·입문 (difficulty === 0)

    solvedIds.forEach(id => {
      const p = getProblemById(id);
      if (!p) return;       // 유령 id(삭제된 문제) 무시
      total++;
      if (p.difficulty === 0) {
        beginnerSolved++;
      } else {
        progSolved++;
      }
    });

    headerStats.textContent = `${total}/${TOTAL_PROBLEMS}`;
    totalPercent.textContent = `${Math.round((total / TOTAL_PROBLEMS) * 100)}%`;
    progCount.textContent = progSolved;
    beginnerCount.textContent = beginnerSolved;
    progTabCount.textContent = `${progSolved}/${PROBLEM_COUNTS.main}`;
    beginnerTabCount.textContent = `${beginnerSolved}/${PROBLEM_COUNTS.beginner}`;
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
      if (completeDesc) {
        completeDesc.textContent = `${TOTAL_PROBLEMS}개 문제를 모두 해결했습니다`;
      }
      currentNextProblem = null;
      return;
    }

    completeContainer.classList.add('hidden');

    currentNextProblem = unsolved[0];
    const diffInfo = DIFFICULTY_INFO[currentNextProblem.difficulty];

    nextTitle.textContent = `#${currentNextProblem.id} ${currentNextProblem.title}`;
    nextDifficulty.textContent = diffInfo.display;
    nextPlatform.textContent = PLATFORM_NAMES[currentNextProblem.platform] || '프로그래머스';
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

  // ========== 문제 목록 렌더링 (lazy) ==========

  // 문제 목록 초기 구성 - 헤더/그룹만 만들고 항목은 펼칠 때 lazy 렌더
  function renderProblemLists() {
    groups.length = 0;
    renderProgrammersGroups();
    registerBeginnerGroups();
    refreshGroupCounters();
  }

  // 프로그래머스 난이도 그룹 (difficulty >= 1: L1~L5, 레벨7)
  function renderProgrammersGroups() {
    const container = document.getElementById('progDifficultyList');
    container.innerHTML = '';

    const mainProblems = PROBLEMS.filter(p => p.difficulty >= 1);

    // 난이도별 그룹화
    const difficultyGroups = {};
    mainProblems.forEach(p => {
      if (!difficultyGroups[p.difficulty]) {
        difficultyGroups[p.difficulty] = [];
      }
      difficultyGroups[p.difficulty].push(p);
    });

    // 난이도 순서대로 정렬 (1-5, 7)
    const sortedDifficulties = Object.keys(difficultyGroups)
      .map(Number)
      .sort((a, b) => a - b);

    const frag = document.createDocumentFragment();

    sortedDifficulties.forEach(difficulty => {
      const problems = difficultyGroups[difficulty];
      const diffInfo = DIFFICULTY_INFO[difficulty];

      const groupDiv = document.createElement('div');
      groupDiv.className = 'difficulty-group';

      const header = document.createElement('div');
      header.className = 'difficulty-header';
      header.innerHTML = `
        <div class="difficulty-label">
          <span class="difficulty-stars">${diffInfo.display}</span>
          <span class="difficulty-name">${diffInfo.name} ${diffInfo.label}</span>
        </div>
        <div class="difficulty-stats">
          <span class="difficulty-count">0/${problems.length}</span>
          <div class="difficulty-progress">
            <div class="difficulty-progress-fill" style="width: 0%"></div>
          </div>
          <span class="difficulty-arrow">▼</span>
        </div>
      `;

      const listEl = document.createElement('div');
      listEl.className = 'problem-list';

      groupDiv.appendChild(header);
      groupDiv.appendChild(listEl);
      frag.appendChild(groupDiv);

      // 그룹 디스크립터 등록 (lazy 렌더용)
      const group = {
        problems,
        listEl,
        countEl: header.querySelector('.difficulty-count'),
        fillEl: header.querySelector('.difficulty-progress-fill'),
        total: problems.length,
        rendered: false
      };
      groups.push(group);

      // 헤더 클릭 → 접기/펼치기 + 최초 1회 lazy 렌더
      header.addEventListener('click', () => toggleGroup(header, listEl, group));
    });

    // DocumentFragment 배치 삽입
    container.appendChild(frag);
  }

  // 기초·입문 탭 그룹 등록 (HTML에 고정 컨테이너 존재 - lazy 렌더 연결)
  function registerBeginnerGroups() {
    const beginnerTab = document.getElementById('tab-beginner');

    const introProblems = PROBLEMS.filter(p => p.difficulty === 0 && p.category === '코딩테스트입문');
    const trainingProblems = PROBLEMS.filter(p => p.difficulty === 0 && p.category === '코딩기초트레이닝');

    const specs = [
      { category: 'intro', problems: introProblems, listEl: document.getElementById('introProblems'), countEl: document.getElementById('introCount'), fillEl: document.getElementById('introProgressFill') },
      { category: 'training', problems: trainingProblems, listEl: document.getElementById('trainingProblems'), countEl: document.getElementById('trainingCount'), fillEl: document.getElementById('trainingProgressFill') }
    ];

    specs.forEach(spec => {
      spec.listEl.innerHTML = '';
      const group = {
        problems: spec.problems,
        listEl: spec.listEl,
        countEl: spec.countEl,
        fillEl: spec.fillEl,
        total: spec.problems.length,
        rendered: false
      };
      groups.push(group);

      const header = beginnerTab.querySelector(`.difficulty-header[data-category="${spec.category}"]`);
      if (header) {
        header.addEventListener('click', () => toggleGroup(header, spec.listEl, group));
      }
    });
  }

  // 접기/펼치기 + lazy 렌더
  function toggleGroup(header, listEl, group) {
    const expanded = header.classList.toggle('expanded');
    listEl.classList.toggle('show');
    if (expanded) {
      lazyRenderGroup(group);
    }
  }

  // 그룹 문제 항목을 최초 1회만 DOM에 삽입 (DocumentFragment 배치)
  function lazyRenderGroup(group) {
    if (group.rendered) return;

    const frag = document.createDocumentFragment();
    group.problems.forEach(problem => {
      frag.appendChild(createProblemItemEl(problem));
    });
    group.listEl.appendChild(frag);
    group.rendered = true;
  }

  // 문제 항목 DOM 생성 (개별 이벤트 포함)
  function createProblemItemEl(problem) {
    const item = document.createElement('div');
    item.className = 'problem-item';
    item.dataset.id = problem.id;

    const check = document.createElement('div');
    check.className = 'problem-check';
    check.dataset.id = problem.id;

    const num = document.createElement('span');
    num.className = 'problem-num';
    num.textContent = `#${problem.id}`;

    const title = document.createElement('span');
    title.className = 'problem-title';
    title.textContent = problem.title;

    // 푼 문제만 보이는 GitHub 바로가기 (저장소가 연결돼 있을 때)
    const gh = createGitHubLinkEl(problem);

    item.appendChild(check);
    item.appendChild(num);
    item.appendChild(title);
    item.appendChild(gh);

    // 생성 시점의 solved 상태 반영
    applyItemSolvedState(item, check, !!progress[problem.id]?.completed);

    // 체크박스 토글 - 해당 항목 + 카운터만 갱신 (전체 재렌더 X)
    check.addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleProblem(problem, item, check);
    });

    // 문제 페이지 열기 (행 어디를 눌러도 — 체크박스와 GitHub 버튼은 위에서 stopPropagation)
    const openProblem = (e) => {
      e.stopPropagation();
      chrome.tabs.create({ url: getProblemUrl(problem) });
    };
    item.addEventListener('click', openProblem);

    return item;
  }

  // 문제 풀이 파일의 GitHub URL.
  // ref 로 HEAD 를 쓴다 — 학생 저장소의 기본 브랜치가 main 이든 master 이든 GitHub 가 알아서 해석한다.
  function getGitHubFileUrl(problem) {
    if (!currentRepo) return null;
    const encodedPath = getGitHubPath(problem).split('/').map(encodeURIComponent).join('/');
    return `https://github.com/${currentRepo}/blob/HEAD/${encodedPath}`;
  }

  function createGitHubLinkEl(problem) {
    const gh = document.createElement('button');
    gh.type = 'button';
    gh.className = 'problem-github';
    gh.title = 'GitHub에서 내 풀이 코드 보기';
    gh.setAttribute('aria-label', `${problem.title} 풀이 코드를 GitHub에서 보기`);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '15');
    svg.setAttribute('height', '15');
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('fill', 'currentColor');
    p.setAttribute('d', 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z');
    svg.appendChild(p);
    gh.appendChild(svg);

    gh.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = getGitHubFileUrl(problem);
      if (!url) {
        showToast('먼저 GitHub 저장소를 연결해주세요', 'error');
        return;
      }
      chrome.tabs.create({ url });
    });

    return gh;
  }

  // 저장소 연결 상태가 바뀌면 이미 그려진 항목들의 버튼 노출을 갱신한다
  function refreshGitHubLinks() {
    document.body.classList.toggle('has-repo', !!currentRepo);
  }

  // 개별 항목의 solved 표시 상태 적용
  function applyItemSolvedState(item, check, solved) {
    if (solved) {
      item.classList.add('solved');
      check.textContent = '✓';
    } else {
      item.classList.remove('solved');
      check.textContent = '';
    }
  }

  // 개별 문제 토글 (체크박스) - 전체 재렌더 없이 항목/카운터만 갱신
  async function toggleProblem(problem, item, check) {
    const solved = item.classList.contains('solved');

    if (solved) {
      delete progress[problem.id];
      applyItemSolvedState(item, check, false);
    } else {
      progress[problem.id] = { completed: true, completedAt: new Date().toISOString() };
      applyItemSolvedState(item, check, true);
    }

    await chrome.storage.sync.set({ progress });
    updateProgress(progress);
    showNextProblem(progress);
    refreshGroupCounters();
  }

  // 그룹별 카운트/진행바만 갱신 (문제 항목은 재생성하지 않음)
  function refreshGroupCounters() {
    groups.forEach(group => {
      const solved = group.problems.reduce(
        (n, p) => n + (progress[p.id]?.completed ? 1 : 0),
        0
      );
      if (group.countEl) group.countEl.textContent = `${solved}/${group.total}`;
      if (group.fillEl) {
        const percent = group.total ? Math.round((solved / group.total) * 100) : 0;
        group.fillEl.style.width = `${percent}%`;
      }
    });
  }

  // 이미 렌더된(펼쳐진) 항목의 체크 상태를 progress에 맞춰 재동기화
  function refreshRenderedItems() {
    document.querySelectorAll('.problem-item').forEach(item => {
      const check = item.querySelector('.problem-check');
      if (!check) return;
      applyItemSolvedState(item, check, !!progress[item.dataset.id]?.completed);
    });
  }

  // 외부/내부 진행률 변경을 UI에 반영 (전체 재렌더 없이 카운터/항목만 갱신)
  function reconcileProgress(newProgress) {
    progress = newProgress || {};
    updateProgress(progress);
    showNextProblem(progress);
    refreshRenderedItems();
    refreshGroupCounters();
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
