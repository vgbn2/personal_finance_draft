[CmdletBinding()]
param(
    [ValidateSet('Install', 'Status', 'Logs', 'Restart', 'Open', 'Uninstall')]
    [string]$Action = 'Install',
    [string]$CentralHost,
    [string]$CentralUser,
    [string]$IdentityFile,
    [string]$TokenFile,
    [int]$LocalPort = 8788,
    [int]$RemotePort = 8787,
    [string]$RemoteBind = '127.0.0.1',
    [int]$RefreshSeconds = 10,
    [string]$CliLauncher,
    [switch]$AutoOpen,
    [switch]$NoStart
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$taskName = 'Sovereign Client Connector'
$roamingRoot = Join-Path $(if ($env:APPDATA) { $env:APPDATA } else { $env:LOCALAPPDATA }) 'Sovereign'
$installRoot = Join-Path $env:LOCALAPPDATA 'Sovereign\Client'
$stateRoot = Join-Path $installRoot 'state'
$configPath = Join-Path $roamingRoot 'connector.conf'
$clientJsonPath = Join-Path $roamingRoot 'client.json'
$installedTokenPath = Join-Path $roamingRoot 'client.token'
$installedSupervisor = Join-Path $installRoot 'SovereignClientConnector.ps1'
$installedLauncher = Join-Path $installRoot 'LaunchRemoteCli.cmd'

function Protect-PrivatePath {
    param([string]$Path)
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $Path '/inheritance:r' '/grant:r' "${currentUser}:F" 'SYSTEM:F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "failed to protect private path: $Path" }
}

function Show-Status {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        Write-Output "task_state=$($task.State)"
    } else {
        Write-Output 'task_state=not_installed'
    }
    $statusPath = Join-Path $stateRoot 'status.json'
    if (Test-Path -LiteralPath $statusPath) { Get-Content -LiteralPath $statusPath }
}

switch ($Action) {
    'Status' {
        Show-Status
        exit 0
    }
    'Logs' {
        $logPath = Join-Path $stateRoot 'connector.log'
        if (Test-Path -LiteralPath $logPath) { Get-Content -LiteralPath $logPath -Tail 200 }
        exit 0
    }
    'Restart' {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Start-ScheduledTask -TaskName $taskName
        Show-Status
        exit 0
    }
    'Open' {
        if (-not (Test-Path -LiteralPath $installedSupervisor)) { throw 'client connector is not installed' }
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installedSupervisor -ConfigPath $configPath -OpenCli
        exit $LASTEXITCODE
    }
    'Uninstall' {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $installRoot -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $configPath, $clientJsonPath, $installedTokenPath -Force -ErrorAction SilentlyContinue
        if ((Test-Path -LiteralPath $roamingRoot) -and -not (Get-ChildItem -LiteralPath $roamingRoot -Force)) {
            Remove-Item -LiteralPath $roamingRoot -Force
        }
        Write-Output 'Sovereign client connector uninstalled'
        exit 0
    }
}

