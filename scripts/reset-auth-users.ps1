param(
  [string]$SupabaseUrl = "https://nvajehtowtehymgpqwvn.supabase.co"
)

$ErrorActionPreference = "Stop"

Write-Host "ATTENTION : tous les comptes Supabase Auth seront supprimés." -ForegroundColor Red
$confirmation = Read-Host "Tapez exactement RESET pour continuer"
if ($confirmation -cne "RESET") {
  Write-Host "Opération annulée."
  exit 0
}

$serviceRoleSecure = Read-Host "Clé Supabase service_role (entrée masquée)" -AsSecureString
$initialPasswordSecure = Read-Host "Mot de passe initial pour yasser et mehdi (entrée masquée)" -AsSecureString
$serviceRole = [System.Net.NetworkCredential]::new("", $serviceRoleSecure).Password
$initialPassword = [System.Net.NetworkCredential]::new("", $initialPasswordSecure).Password

if ([string]::IsNullOrWhiteSpace($serviceRole)) {
  throw "La clé service_role est obligatoire."
}
if ($initialPassword.Length -lt 8) {
  throw "Le mot de passe doit contenir au moins 8 caractères."
}

$headers = @{
  apikey = $serviceRole
  Authorization = "Bearer $serviceRole"
  "Content-Type" = "application/json"
}
$adminUsersUrl = "$($SupabaseUrl.TrimEnd('/'))/auth/v1/admin/users"

try {
  do {
    # Always request page 1 because deleting users shifts the remaining pages.
    $response = Invoke-RestMethod -Method Get -Uri "$adminUsersUrl?page=1&per_page=100" -Headers $headers
    $users = @($response.users)
    foreach ($user in $users) {
      Invoke-RestMethod -Method Delete -Uri "$adminUsersUrl/$($user.id)" -Headers $headers | Out-Null
      Write-Host "Compte supprimé : $($user.email)"
    }
  } while ($users.Count -eq 100)

  $accounts = @(
    @{ username = "yasser"; role = "admin" },
    @{ username = "mehdi"; role = "user" }
  )

  foreach ($account in $accounts) {
    $payload = @{
      email = "$($account.username)@ezz-gestion.app"
      password = $initialPassword
      email_confirm = $true
      user_metadata = @{
        role = $account.role
        must_change_password = $false
      }
    } | ConvertTo-Json -Depth 4

    Invoke-RestMethod -Method Post -Uri $adminUsersUrl -Headers $headers -Body $payload | Out-Null
    Write-Host "Compte créé : $($account.username) ($($account.role))" -ForegroundColor Green
  }

  Write-Host "Réinitialisation Auth terminée. Les deux utilisateurs auront chacun leur wallet isolé." -ForegroundColor Green
}
finally {
  $serviceRole = $null
  $initialPassword = $null
  Remove-Variable serviceRoleSecure, initialPasswordSecure -ErrorAction SilentlyContinue
}
