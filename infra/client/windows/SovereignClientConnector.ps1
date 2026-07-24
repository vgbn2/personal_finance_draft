[CmdletBinding()]
param(
    [string]$ConfigPath = $(Join-Path $(if ($env:APPDATA) { $env:APPDATA } else { $env:LOCALAPPDATA }) 'Sovereign\connector.conf'),
    [switch]$OpenCli
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

function Read-ConnectorConfig {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw 'connector config file is missing'
    }
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) { continue }
        $parts = $line.Split(@('='), 2)
        if ($parts.Count -ne 2) { throw 'invalid connector config line' }
        $values[$parts[0]] = $parts[1]
    }
    return $values
}

function Get-RequiredSetting {
    param([hashtable]$Config, [string]$Name)
    if (-not $Config.ContainsKey($Name) -or [string]::IsNullOrWhiteSpace($Config[$Name])) {
        throw "missing connector setting: $Name"
    }
    return [string]$Config[$Name]
}

function Write-ConnectorStatus {
    param([string]$State, [int]$Attempt, [string]$Detail)
    $payload = [ordered]@{
        state = $State
        connector_pid = $PID
        attempt = $Attempt
        detail = $Detail
        updated_at = [DateTime]::UtcNow.ToString('o')
    }
    $temporary = "$script:StatusPath.tmp.$PID"
    $payload | ConvertTo-Json | Set-Content -LiteralPath $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $script:StatusPath -Force
}

function Write-ConnectorLog {
    param([string]$Message)
    $timestamp = [DateTime]::UtcNow.ToString('o')
    Add-Content -LiteralPath $script:LogPath -Value "$timestamp $Message" -Encoding UTF8
}