if ($CentralHost -notmatch '^[A-Za-z0-9._:-]+$') { throw 'valid -CentralHost is required' }
if ($CentralUser -notmatch '^[A-Za-z0-9._-]+$') { throw 'valid -CentralUser is required' }
if ($RemoteBind -notmatch '^[A-Za-z0-9.:-]+$') { throw 'invalid -RemoteBind' }
if ($LocalPort -lt 1 -or $LocalPort -gt 65535) { throw 'invalid -LocalPort' }
if ($RemotePort -lt 1 -or $RemotePort -gt 65535) { throw 'invalid -RemotePort' }
if ($RefreshSeconds -lt 2) { throw '-RefreshSeconds must be at least 2' }
if (-not [IO.Path]::IsPathRooted($IdentityFile) -or -not (Test-Path -LiteralPath $IdentityFile)) {
    throw 'existing absolute -IdentityFile is required'
}
if (-not [IO.Path]::IsPathRooted($TokenFile) -or -not (Test-Path -LiteralPath $TokenFile)) {
    throw 'existing absolute -TokenFile is required; token text is not accepted'
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceSupervisor = Join-Path $scriptDir 'SovereignClientConnector.ps1'
if (-not (Test-Path -LiteralPath $sourceSupervisor)) { throw 'connector supervisor source is missing' }
New-Item -ItemType Directory -Path $roamingRoot, $installRoot, $stateRoot -Force | Out-Null
Copy-Item -LiteralPath $sourceSupervisor -Destination $installedSupervisor -Force
Copy-Item -LiteralPath $TokenFile -Destination $installedTokenPath -Force

if ([string]::IsNullOrWhiteSpace($CliLauncher)) {
    $repoRoot = [IO.Path]::GetFullPath((Join-Path $scriptDir '..\..\..'))
    $cliEntry = Join-Path $repoRoot 'backend\cli\sovereign_cli.js'
    $node = (Get-Command 'node.exe' -ErrorAction Stop).Source
    if (-not (Test-Path -LiteralPath $cliEntry)) {
        throw 'cannot find backend\cli\sovereign_cli.js; pass -CliLauncher'
    }
    @(
        '@echo off',
        "cd /d `"$repoRoot`"",
        "`"$node`" `"$cliEntry`" remote status --watch"
    ) | Set-Content -LiteralPath $installedLauncher -Encoding ASCII
    $CliLauncher = $installedLauncher
} elseif (-not [IO.Path]::IsPathRooted($CliLauncher) -or -not (Test-Path -LiteralPath $CliLauncher)) {
    throw '-CliLauncher must be an existing absolute path'
}

@(
    "CENTRAL_HOST=$CentralHost",
    "CENTRAL_USER=$CentralUser",
    "IDENTITY_FILE=$([IO.Path]::GetFullPath($IdentityFile))",
    'LOCAL_BIND=127.0.0.1',
    "LOCAL_PORT=$LocalPort",
    "REMOTE_BIND=$RemoteBind",
    "REMOTE_PORT=$RemotePort",
    "TOKEN_FILE=$installedTokenPath",
    "AUTO_OPEN=$($AutoOpen.IsPresent.ToString().ToLowerInvariant())",
    "CLI_LAUNCHER=$CliLauncher",
    'RETRY_INITIAL_SECONDS=1',
    'RETRY_MAX_SECONDS=60',
    'HEALTH_TIMEOUT_SECONDS=3',
    'HEALTH_RETRY_SECONDS=2'
) | Set-Content -LiteralPath $configPath -Encoding UTF8

[ordered]@{
    base_url = "http://127.0.0.1:$LocalPort"
    refresh_seconds = $RefreshSeconds
} | ConvertTo-Json | Set-Content -LiteralPath $clientJsonPath -Encoding UTF8

Protect-PrivatePath -Path $roamingRoot
Protect-PrivatePath -Path $configPath
Protect-PrivatePath -Path $clientJsonPath
Protect-PrivatePath -Path $installedTokenPath

$powerShell = (Get-Command 'powershell.exe' -ErrorAction Stop).Source
$actionArguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$installedSupervisor`" -ConfigPath `"$configPath`""
$taskAction = New-ScheduledTaskAction -Execute $powerShell -Argument $actionArguments
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
$taskSettings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew `
    -Hidden
$taskPrincipal = New-ScheduledTaskPrincipal `
    -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive `
    -RunLevel Limited
Register-ScheduledTask `
    -TaskName $taskName `
    -Action $taskAction `
    -Trigger $taskTrigger `
    -Settings $taskSettings `
    -Principal $taskPrincipal `
    -Force | Out-Null

if (-not $NoStart) { Start-ScheduledTask -TaskName $taskName }
Write-Output 'Sovereign client connector installed'
Write-Output "Auto-open CLI: $($AutoOpen.IsPresent.ToString().ToLowerInvariant())"
