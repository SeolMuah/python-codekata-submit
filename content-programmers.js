// 프로그래머스 Content Script (Python 알고리즘)
(function() {
  'use strict';

  console.log('[Python 알고리즘] 프로그래머스 Content Script 로드됨');

  let isWaitingForResult = false;
  let hasProcessedResult = false;
  let checkResultInterval = null;

  const SQL_LANGUAGES = ['mysql', 'oracle', 'sql', 'postgresql', 'mariadb'];

  // 코드 본문이 SQL로 보이는가 (언어를 확신하지 못할 때의 2차 방어선)
  const SQL_CODE_PATTERN = /^\s*(--[^\n]*\n\s*)*(SELECT|WITH|CREATE|INSERT|UPDATE|DELETE|ALTER|DROP)\b/i;

  // 현재 선택된 프로그래밍 언어 감지.
  // 프로그래머스는 선택된 언어를 data-language 속성으로 노출하고,
  // 제출할 때 스스로도 `.nav-link.active` 의 data-language 를 읽는다.
  //
  // confident=true 는 "활성화된 언어 탭에서 직접 읽었다"는 뜻이다.
  // 업로드를 '차단'하는 판단에는 confident 한 값만 쓴다 — 추측값으로 차단하면
  // 정답 Python 제출이 조용히 누락될 수 있기 때문이다.
  function detectLanguage() {
    const activeTab = document.querySelector('.nav-link.active[data-language]') ||
                      document.querySelector('[data-language].active');
    if (activeTab && activeTab.dataset.language) {
      return { lang: activeTab.dataset.language.toLowerCase(), confident: true };
    }

    // 아래는 전부 추측이다 (confident=false).
    const langEl = document.querySelector('input[data-language]') ||
                   document.querySelector('.challenge-content[data-language]') ||
                   document.querySelector('[data-language]');
    if (langEl && langEl.dataset.language) {
      return { lang: langEl.dataset.language.toLowerCase(), confident: false };
    }

    const fileTab = document.querySelector('[class*="file-tab"]') ||
                    document.querySelector('.nav-tabs .active');
    if (fileTab) {
      const fileName = fileTab.textContent.trim().toLowerCase();
      if (fileName.includes('.sql')) return { lang: 'sql', confident: false };
      if (fileName.includes('.py')) return { lang: 'python3', confident: false };
    }

    console.log('[Python 알고리즘] 언어 감지 실패, unknown 반환');
    return { lang: 'unknown', confident: false };
  }

  // Python 계열인지 (python3, python 등)
  function isPythonLanguage(lang) {
    return typeof lang === 'string' && lang.startsWith('python');
  }

  // SQL 문제인지 확인.
  // 익스텐션을 통째로 비활성화하는 판단이므로 confident 한 감지에만 근거한다.
  // 확신하지 못한 경우는 제출 시점에 코드 본문으로 다시 가려낸다.
  function isSQLProblem() {
    const { lang, confident } = detectLanguage();

    if (confident && SQL_LANGUAGES.includes(lang)) {
      console.log('[Python 알고리즘] SQL 문제 감지됨, 처리 건너뜀');
      return true;
    }

    return false;
  }

  // 문제 ID 추출 (URL에서)
  function getProblemId() {
    const url = window.location.href;
    const match = url.match(/lessons\/(\d+)/);
    return match ? match[1] : null;
  }

  // 페이지에서 동적으로 문제 정보 추출 (미등록 문제용)
  function extractProblemInfoFromPage(problemId) {
    // 문제 제목 추출
    let title = null;

    // 프로그래머스 문제 제목 선택자들 (실제 페이지에서 .challenge-title 로 확인됨)
    const titleSelectors = [
      '.challenge-title',
      '.problem-title',
      '.lesson-content h2',
      '.algorithm-title'
    ];

    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        title = el.textContent.trim();
        break;
      }
    }

    // 제목을 찾지 못한 경우 페이지 타이틀에서 추출
    // 실제 형식: "코딩테스트 연습 - 완주하지 못한 선수 | 프로그래머스 스쿨"
    if (!title) {
      const beforePipe = (document.title || '').split('|')[0].trim();
      const stripped = beforePipe.replace(/^코딩테스트\s*연습\s*-\s*/, '').trim();
      if (stripped && stripped !== '프로그래머스') {
        title = stripped;
      }
    }

    // 그래도 없으면 기본값
    if (!title) {
      title = `프로그래머스 문제 ${problemId}`;
    }

    // 난이도 추출 시도
    let difficulty = 'unknown';
    const levelEl = document.querySelector('.challenge-level') ||
                    document.querySelector('[class*="level"]') ||
                    document.querySelector('.difficulty');
    if (levelEl) {
      const levelText = levelEl.textContent.toLowerCase();
      if (levelText.includes('1') || levelText.includes('lv1')) difficulty = 'lv1';
      else if (levelText.includes('2') || levelText.includes('lv2')) difficulty = 'lv2';
      else if (levelText.includes('3') || levelText.includes('lv3')) difficulty = 'lv3';
      else if (levelText.includes('4') || levelText.includes('lv4')) difficulty = 'lv4';
      else if (levelText.includes('5') || levelText.includes('lv5')) difficulty = 'lv5';
    }

    console.log('[Python 알고리즘] 동적 문제 정보 추출:', { problemId, title, difficulty });

    return {
      id: `programmers-dynamic-${problemId}`,
      problemId: problemId,
      title: title,
      platform: 'programmers',
      difficulty: difficulty,
      isDynamic: true  // 동적으로 추출된 문제임을 표시
    };
  }

  // 페이지 world의 injected-programmers.js 에 에디터 내용을 요청한다.
  // content script는 격리된 world라서 .CodeMirror 인스턴스에 직접 접근할 수 없다.
  const CODE_REQUEST_TIMEOUT_MS = 2000;

  function requestCodeFromPage() {
    return new Promise((resolve) => {
      const id = `pyalgo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let settled = false;

      function finish(result) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(result);
      }

      function onMessage(event) {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== 'pyalgo-page' || data.type !== 'CODE' || data.id !== id) return;
        finish(data);
      }

      const timer = setTimeout(() => finish(null), CODE_REQUEST_TIMEOUT_MS);
      window.addEventListener('message', onMessage);
      window.postMessage({ source: 'pyalgo-cs', type: 'GET_CODE', id }, window.location.origin);
    });
  }

  // 코드 추출
  async function getCode() {
    const bridged = await requestCodeFromPage();
    if (bridged && bridged.code && bridged.code.trim()) {
      console.log('[Python 알고리즘] 에디터 코드 추출 성공 (' + bridged.via + ')');
      return bridged.code;
    }

    // 폴백: CodeMirror가 감춰둔 원본 textarea.
    // 프로그래머스가 제출 직전 codeEditor.save()를 호출하므로 대개 최신 코드가 들어 있지만,
    // 그 호출에 의존할 수 없으므로 브릿지 실패 시에만 사용한다.
    const textarea = document.querySelector('textarea[name="code"]') ||
                     document.querySelector('textarea.editor') ||
                     document.querySelector('.editor textarea');
    if (textarea && textarea.value.trim()) {
      console.warn('[Python 알고리즘] 브릿지 실패, textarea 폴백 사용 (코드가 오래됐을 수 있음)');
      return textarea.value;
    }

    console.log('[Python 알고리즘] 코드 추출 실패!');
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
      console.log('[Python 알고리즘] 모달 감지:', modalText.substring(0, 100));

      if (modalText.includes('정답입니다')) {
        console.log('[Python 알고리즘] 정답 모달 감지!');
        return true;
      }

      if (modalText.includes('틀렸습니다')) {
        console.log('[Python 알고리즘] 오답 모달 감지!');
        return false;
      }
    }

    // 2. 결과 영역에서 확인
    const resultArea = document.querySelector('#output') ||
                       document.querySelector('.console-output') ||
                       document.querySelector('[class*="result"]');

    if (!resultArea) return null;

    // 프로그래머스가 직접 붙이는 판정 마크업이 있으면 그게 가장 정확하다.
    // (printPassedMessage → .console-passed, printFailedMessage → .console-failed)
    if (resultArea.querySelector('.console-passed')) return true;
    if (resultArea.querySelector('.console-failed')) return false;

    const text = resultArea.textContent || '';
    console.log('[Python 알고리즘] 결과 텍스트:', text.substring(0, 200));

    // 채점 중인 경우
    if (text.includes('채점 중') || text.includes('채점을 시작') || text.includes('실행 중')) {
      if (text.includes('오류') || text.includes('error') || text.includes('Error')) {
        console.log('[Python 알고리즘] 오류 감지');
        return false;
      }
      console.log('[Python 알고리즘] 아직 채점 중...');
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
      console.log('[Python 알고리즘] 오류 감지');
      return false;
    }

    // 오답 패턴 (성공 패턴보다 먼저 체크 - false positive 방지)
    if (text.includes('실패') ||
        text.includes('오답') ||
        text.includes('Fail') ||
        text.includes('틀렸')) {
      console.log('[Python 알고리즘] 오답 감지');
      return false;
    }

    // 테스트 결과 개수로 판별 (성공 패턴보다 먼저 체크)
    const passMatch = text.match(/(\d+)개 성공/);
    const failMatch = text.match(/(\d+)개 실패/);
    if (passMatch || failMatch) {
      const failCount = failMatch ? parseInt(failMatch[1]) : 0;
      return failCount === 0;
    }

    // 정답 패턴 (엄격한 최종 확정 메시지만 유지)
    if (text.includes('정답입니다') ||
        text.includes('테스트를 통과') ||
        text.includes('맞았습니다') ||
        /정확성.*100/.test(text)) {
      console.log('[Python 알고리즘] 정답 감지!');
      return true;
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
      if (modalText.includes('정답') || /정확성.*100/.test(modalText) || modalText.includes('테스트를 통과')) {
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
    const existing = document.getElementById('pyalgo-notification');
    if (existing) existing.remove();

    const colors = {
      success: '#10b981',
      error: '#ef4444',
      info: '#3b82f6',
      warning: '#f59e0b'
    };

    const notification = document.createElement('div');
    notification.id = 'pyalgo-notification';
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

    if (!document.getElementById('pyalgo-notification-style')) {
      const style = document.createElement('style');
      style.id = 'pyalgo-notification-style';
      style.textContent = `@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }

  // GitHub로 푸시
  async function pushToGitHub(problemInfo, code) {
    try {
      console.log('[Python 알고리즘] GitHub Push 시작:', problemInfo.title);

      const response = await chrome.runtime.sendMessage({
        type: 'PUSH_TO_GITHUB',
        data: {
          problemId: problemInfo.problemId,
          code: code
        }
      });

      if (response && response.success) {
        console.log('[Python 알고리즘] GitHub Push 성공!');
        showNotification('GitHub에 업로드되었습니다!', 'success');
        return true;
      } else {
        console.error('[Python 알고리즘] GitHub Push 실패:', response?.message);
        showNotification('GitHub 업로드 실패: ' + (response?.message || '알 수 없는 오류'), 'error');
        return false;
      }
    } catch (error) {
      console.error('[Python 알고리즘] GitHub Push 오류:', error);
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
      console.log('[Python 알고리즘] 이미 처리된 결과, 무시');
      return;
    }
    hasProcessedResult = true;
    isWaitingForResult = false;

    const problemId = getProblemId();
    if (!problemId) {
      console.log('[Python 알고리즘] 문제 ID를 찾을 수 없음');
      return;
    }

    // problems.js에서 문제 정보 찾기 (등록된 문제)
    let problemInfo = getProblemByProblemId(problemId);
    let isDynamicProblem = false;

    // 미등록 문제인 경우 페이지에서 동적으로 정보 추출
    if (!problemInfo) {
      console.log('[Python 알고리즘] 미등록 문제, 동적 정보 추출:', problemId);
      problemInfo = extractProblemInfoFromPage(problemId);
      isDynamicProblem = true;
    }

    console.log('[Python 알고리즘] 제출 감지:', { problemId, isCorrect, title: problemInfo.title, isDynamic: isDynamicProblem });

    if (isCorrect === true) {
      // Python 전용 익스텐션 — 다른 언어 코드를 .py 로 올리지 않는다.
      // 단, 언어를 확신하지 못하면(confident=false) 차단하지 않는다.
      // 추측값으로 막으면 정답 Python 제출이 조용히 누락된다.
      const { lang, confident } = detectLanguage();
      if (confident && !isPythonLanguage(lang)) {
        showNotification(`정답입니다! Python 코드만 업로드됩니다 (현재 언어: ${lang})`, 'success');
        console.log('[Python 알고리즘] Python이 아닌 언어, 업로드 건너뜀:', lang);
        return;
      }

      const code = await getCode();
      if (!code) {
        showNotification('코드를 가져올 수 없습니다', 'error');
        return;
      }

      // 언어를 확신하지 못했다면 코드 본문으로 SQL 여부를 다시 가려낸다.
      if (!confident && SQL_CODE_PATTERN.test(code)) {
        console.log('[Python 알고리즘] 코드 본문이 SQL로 판단됨, 업로드 건너뜀');
        return;
      }

      // 자동 제출 설정 확인
      const { autoSubmitEnabled } = await chrome.storage.sync.get(['autoSubmitEnabled']);
      if (autoSubmitEnabled === false) {
        showNotification('정답입니다!', 'success');
        console.log('[Python 알고리즘] GitHub 자동 제출 비활성화됨');
        return;
      }

      showNotification('정답입니다! GitHub에 업로드 중...', 'success');

      // 동적 문제는 PUSH_DYNAMIC_PROBLEM 메시지 사용
      if (isDynamicProblem) {
        await pushDynamicToGitHub(problemInfo, code);
      } else {
        await pushToGitHub(problemInfo, code);
      }
    } else if (isCorrect === false) {
      showNotification('오답입니다. 다시 시도해보세요!', 'error');
    }
  }

  // 동적 문제 GitHub 푸시 (미등록 문제용)
  async function pushDynamicToGitHub(problemInfo, code) {
    try {
      console.log('[Python 알고리즘] 동적 문제 GitHub Push 시작:', problemInfo.title);

      const response = await chrome.runtime.sendMessage({
        type: 'PUSH_DYNAMIC_PROBLEM',
        data: {
          problemId: problemInfo.problemId,
          title: problemInfo.title,
          difficulty: problemInfo.difficulty,
          code: code
        }
      });

      if (response && response.success) {
        console.log('[Python 알고리즘] 동적 문제 GitHub Push 성공!');
        showNotification('GitHub에 업로드되었습니다! (기타문제)', 'success');
        return true;
      } else {
        console.error('[Python 알고리즘] 동적 문제 GitHub Push 실패:', response?.message);
        showNotification('GitHub 업로드 실패: ' + (response?.message || '알 수 없는 오류'), 'error');
        return false;
      }
    } catch (error) {
      console.error('[Python 알고리즘] 동적 문제 GitHub Push 오류:', error);
      if (error.message && error.message.includes('Extension context invalidated')) {
        showNotification('익스텐션이 업데이트되었습니다. 페이지를 새로고침해주세요!', 'error');
      } else {
        showNotification('GitHub 업로드 오류: ' + error.message, 'error');
      }
      return false;
    }
  }

  // ===== 채점 결과 감시 =====
  //
  // ⚠️ #output 의 텍스트를 그냥 읽으면 안 된다. 채점 시작(testStarted) 시점에야 clearOutput()이
  // 호출되므로, 제출 직후 잠깐은 **직전 시도의 결과**가 그대로 남아 있다.
  // 그걸 읽으면 정답인데 "오답"으로 판정된다.
  //
  // 그래서 '제출 클릭 이후에 새로 발생한 사건'만 신호로 삼는다. 신호는 세 갈래이고,
  // 어느 하나에 의존하지 않는다 (사이트가 경로를 바꾸거나 중간에 failed 를 스쳐 써도 버티도록):
  //   1) #output 에 새로 추가되는 .console-passed / .console-failed 노드  ← 가장 신뢰도 높음
  //   2) #output-title 의 success / failed 클래스가 새로 쓰이는 순간
  //   3) 채점 결과 모달의 "정답입니다" / "틀렸습니다"
  //
  // 그리고 오답 신호는 즉시 확정하지 않고 잠시 유예한다. 유예 중에 정답 신호가 오면 정답이 이긴다.
  // (정답을 오답으로 표시하는 사고가 그 반대보다 훨씬 나쁘다)

  let titleObserver = null;    // #output-title 의 class 전이
  let outputObserver = null;   // #output 에 새로 추가되는 .console-passed / .console-failed
  let modalObserver = null;    // 채점 결과 모달
  let resultTimeoutId = null;
  let failGraceTimer = null;   // '오답' 확정 유예 타이머

  const RESULT_TIMEOUT_MS = 120000;

  // '오답' 신호는 즉시 확정하지 않는다. 사이트가 채점 도중 잠깐 failed 를 쓰는 경로가 있어서
  // (예: 채널 오류 처리) 정답인데 오답으로 굳어버리는 사고가 실제로 있었다.
  // 유예 시간 안에 '정답' 신호가 하나라도 오면 정답이 이긴다.
  const FAIL_GRACE_MS = 2000;

  function verdictOfClassList(cls) {
    if (!cls) return null;
    const tokens = String(cls).split(/\s+/);
    if (tokens.includes('success')) return true;
    if (tokens.includes('failed')) return false;
    return null;
  }

  function verdictOf(el) {
    return el ? verdictOfClassList(el.className) : null;
  }

  function stopResultWatch() {
    for (const obs of [titleObserver, outputObserver, modalObserver]) {
      if (obs) obs.disconnect();
    }
    titleObserver = outputObserver = modalObserver = null;

    if (resultTimeoutId) {
      clearTimeout(resultTimeoutId);
      resultTimeoutId = null;
    }
    if (failGraceTimer) {
      clearTimeout(failGraceTimer);
      failGraceTimer = null;
    }
    if (checkResultInterval) {
      clearInterval(checkResultInterval);
      checkResultInterval = null;
    }
  }

  function finishWithResult(passed) {
    stopResultWatch();
    stopButtonWatcher();
    console.log('[Python 알고리즘] 결과 확정:', passed ? '정답' : '오답');
    handleSubmission(passed);
  }

  // 여러 감시자가 보내오는 채점 신호를 한곳에서 조정한다.
  function signalResult(passed, source) {
    if (hasProcessedResult || !isWaitingForResult) {
      return;
    }
    console.log(`[Python 알고리즘] 채점 신호: ${passed ? '정답' : '오답'} (출처: ${source})`);

    if (passed) {
      // 정답 신호는 즉시 확정. 대기 중이던 오답 유예는 취소한다.
      finishWithResult(true);
      return;
    }

    if (failGraceTimer) {
      return; // 이미 오답 유예 중
    }
    failGraceTimer = setTimeout(() => {
      failGraceTimer = null;
      finishWithResult(false);
    }, FAIL_GRACE_MS);
  }

  // 신호 1: #output 에 새로 추가되는 판정 노드.
  // 사이트가 최종 메시지를 printPassedMessage/printFailedMessage 로 찍는다.
  // '추가된 노드'만 보므로 직전 시도의 잔여 출력에 절대 속지 않는다.
  function watchOutputNodes(outputEl) {
    outputObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.matches('.console-passed') || node.querySelector('.console-passed')) {
            signalResult(true, 'console-passed');
            return;
          }
          if (node.matches('.console-failed') || node.querySelector('.console-failed')) {
            signalResult(false, 'console-failed');
            return;
          }
        }
      }
    });
    outputObserver.observe(outputEl, { childList: true, subtree: true });
  }

  // 신호 2: #output-title 의 success / failed 클래스가 '이번에 새로 쓰였을 때'만 인정.
  // 탭 활성화 같은 노이즈 변경(이전 판정 == 현재 판정)은 무시된다.
  function watchOutputTitle(titleEl) {
    titleObserver = new MutationObserver((mutations) => {
      const verdict = verdictOf(titleEl);
      if (verdict === null) return;

      const verdictWasWritten = mutations.some((m) => {
        const before = verdictOfClassList(m.oldValue);
        return before === null || before !== verdict;
      });
      if (verdictWasWritten) {
        signalResult(verdict, 'output-title class');
      }
    });
    titleObserver.observe(titleEl, {
      attributes: true,
      attributeFilter: ['class'],
      attributeOldValue: true
    });
  }

  // 신호 3: 채점 결과 모달 ("정답입니다!" / "틀렸습니다")
  function watchResultModal(outputEl) {
    const MODAL_SELECTOR = '.modal, [role="dialog"], [class*="modal"]';

    modalObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          // 채점 중 #output 안에는 테스트케이스 행이 잔뜩 추가된다.
          // 거기까지 훑으면 비싸고, 모달도 아니다.
          if (outputEl && outputEl.contains(node)) continue;

          const isModal = node.matches(MODAL_SELECTOR) || node.querySelector(MODAL_SELECTOR);
          if (!isModal) continue;

          const text = node.textContent || '';
          if (text.includes('정답입니다')) {
            signalResult(true, 'modal');
            return;
          }
          if (text.includes('틀렸습니다')) {
            signalResult(false, 'modal');
            return;
          }
        }
      }
    });
    modalObserver.observe(document.body, { childList: true, subtree: true });
  }

  function waitForResult() {
    stopResultWatch();
    console.log('[Python 알고리즘] 채점 결과 대기 시작...');

    const titleEl = document.querySelector('#output-title');
    const outputEl = document.querySelector('#output');

    if (!titleEl && !outputEl) {
      waitForResultByText();
      return;
    }

    if (outputEl) watchOutputNodes(outputEl);
    if (titleEl) watchOutputTitle(titleEl);
    watchResultModal(outputEl);

    resultTimeoutId = setTimeout(() => {
      stopResultWatch();
      isWaitingForResult = false;
      console.log('[Python 알고리즘] 결과 대기 타임아웃');
    }, RESULT_TIMEOUT_MS);
  }

  // 폴백: #output-title 이 없는 경우에만 텍스트로 판정한다.
  // 직전 결과를 오독하지 않도록, 출력이 실제로 바뀐 뒤에만 결과를 받아들인다.
  function waitForResultByText() {
    const outputEl = document.querySelector('#output');
    const initialText = outputEl ? outputEl.textContent : '';
    let attempts = 0;
    const maxAttempts = 60;

    checkResultInterval = setInterval(() => {
      attempts++;

      if (hasProcessedResult || !isWaitingForResult) {
        stopResultWatch();
        return;
      }

      const currentText = outputEl ? outputEl.textContent : '';
      if (currentText === initialText) {
        // 아직 채점이 시작되지 않았다 (이전 출력 그대로)
        if (attempts >= maxAttempts) {
          stopResultWatch();
          isWaitingForResult = false;
          console.log('[Python 알고리즘] 결과 대기 타임아웃');
        }
        return;
      }

      const result = detectResult();
      if (result !== null) {
        finishWithResult(result);
      } else if (attempts >= maxAttempts) {
        stopResultWatch();
        isWaitingForResult = false;
        console.log('[Python 알고리즘] 결과 대기 타임아웃');
      }
    }, 1000);
  }

  // ===== 제출 버튼 감시 (MutationObserver 기반, setInterval 상시 폴링 제거) =====
  let attachedSubmitBtn = null;   // 캐시된 제출 버튼 (폴백 체인 재실행 최소화)
  let buttonObserver = null;      // DOM 변경 감시자
  let buttonSafetyInterval = null;// 안전망 저빈도 인터벌
  let attachDebounceTimer = null; // 디바운스 타이머

  // 제출 버튼 찾기 (다중 폴백 체인)
  function findSubmitButton() {
    return document.querySelector('#submit-code') ||
           document.querySelector('button.btn-primary[type="submit"]') ||
           Array.from(document.querySelectorAll('button')).find(
             btn => btn.textContent.includes('제출') && btn.textContent.includes('채점')
           );
  }

  // 제출 버튼 클릭 핸들러
  function onSubmitClick() {
    console.log('[Python 알고리즘] 제출 버튼 클릭!');
    isWaitingForResult = true;
    hasProcessedResult = false;

    // 재제출 대비: 채점 중 DOM 변경으로 버튼이 교체될 수 있으므로 감시 재개
    startButtonWatcher();

    // 지연 없이 즉시 감시를 건다. 늦게 붙으면 판정 클래스 전이를 놓친다.
    waitForResult();
  }

  // 제출 버튼에 리스너 부착 (이미 부착된 버튼이 살아있으면 폴백 체인 생략 = 캐싱)
  function attachSubmitButton() {
    if (attachedSubmitBtn && attachedSubmitBtn.isConnected &&
        attachedSubmitBtn.dataset.pyalgoAttached) {
      return; // 캐시된 버튼 유효 → 재탐색 불필요
    }

    const submitBtn = findSubmitButton();
    if (submitBtn && !submitBtn.dataset.pyalgoAttached) {
      submitBtn.dataset.pyalgoAttached = 'true';
      attachedSubmitBtn = submitBtn;
      console.log('[Python 알고리즘] 제출 버튼 연결됨:', submitBtn.textContent.trim());
      submitBtn.addEventListener('click', onSubmitClick);
    }
  }

  // 디바운스 예약 (짧은 시간 내 다수의 DOM 변경을 1회로 합침)
  function scheduleAttach() {
    if (attachDebounceTimer) return;
    attachDebounceTimer = setTimeout(() => {
      attachDebounceTimer = null;
      attachSubmitButton();
    }, 300);
  }

  // 버튼 감시 시작 (MutationObserver + 안전망 저빈도 인터벌)
  function startButtonWatcher() {
    attachSubmitButton(); // 즉시 1회 시도

    if (!buttonObserver) {
      buttonObserver = new MutationObserver(() => scheduleAttach());
      buttonObserver.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });
    }

    if (!buttonSafetyInterval) {
      // 안전망: MutationObserver가 놓칠 경우 대비 (캐시 유효 시 즉시 반환하므로 저비용)
      buttonSafetyInterval = setInterval(attachSubmitButton, 5000);
    }
  }

  // 버튼 감시 정리
  function stopButtonWatcher() {
    if (buttonObserver) {
      buttonObserver.disconnect();
      buttonObserver = null;
    }
    if (buttonSafetyInterval) {
      clearInterval(buttonSafetyInterval);
      buttonSafetyInterval = null;
    }
    if (attachDebounceTimer) {
      clearTimeout(attachDebounceTimer);
      attachDebounceTimer = null;
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
      console.error('[Python 알고리즘] 설정 확인 오류:', error);
      return false;
    }
  }

  // 초기화
  async function init() {
    console.log('[Python 알고리즘] 초기화 시작');

    // SQL 문제인 경우 처리하지 않음 (Python 전용 익스텐션)
    if (isSQLProblem()) {
      console.log('[Python 알고리즘] SQL 문제 감지됨 - Python 익스텐션이므로 처리 건너뜀');
      return;
    }

    const settingsOk = await checkGitHubSettings();
    if (!settingsOk) {
      console.log('[Python 알고리즘] 설정 미완료 - 제출 버튼 감시는 계속 진행');
      // 설정 미완료여도 버튼 감시는 시작 (pushToGitHub 시점에서 재확인함)
    }

    const problemId = getProblemId();
    if (!problemId) {
      console.log('[Python 알고리즘] 문제 페이지가 아님');
      return;
    }

    const problemInfo = getProblemByProblemId(problemId);
    if (problemInfo) {
      console.log('[Python 알고리즘] 등록된 문제 감지:', problemInfo.title);
    } else {
      console.log('[Python 알고리즘] 등록되지 않은 문제:', problemId);
    }

    startButtonWatcher();
  }

  // 페이지 로드 완료 후 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
