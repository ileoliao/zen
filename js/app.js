
    // State variables
    let currentSceneIndex = 0;
    let currentTrackIndex = 0;
    let isPlaying = false;
    let currentHowl = null;
    let smoothedIntensity = 0;
    let smoothedScale = 1;
    let animationId = null;

    // Audio analysis
    let analyser = null;
    let dataArray = null;
    let bassHistory = [];
    let previousEnergy = 0;
    let visualIntensity = 0;

    // Pomodoro state
    let pomodoroTimeRemaining = POMODORO_CONFIG.workDuration;
    let pomodoroIsRunning = false;
    let pomodoroInterval = null;
    let pomodoroIsWorkSession = true;

    const iosAudioPlayer = document.getElementById('iosAudioPlayer');

    const sceneIndicator = document.getElementById('sceneIndicator');
    const sceneName = document.getElementById('sceneName');
    const playBtn = document.getElementById('playBtn');
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    const progressRing = document.getElementById('progressRing');
    const trackInfo = document.getElementById('trackInfo');
    const trackName = document.getElementById('trackName');
    const trackArtist = document.getElementById('trackArtist');
    const swipeHint = document.getElementById('swipeHint');
    const volumeOverlay = document.getElementById('volumeOverlay');
    const volumeFill = document.getElementById('volumeFill');
    const bgGradient = document.getElementById('bgGradient');

    let hideTimeout;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let longPressTimer;

    // Track switching variables
    let isTrackSwitching = false;
    let touchCurrentY = 0;

    // New DOM elements for track switching
    const trackPreviewUp = document.getElementById('trackPreviewUp');
    const trackPreviewDown = document.getElementById('trackPreviewDown');
    const previewNameUp = document.getElementById('previewNameUp');
    const previewNameDown = document.getElementById('previewNameDown');
    const boundaryHint = document.getElementById('boundaryHint');

    // Mobile detection for iOS
    // iOS Safari has extremely strict Web Audio API policies that often cause silent playback
    // To ensure reliable audio on iOS, we must use HTML5 Audio instead of Web Audio API
    const isIOS = [
      'iPad Simulator',
      'iPhone Simulator',
      'iPod Simulator',
      'iPad',
      'iPhone',
      'iPod'
    ].includes(navigator.platform)
    // Wire up events for the iOS native fallback
    if (isIOS) {
      iosAudioPlayer.addEventListener('ended', onTrackEnd);

      iosAudioPlayer.addEventListener('error', (e) => {
        console.error('iOS Audio Player Error:', iosAudioPlayer.error);
        // Recovery logic on error
        pausePlayback();
      });

      // Handle network buffering states
      iosAudioPlayer.addEventListener('waiting', () => {
        if (isPlaying) playBtn.classList.add('loading');
      });

      iosAudioPlayer.addEventListener('stalled', () => {
        if (isPlaying) playBtn.classList.add('loading');
      });

      iosAudioPlayer.addEventListener('playing', () => {
        playBtn.classList.remove('loading');
      });

      iosAudioPlayer.addEventListener('canplay', () => {
        if (isPlaying && iosAudioPlayer.paused) {
          iosAudioPlayer.play().catch(e => console.warn('iOS Auto-resume failed:', e));
        }
      });

      iosAudioPlayer.volume = DEFAULT_VOLUME;
    }

    // Preload all audio using Howler
    const preloadedSounds = {};
    let musicPreloaded = false;

    function preloadAllMusic() {
      if (musicPreloaded) return;
      musicPreloaded = true;

      const allFiles = [];

      // Prioritize current scene's tracks
      const currentScene = SCENES[currentSceneIndex];
      if (currentScene) {
        currentScene.tracks.forEach(track => {
          if (!allFiles.includes(track.file)) {
            allFiles.push(track.file);
          }
        });
      }

      // Then queue the rest
      SCENES.forEach((scene, index) => {
        if (index === currentSceneIndex) return; // Already loaded
        scene.tracks.forEach(track => {
          if (!allFiles.includes(track.file)) {
            allFiles.push(track.file);
          }
        });
      });

      // Start preloading in priority order
      // On desktop, we use Howler to preload via Web Audio API.
      // On iOS, we fetch the audio files directly into the browser's disk cache
      // because iOS Safari refuses to preload <audio> elements before user interaction.
      if (isIOS) {
        allFiles.forEach(file => {
          fetch(`music/${file}`, { mode: 'no-cors' }).catch(err => {
            console.warn(`Failed to pre-cache ${file} on iOS:`, err);
          });
        });
        return;
      }

      allFiles.forEach(file => {
        preloadedSounds[file] = new Howl({
          src: [`music/${file}`],
          html5: false, // Desktop uses Web Audio API
          preload: true,
          volume: DEFAULT_VOLUME,

          onloaderror: function (id, err) {
            console.error(`Failed to load ${file}:`, err);
          }
        });
      });
    }

    function getSceneByTime() {
      const hour = new Date().getHours();
      const index = SCENES.findIndex(s => hour >= s.startHour && hour < s.endHour);
      return index !== -1 ? index : 3;
    }

    function loadScene(index) {
      currentSceneIndex = index;
      const scene = SCENES[index];

      sceneName.textContent = scene.name;
      sceneName.className = 'scene-name ' + scene.id;
      playBtn.className = 'play-button ' + scene.id + (isPlaying ? ' playing' : '');
      progressRing.className = 'progress-ring-fill ' + scene.id;

      // Update timer color based on scene
      updatePomodoroDisplay();

      // Reset visual effects when not playing
      if (!isPlaying) {
        resetVisualEffects();
      }

      // Update background gradient based on scene - smooth transition
      if (bgGradient) {
        // Remove old scene classes
        bgGradient.classList.remove('begin', 'deep', 'flow', 'unwind');
        // Add new scene class
        bgGradient.classList.add(scene.id);
      }

      currentTrackIndex = 0;
      loadTrack();
    }

    function loadTrack() {
      const scene = SCENES[currentSceneIndex];
      const track = scene.tracks[currentTrackIndex];

      trackName.textContent = track.title;
      trackArtist.textContent = track.artist;

      // Stop current playback without unloading (keep preloaded sounds)
      if (isIOS) {
        iosAudioPlayer.pause();
      } else if (currentHowl) {
        currentHowl.stop();
      }

      // Reset onset detection when switching tracks
      previousEnergy = 0;
      visualIntensity = 0;
      bassHistory = [];

      const file = track.file;

      if (isIOS) {
        // Point the unified native audio element to the new source
        iosAudioPlayer.src = `music/${file}`;
        iosAudioPlayer.load();
      } else {
        // Use preloaded Howl if available
        // Don't create new Howl here to avoid creating AudioContext before user gesture
        if (preloadedSounds[file]) {
          currentHowl = preloadedSounds[file];
        } else {
          // Will be created in ensureCurrentHowl() when playback starts
          currentHowl = null;
        }

        // Register onend callback so tracks auto-advance
        if (currentHowl) {
          currentHowl.off('end');
          currentHowl.on('end', onTrackEnd);
        }
      }
    }

    // Create Howl on demand (only called during user interaction)
    function ensureCurrentHowl() {
      if (isIOS || currentHowl) return;
      const scene = SCENES[currentSceneIndex];
      const track = scene.tracks[currentTrackIndex];
      const file = track.file;

      if (preloadedSounds[file]) {
        currentHowl = preloadedSounds[file];
      } else {
        currentHowl = new Howl({
          src: [`music/${file}`],
          html5: false,
          volume: DEFAULT_VOLUME
        });
      }

      currentHowl.off('end');
      currentHowl.on('end', onTrackEnd);
    }

    let analyserConnected = false;

    function initAudioContext() {
      // If we are using HTML5 Audio (iOS), we cannot use AnalyserNode reliably
      // without CORS issues or MediaElementSource complications on Safari.
      // So we skip it entirely.
      if (isIOS) return;

      // Force create Howler's AudioContext if it doesn't exist yet
      if (!Howler.ctx) {
        Howler.volume(DEFAULT_VOLUME);
      }

      if (!analyser && Howler.ctx) {
        analyser = Howler.ctx.createAnalyser();
        analyser.fftSize = AUDIO_CONFIG.fftSize;
        analyser.smoothingTimeConstant = AUDIO_CONFIG.smoothingTimeConstant;
        analyser.minDecibels = AUDIO_CONFIG.minDecibels;
        analyser.maxDecibels = AUDIO_CONFIG.maxDecibels;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
      }

      // Connect analyser as a BRANCH (don't disconnect masterGain!)
      // Existing: Howler.masterGain → ctx.destination (keep for audio output)
      // Added:   Howler.masterGain → analyser (for visualization data only)
      // This way audio always reaches speakers even if analyser fails
      if (analyser && Howler.masterGain && !analyserConnected) {
        try {
          Howler.masterGain.connect(analyser);
          analyserConnected = true;
        } catch (e) {
          console.warn('Failed to connect analyser:', e);
        }
      }
    }

    function onTrackEnd() {
      currentTrackIndex = (currentTrackIndex + 1) % SCENES[currentSceneIndex].tracks.length;
      loadTrack();
      if (isPlaying) {
        startPlayback();
      }
    }

    // Track switching functions
    function nextTrack() {
      const scene = SCENES[currentSceneIndex];
      const totalTracks = scene.tracks.length;
      
      if (currentTrackIndex < totalTracks - 1) {
        // Animate out
        trackInfo.classList.add('switching-up');
        
        setTimeout(() => {
          currentTrackIndex++;
          loadTrack();
          
          // Reset animation
          trackInfo.classList.remove('switching-up');
          
          // Auto-play if timer is running
          if (pomodoroIsRunning) {
            startPlayback();
          }
        }, 350);
      } else {
        // Boundary feedback
        showBoundaryHint('last');
        trackInfo.classList.add('bounce-up');
        setTimeout(() => trackInfo.classList.remove('bounce-up'), 300);
      }
    }

    function prevTrack() {
      if (currentTrackIndex > 0) {
        // Animate out
        trackInfo.classList.add('switching-down');
        
        setTimeout(() => {
          currentTrackIndex--;
          loadTrack();
          
          // Reset animation
          trackInfo.classList.remove('switching-down');
          
          // Auto-play if timer is running
          if (pomodoroIsRunning) {
            startPlayback();
          }
        }, 350);
      } else {
        // Boundary feedback
        showBoundaryHint('first');
        trackInfo.classList.add('bounce-down');
        setTimeout(() => trackInfo.classList.remove('bounce-down'), 300);
      }
    }

    function updateTrackPreview(direction) {
      const scene = SCENES[currentSceneIndex];
      const totalTracks = scene.tracks.length;
      
      if (direction === 'up') {
        if (currentTrackIndex < totalTracks - 1) {
          previewNameUp.textContent = scene.tracks[currentTrackIndex + 1].title;
          trackPreviewUp.classList.add('visible');
        } else {
          trackPreviewUp.classList.remove('visible');
        }
        trackPreviewDown.classList.remove('visible');
      } else if (direction === 'down') {
        if (currentTrackIndex > 0) {
          previewNameDown.textContent = scene.tracks[currentTrackIndex - 1].title;
          trackPreviewDown.classList.add('visible');
        } else {
          trackPreviewDown.classList.remove('visible');
        }
        trackPreviewUp.classList.remove('visible');
      }
    }

    function hideTrackPreview() {
      trackPreviewUp.classList.remove('visible');
      trackPreviewDown.classList.remove('visible');
    }

    function showBoundaryHint(position) {
      if (position === 'first') {
        boundaryHint.textContent = 'First track';
      } else {
        boundaryHint.textContent = 'Last track';
      }
      boundaryHint.classList.add('visible');
      setTimeout(() => boundaryHint.classList.remove('visible'), 1500);
    }

    function togglePlay() {
      if (playBtn.classList.contains('loading')) return;

      // Toggle Pomodoro Timer (music follows automatically)
      togglePomodoro();

      resetHideTimer();

      // Forcefully remove focus from button so iOS doesn't get stuck in a pseudo-hover/active state
      playBtn.blur();
    }

    function startPlayback() {
      playBtn.classList.add('loading');

      // 1. Desktop: Web Audio Context Resurrection
      if (!isIOS) {
        if (!Howler.ctx) {
          Howler.volume(DEFAULT_VOLUME);
        }
        if (Howler.ctx && Howler.ctx.state === 'suspended') {
          Howler.ctx.resume().catch(e => console.warn('Failed to resume AudioContext:', e));
        }
      }

      // Ensure music is preloaded (first interaction)
      preloadAllMusic();

      if (!isIOS && !currentHowl) {
        ensureCurrentHowl();
      }

      // Initialize audio context for analysis (bypasses on iOS)
      initAudioContext();

      // Check if already loaded
      if (isIOS) {
        // Native audio is ready enough when network state is not EMPTY
        if (iosAudioPlayer.readyState >= 2) {
          playAudioAndStart();
        } else {
          // If we just set src, play() will automatically wait for enough data
          playAudioAndStart();
        }
      } else {
        if (currentHowl.state() === 'loaded') {
          playAudioAndStart();
        } else if (currentHowl.state() === 'loading') {
          // Wait for load
          currentHowl.once('load', () => {
            playAudioAndStart();
          });
        } else {
          // State is 'unloaded', need to load first
          currentHowl.load();
          currentHowl.once('load', () => {
            playAudioAndStart();
          });
        }
      }
    }

    function playAudioAndStart() {
      if (isIOS) {
        // Bypass Howler completely, directly manipulate native element
        playBtn.classList.add('loading'); // Show loading until it actually starts
        iosAudioPlayer.play().then(() => {
          onPlaybackStart();
        }).catch(err => {
          // Play request interrupted by network/buffer wait is fine, 
          // our 'playing' and 'canplay' listeners will catch it when it continues
          console.warn('iOS Native Play Interrupted/Wait:', err);
          // Don't remove loading spinner here, let the event listeners handle it
        });
      } else {
        // Desktop Web Audio Logic
        if (Howler.ctx && Howler.ctx.state === 'suspended') {
          Howler.ctx.resume().catch(e => console.warn('Failed to resume AudioContext:', e));
        }
        currentHowl.play();
        onPlaybackStart();
      }
    }

    function onPlaybackStart() {
      isPlaying = true;
      playBtn.classList.remove('loading');
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
      playBtn.classList.add('playing');
      showTrackInfo();
    }

    function pausePlayback() {
      isPlaying = false;
      if (isIOS) {
        iosAudioPlayer.pause();
      } else if (currentHowl) {
        currentHowl.pause();
      }
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
      playBtn.classList.remove('playing');
      resetVisualEffects();
    }

    // Start visualization loop for Pomodoro progress
    function startVisualizationLoop() {
      if (animationId) cancelAnimationFrame(animationId);
      visualizeLoop();
    }

    function visualizeLoop() {
      visualize();
      animationId = requestAnimationFrame(visualizeLoop);
    }

    function stopVisualizationLoop() {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    }

    function resetVisualEffects() {
      playBtn.style.transform = '';
      playBtn.style.boxShadow = '';
      playBtn.style.borderColor = '';
      playBtn.style.opacity = '';
      progressRing.style.stroke = '';
      progressRing.style.filter = '';
      smoothedIntensity = 0;
      smoothedScale = 1;
      bassHistory = [];
      previousEnergy = 0;
      visualIntensity = 0;
    }

    function play() {
      isPlaying = true;
      startPlayback();
    }

    function nextScene() {
      loadScene((currentSceneIndex + 1) % SCENES.length);
      play();
      showUI();
    }

    function prevScene() {
      loadScene((currentSceneIndex - 1 + SCENES.length) % SCENES.length);
      play();
      showUI();
    }

    function showTrackInfo() {
      trackInfo.classList.add('visible');
      resetHideTimer();
    }

    function showUI() {
      sceneIndicator.classList.remove('hidden');
      trackInfo.classList.add('visible');
      swipeHint.classList.add('visible');
      resetHideTimer();
    }

    function hideUI() {
      sceneIndicator.classList.add('hidden');
      trackInfo.classList.remove('visible');
      swipeHint.classList.remove('visible');
      hideTrackPreview();
    }

    function resetHideTimer() {
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(hideUI, GESTURE_CONFIG.uiHideDelay);
    }

    function updateProgress() {
      // Show Pomodoro progress instead of music progress
      // Ring fills up as time passes (empty → full)
      const circumference = 440;
      if (!pomodoroIsRunning) {
        // Show empty ring when not running
        progressRing.style.strokeDashoffset = circumference;
        return;
      }
      const totalDuration = pomodoroIsWorkSession ? POMODORO_CONFIG.workDuration : POMODORO_CONFIG.breakDuration;
      const elapsed = totalDuration - pomodoroTimeRemaining;
      const progress = elapsed / totalDuration;
      const offset = circumference - (progress * circumference);
      progressRing.style.strokeDashoffset = offset;
    }

    // Audio-driven visualization
    let frameCount = 0;
    function visualize() {
      frameCount++;

      // Update progress ring (always update for Pomodoro)
      updateProgress();

      // Only do audio visualization when music is playing
      let audioIntensity = 0;

      // Only do audio visualization when music is actually playing
      const isActuallyPlaying = isIOS ? (!iosAudioPlayer.paused) : (currentHowl && currentHowl.playing());

      if (isActuallyPlaying && !isIOS) {
        // Get audio frequency data if available
        if (analyser && dataArray) {
          analyser.getByteFrequencyData(dataArray);

          // Capture low frequencies: bass + low-mids for piano and kick drum
          // fftSize 256 = 128 bins. With 44.1kHz sample rate:
          // bin 0-7 (~0-1300Hz): captures bass notes, low piano chords, kick drum
          const lowBinCount = Math.min(8, dataArray.length);
          let lowSum = 0;

          for (let i = 0; i < lowBinCount; i++) {
            lowSum += dataArray[i];
          }

          // Calculate current frame energy (normalized 0-1)
          const currentEnergy = lowSum / lowBinCount / 255;

          // ONSET DETECTION: Detect sudden energy increase (attack/beat)
          const energyDelta = currentEnergy - previousEnergy;
          let onsetStrength = 0;

          if (energyDelta > AUDIO_CONFIG.onsetThreshold) {
            // Onset detected! Calculate strength based on how sharp the increase is
            onsetStrength = Math.min(1, energyDelta * AUDIO_CONFIG.onsetSensitivity);
          }

          // Update visual intensity:
          // 1. If there's an onset, add it to current intensity (stacking for strong beats)
          // 2. Always apply decay to create fade-out effect
          if (onsetStrength > 0) {
            // Add new onset to existing intensity (cap at 1.0)
            visualIntensity = Math.min(1.0, visualIntensity + onsetStrength * 0.8);
          }

          // Apply decay every frame
          visualIntensity *= AUDIO_CONFIG.decayRate;

          // Minimum breathing level so it's never completely flat
          visualIntensity = Math.max(0.12, visualIntensity);

          // Store current energy for next frame
          previousEnergy = currentEnergy;

          // Use visualIntensity directly (no additional smoothing needed due to decay)
          audioIntensity = visualIntensity;
        }
      } else if (isActuallyPlaying && isIOS) {
        // Fallback breathing animation for iOS (HTML5 Audio mode lacks AnalyserNode)
        // Use a time-based sine wave to create a smooth, noticeable rhythmic pulse
        const time = Date.now() / 1000;

        // Base intensity + sine wave oscillation
        // Oscillation range: -1 to 1. We scale it and add to a base value.
        // Base 0.3, Swing 0.15 = pulsates between 0.15 and 0.45
        const breatheSpeed = 4.0; // Seconds per full breath cycle
        const pulse = Math.sin(time * Math.PI * 2 / breatheSpeed);

        visualIntensity = 0.3 + (pulse * 0.15);
        previousEnergy = 0;
        audioIntensity = visualIntensity;
      } else {
        // Reset to gentle, almost static breathing when paused/stopped
        visualIntensity = 0.12;
        previousEnergy = 0;
        audioIntensity = 0.12;
      }

      // Less smoothing for more responsive pulse effect
      smoothedIntensity = smoothedIntensity + (audioIntensity - smoothedIntensity) * 0.25;

      // Calculate scale based on audio intensity - more dramatic range
      const baseScale = 1;
      const maxScale = 1.2;
      const targetScale = baseScale + smoothedIntensity * (maxScale - baseScale);
      smoothedScale = smoothedScale + (targetScale - smoothedScale) * 0.15;

      // Get scene color from config
      const baseColor = SCENE_COLORS[SCENES[currentSceneIndex].id] || [168, 200, 236];

      // Dynamic opacity based on intensity
      const opacity = 0.8 + smoothedIntensity * 0.15;

      // Dynamic glow based on intensity - smaller, more subtle range
      const glowSize = 30 + smoothedIntensity * 60; // 30 to 90px
      const glowAlpha = 0.4 + smoothedIntensity * 0.3; // More subtle base glow
      const glowColor = `rgba(${baseColor.join(',')}, ${glowAlpha})`;

      playBtn.style.transform = `scale(${smoothedScale})`;
      playBtn.style.boxShadow = `0 0 ${glowSize}px ${smoothedIntensity * 15}px ${glowColor}`;
      playBtn.style.borderColor = `rgba(${baseColor.join(',')}, ${0.5 + smoothedIntensity * 0.3})`;
      playBtn.style.opacity = opacity;
      progressRing.style.stroke = `rgb(${baseColor.join(',')})`;
    }

    // Pomodoro Timer Functions
    const timerDisplay = document.getElementById('timerDisplay');

    function formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function updatePomodoroDisplay() {
      timerDisplay.textContent = formatTime(pomodoroTimeRemaining);

      // Set scene-specific color from config
      const baseColorRGB = SCENE_COLORS[SCENES[currentSceneIndex].id] || [255, 255, 255];
      const baseColor = `rgba(${baseColorRGB.join(',')}, `;
      timerDisplay.style.color = baseColor + '0.35)';
    }

    function startPomodoro() {
      if (!pomodoroIsRunning) {
        pomodoroIsRunning = true;
        timerDisplay.classList.add('active');
        startVisualizationLoop(); // Start visualization loop for progress ring
        pomodoroInterval = setInterval(() => {
          if (pomodoroTimeRemaining > 0) {
            pomodoroTimeRemaining--;
            updatePomodoroDisplay();
          } else {
            // Timer completed
            completePomodoroSession();
          }
        }, 1000);

        // Auto-play music when pomodoro starts
        startPlayback();
      }
    }

    function pausePomodoro() {
      if (pomodoroIsRunning) {
        pomodoroIsRunning = false;
        timerDisplay.classList.remove('active');
        clearInterval(pomodoroInterval);
        pomodoroInterval = null;
        stopVisualizationLoop(); // Stop visualization loop

        // Auto-pause music when pomodoro pauses
        pausePlayback();
      }
    }

    function resetPomodoro() {
      pausePomodoro();
      pomodoroTimeRemaining = pomodoroIsWorkSession ? POMODORO_CONFIG.workDuration : POMODORO_CONFIG.breakDuration;
      updatePomodoroDisplay();
    }

    function completePomodoroSession() {
      pausePlayback();
      pomodoroIsRunning = false;
      clearInterval(pomodoroInterval);
      pomodoroInterval = null;
      timerDisplay.classList.remove('active');

      // Show completion feedback
      showCompletionFeedback();

      // Vibrate if on mobile
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
    }

    function showCompletionFeedback() {
      // Save original content
      const originalContent = timerDisplay.textContent;

      // Show checkmark
      timerDisplay.textContent = '✓';
      timerDisplay.style.fontSize = '24px';
      timerDisplay.style.opacity = '1';

      // Restore after 2 seconds
      setTimeout(() => {
        timerDisplay.textContent = originalContent;
        timerDisplay.style.fontSize = '';
        timerDisplay.style.opacity = '';

        // Reset to work mode
        pomodoroIsWorkSession = true;
        pomodoroTimeRemaining = POMODORO_CONFIG.workDuration;
        updatePomodoroDisplay();
      }, 2000);
    }

    function togglePomodoro() {
      if (pomodoroIsRunning) {
        pausePomodoro();
      } else {
        startPomodoro();
      }
    }

    // Long press to reset
    let pomodoroLongPressTimer;
    let pomodoroIsLongPress = false;

    timerDisplay.addEventListener('mousedown', (e) => {
      e.preventDefault();
      pomodoroIsLongPress = false;
      pomodoroLongPressTimer = setTimeout(() => {
        pomodoroIsLongPress = true;
        resetPomodoro();
        // Visual feedback
        timerDisplay.style.opacity = '1';
        setTimeout(() => {
          timerDisplay.style.opacity = '';
        }, 200);
      }, POMODORO_CONFIG.longPressDelay);
    });

    timerDisplay.addEventListener('mouseup', () => {
      clearTimeout(pomodoroLongPressTimer);
    });

    timerDisplay.addEventListener('mouseleave', () => {
      clearTimeout(pomodoroLongPressTimer);
    });

    // Touch support for long press
    timerDisplay.addEventListener('touchstart', (e) => {
      e.preventDefault();
      pomodoroIsLongPress = false;
      pomodoroLongPressTimer = setTimeout(() => {
        pomodoroIsLongPress = true;
        resetPomodoro();
        if (navigator.vibrate) navigator.vibrate(50);
      }, POMODORO_CONFIG.longPressDelay);
    }, { passive: false });

    timerDisplay.addEventListener('touchend', () => {
      clearTimeout(pomodoroLongPressTimer);
    });

    // Note: Timer display is now read-only. Use play button to control Pomodoro.
    // Long press on timer still resets it.

    // Event Listeners
    playBtn.addEventListener('click', togglePlay);

    // Touch events - support both horizontal (scene) and vertical (track) swipes
    document.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchCurrentY = touchStartY;
      touchStartTime = Date.now();
      isTrackSwitching = false;

      longPressTimer = setTimeout(() => {
        volumeOverlay.classList.add('active');
      }, GESTURE_CONFIG.longPressDelay);
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      clearTimeout(longPressTimer);

      if (volumeOverlay.classList.contains('active')) return;

      const currentY = e.touches[0].clientY;
      const diffY = touchStartY - currentY;

      // Check if this is a vertical swipe
      if (Math.abs(diffY) > 20 && !isTrackSwitching) {
        isTrackSwitching = true;
      }

      // Show preview during vertical swipe
      if (isTrackSwitching) {
        touchCurrentY = currentY;
        const cumulativeDiffY = touchStartY - currentY;

        if (cumulativeDiffY > 30) {
          // Swiping up - show next track preview
          updateTrackPreview('up');
          // Add slight visual feedback to current track
          trackInfo.style.transform = `translateY(${-cumulativeDiffY * 0.3}px)`;
          trackInfo.style.opacity = Math.max(0.3, 0.7 - cumulativeDiffY / 200);
        } else if (cumulativeDiffY < -30) {
          // Swiping down - show prev track preview
          updateTrackPreview('down');
          // Add slight visual feedback to current track
          trackInfo.style.transform = `translateY(${-cumulativeDiffY * 0.3}px)`;
          trackInfo.style.opacity = Math.max(0.3, 0.7 + cumulativeDiffY / 200);
        }
      }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      clearTimeout(longPressTimer);

      // Reset track info transform
      trackInfo.style.transform = '';
      trackInfo.style.opacity = '';
      hideTrackPreview();

      if (volumeOverlay.classList.contains('active')) {
        setTimeout(() => volumeOverlay.classList.remove('active'), 1500);
        return;
      }

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const diffX = touchStartX - touchEndX;
      const diffY = touchStartY - touchEndY;
      const duration = Date.now() - touchStartTime;

      // Determine swipe type
      const isHorizontalSwipe = Math.abs(diffX) > Math.abs(diffY);

      if (isTrackSwitching && Math.abs(diffY) > GESTURE_CONFIG.trackSwitchThreshold) {
        // Vertical swipe - switch tracks
        if (diffY > 0) {
          nextTrack(); // Swipe up = next track
        } else {
          prevTrack(); // Swipe down = prev track
        }
        showUI();
      } else if (isHorizontalSwipe && Math.abs(diffX) > GESTURE_CONFIG.sceneSwitchThreshold) {
        // Horizontal swipe - switch scenes
        if (diffX > 0) {
          nextScene();
        } else {
          prevScene();
        }
      } else if (Math.abs(diffX) < 30 && Math.abs(diffY) < 30) {
        // Tap - show UI
        showUI();
      }

      isTrackSwitching = false;
    }, { passive: true });

    // Volume control
    function setVolumeFromTouch(clientY) {
      const rect = document.getElementById('volumeSlider').getBoundingClientRect();
      const percent = 1 - ((clientY - rect.top) / rect.height);
      const volume = Math.max(0, Math.min(1, percent));

      if (isIOS) {
        iosAudioPlayer.volume = volume;
      } else if (currentHowl) {
        currentHowl.volume(volume);
      }

      volumeFill.style.height = (volume * 100) + '%';
    }

    volumeOverlay.addEventListener('touchstart', (e) => {
      setVolumeFromTouch(e.touches[0].clientY);
    }, { passive: true });

    volumeOverlay.addEventListener('touchmove', (e) => {
      setVolumeFromTouch(e.touches[0].clientY);
    }, { passive: true });

    // Mouse click to show UI (exclude play button)
    document.addEventListener('click', (e) => {
      if (e.target !== playBtn && !playBtn.contains(e.target)) {
        showUI();
      }
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        nextScene();
      } else if (e.code === 'ArrowLeft') {
        prevScene();
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        prevTrack();
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        nextTrack();
      }
    });

    // Initialize - don't preload here, defer to first user interaction
    // This avoids creating AudioContext before user gesture on iOS
    loadScene(getSceneByTime());
    resetHideTimer();
    updatePomodoroDisplay(); // Initialize Pomodoro timer display
    startVisualizationLoop(); // Start visualization loop for Pomodoro progress ring

    // Aggressively preload on iOS via fetch() without waiting for user interaction
    // Desktop will wait for unlockAudio() to avoid Web Audio warnings.
    if (isIOS) {
      preloadAllMusic();
    }

    // Unlock audio on iOS - must happen on first user interaction
    let audioUnlocked = false;
    function unlockAudio() {
      if (audioUnlocked) return;
      audioUnlocked = true;

      // Force Howler to create AudioContext synchronously in user gesture
      Howler.volume(DEFAULT_VOLUME);

      // Resume synchronously - don't await
      if (Howler.ctx && Howler.ctx.state === 'suspended') {
        Howler.ctx.resume().catch(e => console.warn('Failed to resume AudioContext:', e));
      }

      // Preload all music now that AudioContext exists
      preloadAllMusic();

      console.log('Audio unlocked');
    }

    // Unlock on first click/touch
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('touchstart', unlockAudio, { once: true });

