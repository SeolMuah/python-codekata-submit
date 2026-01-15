# Python 코드카타 Chrome Extension - TASKS

## Phase 0: 문서 작성 ✅
- [x] PRD.md 작성
- [x] TASKS.md 작성
- [x] CLAUDE.md 작성

---

## Phase 1: 기본 구조 설정 ✅

### 1.1 프로젝트 초기화
- [x] 프로젝트 폴더 구조 생성
- [x] icons 폴더에 아이콘 복사 (sql_extension에서)

### 1.2 manifest.json
- [x] Manifest V3 기본 구조 작성
- [x] permissions 설정 (storage, activeTab)
- [x] host_permissions 설정 (프로그래머스, 백준, GitHub API)
- [x] content_scripts 설정
- [x] background service worker 설정

### 1.3 problems.js
- [x] 문제 데이터 구조 정의
- [x] 프로그래머스 180문제 데이터 입력
- [x] 백준 38문제 데이터 입력
- [x] 난이도/알고리즘 유형 매핑

---

## Phase 2: GitHub 연동 모듈 ✅

### 2.1 github-api.js
- [x] GitHubAPI 클래스 구현
- [x] checkRepo() - 저장소 존재 확인
- [x] getFileSha() - 파일 SHA 조회
- [x] createOrUpdateFile() - 파일 생성/업데이트
- [x] 에러 핸들링 (Rate Limit, 인증 실패 등)

### 2.2 oauth.js (OAuth Device Flow)
- [x] requestDeviceCode() - Device Code 요청
- [x] pollForToken() - 토큰 폴링
- [x] getUserInfo() - 사용자 정보 조회
- [x] getUserRepos() - 저장소 목록 조회
- [x] createRepo() - 새 저장소 생성
- [x] validateToken() - 토큰 유효성 검사
- [x] logout() - 로그아웃 (토큰 삭제)

### 2.3 background.js
- [x] Service Worker 기본 구조
- [x] 메시지 리스너 (OAuth, GitHub Push 포함)
- [x] chrome.storage 연동 (local: 토큰, sync: 설정)
- [x] GitHub API 호출 로직
- [x] 진행률 저장 로직

---

## Phase 3: UI 마이그레이션 ✅

> **중요**: sql_submit 프로젝트와 **동일한 UI/UX 구조** 유지, 테마 색상만 변경

### 3.1 popup.html
- [x] sql_extension에서 기본 구조 복사
- [x] 헤더 수정 (Python 코드카타)
- [x] 탭 구조 변경 (프로그래머스/백준/설정)
- [x] Google Form 설정 → GitHub 설정 변경
- [x] **테마 색상 변경** (보라색 → 녹색)
  - 주요 색상: #8b5cf6 → #22c55e
  - 배경 그라데이션: #0f0f1a → #0a1628
  - 헤더 배경: #1e1e2e → #1b4332

### 3.2 popup.js
- [x] 탭 로직 수정 (2개 플랫폼 + 설정)
- [x] 난이도 체계 변경 (L1~L5, 레벨7, 레벨8)
- [x] GitHub 설정 UI 로직
- [x] 연결 테스트 기능
- [x] 진행률 계산 로직 수정

### 3.3 스타일 조정 (sql_submit 동일 유지)
- [x] 난이도 아이콘 변경 (⭐, 🔥, 💎)
- [x] **테마 색상만 Python 녹색으로 변경**
- [x] 팝업 크기 유지: 420 x 520px
- [x] 폰트 유지: Pretendard
- [x] 레이아웃 구조 유지: 헤더 → 프로필 → 추천 → 진행률 → 탭 → 문제목록
- [x] 인터랙션 패턴 유지: 접기/펼치기, 체크박스, 알림 토스트

---

## Phase 4: Content Scripts ✅

### 4.1 content-programmers.js
- [x] sql_extension/content.js 기반 마이그레이션
- [x] Python 코드 감지 로직
- [x] Monaco Editor 코드 추출
- [x] 정답 여부 감지 (모달, 결과 영역)
- [x] background.js로 메시지 전송 (PUSH_TO_GITHUB)

