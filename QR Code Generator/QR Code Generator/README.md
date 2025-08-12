<!--
Copyright © 2025 Sam Analytic Solutions
All rights reserved.
-->

## QR vCard Generator (Desktop)

This wraps the offline web app in Electron and builds a portable Windows executable and macOS DMG.

### Prerequisites
- Node.js 18+ and npm installed

### Run in development
In PowerShell from `QR Code Generator/QR Code Generator/electron`:

```powershell
npm install
npm run start
```

### Build Windows portable .exe
From `QR Code Generator/QR Code Generator/electron`:

```powershell
npm install
npm run build:win
```

Output: `electron/dist/QR vCard Generator-<version>-x64-win.exe`

### Build macOS DMG (on a Mac)
From `QR Code Generator/QR Code Generator/electron`:

```bash
npm install
npm run build:mac
```

Output: `electron/dist/QR vCard Generator-<version>-<arch>-mac.dmg`

Notes:
- Builds are unsigned by default. On macOS, right-click → Open to bypass Gatekeeper, or sign/notarize with your Apple Developer ID via `CSC_IDENTITY_AUTO_DISCOVERY=true` and Apple credentials for notarization.
- The app is fully offline; all assets are packaged with the executable. 