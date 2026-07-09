// Python 알고리즘 Background Service Worker
// GitHub OAuth 인증 및 API 호출 처리

// Service Worker에서 외부 스크립트 import
importScripts('problems.js', 'github-api.js', 'oauth.js');

// 전역 에러 핸들러 - Unhandled Promise Rejection 처리
self.addEventListener('unhandledrejection', (event) => {
  console.error('[Background] Unhandled Promise Rejection:', event.reason);
});

// 툴바 아이콘을 누르면 팝업 대신 오른쪽 사이드 패널이 열리도록 한다.
// (manifest 에 action.default_popup 이 없어야 이 동작이 적용된다)
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('[Background] 사이드 패널 설정 실패:', error));
}

// 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] 메시지 수신:', message.type);

  switch (message.type) {
    // OAuth 관련 메시지
    case 'START_DEVICE_FLOW':
      handleStartDeviceFlow()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, message: error.message }));
      return true;

    // 백그라운드 폴링 시작 (알람 기반이라 서비스 워커가 죽어도 이어진다)
    case 'START_POLLING_BACKGROUND':
      sendResponse({ success: true, message: '폴링 시작됨' });
      startDeviceAuthPolling();
      return true;

    // GitHub 인증 성공 화면에 도달했다 → 30초 알람을 기다리지 않고 즉시 확인
    case 'DEVICE_AUTH_COMPLETED':
      sendResponse({ success: true });
      pollDeviceAuthOnce('github-success-page');
      return true;

    // 팝업/사이드패널이 열릴 때 진행 중인 인증을 즉시 확인 + 폴링 되살리기
    case 'POLL_DEVICE_AUTH_NOW':
      sendResponse({ success: true });
      resumeDeviceAuthIfPending();
      return true;

    case 'GET_USER_INFO':
      handleGetUserInfo()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, message: error.message }));
      return true;

    case 'GET_USER_REPOS':
      handleGetUserRepos()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, message: error.message }));
      return true;

    case 'CREATE_REPO':
      handleCreateRepo(message.data)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, message: error.message }));
      return true;

    case 'SELECT_REPO':
      handleSelectRepo(message.data)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, message: error.message }));
      return true;

    case 'LOGOUT':
      handleLogout()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, message: error.message }));
      return true;

    case 'CHECK_AUTH':
      handleCheckAuth()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, message: error.message }));
      return true;

    // 기존 메시지
    case 'PUSH_TO_GITHUB':
      handlePushToGitHub(message.data)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, message: error.message }));
      return true;

    // 동적 문제 (미등록 문제) 푸시
    case 'PUSH_DYNAMIC_PROBLEM':
      handlePushDynamicProblem(message.data)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, message: error.message }));
      return true;

    case 'GET_SETTINGS':
      handleGetSettings()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, message: error.message }));
      return true;

    case 'SAVE_SETTINGS':
      handleSaveSettings(message.data)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, message: error.message }));
      return true;

    default:
      sendResponse({ success: false, message: '알 수 없는 메시지 타입' });
      return false;
  }
});

// ========== OAuth 핸들러 함수 ==========

// Device Flow 시작
async function handleStartDeviceFlow() {
  if (!isClientIdConfigured()) {
    throw new Error('GitHub Client ID가 설정되지 않았습니다. oauth.js에서 GITHUB_CLIENT_ID를 설정해주세요.');
  }
  const deviceData = await requestDeviceCode();

  // 진행 중 device flow 상태 저장 (content-github-device.js가 코드 자동 입력에 사용)
  await chrome.storage.local.set({
    pendingDeviceAuth: {
      user_code: deviceData.user_code,
      device_code: deviceData.device_code,
      verification_uri: deviceData.verification_uri,
      expires_at: Date.now() + deviceData.expires_in * 1000,
      interval: deviceData.interval
    }
  });

  return {
    success: true,
    device_code: deviceData.device_code,
    user_code: deviceData.user_code,
    verification_uri: deviceData.verification_uri,
    expires_in: deviceData.expires_in,
    interval: deviceData.interval
  };
}

