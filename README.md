# Download Manager Pro (DM Pro) - v1.0

Welcome to **DM Pro**, a fully functional, highly customized desktop Download Manager with a seamless Chrome Extension integration. 

## 🌟 Key Features

- **Chrome Integration**: Instantly catch downloads via the companion Chrome extension. 
- **"Catch Current Download"**: A powerful feature in the extension popup to instantly snatch a download actively running in Chrome and move it to DM Pro seamlessly.
- **Smart Priority Management**: The top 2 active downloads are assigned full bandwidth, while others are intelligently throttled.
- **Global ETA & Stats**: Monitor combined bandwidth, total remaining time, and active tasks directly from the sleek UI.
- **Built-in VirusTotal Scanning**: Automatically or manually scan downloaded files against 70+ security vendors, complete with a beautiful interactive report modal.
- **Categorized History**: Automatically tracks finished and errored downloads with distinct visualizations.
- **Premium Interface**: A completely custom, frameless glassmorphism design with butter-smooth drag-and-drop prioritization.

---

## 📥 1. Installing the Desktop Application

The application is bundled into a ready-to-use executable:

1. Download the latest `DM Pro Setup 1.0.0.exe` from the **Releases** tab.
2. Run the installer. 
3. The DM Pro application will open. Leave it running in the background while you set up the extension!

*(Note: If DM Pro is closed, the Chrome extension will simply stop catching downloads and allow Chrome to download them normally.)*

## 🧩 2. Setting up the Chrome Extension

To let Chrome talk to DM Pro, load the companion extension:

1. Open **Google Chrome**.
2. Type `chrome://extensions/` into the URL bar and hit **Enter**.
3. In the top-right corner, toggle on **Developer mode**.
4. Click the **Load unpacked** button in the top-left corner.
5. In the file picker, select the **`extension`** folder from the source code.
6. You should now see the **DM Pro Catcher** active!

## ⚙️ 3. Configuring Auto-Catch

By default, the extension won't catch anything until you tell it which URLs to look for:

1. Open your running **DM Pro** desktop app.
2. Click on the **Settings** icon in the sidebar.
3. Add a URL prefix (e.g., `https://speed.hetzner.de/`) and click the `+` button.
4. **Test it out:** Try downloading a file from that prefix in Chrome. The extension will catch it, cancel the Chrome download, and instantly start it inside DM Pro!
5. **Alternative**: You can manually click "Catch Current Download" in the extension popup when a Chrome download starts to pull it over without setting rules beforehand!

## 🛠️ Development Setup

If you want to build DM Pro from source:

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build the executable
npm run build:exe
```
