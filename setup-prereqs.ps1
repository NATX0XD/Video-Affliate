# setup-prereqs.ps1 - ติดตั้งเครื่องมือทั้งหมดด้วยการโหลดตรง (ไม่ใช้ winget ไม่ต้องสิทธิ์แอดมิน)
# ลง: Python 3.11, adb, scrcpy v4.0, ffmpeg (+ ใส่ PATH), pip deps, (Node เฉพาะตอนต้อง build เว็บ)
# รัน:  powershell -ExecutionPolicy Bypass -File setup-prereqs.ps1
#
# หลักการ: แต่ละขั้นแยกกัน ล้มขั้นไหนก็บอกชัด ๆ แล้วไปต่อ (ยกเว้น Python + pip ที่ขาดไม่ได้)
# ทุกอย่างเขียนลง log ไฟล์เดียว ผู้ใช้ส่งไฟล์นี้มาให้ดูได้เลยเวลาติดปัญหา

$ProgressPreference = "SilentlyContinue"   # เร็วขึ้นมากตอน Invoke-WebRequest
$root  = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
# บางเครื่อง (โปรไฟล์พัง / รันข้ามผู้ใช้) ไม่มี LOCALAPPDATA — เดิมพังตรงนี้เลยไม่มี log ให้ดู
if (-not $env:LOCALAPPDATA) { $env:LOCALAPPDATA = Join-Path $env:USERPROFILE "AppData\Local" }
$tools = Join-Path $env:LOCALAPPDATA "vgap-tools"
New-Item -ItemType Directory -Force -Path $tools | Out-Null
$LogFile = Join-Path $tools "setup-log.txt"
# Append ไม่ใช่ overwrite — ติดตั้ง.bat เขียนหัว log ไว้ก่อนแล้ว (ไว้ดูว่า PowerShell ได้เริ่มจริงไหม)
"=== VDO Gen Auto Pilot setup · $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File $LogFile -Append -Encoding utf8
# ธงบอก .bat ว่าสคริปต์นี้ "เริ่มรันแล้วจริง" — ถ้าไม่มีธง แปลว่า PowerShell โหลดไฟล์ไม่ได้ (นโยบาย/AV) ไม่ใช่ติดตั้งล้ม
New-Item -ItemType File -Force -Path (Join-Path $tools "started.flag") | Out-Null

$script:Failures = @()

function Log($msg) {
  $msg | Out-File $LogFile -Append -Encoding utf8
}
function Say($msg, $color = "Gray") {
  Write-Host $msg -ForegroundColor $color
  Log $msg
}
function Step($name, [scriptblock]$body, [switch]$Required) {
  Say "`n=== $name ===" "Cyan"
  try {
    & $body
    Say "  OK" "Green"
    return $true
  } catch {
    $err = $_.Exception.Message
    Say "  ล้มเหลว: $err" "Yellow"
    Log ($_ | Out-String)
    $script:Failures += "$name : $err"
    if ($Required) { throw "ขั้นที่จำเป็นล้มเหลว: $name" }
    return $false
  }
}
function Download($url, $dest) {
  # ลอง 3 ครั้ง — เน็ตสะดุดบ่อยกว่าที่คิด และ TLS 1.2 ต้องบังคับบน Windows รุ่นเก่า
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  for ($i = 1; $i -le 3; $i++) {
    try {
      Log "  download ($i/3): $url"
      Invoke-WebRequest $url -OutFile $dest -UseBasicParsing -TimeoutSec 300
      if ((Get-Item $dest).Length -lt 1024) { throw "ไฟล์ที่โหลดมาเล็กผิดปกติ" }
      return
    } catch {
      if ($i -eq 3) { throw "โหลดไม่สำเร็จหลังลอง 3 ครั้ง: $url — $($_.Exception.Message)" }
      Start-Sleep -Seconds 3
    }
  }
}
function Add-UserPath($dir) {
  if (-not $dir -or -not (Test-Path $dir)) { throw "ไม่พบโฟลเดอร์ที่จะใส่ PATH: '$dir'" }
  $cur = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($cur -notlike "*$dir*") { [Environment]::SetEnvironmentVariable("Path", "$dir;$cur", "User") }
  $env:Path = "$dir;$env:Path"
  Log "  PATH += $dir"
}
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
}
function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function FirstDir($path) {
  $d = Get-ChildItem $path -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($d) { return $d.FullName }
  return $path      # zip บางตัวแตกไฟล์ไว้ที่รากเลย ไม่มีโฟลเดอร์ย่อย
}