// ========== Device Flow 토큰 폴링 (chrome.alarms 기반) ==========
//
// ⚠️ MV3 서비스 워커는 유휴 30초쯤에 종료된다.
// 예전처럼 while + sleep 루프로 폴링하면, 사용자가 GitHub에서 Authorize 를 누르기 전에
// 워커가 죽어버려 "인증은 했는데 익스텐션이 계속 대기 중" 상태가 된다.
// (빨리 누르면 되고 늦게 누르면 안 되는, 재현이 들쭉날쭉한 그 증상)
//
// 그래서 상태는 chrome.storage.local 의 pendingDeviceAuth 에만 두고,
// 반복은 워커를 되살려주는 chrome.alarms 가 돌린다.
// 추가로 GitHub 인증 성공 화면에 도달하면 content script 가 즉시 1회 폴링을 요청해
// 30초를 기다리지 않고 곧바로 로그인이 완료되게 한다.

const DEVICE_POLL_ALARM = 'pyalgo-device-poll';
const DEVICE_POLL_PERIOD_MIN = 0.5; // chrome.alarms 최소 주기 = 30초

let devicePollInFlight = false;

async function startDeviceAuthPolling() {
  await chrome.alarms.create(DEVICE_POLL_ALARM, {
    periodInMinutes: DEVICE_POLL_PERIOD_MIN,
    delayInMinutes: DEVICE_POLL_PERIOD_MIN
  });
  // 알람을 기다리지 않고 즉시 1회 시도 (이미 인증을 마쳤을 수 있다)
  await pollDeviceAuthOnce('start');
}

async function stopDeviceAuthPolling() {
  await chrome.alarms.clear(DEVICE_POLL_ALARM);
}

async function completeDeviceAuth(accessToken) {
  // 사용자 정보를 먼저 가져온 뒤 토큰과 함께 저장 (팝업이 반쪽 상태를 보지 않도록)
  const userInfo = await getUserInfo(accessToken);
  await chrome.storage.local.set({ githubToken: accessToken, githubUser: userInfo });
  await chrome.storage.local.remove(['pendingDeviceAuth']);
  await stopDeviceAuthPolling();

  console.log('[Background] 토큰 및 사용자 정보 저장 완료');

  await ensureRepoAfterLogin(accessToken);
  broadcastAuthSuccess(userInfo);
}

async function failDeviceAuth(message) {
  await chrome.storage.local.remove(['pendingDeviceAuth']);
  await stopDeviceAuthPolling();
  console.warn('[Background] Device Flow 실패:', message);

  chrome.runtime.sendMessage({ type: 'AUTH_FAILED', message }).catch(() => {
    // 열린 팝업이 없으면 무시 (정상)
  });
}

async function pollDeviceAuthOnce(reason) {
  if (devicePollInFlight) {
    return;
  }
  devicePollInFlight = true;

  try {
    const { pendingDeviceAuth } = await chrome.storage.local.get('pendingDeviceAuth');

    if (!pendingDeviceAuth || !pendingDeviceAuth.device_code) {
      await stopDeviceAuthPolling();
      return;
    }

    // 이미 로그인이 끝났으면 정리만 한다 (중복 폴링 방지)
    const { githubToken } = await chrome.storage.local.get('githubToken');
    if (githubToken) {
      await chrome.storage.local.remove(['pendingDeviceAuth']);
      await stopDeviceAuthPolling();
      return;
    }

    if (typeof pendingDeviceAuth.expires_at === 'number' && Date.now() > pendingDeviceAuth.expires_at) {
      await failDeviceAuth('인증 시간이 만료되었습니다. 다시 시도해주세요.');
      return;
    }

    console.log('[Background] Device Flow 폴링 (' + reason + ')');
    const result = await requestTokenOnce(pendingDeviceAuth.device_code);

    switch (result.status) {
      case 'success':
        await completeDeviceAuth(result.access_token);
        break;
      case 'pending':
      case 'slow_down':
      case 'network':
        // 계속 기다린다. 다음 알람에서 재시도.
        break;
      case 'expired':
        await failDeviceAuth('인증 시간이 만료되었습니다. 다시 시도해주세요.');
        break;
      case 'denied':
        await failDeviceAuth('GitHub 권한 요청이 거부되었습니다.');
        break;
      default:
        await failDeviceAuth(result.message || '인증에 실패했습니다.');
    }
  } catch (error) {
    // 예기치 못한 오류로 pendingDeviceAuth 를 지워버리면 사용자가 다시 로그인해야 한다.
    // 알람이 살아 있으므로 다음 주기에 재시도한다.
    console.error('[Background] Device Flow 폴링 오류:', error.message);
  } finally {
    devicePollInFlight = false;
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DEVICE_POLL_ALARM) {
    pollDeviceAuthOnce('alarm');
  }
});

