let currentProjectPath = null;
let currentProxyURL = null;
let animationFrame = null;
let isPlaying = false;
let animationDuration = 6; // Default animation duration in seconds
let currentAnimationTime = 0;
let animationStartTimestamp = null;
let animationPausedAt = 0;
let rafId = null;

// DOM elements
const projectPathInput = document.getElementById('projectPath');
const loadProjectBtn = document.getElementById('loadProjectBtn');
const projectStatus = document.getElementById('projectStatus');
const previewContainer = document.getElementById('previewContainer');
const exportBtn = document.getElementById('exportBtn');
const durationInput = document.getElementById('duration');
const fpsInput = document.getElementById('fps');
const outputPathInput = document.getElementById('outputPath');
const progressContainer = document.getElementById('progress');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const exportStatus = document.getElementById('exportStatus');
const browseProjectBtn = document.getElementById('browseProjectBtn');
const browseOutputBtn = document.getElementById('browseOutputBtn');

// Animation controls
const playPauseBtn = document.getElementById('playPauseBtn');
const playIcon = document.getElementById('playIcon');
const restartBtn = document.getElementById('restartBtn');
const timeline = document.getElementById('timeline');
const currentTimeDisplay = document.getElementById('currentTime');
const totalTimeDisplay = document.getElementById('totalTime');

// Update duration when input changes
durationInput.addEventListener('change', () => {
    animationDuration = parseFloat(durationInput.value) || 6;
    totalTimeDisplay.textContent = animationDuration.toFixed(2);
    timeline.max = animationDuration * 1000;
});

// Load selected project
loadProjectBtn.addEventListener('click', async () => {
    const selectedPath = projectPathInput.value.trim();

    if (!selectedPath) {
        showStatus('Please select a project folder', 'error');
        return;
    }

    loadProjectBtn.disabled = true;
    loadProjectBtn.textContent = 'Loading...';
    showStatus('Starting Vite dev server, please wait...', 'info');

    try {
        const response = await fetch('/api/start-vite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectPath: selectedPath })
        });

        const result = await response.json();

        if (response.ok) {
            currentProjectPath = selectedPath;
            // Use direct Vite URL - proxy doesn't work well with Vite's module resolution
            currentProxyURL = result.url;

            showStatus(`Server ready! Loading animation...`, 'success');

            // Wait a bit for Vite to be fully ready
            await new Promise(resolve => setTimeout(resolve, 1500));

            loadAnimation();
        } else {
            showStatus(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Failed to load project:', error);
        showStatus(`Failed to load project: ${error.message}`, 'error');
    } finally {
        loadProjectBtn.disabled = false;
        loadProjectBtn.textContent = 'Load Project';
    }
});

function loadAnimation() {
    previewContainer.innerHTML = '';

    animationFrame = document.createElement('iframe');
    animationFrame.style.width = '100%';
    animationFrame.style.height = '100%';
    animationFrame.style.border = 'none';
    animationFrame.src = currentProxyURL;

    animationFrame.onload = () => {
        console.log('Animation loaded successfully');

        // Enable controls
        playPauseBtn.disabled = false;
        restartBtn.disabled = false;
        timeline.disabled = false;

        // Set timeline max based on duration
        animationDuration = parseFloat(durationInput.value) || 6;
        timeline.max = animationDuration * 1000;
        totalTimeDisplay.textContent = animationDuration.toFixed(2);

        showStatus('Animation loaded! Use controls to preview, then export.', 'success');
        updateExportButton();

        // Start animation playing automatically
        startAnimation();
    };

    animationFrame.onerror = () => {
        console.error('Failed to load animation');
        showStatus('Failed to load animation', 'error');
    };

    previewContainer.appendChild(animationFrame);
}

// Animation playback control via postMessage
function sendAnimationCommand(command, data = {}) {
    if (animationFrame && animationFrame.contentWindow) {
        animationFrame.contentWindow.postMessage({
            type: 'animation-control',
            command: command,
            ...data
        }, '*');
    }
}

function startAnimation() {
    isPlaying = true;
    playIcon.textContent = '⏸';
    animationStartTimestamp = performance.now() - (animationPausedAt * 1000);
    updateAnimationLoop();
}

function pauseAnimation() {
    isPlaying = false;
    playIcon.textContent = '▶';
    animationPausedAt = currentAnimationTime;
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
}

function updateAnimationLoop() {
    if (!isPlaying) return;

    const now = performance.now();
    currentAnimationTime = ((now - animationStartTimestamp) / 1000) % animationDuration;

    timeline.value = currentAnimationTime * 1000;
    currentTimeDisplay.textContent = currentAnimationTime.toFixed(2);

    rafId = requestAnimationFrame(updateAnimationLoop);
}

// Play/Pause button
playPauseBtn.addEventListener('click', () => {
    if (isPlaying) {
        pauseAnimation();
    } else {
        startAnimation();
    }
});

// Restart button
restartBtn.addEventListener('click', () => {
    currentAnimationTime = 0;
    animationPausedAt = 0;
    timeline.value = 0;
    currentTimeDisplay.textContent = '0.00';

    // Reload iframe to restart animation from beginning
    if (animationFrame) {
        animationFrame.src = animationFrame.src;
    }

    if (isPlaying) {
        animationStartTimestamp = performance.now();
    }
});

// Timeline scrubbing
let isScrubbing = false;

timeline.addEventListener('mousedown', () => {
    isScrubbing = true;
    if (isPlaying) {
        pauseAnimation();
    }
});

timeline.addEventListener('input', () => {
    if (isScrubbing) {
        const timeMs = parseInt(timeline.value);
        currentAnimationTime = timeMs / 1000;
        animationPausedAt = currentAnimationTime;
        currentTimeDisplay.textContent = currentAnimationTime.toFixed(2);

        // Reload iframe at specific time - animation will start from this point
        seekToTime(currentAnimationTime);
    }
});

timeline.addEventListener('mouseup', () => {
    isScrubbing = false;
});

function seekToTime(timeSeconds) {
    // Since we can't directly control the animation time in most cases,
    // we use a workaround: reload and let the user see where they are
    // The actual frame-accurate export will handle timing properly
    console.log(`Seeking to ${timeSeconds.toFixed(2)}s`);
}

function updateExportButton() {
    const outputPath = outputPathInput.value.trim();
    exportBtn.disabled = !(currentProxyURL && outputPath);
}

outputPathInput.addEventListener('input', updateExportButton);

// Browse project folder
browseProjectBtn.addEventListener('click', async () => {
    try {
        const currentPath = projectPathInput.value.trim();
        const response = await fetch('/api/select-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ defaultPath: currentPath || undefined })
        });

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            console.error('Non-JSON response');
            showStatus('Server error: Invalid response format', 'error');
            return;
        }

        const result = await response.json();

        if (result.success && result.path) {
            projectPathInput.value = result.path;
            updateExportButton();
            showStatus('Folder selected: ' + result.path, 'success');
        } else if (result.error && result.error !== 'Dialog cancelled') {
            showStatus('Failed to select folder: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Failed to open folder dialog:', error);
        showStatus('Failed to open folder dialog: ' + error.message, 'error');
    }
});

