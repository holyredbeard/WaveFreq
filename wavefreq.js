class Game extends Phaser.Scene {
    constructor() {
        super();
        this.initializeAudioState();
    }
    initializeAudioState() {
        // Audio-related state
        this.currentSPL = 60;
        this.currentNote = null;
        this.currentOctave = 4;
        this.minOctave = 0;
        this.maxOctave = 9;
        this.currentFrequency = 440;
        this.currentPanning = 0;
        this.audioContext = null;
        this.oscillator = null;
        this.gainNode = null;
        this.panner = null;
        // Define base frequencies for octave 4
        this.baseFrequencies = {
            'C': 261.63,
            'C#': 277.18,
            'D': 293.66,
            'D#': 311.13,
            'E': 329.63,
            'F': 349.23,
            'F#': 369.99,
            'G': 392.00,
            'G#': 415.30,
            'A': 440.00,
            'A#': 466.16,
            'B': 493.88
        };
        this.audioContext = null;
        this.waveGraphics = null;
        this.waveOffset = 0;
        this.lastTime = 0;
        this.oscillator = null;
        this.currentFrequency = 440; // Store current frequency
        this.currentPanning = 0; // Store current panning (-1 to 1)
        this.isDragging = false;
        this.returnTween = null;
        this.dragCircle = null;
        this.frequencyText = null;
        this.panningText = null;
        this.spaceKeyPressed = false;
        this.topY = 100; // Top boundary
        this.bottomY = 500; // Bottom boundary
        this.centerY = 300; // Center Y position
    }

    preload() {
        // No preload needed
    }

    create() {
        // Game objects are created here
        this.cameras.main.setBackgroundColor('#000000');
        // Create graphics object for the frame
        const graphics = this.add.graphics();

        // Draw octave band gradients
        const centerX = this.cameras.main.centerX;
        const centerY = this.cameras.main.centerY - 20;
        const squareSize = 300;
        const startX = centerX - 150;
        const startY = centerY - 150;

        // Calculate height for each octave band (10 bands total)
        const bandHeight = squareSize / 10;

        // Draw gradient bands from bottom to top (lower frequencies at bottom)
        for (let i = 0; i < 10; i++) {
            const y = startY + squareSize - (i + 1) * bandHeight;
            graphics.fillStyle(0x333333, i % 2 === 0 ? 0.2 : 0.1);
            graphics.fillRect(startX, y, squareSize, bandHeight);

            // Add octave number labels on the left side
            this.add.text(startX - 25, y + bandHeight / 2, String(i + 1), {
                fontSize: '14px',
                fill: '#666666',
            }).setOrigin(0.5);
        }

        // Set light gray stroke style for the main square
        graphics.lineStyle(2, 0x666666);

        // Draw the 300x300 frame centered on screen
        graphics.strokeRect(centerX - 150, centerY - 150, 300, 300);

        // Initialize wave animation
        this.lastTime = this.time.now;

        // Start the update loop for the wave
        this.time.addEvent({
            delay: 16, // ~60fps
            callback: this.updateWave,
            callbackScope: this,
            loop: true
        });
        // Add keyboard input
        this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

        // Add octave control keys
        this.plusKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS);
        this.minusKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS);

        this.plusKey.on('down', () => this.changeOctave(1));
        this.minusKey.on('down', () => this.changeOctave(-1));

        // Add note key handlers
        const notes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
        notes.forEach(note => {
            const key = this.input.keyboard.addKey(note);
            key.on('down', () => this.moveToNote(note, this.currentOctave));
        });
        // Add number keys for octave selection (1-9 and 0 for octave 9)
        for (let i = 1; i <= 9; i++) {
            const key = this.input.keyboard.addKey(48 + i); // ASCII codes for 1-9
            key.on('down', () => {
                if (this.currentNote) {
                    const octave = i; // Map 1-9 to octaves 1-9
                    this.currentOctave = octave;
                    this.moveToNote(this.currentNote, octave);
                }
            });
        }
        // Add key '0' for octave 10
        const zeroKey = this.input.keyboard.addKey(48); // ASCII code for 0
        zeroKey.on('down', () => {
            if (this.currentNote) {
                this.currentOctave = 10;
                this.moveToNote(this.currentNote, 10);
            }
        });
        // Add space key listeners
        this.spaceKey.on('down', () => {
            this.spaceKeyPressed = !this.spaceKeyPressed;
            if (this.spaceKeyPressed && this.dragCircle) {
                this.playToneWithPanning(this.dragCircle.x, this.dragCircle.y);
            } else {
                this.stopTone();
            }
        });
        // Initialize audio context
        this.audioContext = new(window.AudioContext || window.webkitAudioContext)();
        // Create graphics object for wave visualization
        this.waveGraphics = this.add.graphics();

        // Add waveform type slider
        const waveformSliderX = 70; // Move right by 20px
        const waveformSliderY = 545;
        const waveformSliderWidth = 200;
        const waveformSliderHeight = 10;

        // Add waveform slider background
        const sliderBg = this.add.rectangle(waveformSliderX + waveformSliderWidth / 2, waveformSliderY,
            waveformSliderWidth, waveformSliderHeight, 0x666666);
        // Add waveform snap points
        const snapPoints = [0, 1 / 3, 2 / 3, 1];
        snapPoints.forEach(point => {
            this.add.circle(
                waveformSliderX + waveformSliderWidth * point,
                waveformSliderY,
                5,
                0x888888
            );
        });
        // Add waveform slider handle (in blue) and ensure it's on top
        this.waveformSlider = this.add.circle(waveformSliderX, waveformSliderY, 15, 0x0000ff);
        this.waveformSlider.setDepth(1); // Ensure it's rendered on top
        this.waveformSlider.setInteractive({
            draggable: true
        });

        // Add waveform type labels
        const labelY = waveformSliderY + 25;
        // Create interactive text objects for each waveform type
        const sineText = this.add.text(waveformSliderX - 5, labelY, '∿', {
            fontSize: '14px',
            fill: '#ffffff'
        }).setInteractive();
        const triangleText = this.add.text(waveformSliderX + waveformSliderWidth / 3 - 5, labelY, '△', {
            fontSize: '14px',
            fill: '#ffffff'
        }).setInteractive();
        const sawtoothText = this.add.text(waveformSliderX + 2 * waveformSliderWidth / 3 - 5, labelY, '↗', {
            fontSize: '14px',
            fill: '#ffffff'
        }).setInteractive();
        const squareText = this.add.text(waveformSliderX + waveformSliderWidth - 5, labelY, '─', {
            fontSize: '14px',
            fill: '#ffffff'
        }).setInteractive();
        // Add click handlers for each waveform type
        sineText.on('pointerdown', () => {
            this.waveformSlider.x = waveformSliderX;
            if (this.oscillator) this.oscillator.type = 'sine';
        });
        triangleText.on('pointerdown', () => {
            this.waveformSlider.x = waveformSliderX + waveformSliderWidth / 3;
            if (this.oscillator) this.oscillator.type = 'triangle';
        });
        sawtoothText.on('pointerdown', () => {
            this.waveformSlider.x = waveformSliderX + 2 * waveformSliderWidth / 3;
            if (this.oscillator) this.oscillator.type = 'sawtooth';
        });
        squareText.on('pointerdown', () => {
            this.waveformSlider.x = waveformSliderX + waveformSliderWidth;
            if (this.oscillator) this.oscillator.type = 'square';
        });
        // Add click handler for the slider background
        const sliderBackground = this.add.rectangle(
            waveformSliderX + waveformSliderWidth / 2,
            waveformSliderY,
            waveformSliderWidth,
            waveformSliderHeight,
            0x666666
        ).setInteractive();
        sliderBackground.on('pointerdown', (pointer) => {
            const clickX = pointer.x;
            const position = (clickX - waveformSliderX) / waveformSliderWidth;
            const snapPoints = [0, 1 / 3, 2 / 3, 1];
            const closestSnap = snapPoints.reduce((prev, curr) =>
                Math.abs(curr - position) < Math.abs(prev - position) ? curr : prev
            );

            this.waveformSlider.x = waveformSliderX + (waveformSliderWidth * closestSnap);

            if (this.oscillator) {
                switch (closestSnap) {
                    case 0:
                        this.oscillator.type = 'sine';
                        break;
                    case 1 / 3:
                        this.oscillator.type = 'triangle';
                        break;
                    case 2 / 3:
                        this.oscillator.type = 'sawtooth';
                        break;
                    case 1:
                        this.oscillator.type = 'square';
                        break;
                }
            }
        });
        // Add SPL slider at bottom left
        const sliderWidth = 200;
        const sliderHeight = 10;
        const sliderX = 70; // Move right by 20px
        const sliderY = 480;
        // Add slider background
        this.add.rectangle(sliderX + sliderWidth / 2, sliderY, sliderWidth, sliderHeight, 0x666666);
        // Add slider handle with adjusted initial position
        this.splSlider = this.add.circle(sliderX + sliderWidth / 2 - 1, sliderY, 15, 0xffffff);
        this.splSlider.setFillStyle(0xffffff);
        this.splSlider.setStrokeStyle(2, 0x666666);
        this.splSlider.setInteractive({
            draggable: true
        });
        // Add SPL slider labels with proper vertical alignment
        this.add.text(sliderX - 50, sliderY - 7, '30 dB', {
            fontSize: '14px',
            fill: '#ffffff'
        });
        this.add.text(sliderX + sliderWidth + 10, sliderY - 7, '100 dB', {
            fontSize: '14px',
            fill: '#ffffff'
        });
        // Handle drag events
        this.input.on("drag", (pointer, gameObject, dragX, dragY) => {
            if (gameObject === this.dragCircle) {
                this.isDragging = true;
                // Calculate square boundaries accounting for circle radius (15px)
                const circleRadius = 15;
                const squareLeft = centerX - 150 + circleRadius;
                const squareRight = centerX + 150 - circleRadius;
                const squareTop = centerY - 150 + circleRadius;
                const squareBottom = centerY + 150 - circleRadius;
                // Clamp position within boundaries
                const newX = Phaser.Math.Clamp(dragX, squareLeft, squareRight);
                const newY = Phaser.Math.Clamp(dragY, squareTop, squareBottom);
                // Update circle position
                // Update x position and panning
                gameObject.x = newX;
                const totalWidth = 175 - circleRadius;
                this.currentPanning = (newX - centerX) / totalWidth;
                // Calculate frequency from y position
                const normalizedY = (squareBottom - newY) / (squareBottom - squareTop);
                const rawFrequency = 20 * Math.pow(1000, normalizedY);
                // Find the closest note frequency
                const noteInfo = this.getClosestNote(rawFrequency);
                const exactFrequency = this.getExactFrequency(noteInfo.note, noteInfo.octave);
                // Update y position to match exact frequency
                const exactNormalizedY = Math.log(exactFrequency / 20) / Math.log(1000);
                const exactY = squareBottom - (exactNormalizedY * (squareBottom - squareTop));
                gameObject.y = exactY;
                // Update current frequency to exact note frequency
                this.currentFrequency = exactFrequency;
                // Update the note text based on the current frequency
                if (noteInfo) {
                    this.noteText.setText(`${noteInfo.note}${noteInfo.octave}`);
                    this.noteText.x = dragX;
                    this.noteText.y = dragY;
                }

                // Update display text regardless of sound state
                this.updateDisplayText(gameObject.x);

                // Update audio if sound is playing
                if (this.oscillator) {
                    this.updatePanningFromPosition(gameObject.x, gameObject.y);
                }
            } else if (gameObject === this.waveformSlider) {
                // Constrain horizontal movement within slider bounds
                const sliderX = 70; // Move right by 20px
                const sliderWidth = 200;
                const newX = Phaser.Math.Clamp(dragX, sliderX, sliderX + sliderWidth);

                // Calculate which snap point is closest
                const position = (newX - sliderX) / sliderWidth;
                const snapPoints = [0, 1 / 3, 2 / 3, 1];
                let closestSnap = snapPoints.reduce((prev, curr) =>
                    Math.abs(curr - position) < Math.abs(prev - position) ? curr : prev
                );

                // Snap to closest position
                gameObject.x = sliderX + (sliderWidth * closestSnap);

                // Update oscillator type if it exists
                if (this.oscillator) {
                    switch (closestSnap) {
                        case 0:
                            this.oscillator.type = 'sine';
                            break;
                        case 1 / 3:
                            this.oscillator.type = 'triangle';
                            break;
                        case 2 / 3:
                            this.oscillator.type = 'sawtooth';
                            break;
                        case 1:
                            this.oscillator.type = 'square';
                            break;
                    }
                }
            } else if (gameObject === this.splSlider) {
                // Update slider color to match text color and maintain stroke
                gameObject.setFillStyle(0xffffff);
                gameObject.setStrokeStyle(2, 0x666666);
                // Constrain horizontal movement within slider bounds
                const sliderX = 70; // Match the creation value
                const sliderWidth = 200;
                const newX = Phaser.Math.Clamp(dragX, sliderX - 1, sliderX + sliderWidth - 1);
                gameObject.x = newX;
                // Calculate SPL based on slider position (30 to 100 dB)
                this.currentSPL = 30 + ((newX - sliderX) / sliderWidth) * 70;
                // Calculate pressure using P = P0 * 10^(SPL/20)
                const P0 = 0.00002; // Reference pressure 20 µPa
                const pressure = P0 * Math.pow(10, this.currentSPL / 20);
                // If sound is playing, update volume immediately
                if (this.oscillator && this.gainNode) {
                    const normalizedY = (this.dragCircle.y - this.topY) / (this.bottomY - this.topY);
                    const heightInfluence = 0.1 + (normalizedY * 0.9);
                    const splBase = Math.pow(10, (this.currentSPL - 60) / 20);
                    const finalVolume = heightInfluence * splBase;
                    // Apply volume change immediately
                    this.gainNode.gain.setValueAtTime(
                        Math.max(0.0001, Math.min(3, finalVolume)),
                        this.audioContext.currentTime
                    );
                }
                // Update SPL display with color coding
                let splColor = '#00ff00';
                if (this.currentSPL > 80) splColor = '#ff0000';
                else if (this.currentSPL > 60) splColor = '#ffff00';
                this.splText.setStyle({
                    fill: splColor
                });
                this.splText.setText(`SPL: ${this.currentSPL.toFixed(2)} (dB)`);
                this.pressureText.setText(`Pascal: ${pressure.toFixed(4)} (Pa)`);
            }
        });
        // Create main draggable green circle
        this.dragCircle = this.add.circle(centerX, centerY, 15, 0x00ff00);
        this.dragCircle.setInteractive({
            draggable: true
        });

        // Set initial position and depth
        this.dragCircle.setDepth(1);
        // Add note text on circle
        this.noteText = this.add.text(centerX, centerY, 'C4', {
            fontSize: '12px',
            fill: '#000000',
            backgroundColor: '#00ff00'
        }).setOrigin(0.5, 0.5);
        this.noteText.setDepth(2); // Ensure text is above the circle
        // Make text non-interactive to prevent dragging
        this.noteText.setInteractive({
            useHandCursor: true
        });
        this.noteText.input.enabled = false;
        this.dragCircle.setInteractive({
            draggable: true,
            useHandCursor: true
        });
        // Initialize lastClickTime
        this.lastClickTime = 0;
        // Add double-click handling
        this.dragCircle.on('pointerdown', (pointer) => {
            if (this.lastClickTime && (pointer.time - this.lastClickTime) < 300) {
                this.createNoteInput();
            }
            this.lastClickTime = pointer.time;
        });
        this.dragCircle.startX = centerX;
        this.dragCircle.startY = centerY;
        // Handle pointer events for the draggable circle
        this.dragCircle.on('pointerdown', () => {
            if (this.spaceKeyPressed) {
                this.playToneWithPanning(this.currentPanning, this.currentFrequency);
            }
        });
        // Update note text position when circle moves
        this.dragCircle.on('drag', (pointer, dragX, dragY) => {
            // Use the clamped position from the drag event
            const centerX = this.cameras.main.centerX;
            const centerY = this.cameras.main.centerY - 20;
            const circleRadius = 30;

            // Calculate boundaries
            const squareLeft = centerX - 150 + circleRadius;
            const squareRight = centerX + 150 - circleRadius;
            const squareTop = centerY - 150 + circleRadius;
            const squareBottom = centerY + 150 - circleRadius;

            // Clamp the position within boundaries
            const clampedX = Phaser.Math.Clamp(dragX, squareLeft, squareRight);
            const clampedY = Phaser.Math.Clamp(dragY, squareTop, squareBottom);

            // Update both circle and text positions
            this.dragCircle.x = clampedX;
            this.dragCircle.y = clampedY;
            this.noteText.x = clampedX;
            this.noteText.y = clampedY;
        });
        this.dragCircle.on('pointerup', () => {
            this.isDragging = false;
        });
        // Add text displays in bottom right corner
        this.frequencyText = this.add.text(500, 460, 'Frequency: 0 (Hz)', {
            fontSize: '16px',
            fill: '#ffffff'
        });
        this.panningText = this.add.text(500, 485, 'L: 50% | R: 50%', {
            fontSize: '16px',
            fill: '#ffffff'
        });
        this.splText = this.add.text(500, 510, 'SPL: 60 (dB)', {
            fontSize: '16px',
            fill: '#ffffff'
        });
        this.pressureText = this.add.text(500, 535, 'Pascal: 0.0100 (Pa)', {
            fontSize: '16px',
            fill: '#ffffff'
        });
    }
    playToneWithPanning(panning, frequency) {
        try {
            if (this.oscillator) {
                this.stopTone();
            }

            // Create new audio context if needed
            if (!this.audioContext || this.audioContext.state === 'closed') {
                this.audioContext = new(window.AudioContext || window.webkitAudioContext)();
            }
            // Resume audio context if suspended
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            // Create and configure oscillator
            this.oscillator = this.audioContext.createOscillator();
            this.oscillator.frequency.setValueAtTime(this.currentFrequency, this.audioContext.currentTime);
            this.oscillator.type = this.getWaveformType();
            // Create and configure panner
            this.panner = this.audioContext.createStereoPanner();
            this.panner.pan.setValueAtTime(this.currentPanning, this.audioContext.currentTime);
            // Create and configure gain node
            this.gainNode = this.audioContext.createGain();
            const volume = Math.pow(10, (this.currentSPL - 60) / 20);
            this.gainNode.gain.setValueAtTime(Math.min(3, volume), this.audioContext.currentTime);
            // Connect nodes
            this.oscillator.connect(this.panner);
            this.panner.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);
            // Start the oscillator
            this.oscillator.start();
        } catch (e) {
            console.error('Error in playToneWithPanning:', e);
        }
    }

    setupAudioNodes() {
        this.oscillator = this.audioContext.createOscillator();
        this.panner = this.audioContext.createStereoPanner();
        this.gainNode = this.audioContext.createGain();
    }
    configureOscillator() {
        this.oscillator.type = this.getWaveformType();
        this.oscillator.frequency.setValueAtTime(this.currentFrequency, this.audioContext.currentTime);
    }
    getWaveformType() {
        // Get waveform slider position
        const sliderX = 70;
        const sliderWidth = 200;
        const sliderPosition = (this.waveformSlider.x - sliderX) / sliderWidth;
        const snapPoints = [0, 1 / 3, 2 / 3, 1];
        const closestSnap = snapPoints.reduce((prev, curr) =>
            Math.abs(curr - sliderPosition) < Math.abs(prev - sliderPosition) ? curr : prev
        );

        switch (closestSnap) {
            case 0:
                this.oscillator.type = 'sine';
                break;
            case 1 / 3:
                this.oscillator.type = 'triangle';
                break;
            case 2 / 3:
                this.oscillator.type = 'sawtooth';
                break;
            case 1:
                this.oscillator.type = 'square';
                break;
            default:
                this.oscillator.type = 'sine';
        }
        this.oscillator.frequency.setValueAtTime(this.currentFrequency, this.audioContext.currentTime);
        // Set initial gain based on current SPL
        const initialVolume = Math.pow(10, (this.currentSPL - 60) / 20);
        // Create stereo panner and gain nodes
        this.panner = this.audioContext.createStereoPanner();
        this.gainNode = this.audioContext.createGain();
        // Set initial panning and height-based effects
        this.updatePanningFromPosition(this.dragCircle.x, this.dragCircle.y);
        // Connect nodes
        this.oscillator.connect(this.panner);
        this.panner.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);
        // Start the tone
        this.oscillator.start();
    }
    updatePanningFromPosition(xPosition, yPosition) {
        if (this.panner && this.gainNode) {
            // Use stored panning and frequency values
            this.panner.pan.value = this.currentPanning;
            this.oscillator.frequency.setValueAtTime(this.currentFrequency, this.audioContext.currentTime);

            // Calculate normalized Y position
            const normalizedY = (yPosition - this.topY) / (this.bottomY - this.topY);

            // Calculate base height influence (0.1 to 1.0 range)
            const heightInfluence = 0.1 + (normalizedY * 0.9);

            // Calculate volume based on SPL
            const splBase = Math.pow(10, (this.currentSPL - 60) / 20);

            // Combine SPL and height influence
            const finalVolume = heightInfluence * splBase;

            // Apply volume with exponential ramping for smoother transitions
            this.gainNode.gain.exponentialRampToValueAtTime(
                Math.max(0.0001, Math.min(3, finalVolume)), // Clamp between 0.0001 and 3
                this.audioContext.currentTime + 0.01
            );

            // Update frequency display
            // Don't update text here - it's handled in updateDisplayText
        }
    }
    stopTone() {
        if (this.oscillator) {
            try {
                this.oscillator.stop();
                this.oscillator.disconnect();
            } catch (e) {
                console.log('Error in stopTone:', e);
            }
            this.oscillator = null;
            this.panner = null;
            this.gainNode = null;

            // Don't reset frequency and panning text when sound stops

            // Keep the current SPL value instead of resetting to 60
            const P0 = 0.00002; // Reference pressure 20 µPa
            const pressure = P0 * Math.pow(10, this.currentSPL / 20);

            // Update SPL display with color coding
            let splColor = '#00ff00';
            if (this.currentSPL > 80) splColor = '#ff0000';
            else if (this.currentSPL > 60) splColor = '#ffff00';

            this.splText.setText(`SPL: ${this.currentSPL.toFixed(2)} (dB)`);
            this.pressureText.setText(`Pascal: ${pressure.toFixed(4)} (Pa)`);
            this.splText.setStyle({
                fill: splColor
            });
        }
    }
    updateDisplayText(xPosition) {
        // Update frequency text
        this.frequencyText.setText(`Frequency: ${Math.round(this.currentFrequency)} (Hz)`);
        // Calculate and update panning percentages
        const centerX = this.cameras.main.centerX;
        const squareWidth = 300;
        const normalizedPos = (xPosition - centerX) / (squareWidth / 2);
        let rightPercent = Math.round(((normalizedPos + 1) / 2) * 100);
        let leftPercent = Math.round(100 - rightPercent);

        // Check if at far right
        if (Math.abs(normalizedPos - 1) < 0.1) { // Within 10% of far right
            rightPercent = Math.min(100, rightPercent + 10);
            leftPercent = Math.max(0, leftPercent - 10);
        }

        // Check if at far left
        if (Math.abs(normalizedPos + 1) < 0.1) { // Within 10% of far left
            leftPercent = Math.min(100, leftPercent + 10);
            rightPercent = Math.max(0, rightPercent - 10);
        }

        this.panningText.setText(`L: ${leftPercent}% | R: ${rightPercent}%`);
    }

    update(time, delta) {
        // Update wave animation
        if (this.oscillator && this.audioContext.state === 'running') {
            this.drawWave();
        } else if (this.waveGraphics) {
            // Clear the wave and draw static elements when no sound is playing
            this.waveGraphics.clear();

            // Draw static background
            const waveX = this.cameras.main.centerX - 150; // Align with square's left edge
            const waveY = this.cameras.main.centerY - 240; // Position above square frame with 20px margin
            const waveWidth = 300; // Same width as square frame
            const waveHeight = 100;

            // Draw frame
            this.waveGraphics.lineStyle(1, 0x333333);
            this.waveGraphics.strokeRect(waveX, waveY - waveHeight / 2, waveWidth, waveHeight);

            // Draw center line
            this.waveGraphics.lineStyle(1, 0x666666);
            this.waveGraphics.lineBetween(waveX, waveY, waveX + waveWidth, waveY);
        }
    }
    drawWave() {
        // Calculate wave position to be centered above the square frame
        const waveX = this.cameras.main.centerX - 150; // Align with square's left edge
        const waveY = this.cameras.main.centerY - 240; // Position above square frame with 20px margin
        const waveWidth = 300; // Same width as square frame
        const waveHeight = 100;

        // Clear previous wave
        this.waveGraphics.clear();

        // Calculate wave parameters
        const frequency = this.oscillator ? this.oscillator.frequency.value : 440;
        const wavelength = 343 / frequency; // Speed of sound (343 m/s) / frequency

        // Scale wavelength to pixels (adjust this factor to make the wave visible)
        const pixelsPerMeter = 100;
        const scaledWavelength = wavelength * pixelsPerMeter;

        // Calculate amplitude based on SPL
        const baseSPL = 60; // Reference SPL
        const maxAmplitude = waveHeight / 2;
        const amplitudeFactor = Math.pow(10, (this.currentSPL - baseSPL) / 20);
        const amplitude = Math.min(maxAmplitude, maxAmplitude * amplitudeFactor * 0.5);

        // Draw wave background
        this.waveGraphics.lineStyle(1, 0x333333);
        this.waveGraphics.strokeRect(waveX, waveY - waveHeight / 2, waveWidth, waveHeight);

        // Draw center line
        this.waveGraphics.lineStyle(1, 0x666666);
        this.waveGraphics.lineBetween(waveX, waveY, waveX + waveWidth, waveY);

        // Draw wave
        this.waveGraphics.lineStyle(2, 0x00ff00);
        this.waveGraphics.beginPath();

        // Calculate time-based offset for animation
        this.waveOffset = (this.waveOffset + 2) % scaledWavelength;

        // Get current waveform type
        const waveformType = this.oscillator ? this.oscillator.type : 'sine';

        for (let x = 0; x <= waveWidth; x++) {
            const normalizedX = ((x + this.waveOffset) % scaledWavelength) / scaledWavelength;
            let y = waveY;

            switch (waveformType) {
                case 'sine':
                    y = waveY + Math.sin(normalizedX * Math.PI * 2) * amplitude;
                    break;

                case 'triangle':
                    // Triangle wave - properly centered
                    y = waveY + (2 * Math.abs((normalizedX % 1) - 0.5) - 0.5) * (2 * amplitude);
                    break;

                case 'sawtooth':
                    // Sawtooth wave
                    y = waveY + amplitude - ((normalizedX * 2) % 2) * amplitude;
                    break;

                case 'square':
                    // Square wave
                    y = waveY + (normalizedX < 0.5 ? amplitude : -amplitude);
                    break;
            }
            if (x === 0) {
                this.waveGraphics.moveTo(waveX + x, y);
            } else {
                this.waveGraphics.lineTo(waveX + x, y);
            }
        }

        this.waveGraphics.strokePath();
    }
    moveToNote(note, octave) {
        if (!this.baseFrequencies[note]) return;
        this.currentNote = note;
        this.currentOctave = octave;
        // Calculate frequency for the specific octave
        const baseFreq = this.baseFrequencies[note];
        const frequency = baseFreq * Math.pow(2, octave - 4); // Adjust relative to octave 4
        // Ensure frequency is not below 20 Hz
        if (frequency < 20) return;
        const centerX = this.cameras.main.centerX;
        const centerY = this.cameras.main.centerY - 20;
        // Calculate Y position based on frequency
        const squareTop = centerY - 150 + 15;
        const squareBottom = centerY + 150 - 15;
        const totalHeight = squareBottom - squareTop;
        // Convert frequency to y-position (logarithmic scale)
        const minFreq = 20;
        const maxFreq = 20000;
        const normalizedY = Math.log(frequency / minFreq) / Math.log(maxFreq / minFreq);
        const yPosition = squareBottom - (normalizedY * totalHeight);
        // Update circle position
        this.dragCircle.y = yPosition;
        this.dragCircle.x = centerX; // Center horizontally
        // Update note text position and content with octave
        this.noteText.setText(`${note}${octave}`);
        this.noteText.x = this.dragCircle.x;
        this.noteText.y = this.dragCircle.y;

        // Update frequency and other properties
        this.currentFrequency = frequency;
        this.currentPanning = 0;

        // Update display text
        this.updateDisplayText(centerX);

        // Update audio if it's playing
        if (this.oscillator) {
            this.updatePanningFromPosition(this.dragCircle.x, this.dragCircle.y);
        }
    }
    changeOctave(direction) {
        // Calculate new frequency (multiply by 2 for up, divide by 2 for down)
        const newFrequency = this.currentFrequency * Math.pow(2, direction);

        // Check if the new frequency is within reasonable bounds (20Hz to 20kHz)
        if (newFrequency >= 20 && newFrequency <= 20000) {
            this.currentFrequency = newFrequency;

            // Update circle position
            const centerX = this.cameras.main.centerX;
            const centerY = this.cameras.main.centerY - 20;
            const squareTop = centerY - 150 + 15;
            const squareBottom = centerY + 150 - 15;
            const totalHeight = squareBottom - squareTop;

            // Convert frequency to y-position (logarithmic scale)
            const minFreq = 20;
            const maxFreq = 20000;
            const normalizedY = Math.log(newFrequency / minFreq) / Math.log(maxFreq / minFreq);
            const yPosition = squareBottom - (normalizedY * totalHeight);

            // Update circle position
            this.dragCircle.y = yPosition;

            // Update note text position
            if (this.noteText) {
                this.noteText.y = yPosition;
            }

            // Update display text
            this.updateDisplayText(this.dragCircle.x);

            // Update audio if it's playing
            if (this.oscillator) {
                this.updatePanningFromPosition(this.dragCircle.x, this.dragCircle.y);
            }
        }
    }
    createNoteInput() {
        if (document.getElementById('noteInput')) {
            return;
        }
        const input = document.createElement('input');
        input.id = 'noteInput';
        input.type = 'text';
        input.style.position = 'fixed';

        const canvas = document.querySelector('canvas');
        const canvasRect = canvas.getBoundingClientRect();
        const x = canvasRect.left + this.dragCircle.x - 15;
        const y = canvasRect.top + this.dragCircle.y - 7.5;
        Object.assign(input.style, {
            left: `${x}px`,
            top: `${y}px`,
            width: '60px',
            height: '30px',
            padding: '0 5px',
            textAlign: 'center',
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            border: '2px solid #000',
            borderRadius: '4px',
            zIndex: '10000',
            backgroundColor: '#ffffff',
            color: '#000000',
            outline: 'none',
            boxSizing: 'border-box',
            display: 'block'
        });
        input.value = '';
        document.body.appendChild(input);
        input.focus();
        let currentInput = '';
        const handleKeyInput = (e) => {
            // Handle Escape key
            if (e.key === 'Escape') {
                cleanup();
                return;
            }
            // Handle Enter key
            if (e.key === 'Enter') {
                // Check if input is a frequency (number between 20 and 20000)
                const frequencyMatch = currentInput.match(/^(\d+)$/);
                if (frequencyMatch) {
                    const frequency = parseInt(frequencyMatch[1]);
                    if (frequency >= 20 && frequency <= 20000) {
                        const noteInfo = this.getClosestNote(frequency);
                        this.moveToNote(noteInfo.note, noteInfo.octave);
                        cleanup();
                        return;
                    }
                }

                // If not a frequency, check if it's a note
                const notePattern = /^([A-G]#?)([0-9])$/;
                const noteMatch = currentInput.toUpperCase().match(notePattern);
                if (noteMatch) {
                    const [_, note, octaveStr] = noteMatch;
                    const octave = octaveStr === '0' ? 10 : parseInt(octaveStr);
                    if (this.baseFrequencies[note] && octave >= 1 && octave <= 10) {
                        this.moveToNote(note, octave);
                    }
                }
                cleanup();
                return;
            }
            // Handle Backspace
            if (e.key === 'Backspace') {
                if (currentInput.length > 0) {
                    currentInput = currentInput.slice(0, -1);
                    input.value = currentInput;
                }
                e.preventDefault();
                return;
            }
            // Handle regular input
            if (e.key.length === 1) {
                const key = e.key.toUpperCase();

                // If empty, accept A-G or numbers
                if (currentInput === '') {
                    if ((key >= 'A' && key <= 'G') || (key >= '0' && key <= '9')) {
                        currentInput = key;
                        input.value = currentInput;
                    }
                }
                // If first character is a number, only accept numbers up to 5 digits
                else if (/^\d+$/.test(currentInput) && currentInput.length < 5) {
                    if (key >= '0' && key <= '9') {
                        currentInput += key;
                        input.value = currentInput;
                    }
                }
                // If we have a note, accept # or number
                else if (currentInput.length === 1 && /[A-G]/.test(currentInput)) {
                    if (key === '#' || (key >= '0' && key <= '9')) {
                        currentInput += key;
                        input.value = currentInput;
                    }
                }
                // If we have a note with #, only accept number
                else if (currentInput.length === 2 && currentInput.includes('#')) {
                    if (key >= '0' && key <= '9') {
                        currentInput += key;
                        input.value = currentInput;
                    }
                }
                e.preventDefault();
            }
        };
        const cleanup = () => {
            input.remove();
            document.removeEventListener('keydown', handleKeyInput);
            document.removeEventListener('mousedown', handleClickOutside);
        };
        const handleClickOutside = (e) => {
            if (e.target !== input) {
                cleanup();
            }
        };
        document.addEventListener('keydown', handleKeyInput);
        setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 100);
    }
    getClosestNote(frequency) {
        const A4 = 440;
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

        // Calculate how many half steps away from A4 the frequency is
        const halfSteps = Math.round(12 * Math.log2(frequency / A4));

        // Calculate the octave
        const octave = 4 + Math.floor((halfSteps + 9) / 12);

        // Calculate the note index
        const noteIndex = ((halfSteps + 9) % 12 + 12) % 12;

        return {
            note: notes[noteIndex],
            octave: octave
        };
    }
    getExactFrequency(note, octave) {
        // Get the base frequency for the note (in octave 4)
        const baseFreq = this.baseFrequencies[note];

        // Calculate the exact frequency for the given octave
        return baseFreq * Math.pow(2, octave - 4);
    }
}

const container = document.getElementById('renderDiv');
const config = {
    type: Phaser.AUTO,
    parent: container,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    width: 800,
    height: 600,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: {
                y: 0
            },
            debug: false
        }
    },
    scene: Game
};

window.phaserGame = new Phaser.Game(config);