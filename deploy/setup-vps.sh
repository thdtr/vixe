#!/bin/bash
# Provisions the VPS to serve VIXE. Idempotent: safe to run again.
#   usage (as root, from a copy of this deploy/ folder):
#     ./setup-vps.sh deploy_key.pub
# The public key is the one whose private half lives in the GitHub
# `production` environment as DEPLOY_SSH_KEY.
set -euo pipefail
cd "$(dirname "$0")"

PUBKEY_FILE=${1:?usage: $0 <deploy public key file>}
DOMAINS=(vixe.online www.vixe.online)

echo "== packages"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx certbot fail2ban ufw >/dev/null

echo "== deploy user"
id deploy >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/deploy --shell /bin/bash deploy
passwd -l deploy >/dev/null
install -d -o root -g root -m 755 /home/deploy/.ssh
# Root-owned so the deploy user can't loosen its own restrictions.
printf 'command="/usr/local/bin/vixe-deploy",restrict %s\n' "$(cat "$PUBKEY_FILE")" > /home/deploy/.ssh/authorized_keys
chmod 644 /home/deploy/.ssh/authorized_keys
install -o root -g root -m 755 vixe-deploy.sh /usr/local/bin/vixe-deploy
install -d -o deploy -g deploy -m 755 /var/www/vixe /var/www/vixe/releases
install -d -o root -g root -m 755 /var/www/letsencrypt

echo "== nginx"
site=/etc/nginx/sites-available/vixe.online
if [ -f /etc/letsencrypt/live/vixe.online/fullchain.pem ]; then
  install -m 644 nginx/vixe.online.conf "$site"
else
  install -m 644 nginx/vixe.online.bootstrap.conf "$site"
fi
ln -sfn "$site" /etc/nginx/sites-enabled/vixe.online
nginx -t
systemctl enable --now nginx >/dev/null
systemctl reload nginx

if [ ! -f /etc/letsencrypt/live/vixe.online/fullchain.pem ]; then
  echo "== certificate"
  if certbot certonly --webroot -w /var/www/letsencrypt \
       $(printf -- '-d %s ' "${DOMAINS[@]}") \
       --non-interactive --agree-tos --register-unsafely-without-email \
       --deploy-hook 'systemctl reload nginx'; then
    install -m 644 nginx/vixe.online.conf "$site"
    nginx -t
    systemctl reload nginx
  else
    echo "!! certbot failed (DNS not pointing here yet?). HTTPS stays off; rerun this script later." >&2
  fi
fi

echo "== ssh"
cat > /etc/ssh/sshd_config.d/01-hardening.conf <<'CONF'
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
X11Forwarding no
MaxAuthTries 4
CONF
sshd -t
systemctl reload ssh

echo "== fail2ban"
cat > /etc/fail2ban/jail.d/sshd.local <<'CONF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
CONF
systemctl enable --now fail2ban >/dev/null
systemctl restart fail2ban

echo "== firewall"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw limit 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status verbose

echo "== done"
