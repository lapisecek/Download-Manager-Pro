# Download Manager Pro (DM Pro) - v1.0

Welcome to DM Pro, a fully functional, highly customized desktop Download Manager with a seamless Chrome Extension integration. 

## Key Features

- **Chrome Integration**: Instantly catch downloads via the companion Chrome extension. 
- **"Catch Current Download"**: A powerful feature in the extension popup to instantly snatch a download actively running in Chrome and move it to DM Pro seamlessly.
- **Smart Priority Management**: The top 2 active downloads are assigned full bandwidth, while others are intelligently throttled.
- **Global ETA & Stats**: Monitor combined bandwidth, total remaining time, and active tasks directly from the UI.
- **Built-in VirusTotal Scanning**: Automatically or manually scan downloaded files against 70+ security vendors, complete with an interactive report modal.
- **Categorized History**: Automatically tracks finished and errored downloads with distinct visualizations.
- **Premium Interface**: A completely custom, frameless glassmorphism design with drag-and-drop prioritization.

---

## 1. Installing the Desktop Application

The application is bundled into a ready-to-use executable:

1. Navigate to the release folder located at: CustomDownloadManager\release\
2. Double-click DM Pro Setup 0.0.0.exe (or the standalone .exe inside the win-unpacked folder).
3. The DM Pro application will open. Leave it running in the background while you set up the extension.

(Note: If DM Pro is closed, the Chrome extension will automatically stop catching your downloads and allow Chrome to download them normally.)

## 2. Setting up the Chrome Extension

To let Chrome talk to DM Pro, load the companion extension:

1. Download DM_Pro_Extension_v1.0.zip from the Releases tab and extract it to a folder on your computer.
2. Open Google Chrome.
3. Type chrome://extensions/ into the URL bar and hit Enter.
4. In the top-right corner, toggle on Developer mode.
5. Click the Load unpacked button in the top-left corner.
6. In the file picker, select the folder where you extracted the extension.
7. You should now see the DM Pro Catcher extension active.

## 3. Configuring Auto-Catch

By default, the extension won't catch anything until you tell it which URLs to look for:

1. Open your running DM Pro desktop app.
2. Click on the Settings icon in the sidebar.
3. Under the "Chrome Extension Integration" section, add a URL prefix.
   - For example, if you frequently download files from a server like https://speed.hetzner.de/, type that into the box and click the + button.
   - The extension will instantly sync this new rule.
4. Try downloading a file from that prefix in Chrome. The extension will catch it, cancel the Chrome download, and instantly start it inside DM Pro.
5. Alternative: You can manually click "Catch Current Download" in the extension popup when a Chrome download starts to pull it over without setting rules beforehand.

## Development Setup

If you want to build DM Pro from source:

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build the executable
npm run build:exe
```
