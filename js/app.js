
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
    const bgGradient = document.getElementById('bgGradient');
    const loadingIndicator = document.getElementById('loadingIndicator');

    let hideTimeout;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let longPressTimer;

    // Track switching variables
    let isTrackSwitching = false;
    let touchCurrentY = 0;
    let ticking = false; // For requestAnimationFrame throttling

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

    // Smart preload system with sliding window
    const preloadedSounds = {};
    const preloadQueue = []; // 预加载队列
    let isPreloading = false;

    // Get list of tracks to preload based on sliding window strategy
    function getTracksToPreload(sceneIndex, trackIndex, count) {
      const scene = SCENES[sceneIndex];
      const tracks = [];
      
      for (let i = 0; i < count; i++) {
        const idx = (trackIndex + i) % scene.tracks.length;
        tracks.push({
          file: scene.tracks[idx].file,
          priority: i === 0 ? 'high' : 'normal' // 当前曲目高优先级
        });
      }
      
      return tracks;
    }

    // Preload specific track with priority
    function preloadTrack(file, priority = 'normal') {
      if (preloadedSounds[file]) return; // Already loaded
      
      if (isIOS) {
        // iOS: Use fetch for disk cache
        fetch(`music/${file}`, { mode: 'no-cors' }).catch(err => {
          console.warn(`Failed to pre-cache ${file} on iOS:`, err);
        });
        return;
      }

      // Desktop: Use Howler with streaming support
      preloadedSounds[file] = new Howl({
        src: [`music/${file}`],
        html5: PRELOAD_CONFIG.enableStreaming, // Use streaming
        preload: priority === 'high', // Only high priority auto-preload
        volume: DEFAULT_VOLUME,
        
        onload: function() {
          console.log(`Loaded: ${file}`);
        },
        
        onloaderror: function(id, err) {
          console.error(`Failed to load ${file}:`, err);
          delete preloadedSounds[file]; // Remove from cache on error
        }
      });
    }

    // Cleanup old preloaded sounds (keep only bufferSize tracks)
    function cleanupPreloadedSounds(keepFiles) {
      Object.keys(preloadedSounds).forEach(file => {
        if (!keepFiles.includes(file)) {
          const sound = preloadedSounds[file];
          if (sound && !sound.playing()) {
            sound.unload(); // Release memory
            delete preloadedSounds[file];
            console.log(`Unloaded: ${file}`);
          }
        }
      });
    }

    // Loading indicator helpers
    function showLoading() {
      if (loadingIndicator) loadingIndicator.classList.add('visible');
    }

    function hideLoading() {
      if (loadingIndicator) loadingIndicator.classList.remove('visible');
    }

    // Smart preload for current position
    function smartPreload() {
      const tracks = getTracksToPreload(
        currentSceneIndex, 
        currentTrackIndex, 
        PRELOAD_CONFIG.bufferSize
      );
      
      const keepFiles = tracks.map(t => t.file);
      
      // Cleanup old sounds
      cleanupPreloadedSounds(keepFiles);
      
      // Preload new tracks with priority
      tracks.forEach((track, index) => {
        setTimeout(() => {
          preloadTrack(track.file, track.priority);
        }, index * 200); // Stagger loading to avoid overwhelming
      });
    }

    // Preload scene tracks on switch
    function preloadScene(sceneIndex) {
      const scene = SCENES[sceneIndex];
      const count = Math.min(PRELOAD_CONFIG.scenePreloadCount, scene.tracks.length);
      
      for (let i = 0; i < count; i++) {
        const file = scene.tracks[i].file;
        setTimeout(() => {
          preloadTrack(file, i === 0 ? 'high' : 'normal');
        }, i * 300);
      }
    }

    // Legacy function for compatibility
    function preloadAllMusic() {
      // Now uses smartPreload instead
      smartPreload();
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
        bgGradient.classList.remove('forge', 'begin', 'deep', 'flow', 'unwind');
        // Add new scene class
        bgGradient.classList.add(scene.id);
      }

      currentTrackIndex = 0;
      loadTrack();

      // Preload first few tracks of new scene
      setTimeout(() => preloadScene(index), 500);
    }

    function loadTrack() {
      const scene = SCENES[currentSceneIndex];
      const track = scene.tracks[currentTrackIndex];

      // Always hide track preview when loading a new track
      hideTrackPreview();

      // Direct update without animation
      trackName.textContent = track.title;
      trackArtist.textContent = track.artist;

      // Stop current playback without unloading (keep preloaded sounds)
      if (isIOS) {
        iosAudioPlayer.pause();
      } else if (currentHowl) {
        currentHowl.stop();
      }

      // Keep onset detection state for smooth transition during track switch
      // Only clear bassHistory, preserve previousEnergy and visualIntensity
      // previousEnergy = 0;
      // visualIntensity = 0;
      bassHistory = [];

      const file = track.file;

      if (isIOS) {
        // Point the unified native audio element to the new source
        iosAudioPlayer.src = `music/${file}`;
        iosAudioPlayer.load();
      } else {
        // FIX: Always create new Howl instance to ensure proper connection to masterGain
        // Reusing cached Howl may cause connection issues after stop()/play()
        // Preloaded sound is only used for caching, not for direct reuse
        currentHowl = null; // Force creating new Howl in ensureCurrentHowl()
        
        // Note: We don't unregister onend from preloadedSounds as we're not using it directly
      }

      // Trigger smart preload for next tracks
      setTimeout(() => smartPreload(), 100);
    }

    // Create Howl on demand (only called during user interaction)
    function ensureCurrentHowl() {
      if (isIOS || currentHowl) return;
      const scene = SCENES[currentSceneIndex];
      const track = scene.tracks[currentTrackIndex];
      const file = track.file;

      // FIX: Always create new Howl with Web Audio API mode (html5: false)
      // Preloaded sounds use html5 mode for streaming, which doesn't work with AnalyserNode
      // We must use Web Audio API mode for visualization to work
      currentHowl = new Howl({
        src: [`music/${file}`],
        html5: false,  // Force Web Audio API mode for spectrum visualization
        volume: DEFAULT_VOLUME
      });

      // Register onend callback for auto-advance
      currentHowl.off('end');
      currentHowl.on('end', onTrackEnd);
    }

    let analyserConnected = false;

    function initAudioContext(forceReconnect = false) {
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
        startPlayback(); // No need to reconnect analyser, masterGain stays connected
      }
    }

    // Track switching functions
    function nextTrack() {
      const scene = SCENES[currentSceneIndex];
      const totalTracks = scene.tracks.length;
      
      // Hide any visible track preview first
      hideTrackPreview();
      
      // Loop: last track's next is first track
      const nextIndex = (currentTrackIndex + 1) % totalTracks;
      
      // Direct switch without animation
      currentTrackIndex = nextIndex;
      loadTrack();

      // Auto-play if music was playing
      if (isPlaying) {
        startPlayback();
      }
    }

    function prevTrack() {
      const scene = SCENES[currentSceneIndex];
      const totalTracks = scene.tracks.length;

      // Hide any visible track preview first
      hideTrackPreview();

      // Loop: first track's prev is last track
      const prevIndex = (currentTrackIndex - 1 + totalTracks) % totalTracks;

      // Direct switch without animation
      currentTrackIndex = prevIndex;
      loadTrack();

      // Auto-play if music was playing
      if (isPlaying) {
        startPlayback();
      }
    }

    function updateTrackPreview(direction) {
      const scene = SCENES[currentSceneIndex];
      const totalTracks = scene.tracks.length;
      
      if (direction === 'up') {
        // Loop: show first track when at last track
        const nextIndex = (currentTrackIndex + 1) % totalTracks;
        previewNameUp.textContent = scene.tracks[nextIndex].title;
        trackPreviewUp.classList.add('visible', 'up');
        trackPreviewDown.classList.remove('visible', 'down');
      } else if (direction === 'down') {
        // Loop: show last track when at first track
        const prevIndex = (currentTrackIndex - 1 + totalTracks) % totalTracks;
        previewNameDown.textContent = scene.tracks[prevIndex].title;
        trackPreviewDown.classList.add('visible', 'down');
        trackPreviewUp.classList.remove('visible', 'up');
      }
    }

    function hideTrackPreview() {
      trackPreviewUp.classList.remove('visible', 'up');
      trackPreviewDown.classList.remove('visible', 'down');
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

    function startPlayback(forceReconnect = false) {
      playBtn.classList.add('loading');
      showLoading();

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
      // Force reconnect when switching tracks to ensure visualization works
      initAudioContext(forceReconnect);

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
      hideLoading();
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
      if (isPlaying) {
        play();
      }
      showUI();
    }

    function prevScene() {
      loadScene((currentSceneIndex - 1 + SCENES.length) % SCENES.length);
      if (isPlaying) {
        play();
      }
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
      const isActuallyPlaying = isIOS ? (!iosAudioPlayer.paused) : isPlaying;

      if (isActuallyPlaying && !isIOS) {
        // Get audio frequency data if available
        if (analyser && dataArray) {
          analyser.getByteFrequencyData(dataArray);

          // Extract 0-300Hz range for kick drum detection (bins 0-1)
          // fftSize 256 = 128 bins @ 44.1kHz = ~172Hz per bin
          const kickBin0 = dataArray[0] / 255;  // 0-172Hz (kick fundamental)
          const kickBin1 = dataArray[1] / 255;  // 172-344Hz (reduced to minimize guitar/hi-hat)
          const kickEnergy = kickBin0 * 0.85 + kickBin1 * 0.15; // 85% low freq, 15% mid freq
          
          // DEBUG: Log kick energy (disabled for production)
          // if (frameCount % 60 === 0) {
          //   console.log(`Kick: bin0=${kickBin0.toFixed(3)}, energy=${kickEnergy.toFixed(3)}`);
          // }
          
          // Store energy history
          if (!window.kickHistory) window.kickHistory = [];
          window.kickHistory.push(kickEnergy);
          if (window.kickHistory.length > 8) window.kickHistory.shift();
          
          // Calculate short-term average (last 5 frames)
          const shortTermAvg = window.kickHistory.slice(-5).reduce((a, b) => a + b, 0) / 5;
          
          // Detect local peaks: current > recent average
          const ratio = kickEnergy / shortTermAvg;
          const delta = kickEnergy - (window.kickHistory[window.kickHistory.length - 2] || 0);
          
          let trigger = 0;
          // Trigger if: above short-term average OR significant rise
          if (ratio > 1.03 && delta > -0.01) {  // 3% above recent average
            trigger = Math.min(1, (ratio - 1) * 15 + 0.4);
            // console.log('TRIGGER!', `ratio=${ratio.toFixed(3)}, trigger=${trigger.toFixed(2)}`);
          } else if (delta > 0.015) {
            trigger = Math.min(0.8, delta * 25);
            // console.log('TRIGGER2!', `delta=${delta.toFixed(3)}, trigger=${trigger.toFixed(2)}`);
          }
          
          // Apply with fast attack
          if (trigger > 0) {
            visualIntensity = Math.min(1.0, visualIntensity + trigger);
          }
          
          // Decay - faster (was 0.92)
          visualIntensity *= 0.96;
          visualIntensity = Math.max(0.1, visualIntensity);
          
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

      // Fast response - 2x speed (was 0.3)
      smoothedIntensity = smoothedIntensity + (audioIntensity - smoothedIntensity) * 0.6;

      // DRAMATIC visual effects for kick drum beats
      const baseScale = 1;
      // REDUCED visual effects by 50% for subtler beat visualization
      const maxScale = 1.2;  // 20% scale increase (50% of previous 40%)
      // Use power curve for more punch
      const amplifiedIntensity = Math.pow(smoothedIntensity, 0.6);
      const targetScale = baseScale + amplifiedIntensity * (maxScale - baseScale);
      smoothedScale = smoothedScale + (targetScale - smoothedScale) * 0.24; // 2x faster

      // Get scene color from config
      const baseColor = SCENE_COLORS[SCENES[currentSceneIndex].id] || [168, 200, 236];

      // REDUCED opacity range by 50%
      const opacity = 0.875 + smoothedIntensity * 0.125; // 0.875 to 1.0 (narrower range)

      // REDUCED glow effects by 50%
      const glowSize = 20 + amplifiedIntensity * 50; // 20 to 70px (50% of 100px range)
      const glowSpread = amplifiedIntensity * 20; // 0 to 20px spread (50% of 40px)
      const glowAlpha = 0.35 + amplifiedIntensity * 0.25; // 0.35 to 0.6 (50% of 0.5 range)
      const glowColor = `rgba(${baseColor.join(',')}, ${glowAlpha})`;

      playBtn.style.transform = `scale(${smoothedScale})`;
      playBtn.style.boxShadow = `0 0 ${glowSize}px ${glowSpread}px ${glowColor}`;
      playBtn.style.borderColor = `rgba(${baseColor.join(',')}, ${0.4 + smoothedIntensity * 0.2})`; // Also reduced border effect
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
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      clearTimeout(longPressTimer);

      const currentY = e.touches[0].clientY;
      const diffY = touchStartY - currentY;

      // Check if this is a vertical swipe
      if (Math.abs(diffY) > 20 && !isTrackSwitching) {
        isTrackSwitching = true;
      }

      // Show preview during vertical swipe with throttling
      if (isTrackSwitching && !ticking) {
        ticking = true;
        
        requestAnimationFrame(() => {
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
          
          ticking = false;
        });
      }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      clearTimeout(longPressTimer);

      // Reset track info transform
      trackInfo.style.transform = '';
      trackInfo.style.opacity = '';
      hideTrackPreview();

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

    // Handle touch cancel (e.g., finger moved out of screen or call interrupt)
    // This ensures track preview is always hidden even if touchend doesn't fire properly
    document.addEventListener('touchcancel', () => {
      clearTimeout(longPressTimer);
      // Reset track info transform
      trackInfo.style.transform = '';
      trackInfo.style.opacity = '';
      // Always hide preview on cancel
      hideTrackPreview();
      isTrackSwitching = false;
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

