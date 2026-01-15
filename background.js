// Python 코드카타 Background Service Worker
// GitHub OAuth 인증 및 API 호출 처리

// Service Worker에서 외부 스크립트 import
importScripts('problems.js', 'github-api.js', 'oauth.js');

// 전역 에러 핸들러 - Unhandled Promise Rejection 처리
self.addEventListener('unhandledrejection', (event) => {
  console.error('[Background] Unhandled Promise Rejection:', event.reason);
});

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

    case 'POLL_FOR_TOKEN':
      handlePollForToken(message.data)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, message: error.message }));
      return true;

    // 백그라운드 폴링 (팝업과 독립적으로 실행)
    case 'START_POLLING_BACKGROUND':
      // 즉시 응답 반환 - 팝업이 닫혀도 백그라운드는 계속 진행
      sendResponse({ success: true, message: '폴링 시작됨' });

      // 백그라운드에서 독립적으로 폴링 진행
      handlePollForToken(message.data)
        .then(() => {
          console.log('[Background] 토큰 성공적으로 획득 및 저장됨');
          // 토큰은 handlePollForToken에서 자동으로 저장됨
        })
        .catch(error => {
          console.error('[Background] 백그라운드 폴링 실패:', error.message);
        });
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
  return {
    success: true,
    device_code: deviceData.device_code,
    user_code: deviceData.user_code,
    verification_uri: deviceData.verification_uri,
    expires_in: deviceData.expires_in,
    interval: deviceData.interval
  };
}

// 토큰 폴링
async function handlePollForToken(data) {
  const { device_code, interval, expires_in } = data;
  const result = await pollForToken(device_code, interval, expires_in);

  if (result.success) {
    // 사용자 정보 먼저 가져오기 (race condition 방지)
    const userInfo = await getUserInfo(result.access_token);

    // 토큰과 사용자 정보 함께 저장 (원자적 업데이트)
    await chrome.storage.local.set({
      githubToken: result.access_token,
      githubUser: userInfo
    });

    console.log('[Background] 토큰 및 사용자 정보 저장 완료');

    // 모든 열린 팝업에 로그인 성공 브로드캐스트
    broadcastAuthSuccess(userInfo);

    return {
      success: true,
      user: userInfo
    };
  }

  throw new Error('토큰 발급 실패');
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

  const repoName = data?.repoName || 'python-codekata';
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

  // 토큰 유효성 검사
  const isValid = await validateToken(githubToken);

  if (!isValid) {
    // 토큰이 유효하지 않으면 삭제
    await logout();
    return { success: true, authenticated: false };
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
  const { problemId, platform, code } = data;

  // 문제 정보 조회
  const problem = getProblemByProblemId(problemId, platform);
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
  const { problemId, title, platform, difficulty, code } = data;

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

    // 플랫폼별 폴더 경로 설정 (영문 폴더명 사용)
    const platformFolder = platform === 'programmers' ? 'programmers' : 'baekjoon';
    const platformLabel = platform === 'programmers' ? '프로그래머스' : '백준';

    // 파일명 생성 (특수문자 제거)
    const safeTitle = title.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').substring(0, 50);
    const fileName = `${problemId}_${safeTitle}.py`;

    // 경로: programmers/other/문제.py 또는 baekjoon/other/문제.py
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

    // 문제 URL 생성
    const problemUrl = platform === 'programmers'
      ? `https://school.programmers.co.kr/learn/courses/30/lessons/${problemId}`
      : `https://www.acmicpc.net/problem/${problemId}`;

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
});

console.log('[Background] Service Worker 시작됨');
