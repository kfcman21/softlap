#!/bin/bash

# ==============================================================================
# ☁️ 서울 에듀테크 소프트랩(Softlap) OCI 가상 서버 원클릭 자동 셋업 및 HTTPS 구축 스크립트
# OS 대상: Ubuntu 22.04 LTS / 20.04 LTS (Always Free AMD/ARM Compute Instance)
# ==============================================================================

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}======================================================================${NC}"
echo -e "${GREEN}🚀 [SOFTLAP] OCI 가상 머신(VM) 및 Nginx HTTPS 보안 환경 자동 구축 시작${NC}"
echo -e "${GREEN}======================================================================${NC}"

# 1. 패키지 저장소 업데이트 및 최신화
echo -e "\n${YELLOW}🔄 [1/7] 리눅스 시스템 패키지 업데이트 및 최신 업그레이드 진행 중...${NC}"
sudo apt-get update -y
sudo apt-get upgrade -y

# 2. 필수 유틸리티 및 Node.js 설치 준비 (Nodesource 활용)
echo -e "\n${YELLOW}📦 [2/7] 필수 라이브러리 및 Node.js 20.x 저장소 주입 중...${NC}"
sudo apt-get install -y curl git software-properties-common gcc g++ make snapd

# curl을 사용한 Node.js 20.x 소스 주입
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# 3. Node.js 및 NPM 실제 설치
echo -e "\n${YELLOW}🚀 [3/7] Node.js 및 NPM 패키지 설치 진행 중...${NC}"
sudo apt-get install -y nodejs

# 버전 확인
NODE_VER=$(node -v)
NPM_VER=$(npm -v)
echo -e "${GREEN}  🟢 Node.js 설치 완료: $NODE_VER${NC}"
echo -e "${GREEN}  🟢 NPM 설치 완료: $NPM_VER${NC}"

# 4. PM2 글로벌 무중단 프로세스 관리자 설치
echo -e "\n${YELLOW}⚙️ [4/7] 글로벌 PM2 (무중단 24시간 가동 유틸리티) 주입 중...${NC}"
sudo npm install -p pm2 -g
echo -e "${GREEN}  🟢 PM2 글로벌 설치 및 등록 성공!${NC}"

# 5. OCI 전용 리눅스 OS 방화벽 (iptables) 포트 개방
# ⚠️ 중요: OCI 우분투 VM은 자체 iptables 체인 마지막에 REJECT가 주입되어 있어 ufw로만 열면 차단됩니다.
# Nginx 연동용 포트 80(HTTP), 443(HTTPS) 및 백엔드용 3000을 INPUT 체인 상단에 강제 허용합니다.
echo -e "\n${YELLOW}🛡️ [5/7] OCI OS 방화벽(iptables)에 80(HTTP), 443(HTTPS), 3000 포트 개방 중...${NC}"
sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -p tcp --dport 3000 -j ACCEPT

# 리부팅 후에도 방화벽 규칙이 휘발되지 않고 영구 보존되도록 저장
sudo apt-get install -y iptables-persistent netfilter-persistent
sudo netfilter-persistent save
sudo netfilter-persistent reload
echo -e "${GREEN}  🟢 OS 내부 방화벽 규칙 등록 및 영구 저장 완료! (80, 443, 3000 개방)${NC}"

# 6. Nginx 설치 및 역방향 프록시 (Reverse Proxy) 자동 설정
echo -e "\n${YELLOW}⚙️ [6/7] Nginx 웹 서버 설치 및 Node.js 3000 포트 프록시 매핑 중...${NC}"
sudo apt-get install -y nginx

# Nginx 역방향 프록시 설정 파일 작성
NGINX_CONF="/etc/nginx/sites-available/softlap"
sudo bash -c "cat > $NGINX_CONF" << 'EOF'
server {
    listen 80;
    # ⚠️ 사용자의 도메인 기입 (도메인을 연결한 뒤 Let's Encrypt를 실행하면 인증서가 자동 갱신됩니다)
    server_name api.softlap.seoul.kr api.kfcman.link;

    # 413 Request Entity Too Large 오류 해결을 위해 클라이언트 요청 바디 크기 제한 상향 (Express limit 15MB에 매칭)
    client_max_body_size 20M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# 설정 심볼릭 링크 및 기본 default 설정 비활성화
sudo ln -sf /etc/nginx/sites-available/softlap /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Nginx 설정 테스트 및 재기동
if sudo nginx -t; then
    sudo systemctl restart nginx
    sudo systemctl enable nginx
    echo -e "${GREEN}  🟢 Nginx 프록시 설정 및 재기동 성공! (Port 80 -> Node 3000)${NC}"
else
    echo -e "${RED}  ❌ Nginx 설정 테스트 실패. 설정을 다시 확인해 주십시오.${NC}"
fi

# 7. Let's Encrypt Certbot 설치 (HTTPS SSL 무료 인증서 발급용)
echo -e "\n${YELLOW}🔒 [7/7] Let's Encrypt Certbot 보안 설치 모듈 주입 중...${NC}"
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot
echo -e "${GREEN}  🟢 Certbot 설치 및 리눅스 명령어 등록 완료!${NC}"

# 8. 소프트랩 패키지 확인 및 npm install
echo -e "\n${YELLOW}📦 [최종 단계] 프로젝트 종속성 라이브러리 및 네이티브 드라이버 인스톨 진행 중...${NC}"
if [ -f "package.json" ]; then
    npm install
    echo -e "${GREEN}  🟢 Node.js 의존성 모듈 설치 성공!${NC}"
else
    echo -e "${RED}  ⚠️ 현재 경로에 package.json 파일이 존재하지 않습니다.${NC}"
    echo -e "${YELLOW}  👉 배포 완료 후 프로젝트 폴더로 이동하여 'npm install'을 수동으로 구동해 주십시오.${NC}"
fi

echo -e "\n${GREEN}======================================================================${NC}"
echo -e "${GREEN}🎉 OCI 가상 서버 Nginx HTTPS 통합 환경 구축이 완벽하게 완료되었습니다!${NC}"
echo -e "${GREEN}======================================================================${NC}"
echo -e "${YELLOW}📣 [매우 중요] HTTPS 인증서 최종 발급 가이드:${NC}"
echo -e "  도메인(예: api.softlap.seoul.kr)의 네임서버 설정에서 본 OCI 가상 서버의 공인 IP를 가리키도록 설정한 직후,"
echo -e "  가상 서버 터미널에서 단 한 줄의 아래 명령어를 실행하기만 하면 HTTPS 구축이 즉각 종료됩니다!"
echo -e ""
echo -e "  ${GREEN}sudo certbot --nginx -d [본인의_API_서브도메인_주소]${NC}"
echo -e "  (예시: sudo certbot --nginx -d api.softlap.seoul.kr)"
echo -e ""
echo -e "  - Certbot이 Nginx 설정을 자동으로 HTTPS 전용(Port 443)으로 고치고 Let's Encrypt 무료 인증서를 매핑합니다."
echo -e "  - 또한 HTTP 접속 시 자동으로 HTTPS 보안 접속으로의 Redirect를 구성해 줍니다."
echo -e "======================================================================${NC}"
