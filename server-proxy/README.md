# PNG Sequence Recorder

Record any web animation to PNG sequence with server proxy for CORS bypass.

## Features

- **Server Proxy**: Loads external URLs through local server to bypass CORS restrictions
- **Scalable Preview**: Preview automatically scales to fit your screen while maintaining 1920×1080 output
- **Real-time Capture**: Records frames using html-to-image at exact timing intervals
- **Cross-platform**: Works on macOS, Windows, and Linux

## How It Works

1. Enter the URL of your deployed animation project
2. The server proxies all requests, making the content same-origin
3. Preview shows the animation scaled to fit your screen
4. Export captures frames at full 1920×1080 resolution regardless of screen size

## Requirements

- Node.js 16+
- npm

## Quick Start

### macOS / Linux
```bash
chmod +x start.sh
./start.sh
```

### Windows
```
Double-click START.bat
```

### Manual
```bash
npm install
npm start
```

Then open http://localhost:4000 in your browser.

## Usage

1. **Load Project**: Enter the URL of your animation (e.g., `https://your-project.vercel.app`)
2. **Configure Export**: Set duration (seconds) and frame rate (FPS)
3. **Select Output Folder**: Choose where to save PNG files
4. **Export**: Click "Export PNG Sequence" to start recording

## Technical Details

- **Preview Scaling**: Uses CSS `transform: scale()` to fit the preview in your viewport
- **Capture Resolution**: Always 1920×1080 regardless of preview size
- **Proxy Server**: Rewrites HTML, CSS, and JS paths to route through local server
- **Frame Timing**: Uses `performance.now()` for accurate frame timing

## Troubleshooting

### Project doesn't load
- Make sure the URL is accessible
- Check if the project uses features that block proxying (e.g., WebSockets for HMR)
- Try with the production build URL instead of dev server

### Frames are blank or corrupted
- Some complex animations may not capture correctly with html-to-image
- Try reducing FPS or increasing capture delay

### CORS errors
- The proxy should handle most CORS issues
- Some external resources (fonts, images from other domains) may still fail

## License

MIT

