# Define the Node.js version to install
$nodeVersion = "20.0.0" # You can change this to the version you prefer

# Download Node.js installer
$installerPath = "$env:TEMP\node-v$nodeVersion-x64.msi"
$installerUrl = "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-x64.msi"
Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath

# Install Node.js
Start-Process msiexec.exe -ArgumentList "/i", "`"$installerPath`"", "/quiet", "/norestart" -NoNewWindow -Wait

# Clean up installer
Remove-Item $installerPath

# Add Node.js to the system PATH
$nodePath = "C:\Program Files\nodejs"
$env:Path += ";$nodePath"

# Persist the PATH update
[System.Environment]::SetEnvironmentVariable("Path", $env:Path, [System.EnvironmentVariableTarget]::Machine)

# Refresh the PATH environment variable in the current PowerShell session
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", [System.EnvironmentVariableTarget]::Machine)

# Verify the installation
node --version
npm --version

Write-Output "Node.js and npm have been installed successfully. You can now run 'node main.js'."
