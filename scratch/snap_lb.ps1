$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$outLb = "C:\Users\lucas\.gemini\antigravity\brain\1b04d6c8-006d-4b3d-9bb3-84de4f5c35ad\leaderboards_raid_desktop.png"
$outLbMobile = "C:\Users\lucas\.gemini\antigravity\brain\1b04d6c8-006d-4b3d-9bb3-84de4f5c35ad\leaderboards_raid_mobile.png"

Start-Process -FilePath $chrome -ArgumentList "--headless=new", "--disable-gpu", "--window-size=1440,1200", "--screenshot=$outLb", "http://localhost:3000/leaderboards?tab=raid" -Wait
Start-Process -FilePath $chrome -ArgumentList "--headless=new", "--disable-gpu", "--window-size=430,1200", "--screenshot=$outLbMobile", "http://localhost:3000/leaderboards?tab=raid" -Wait

Write-Output "Leaderboards screenshots done!"

