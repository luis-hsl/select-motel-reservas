#!/usr/bin/env bash
# Bootstrap inicial da VPS Hostinger (Ubuntu 22.04/24.04) para o projeto select-motel-reservas.
# Roda como root no primeiro acesso.
#
# Uso: scp ./vps-bootstrap.sh root@SEU_IP:/root/ && ssh root@SEU_IP "bash /root/vps-bootstrap.sh"

set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
SSH_AUTHORIZED_KEY="${SSH_AUTHORIZED_KEY:-}"

if [[ "$EUID" -ne 0 ]]; then
  echo "Rode como root." >&2
  exit 1
fi

echo "==> Atualizando sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y curl ca-certificates gnupg lsb-release ufw fail2ban git rsync jq unzip

echo "==> Instalando Docker"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

echo "==> Instalando Node.js 20 LTS (para Edge Functions / utilitarios)"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> Instalando Nginx"
apt-get install -y nginx
systemctl enable --now nginx

echo "==> Criando usuario de deploy: $DEPLOY_USER"
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG docker,sudo "$DEPLOY_USER"
mkdir -p /home/"$DEPLOY_USER"/.ssh
chmod 700 /home/"$DEPLOY_USER"/.ssh

if [[ -n "$SSH_AUTHORIZED_KEY" ]]; then
  echo "$SSH_AUTHORIZED_KEY" > /home/"$DEPLOY_USER"/.ssh/authorized_keys
  chmod 600 /home/"$DEPLOY_USER"/.ssh/authorized_keys
  chown -R "$DEPLOY_USER:$DEPLOY_USER" /home/"$DEPLOY_USER"/.ssh
  echo "    chave SSH instalada em /home/$DEPLOY_USER/.ssh/authorized_keys"
else
  echo "    (sem SSH_AUTHORIZED_KEY definido — adicione manualmente depois)"
fi

# sudo sem senha para o deploy poder reiniciar nginx / docker via Actions
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/systemctl reload nginx, /bin/systemctl restart nginx, /usr/bin/docker, /usr/bin/docker compose" \
  > /etc/sudoers.d/90-deploy
chmod 440 /etc/sudoers.d/90-deploy

echo "==> Criando diretorios da aplicacao"
mkdir -p /var/www/select-motel
chown -R "$DEPLOY_USER:$DEPLOY_USER" /var/www/select-motel
mkdir -p /opt/supabase
chown -R "$DEPLOY_USER:$DEPLOY_USER" /opt/supabase

echo "==> Configurando firewall UFW"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

echo "==> Configurando fail2ban (perfil sshd padrao)"
systemctl enable --now fail2ban

echo "==> Endurecendo sshd"
SSHD_CFG=/etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' "$SSHD_CFG"
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' "$SSHD_CFG"
sed -i 's/^#\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' "$SSHD_CFG"
systemctl reload ssh || systemctl reload sshd

echo
echo "==> Bootstrap concluido."
echo "    Proximo passo: rodar infra/supabase-setup.sh como usuario $DEPLOY_USER."
echo "    Login: ssh $DEPLOY_USER@<IP>"
