$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$outDesktop = "C:\Users\lucas\.gemini\antigravity\brain\1b04d6c8-006d-4b3d-9bb3-84de4f5c35ad\ranking_raid_full.png"
$outMobile = "C:\Users\lucas\.gemini\antigravity\brain\1b04d6c8-006d-4b3d-9bb3-84de4f5c35ad\ranking_raid_mobile.png"

# Desktop
Start-Process -FilePath $chrome -ArgumentList "--headless=new", "--disable-gpu", "--window-size=1440,3200", "--screenshot=$outDesktop", "http://localhost:3000/?tab=raid" -Wait

# Mobile
Start-Process -FilePath $chrome -ArgumentList "--headless=new", "--disable-gpu", "--window-size=430,3400", "--screenshot=$outMobile", "http://localhost:3000/?tab=raid" -Wait

Write-Output "Screenshots taken!"

