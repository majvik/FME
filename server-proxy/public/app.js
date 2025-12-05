// DOM Elements
const projectUrlInput = document.getElementById('projectUrl');
const loadBtn = document.getElementById('loadBtn');
const loadStatus = document.getElementById('loadStatus');
const durationInput = document.getElementById('duration');
const outputPathInput = document.getElementById('outputPath');
const browseBtn = document.getElementById('browseBtn');
const exportBtn = document.getElementById('exportBtn');
const exportBtnText = document.getElementById('exportBtnText');
const reloadBtn = document.getElementById('reloadBtn');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const previewContainer = document.getElementById('previewContainer');
const previewWrapper = document.getElementById('previewWrapper');
const previewPlaceholder = document.getElementById('previewPlaceholder');
const previewInfo = document.getElementById('previewInfo');
const previewFrame = document.getElementById('previewFrame');

// State
let isRecording = false;
let currentProjectUrl = '';
let mediaRecorder = null;
let recordedChunks = [];
let captureStream = null;

// Fixed output resolution
const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  updatePreviewScale();
  window.addEventListener('resize', updatePreviewScale);
  
  const savedUrl = localStorage.getItem('projectUrl');
  const savedOutput = localStorage.getItem('outputPath');
  if (savedUrl) projectUrlInput.value = savedUrl;
  if (savedOutput) outputPathInput.value = savedOutput;
});

function updatePreviewScale() {
  // Set fixed size for iframe (actual recording size)
  previewWrapper.style.width = OUTPUT_WIDTH + 'px';
  previewWrapper.style.height = OUTPUT_HEIGHT + 'px';
  previewFrame.style.width = OUTPUT_WIDTH + 'px';
  previewFrame.style.height = OUTPUT_HEIGHT + 'px';
  
  // Calculate scale to fit in container
  const availableWidth = previewContainer.clientWidth - 40;
  const availableHeight = previewContainer.clientHeight - 40;
  
  const scaleX = availableWidth / OUTPUT_WIDTH;
  const scaleY = availableHeight / OUTPUT_HEIGHT;
  const scale = Math.min(scaleX, scaleY, 1);
  
  previewWrapper.style.transform = `scale(${scale})`;
  previewInfo.textContent = `Scale: ${Math.round(scale * 100)}%`;
}

function showStatus(element, message, type) {
  element.textContent = message;
  element.className = `status visible ${type}`;
}

function hideStatus(element) {
  element.className = 'status';
}

// Load project
loadBtn.addEventListener('click', async () => {
  const url = projectUrlInput.value.trim();
  
  if (!url) {
    showStatus(loadStatus, 'Please enter a project URL', 'error');
    return;
  }
  
  try {
    new URL(url);
  } catch {
    showStatus(loadStatus, 'Invalid URL format', 'error');
    return;
  }
  
  showStatus(loadStatus, 'Setting up proxy...', 'loading');
  loadBtn.disabled = true;
  
  try {
    // Set proxy target
    const response = await fetch('/api/set-target', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to set target');
    }
    
    showStatus(loadStatus, 'Loading preview...', 'loading');
    
    // Load through proxy (same-origin!)
    previewFrame.src = '/project/';
    currentProjectUrl = url;
    
    // Wait for load
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => resolve(), 15000); // 15s timeout, resolve anyway
      previewFrame.onload = () => { clearTimeout(timeout); resolve(); };
      previewFrame.onerror = () => { clearTimeout(timeout); reject(new Error('Load failed')); };
    });
    
    previewPlaceholder.classList.add('hidden');
    exportBtn.disabled = false;
    reloadBtn.disabled = false;
    showStatus(loadStatus, '✅ Ready to record!', 'success');
    
    localStorage.setItem('projectUrl', url);
    setTimeout(() => hideStatus(loadStatus), 3000);
    
  } catch (err) {
    showStatus(loadStatus, `Error: ${err.message}`, 'error');
    previewPlaceholder.classList.remove('hidden');
    exportBtn.disabled = true;
  } finally {
    loadBtn.disabled = false;
  }
});

// Reload preview
reloadBtn.addEventListener('click', () => {
  if (currentProjectUrl) {
    previewFrame.src = '/project/';
  }
});

// Browse for output folder
browseBtn.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/select-folder');
    const data = await response.json();
    if (data.path && !data.cancelled) {
      outputPathInput.value = data.path;
      localStorage.setItem('outputPath', data.path);
    }
  } catch (err) {
    console.error('Failed to open folder dialog:', err);
  }
});

