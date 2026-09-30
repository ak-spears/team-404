$content = Get-Content package.json -Raw
$old = '"db:migrate": "tsx src/db/migrate.ts",'
$new = "`"db:migrate`": `"tsx src/db/migrate.ts`",`n    `"db:migrate:postgres`": `"tsx src/db/migrate.postgres.ts`","
$content = $content.Replace($old, $new)
Set-Content package.json -Value $content -NoNewline
Write-Host "Done"