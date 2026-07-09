# 개인정보처리방침 — Python 알고리즘 (Chrome 확장 프로그램)

최종 수정일: 2026년 7월 9일

## 요약

이 확장 프로그램은 **개발자가 운영하는 서버가 없습니다.** 사용자의 어떤 데이터도 개발자에게
전송되거나 수집되지 않습니다. 모든 데이터는 사용자의 브라우저 안에 저장되거나, 사용자가
직접 연결한 GitHub 계정으로만 전송됩니다.

광고, 추적, 분석(analytics) 도구를 일절 사용하지 않습니다.

## 처리하는 데이터

| 데이터 | 저장 위치 | 외부 전송 |
|---|---|---|
| GitHub 액세스 토큰 | `chrome.storage.local` (브라우저 내부) | GitHub API 인증에만 사용 |
| GitHub 사용자명, 아바타 URL | `chrome.storage.local` | 전송하지 않음 (표시용) |
| 선택한 저장소 이름 | `chrome.storage.sync` | 전송하지 않음 |
| 문제 풀이 진행률 | `chrome.storage.sync` | 전송하지 않음 |
| 사용자가 입력한 이름 | `chrome.storage.sync` | 커밋 파일의 주석에만 기록 |
| 프로그래머스 에디터의 코드 | 저장하지 않음 | 사용자의 GitHub 저장소로 커밋 |

`chrome.storage.sync` 에 저장된 값은 사용자가 Chrome 동기화를 켜 둔 경우 Google 계정을 통해
사용자의 다른 기기로 동기화될 수 있습니다. 이는 Chrome의 기능이며 개발자는 그 데이터에
접근할 수 없습니다.

## 데이터를 보내는 곳

이 확장 프로그램이 네트워크 요청을 보내는 대상은 아래가 전부입니다.

- `https://github.com/login/device/code` — 기기 인증 코드 발급
- `https://github.com/login/oauth/access_token` — 액세스 토큰 발급
- `https://api.github.com/user` — 사용자명·아바타 조회
- `https://api.github.com/user/repos` — 저장소 목록 조회 및 생성
- `https://api.github.com/repos/{소유자}/{저장소}/contents/...` — 풀이 파일 커밋

`school.programmers.co.kr` 에서는 페이지를 읽기만 하며, 이 확장 프로그램이 그 사이트로
데이터를 보내지 않습니다.

## 권한을 사용하는 이유

- **storage** — 진행률, 이름, 선택한 저장소, GitHub 액세스 토큰을 브라우저에 저장합니다.
- **sidePanel** — 진행률 화면을 브라우저 사이드 패널로 표시합니다.
- **alarms** — GitHub 기기 인증(Device Flow)이 끝날 때까지 토큰 발급을 주기적으로 확인합니다.
  Manifest V3 서비스 워커는 수십 초 유휴 시 종료되므로, 알람 없이는 사용자가 승인을 늦게
  누를 경우 로그인이 완료되지 않습니다.
- **school.programmers.co.kr** — 채점 결과를 감지하고, 에디터에 작성된 코드를 읽습니다.
- **api.github.com** — 저장소를 조회·생성하고 풀이 파일을 커밋합니다.
- **github.com/login/\*** — OAuth 기기 인증을 수행하고, 인증 코드를 자동으로 입력합니다.

## 하지 않는 것

- 데이터를 판매하거나 제3자에게 이전하지 않습니다.
- 확장 프로그램의 핵심 기능과 무관한 목적으로 데이터를 사용하지 않습니다.
- 신용도 평가나 대출 자격 판단 목적으로 데이터를 사용하지 않습니다.
- 원격 코드(remote code)를 내려받아 실행하지 않습니다. 모든 코드는 패키지에 포함되어 있습니다.
- GitHub의 승인(Authorize) 버튼을 대신 누르지 않습니다. 권한 부여는 항상 사용자가 직접 합니다.

## 토큰 권한 범위

GitHub 로그인 시 요청하는 권한은 `public_repo`(공개 저장소 읽기·쓰기)와 `read:user`(사용자
정보 읽기)뿐입니다. 비공개 저장소, 조직 관리, 삭제 권한은 요청하지 않습니다.

## 데이터 삭제

사이드 패널의 '로그아웃'을 누르면 저장된 액세스 토큰과 사용자 정보가 즉시 삭제됩니다.
확장 프로그램을 제거하면 저장된 모든 데이터가 함께 삭제됩니다.

이미 GitHub에 커밋된 풀이 파일은 사용자의 저장소에 남으며, 사용자가 직접 삭제할 수 있습니다.
GitHub 계정 설정의 Applications 메뉴에서 이 확장 프로그램의 권한을 언제든 철회할 수 있습니다.

## 문의

버그 제보나 개인정보 관련 문의는 GitHub 저장소의 이슈로 남겨주세요.

https://github.com/SeolMuah/python-codekata-submit/issues
