#!/bin/bash
set -e

echo "[SV-MT5] Starting Headless MetaTrader 5 on display :99..."

# 1. Start Xvfb Virtual Framebuffer
Xvfb :99 -screen 0 1024x768x16 -nolisten tcp -ac +extension GLX &
XVFB_PID=$!
sleep 2

# 2. Trap signals for clean wine shutdown
cleanup() {
    echo "[SV-MT5] Shutting down MT5 and Wine server..."
    wineserver -k || true
    kill $XVFB_PID || true
    exit 0
}
trap cleanup SIGTERM SIGINT

# 3. Create ephemeral startup.ini if credentials are provided
STARTUP_INI="/opt/mt5/terminal/startup.ini"
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
wine /opt/mt5/terminal/terminal64.exe /portable /config:startup.ini &
TERMINAL_PID=$!

# 6. Wait on terminal process
wait $TERMINAL_PID
