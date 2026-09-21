#!/bin/bash
set -e

echo "[SV-MT5] Starting Headless MetaTrader 5 on display :99..."

# 1. Clean up stale locks and start Xvfb Virtual Framebuffer
rm -f /tmp/.X11-unix/X99 /tmp/.X99-lock
Xvfb :99 -screen 0 1024x768x16 -nolisten tcp -ac +extension GLX &
XVFB_PID=$!

# Probe Xvfb socket readiness
for i in $(seq 1 30); do
    [ -S "/tmp/.X11-unix/X99" ] && break
    sleep 0.1
done

# 2. Trap signals for clean wine shutdown
cleanup() {
    echo "[SV-MT5] Shutting down MT5 and Wine server..."
    wineserver -k || true
    kill $XVFB_PID || true
    exit 0
}
trap cleanup EXIT SIGTERM SIGINT

# 3. Create ephemeral startup.ini if credentials are provided
CONFIG_DIR="/opt/mt5/config"
mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"
STARTUP_INI="$CONFIG_DIR/startup.ini"
if [ -n "$MT5_LOGIN" ] && [ -n "$MT5_PASSWORD" ] && [ -n "$MT5_SERVER" ]; then
    echo "[SV-MT5] Generating ephemeral startup.ini configuration..."
    cat <<EOF > "$STARTUP_INI"
[Common]
Login=${MT5_LOGIN}
Password=${MT5_PASSWORD}
Server=${MT5_SERVER}
CertPath=
AutoConfiguration=true
EnableNews=false

[Charts]
MaxBars=1000
PrintColor=false

[Experts]
AllowDllImport=false
Enabled=true
Account=true
Profile=true
EOF
    chmod 600 "$STARTUP_INI"

    # Schedule background unlink 5 seconds after launch to avoid lingering secrets
    (sleep 5 && rm -f "$STARTUP_INI" && echo "[SV-MT5] Unlinked ephemeral startup.ini") &
fi

# 4. Anti-Update Lock: ensure liveupdate cannot be modified or replaced
rm -rf /opt/mt5/terminal/liveupdate
touch /opt/mt5/terminal/liveupdate
chmod 000 /opt/mt5/terminal/liveupdate

# 5. Launch MetaTrader 5 in portable mode
echo "[SV-MT5] Launching terminal64.exe in portable mode..."
if [ -f "$STARTUP_INI" ]; then
    wine /opt/mt5/terminal/terminal64.exe /portable "/config:$STARTUP_INI" &
else
    wine /opt/mt5/terminal/terminal64.exe /portable &
fi
TERMINAL_PID=$!

# 6. Wait on terminal process
wait $TERMINAL_PID
