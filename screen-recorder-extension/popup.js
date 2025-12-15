// DOM Elements
const extensionEnabled = document.getElementById('extensionEnabled');
const settingsPanel = document.getElementById('settingsPanel');
const disabledPanel = document.getElementById('disabledPanel');
const durationInput = document.getElementById('duration');
const stabilizationInput = document.getElementById('stabilizationDelay');
const startDelayInput = document.getElementById('startDelay');
const qualitySelect = document.getElementById('quality');
const recordBtn = document.getElementById('recordBtn');
const recordBtnText = document.getElementById('recordBtnText');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

// State
let isRecording = false;
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
    'stabilizationDelay',
    'startDelay',
    'quality'
  ]);
  
  extensionEnabled.checked = settings.enabled !== false;
  durationInput.value = settings.duration || 10;
  stabilizationInput.value = settings.stabilizationDelay ?? 2;
  startDelayInput.value = settings.startDelay ?? 0;
  qualitySelect.value = settings.quality || 'maximum';
  
  updateUI();
}

// Save settings
async function saveSettings() {
  await chrome.storage.sync.set({
    enabled: extensionEnabled.checked,
    duration: parseInt(durationInput.value),
    stabilizationDelay: parseFloat(stabilizationInput.value) || 0,
    startDelay: parseFloat(startDelayInput.value) || 0,
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
}

// Event Listeners
extensionEnabled.addEventListener('change', async () => {
  await saveSettings();
  updateUI();
});

durationInput.addEventListener('change', saveSettings);
stabilizationInput.addEventListener('change', saveSettings);
startDelayInput.addEventListener('change', saveSettings);

qualitySelect.addEventListener('change', saveSettings);

// (area selection больше не используется)

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
  
  const duration = parseFloat(durationInput.value);
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
    
    // Параметры качества и задержек
    const qualitySettings = getQualitySettings(qualitySelect.value);
    const stabilizationDelaySec = parseFloat(stabilizationInput.value) || 0;
    const extraDelaySec = parseFloat(startDelayInput.value) || 0;
    
    // Показываем стандартный диалог выбора, что именно захватывать.
    // Рекомендуемый вариант — выбрать "Вкладка Chrome" и нужный таб.
    captureStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'never',            // курсор не пишем
        displaySurface: 'browser',  // приоритет у вкладок браузера
        width: { ideal: 4096 },
        height: { ideal: 2160 },
        frameRate: { ideal: qualitySettings.frameRate }
      },
      audio: false
    });
    
    // Задержки перед фактическим стартом записи:
    // 1) startDelay — дополнительная пауза перед началом;
    // 2) stabilizationDelay — пауза на "стабилизацию" таба.
    const stabilizationDelayMs = Math.max(0, stabilizationDelaySec) * 1000;
    const extraDelayMs = Math.max(0, extraDelaySec) * 1000;
    
    if (extraDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, extraDelayMs));
    }
    if (stabilizationDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, stabilizationDelayMs));
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
          // Показываем стандартный диалог сохранения файла
          saveAs: true
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
    const videoTracks = captureStream.getVideoTracks();
    if (videoTracks[0]) {
      videoTracks[0].onended = () => {
        if (isRecording && mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      };
    }
    
    // Start recording
    mediaRecorder.start(100);
    progressText.textContent = '🔴 Recording...';
    
    // Пользователь задаёт длительность чистой записи (без учёта задержек сверху).
    // Задержки мы уже отждали, теперь считаем время записи от 0 до duration.
    const effectiveDuration = duration;
    const startTime = Date.now();
    
    // Progress update loop
    const updateProgress = () => {
      if (!isRecording) return;
      
      const elapsed = (Date.now() - startTime) / 1000;
      const progress = Math.min((elapsed / effectiveDuration) * 100, 100);
      progressFill.style.width = `${progress}%`;
      progressText.textContent = `🔴 ${elapsed.toFixed(1)}s / ${effectiveDuration.toFixed(1)}s`;
      
      if (elapsed >= effectiveDuration) {
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
