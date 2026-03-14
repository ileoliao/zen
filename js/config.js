/**
 * Flow x Zen - Configuration
 * Centralized configuration for scenes, themes, and constants
 */

// Scene definitions with time-based auto-selection
const SCENES = [
  {
    id: 'forge',
    name: 'Forge',
    startHour: 7,
    endHour: 9,
    tracks: [
      { title: 'Sport 1', artist: 'Flow x Zen', file: 'sport1.mp3' },
      { title: 'Sport 2', artist: 'Flow x Zen', file: 'sport2.mp3' },
      { title: 'Sport 3', artist: 'Flow x Zen', file: 'sport3.mp3' },
      { title: 'Sport 4', artist: 'Flow x Zen', file: 'sport4.mp3' },
      { title: 'Sport 5', artist: 'Flow x Zen', file: 'sport5.mp3' },
      { title: 'Sport 6', artist: 'Flow x Zen', file: 'sport6.mp3' },
      { title: 'Sport 7', artist: 'Flow x Zen', file: 'sport7.mp3' },
      { title: 'Sport 8', artist: 'Flow x Zen', file: 'sport8.mp3' },
      { title: 'Sport 9', artist: 'Flow x Zen', file: 'sport9.mp3' },
      { title: 'Sport 10', artist: 'Flow x Zen', file: 'sport10.mp3' },
      { title: 'Sport 11', artist: 'Flow x Zen', file: 'sport11.mp3' },
      { title: 'Sport 12', artist: 'Flow x Zen', file: 'sport12.mp3' },
      { title: 'Sport 13', artist: 'Flow x Zen', file: 'sport13.mp3' },
      { title: 'Sport 14', artist: 'Flow x Zen', file: 'sport14.mp3' },
      { title: 'Sport 15', artist: 'Flow x Zen', file: 'sport15.mp3' },
      { title: 'Sport 16', artist: 'Flow x Zen', file: 'sport16.mp3' }
    ]
  },
  {
    id: 'begin',
    name: 'Begin',
    startHour: 9,
    endHour: 10,
    tracks: [
      { title: 'Morning Start', artist: 'Flow x Zen', file: 'Piano 1.mp3' },
      { title: 'Morning Dance', artist: 'Flow x Zen', file: 'Dance.mp3' }
    ]
  },
  {
    id: 'deep',
    name: 'Deep Work',
    startHour: 10,
    endHour: 13,
    tracks: [
      { title: 'Deep Piano', artist: 'Flow x Zen', file: 'Piano 2.mp3' },
      { title: 'Focus Guitar', artist: 'Flow x Zen', file: 'Guitar 1.mp3' },
      { title: 'Flow Guitar', artist: 'Flow x Zen', file: 'Guitar 2.mp3' },
      { title: 'Nature Sounds 1', artist: 'Flow x Zen', file: 'nature1.mp3' },
      { title: 'Nature Sounds 2', artist: 'Flow x Zen', file: 'nature2.mp3' },
      { title: 'Rain Ambient', artist: 'Flow x Zen', file: 'rain1.mp3' },
      { title: 'World Music 1', artist: 'Flow x Zen', file: 'world1.mp3' },
      { title: 'World Music 2', artist: 'Flow x Zen', file: 'world2.mp3' }
    ]
  },
  {
    id: 'flow',
    name: 'Flow',
    startHour: 13,
    endHour: 17,
    tracks: [
      { title: 'Afternoon Piano', artist: 'Flow x Zen', file: 'Piano 3.mp3' },
      { title: 'Nature Sounds 1', artist: 'Flow x Zen', file: 'nature1.mp3' },
      { title: 'Nature Sounds 2', artist: 'Flow x Zen', file: 'nature2.mp3' },
      { title: 'Rain Ambient', artist: 'Flow x Zen', file: 'rain1.mp3' },
      { title: 'World Music 1', artist: 'Flow x Zen', file: 'world1.mp3' },
      { title: 'World Music 2', artist: 'Flow x Zen', file: 'world2.mp3' }
    ]
  },
  {
    id: 'unwind',
    name: 'Unwind',
    startHour: 17,
    endHour: 19,
    tracks: [
      { title: 'Evening Close', artist: 'Flow x Zen', file: 'Piano4.mp3' },
      { title: 'Jazz Evening 1', artist: 'Flow x Zen', file: 'Jazz1.mp3' },
      { title: 'Jazz Evening 2', artist: 'Flow x Zen', file: 'Jazz2.mp3' }
    ]
  }
];

// Theme colors for each scene
const SCENE_COLORS = {
  forge: [230, 126, 34],    // Forge orange - iron glow
  begin: [244, 197, 105],   // Golden sunrise
  deep: [126, 184, 232],    // Deep blue
  flow: [232, 184, 74],     // Amber
  unwind: [201, 132, 110]   // Sunset red
};

// Audio visualization constants
const AUDIO_CONFIG = {
  fftSize: 256,
  smoothingTimeConstant: 0.92,
  minDecibels: -90,
  maxDecibels: -10,
  bassHistorySize: 12,
  decayRate: 0.96,
  onsetThreshold: 0.002,
  onsetSensitivity: 8.0
};

// Pomodoro timer constants
const POMODORO_CONFIG = {
  workDuration: 25 * 60,    // 25 minutes in seconds
  breakDuration: 5 * 60,    // 5 minutes in seconds
  longPressDelay: 800       // ms
};

// Gesture constants
const GESTURE_CONFIG = {
  trackSwitchThreshold: 80, // px
  sceneSwitchThreshold: 50, // px
  longPressDelay: 600,      // ms
  uiHideDelay: 4000         // ms
};

// Default volume
const DEFAULT_VOLUME = 0.8;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SCENES,
    SCENE_COLORS,
    AUDIO_CONFIG,
    POMODORO_CONFIG,
    GESTURE_CONFIG,
    DEFAULT_VOLUME
  };
}