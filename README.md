# SPARTA Python 코드카타

프로그래머스/백준 문제 풀이를 자동으로 GitHub에 저장하는 Chrome 확장 프로그램

## 주요 기능

- **자동 GitHub 업로드**: 문제 정답 시 자동으로 코드를 GitHub 저장소에 커밋
- **OAuth 인증**: GitHub Device Flow를 사용한 안전한 인증 (백엔드 서버 불필요)
- **진행률 추적**: 난이도별 문제 풀이 현황을 시각적으로 확인
- **다중 플랫폼 지원**: 프로그래머스, 백준 지원
- **미등록 문제 지원**: problems.js에 등록되지 않은 문제도 `other` 폴더에 자동 업로드

## 지원 문제 (총 431문제)

| 레벨 | 구분 | 문제 수 |
|------|------|---------|
| L0 | 기초·입문 | 223문제 |
| L1 | 입문 | 6문제 |
| L2 | 기초 | 44문제 |
| L3 | 중급 | 24문제 |
| L4 | 중상 | 33문제 |
| L5 | 고급 | 20문제 |
| L7 | 챌린지 | 20문제 |
| L8 | 백준 | 38문제 |

## 설치 방법

### 1. 확장 프로그램 설치

1. 이 저장소를 다운로드 또는 클론
2. Chrome에서 `chrome://extensions` 접속
3. 우측 상단 **개발자 모드** 활성화
4. **압축해제된 확장 프로그램을 로드합니다** 클릭
5. `python_submit_chrome` 폴더 선택

### 2. GitHub 연동

1. 확장 프로그램 아이콘 클릭
2. **GitHub 로그인** 버튼 클릭
3. 표시된 코드가 자동으로 클립보드에 복사됨
4. GitHub 인증 페이지에서 코드 붙여넣기
5. 권한 승인 후 저장소 선택 또는 새로 생성

## 사용 방법

1. 프로그래머스 또는 백준에서 문제 풀이
2. **정답** 판정 시 자동으로 GitHub에 업로드
3. 확장 프로그램 팝업에서 진행률 확인

## 파일 구조

```
python_submit_chrome/
├── manifest.json          # 확장 프로그램 설정
├── popup.html/js          # 팝업 UI
├── background.js          # 백그라운드 서비스 워커
├── oauth.js               # GitHub OAuth 모듈
├── github-api.js          # GitHub API 모듈
├── problems.js            # 문제 목록 데이터
├── content-programmers.js # 프로그래머스 컨텐츠 스크립트
├── content-baekjoon.js    # 백준 컨텐츠 스크립트
└── icons/                 # 아이콘
```

## GitHub 저장소 구조

```
your-repo/
├── 프로그래머스/
│   ├── L0_기초입문/
│   │   ├── 입문/
│   │   └── 기초트레이닝/
│   ├── L1_입문/
│   ├── L2_기초/
│   ├── L3_중급/
│   ├── L4_중상/
│   ├── L5_고급/
│   ├── L7_챌린지/
│   └── other/              # 미등록 문제
└── 백준/
    ├── L8_백준/
    └── other/              # 미등록 문제
```

## 권한 설명

| 권한 | 용도 |
|------|------|
| `storage` | 인증 토큰, 진행률 저장 |
| `activeTab` | 현재 탭의 코드 읽기 |
| `identity` | OAuth 인증 |
| `host_permissions` | 프로그래머스, 백준, GitHub API 접근 |

## 문제 해결

### 코드가 업로드되지 않는 경우

1. 확장 프로그램에서 GitHub 로그인 상태 확인
2. 저장소가 선택되어 있는지 확인
3. 페이지 새로고침 후 재시도

### 미등록 문제 지원

- `problems.js`에 등록되지 않은 문제도 자동으로 업로드됩니다
- 미등록 문제는 `프로그래머스/other/` 또는 `백준/other/` 폴더에 저장됩니다
- 문제 제목과 ID가 페이지에서 자동 추출됩니다

## 기술 스택

- Chrome Extension Manifest V3
- GitHub OAuth Device Flow
- GitHub REST API
- Vanilla JavaScript

## 라이선스

MIT License
