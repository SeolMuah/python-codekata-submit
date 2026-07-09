// 프로그래머스 페이지 컨텍스트(MAIN world)에서 실행되는 코드 추출 브릿지
//
// content script는 격리된 world에서 돌기 때문에 페이지 스크립트가 DOM 요소에 붙여둔
// 확장 속성(.CodeMirror)이나 window.monaco 를 볼 수 없다. 이 파일만 페이지 world에서
// 실행되어 에디터 인스턴스를 직접 읽고, postMessage 로 content script에 값을 넘긴다.
(function() {
  'use strict';

  const REQ = 'pyalgo-cs';
  const RES = 'pyalgo-page';

  function readEditorCode() {
    // 프로그래머스 현행: CodeMirror 5
    const cmEl = document.querySelector('.CodeMirror');
    if (cmEl && cmEl.CodeMirror && typeof cmEl.CodeMirror.getValue === 'function') {
      return { code: cmEl.CodeMirror.getValue(), via: 'codemirror' };
    }

    // 향후 Monaco 로 교체될 경우 대비
    const monaco = window.monaco;
    if (monaco && monaco.editor) {
      const editors = typeof monaco.editor.getEditors === 'function' ? monaco.editor.getEditors() : [];
      if (editors.length > 0) {
        return { code: editors[0].getValue(), via: 'monaco-editor' };
      }
      const models = typeof monaco.editor.getModels === 'function' ? monaco.editor.getModels() : [];
      if (models.length > 0) {
        return { code: models[0].getValue(), via: 'monaco-model' };
      }
    }

    return { code: null, via: 'none' };
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    const data = event.data;
    if (!data || data.source !== REQ || data.type !== 'GET_CODE' || !data.id) return;

    let payload;
    try {
      payload = readEditorCode();
    } catch (error) {
      payload = { code: null, via: 'error', error: String(error && error.message) };
    }

    window.postMessage({ source: RES, type: 'CODE', id: data.id, ...payload }, window.location.origin);
  });
})();
