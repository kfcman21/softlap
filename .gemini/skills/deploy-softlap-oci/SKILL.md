---
name: deploy-softlap-oci
description: >-
  로컬 코드를 GitHub에 푸시하고 오라클 클라우드 VM에 원격 접속하여 최신 소스코드를 다운로드(git pull)받은 뒤 PM2를 통해 백엔드 서버를 무중단 재기동하는 배포 스킬입니다.
---

# Deploy Softlap OCI

## Overview
로컬에서 개발 완료된 수정 사항을 깃허브 원격지와 오라클 클라우드(OCI) 우분투 VM 실서버에 동기화하고, PM2 프로세스 리로드까지 수행하는 자동 배포 도구입니다. (Node.js 및 Python 두 가지 헬퍼 스크립트를 제공합니다.)

## Dependencies
- `git`
- `ssh` (SSH 키 파일 `ssh-key-2026-05-25.key`가 바탕화면에 위치해야 함)

## Quick Start
로컬 개발 환경에 파이썬이 설치되어 있지 않더라도, 이미 가동 중인 Node.js를 사용해 배포할 수 있습니다:
```bash
# Node.js 헬퍼로 즉시 배포 실행 (권장)
node .gemini/skills/deploy-softlap-oci/scripts/deploy.js run
```

또는 파이썬이 활성화된 환경이라면 아래와 같이 실행 가능합니다:
```bash
# Python 헬퍼로 즉시 배포 실행
python .gemini/skills/deploy-softlap-oci/scripts/deploy.py run
```

## Utility Scripts
### `run` 서브커맨드
로컬 변경점 스테이징 및 커밋/푸시를 수행한 뒤 원격 가상머신에 SSH로 접속하여 git pull 및 pm2 reload를 연쇄 실행합니다.

#### 주요 인자(Arguments):
- `--message`: 로컬 Git 커밋 메시지 (기본값: "fix: auto deploy update")
- `--key-path`: SSH 접속에 사용할 Private Key 파일 경로 (기본값: "C:\Users\박찬규\Desktop\ssh-key-2026-05-25.key")
- `--host`: 원격 VM 서버의 IP 주소 (기본값: "140.245.76.33")
- `--user`: SSH 접속 계정명 (기본값: "ubuntu")
- `--remote-path`: 원격 VM 서버의 프로젝트 폴더 경로 (기본값: "/home/ubuntu/softlap")
- `--pm2-process`: 리로드할 PM2 프로세스명 (기본값: "softlap")

#### 사용 예시 (인자 변경):
```bash
node .gemini/skills/deploy-softlap-oci/scripts/deploy.js run --message "fix: 테이블 레이아웃 수정 적용"
```

## Common Mistakes
- **GitHub 인증 세션 만료**: 로컬에서 push할 때 인증 오류가 나면 스크립트가 비정상 종료되므로, 로컬 환경에서 깃허브 자격 증명이 유효한지 사전에 확인하십시오.
- **SSH Key 분실**: 바탕화면에서 `ssh-key-2026-05-25.key` 키 파일이 제거되거나 경로가 바뀌면 원격 접속 권한 오류가 발생합니다.