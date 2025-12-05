const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const http = require('http');
const puppeteer = require('puppeteer');

const execAsync = promisify(exec);

const app = express();
const PORT = 8080;

let viteServers = {}; // Track Vite servers by project path
const VITE_STARTUP_TIMEOUT = 60000; // 60 seconds

// Middleware
app.use(express.json({ limit: '100mb' }));
app.use(express.static('public'));

// Serve animation projects
app.use('/projects', express.static(path.join(__dirname, '..')));

// Get list of available projects
app.get('/api/projects', (req, res) => {
  try {
  const baseDir = path.join(__dirname, '..');
    
    if (!fs.existsSync(baseDir)) {
      return res.status(404).json({ error: 'Base directory not found' });
    }

  const folders = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .filter(dirent => {
        try {
      const projectPath = path.join(baseDir, dirent.name);
      return fs.existsSync(path.join(projectPath, 'package.json')) ||
             fs.existsSync(path.join(projectPath, 'index.html'));
        } catch (error) {
          console.error(`Error checking project ${dirent.name}:`, error);
          return false;
        }
    })
    .map(dirent => ({
      name: dirent.name,
      path: path.join(baseDir, dirent.name)
    }));

  res.json(folders);
  } catch (error) {
    console.error('Error reading projects:', error);
    res.status(500).json({ error: 'Failed to read projects directory' });
  }
});

// Start Vite dev server for a project
app.post('/api/start-vite', async (req, res) => {
  const { projectPath } = req.body;

  if (!projectPath || !fs.existsSync(projectPath)) {
    return res.status(400).json({ error: 'Invalid project path' });
  }

  const packageJsonPath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return res.status(400).json({ error: 'Not a Vite project (no package.json)' });
  }

  // Check if already running
  if (viteServers[projectPath]) {
    return res.json({
      url: viteServers[projectPath].url,
      proxyUrl: `/proxy/${viteServers[projectPath].port}`,
      port: viteServers[projectPath].port,
      status: 'already_running'
    });
  }

  try {
    const nodeModulesPath = path.join(projectPath, 'node_modules');

    // Install dependencies if needed
    if (!fs.existsSync(nodeModulesPath)) {
      console.log('Installing dependencies for', projectPath);
      await new Promise((resolve, reject) => {
        const npmInstall = spawn('npm', ['install'], {
          cwd: projectPath,
          shell: true
        });

        npmInstall.on('close', (code) => {
          if (code !== 0) reject(new Error('npm install failed'));
          else resolve();
        });

        npmInstall.on('error', (error) => {
          reject(error);
        });
      });
    }

    // Start Vite
    const viteInfo = await startViteProcess(projectPath);

    res.json({
      url: viteInfo.url,
      proxyUrl: `/proxy/${viteInfo.port}`,
      port: viteInfo.port,
      status: 'started'
    });
  } catch (error) {
    console.error('Failed to start Vite:', error);
    res.status(500).json({ error: error.message });
  }
});

function startViteProcess(projectPath) {
  return new Promise((resolve, reject) => {
    const env = Object.assign({}, process.env);
    env.BROWSER = 'none';

    const viteProcess = spawn('npm', ['run', 'dev', '--', '--open', 'false'], {
      cwd: projectPath,
      shell: true,
      env: env
    });

    let resolved = false;

    viteProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(output);

      // Remove ANSI color codes before matching
      const cleanOutput = output.replace(/\u001b\[\d+m/g, '');

      if (!resolved && cleanOutput.includes('localhost')) {
        const match = cleanOutput.match(/http:\/\/localhost:(\d+)/);
        if (match) {
          resolved = true;
          const port = parseInt(match[1]);
          const url = `http://localhost:${port}`;
          console.log('Vite server ready:', url);

          viteServers[projectPath] = {
            process: viteProcess,
            url: url,
            port: port
          };

          resolve({ url, port });
        }
      }
    });

    viteProcess.stderr.on('data', (data) => {
      console.error('Vite error:', data.toString());
    });

    viteProcess.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        reject(error);
      }
    });

    viteProcess.on('close', (code) => {
      console.log('Vite process exited with code:', code);
      delete viteServers[projectPath];
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        viteProcess.kill();
        reject(new Error(`Vite server startup timeout (${VITE_STARTUP_TIMEOUT / 1000}s)`));
      }
    }, VITE_STARTUP_TIMEOUT);
  });
}

// Proxy requests to Vite server (removes CORS issues)
app.use('/proxy/:port', (req, res) => {
  const targetPort = parseInt(req.params.port);
  const targetPath = req.url;
  
  const options = {
    hostname: 'localhost',
    port: targetPort,
    path: targetPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: `localhost:${targetPort}`
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // Copy headers but remove restrictive ones
    const headers = { ...proxyRes.headers };
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];
    
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err);
    res.status(502).json({ error: 'Proxy error: ' + err.message });
  });

  if (req.body && Object.keys(req.body).length > 0) {
    proxyReq.write(JSON.stringify(req.body));
  }
  
  req.pipe(proxyReq);
});

