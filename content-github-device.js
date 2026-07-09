// Python 알고리즘 - GitHub 기기 인증 자동 입력 Content Script
// https://github.com/login/device* 에서 실행된다.
//
// 진행 중인 device flow(pendingDeviceAuth)가 있으면 사용자 코드를 코드 입력 화면에
// 자동 입력하고 Continue 버튼까지만 자동 클릭한다.
// ⚠️ 다음 화면의 "Authorize" 버튼은 절대 자동 클릭하지 않는다 (권한 부여는 사용자의 명시적 동의).

(function () {
  'use strict';

  const AUTO_FILL_TIMEOUT_MS = 10000; // 입력 필드 대기 최대 시간 (무한 폴링 금지)
  const SUCCESS_MESSAGE = 'Python 알고리즘: 인증 코드를 자동 입력했습니다. Authorize를 눌러주세요.';
  const BANNER_ID = 'pyalgo-device-banner';

  const BANNER_AUTO_HIDE_MS = 12000; // 배너가 페이지를 계속 가리지 않도록

  let handled = false;   // 자동 입력/클릭 재진입 가드
  let submitted = false; // Continue 클릭 1회 가드
  let observer = null;
  let timeoutId = null;
  let bannerHideTimer = null;

  // GitHub은 /login/device 로 가면 먼저 계정 확인 화면(/login/device/select_account)으로 보낸다.
  // 그 화면엔 코드 입력칸이 없으므로 자동 입력을 시도하면 안 된다.
  // 계정 선택은 사용자의 선택이므로 Continue 도 대신 눌러주지 않는다.
  function isAccountSelectPage() {
    return window.location.pathname.startsWith('/login/device/select_account');
  }

  // Authorize 를 마친 뒤 나오는 완료 화면 ("Congratulations, you're all set!")
  function isSuccessPage() {
    if (window.location.pathname.startsWith('/login/device/success')) {
      return true;
    }
    return /you're all set|you are all set|device is now connected|기기가 연결/i.test(pageText());
  }

  // 1. 진행 중 device flow 상태 읽기
  chrome.storage.local.get('pendingDeviceAuth', (result) => {
    const pending = result && result.pendingDeviceAuth;

    // 없으면 조용히 종료
    if (!pending || !pending.user_code) {
      return;
    }

    // 만료됐으면 조용히 종료
    if (typeof pending.expires_at === 'number' && Date.now() > pending.expires_at) {
      return;
    }

    // 인증 완료 화면 — 자동 입력을 시도하면 안 되고, 실패 배너는 더더욱 띄우면 안 된다.
    // 백그라운드가 30초 알람을 기다리지 않고 바로 토큰을 가져오도록 알린다.
    if (isSuccessPage()) {
      chrome.runtime.sendMessage({ type: 'DEVICE_AUTH_COMPLETED' }).catch(() => {});
      showBanner('Python 알고리즘: 인증이 완료되었습니다. 이 탭은 닫으셔도 됩니다.', true);
      return;
    }

    if (isAccountSelectPage()) {
      showBanner('Python 알고리즘: 계정을 확인하고 Continue를 눌러주세요. 다음 화면에서 코드가 자동 입력됩니다.', true);
      return;
    }

    // 이메일 재인증 / 2단계 인증 화면 — 우리가 낄 자리가 아니다. 조용히 물러난다.
    // (여기에 실패 배너를 띄우면 사용자가 엉뚱한 칸에 기기 코드를 붙여넣게 된다)
    if (isOtherAuthPage() && !isDeviceCodePage()) {
      console.log('[Python 알고리즘] 기기 코드 화면이 아님 - 자동 입력 건너뜀');
      return;
    }

    startAutoFill(pending.user_code);
  });

  // 자동 입력 시작: 즉시 시도 후, 실패하면 MutationObserver로 입력 필드 대기
  function startAutoFill(userCode) {
    // 즉시 한 번 시도
    if (tryFill(userCode)) {
      return;
    }

    // 아직 입력 필드가 없으면 DOM 변화 관찰 (무한 setInterval 폴링 금지)
    observer = new MutationObserver(() => {
      // 그새 다른 인증 화면으로 바뀌었다면 손을 뗀다
      if (isOtherAuthPage() && !isDeviceCodePage()) {
        cleanup();
        return;
      }
      if (tryFill(userCode)) {
        cleanup();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // 최대 10초 후 타임아웃 → 상황에 맞는 안내
    timeoutId = setTimeout(() => {
      cleanup();
      if (handled) {
        return;
      }
      if (isSuccessPage()) {
        // 그새 인증이 끝난 경우 — 실패 배너를 띄우면 안 된다
        chrome.runtime.sendMessage({ type: 'DEVICE_AUTH_COMPLETED' }).catch(() => {});
        showBanner('Python 알고리즘: 인증이 완료되었습니다. 이 탭은 닫으셔도 됩니다.', true);
      } else if (isAuthorizePage()) {
        // 이미 코드 입력을 마치고 권한 부여(consent) 화면에 도달한 경우
        showBanner('Python 알고리즘: 아래 Authorize 버튼을 눌러 인증을 완료해주세요.', true);
      } else if (isDeviceCodePage()) {
        // 기기 코드 화면인데 칸을 못 찾았다 → 수동 입력 안내 (항상 수동 입력이 가능해야 한다)
        showBanner(`Python 알고리즘: 자동 입력에 실패했습니다. 코드 ${userCode} 를 붙여넣어 주세요.`, false);
      }
      // 그 밖의 화면(이메일 재인증 등)에서는 아무 말도 하지 않는다.
    }, AUTO_FILL_TIMEOUT_MS);
  }

  function cleanup() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  // 코드 입력 시도. 성공(입력 완료 또는 이미 채워짐)하면 true 반환.
  function tryFill(userCode) {
    if (handled) {
      return true;
    }

    // (a) 세그먼트 입력 (문자당 한 칸) 우선 확인 → 문자별 분배
    const segments = findCodeSegments();
    if (segments.length > 1) {
      // 이미 채워져 있으면 건드리지 않는다
      const alreadyFilled = segments.some(el => el.value && el.value.length > 0);
      if (alreadyFilled) {
        handled = true;
        return true;
      }
      const chars = userCode.replace(/[^A-Za-z0-9]/g, '').split('');
      const count = Math.min(chars.length, segments.length);
      for (let i = 0; i < count; i++) {
        setNativeValue(segments[i], chars[i]);
      }
      handled = true;
      showBanner(SUCCESS_MESSAGE, true);
      clickContinue();
      return true;
    }

    // (b) 단일 입력 필드 (다중 셀렉터 폴백)
    const input = findCodeInput();
    if (!input) {
      return false;
    }

    // 이미 채워져 있으면 건드리지 않는다
    if (input.value && input.value.trim().length > 0) {
      handled = true;
      return true;
    }

    setNativeValue(input, userCode);
    handled = true;
    showBanner(SUCCESS_MESSAGE, true);
    clickContinue();
    return true;
  }

  // 글자당 한 칸인 세그먼트 입력 탐색 (다중 셀렉터 폴백).
  //
  // 실측(2026-07): GitHub 기기 인증 화면은 8개의 <input id="user-code-N" class="form-control
  // js-user-code-field" maxlength="1">를 쓴다. 주의할 함정 — id 는 0..8 로 9개인데
  // 그중 user-code-4 는 하이픈(-)을 담은 class="d-none" 자리표시 칸이다.
  // 따라서 id 접두사(input[id^="user-code-"])로 잡으면 글자가 한 칸씩 밀린다.
  // 반드시 .js-user-code-field 또는 보이는 maxlength=1 칸만 골라야 한다.
  function findCodeSegments() {
    const selectors = [
      'input.js-user-code-field',
      'input[data-index]',
      'input[maxlength="1"]'
    ];
    for (const sel of selectors) {
      const els = Array.from(document.querySelectorAll(sel)).filter(isVisibleTextInput);
      if (els.length > 1) {
        return els;
      }
    }
    return [];
  }

  function isVisibleTextInput(el) {
    return el.type !== 'hidden' &&
           !el.classList.contains('d-none') &&
           el.offsetParent !== null;
  }

  // 단일 입력 필드 탐색 (구/변형 레이아웃 대비).
  //
  // ⚠️ 절대 autocomplete="one-time-code" 로 찾지 마라.
  // GitHub 의 이메일 재인증(Confirm access) 화면과 2단계 인증 화면의 입력칸도 그 속성을 쓴다.
  // 거기에 기기 인증 코드를 밀어넣고 Verify 까지 눌러버리는 사고가 난다.
  // 기기 코드 입력칸임이 이름으로 확실한 것만 받아들인다.
  function findCodeInput() {
    const selectors = ['#user-code', 'input[name="user_code"]'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.type !== 'hidden') {
        return el;
      }
    }
    return null;
  }

  function pageText() {
    const body = document.body;
    if (!body) return '';
    // innerText 는 렌더링 의존이라 상황에 따라 비어 있을 수 있다 → textContent 로 폴백
    return body.innerText || body.textContent || '';
  }

  // 기기 인증 코드 입력 화면인가? 여기서만 자동 입력한다.
  function isDeviceCodePage() {
    if (findCodeSegments().length > 1) return true;
    if (findCodeInput()) return true;
    return /Authorize your device|Enter the code displayed|기기를 승인|기기 인증 코드/i.test(pageText());
  }

  // 이메일 재인증(Confirm access) · 2단계 인증 · sudo 재확인 등 '기기 코드가 아닌' 인증 화면.
  // 절대 자동 입력하지 않고, 실패 배너도 띄우지 않는다.
  function isOtherAuthPage() {
    return /Confirm access|verification code sent to|sudo mode|two-factor|Two-factor|이중 인증|재인증/i.test(pageText());
  }

  // React 제어 컴포넌트 대응: native value setter 호출 후 input/change 이벤트 dispatch
  function setNativeValue(el, value) {
    const proto = window.HTMLInputElement && window.HTMLInputElement.prototype;
    const desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
    const setter = desc && desc.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Continue(제출) 버튼을 1회만 자동 클릭.
  // 이 함수는 코드 입력에 성공한 직후에만 호출되므로, 권한 부여(Authorize) 화면에서는
  // 절대 호출되지 않는다 (해당 화면엔 코드 입력 필드가 없음).
  function clickContinue() {
    if (submitted) {
      return;
    }
    submitted = true;

    // 입력 이벤트 처리가 끝난 뒤 클릭하도록 약간의 지연
    setTimeout(() => {
      // 코드 입력칸이 들어 있는 폼의 제출 버튼만 누른다.
      // (쿠키 배너 등 다른 폼의 버튼을 누르지 않도록)
      const field = findCodeSegments()[0] || findCodeInput();
      const form = field && field.closest('form');
      const btn = form && form.querySelector('button[type="submit"], input[type="submit"]');
      if (!btn) {
        return;
      }

      // 최후의 안전장치: 권한 부여(Authorize)나 재인증(Verify) 버튼은 절대 누르지 않는다.
      const label = (btn.textContent || btn.value || '').trim().toLowerCase();
      if (label.includes('authorize') || label.includes('승인') || label.includes('verify')) {
        return;
      }

      btn.click();
    }, 300);
  }

  // 코드 입력 화면이 아니라 권한 부여(consent) 화면인지 추정
  function isAuthorizePage() {
    // 코드 입력 필드가 있으면 consent 화면이 아니다
    if (findCodeSegments().length > 1 || findCodeInput()) {
      return false;
    }
    if (document.querySelector('button[name="authorize"]')) {
      return true;
    }
    const buttons = document.querySelectorAll('button, input[type="submit"]');
    for (const b of buttons) {
      const label = (b.textContent || b.value || '').trim().toLowerCase();
      if (label.includes('authorize') || label.includes('승인')) {
        return true;
      }
    }
    return false;
  }

  // 상단 배너 표시 (success=true 파란 안내 / false 주황 폴백).
  // 페이지를 계속 가리지 않도록 닫기 버튼 + 자동 숨김을 둔다.
  function removeBanner() {
    const existing = document.getElementById(BANNER_ID);
    if (existing) existing.remove();
    if (bannerHideTimer) {
      clearTimeout(bannerHideTimer);
      bannerHideTimer = null;
    }
  }

  function showBanner(text, success) {
    removeBanner();

    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'right:0',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'gap:12px',
      'padding:12px 16px',
      'text-align:center',
      'font-size:14px',
      'font-weight:600',
      'line-height:1.4',
      `background:${success ? '#0ea5e9' : '#f59e0b'}`,
      'color:#04121f',
      'font-family:-apple-system,BlinkMacSystemFont,"Pretendard",sans-serif',
      'box-shadow:0 2px 8px rgba(0,0,0,0.2)'
    ].join(';');

    const label = document.createElement('span');
    label.textContent = text;
    banner.appendChild(label);

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕';
    close.setAttribute('aria-label', '알림 닫기');
    close.style.cssText = [
      'border:none',
      'background:transparent',
      'color:inherit',
      'font-size:15px',
      'font-weight:700',
      'cursor:pointer',
      'padding:0 4px',
      'line-height:1'
    ].join(';');
    close.addEventListener('click', removeBanner);
    banner.appendChild(close);

    (document.body || document.documentElement).appendChild(banner);

    bannerHideTimer = setTimeout(removeBanner, BANNER_AUTO_HIDE_MS);
  }
})();
