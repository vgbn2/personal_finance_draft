# syntax=docker/dockerfile:1
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV WINEARCH=win64
ENV WINEPREFIX=/opt/mt5/.wine
ENV DISPLAY=:99
ENV MT5_HOME=/opt/mt5

RUN dpkg --add-architecture i386 && \
    mkdir -pm1777 /tmp/.X11-unix && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        curl ca-certificates gnupg2 software-properties-common \
        xvfb cabextract procps netcat-openbsd winetricks && \
    mkdir -pm755 /etc/apt/keyrings && \
    curl -fsSL https://dl.winehq.org/wine-builds/winehq.key | gpg --dearmor -o /etc/apt/keyrings/winehq-archive.key && \
    curl -fsSL https://dl.winehq.org/wine-builds/ubuntu/dists/jammy/winehq-jammy.sources -o /etc/apt/sources.list.d/winehq-jammy.sources && \
    apt-get update && \
    apt-get install -y --install-recommends winehq-staging && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 -d /opt/mt5 mt5 && \
    mkdir -p /opt/mt5/terminal /opt/mt5/config /opt/mt5/.wine && \
    chown -R mt5:mt5 /opt/mt5

USER mt5
WORKDIR /opt/mt5

RUN Xvfb :99 -screen 0 1024x768x16 -nolisten tcp -ac +extension GLX & \
    XVFB_PID=$! && \
    sleep 2 && \
    WINEDEBUG=-all wineboot --init && \
    wineserver -w && \
    WINEDEBUG=-all wine reg add "HKEY_CURRENT_USER\Software\Wine\Drivers" /v Audio /t REG_SZ /d "" /f && \
    wineserver -w && \
    kill $XVFB_PID 2>/dev/null || true

COPY --chown=mt5:mt5 entrypoint.sh /opt/mt5/entrypoint.sh
RUN chmod +x /opt/mt5/entrypoint.sh

EXPOSE 8282
ENTRYPOINT ["/opt/mt5/entrypoint.sh"]