// Save PNG frame from base64 data
app.post('/api/save-frame', async (req, res) => {
  try {
    const { imageData, outputPath, filename } = req.body;

    if (!imageData || !outputPath || !filename) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    if (!fs.existsSync(outputPath)) {
      return res.status(400).json({ error: 'Output path does not exist' });
    }

    // Remove data URL prefix if present
    const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
    
    const filePath = path.join(outputPath, filename);
    fs.writeFileSync(filePath, base64Data, 'base64');

    res.json({ success: true, path: filePath });
  } catch (error) {
    console.error('Save frame error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export frames using Puppeteer with time freezing
app.post('/api/export-frames', async (req, res) => {
  try {
    const { projectURL, outputPath, duration, fps } = req.body;

    if (!projectURL || !outputPath) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    if (!fs.existsSync(outputPath)) {
      return res.status(400).json({ error: 'Output path does not exist' });
    }

    const durationNum = parseFloat(duration);
    const fpsNum = parseInt(fps);
    
    if (isNaN(durationNum) || durationNum <= 0) {
      return res.status(400).json({ error: 'Duration must be a positive number' });
    }
    
    if (isNaN(fpsNum) || fpsNum <= 0 || fpsNum > 60) {
      return res.status(400).json({ error: 'FPS must be between 1 and 60' });
    }

    const totalFrames = Math.ceil(durationNum * fpsNum);

    console.log(`Starting export: ${totalFrames} frames at ${fpsNum} FPS for ${durationNum}s`);

    // Set headers for streaming response
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Find Chrome executable
    let executablePath = null;
    const platform = process.platform;
    
    if (platform === 'darwin') {
      const chromePaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary'
      ];
      for (const p of chromePaths) {
        if (fs.existsSync(p)) { executablePath = p; break; }
      }
    } else if (platform === 'win32') {
      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
      ];
      for (const p of chromePaths) {
        if (p && fs.existsSync(p)) { executablePath = p; break; }
      }
    } else {
      const chromePaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser'
      ];
      for (const p of chromePaths) {
        if (fs.existsSync(p)) { executablePath = p; break; }
      }
    }
    
    if (!executablePath) {
      throw new Error('Chrome/Chromium not found. Please install Google Chrome.');
    }

    console.log('Launching Chrome from:', executablePath);

    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-crashpad'
      ],
      executablePath: executablePath
    });

    console.log('Browser launched successfully');

    // Capture frames with frozen time
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      // Calculate exact time for this frame
      const targetTimeMs = (frameIndex / fpsNum) * 1000;

      console.log(`Creating page for frame ${frameIndex}...`);

      // Create new page for each frame
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Load page - animation starts from 0 when page loads
      console.log(`Loading page: ${projectURL}`);
      await page.goto(projectURL, { waitUntil: 'load', timeout: 30000 });
      console.log(`Page loaded for frame ${frameIndex}`);
      
      // Wait for target time in animation
      // Animation starts at 0 when page loads, so wait targetTimeMs
      const waitTime = Math.max(50, targetTimeMs);
      console.log(`Waiting ${waitTime}ms for animation to reach target time...`);
      await new Promise(r => setTimeout(r, waitTime));

      // Take screenshot
      const frameNumber = String(frameIndex).padStart(5, '0');
      const filename = `frame_${frameNumber}.png`;
      const filePath = path.join(outputPath, filename);

      console.log(`Taking screenshot: ${filePath}`);
      await page.screenshot({
        path: filePath,
        omitBackground: false,
        fullPage: false
      });

      console.log(`Screenshot saved, closing page...`);
      await page.close();

      console.log(`Frame ${frameIndex + 1}/${totalFrames} at ${(targetTimeMs/1000).toFixed(3)}s`);

      res.write(JSON.stringify({
        progress: ((frameIndex + 1) / totalFrames) * 100,
        frame: frameIndex + 1,
        total: totalFrames
      }) + '\n');
    }

    await browser.close();

    res.end(JSON.stringify({
      success: true,
      message: `Exported ${totalFrames} frames`
    }));

  } catch (error) {
    console.error('Export error:', error);
    if (!res.headersSent) {
    res.status(500).json({ error: error.message });
    } else {
      res.end(JSON.stringify({ error: error.message }) + '\n');
    }
  }
});

