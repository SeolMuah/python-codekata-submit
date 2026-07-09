// GitHub OAuth Device Flow 모듈
// Chrome Extension에서 백엔드 없이 OAuth 인증 구현

// GitHub OAuth App Client ID (사용자가 생성 후 입력)
const GITHUB_CLIENT_ID = 'Ov23liDBpBLRDTiNHEyy';

// GitHub Device Flow URLs
const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_REPOS_URL = 'https://api.github.com/user/repos';

// 유틸리티: sleep 함수
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 유틸리티: 타임아웃이 있는 fetch 래퍼
async function fetchWithTimeout(url, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('요청 시간이 초과되었습니다. 네트워크 연결을 확인해주세요.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// 1. Device Code 요청
async function requestDeviceCode() {
  const response = await fetchWithTimeout(GITHUB_DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      // public_repo: 공개 저장소 읽기/쓰기, read:user: 프로필 조회
      // (기존 'repo user'에서 축소 — private 저장소 접근 불가)
      scope: 'public_repo read:user'
    })
  }, 15000);  // 15초 타임아웃

  if (!response.ok) {
    throw new Error('Device Code 요청 실패');
  }

  const data = await response.json();
  // 보안: device_code 는 bearer 시크릿이므로 로깅 금지 (CLAUDE.md: 콘솔에 토큰 출력 금지).
  // 비밀이 아닌 만료 시간만 남긴다.
  console.log('[OAuth] Device Code 발급됨, 만료(s):', data.expires_in);

  // 응답 형식:
  // {
  //   device_code: "...",
  //   user_code: "XXXX-XXXX",
  //   verification_uri: "https://github.com/login/device",
  //   expires_in: 900,
  //   interval: 5
  // }

  return data;
}

// 2. 토큰 교환 1회 시도.
//
// ⚠️ 절대 여기서 while + sleep 으로 오래 기다리지 마라.
// MV3 서비스 워커는 유휴 30초쯤에 종료된다. 긴 폴링 루프는 사용자가 GitHub에서
// Authorize 를 누르기 전에 조용히 죽어버려서 "인증했는데 반응이 없는" 증상이 된다.
// 반복은 background.js 가 chrome.alarms 로 돌린다.
//
// 반환: { status: 'success' | 'pending' | 'slow_down' | 'expired' | 'denied' | 'error' | 'network' }
async function requestTokenOnce(deviceCode) {
  let data;
  try {
    const response = await fetchWithTimeout(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    }, 15000);
    data = await response.json();
  } catch (error) {
    // 네트워크 실패는 실패로 확정하지 않는다. 다음 알람에서 다시 시도한다.
    console.warn('[OAuth] 토큰 요청 네트워크 오류:', error.message);
    return { status: 'network' };
  }

  // 보안: 응답에는 성공 시 access_token 이 들어 있으므로 원본을 로깅하지 않는다.
  console.log('[OAuth] 토큰 응답:', data.error || 'access_token received');

  if (data.access_token) {
    return { status: 'success', access_token: data.access_token, scope: data.scope };
  }
  if (data.error === 'authorization_pending') return { status: 'pending' };
  if (data.error === 'slow_down') return { status: 'slow_down' };
  if (data.error === 'expired_token') return { status: 'expired' };
  if (data.error === 'access_denied') return { status: 'denied' };

  return { status: 'error', message: data.error_description || data.error || '알 수 없는 오류' };
}

// 3. 사용자 정보 가져오기
async function getUserInfo(token) {
  const response = await fetchWithTimeout(GITHUB_USER_URL, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  }, 15000);  // 15초 타임아웃

  if (!response.ok) {
    throw new Error('사용자 정보 조회 실패');
  }

  const data = await response.json();
  return {
    login: data.login,
    name: data.name || data.login,
    avatar_url: data.avatar_url,
    html_url: data.html_url
  };
}

// 4. 사용자 저장소 목록 가져오기
async function getUserRepos(token) {
  // 캐시 무효화를 위한 타임스탬프 추가
  // visibility=public: 스코프가 public_repo로 축소됨에 따라 공개 저장소만 조회
  const timestamp = Date.now();
  const response = await fetchWithTimeout(`${GITHUB_REPOS_URL}?per_page=100&sort=updated&visibility=public&_t=${timestamp}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    }
  }, 20000);  // 20초 타임아웃 (목록이 많을 수 있음)

  if (!response.ok) {
    throw new Error('저장소 목록 조회 실패');
  }

  const repos = await response.json();
  return repos.map(repo => ({
    name: repo.name,
    full_name: repo.full_name,
    html_url: repo.html_url,
    private: repo.private,
    description: repo.description
  }));
}

// 5. 새 저장소 생성
async function createRepo(token, repoName = 'python-algorithm') {
  const response = await fetchWithTimeout(GITHUB_REPOS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: repoName,
      description: 'Python 알고리즘 풀이 저장소',
      private: false,
      auto_init: true,
      has_issues: false,
      has_projects: false,
      has_wiki: false
    })
  }, 20000);  // 20초 타임아웃

  if (!response.ok) {
    const error = await response.json();
    if (response.status === 422 && error.errors?.[0]?.message?.includes('already exists')) {
      throw new Error('이미 같은 이름의 저장소가 존재합니다');
    }
    throw new Error(error.message || '저장소 생성 실패');
  }

  const repo = await response.json();
  return {
    name: repo.name,
    full_name: repo.full_name,
    html_url: repo.html_url
  };
}

// 6. 토큰 유효성 검사
// 반환값: true (유효), false (인증 실패/토큰 무효), null (네트워크 오류로 판단 불가)
async function validateToken(token) {
  try {
    const response = await fetchWithTimeout(GITHUB_USER_URL, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json'
      }
    }, 10000);  // 10초 타임아웃

    if (response.ok) return true;
    // 401/403은 명확한 인증 실패
    if (response.status === 401 || response.status === 403) return false;
    // 기타 서버 오류(500 등)는 네트워크 문제로 간주
    return null;
  } catch {
    // fetch 실패 (네트워크 끊김, 타임아웃 등) → 판단 불가
    return null;
  }
}

// 7. 로그아웃 (토큰 삭제)
async function logout() {
  // 진행 중 device flow 상태도 함께 삭제
  await chrome.storage.local.remove(['githubToken', 'githubUser', 'pendingDeviceAuth']);
  await chrome.storage.sync.remove(['githubRepo']);
  console.log('[OAuth] 로그아웃 완료');
}

// Client ID 유효성 확인
function isClientIdConfigured() {
  return GITHUB_CLIENT_ID && GITHUB_CLIENT_ID !== 'YOUR_CLIENT_ID';
}
