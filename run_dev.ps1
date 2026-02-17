# Start Backend
Start-Process -FilePath "python" -ArgumentList "main.py" -WorkingDirectory ".\backend" -NoNewWindow

# Start Frontend
Write-Host "Starting Frontend... (Ensure 'npm install' is run first inside frontend/)"
Set-Location ".\frontend"
npm run dev