// Open folder dialog
app.post('/api/select-folder', async (req, res) => {
  try {
    const { defaultPath } = req.body;
    const platform = process.platform;
    let command;

    if (platform === 'win32') {
      const tempScript = path.join(__dirname, 'temp_folder_dialog.ps1');
      let psScript = `Add-Type -AssemblyName System.Windows.Forms\n`;
      psScript += `$dialog = New-Object System.Windows.Forms.FolderBrowserDialog\n`;
      psScript += `$dialog.Description = "Select a folder"\n`;
      if (defaultPath) {
        const escapedPath = defaultPath.replace(/\\/g, '\\\\').replace(/'/g, "''");
        psScript += `$dialog.SelectedPath = '${escapedPath}'\n`;
      }
      psScript += `$result = $dialog.ShowDialog()\n`;
      psScript += `if ($result -eq [System.Windows.Forms.DialogResult]::OK) {\n`;
      psScript += `  Write-Output $dialog.SelectedPath\n`;
      psScript += `}\n`;
      
      fs.writeFileSync(tempScript, psScript, 'utf8');
      command = `powershell -ExecutionPolicy Bypass -File "${tempScript}"`;
    } else if (platform === 'darwin') {
      const tempScript = path.join(__dirname, 'temp_folder_dialog.scpt');
      let script = 'tell application "Finder"\n';
      script += '  activate\n';
      script += '  try\n';
      if (defaultPath && fs.existsSync(defaultPath)) {
        const escapedPath = defaultPath.replace(/"/g, '\\"');
        script += `    set defaultLoc to POSIX file "${escapedPath}"\n`;
        script += '    set folderPath to choose folder with prompt "Select a folder" default location defaultLoc\n';
      } else {
        script += '    set folderPath to choose folder with prompt "Select a folder"\n';
      }
      script += '    return POSIX path of folderPath\n';
      script += '  on error\n';
      script += '    return ""\n';
      script += '  end try\n';
      script += 'end tell\n';
      
      fs.writeFileSync(tempScript, script, 'utf8');
      command = `osascript "${tempScript}"`;
    } else {
      let hasZenity = false;
      let hasKdialog = false;
      
      try {
        await execAsync('which zenity', { timeout: 1000 });
        hasZenity = true;
      } catch {
        try {
          await execAsync('which kdialog', { timeout: 1000 });
          hasKdialog = true;
        } catch {
          res.status(500).json({ 
            success: false, 
            error: 'No folder dialog available. Please install zenity or kdialog, or enter path manually.' 
          });
          return;
        }
      }
      
      if (hasZenity) {
        if (defaultPath) {
          command = `zenity --file-selection --directory --filename="${defaultPath}" 2>/dev/null || echo ""`;
        } else {
          command = `zenity --file-selection --directory 2>/dev/null || echo ""`;
        }
      } else if (hasKdialog) {
        if (defaultPath) {
          command = `kdialog --getexistingdirectory "${defaultPath}" 2>/dev/null || echo ""`;
        } else {
          command = `kdialog --getexistingdirectory 2>/dev/null || echo ""`;
        }
      }
    }

    try {
      const { stdout, stderr } = await execAsync(command, { 
        timeout: 30000,
        maxBuffer: 1024 * 1024 
      });
      
      const selectedPath = stdout.trim();
      
      // Clean up temp scripts
      if (platform === 'win32') {
        const tempScript = path.join(__dirname, 'temp_folder_dialog.ps1');
        try { if (fs.existsSync(tempScript)) fs.unlinkSync(tempScript); } catch (e) {}
      } else if (platform === 'darwin') {
        const tempScript = path.join(__dirname, 'temp_folder_dialog.scpt');
        try { if (fs.existsSync(tempScript)) fs.unlinkSync(tempScript); } catch (e) {}
      }
      
      if (selectedPath && selectedPath.length > 0 && !stderr) {
        if (fs.existsSync(selectedPath)) {
          res.json({ success: true, path: selectedPath });
        } else {
          res.json({ success: false, error: 'Selected path does not exist' });
        }
      } else {
        res.json({ success: false, error: 'Dialog cancelled' });
      }
    } catch (error) {
      // Clean up temp scripts
      if (platform === 'win32') {
        const tempScript = path.join(__dirname, 'temp_folder_dialog.ps1');
        try { if (fs.existsSync(tempScript)) fs.unlinkSync(tempScript); } catch (e) {}
      } else if (platform === 'darwin') {
        const tempScript = path.join(__dirname, 'temp_folder_dialog.scpt');
        try { if (fs.existsSync(tempScript)) fs.unlinkSync(tempScript); } catch (e) {}
      }
      
      if (error.code === 1 || error.signal === 'SIGTERM' || error.code === 'ENOENT') {
        res.json({ success: false, error: 'Dialog cancelled' });
      } else {
        console.error('Folder dialog error:', error);
        res.json({ success: false, error: error.message || 'Failed to open folder dialog' });
      }
    }
  } catch (error) {
    console.error('Select folder error:', error);
    res.json({ success: false, error: error.message || 'Failed to open folder dialog' });
  }
});

// Cleanup on exit
function cleanup() {
  console.log('\nShutting down servers...');
  Object.values(viteServers).forEach(server => {
    try {
    server.process.kill();
    } catch (error) {
      console.error('Error killing process:', error);
    }
  });
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         FIGMA MAKE EXPORTER - WEB VERSION 3.0                 ║
╚═══════════════════════════════════════════════════════════════╝

🚀 Server running at: http://localhost:${PORT}

📝 Open your browser and go to:
   http://localhost:${PORT}

Press Ctrl+C to stop the server
  `);
});