### 4.2 content-baekjoon.js (신규)
- [x] 페이지 타입 판별 (problem/submit/status)
- [x] 문제 번호 추출
- [x] submit 페이지 코드 추출
  - [x] textarea#source 감지
  - [x] CodeMirror 감지
  - [x] Ace Editor 감지
- [x] 제출 버튼 클릭 감지
- [x] 코드 임시 저장 (storage.local)
- [x] status 페이지 결과 폴링 (60초 타임아웃)
- [x] 정답 시 GitHub Push 트리거

---

## Phase 5: 통합 및 테스트

### 5.1 통합 테스트
- [ ] 프로그래머스 문제 풀이 → GitHub Push
- [ ] 백준 문제 풀이 → GitHub Push
- [ ] 진행률 동기화 확인
- [ ] 체크박스 토글 확인
- [ ] GitHub 자동 제출 토글 확인

### 5.2 엣지 케이스
- [ ] OAuth 토큰 만료/무효 처리
- [ ] 네트워크 오류 처리
- [ ] 저장소 없음 처리
- [ ] 동일 문제 재제출 (업데이트)

### 5.3 사용자 테스트
- [ ] 처음 설치 시나리오
- [ ] GitHub 설정 플로우
- [ ] 문제 풀이 플로우
- [ ] 오류 복구 플로우

---

## Phase 6: 최적화 및 배포

### 6.1 최적화
- [ ] 코드 정리 및 주석
- [ ] 불필요한 console.log 제거
- [ ] 에러 메시지 한국어화

### 6.2 배포 준비
- [ ] Chrome Web Store 개발자 등록 (선택)
- [ ] 스크린샷 준비
- [ ] 설명문 작성

---

## UI/UX 일관성 체크리스트

> sql_submit과 동일해야 하는 항목

### 레이아웃 (동일 유지)
- [x] 팝업 크기: 420 x 520px
- [x] 헤더 → 프로필 → 추천 → 진행률 → 탭 → 문제목록 순서
- [x] 난이도별 접기/펼치기 구조
- [x] 설정 탭 입력 폼 레이아웃

### 컴포넌트 (동일 유지)
- [x] 체크박스 스타일 및 애니메이션
- [x] 알림 토스트 디자인
- [x] 진행률 카드 레이아웃
- [x] 문제 아이템 구조 (체크박스 + 제목 + 링크)

### 인터랙션 (동일 유지)
- [x] 탭 전환 애니메이션
- [x] 접기/펼치기 애니메이션
- [x] 체크박스 토글 효과
- [x] 버튼 호버/클릭 효과

### 테마 색상 (변경)
- [x] 주요 색상: #8b5cf6 → #22c55e
- [x] 보조 색상: #a78bfa → #4ade80
- [x] 배경 그라데이션: #0f0f1a → #0a1628
- [x] 헤더 배경: #1e1e2e → #1b4332

---

## 우선순위 매트릭스

| 태스크 | 중요도 | 긴급도 | 상태 |
|--------|--------|--------|------|
| manifest.json | 높음 | 높음 | ✅ |
| problems.js | 높음 | 높음 | ✅ |
| github-api.js | 높음 | 높음 | ✅ |
| background.js | 높음 | 높음 | ✅ |
| popup.html/js | 높음 | 중간 | ✅ |
| content-programmers.js | 높음 | 중간 | ✅ |
| content-baekjoon.js | 높음 | 중간 | ✅ |
| 테스트 | 중간 | 중간 | 🔄 |

---

## 완료 기준

### MVP 완료 조건
1. ✅ GitHub OAuth Device Flow 인증
2. ✅ 저장소 선택/생성 기능
3. ✅ 프로그래머스 문제 풀이 → GitHub Push 구현
4. ✅ 백준 문제 풀이 → GitHub Push 구현
5. ✅ 진행률 표시 및 체크박스 동작
6. ✅ 모든 218문제 목록 표시
7. ✅ GitHub 자동 제출 토글 설정

### 품질 기준
- GitHub Push 성공률 > 95%
- 에러 발생 시 명확한 메시지
- 팝업 로딩 1초 이내

### UI/UX 품질 기준
- sql_submit과 동일한 사용자 경험
- 테마 색상만 Python 녹색으로 변경
- 기존 사용자가 혼란 없이 사용 가능
