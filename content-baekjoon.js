// 백준 Content Script (Python 코드카타)
// 제출 플로우: submit 페이지 → status 페이지 → 결과 확인
(function() {
  'use strict';

  console.log('[SPARTA Python] 백준 Content Script 로드됨');

  const STORAGE_KEY = 'sparta_baekjoon_pending';

  // 현재 페이지 타입 확인
  function getPageType() {
    const url = window.location.href;
    if (url.includes('/submit/')) return 'submit';
    if (url.includes('/status')) return 'status';
    if (url.includes('/problem/')) return 'problem';
    return 'unknown';
  }

  // 문제 ID 추출
  function getProblemId() {
    const url = window.location.href;

    // /submit/{id} 또는 /problem/{id}
    const match = url.match(/\/(submit|problem)\/(\d+)/);
    if (match) return match[2];

    // /status 페이지에서 problem_id 파라미터
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('problem_id');
  }

  // 코드 추출 (submit 페이지에서)
  function getCode() {
    // CodeMirror (백준 기본 에디터)
    const cmEl = document.querySelector('.CodeMirror');
    if (cmEl && cmEl.CodeMirror) {
      const code = cmEl.CodeMirror.getValue();
      console.log('[SPARTA Python] CodeMirror 코드 추출:', code?.substring(0, 50));
      return code;
    }

    // Ace Editor
    if (window.ace) {
      const editors = document.querySelectorAll('.ace_editor');
      if (editors.length > 0) {
        const editor = ace.edit(editors[0]);
        if (editor) {
          const code = editor.getValue();
          console.log('[SPARTA Python] Ace 코드 추출:', code?.substring(0, 50));
          return code;
        }
      }
    }

    // textarea 폴백
    const textarea = document.querySelector('textarea#source') ||
                     document.querySelector('textarea[name="source"]') ||
                     document.querySelector('textarea');
    if (textarea) {
      console.log('[SPARTA Python] textarea 코드 추출');
      return textarea.value;
    }

    console.log('[SPARTA Python] 코드 추출 실패!');
    return null;
  }

  // 알림 표시
  function showNotification(message, type = 'success') {
    const existing = document.getElementById('sparta-python-notification');
    if (existing) existing.remove();

    const colors = {
      success: '#10b981',
      error: '#ef4444',
      info: '#3b82f6',
      warning: '#f59e0b'
    };

    const notification = document.createElement('div');
    notification.id = 'sparta-python-notification';
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 14px 24px;
      background: ${colors[type] || colors.info};
      color: white;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;

    const style = document.createElement('style');
    style.textContent = `@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
    document.head.appendChild(style);

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }

  // 제출 코드 임시 저장 (submit 페이지에서)
  async function savePendingSubmission(problemId, code) {
    const data = {
      problemId: problemId,
      code: code,
      timestamp: Date.now()
    };
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
    console.log('[SPARTA Python] 제출 코드 임시 저장:', problemId);
  }

  // 저장된 제출 정보 가져오기
  async function getPendingSubmission() {
    const data = await chrome.storage.local.get([STORAGE_KEY]);
    return data[STORAGE_KEY] || null;
  }

  // 저장된 제출 정보 삭제
  async function clearPendingSubmission() {
    await chrome.storage.local.remove([STORAGE_KEY]);
    console.log('[SPARTA Python] 임시 저장 삭제');
  }

  // GitHub로 푸시
  async function pushToGitHub(problemInfo, code) {
    try {
      console.log('[SPARTA Python] GitHub Push 시작:', problemInfo.title);

      const response = await chrome.runtime.sendMessage({
        type: 'PUSH_TO_GITHUB',
        data: {
          problemId: problemInfo.problemId,
          platform: 'baekjoon',
          code: code
        }
      });

      if (response && response.success) {
        console.log('[SPARTA Python] GitHub Push 성공!');
        showNotification('GitHub에 업로드되었습니다!', 'success');
        return true;
      } else {
        console.error('[SPARTA Python] GitHub Push 실패:', response?.message);
        showNotification('GitHub 업로드 실패: ' + (response?.message || '알 수 없는 오류'), 'error');
        return false;
      }
    } catch (error) {
      console.error('[SPARTA Python] GitHub Push 오류:', error);
      showNotification('GitHub 업로드 오류: ' + error.message, 'error');
      return false;
    }
  }

  // 이미 제출된 문제인지 확인
  async function isAlreadySubmitted(problemId) {
    try {
      const stored = await chrome.storage.sync.get(['progress']);
      const progress = stored.progress || {};
      return progress[problemId]?.completed === true;
    } catch (error) {
      console.error('[SPARTA Python] 진행률 조회 오류:', error);
      return false;
    }
  }

  // GitHub 설정 확인 (OAuth 인증 상태 확인)
  async function checkGitHubSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
      if (response.success && response.authenticated) {
        if (!response.repo) {
          return false;
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('[SPARTA Python] 설정 확인 오류:', error);
      return false;
    }
  }

  // ========== Submit 페이지 로직 ==========
  function initSubmitPage() {
    console.log('[SPARTA Python] Submit 페이지 초기화');

    const problemId = getProblemId();
    if (!problemId) {
      console.log('[SPARTA Python] 문제 ID를 찾을 수 없음');
      return;
    }

    // 문제 정보 확인
    const problemInfo = getProblemByProblemId(problemId, 'baekjoon');
    if (!problemInfo) {
      console.log('[SPARTA Python] 등록되지 않은 백준 문제:', problemId);
      return;
    }

    console.log('[SPARTA Python] 백준 문제 감지:', problemInfo.title);

    // 제출 버튼 감시
    observeSubmitButton(problemId);
  }

  function observeSubmitButton(problemId) {
    const submitBtn = document.querySelector('#submit_button') ||
                      document.querySelector('button[type="submit"]') ||
                      document.querySelector('input[type="submit"]');

    if (submitBtn && !submitBtn.dataset.spartaPythonAttached) {
      submitBtn.dataset.spartaPythonAttached = 'true';
      console.log('[SPARTA Python] 제출 버튼 연결됨');

      submitBtn.addEventListener('click', async () => {
        console.log('[SPARTA Python] 제출 버튼 클릭!');

        const code = getCode();
        if (code) {
          await savePendingSubmission(problemId, code);
        }
      });

      // 폼 제출 이벤트도 감시
      const form = submitBtn.closest('form');
      if (form && !form.dataset.spartaPythonAttached) {
        form.dataset.spartaPythonAttached = 'true';
        form.addEventListener('submit', async () => {
          console.log('[SPARTA Python] 폼 제출 감지!');

          const code = getCode();
          if (code) {
            await savePendingSubmission(problemId, code);
          }
        });
      }
    }
  }

  // ========== Status 페이지 로직 ==========
  async function initStatusPage() {
    console.log('[SPARTA Python] Status 페이지 초기화');

    // 저장된 제출 정보 확인
    const pending = await getPendingSubmission();
    if (!pending) {
      console.log('[SPARTA Python] 대기 중인 제출 없음');
      return;
    }

    // 5분 이상 지난 제출은 무시
    if (Date.now() - pending.timestamp > 5 * 60 * 1000) {
      console.log('[SPARTA Python] 오래된 제출 정보 삭제');
      await clearPendingSubmission();
      return;
    }

    const problemId = pending.problemId;
    const problemInfo = getProblemByProblemId(problemId, 'baekjoon');

    if (!problemInfo) {
      console.log('[SPARTA Python] 등록되지 않은 문제');
      await clearPendingSubmission();
      return;
    }

    // 이미 제출된 문제인지 확인
    if (await isAlreadySubmitted(problemInfo.id)) {
      console.log('[SPARTA Python] 이미 제출 완료된 문제');
      await clearPendingSubmission();
      return;
    }

    console.log('[SPARTA Python] 결과 대기 중:', problemInfo.title);

    // 결과 폴링 시작
    pollForResult(problemInfo, pending.code);
  }

  function pollForResult(problemInfo, code) {
    let attempts = 0;
    const maxAttempts = 60; // 60초 타임아웃

    const checkResult = async () => {
      attempts++;

      const result = detectSubmissionResult(problemInfo.problemId);
      console.log('[SPARTA Python] 결과 확인 중...', attempts, result);

      if (result === 'accepted') {
        console.log('[SPARTA Python] 정답 감지!');

        // 자동 제출 설정 확인
        const { autoSubmitEnabled } = await chrome.storage.sync.get(['autoSubmitEnabled']);
        if (autoSubmitEnabled === false) {
          showNotification('정답입니다!', 'success');
          console.log('[SPARTA Python] GitHub 자동 제출 비활성화됨');
          await clearPendingSubmission();
          return;
        }

        showNotification('정답입니다! GitHub에 업로드 중...', 'success');
        await pushToGitHub(problemInfo, code);
        await clearPendingSubmission();
        return;
      } else if (result === 'rejected') {
        console.log('[SPARTA Python] 오답 감지');
        showNotification('오답입니다. 다시 시도해보세요!', 'error');
        await clearPendingSubmission();
        return;
      } else if (result === 'pending' && attempts < maxAttempts) {
        // 계속 대기
        setTimeout(checkResult, 1000);
      } else if (attempts >= maxAttempts) {
        console.log('[SPARTA Python] 타임아웃');
        await clearPendingSubmission();
      }
    };

    checkResult();
  }

  function detectSubmissionResult(problemId) {
    // 제출 결과 테이블에서 결과 확인
    const table = document.querySelector('#status-table') ||
                  document.querySelector('table.table');

    if (!table) return 'pending';

    // 첫 번째 행 (가장 최근 제출)
    const rows = table.querySelectorAll('tbody tr');

    for (const row of rows) {
      // 문제 번호 확인
      const problemCell = row.querySelector('td:nth-child(3) a') ||
                          row.querySelector('td.problem_title a');

      if (problemCell) {
        const href = problemCell.getAttribute('href') || '';
        if (!href.includes(`/problem/${problemId}`)) continue;
      }

      // 결과 셀 확인
      const resultCell = row.querySelector('td.result') ||
                         row.querySelector('td:nth-child(4)');

      if (!resultCell) continue;

      const resultText = resultCell.textContent || '';
      const resultClass = resultCell.className || '';

      console.log('[SPARTA Python] 결과 텍스트:', resultText, '클래스:', resultClass);

      // 대기 중 / 채점 중
      if (resultText.includes('기다리는 중') ||
          resultText.includes('채점 중') ||
          resultText.includes('채점 준비') ||
          resultClass.includes('wait') ||
          resultClass.includes('judging')) {
        return 'pending';
      }

      // 정답
      if (resultText.includes('맞았습니다') ||
          resultClass.includes('ac') ||
          resultClass.includes('accepted')) {
        return 'accepted';
      }

      // 오답 (다양한 종류)
      if (resultText.includes('틀렸습니다') ||
          resultText.includes('시간 초과') ||
          resultText.includes('메모리 초과') ||
          resultText.includes('출력 초과') ||
          resultText.includes('런타임 에러') ||
          resultText.includes('컴파일 에러') ||
          resultClass.includes('wa') ||
          resultClass.includes('wrong') ||
          resultClass.includes('tle') ||
          resultClass.includes('mle') ||
          resultClass.includes('rte') ||
          resultClass.includes('ce')) {
        return 'rejected';
      }
    }

    return 'pending';
  }

  // ========== Problem 페이지 로직 ==========
  function initProblemPage() {
    console.log('[SPARTA Python] Problem 페이지 초기화');

    const problemId = getProblemId();
    if (!problemId) return;

    const problemInfo = getProblemByProblemId(problemId, 'baekjoon');
    if (problemInfo) {
      console.log('[SPARTA Python] 코드카타 문제:', problemInfo.title);
    }
  }

  // ========== 초기화 ==========
  async function init() {
    console.log('[SPARTA Python] 백준 초기화 시작');

    const settingsOk = await checkGitHubSettings();
    if (!settingsOk) {
      console.log('[SPARTA Python] GitHub 설정 미완료');
      // 설정이 없어도 일단 동작은 하도록 함
    }

    const pageType = getPageType();
    console.log('[SPARTA Python] 페이지 타입:', pageType);

    switch (pageType) {
      case 'submit':
        initSubmitPage();
        // 버튼이 동적으로 로드될 수 있으므로 주기적 확인
        setInterval(() => {
          const problemId = getProblemId();
          if (problemId) observeSubmitButton(problemId);
        }, 2000);
        break;

      case 'status':
        initStatusPage();
        break;

      case 'problem':
        initProblemPage();
        break;
    }
  }

  // 페이지 로드 완료 후 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
