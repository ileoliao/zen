# Harbor Zen

> *A sanctuary for developers to find their flow state.*

## Philosophy

In the modern digital world, we are constantly bombarded with notifications, visual clutter, and cognitive overload. **Harbor Zen** was born from a simple belief: **to do deep work, you need a deep environment.**

We didn't create another music player. We created a **ritual space** — a digital sanctuary that responds to your natural work rhythm throughout the day.

---

## Core Features

### 🍅 Pomodoro Timer (番茄钟)

A minimalist focus timer integrated seamlessly into the experience:

- **Start/Pause**: Click the play button to begin a 25-minute focus session
- **Auto-music**: Music plays automatically when timer starts, pauses when timer pauses
- **Progress Ring**: The circle fills up as time passes (empty → full)
- **Completion Feedback**: Shows ✓ checkmark for 2 seconds + vibration on mobile
- **Scene Switch**: Timer continues running when switching scenes
- **Reset**: Long-press the time display to reset timer

### 🎵 Music Player

Background ambient music that enhances focus:

- Auto-plays when Pomodoro starts
- Auto-pauses when Pomodoro pauses
- Four time-based scenes with curated soundtracks

### 🎨 Scene-Based Environments

Automatically adapts to your natural work rhythm:

| Scene | Time | Color | Music |
|-------|------|-------|-------|
| **Begin** (🌅) | 8:00-10:00 | Warm Gold | Soft piano for morning warm-up |
| **Deep Work** (🎯) | 10:00-13:00 | Cool Blue | Piano + guitar for peak focus |
| **Flow** (🌊) | 13:00-17:00 | Amber | Sustained productivity tracks |
| **Unwind** (🌙) | 17:00-19:00 | Sunset Red | Gentle tones for evening |

### ✨ Audio Visualization

The play button breathes with your music using real-time audio analysis:

- **Bass frequencies** drive the pulse intensity
- **Overall volume** controls scale and glow size
- **Smooth transitions** prevent distracting flickering

### 📱 Gesture Controls

- **Tap center button**: Start/Pause Pomodoro
- **Swipe left/right**: Switch scenes
- **Long press time display**: Reset Pomodoro timer
- **Long press anywhere**: Volume control
- **Tap anywhere**: Reveal UI (UI auto-hides after 4 seconds)

### ⌨️ Keyboard Shortcuts

- `Space`: Start/Pause Pomodoro
- `←` / `→`: Previous/Next scene

---

## Usage

1. Open `index.html` in any modern browser
2. Place audio files in the `music/` directory
3. The app automatically detects your current time and selects the appropriate scene
4. Tap the center button to start a focus session
5. Music plays automatically; swipe to change scenes if needed

---

## Technical Notes

- Uses Web Audio API + Howler.js for audio playback and frequency analysis
- Responsive design works on desktop and mobile
- Touch and mouse support
- No external dependencies except Howler.js CDN

---

## Design Principles

1. **Radical Simplicity** — No playlists, no scrolling, no clutter. Just one button and your intention.

2. **Time Awareness** — The app detects your local time and matches your environment to your natural circadian rhythm.

3. **Invisible Interface** — After 4 seconds of inactivity, all text fades away. Only the breathing button remains.

4. **Workflow Integration** — Pomodoro and music work together as a single focus tool, not separate systems.

---

*"In silence, we find clarity. In rhythm, we find flow."*
