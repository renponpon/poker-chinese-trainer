param(
  [ValidateSet('Protect', 'Verify', 'VerifyDatabase')][string]$Mode = 'Verify',
  [Parameter(Mandatory)][string]$Name,
  [string]$ExpectedUserSid
)

$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'Windows DPAPI is required.' }
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
if ($Mode -eq 'Protect' -and (-not $ExpectedUserSid -or $currentIdentity.User.Value -ne $ExpectedUserSid)) {
  throw 'Run as the intended permanent Windows user and pass their SID explicitly.'
}
if ($Name -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*\.dpapi$') { throw 'Use a simple .dpapi filename.' }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$directory = Join-Path $root '.private-backups'
$path = Join-Path $directory $Name
$scope = [Security.Cryptography.DataProtectionScope]::CurrentUser
$entropy = [Text.Encoding]::UTF8.GetBytes('phrabit-cloud-learning-backup-v1')

function Assert-LearningSnapshot($Snapshot) {
  if ($Snapshot.format -ne 'phrabit-cloud-learning-backup-v1' -or $Snapshot.projectRef -ne 'whuatcawoezfrvzplmri') {
    throw 'Unexpected backup format or source project.'
  }
  $expected = @('saved_phrases', 'drill_items', 'phrases', 'srs_items', 'phrase_categories')
  if ((($Snapshot.tables.Keys | Sort-Object) -join ',') -ne (($expected | Sort-Object) -join ',')) { throw 'Unexpected table set.' }
  $counts = [ordered]@{}
  foreach ($table in $expected) {
    $rows = $Snapshot.tables[$table]
    if ($rows -isnot [Array]) { throw 'Every table must be an array.' }
    $counts[$table] = $rows.Count
    $keys = [Collections.Generic.HashSet[string]]::new()
    foreach ($row in $rows) {
      $key = switch ($table) {
        'drill_items' { $row.saved_phrase_id }
        'srs_items' { $row.phrase_id }
        'phrase_categories' { "$($row.user_id):$($row.id)" }
        default { $row.id }
      }
      if (-not $key -or -not $keys.Add([string]$key)) { throw 'Missing or duplicate row identifier.' }
    }
  }
  foreach ($relationship in @(@('drill_items', 'saved_phrases', 'saved_phrase_id'), @('srs_items', 'phrases', 'phrase_id'))) {
    $parents = @{}
    foreach ($row in $Snapshot.tables[$relationship[1]]) { $parents[[string]$row.id] = $row }
    foreach ($row in $Snapshot.tables[$relationship[0]]) {
      $parent = $parents[[string]$row[$relationship[2]]]
      if (-not $parent -or $parent.user_id -ne $row.user_id) { throw 'Broken phrase/schedule ownership relationship.' }
    }
  }
  return $counts
}

if ($Mode -eq 'Protect') {
  if ([IO.File]::Exists($path)) { throw 'Refusing to overwrite an existing backup.' }
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class BackupConsole {
  [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr GetStdHandle(int kind);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool GetConsoleMode(IntPtr handle, out uint mode);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool SetConsoleMode(IntPtr handle, uint mode);
}
'@
  $handle = [BackupConsole]::GetStdHandle(-10)
  [uint32]$previousMode = 0
  if (-not [BackupConsole]::GetConsoleMode($handle, [ref]$previousMode)) { throw 'An interactive no-echo input session is required.' }
  if (-not [BackupConsole]::SetConsoleMode($handle, ($previousMode -band (-bnot 4)))) { throw 'Could not disable input echo.' }
  Write-Output 'READY_FOR_JSON_CHUNKS'
  try {
    $length = 0
    if (-not [int]::TryParse([Console]::ReadLine(), [ref]$length) -or $length -lt 1 -or $length -gt 20000000) { throw 'Invalid payload length.' }
    $buffer = [Text.StringBuilder]::new($length)
    while ($buffer.Length -lt $length) {
      $line = [Console]::ReadLine()
      if ($null -eq $line) { throw 'Input ended before the declared length.' }
      [void]$buffer.Append($line)
    }
    if ($buffer.Length -ne $length) { throw 'Input length mismatch.' }
    $json = $buffer.ToString()
  }
  finally { [void][BackupConsole]::SetConsoleMode($handle, $previousMode) }
  if (-not $json) { throw 'No input received.' }
  $snapshot = ConvertFrom-Json -InputObject $json -AsHashtable -Depth 100
  $counts = Assert-LearningSnapshot $snapshot
  $plain = [Text.Encoding]::UTF8.GetBytes($json)
  $expectedHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($plain))
  $encrypted = [Security.Cryptography.ProtectedData]::Protect($plain, $entropy, $scope)
  [void][IO.Directory]::CreateDirectory($directory)
  $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $stream.Write($encrypted, 0, $encrypted.Length); $stream.Flush($true) } finally { $stream.Dispose() }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = [Security.AccessControl.FileSecurity]::new()
  $acl.SetAccessRuleProtection($true, $false)
  $acl.SetOwner($identity)
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'Allow'))
  Set-Acl -LiteralPath $path -AclObject $acl
}

$restored = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($path), $entropy, $scope)
$actualHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($restored))
if ($Mode -eq 'Protect' -and $actualHash -ne $expectedHash) { throw 'Encrypted file readback hash mismatch.' }
$decoded = ConvertFrom-Json -InputObject ([Text.Encoding]::UTF8.GetString($restored)) -AsHashtable -Depth 100
$verifiedCounts = Assert-LearningSnapshot $decoded
$databaseVerification = $null
if ($Mode -eq 'VerifyDatabase') {
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = (Get-Command node -CommandType Application | Select-Object -First 1).Source
  $startInfo.ArgumentList.Add((Join-Path $PSScriptRoot 'smoke-backup-restore.mjs'))
  $startInfo.WorkingDirectory = $root
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.StandardInputEncoding = [Text.UTF8Encoding]::new($false)
  $process = [Diagnostics.Process]::Start($startInfo)
  try {
    $outputTask = $process.StandardOutput.ReadToEndAsync()
    $errorTask = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.Write([Text.Encoding]::UTF8.GetString($restored))
    $process.StandardInput.Close()
    if (-not $process.WaitForExit(120000)) {
      $process.Kill($true)
      throw 'Local database verification timed out.'
    }
    if ($process.ExitCode -ne 0) { throw 'Local database verification failed; private data output is suppressed.' }
    $databaseVerification = ConvertFrom-Json -InputObject $outputTask.GetAwaiter().GetResult() -AsHashtable
    if ($databaseVerification.verified -ne $true) { throw 'Database verification did not confirm success.' }
  }
  finally { $process.Dispose(); [Array]::Clear($restored, 0, $restored.Length) }
}
[ordered]@{
  path = $path
  verified = $true
  capturedAt = $decoded.capturedAt
  encryption = 'Windows DPAPI CurrentUser'
  windowsAccount = $currentIdentity.Name
  windowsUserSid = $currentIdentity.User.Value
  plaintextSha256 = $actualHash
  tableCounts = $verifiedCounts
  bytes = ([IO.FileInfo]$path).Length
  databaseVerification = $databaseVerification
} | ConvertTo-Json -Depth 5 -Compress
[Array]::Clear($restored, 0, $restored.Length)
if ($Mode -eq 'Protect') { [Array]::Clear($plain, 0, $plain.Length) }
