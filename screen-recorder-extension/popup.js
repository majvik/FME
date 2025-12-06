// DOM Elements
const extensionEnabled = document.getElementById('extensionEnabled');
const settingsPanel = document.getElementById('settingsPanel');
const disabledPanel = document.getElementById('disabledPanel');
const durationInput = document.getElementById('duration');
const recordModeSelect = document.getElementById('recordMode');
const areaSettings = document.getElementById('areaSettings');
const selectAreaBtn = document.getElementById('selectAreaBtn');
const areaInfo = document.getElementById('areaInfo');
const qualitySelect = document.getElementById('quality');
const recordBtn = document.getElementById('recordBtn');
const recordBtnText = document.getElementById('recordBtnText');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

// State
let isRecording = false;
let selectedArea = null;
let mediaRecorder = null;
let recordedChunks = [];
let captureStream = null;

// Get quality settings
function getQualitySettings(quality) {
  const settings = {
    maximum: {
      videoBitsPerSecond: 50000000, // 50 Mbps
      frameRate: 60
    },
    high: {
      videoBitsPerSecond: 30000000, // 30 Mbps
      frameRate: 60
    },
    medium: {
      videoBitsPerSecond: 15000000, // 15 Mbps
      frameRate: 30
    }
  };
  return settings[quality] || settings.maximum;
}

// Load saved settings
async function loadSettings() {
  const settings = await chrome.storage.sync.get([
    'enabled',
    'duration',
    'recordMode',
    'selectedArea',
    'quality'
  ]);
  
  extensionEnabled.checked = settings.enabled !== false;
  durationInput.value = settings.duration || 10;
  recordModeSelect.value = settings.recordMode || 'tab';
  selectedArea = settings.selectedArea || null;
  qualitySelect.value = settings.quality || 'maximum';
  
  updateUI();
}

// Save settings
async function saveSettings() {
  await chrome.storage.sync.set({
    enabled: extensionEnabled.checked,
    duration: parseInt(durationInput.value),
    recordMode: recordModeSelect.value,
    selectedArea: selectedArea,
    quality: qualitySelect.value
  });
}

// Update UI based on enabled state
function updateUI() {
  if (extensionEnabled.checked) {
    settingsPanel.style.display = 'block';
    disabledPanel.style.display = 'none';
  } else {
    settingsPanel.style.display = 'none';
    disabledPanel.style.display = 'block';
  }
  
  // Show/hide area settings
  if (recordModeSelect.value === 'area') {
    areaSettings.style.display = 'block';
    if (selectedArea) {
      areaInfo.textContent = `Area: ${selectedArea.width}×${selectedArea.height} at (${selectedArea.x}, ${selectedArea.y})`;
    }
  } else {
    areaSettings.style.display = 'none';
  }
}

// Event Listeners
extensionEnabled.addEventListener('change', async () => {
  await saveSettings();
  updateUI();
});

durationInput.addEventListener('change', saveSettings);
recordModeSelect.addEventListener('change', async () => {
  await saveSettings();
  updateUI();
});

qualitySelect.addEventListener('change', saveSettings);

// Select area
selectAreaBtn.addEventListener('click', async () => {
  // Send message to content script to start area selection
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab || !tab.id) {
    alert('Please open a web page first');
    return;
  }
  
  try {
    // Create listener BEFORE sending message
    const listener = (message, sender, sendResponse) => {
      if (message.action === 'areaSelected') {
        selectedArea = message.area;
        saveSettings();
        updateUI();
        chrome.runtime.onMessage.removeListener(listener);
        alert(`Area selected: ${selectedArea.width}×${selectedArea.height} at (${selectedArea.x}, ${selectedArea.y})`);
        return true;
      }
    };
    
    chrome.runtime.onMessage.addListener(listener);
    
    // Send message to content script
    await chrome.tabs.sendMessage(tab.id, { action: 'startAreaSelection' });
    
    // Remove listener after 30 seconds if no response
    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
    }, 30000);
    
  } catch (err) {
    console.error('Failed to start area selection:', err);
    alert('Failed to start area selection. Make sure you are on a web page (not chrome:// pages).');
  }
});

// Record button - using getDisplayMedia (requires user gesture from popup)
recordBtn.addEventListener('click', async () => {
  if (isRecording) {
    // Stop recording
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
    if (captureStream) {
      captureStream.getTracks().forEach(track => track.stop());
      captureStream = null;
    }
    return;
  }
  
  if (!extensionEnabled.checked) {
    alert('Please enable the extension first');
    return;
  }
  
  const duration = parseInt(durationInput.value);
  if (duration <= 0) {
    alert('Invalid duration');
    return;
  }
  
  // Save settings before recording
  await saveSettings();
  
  try {
    progressText.textContent = 'Requesting screen capture...';
    progressContainer.style.display = 'block';
    progressFill.style.width = '0%';
    
    // Request screen capture
    const qualitySettings = getQualitySettings(qualitySelect.value);
    const isTabMode = recordModeSelect.value === 'tab';
    
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (isTabMode) {
      // Use chrome.tabCapture for tab recording (more reliable, no popup interference)
      captureStream = await new Promise((resolve, reject) => {
        chrome.tabCapture.capture({
          audio: false,
          video: true
        }, (stream) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (stream) {
            resolve(stream);
          } else {
            reject(new Error('Failed to capture tab'));
          }
        });
      });
    } else {
      // Use getDisplayMedia for area/window selection
      captureStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'never',
          displaySurface: 'window',
          width: { ideal: 4096 },
          height: { ideal: 2160 },
          frameRate: { ideal: qualitySettings.frameRate }
        },
        audio: false,
        selfBrowserSurface: 'exclude',
        systemAudio: 'exclude'
      });
    }
    
    // Start recording
    isRecording = true;
    recordedChunks = [];
    recordBtnText.textContent = 'Stop Recording';
    recordBtn.classList.add('recording');
    
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
      ? 'video/webm;codecs=vp9' 
      : 'video/webm';
    
    mediaRecorder = new MediaRecorder(captureStream, {
      mimeType: mimeType,
      videoBitsPerSecond: qualitySettings.videoBitsPerSecond
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
        
        // Save file using downloads API
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fullFilename = `recording_${timestamp}.webm`;
        
        await chrome.downloads.download({
          url: url,
          filename: fullFilename,
          saveAs: false
        });
        
        URL.revokeObjectURL(url);
        
        progressText.textContent = '✅ Recording saved!';
        progressFill.style.width = '100%';
        
        setTimeout(() => {
          progressContainer.style.display = 'none';
        }, 3000);
        
      } catch (err) {
        console.error('Save error:', err);
        progressText.textContent = `❌ ${err.message}`;
      }
      
      isRecording = false;
      recordBtnText.textContent = 'Start Recording';
      recordBtn.classList.remove('recording');
    };
    
    // Handle user stopping share
    captureStream.getVideoTracks()[0].onended = () => {
      if (isRecording && mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
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
      
      const elapsed = (Date.now() - startTime) / 1000;
      const progress = Math.min((elapsed / duration) * 100, 100);
      progressFill.style.width = `${progress}%`;
      progressText.textContent = `🔴 ${elapsed.toFixed(1)}s / ${duration}s`;
      
      if (elapsed >= duration) {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
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
    recordBtnText.textContent = 'Start Recording';
    recordBtn.classList.remove('recording');
  }
});

// Initialize
loadSettings();
