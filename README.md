# Python 알고리즘

프로그래머스 문제 풀이를 자동으로 GitHub에 저장하는 Chrome 확장 프로그램

## 주요 기능

- **자동 GitHub 업로드**: 문제 정답 시 자동으로 코드를 GitHub 저장소에 커밋
- **OAuth 인증**: GitHub Device Flow를 사용한 안전한 인증 (백엔드 서버 불필요)
- **간편 로그인**: 인증 코드가 GitHub 화면에 자동 입력됩니다 (Authorize만 클릭)
- **진행률 추적**: 난이도별 문제 풀이 현황을 시각적으로 확인
- **프로그래머스 지원**: 코딩테스트 입문/기초 트레이닝 + L1~L7 레벨
- **미등록 문제 지원**: problems.js에 등록되지 않은 문제도 `other` 폴더에 자동 업로드

## 지원 문제 (총 393문제)

| 레벨 | 구분 | 문제 수 |
|------|------|---------|
| L0 | 기초·입문 | 223문제 |
| L1 | 입문 | 6문제 |
| L2 | 기초 | 43문제 |
| L3 | 중급 | 36문제 |
| L4 | 중상 | 40문제 |
| L5 | 고급 | 25문제 |
| L7 | 챌린지 | 20문제 |

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
3. 새 탭에서 GitHub 인증 페이지가 열리면 **코드가 자동으로 입력**됩니다
   - 자동 입력에 실패하면 클립보드에 복사된 코드를 직접 붙여넣으세요
4. **Authorize** 버튼을 눌러 권한 승인
5. 저장소 선택 또는 새로 생성

> ℹ️ 이 확장 프로그램은 **공개(public) 저장소**만 지원합니다. 인증 범위가 `public_repo`로 제한되어 있어 비공개(private) 저장소에는 업로드할 수 없습니다.

## 사용 방법

1. 프로그래머스에서 문제 풀이
2. **정답** 판정 시 자동으로 GitHub에 업로드
3. 확장 프로그램 팝업에서 진행률 확인

## 파일 구조

```
python_submit_chrome/
├── manifest.json              # 확장 프로그램 설정
├── popup.html/js              # 팝업 UI
├── background.js              # 백그라운드 서비스 워커
├── oauth.js                   # GitHub OAuth 모듈
├── github-api.js              # GitHub API 모듈
├── problems.js                # 문제 목록 데이터
├── content-programmers.js     # 프로그래머스 컨텐츠 스크립트
├── content-github-device.js   # GitHub 기기 인증 코드 자동 입력 스크립트
└── icons/                     # 아이콘
```

## GitHub 저장소 구조

```
your-repo/
└── programmers/
    ├── L0_기초입문/
    │   ├── 입문/
    │   └── 기초트레이닝/
    ├── L1_입문/
    ├── L2_기초/
    ├── L3_중급/
    ├── L4_중상/
    ├── L5_고급/
    ├── L7_챌린지/
    └── other/              # 미등록 문제
```

## 권한 설명

| 권한 | 용도 |
|------|------|
| `storage` | 인증 토큰, 진행률 저장 |
| `host_permissions` | 프로그래머스, GitHub API 및 로그인 페이지 접근 |

## 문제 해결

### 코드가 업로드되지 않는 경우

1. 확장 프로그램에서 GitHub 로그인 상태 확인
2. 저장소가 선택되어 있는지 확인
3. 페이지 새로고침 후 재시도

### 미등록 문제 지원

- `problems.js`에 등록되지 않은 문제도 자동으로 업로드됩니다
- 미등록 문제는 `programmers/other/` 폴더에 저장됩니다
- 문제 제목과 ID가 페이지에서 자동 추출됩니다

## 기술 스택

- Chrome Extension Manifest V3
- GitHub OAuth Device Flow
- GitHub REST API
- Vanilla JavaScript

## 라이선스

MIT License
