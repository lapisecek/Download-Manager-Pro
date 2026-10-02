# Veloce Download Manager - User Installation Guide

Welcome to Veloce Download Manager. This guide contains everything you need to run Veloce on your PC and pair it with your web browser.

---

## 1. Running Veloce on Your PC

Choose either Option A (recommended for most users) or Option B (no installation needed).

### Option A: Standard Windows Installer (Recommended)
1. In the `release` folder, locate `Veloce DM Setup 1.0.0.exe`.
2. Double-click the file to begin installation.
3. Veloce will install automatically and launch the dashboard.
4. Shortcuts are added to your Desktop and Start Menu for quick access.

### Option B: Portable Standalone Version (No Installation)
1. In the `release` folder, extract `Veloce-DM-Portable-1.0.0.zip` to any folder on your computer.
2. Open the extracted folder and double-click `Veloce DM.exe`.
3. Veloce runs immediately without modifying your system.

---

## 2. Setting Up the Browser Companion Extension

To allow Google Chrome, Brave, Microsoft Edge, or Opera to send downloads directly to Veloce:

1. Locate `Veloce-Chrome-Companion-1.0.0.zip` in the `release` folder.
2. Extract this archive into a permanent folder (for example: `C:\Users\YourName\Documents\Veloce-Extension`).
3. Open Google Chrome (or your Chromium browser).
4. Navigate to: `chrome://extensions/`
5. In the top-right corner, switch on **Developer mode**.
6. In the top-left corner, click **Load unpacked**.
7. In the folder picker, select the folder where you extracted the extension.
8. The **Veloce Download Companion** icon will appear in your browser extension bar.
9. Click the Veloce icon in your browser toolbar. The status dot will turn green, indicating **Connected**.

---

## 3. How to Use Veloce

### Catching Downloads Automatically
1. In the Veloce desktop application, click **Settings** on the left menu.
2. Under **Browser Integration**, add domain or URL prefixes (for example: `https://releases.ubuntu.com/` or `https://cdn.example.com/`).
3. Whenever you click a download link on those websites in your browser, Veloce instantly intercepts and accelerates the download.
4. Alternatively, click the Veloce browser icon and turn on **Catch All Downloads** to route all file downloads to Veloce.

### Snatching an Ongoing Browser Download
- If you start a download in Chrome and want Veloce to take over, click the Veloce icon in your browser and click **Catch Current Download**.

### Adding Downloads Manually
1. Click the **+ Add Download** button in the top-right corner of the Veloce dashboard.
2. Paste any direct download link.
3. Optionally enter a custom filename.
4. Click **Start Download**.

### Automatic Clipboard Detection
- If you copy any direct download URL to your clipboard while Veloce is running, Veloce can automatically detect it and offer to begin downloading.

---

## 4. Frequently Asked Questions & Troubleshooting

### Why does the browser extension show "Disconnected"?
- Ensure the Veloce desktop application is running. The extension communicates with the desktop app on your local machine (`127.0.0.1:12345`).

### What happens if Veloce is closed?
- If the desktop app is closed, the browser companion steps aside and allows your web browser to download files normally.

### Windows Defender or SmartScreen Warning
- When running newly compiled open-source installers that lack a paid commercial code-signing certificate, Windows SmartScreen may display a standard prompt. Click **More info** followed by **Run anyway**.