Say "log เก็บที่: $LogFile" "DarkGray"
Log "PowerShell $($PSVersionTable.PSVersion) · OS $([Environment]::OSVersion.VersionString)"

# ── Python 3.11 (จำเป็น) ───────────────────────────────────────────────────
$pyDir = "$env:LOCALAPPDATA\Programs\Python\Python311"
$PY311 = "$pyDir\python.exe"
Step "[1/5] Python 3.11" {
  # บังคับ 3.11 โดยเฉพาะ — เครื่องที่มี python 3.13 จะไม่มี wheel ของ Pillow แล้ว build ล้ม
  if (Test-Path $PY311) {
    Say "  มีอยู่แล้ว: $PY311"
  } else {
    $py = "$tools\python-3.11.9-amd64.exe"
    Say "  โหลดตัวติดตั้ง Python 3.11 ..."
    Download "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe" $py
    Say "  กำลังติดตั้ง (เฉพาะผู้ใช้นี้ ไม่ต้องแอดมิน) ..."
    # ★ Include_launcher=0 + InstallLauncherAllUsers=0 สำคัญมาก
    #   ดีฟอลต์ของ Python คือลง py.exe ให้ทุกผู้ใช้ (ลง C:\Windows) → เด้ง UAC ขอรหัสแอดมิน
    #   บัญชีที่ไม่ใช่แอดมินจะติดตั้งไม่ได้เลย เราเรียก python.exe ด้วยพาธเต็มอยู่แล้ว ไม่ต้องใช้ py.exe
    #   Include_test=0 ตัด test suite ~30MB ที่ไม่ได้ใช้
    $pyArgs = @("/quiet","InstallAllUsers=0","PrependPath=1","Include_pip=1",
              "Include_launcher=0","InstallLauncherAllUsers=0","Include_test=0")
    Log "  python installer args: $($pyArgs -join ' ')"
    $p = Start-Process $py -ArgumentList $pyArgs -Wait -PassThru
    Log "  installer exit code: $($p.ExitCode)"
    Refresh-Path
    if (-not (Test-Path $PY311)) {
      # 1602 = ผู้ใช้กดยกเลิก · 1223 = กด No ที่กล่อง UAC
      if ($p.ExitCode -in 1602,1223) {
        throw "ติดตั้ง Python ถูกยกเลิก (exit=$($p.ExitCode)) — ถ้ามีกล่องขอรหัสผ่านแอดมินเด้งขึ้นมา แปลว่าเจอเวอร์ชันเก่า ให้โหลดตัวติดตั้งใหม่จากหน้าเว็บ"
      }
      throw "ติดตั้ง Python แล้วแต่ไม่พบ $PY311 (exit=$($p.ExitCode)) — ถ้ามี Antivirus/SmartScreen บล็อกให้อนุญาตแล้วรันใหม่"
    }
  }
  Add-UserPath $pyDir
  Add-UserPath "$pyDir\Scripts"
  $v = & $PY311 --version 2>&1
  Say "  $v"
} -Required

# ── adb ────────────────────────────────────────────────────────────────────
Step "[2/5] adb (Android platform-tools)" {
  if (Have "adb") { Say "  มีอยู่แล้ว"; return }
  Download "https://dl.google.com/android/repository/platform-tools-latest-windows.zip" "$tools\pt.zip"
  Expand-Archive "$tools\pt.zip" -DestinationPath $tools -Force
  Add-UserPath "$tools\platform-tools"
}

# ── scrcpy (ต้องเป็น 4.0 ให้ตรงกับโค้ด ไม่งั้น server abort แล้วโพสต์ล้ม) ──
Step "[3/5] scrcpy v4.0" {
  if (Have "scrcpy") { Say "  มีอยู่แล้ว"; return }
  Download "https://github.com/Genymobile/scrcpy/releases/download/v4.0/scrcpy-win64-v4.0.zip" "$tools\scrcpy.zip"
  Expand-Archive "$tools\scrcpy.zip" -DestinationPath "$tools\scrcpy" -Force
  $scd = FirstDir "$tools\scrcpy"
  if (-not (Test-Path (Join-Path $scd "scrcpy.exe"))) { throw "แตกไฟล์ scrcpy แล้วไม่เจอ scrcpy.exe ใน $scd" }
  Add-UserPath $scd
}

