/**
 * Neon Snake Game
 * A modern, premium-styled Snake game with synthesized audio and mobile support.
 * 
 * @author Antigravity
 * @version 1.1.0
 */

// --- DOM Elements ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const highScoreElement = document.getElementById('high-score');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreElement = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');
const muteBtn = document.getElementById('mute-btn');
const modeBtns = document.querySelectorAll('.mode-btn');
const splashScreen = document.getElementById('splash-screen');

// Mobile Controls
const btnUp = document.getElementById('btn-up');
const btnDown = document.getElementById('btn-down');
const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');

// --- Game Constants ---
const GRID_SIZE = 20;
const TILE_COUNT = canvas.width / GRID_SIZE;
const SPEEDS = {
    SLOW: 150,
    NORMAL: 100,
    FAST: 60
};

/**
 * SoundManager Class
 * Handles all audio synthesis using the Web Audio API.
 */
class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.isMuted = false;
        this.bgOscillator = null;
        this.bgGain = null;
        this.isPlayingBg = false;
    }

    /**
     * Resumes the AudioContext if it was suspended (browser policy).
     */
    resumeContext() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Toggles the mute state and updates the UI icon.
     */
    toggleMute() {
        this.isMuted = !this.isMuted;

        // Update Icon
        const iconPath = this.isMuted
            ? '<line x1="1" y1="1" x2="23" y2="23"></line>' // Strikethrough
            : '<line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>'; // Sound waves

        muteBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                ${iconPath}
            </svg>
        `;

        if (this.isMuted) {
            this.stopBgMusic();
        } else if (isGameRunning) {
            this.startBgMusic();
        }
    }

    /**
     * Plays a synthesized tone.
     * @param {number} freq - Frequency in Hz.
     * @param {string} type - Oscillator type (sine, square, sawtooth, triangle).
     * @param {number} duration - Duration in seconds.
     * @param {number} vol - Volume (0.0 to 1.0).
     */
    playTone(freq, type, duration, vol = 0.1) {
        if (this.isMuted) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playEatSound() {
        // High pitch "coin" sound sequence
        this.playTone(600, 'sine', 0.1, 0.1);
        setTimeout(() => this.playTone(900, 'sine', 0.2, 0.1), 50);
    }

    playGameOverSound() {
        // Descending crash sequence
        this.playTone(200, 'sawtooth', 0.5, 0.2);
        setTimeout(() => this.playTone(150, 'sawtooth', 0.5, 0.2), 100);
        setTimeout(() => this.playTone(100, 'sawtooth', 0.8, 0.2), 200);
        this.stopBgMusic();
    }

    startBgMusic() {
        if (this.isMuted || this.isPlayingBg) return;

        // Background Drone
        this.bgOscillator = this.ctx.createOscillator();
        this.bgGain = this.ctx.createGain();

        this.bgOscillator.type = 'triangle';
        this.bgOscillator.frequency.setValueAtTime(50, this.ctx.currentTime);

        // LFO for pulsing effect (2Hz pulse)
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 2;

        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 0.02; // Modulation depth

        lfo.connect(lfoGain);
        lfoGain.connect(this.bgGain.gain);

        this.bgGain.gain.setValueAtTime(0.05, this.ctx.currentTime);

        this.bgOscillator.connect(this.bgGain);
        this.bgGain.connect(this.ctx.destination);

        lfo.start();
        this.bgOscillator.start();
        this.isPlayingBg = true;
    }

    stopBgMusic() {
        if (this.bgOscillator) {
            try {
                this.bgOscillator.stop();
                this.bgOscillator.disconnect();
                this.bgGain.disconnect();
            } catch (e) { console.warn('Error stopping audio:', e); }
            this.bgOscillator = null;
            this.bgGain = null;
            this.isPlayingBg = false;
        }
    }
}

const soundManager = new SoundManager();

// --- Game State ---
let score = 0;
let highScore = localStorage.getItem('snakeHighScore') || 0;
let snake = [];
let food = { x: 15, y: 15 };
let dx = 0;
let dy = 0;
let gameLoop;
let isGameRunning = false;
let isPaused = false;
let currentSpeed = SPEEDS.NORMAL;

// Initialize High Score UI
highScoreElement.textContent = highScore;

// --- Event Listeners ---

// Keyboard Input
document.addEventListener('keydown', handleInput);

// UI Buttons
restartBtn.addEventListener('click', () => startGame(currentSpeed));
muteBtn.addEventListener('click', () => {
    soundManager.toggleMute();
    muteBtn.blur(); // Remove focus to prevent spacebar toggling
});

// Splash Screen (Audio Context Init)
splashScreen.addEventListener('click', () => {
    soundManager.resumeContext();
    splashScreen.classList.add('hidden');
});

// Difficulty Selection
modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const speed = parseInt(btn.getAttribute('data-speed'));
        startGame(speed);
    });
});

// Mobile Touch Controls
const handleMobileInput = (direction) => {
    if (!isGameRunning) return;

    const goingUp = dy === -1;
    const goingDown = dy === 1;
    const goingRight = dx === 1;
    const goingLeft = dx === -1;

    switch (direction) {
        case 'up':
            if (!goingDown) { dx = 0; dy = -1; }
            break;
        case 'down':
            if (!goingUp) { dx = 0; dy = 1; }
            break;
        case 'left':
            if (!goingRight) { dx = -1; dy = 0; }
            break;
        case 'right':
            if (!goingLeft) { dx = 1; dy = 0; }
            break;
    }
};

// Attach Touch Events (prevent default to stop scrolling/zooming)
[btnUp, btnDown, btnLeft, btnRight].forEach(btn => {
    const dir = btn.id.replace('btn-', '');
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); handleMobileInput(dir); });
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); handleMobileInput(dir); });
});

// --- Game Logic ---

/**
 * Starts the game with the specified speed.
 * @param {number} speed - Game loop interval in ms.
 */
function startGame(speed = SPEEDS.NORMAL) {
    if (isGameRunning) return;

    currentSpeed = speed;

    // Reset State
    score = 0;
    scoreElement.textContent = score;
    snake = [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 }
    ];
    dx = 1;
    dy = 0;
    isGameRunning = true;
    isPaused = false;

    // UI Updates
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');

    // Audio
    soundManager.startBgMusic();

    // Start Loop
    if (gameLoop) clearInterval(gameLoop);
    gameLoop = setInterval(update, currentSpeed);
}

/**
 * Handles keyboard input for snake direction.
 * @param {KeyboardEvent} e 
 */
function handleInput(e) {
    // Prevent default scrolling for arrow keys
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
    }

    if (!isGameRunning) return;

    const goingUp = dy === -1;
    const goingDown = dy === 1;
    const goingRight = dx === 1;
    const goingLeft = dx === -1;

    switch (e.key) {
        case 'ArrowUp': case 'w': case 'W':
            if (!goingDown) { dx = 0; dy = -1; }
            break;
        case 'ArrowDown': case 's': case 'S':
            if (!goingUp) { dx = 0; dy = 1; }
            break;
        case 'ArrowLeft': case 'a': case 'A':
            if (!goingRight) { dx = -1; dy = 0; }
            break;
        case 'ArrowRight': case 'd': case 'D':
            if (!goingLeft) { dx = 1; dy = 0; }
            break;
    }
}

/**
 * Main game loop update function.
 */
function update() {
    if (isPaused) return;

    moveSnake();

    if (checkCollision()) {
        gameOver();
        return;
    }

    checkFoodCollision();
    draw();
}

/**
 * Updates snake position based on current direction.
 */
function moveSnake() {
    const head = { x: snake[0].x + dx, y: snake[0].y + dy };
    snake.unshift(head);
    snake.pop();
}

/**
 * Checks for collisions with walls or self.
 * @returns {boolean} True if collision detected.
 */
function checkCollision() {
    const head = snake[0];

    // Wall Collision
    if (head.x < 0 || head.x >= TILE_COUNT || head.y < 0 || head.y >= TILE_COUNT) {
        return true;
    }

    // Self Collision
    // Optimization: Simple loop is fast enough for this snake length
    for (let i = 1; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            return true;
        }
    }

    return false;
}

/**
 * Checks if snake head overlaps with food.
 */
function checkFoodCollision() {
    const head = snake[0];

    if (head.x === food.x && head.y === food.y) {
        // Increase Score
        score += 10;
        scoreElement.textContent = score;

        // Update High Score
        if (score > highScore) {
            highScore = score;
            highScoreElement.textContent = highScore;
            localStorage.setItem('snakeHighScore', highScore);
        }

        // Play Sound
        soundManager.playEatSound();

        // Grow Snake (duplicate tail segment)
        const tail = snake[snake.length - 1];
        snake.push({ ...tail });

        // Respawn Food
        generateFood();
    }
}

/**
 * Generates food at a random position not occupied by the snake.
 */
function generateFood() {
    while (true) {
        food.x = Math.floor(Math.random() * TILE_COUNT);
        food.y = Math.floor(Math.random() * TILE_COUNT);

        // Check if food spawned on snake
        const onSnake = snake.some(segment => segment.x === food.x && segment.y === food.y);
        if (!onSnake) break;
    }
}

/**
 * Ends the game and shows the game over screen.
 */
function gameOver() {
    isGameRunning = false;
    clearInterval(gameLoop);
    finalScoreElement.textContent = score;
    gameOverScreen.classList.remove('hidden');
    soundManager.playGameOverSound();
}

/**
 * Renders the game state to the canvas.
 */
function draw() {
    // Clear Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Snake
    snake.forEach((segment, index) => {
        // Create gradient for each segment for a "flowing" neon look
        const gradient = ctx.createLinearGradient(
            segment.x * GRID_SIZE,
            segment.y * GRID_SIZE,
            (segment.x + 1) * GRID_SIZE,
            (segment.y + 1) * GRID_SIZE
        );

        if (index === 0) {
            // Head Style
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 15;
        } else {
            // Body Style
            gradient.addColorStop(0, '#00ff88');
            gradient.addColorStop(1, '#00ccff');
            ctx.fillStyle = gradient;
            ctx.shadowColor = '#00ff88';
            ctx.shadowBlur = 5;
        }

        // Draw rounded segment
        roundRect(
            ctx,
            segment.x * GRID_SIZE + 1,
            segment.y * GRID_SIZE + 1,
            GRID_SIZE - 2,
            GRID_SIZE - 2,
            4
        );
        ctx.fill();

        // Reset shadow for performance
        ctx.shadowBlur = 0;
    });

    // Draw Food
    ctx.fillStyle = '#ff0055';
    ctx.shadowColor = '#ff0055';
    ctx.shadowBlur = 15;

    ctx.beginPath();
    ctx.arc(
        food.x * GRID_SIZE + GRID_SIZE / 2,
        food.y * GRID_SIZE + GRID_SIZE / 2,
        GRID_SIZE / 2 - 2,
        0,
        Math.PI * 2
    );
    ctx.fill();

    ctx.shadowBlur = 0;
}

/**
 * Helper to draw rounded rectangles on canvas.
 */
function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}
