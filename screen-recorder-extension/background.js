// Background service worker - handles recording and saving videos

// Quality presets (same as in popup)
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startRecordingInBackground') {
    const {
      duration,
      stabilizationDelay,
      startDelay,
      quality
    } = message;

    // Launch async recording flow; keep SW alive
    handleBackgroundRecording(duration, stabilizationDelay, startDelay, quality);
    sendResponse({ started: true });
    return true;
  }

  return false;
});

async function handleBackgroundRecording(duration, stabilizationDelay, startDelay, quality) {
  try {
    const qualitySettings = getQualitySettings(quality);
    const stabilizationDelayMs = Math.max(0, stabilizationDelay) * 1000;
    const extraDelayMs = Math.max(0, startDelay) * 1000;
    const effectiveDurationMs = Math.max(1000, duration * 1000); // минимум 1 секунда записи

    // Захватываем текущую активную вкладку
    const stream = await new Promise((resolve, reject) => {
      chrome.tabCapture.capture(
        {
          video: true,
          audio: false
        },
        (capturedStream) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!capturedStream) {
            reject(new Error('Failed to capture tab'));
          } else {
            resolve(capturedStream);
          }
        }
      );
    });

    // Ждём дополнительные задержки перед стартом записи
    if (extraDelayMs > 0) {
      await new Promise((r) => setTimeout(r, extraDelayMs));
    }
    if (stabilizationDelayMs > 0) {
      await new Promise((r) => setTimeout(r, stabilizationDelayMs));
    }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recordedChunks = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: qualitySettings.videoBitsPerSecond
    });

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      try {
        stream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(recordedChunks, { type: mimeType });
        if (blob.size < 1000) {
          console.error('Recording failed - empty video');
          return;
        }

        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fullFilename = `recording_${timestamp}.webm`;

        await chrome.downloads.download({
          url,
          filename: fullFilename,
          saveAs: true
        });

        URL.revokeObjectURL(url);
      } catch (e) {
        console.error('Error while saving recording:', e);
      }
    };

    // Авто-стоп после заданной длительности чистой записи
    recorder.start(100);
    setTimeout(() => {
      if (recorder.state === 'recording') {
        recorder.stop();
      }
    }, effectiveDurationMs);
  } catch (e) {
    console.error('Background recording error:', e);
  }
}