// 워커가 죽었다 살아나도 진행 중이던 인증을 이어간다
async function resumeDeviceAuthIfPending() {
  const { pendingDeviceAuth } = await chrome.storage.local.get('pendingDeviceAuth');
  if (!pendingDeviceAuth) return;

  if (typeof pendingDeviceAuth.expires_at === 'number' && Date.now() > pendingDeviceAuth.expires_at) {
    await failDeviceAuth('인증 시간이 만료되었습니다. 다시 시도해주세요.');
    return;
  }
  console.log('[Background] 진행 중이던 Device Flow 폴링 재개');
  await startDeviceAuthPolling();
}

chrome.runtime.onStartup.addListener(() => { resumeDeviceAuthIfPending(); });

// 로그인 직후 저장소 자동 설정
// githubRepo가 비어 있고 사용자 저장소 중 이름이 정확히 'python-algorithm'인 것이 있으면 자동 선택.
// 없으면 아무것도 자동 생성하지 않는다 (사용자 동의 없는 저장소 생성 금지).
async function ensureRepoAfterLogin(token) {
  try {
    const { githubRepo } = await chrome.storage.sync.get(['githubRepo']);
    if (githubRepo) {
      return; // 이미 저장소가 선택되어 있음
    }

    const repos = await getUserRepos(token);
    const match = repos.find(repo => repo.name === 'python-algorithm');
    if (match) {
      await chrome.storage.sync.set({ githubRepo: match.full_name });
      console.log('[Background] 저장소 자동 선택:', match.full_name);
    }
  } catch (error) {
    // 저장소 자동 설정 실패는 로그인 자체를 막지 않는다
    console.error('[Background] 저장소 자동 설정 실패:', error.message);
  }
}

// 인증 성공 브로드캐스트 - 열린 팝업에 알림
function broadcastAuthSuccess(user) {
  chrome.runtime.sendMessage({
    type: 'AUTH_SUCCESS',
    user: user
  }).catch(() => {
    // 팝업이 닫혀있으면 에러 무시 - 정상 동작
    console.log('[Background] 브로드캐스트: 열린 팝업 없음 (정상)');
  });
}

// 사용자 정보 조회
async function handleGetUserInfo() {
  const { githubToken, githubUser } = await chrome.storage.local.get(['githubToken', 'githubUser']);

  if (!githubToken) {
    return { success: false, message: '로그인이 필요합니다' };
  }

  // 캐시된 사용자 정보가 있으면 반환
  if (githubUser) {
    return { success: true, user: githubUser };
  }

  // 없으면 API 호출
  const userInfo = await getUserInfo(githubToken);
  await chrome.storage.local.set({ githubUser: userInfo });

  return { success: true, user: userInfo };
}

// 저장소 목록 조회
async function handleGetUserRepos() {
  const { githubToken } = await chrome.storage.local.get(['githubToken']);

  if (!githubToken) {
    return { success: false, message: '로그인이 필요합니다' };
  }

  const repos = await getUserRepos(githubToken);
  return { success: true, repos };
}

// 저장소 생성
async function handleCreateRepo(data) {
  const { githubToken } = await chrome.storage.local.get(['githubToken']);

  if (!githubToken) {
    return { success: false, message: '로그인이 필요합니다' };
  }

  const repoName = data?.repoName || 'python-algorithm';
  const repo = await createRepo(githubToken, repoName);

  // 생성된 저장소 자동 선택
  await chrome.storage.sync.set({ githubRepo: repo.full_name });

  return { success: true, repo };
}

// 저장소 선택
async function handleSelectRepo(data) {
  const { repoFullName } = data;

  if (!repoFullName) {
    return { success: false, message: '저장소를 선택해주세요' };
  }

  await chrome.storage.sync.set({ githubRepo: repoFullName });
  return { success: true, message: '저장소가 선택되었습니다' };
}

