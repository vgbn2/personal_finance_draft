#!/usr/bin/env bash
# Configure volatile RAM-only journald logging and suppress token stdout on CT 112 / CT 123
# Eliminates SSD wear from continuous high-frequency logging.
set -euo pipefail

echo "==> Configuring volatile systemd journald logging (Storage=volatile, RuntimeMaxUse=64M)..."
mkdir -p /etc/systemd/journald.conf.d
cat << 'EOF' > /etc/systemd/journald.conf.d/00-volatile.conf
[Journal]
Storage=volatile
RuntimeMaxUse=64M
RuntimeMaxFileSize=8M
ForwardToSyslog=no
EOF

if command -v systemctl >/dev/null 2>&1; then
  systemctl restart systemd-journald || true

  if systemctl list-unit-files 2>/dev/null | grep -q "9router.service"; then
    echo "==> Suppressing 9Router stdout token stream in systemd unit..."
    mkdir -p /etc/systemd/system/9router.service.d
    cat << 'EOF' > /etc/systemd/system/9router.service.d/override.conf
[Service]
StandardOutput=null
StandardError=journal
EOF
    systemctl daemon-reload
    systemctl restart 9router.service || true
  fi
fi

echo "==> Volatile logging configuration active. NVMe flash wear eliminated."
