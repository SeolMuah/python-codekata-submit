// 프로그래머스 Content Script (Python 코드카타)
(function() {
  'use strict';

  console.log('[SPARTA Python] 프로그래머스 Content Script 로드됨');

  let isWaitingForResult = false;
  let hasProcessedResult = false;
  let checkResultInterval = null;

  // 문제 ID 추출 (URL에서)
  function getProblemId() {
    const url = window.location.href;
    const match = url.match(/lessons\/(\d+)/);
    return match ? match[1] : null;
  }

  // 코드 추출
  function getCode() {
    // Monaco Editor (프로그래머스에서 주로 사용)
    if (window.monaco && window.monaco.editor) {
      const editors = window.monaco.editor.getEditors();
      if (editors && editors.length > 0) {
        const code = editors[0].getValue();
        console.log('[SPARTA Python] Monaco 코드 추출:', code?.substring(0, 50));
        return code;
      }
    }

    // CodeMirror 폴백
    const cmEl = document.querySelector('.CodeMirror');
    if (cmEl && cmEl.CodeMirror) {
      const code = cmEl.CodeMirror.getValue();
      console.log('[SPARTA Python] CodeMirror 코드 추출:', code?.substring(0, 50));
      return code;
    }

    // textarea 폴백
    const textarea = document.querySelector('textarea.editor') ||
                     document.querySelector('textarea[name="code"]') ||
                     document.querySelector('.editor textarea');
    if (textarea) {
      console.log('[SPARTA Python] textarea 코드 추출');
      return textarea.value;
    }

    console.log('[SPARTA Python] 코드 추출 실패!');
    return null;
  }

  // 정답 여부 감지
  function detectResult() {
    // 1. 모달 다이얼로그 확인 (프로그래머스 채점 결과는 모달로 표시)
    const modal = document.querySelector('[role="dialog"]') ||
                  document.querySelector('.modal') ||
                  document.querySelector('[class*="Modal"]');

    if (modal) {
      const modalText = modal.textContent || '';
      console.log('[SPARTA Python] 모달 감지:', modalText.substring(0, 100));

      if (modalText.includes('정답입니다')) {
        console.log('[SPARTA Python] 정답 모달 감지!');
        return true;
      }

      if (modalText.includes('틀렸습니다')) {
        console.log('[SPARTA Python] 오답 모달 감지!');
        return false;
      }
    }

    // 2. 결과 영역에서 확인
    const resultArea = document.querySelector('#output') ||
                       document.querySelector('.console-output') ||
                       document.querySelector('[class*="result"]');

    if (!resultArea) return null;

    const text = resultArea.textContent || '';
    console.log('[SPARTA Python] 결과 텍스트:', text.substring(0, 200));

    // 채점 중인 경우
    if (text.includes('채점 중') || text.includes('채점을 시작') || text.includes('실행 중')) {
      if (text.includes('오류') || text.includes('error') || text.includes('Error')) {
        console.log('[SPARTA Python] 오류 감지');
        return false;
      }
      console.log('[SPARTA Python] 아직 채점 중...');
      return null;
    }

    // 기본 메시지인 경우
    if (text.includes('실행 결과가 여기에 표시됩니다') || text.trim() === '') {
      return null;
    }

    // 오류 체크
    if (text.includes('오류가 발생') ||
        text.includes('런타임 에러') ||
        text.includes('시간 초과') ||
        text.includes('메모리 초과')) {
      console.log('[SPARTA Python] 오류 감지');
      return false;
    }

    // 정답 패턴
    if (text.includes('정답입니다') ||
        text.includes('테스트를 통과') ||
        text.includes('통과 (') ||
        text.includes('Pass') ||
        text.includes('맞았습니다') ||
        text.includes('100.0') ||
        /테스트 \d+.*통과/.test(text) ||
        /정확성.*100/.test(text)) {
      console.log('[SPARTA Python] 정답 감지!');
      return true;
    }

    // 오답 패턴
    if (text.includes('실패') ||
        text.includes('오답') ||
        text.includes('Fail') ||
        text.includes('틀렸') ||
        text.includes('실패 (') ||
        text.includes('0.0')) {
      console.log('[SPARTA Python] 오답 감지');
      return false;
    }

    // 테스트 결과 개수로 판별
    const passMatch = text.match(/(\d+)개 성공/);
    const failMatch = text.match(/(\d+)개 실패/);
    if (passMatch || failMatch) {
      const failCount = failMatch ? parseInt(failMatch[1]) : 0;
      return failCount === 0;
    }

    // 점수 영역 확인
    const scoreResult = checkScoreArea();
    if (scoreResult !== null) return scoreResult;

    return null;
  }

  // 점수 영역 확인
  function checkScoreArea() {
    const modal = document.querySelector('.modal-content') ||
                  document.querySelector('[class*="result-modal"]');

    if (modal) {
      const modalText = modal.textContent || '';
      if (modalText.includes('정답') || modalText.includes('100') || modalText.includes('통과')) {
        return true;
      } else if (modalText.includes('실패') || modalText.includes('오답')) {
        return false;
      }
    }

    const scoreEl = document.querySelector('.score') ||
                    document.querySelector('[class*="score"]');

    if (scoreEl) {
      const scoreText = scoreEl.textContent || '';
      const scoreMatch = scoreText.match(/(\d+(?:\.\d+)?)/);
      if (scoreMatch) {
        const score = parseFloat(scoreMatch[1]);
        if (score === 100) return true;
        if (score === 0) return false;
      }
    }

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

  // GitHub로 푸시
  async function pushToGitHub(problemInfo, code) {
    try {
      console.log('[SPARTA Python] GitHub Push 시작:', problemInfo.title);

      const response = await chrome.runtime.sendMessage({
        type: 'PUSH_TO_GITHUB',
        data: {
          problemId: problemInfo.problemId,
          platform: 'programmers',
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
      if (error.message && error.message.includes('Extension context invalidated')) {
        showNotification('익스텐션이 업데이트되었습니다. 페이지를 새로고침해주세요!', 'error');
      } else {
        showNotification('GitHub 업로드 오류: ' + error.message, 'error');
      }
      return false;
    }
  }

  // 제출 처리 (한 번만 실행)
  async function handleSubmission(isCorrect) {
    if (hasProcessedResult) {
      console.log('[SPARTA Python] 이미 처리된 결과, 무시');
      return;
    }
    hasProcessedResult = true;
    isWaitingForResult = false;

    const problemId = getProblemId();
    if (!problemId) {
      console.log('[SPARTA Python] 문제 ID를 찾을 수 없음');
      return;
    }

    // problems.js에서 문제 정보 찾기
    const problemInfo = getProblemByProblemId(problemId, 'programmers');
    if (!problemInfo) {
      console.log('[SPARTA Python] 등록되지 않은 문제:', problemId);
      showNotification('등록되지 않은 문제입니다', 'warning');
      return;
    }

    console.log('[SPARTA Python] 제출 감지:', { problemId, isCorrect, title: problemInfo.title });

    if (isCorrect === true) {
      const code = getCode();
      if (!code) {
        showNotification('코드를 가져올 수 없습니다', 'error');
        return;
      }

      // 자동 제출 설정 확인
      const { autoSubmitEnabled } = await chrome.storage.sync.get(['autoSubmitEnabled']);
      if (autoSubmitEnabled === false) {
        showNotification('정답입니다!', 'success');
        console.log('[SPARTA Python] GitHub 자동 제출 비활성화됨');
        return;
      }

      showNotification('정답입니다! GitHub에 업로드 중...', 'success');
      await pushToGitHub(problemInfo, code);
    } else if (isCorrect === false) {
      showNotification('오답입니다. 다시 시도해보세요!', 'error');
    }
  }

  // 결과 대기 (폴링 방식)
  function waitForResult() {
    let attempts = 0;
    const maxAttempts = 30;

    console.log('[SPARTA Python] 채점 결과 대기 시작...');

    if (checkResultInterval) {
      clearInterval(checkResultInterval);
    }

    checkResultInterval = setInterval(() => {
      attempts++;

      if (hasProcessedResult || !isWaitingForResult) {
        clearInterval(checkResultInterval);
        checkResultInterval = null;
        return;
      }

      const result = detectResult();
      if (result !== null) {
        clearInterval(checkResultInterval);
        checkResultInterval = null;
        console.log('[SPARTA Python] 결과 확정:', result ? '정답' : '오답');
        handleSubmission(result);
      } else if (attempts >= maxAttempts) {
        clearInterval(checkResultInterval);
        checkResultInterval = null;
        isWaitingForResult = false;
        console.log('[SPARTA Python] 결과 대기 타임아웃');
      }
    }, 1000);
  }

  // 제출 버튼 감시
  function observeSubmitButton() {
    const submitBtn = document.querySelector('#submit-code') ||
                      document.querySelector('button.btn-primary[type="submit"]') ||
                      Array.from(document.querySelectorAll('button')).find(
                        btn => btn.textContent.includes('제출') && btn.textContent.includes('채점')
                      );

    if (submitBtn && !submitBtn.dataset.spartaPythonAttached) {
      submitBtn.dataset.spartaPythonAttached = 'true';
      console.log('[SPARTA Python] 제출 버튼 연결됨:', submitBtn.textContent.trim());

      submitBtn.addEventListener('click', () => {
        console.log('[SPARTA Python] 제출 버튼 클릭!');
        isWaitingForResult = true;
        hasProcessedResult = false;

        setTimeout(() => {
          waitForResult();
        }, 1500);
      });
    }
  }

  // GitHub 설정 확인 (OAuth 인증 상태 확인)
  async function checkGitHubSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
      if (response.success && response.authenticated) {
        if (!response.repo) {
          showNotification('먼저 익스텐션에서 저장소를 선택해주세요!', 'warning');
          return false;
        }
        return true;
      }
      showNotification('먼저 익스텐션에서 GitHub에 로그인해주세요!', 'warning');
      return false;
    } catch (error) {
      console.error('[SPARTA Python] 설정 확인 오류:', error);
      return false;
    }
  }

  // 초기화
  async function init() {
    console.log('[SPARTA Python] 초기화 시작');

    const settingsOk = await checkGitHubSettings();
    if (!settingsOk) {
      console.log('[SPARTA Python] 설정 미완료');
      return;
    }

    const problemId = getProblemId();
    if (!problemId) {
      console.log('[SPARTA Python] 문제 페이지가 아님');
      return;
    }

    const problemInfo = getProblemByProblemId(problemId, 'programmers');
    if (problemInfo) {
      console.log('[SPARTA Python] 코드카타 문제 감지:', problemInfo.title);
    } else {
      console.log('[SPARTA Python] 등록되지 않은 문제:', problemId);
    }

    observeSubmitButton();
    setInterval(observeSubmitButton, 2000);
  }

  // 페이지 로드 완료 후 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