// 로그아웃
async function handleLogout() {
  await stopDeviceAuthPolling();
  await logout();
  return { success: true, message: '로그아웃되었습니다' };
}

// 인증 상태 확인
async function handleCheckAuth() {
  const { githubToken, githubUser } = await chrome.storage.local.get(['githubToken', 'githubUser']);
  const { githubRepo } = await chrome.storage.sync.get(['githubRepo']);

  if (!githubToken) {
    return { success: true, authenticated: false };
  }

  // 토큰 유효성 검사 (true: 유효, false: 무효, null: 네트워크 오류)
  const isValid = await validateToken(githubToken);

  if (isValid === false) {
    // 토큰이 명확히 무효 (401/403) → 삭제
    await logout();
    return { success: true, authenticated: false };
  }

  // isValid === null (네트워크 오류) → 기존 토큰 유지, 캐시된 정보 사용
  if (isValid === null) {
    console.log('[Background] 네트워크 오류로 토큰 검증 불가, 기존 토큰 유지');
  }

  return {
    success: true,
    authenticated: true,
    user: githubUser,
    repo: githubRepo
  };
}

// ========== GitHub Push 핸들러 ==========

// GitHub Push 처리
async function handlePushToGitHub(data) {
  const { problemId, code } = data;

  // 문제 정보 조회
  const problem = getProblemByProblemId(problemId);
  if (!problem) {
    return { success: false, message: '문제 정보를 찾을 수 없습니다' };
  }

  // OAuth 토큰 및 설정 불러오기
  const { githubToken } = await chrome.storage.local.get(['githubToken']);
  const { githubRepo, studentName } = await chrome.storage.sync.get(['githubRepo', 'studentName']);

  if (!githubToken) {
    return { success: false, message: 'GitHub 로그인이 필요합니다' };
  }

  if (!githubRepo) {
    return { success: false, message: '저장소를 선택해주세요' };
  }

  try {
    // GitHub API 인스턴스 생성 (OAuth 토큰 사용)
    const api = createGitHubAPI(githubToken, githubRepo);

    // 코드 업로드
    const result = await api.pushSolution(problem, code, studentName || '학생');

    // 성공 시 진행률 업데이트 (재시도 로직 포함)
    if (result.success) {
      try {
        await updateProgress(problem.id);
        console.log(`[Background] 진행률 저장 완료: ${problem.id}`);
      } catch (progressError) {
        console.error('[Background] 진행률 저장 실패, 재시도:', progressError);
        // 1회 재시도
        try {
          await new Promise(r => setTimeout(r, 500));
          await updateProgress(problem.id);
          console.log(`[Background] 진행률 저장 재시도 성공: ${problem.id}`);
        } catch (retryError) {
          console.error('[Background] 진행률 저장 재시도 실패:', retryError);
          return {
            ...result,
            warning: '코드는 업로드되었으나 진행률 저장에 실패했습니다. 새로고침 후 확인해주세요.'
          };
        }
      }
    }

    return result;
  } catch (error) {
    console.error('[Background] GitHub Push 오류:', error);
    return { success: false, message: error.message };
  }
}

