param(
  [switch]$NoStart,
  [switch]$ForceDocker
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Set-Location (Split-Path -Parent $PSScriptRoot)
$PnpmVersion = if ($env:PNPM_VERSION) { $env:PNPM_VERSION } else { "9.15.0" }

function Has($Command) {
  return [bool](Get-Command $Command -ErrorAction SilentlyContinue)
}

function Refresh-Path {
  $extra = @(
    "$env:ProgramFiles\nodejs",
    "$env:ProgramFiles\Docker\Docker\resources\bin",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links",
    "$env:APPDATA\npm"
  )
  $env:Path = ($env:Path + ";" + ($extra -join ";"))
}

function Database-Configured {
  if ($env:ZLEAP_DATABASE_URL -or $env:DATABASE_URL) { return $true }

  $envFiles = @(
    (Join-Path (Get-Location) ".env.local"),
    (Join-Path (Get-Location) ".env"),
    (Join-Path $env:USERPROFILE ".zleap\.env")
  )
  foreach ($file in $envFiles) {
    if ((Test-Path $file) -and (Select-String -Path $file -Pattern '^\s*(ZLEAP_DATABASE_URL|DATABASE_URL)\s*=\s*\S' -Quiet)) {
      return $true
    }
  }
  return $false
}

function Is-VirtualMachine {
  try {
    $computer = Get-CimInstance -ClassName Win32_ComputerSystem
    $manufacturer = [string]$computer.Manufacturer
    $model = [string]$computer.Model
    return (
      ($model -match "Virtual Machine|VMware|VirtualBox|KVM|Xen|QEMU") -or
      (($manufacturer -match "Microsoft Corporation") -and ($model -match "Virtual"))
    )
  } catch {
    return $false
  }
}

function Node-Ok {
  if (-not (Has "node")) { return $false }
  $major = node -p "Number(process.versions.node.split('.')[0])"
  return [int]$major -ge 20
}

function Ensure-Winget {
  if (-not (Has "winget")) {
    throw "winget is required. Install App Installer from Microsoft Store, then rerun this script."
  }
}

function Ensure-Node {
  if (Node-Ok) { return }
  Ensure-Winget
  winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
  Refresh-Path
  if (-not (Node-Ok)) {
    throw "Node.js was installed, but this PowerShell session cannot find it yet. Open a new PowerShell window and rerun this script."
  }
}

function Ensure-Pnpm {
  if (Has "pnpm") { return }
  if (Has "corepack") {
    corepack enable
    corepack prepare "pnpm@$PnpmVersion" --activate
  }
  Refresh-Path
  if (-not (Has "pnpm")) {
    npm install -g "pnpm@$PnpmVersion"
  }
  Refresh-Path
  if (-not (Has "pnpm")) {
    throw "Failed to install pnpm. Open a new PowerShell window and rerun this script."
  }
}

function Docker-Ready {
  try {
    docker compose version *> $null
    if ($LASTEXITCODE -ne 0) { return $false }
    docker info *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Start-Postgres {
  docker compose up -d postgres
  if ($LASTEXITCODE -ne 0) {
    throw "Docker is available, but PostgreSQL could not be started. Check Docker Desktop and the compose output, or configure ZLEAP_DATABASE_URL with a reachable PostgreSQL + pgvector database."
  }
}

function Wait-Docker {
  for ($i = 0; $i -lt 80; $i++) {
    if (Docker-Ready) { return $true }
    Start-Sleep -Seconds 3
  }
  return $false
}

function Ensure-Docker {
  Refresh-Path
  if (Docker-Ready) { return }
  Ensure-Winget
  if (-not (Has "docker")) {
    winget install --id Docker.DockerDesktop -e --source winget --accept-package-agreements --accept-source-agreements
    Refresh-Path
  }
  $dockerDesktop = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dockerDesktop) {
    Start-Process $dockerDesktop
  }
  if (-not (Wait-Docker)) {
    throw "Docker Desktop did not become ready. Start Docker Desktop, enable nested virtualization if this is a VM, or configure ZLEAP_DATABASE_URL with a reachable PostgreSQL + pgvector database."
  }
}

Ensure-Node
Ensure-Pnpm
pnpm install

if (-not (Database-Configured)) {
  Refresh-Path
  if (Docker-Ready) {
    Start-Postgres
  } elseif ((Is-VirtualMachine) -and -not $ForceDocker) {
    throw "No database is configured and this Windows environment appears to be a virtual machine. Set ZLEAP_DATABASE_URL to a reachable PostgreSQL + pgvector database, or rerun with -ForceDocker if nested virtualization is enabled."
  } else {
    Ensure-Docker
    Start-Postgres
  }
}

if (-not $NoStart) {
  pnpm dev:web
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Setup complete."
Write-Host "Start WebUI with:"
Write-Host "  pnpm dev:web"
Write-Host ""
if (Database-Configured) {
  Write-Host "Database: using the configured PostgreSQL connection."
} else {
  Write-Host "Default local database:"
  Write-Host "  ZLEAP_DATABASE_URL=postgres://zleap:zleap@127.0.0.1:5433/zleap"
}
