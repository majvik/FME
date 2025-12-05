const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');

const app = express();
const PORT = 4000;

// Middleware - large limit for video uploads
app.use(express.json({ limit: '500mb' }));

// Store current project URL
let currentProjectTarget = null;
let targetProtocol = null;

// Set project target
app.post('/api/set-target', (req, res) => {
  const { url: targetUrl } = req.body;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url' });
  }
  
  try {
    const urlObj = new URL(targetUrl);
    currentProjectTarget = `${urlObj.protocol}//${urlObj.host}`;
    targetProtocol = urlObj.protocol;
    console.log(`Project target set to: ${currentProjectTarget}`);
    res.json({ success: true, target: currentProjectTarget });
  } catch (err) {
    res.status(400).json({ error: 'Invalid URL' });
  }
});

// Manual proxy function that preserves headers correctly
function proxyRequest(req, res, targetPath) {
  if (!currentProjectTarget) {
    return res.status(400).send('No project target set. Load project first.');
  }
  
  const targetUrl = new URL(targetPath, currentProjectTarget);
  const httpModule = targetUrl.protocol === 'https:' ? https : http;
  
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.host,
      'accept-encoding': 'identity' // Disable compression to simplify proxying
    }
  };
  
  // Remove problematic headers
  delete options.headers['connection'];
  delete options.headers['content-length'];
  
  const proxyReq = httpModule.request(options, (proxyRes) => {
    // Copy headers but remove blocking ones
    const headers = { ...proxyRes.headers };
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];
    delete headers['content-security-policy-report-only'];
    
    // Add CORS headers
    headers['access-control-allow-origin'] = '*';
    headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
    headers['access-control-allow-headers'] = '*';
    
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });
  
  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.status(500).send('Proxy error: ' + err.message);
  });
  
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}

// Proxy for main project content
app.use('/project', (req, res) => {
  const targetPath = req.url === '/' ? '/' : req.url;
  proxyRequest(req, res, targetPath);
});

// Proxy for Figma site internal resources
const figmaPaths = ['/_runtimes', '/_components', '/_json', '/_images', '/_fonts', '/_woff', '/_videos', '/_svg'];
figmaPaths.forEach(pathPrefix => {
  app.use(pathPrefix, (req, res) => {
    proxyRequest(req, res, pathPrefix + req.url);
  });
});

// Save frame endpoint - receives base64 PNG from client
app.post('/api/save-frame', (req, res) => {
  try {
    const { imageData, filename, outputPath } = req.body;
    
    if (!imageData || !filename || !outputPath) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }
    
    // Convert base64 to buffer and save
    const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const filePath = path.join(outputPath, filename);
    
    fs.writeFileSync(filePath, buffer);
    
    res.json({ success: true, path: filePath });
  } catch (err) {
    console.error('Save frame error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Save video endpoint - receives base64 WebM from client
app.post('/api/save-video', (req, res) => {
  try {
    const { videoData, filename, outputPath } = req.body;
    
    if (!videoData || !filename || !outputPath) {
      console.log('Missing fields:', { hasVideo: !!videoData, filename, outputPath });
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }
    
    // Convert base64 to buffer - handle any video/* mime type
    // Format: data:video/webm;codecs=vp9;base64,XXXXX or data:video/webm;base64,XXXXX
    const base64Match = videoData.match(/^data:video\/[^;]+(?:;[^;]+)*;base64,(.+)$/);
    if (!base64Match) {
      console.log('Invalid video data format. Starts with:', videoData.substring(0, 50));
      return res.status(400).json({ error: 'Invalid video data format' });
    }
    
    const base64Data = base64Match[1];
    const buffer = Buffer.from(base64Data, 'base64');
    const filePath = path.join(outputPath, filename);
    
    console.log(`Saving video: ${buffer.length} bytes to ${filePath}`);
    
    if (buffer.length < 100) {
      console.log('Warning: Video buffer is very small!');
    }
    
    fs.writeFileSync(filePath, buffer);
    console.log(`✅ Video saved: ${filePath} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    
    res.json({ success: true, path: filePath });
  } catch (err) {
    console.error('Save video error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Open folder dialog (cross-platform)
app.get('/api/select-folder', async (req, res) => {
  const { exec } = require('child_process');
  const platform = process.platform;
  
  try {
    let command;
    
    if (platform === 'darwin') {
      command = `osascript -e 'POSIX path of (choose folder with prompt "Select output folder")'`;
    } else if (platform === 'win32') {
      command = `powershell -command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.ShowDialog() | Out-Null; $f.SelectedPath"`;
    } else {
      command = `zenity --file-selection --directory 2>/dev/null || kdialog --getexistingdirectory 2>/dev/null`;
    }
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        return res.json({ path: '', cancelled: true });
      }
      const selectedPath = stdout.trim();
      res.json({ path: selectedPath, cancelled: !selectedPath });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static files AFTER proxy routes
app.use(express.static(path.join(__dirname, 'public')));

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║         WebM VIDEO RECORDER v3.0                              ║');
  console.log('║         Real-time recording - what you see is what you get    ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`🚀 Server running at: http://localhost:${PORT}`);
  console.log('');
  console.log('📝 How it works:');
  console.log('   1. Enter project URL → loaded through proxy (same-origin)');
  console.log('   2. Preview shows live animation in real-time');
  console.log('   3. Click Record → captures WebM video at native speed');
  console.log('');
  console.log('Press Ctrl+C to stop the server');
  console.log('');
});
