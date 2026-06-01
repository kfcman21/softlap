#!/bin/bash

# ==============================================================================
# ☁️ 서울 에듀테크 소프트랩(Softlap) OCI 가상 서버 원클릭 자동 셋업 스크립트
# OS 대상: Ubuntu 22.04 LTS / 20.04 LTS (Always Free AMD/ARM Compute Instance)
# ==============================================================================

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}======================================================================${NC}"
echo -e "${GREEN}🚀 [SOFTLAP] 오라클 클라우드 가상 머신(VM) 최초 환경 자동 빌드 시작${NC}"
echo -e "${GREEN}======================================================================${NC}"

# 1. 패키지 저장소 업데이트 및 최신화
echo -e "\n${YELLOW}🔄 [1/6] 리눅스 시스템 패키지 업데이트 및 최신 업그레이드 진행 중...${NC}"
sudo apt-get update -y
sudo apt-get upgrade -y

# 2. 필수 유틸리티 및 Node.js 설치 준비 (Nodesource 활용)
echo -e "\n${YELLOW}📦 [2/6] Node.js 20.x 패키지 저장소 다운로드 및 주입 중...${NC}"
sudo apt-get install -y curl git software-properties-common gcc g++ make

# curl을 사용한 Node.js 20.x 소스 주입
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# 3. Node.js 및 NPM 실제 설치
echo -e "\n${YELLOW}🚀 [3/6] Node.js 및 NPM 패키지 설치 진행 중...${NC}"
sudo apt-get install -y nodejs

# 버전 확인
NODE_VER=$(node -v)
NPM_VER=$(npm -v)
echo -e "${GREEN}  🟢 Node.js 설치 완료: $NODE_VER${NC}"
echo -e "${GREEN}  🟢 NPM 설치 완료: $NPM_VER${NC}"

# 4. PM2 글로벌 무중단 프로세스 관리자 설치
echo -e "\n${YELLOW}⚙️ [4/6] 글로벌 PM2 (무중단 24시간 가동 유틸리티) 주입 중...${NC}"
sudo npm install -p pm2 -g
echo -e "${GREEN}  🟢 PM2 글로벌 설치 및 등록 성공!${NC}"

# 5. OCI 전용 리눅스 OS 방화벽 (iptables) 3000번 포트 강제 허용
# ⚠️ 중요: OCI 우분투 VM은 자체 iptables 체인 마지막에 REJECT가 주입되어 있어 ufw로만 열면 차단됩니다.
# 아래 명령을 통해 INPUT 체인 상단에 포트 3000 허용 규칙을 인서트합니다.
echo -e "\n${YELLOW}🛡️ [5/6] OCI 고유 리눅스 OS 방화벽(iptables)에 3000번 포트 강제 허용 규칙 추가 중...${NC}"
sudo iptables -I INPUT 6 -p tcp --dport 3000 -j ACCEPT

# 리부팅 후에도 방화벽 규칙이 휘발되지 않고 영구 보존되도록 저장 유틸리티 로드 및 저장
sudo apt-get install -y iptables-persistent netfilter-persistent
sudo netfilter-persistent save
sudo netfilter-persistent reload
echo -e "${GREEN}  🟢 OS 내부 방화벽 규칙 등록 및 영구 저장 완료! (Port 3000 개방)${NC}"

# 6. 소프트랩 패키지 확인 및 npm install
echo -e "\n${YELLOW}📦 [6/6] 프로젝트 종속성 라이브러리 및 네이티브 드라이버 인스톨 진행 중...${NC}"
if [ -f "package.json" ]; then
    npm install
    echo -e "${GREEN}  🟢 Node.js 의존성 모듈 설치 성공!${NC}"
else
    echo -e "${RED}  ⚠️ 현재 경로에 package.json 파일이 존재하지 않습니다.${NC}"
    echo -e "${YELLOW}  👉 배포 완료 후 프로젝트 폴더로 이동하여 'npm install'을 수동으로 구동해 주십시오.${NC}"
fi

echo -e "\n${GREEN}======================================================================${NC}"
echo -e "${GREEN}🎉 OCI 가상 서버 기초 환경 구축이 성공적으로 종료되었습니다!${NC}"
echo -e "${GREEN}======================================================================${NC}"
echo -e "${YELLOW}📣 다음 단계 안내:${NC}"
echo -e "  1. 'oracle-config.json' 파일을 수정하여 오라클 Autonomous DB 연결 자격증명을 입력해 주십시오."
echo -e "  2. 'node test-db.js' 명령으로 DB 연결 테스트를 진행해 주십시오."
echo -e "  3. 'pm2 start server.js --name softlap-server' 로 24시간 실시간 API 서버를 기동해 주십시오."
echo -e "  4. 서버 관리 및 로그 실시간 확인은 'pm2 logs' 또는 'pm2 status'를 사용해 주십시오."
echo -e "${GREEN}======================================================================${NC}"