// 동적 문제 (미등록 문제) GitHub Push 처리
async function handlePushDynamicProblem(data) {
  const { problemId, title, difficulty, code } = data;

  // OAuth 토큰 및 설정 불러오기
  const { githubToken } = await chrome.storage.local.get(['githubToken']);
  const { githubRepo, studentName } = await chrome.storage.sync.get(['githubRepo', 'studentName']);

  if (!githubToken) {
    return { success: false, message: 'GitHub 로그인이 필요합니다' };
  }

  if (!githubRepo) {
    return { success: false, message: '저장소를 선택해주세요' };
  }

  try {
    // GitHub API 인스턴스 생성 (OAuth 토큰 사용)
    const api = createGitHubAPI(githubToken, githubRepo);

    // 폴더 경로 설정 (프로그래머스 전용, 영문 폴더명 사용)
    const platformFolder = 'programmers';
    const platformLabel = '프로그래머스';

    // 파일명 생성 (파일시스템 + URL 위험 문자 제거)
    const safeTitle = title
      .replace(/[<>:"/\\|?*#%]/g, '')
      .replace(/[\x00-\x1f]/g, '')
      .replace(/\s+/g, '_')
      .replace(/^[._]+|[._]+$/g, '')
      .substring(0, 50) || `문제_${problemId}`;
    const fileName = `${problemId}_${safeTitle}.py`;

    // 경로: programmers/other/문제.py
    const filePath = `${platformFolder}/other/${fileName}`;

    // 날짜와 시간 포맷 (한국 시간) - 기존 문제와 동일한 형식
    const now = new Date();
    const dateTime = now.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    // 문제 URL 생성 (프로그래머스 전용)
    const problemUrl = `https://school.programmers.co.kr/learn/courses/30/lessons/${problemId}`;

    // 커밋 메시지 생성
    const commitMessage = `[${platformLabel}] ${title} 풀이 제출\n\n- 문제 ID: ${problemId}\n- 난이도: ${difficulty || 'unknown'}\n- 제출일: ${dateTime}\n- 작성자: ${studentName || '학생'}`;

    // 코드에 헤더 추가 (기존 문제와 동일한 형식)
    const codeWithHeader = `# ${title}
# ${platformLabel} (${difficulty || 'unknown'})
# 문제 링크: ${problemUrl}
# 작성자: ${studentName || '학생'}
# 작성일: ${dateTime}

${code}`;

    // GitHub에 푸시
    const result = await api.pushFile(filePath, codeWithHeader, commitMessage);

    if (result.success) {
      console.log(`[Background] 동적 문제 업로드 성공: ${filePath}`);
    }

    return result;
  } catch (error) {
    console.error('[Background] 동적 문제 GitHub Push 오류:', error);
    return { success: false, message: error.message };
  }
}

// 설정 불러오기 처리
async function handleGetSettings() {
  const syncData = await chrome.storage.sync.get(['studentName', 'progress']);
  return {
    success: true,
    data: {
      studentName: syncData.studentName || '',
      progress: syncData.progress || {}
    }
  };
}

// 설정 저장 처리
async function handleSaveSettings(data) {
  try {
    const syncData = {};
    if (data.studentName !== undefined) syncData.studentName = data.studentName;

    if (Object.keys(syncData).length > 0) {
      await chrome.storage.sync.set(syncData);
    }

    return { success: true, message: '설정이 저장되었습니다' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// 진행률 업데이트 (쓰기 검증 및 브로드캐스트 포함)
async function updateProgress(problemId) {
  const syncData = await chrome.storage.sync.get(['progress']);
  const progress = syncData.progress || {};

  progress[problemId] = {
    completed: true,
    completedAt: new Date().toISOString()
  };

  await chrome.storage.sync.set({ progress });

  // 쓰기 검증
  const verification = await chrome.storage.sync.get(['progress']);
  if (!verification.progress?.[problemId]?.completed) {
    throw new Error(`진행률 저장 검증 실패: ${problemId}`);
  }

  console.log(`[Background] 진행률 업데이트 및 검증 완료: 문제 #${problemId}`);

  // 팝업에 진행률 업데이트 알림 브로드캐스트
  chrome.runtime.sendMessage({
    type: 'PROGRESS_UPDATED',
    problemId: problemId
  }).catch(() => {
    // 팝업이 닫혀있으면 무시 - 정상 동작
  });
}

// 진행률 토글 (팝업에서 사용)
async function toggleProgress(problemId, completed) {
  const syncData = await chrome.storage.sync.get(['progress']);
  const progress = syncData.progress || {};

  if (completed) {
    progress[problemId] = {
      completed: true,
      completedAt: new Date().toISOString()
    };
  } else {
    delete progress[problemId];
  }

  await chrome.storage.sync.set({ progress });
  return progress;
}

// 확장 프로그램 설치/업데이트 시
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Background] 확장 프로그램 설치/업데이트:', details.reason);

  if (details.reason === 'install') {
    // 초기 설정
    chrome.storage.sync.set({
      progress: {},
      studentName: ''
    });
  }

  // 업데이트/재로드로 워커가 새로 떴을 때 진행 중이던 인증을 이어간다
  resumeDeviceAuthIfPending();
});

// 워커가 종료됐다가 어떤 이벤트로든 되살아났을 때도 인증을 이어간다.
// (onStartup 은 브라우저 시작 때만 불린다)
resumeDeviceAuthIfPending();

console.log('[Background] Service Worker 시작됨');