// Browse output folder
browseOutputBtn.addEventListener('click', async () => {
    try {
        const currentPath = outputPathInput.value.trim();
        const response = await fetch('/api/select-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ defaultPath: currentPath || undefined })
        });

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            showStatus('Server error: Invalid response format', 'error');
            return;
        }

        const result = await response.json();

        if (result.success && result.path) {
            outputPathInput.value = result.path;
            updateExportButton();
            showStatus('Output folder selected: ' + result.path, 'success');
        } else if (result.error && result.error !== 'Dialog cancelled') {
            showStatus('Failed to select folder: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Failed to open folder dialog:', error);
        showStatus('Failed to open folder dialog: ' + error.message, 'error');
    }
});

// Export PNG sequence using server-side Puppeteer with time freezing
exportBtn.addEventListener('click', async () => {
    const outputPath = outputPathInput.value.trim();

    if (!currentProxyURL || !outputPath) {
        alert('Please load a project and specify output folder');
        return;
    }

    const duration = parseFloat(durationInput.value);
    const fps = parseInt(fpsInput.value);

    if (isNaN(duration) || duration <= 0) {
        alert('Duration must be a positive number');
        return;
    }

    if (isNaN(fps) || fps <= 0 || fps > 60) {
        alert('FPS must be between 1 and 60');
        return;
    }

    // Pause animation during export
    pauseAnimation();

    const totalFrames = Math.ceil(duration * fps);

    exportBtn.disabled = true;
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
    exportStatus.textContent = 'Starting export...';

    try {
        const response = await fetch('/api/export-frames', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectURL: currentProxyURL,
                outputPath: outputPath,
                duration: duration,
                fps: fps
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(errorData.error || 'Export failed');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            const lines = text.trim().split('\n').filter(line => line.trim());

            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    if (data.progress !== undefined) {
                        progressBar.style.width = data.progress + '%';
                        progressText.textContent = `${Math.round(data.progress)}%`;
                        exportStatus.textContent = `Capturing frame ${data.frame}/${data.total}`;
                    } else if (data.success) {
                        exportStatus.textContent = `✓ ${data.message}`;
                        alert(`Export complete!\n${data.message}\nSaved to: ${outputPath}`);
                    } else if (data.error) {
                        throw new Error(data.error);
                    }
                } catch (e) {
                    if (!e.message.includes('JSON')) throw e;
                }
            }
        }

    } catch (error) {
        console.error('Export error:', error);
        exportStatus.textContent = '✗ Export failed: ' + error.message;
        alert('Export failed: ' + error.message);
    } finally {
        progressContainer.style.display = 'none';
        updateExportButton();
    }
});

function showStatus(message, type) {
    projectStatus.textContent = message;
    projectStatus.className = 'status-message ' + type;
}

// Initialize
updateExportButton();
totalTimeDisplay.textContent = animationDuration.toFixed(2);
