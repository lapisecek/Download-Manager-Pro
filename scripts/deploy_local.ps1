$ErrorActionPreference = "Stop"

Write-Output "=== Veloce Local Deployment & Upgrade ==="

# 1. Terminate any running DM Pro or Veloce instances
Write-Output "[1/6] Stopping active download manager processes..."
Get-Process | Where-Object { $_.ProcessName -match "^(DM Pro|Veloce DM)$" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# 2. Clean up legacy DM Pro installation if present
$oldInstallDir = "$env:LOCALAPPDATA\Programs\customdownloadmanager"
$oldUninstaller = "$oldInstallDir\Uninstall DM Pro.exe"
if (Test-Path $oldUninstaller) {
    Write-Output "[2/6] Running silent uninstaller for old DM Pro..."
    Start-Process -FilePath $oldUninstaller -ArgumentList "/S" -Wait
    Start-Sleep -Seconds 2
}
if (Test-Path $oldInstallDir) {
    Remove-Item -Recurse -Force $oldInstallDir -ErrorAction SilentlyContinue
}
$oldLnk = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\DM Pro.lnk"
if (Test-Path $oldLnk) {
    Remove-Item -Force $oldLnk -ErrorAction SilentlyContinue
}
$oldDesktopLnk = "$env:USERPROFILE\Desktop\DM Pro.lnk"
if (Test-Path $oldDesktopLnk) {
    Remove-Item -Force $oldDesktopLnk -ErrorAction SilentlyContinue
}

# 3. Deploy latest Veloce DM release files
Write-Output "[3/6] Deploying latest Veloce DM release..."
$projectRoot = Split-Path -Parent $PSScriptRoot
$unpackedDir = Join-Path $projectRoot "release\win-unpacked"
$targetDir = "$env:LOCALAPPDATA\Programs\Veloce DM"

if (Test-Path $unpackedDir) {
    if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
    Copy-Item -Path "$unpackedDir\*" -Destination $targetDir -Recurse -Force
    Write-Output "[OK] Deployed release files to: $targetDir"
} else {
    Write-Warning "Unpacked build directory not found at $unpackedDir. Please run npm run build:exe first."
}

# 4. Create Desktop & Start Menu Shortcuts
Write-Output "[4/6] Creating shortcuts..."
$WshShell = New-Object -ComObject WScript.Shell
$veloceExe = "$targetDir\Veloce DM.exe"

if (Test-Path $veloceExe) {
    $desktopShortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Veloce DM.lnk")
    $desktopShortcut.TargetPath = $veloceExe
    $desktopShortcut.WorkingDirectory = $targetDir
    $desktopShortcut.IconLocation = "$veloceExe,0"
    $desktopShortcut.Save()

    $startMenuDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
    $startShortcut = $WshShell.CreateShortcut("$startMenuDir\Veloce DM.lnk")
    $startShortcut.TargetPath = $veloceExe
    $startShortcut.WorkingDirectory = $targetDir
    $startShortcut.IconLocation = "$veloceExe,0"
    $startShortcut.Save()
    Write-Output "[OK] Shortcuts created on Desktop and Start Menu"
}

# 5. Deploy Chrome Companion Extension to desktop folder for easy loading
Write-Output "[5/6] Deploying Chromium companion extension..."
$extTarget = "$env:USERPROFILE\Desktop\Veloce Companion Extension"
if (Test-Path $extTarget) {
    Remove-Item -Recurse -Force $extTarget -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $extTarget -Force | Out-Null
$extSource = Join-Path $projectRoot "extension"
Copy-Item -Path "$extSource\*" -Destination $extTarget -Recurse -Force
Write-Output "[OK] Companion extension deployed to: $extTarget"

# 6. Launch the updated Veloce DM
Write-Output "[6/6] Launching updated Veloce DM..."
if (Test-Path $veloceExe) {
    Start-Process -FilePath $veloceExe -WorkingDirectory $targetDir
    Write-Output "[OK] Veloce DM is now running successfully!"
} else {
    Write-Warning "Veloce executable not found at $veloceExe"
}

Write-Output "=== Deployment Complete ==="