// Record using Screen Capture API - current tab mode
exportBtn.addEventListener('click', async () => {
  if (isRecording) {
    // Stop recording
    isRecording = false;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try { mediaRecorder.stop(); } catch(e) {}
    }
    if (captureStream) {
      captureStream.getTracks().forEach(track => track.stop());
      captureStream = null;
    }
    return;
  }
  
  const outputPath = outputPathInput.value.trim();
  if (!outputPath) {
    alert('Please select an output folder');
    return;
  }
  
  const duration = parseFloat(durationInput.value);
  if (duration <= 0 || isNaN(duration)) {
    alert('Invalid duration');
    return;
  }
  
  try {
    progressText.textContent = 'Allow screen capture...';
    progressFill.style.width = '0%';
    
    // Request current tab capture
    captureStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'never',
        displaySurface: 'browser',
        width: { ideal: 4096 },
        height: { ideal: 2160 },
        frameRate: { ideal: 60 }
      },
      audio: false,
      preferCurrentTab: true,  // Prefer current tab!
      selfBrowserSurface: 'include',
      systemAudio: 'exclude'
    });
    
    // Start recording
    isRecording = true;
    recordedChunks = [];
    exportBtn.classList.add('recording');
    exportBtnText.textContent = 'Stop';
    
    // Setup MediaRecorder with high quality
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
      ? 'video/webm;codecs=vp9' 
      : 'video/webm';
    
    mediaRecorder = new MediaRecorder(captureStream, {
      mimeType: mimeType,
      videoBitsPerSecond: 50000000 // 50 Mbps
    });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      progressText.textContent = 'Processing video...';
      
      // Stop stream
      if (captureStream) {
        captureStream.getTracks().forEach(track => track.stop());
        captureStream = null;
      }
      
      try {
        const blob = new Blob(recordedChunks, { type: mimeType });
        console.log('Video size:', (blob.size / 1024 / 1024).toFixed(2), 'MB');
        
        if (blob.size < 1000) {
          throw new Error('Recording failed - empty video');
        }
        
        progressText.textContent = `Saving ${(blob.size / 1024 / 1024).toFixed(1)} MB...`;
        
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const response = await fetch('/api/save-video', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                videoData: reader.result,
                filename: `recording_${Date.now()}.webm`,
                outputPath: outputPath
              })
            });
            
            const result = await response.json();
            if (result.success) {
              progressText.textContent = `✅ Saved: ${result.path}`;
              progressFill.style.width = '100%';
            } else {
              throw new Error(result.error || 'Save failed');
            }
          } catch (err) {
            progressText.textContent = `❌ ${err.message}`;
          }
        };
        reader.readAsDataURL(blob);
        
      } catch (err) {
        progressText.textContent = `❌ ${err.message}`;
      }
      
      isRecording = false;
      exportBtn.classList.remove('recording');
      exportBtnText.textContent = 'Record';
    };
    
    // Handle user stopping share
    captureStream.getVideoTracks()[0].onended = () => {
      if (isRecording && mediaRecorder && mediaRecorder.state === 'recording') {
        try { mediaRecorder.stop(); } catch(e) {}
      }
    };
    
    // Start recording
    mediaRecorder.start(100);
    progressText.textContent = '🔴 Recording...';
    
    const startTime = Date.now();
    const durationMs = duration * 1000;
    
    // Progress update loop
    const updateProgress = () => {
      if (!isRecording) return;
      
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / durationMs) * 100, 100);
      progressFill.style.width = `${progress}%`;
      progressText.textContent = `🔴 ${(elapsed / 1000).toFixed(1)}s / ${duration}s`;
      
      if (elapsed >= durationMs) {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          try { mediaRecorder.stop(); } catch(e) {}
        }
      } else {
        requestAnimationFrame(updateProgress);
      }
    };
    
    requestAnimationFrame(updateProgress);
    
  } catch (err) {
    console.error('Recording error:', err);
    
    if (err.name === 'NotAllowedError') {
      progressText.textContent = '❌ Screen sharing was cancelled';
    } else {
      progressText.textContent = `❌ ${err.message}`;
    }
    
    isRecording = false;
    if (captureStream) {
      captureStream.getTracks().forEach(track => track.stop());
      captureStream = null;
    }
    exportBtn.classList.remove('recording');
    exportBtnText.textContent = 'Record';
  }
});

projectUrlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadBtn.click();
});