function Test-Health {
    $token = (Get-Content -LiteralPath $script:TokenFile -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($token)) { return $false }
    try {
        $response = Invoke-WebRequest `
            -UseBasicParsing `
            -Uri "http://$($script:LocalBind):$($script:LocalPort)/api/client/status" `
            -Headers @{ 'X-Sovereign-Token' = $token } `
            -Method Get `
            -TimeoutSec $script:HealthTimeoutSeconds
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
    } catch {
        return $false
    }
}

function Get-LogonMarkerPath {
    $logonId = ''
    try {
        $match = (& whoami.exe /logonid 2>$null | Select-String -Pattern 'S-1-5-5-\d+-\d+' | Select-Object -First 1)
        if ($match) { $logonId = $match.Matches[0].Value }
    } catch {
        $logonId = ''
    }
    if ([string]::IsNullOrWhiteSpace($logonId)) {
        $logonId = "session-$([System.Diagnostics.Process]::GetCurrentProcess().SessionId)"
    }
    $safeId = $logonId -replace '[^A-Za-z0-9-]', '-'
    return Join-Path $script:RuntimeRoot "cli-auto-opened-$safeId"
}

function Start-ConfiguredCli {
    param([switch]$Minimized, [switch]$Wait)
    if ([string]::IsNullOrWhiteSpace($script:CliLauncher)) {
        throw 'no CLI launcher is configured'
    }
    if (-not (Test-Path -LiteralPath $script:CliLauncher -PathType Leaf)) {
        throw 'configured CLI launcher is missing'
    }
    $start = @{
        FilePath = $script:CliLauncher
        PassThru = $true
    }
    if ($Minimized) { $start.WindowStyle = 'Minimized' }
    if ($Wait) { $start.Wait = $true }
    $oldUrl = $env:SOVEREIGN_REMOTE_URL
    $oldTokenFile = $env:SOVEREIGN_CLIENT_TOKEN_FILE
    try {
        $env:SOVEREIGN_REMOTE_URL = "http://$($script:LocalBind):$($script:LocalPort)"
        $env:SOVEREIGN_CLIENT_TOKEN_FILE = $script:TokenFile
        return Start-Process @start
    } finally {
        $env:SOVEREIGN_REMOTE_URL = $oldUrl
        $env:SOVEREIGN_CLIENT_TOKEN_FILE = $oldTokenFile
    }
}

function Request-AutoOpen {
    if (-not $script:AutoOpen) { return }
    $marker = Get-LogonMarkerPath
    if (Test-Path -LiteralPath $marker) { return }
    New-Item -ItemType File -Path $marker -ErrorAction Stop | Out-Null
    try {
        Start-ConfiguredCli -Minimized | Out-Null
        Write-ConnectorLog 'CLI auto-open requested'
    } catch {
        Remove-Item -LiteralPath $marker -Force -ErrorAction SilentlyContinue
        Write-ConnectorLog 'CLI auto-open failed'
    }
}

function Quote-ProcessArgument {
    param([string]$Value)
    return '"' + ($Value -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
}

$config = Read-ConnectorConfig -Path $ConfigPath
$script:CentralHost = Get-RequiredSetting $config 'CENTRAL_HOST'
$script:CentralUser = Get-RequiredSetting $config 'CENTRAL_USER'
$script:IdentityFile = Get-RequiredSetting $config 'IDENTITY_FILE'
$script:LocalBind = Get-RequiredSetting $config 'LOCAL_BIND'
$script:LocalPort = [int](Get-RequiredSetting $config 'LOCAL_PORT')
$script:RemoteBind = Get-RequiredSetting $config 'REMOTE_BIND'
$script:RemotePort = [int](Get-RequiredSetting $config 'REMOTE_PORT')
$script:TokenFile = Get-RequiredSetting $config 'TOKEN_FILE'
$script:CliLauncher = if ($config.ContainsKey('CLI_LAUNCHER')) { [string]$config['CLI_LAUNCHER'] } else { '' }
$script:AutoOpen = $config.ContainsKey('AUTO_OPEN') -and $config['AUTO_OPEN'] -eq 'true'
$retryInitialSeconds = [int](Get-RequiredSetting $config 'RETRY_INITIAL_SECONDS')
$retryMaxSeconds = [int](Get-RequiredSetting $config 'RETRY_MAX_SECONDS')
$script:HealthTimeoutSeconds = [int](Get-RequiredSetting $config 'HEALTH_TIMEOUT_SECONDS')
$healthRetrySeconds = [int](Get-RequiredSetting $config 'HEALTH_RETRY_SECONDS')

if ($script:CentralHost -notmatch '^[A-Za-z0-9._:-]+$') { throw 'invalid central host' }
if ($script:CentralUser -notmatch '^[A-Za-z0-9._-]+$') { throw 'invalid central user' }
if ($script:LocalBind -notmatch '^[A-Za-z0-9.:-]+$') { throw 'invalid local bind' }
if ($script:RemoteBind -notmatch '^[A-Za-z0-9.:-]+$') { throw 'invalid remote bind' }
if ($script:LocalPort -lt 1 -or $script:LocalPort -gt 65535) { throw 'invalid local port' }
if ($script:RemotePort -lt 1 -or $script:RemotePort -gt 65535) { throw 'invalid remote port' }
if ($retryInitialSeconds -lt 1 -or $retryMaxSeconds -lt $retryInitialSeconds) { throw 'invalid retry bounds' }
if ($script:HealthTimeoutSeconds -lt 1 -or $healthRetrySeconds -lt 1) { throw 'invalid health timing' }
if (-not [IO.Path]::IsPathRooted($script:IdentityFile) -or -not (Test-Path -LiteralPath $script:IdentityFile)) {
    throw 'SSH identity file is missing'
}
if (-not [IO.Path]::IsPathRooted($script:TokenFile) -or -not (Test-Path -LiteralPath $script:TokenFile)) {
    throw 'client token file is missing'
}
$tokenValue = (Get-Content -LiteralPath $script:TokenFile -Raw).Trim()
if ($tokenValue -notmatch '^[A-Za-z0-9._~-]{24,256}$') {
    throw 'client token must be 24-256 URL-safe characters'
}

$localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [IO.Path]::GetTempPath() }
$script:StateRoot = Join-Path $localAppData 'Sovereign\Client\state'
$script:RuntimeRoot = Join-Path $localAppData 'Sovereign\Client\runtime'
New-Item -ItemType Directory -Path $script:StateRoot, $script:RuntimeRoot -Force | Out-Null
$script:StatusPath = Join-Path $script:StateRoot 'status.json'
$script:LogPath = Join-Path $script:StateRoot 'connector.log'

if ($OpenCli) {
    if (-not (Test-Health)) {
        Write-Error 'central host health check failed'
        exit 69
    }
    Start-ConfiguredCli -Wait | Out-Null
    exit 0
}

$sshCommand = (Get-Command 'ssh.exe' -ErrorAction Stop).Source
$sha256 = [Security.Cryptography.SHA256]::Create()
try {
    $hashBytes = $sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($ConfigPath)))
    $mutexHash = ([BitConverter]::ToString($hashBytes).Replace('-', '')).Substring(0, 16)
} finally {
    $sha256.Dispose()
}
$mutex = New-Object Threading.Mutex($false, "Local\SovereignClientConnector-$mutexHash")
$hasMutex = $false
try {
    try {
        $hasMutex = $mutex.WaitOne(0)
    } catch [Threading.AbandonedMutexException] {
        $hasMutex = $true
    }
    if (-not $hasMutex) {
        Write-Error 'connector is already running'
        exit 73
    }

    $attempt = 0
    $delay = $retryInitialSeconds
    while ($true) {
        $attempt++
        Write-ConnectorStatus 'connecting' $attempt 'opening SSH local forward'
        Write-ConnectorLog "connector attempt $attempt started"

        $sshArguments = @(
            '-N', '-T',
            '-o', 'BatchMode=yes',
            '-o', 'ExitOnForwardFailure=yes',
            '-o', 'ConnectTimeout=10',
            '-o', 'ServerAliveInterval=30',
            '-o', 'ServerAliveCountMax=3',
            '-i', $script:IdentityFile,
            '-L', "$($script:LocalBind):$($script:LocalPort):$($script:RemoteBind):$($script:RemotePort)",
            "$($script:CentralUser)@$($script:CentralHost)"
        )
        $argumentString = ($sshArguments | ForEach-Object { Quote-ProcessArgument ([string]$_) }) -join ' '
        $sshProcess = Start-Process -FilePath $sshCommand -ArgumentList $argumentString -WindowStyle Hidden -PassThru
        $healthState = 'connecting'

        while (-not $sshProcess.HasExited) {
            if (Test-Health) {
                $delay = $retryInitialSeconds
                if ($healthState -ne 'connected') {
                    Write-ConnectorStatus 'connected' $attempt 'authenticated API probe passed'
                    $healthState = 'connected'
                }
                Request-AutoOpen
            } elseif ($healthState -ne 'host_unavailable') {
                Write-ConnectorStatus 'host_unavailable' $attempt 'authenticated API probe failed'
                $healthState = 'host_unavailable'
            }
            Start-Sleep -Seconds $healthRetrySeconds
            $sshProcess.Refresh()
        }
        Write-ConnectorStatus 'reconnecting' $attempt "SSH forward exited with status $($sshProcess.ExitCode)"
        Write-ConnectorLog 'SSH forward exited; retry scheduled'
        Start-Sleep -Seconds $delay
        $delay = [Math]::Min($retryMaxSeconds, $delay * 2)
    }
} finally {
    Write-ConnectorStatus 'stopped' 0 'connector stopped'
    if ($hasMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
