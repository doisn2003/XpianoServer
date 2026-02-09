$body = @{
    email = "admin@xpiano.com"
    password = "admin123"
} | ConvertTo-Json

$response = Invoke-WebRequest -UseBasicParsing -Uri http://localhost:3000/api/auth/login -Method POST -Body $body -ContentType "application/json"
$data = $response.Content | ConvertFrom-Json

Write-Host "`n✅ Login successful!" -ForegroundColor Green
Write-Host "User: $($data.data.user.full_name)" -ForegroundColor Cyan
Write-Host "Email: $($data.data.user.email)" -ForegroundColor Cyan
Write-Host "Role: $($data.data.user.role)" -ForegroundColor Yellow
Write-Host "`nToken (first 50 chars):" -ForegroundColor Cyan
Write-Host $data.data.token.Substring(0, 50) -ForegroundColor Gray
Write-Host "`n✨ Auth system is working!" -ForegroundColor Green
