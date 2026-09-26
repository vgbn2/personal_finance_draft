#!/bin/bash
set -e

echo "[SV-ALLINONE] Initializing Sovereign All-in-One Container..."

# 1. Clean up stale Xvfb locks
rm -f /tmp/.X11-unix/X99 /tmp/.X99-lock 2>/dev/null || true
mkdir -p /app/storage/data/cache /app/storage/data/ts /app/storage/logs /app/storage/runtime 2>/dev/null || true

# 2. Start Xvfb virtual framebuffer for headless Wine / MT5 if display :99 is specified
if [ "$DISPLAY" = ":99" ]; then
    echo "[SV-ALLINONE] Starting Xvfb virtual framebuffer on :99..."
    Xvfb :99 -screen 0 1024x768x16 -nolisten tcp -ac +extension GLX &
    XVFB_PID=$!
    for i in $(seq 1 30); do
        [ -S "/tmp/.X11-unix/X99" ] && break
        sleep 0.1
    done
fi

# 3. Graceful shutdown handler
cleanup() {
    echo "[SV-ALLINONE] Gracefully shutting down services..."
    if [ -n "$MT5_PID" ]; then
        kill "$MT5_PID" 2>/dev/null || true
    fi
    wineserver -k 2>/dev/null || true
    if [ -n "$XVFB_PID" ]; then
        kill "$XVFB_PID" 2>/dev/null || true
    fi
    exit 0
}
trap cleanup EXIT SIGTERM SIGINT

# 4. Optional: Start MT5 if terminal64.exe is mounted/present
if [ -f "/opt/mt5/terminal/terminal64.exe" ]; then
    echo "[SV-ALLINONE] Found MT5 terminal64.exe. Checking startup configuration..."
    CONFIG_DIR="/opt/mt5/config"
    mkdir -p "$CONFIG_DIR"
    chmod 700 "$CONFIG_DIR"
    STARTUP_INI="$CONFIG_DIR/startup.ini"

    if [ -n "$MT5_LOGIN" ] && [ -n "$MT5_PASSWORD" ] && [ -n "$MT5_SERVER" ]; then
        echo "[SV-ALLINONE] Generating ephemeral MT5 credentials config..."
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
        (sleep 5 && rm -f "$STARTUP_INI" && echo "[SV-ALLINONE] Unlinked ephemeral startup.ini") &
    fi

    # Anti-update lock
    rm -rf /opt/mt5/terminal/liveupdate 2>/dev/null || true
    touch /opt/mt5/terminal/liveupdate 2>/dev/null || true
    chmod 000 /opt/mt5/terminal/liveupdate 2>/dev/null || true

    echo "[SV-ALLINONE] Launching MT5 bridge under Wine..."
    if [ -f "$STARTUP_INI" ]; then
        wine /opt/mt5/terminal/terminal64.exe /portable "/config:$STARTUP_INI" &
    else
        wine /opt/mt5/terminal/terminal64.exe /portable &
    fi
    MT5_PID=$!
fi

# 5. Execute main container command (defaults to Express Web API server)
if [ "$#" -eq 0 ]; then
    exec node backend/api/app.js
else
    exec "$@"
fi
