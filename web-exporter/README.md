# Figma Make Exporter - Web Version 2.0

Simple web-based tool for exporting Figma Make animations to PNG sequences.

## Quick Start

1. **Run the start script:**
   - **Windows**: Double-click `START.bat`
   - **macOS/Linux**: 
     - First, make the script executable: `cd web-exporter` `sudo chmod +x start.sh` & enter your password
     - Then run: `./start.sh`
2. Browser will open at http://localhost:8080
3. Select project, load it, and export!

## How to Use

### 1. Load a Project
- Enter the full path to your Figma Make project folder
- Click "Load Project"
- Wait for Vite dev server to start (10-60 seconds)
- Animation will appear in preview

### 2. Configure Export
- **Duration**: How long to capture (seconds)
- **FPS**: Frames per second (1-120)
- **Background**: Choose export background
  - **Transparent**: Export with alpha channel (PNG transparency) - useful for compositing
  - **White/Black**: Solid color backgrounds
  - **Custom Color**: Pick any color using color picker
  - 💡 **Note**: If your Figma Make project already has a background color set, it will be visible in the export. Use "Transparent" to export with alpha channel, or select a color to override the project's background.
- **Output Folder**: Where to save PNG files (full path required)

### 3. Export
- Click "Export PNG Sequence"
- Wait for progress to complete
- Find your frames in the output folder!

## Features

- Automatic Vite dev server management
- Real-time animation preview
- Configurable duration and FPS
- Background color selection (transparent, white, black, or custom color)
- Progress tracking during export
- Cross-platform support (Windows, macOS, Linux)

## About Background Settings

**Do I need to set background in Figma Make project?**
- No, you don't need to change anything in your Figma Make project
- The exporter will handle the background based on your selection
- If your project has a background, it will be visible unless you choose "Transparent"
- Choosing "Transparent" exports PNG files with alpha channel, allowing you to composite the animation over any background later

**When to use each option:**
- **Transparent**: Best for animations that will be composited over other content
- **White/Black/Custom**: Use when you want a specific background color in the exported frames

## Requirements

- Node.js 16+ (https://nodejs.org/)
- Works on Windows, macOS, and Linux

## Advantages Over Electron Version

- Simpler and more reliable
- Works in any browser
- Easier to debug (F12 DevTools)
- No Electron overhead
- Better performance
- Cross-platform

## Troubleshooting

**Projects not loading?**
- Make sure the project has `package.json`
- Check that Node.js is installed
- Verify the project path is correct

**Animation not showing?**
- Wait 10-60 seconds for Vite to start
- Check browser console (F12) for errors
- Make sure the project has `npm run dev` script

**Export not working?**
- Make sure output folder exists
- Use full absolute path (e.g., `/Users/name/Output` or `C:\Output`)
- Check that you have write permissions to the output folder

## How It Works

1. **Web server** runs on port 8080
2. **Vite dev servers** start automatically for each project
3. **Iframe** loads the animation from Vite
4. **Puppeteer** captures each frame
5. **Server API** saves PNG files to disk

---

Made with ❤️ for Figma Make users