# ── ffmpeg (ใช้ต่อคลิป 20/30 วิ — ขาดได้ แต่คลิปยาวจะต่อไม่ได้) ──────────
Step "[4/5] ffmpeg" {
  if (Have "ffmpeg") { Say "  มีอยู่แล้ว"; return }
  Download "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip" "$tools\ff.zip"
  Expand-Archive "$tools\ff.zip" -DestinationPath "$tools\ff" -Force
  $ffexe = Get-ChildItem "$tools\ff" -Recurse -Filter ffmpeg.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $ffexe) { throw "แตกไฟล์ ffmpeg แล้วไม่เจอ ffmpeg.exe" }
  Add-UserPath $ffexe.Directory.FullName
}

Refresh-Path

# ── ไลบรารี Python (จำเป็น) + หน้าเว็บ ────────────────────────────────────
Step "[5/5] ไลบรารี Python" {
  Push-Location (Join-Path $root "desktop")
  try {
    & $PY311 -m pip install --upgrade pip 2>&1 | Tee-Object -Variable o | Out-Null
    Log ($o -join "`n")
    & $PY311 -m pip install -r requirements.txt 2>&1 | Tee-Object -Variable o2 | Out-Null
    Log ($o2 -join "`n")
    if ($LASTEXITCODE -ne 0) { throw "pip install ล้มเหลว (ดูรายละเอียดใน $LogFile)" }
  } finally { Pop-Location }
} -Required

# หน้าเว็บ: ปกติแจกมาพร้อม web\out แล้ว → ไม่ต้องใช้ Node เลย
if (Test-Path (Join-Path $root "web\out\index.html")) {
  Say "`nหน้าเว็บ: มี web\out พร้อมแล้ว — ข้ามการติดตั้ง Node" "Green"
} else {
  Step "หน้าเว็บ (ต้อง build เอง — โหลด Node)" {
    if (-not (Have "node")) {
      $idx = Invoke-RestMethod "https://nodejs.org/dist/index.json" -TimeoutSec 60
      $lts = ($idx | Where-Object { $_.lts -and $_.version -like 'v20.*' } | Select-Object -First 1).version
      if (-not $lts) { $lts = ($idx | Where-Object { $_.lts } | Select-Object -First 1).version }
      Download "https://nodejs.org/dist/$lts/node-$lts-win-x64.zip" "$tools\node.zip"
      Expand-Archive "$tools\node.zip" -DestinationPath "$tools\node" -Force
      Add-UserPath (FirstDir "$tools\node")
    }
    Push-Location (Join-Path $root "web")
    try { npm install; npm run build } finally { Pop-Location }
  }
}

# ── สรุปผล ────────────────────────────────────────────────────────────────
Say "`n--- ตรวจเครื่องมือ ---" "Cyan"
$missing = @()
foreach ($c in "python","adb","scrcpy","ffmpeg") {
  $ok = Have $c
  if (-not $ok -and $c -eq "python") { $ok = Test-Path $PY311 }
  if (-not $ok) { $missing += $c }
  Say ("  {0,-8} {1}" -f $c, $(if ($ok) { "OK" } else { "ไม่พบ" })) $(if ($ok) { "Green" } else { "Yellow" })
}

if ($script:Failures.Count -gt 0) {
  Say "`nติดตั้งเสร็จ แต่มีบางขั้นที่ล้มเหลว:" "Yellow"
  foreach ($f in $script:Failures) { Say "  - $f" "Yellow" }
  Say "  ผลกระทบ: adb ขาด = โพสต์ไม่ได้ · scrcpy ขาด = ดูจอสดไม่ได้ · ffmpeg ขาด = ต่อคลิป 20/30 วิ ไม่ได้" "Yellow"
  Say "  log เต็ม: $LogFile" "DarkGray"
} else {
  Say "`nติดตั้งครบทุกอย่างแล้ว" "Green"
}

Say "`nเปิดโปรแกรมได้จากทางลัดบน Desktop หรือไฟล์ 'เปิดโปรแกรม.vbs'" "Green"
exit 0
