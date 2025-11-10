const CONFIG = {
    CANVAS_WIDTH: 800,
    CANVAS_HEIGHT: 400,
    GROUND_HEIGHT: 50,
    GRAVITY: 0.6,
    JUMP_STRENGTH: -15, // stronger jump for easier obstacle clearance
    INITIAL_SPEED: 5,
    SPEED_INCREMENT: 0.002,
    MAX_SPEED: 12,
    OBSTACLE_SPAWN_DISTANCE: 300,
    COLLECTIBLE_SPAWN_DISTANCE: 400,
};

let gameState = {
    isRunning: false,
    score: 0,
    highScore: 0,
    speed: CONFIG.INITIAL_SPEED,
    distance: 0,
    gameOver: false,
    isPaused: false,
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let player = {
    x: 100,
    y: 0,
    width: 100, // scaled for image aspect
    height: 120, // slightly reduced for fair collision
    velocityY: 0,
    isJumping: false,
    jumpCount: 0, // for double jump
    color: '#FF6B6B',
};

// --- Image assets (preload) -------------------------------------------------
const assets = {
    bg: new Image(),
    collectible: new Image(),
    obstacles: {
        book: new Image(),
        coffee: new Image(),
        assignment: new Image(),
        papers: new Image(),
        pizza: new Image(),
        spills: new Image(),
        dues: new Image(),
    },
    // player run frames (you provided run1..run4), plus jump/fall/pose
    playerFrames: [],
    playerJump: new Image(),
    playerFall: new Image(),
    playerPose: new Image(),
};

let imagesLoaded = 0;
function trackLoad() { imagesLoaded++; }

// set sources (files already present in static/characters/)
assets.bg.src = '/static/characters/bg.jpg';
assets.collectible.src = '/static/characters/attendence_sheet.jpg';
assets.obstacles.book.src = '/static/characters/books.jpg';
assets.obstacles.coffee.src = '/static/characters/coffee.jpg';
assets.obstacles.assignment.src = '/static/characters/dues.jpg';
assets.obstacles.papers.src = '/static/characters/papers.jpg';
assets.obstacles.pizza.src = '/static/characters/pizza.jpg';
assets.obstacles.spills.src = '/static/characters/spills.jpg';
assets.obstacles.dues.src = '/static/characters/dues.jpg';

// player run frames run1..run4
['run1','run2','run3','run4'].forEach(name => {
    const img = new Image();
    img.src = `/static/characters/${name}.jpg`;
    assets.playerFrames.push(img);
});
assets.playerJump.src = '/static/characters/jump.jpg';
assets.playerFall.src = '/static/characters/fall.jpg';
assets.playerPose.src = '/static/characters/pose.jpg';

// attach load/error handlers
Object.values(assets.obstacles).forEach(img => { img.onload = trackLoad; img.onerror = trackLoad; });
assets.bg.onload = trackLoad; assets.bg.onerror = trackLoad;
assets.collectible.onload = trackLoad; assets.collectible.onerror = trackLoad;
assets.playerJump.onload = trackLoad; assets.playerJump.onerror = trackLoad;
assets.playerFall.onload = trackLoad; assets.playerFall.onerror = trackLoad;
assets.playerPose.onload = trackLoad; assets.playerPose.onerror = trackLoad;
assets.playerFrames.forEach(img => { img.onload = trackLoad; img.onerror = trackLoad; });

const TOTAL_ASSETS = 1 + 1 + Object.keys(assets.obstacles).length + assets.playerFrames.length + 3; // bg + collectible + obstacles + frames + jump/fall/pose

// player animation metadata
player.sprite = {
    frames: assets.playerFrames,
    framesCount: assets.playerFrames.length,
    current: 0,
    tick: 0,
    speed: 6, // lower = faster
    jumpImg: assets.playerJump,
    fallImg: assets.playerFall,
    poseImg: assets.playerPose,
};

let obstacles = [];
let collectibles = [];

player.y = CONFIG.CANVAS_HEIGHT - CONFIG.GROUND_HEIGHT - player.height;

function jump() {
    if (!gameState.isRunning) return;
    // Allow up to 2 jumps before landing
    if (player.jumpCount < 2) {
        player.velocityY = CONFIG.JUMP_STRENGTH;
        player.isJumping = true;
        player.jumpCount++;
        console.log('Jump! jumpCount:', player.jumpCount);
    }
}

let lastObstacleX = 0;
function createObstacle() {
    const types = ['book', 'coffee', 'assignment', 'papers', 'pizza', 'spills', 'dues'];
    // Pattern: alternate between random and fixed type, and ensure minimum gap
    let type;
    if (gameState.score % 2 === 0) {
        type = types[Math.floor(Math.random() * types.length)];
    } else {
        type = types[(gameState.score / 2) % types.length];
    }
    let width = 80, height = 70, color = '#8B4513';
    if (type === 'coffee') color = '#6F4E37';
    if (type === 'assignment' || type === 'dues') color = '#FF4444';
    if (type === 'papers') color = '#CCCCCC';
    if (type === 'pizza') color = '#FFD700';
    if (type === 'spills') color = '#A0522D';
    // Ensure obstacles are at least 350px apart
    let minGap = 350 + Math.random() * 100;
    let x = Math.max(CONFIG.CANVAS_WIDTH, lastObstacleX + minGap);
    lastObstacleX = x;
    return {
        x: x,
        y: CONFIG.CANVAS_HEIGHT - CONFIG.GROUND_HEIGHT - height,
        width: width,
        height: height,
        color: color,
        type: type,
    };
}

function createCollectible() {
    // Always spawn collectible above ground, scaled to 80x70
    return {
        x: CONFIG.CANVAS_WIDTH,
        y: Math.random() * (CONFIG.CANVAS_HEIGHT - CONFIG.GROUND_HEIGHT - 120) + 30,
        width: 80,
        height: 70,
        color: '#FFA500',
        collected: false,
    };
}

function checkCollision(rect1, rect2) {
    // Only trigger collision if player is not above obstacle (allow landing on top)
    const pad1x = rect1.width * 0.1, pad1y = rect1.height * 0.1;
    const pad2x = rect2.width * 0.1, pad2y = rect2.height * 0.1;
    const overlapX = (rect1.x + pad1x) < (rect2.x + rect2.width - pad2x) &&
                     (rect1.x + rect1.width - pad1x) > (rect2.x + pad2x);
    const overlapY = (rect1.y + pad1y) < (rect2.y + rect2.height - pad2y) &&
                     (rect1.y + rect1.height - pad1y) > (rect2.y + pad2y);
    // Only count as hit if player's bottom is below obstacle's top AND player's previous Y was not above obstacle
    const playerBottom = rect1.y + rect1.height - pad1y;
    const obstacleTop = rect2.y + pad2y;
    // If player is falling and bottom is above obstacle top, allow landing
    if (rect1.velocityY > 0 && playerBottom <= obstacleTop + 5) return false;
    return overlapX && overlapY && playerBottom > obstacleTop + 5;
}

function update() {
    if (!gameState.isRunning || gameState.gameOver) return;

    gameState.score += 1;
    gameState.distance += gameState.speed;

    if (gameState.speed < CONFIG.MAX_SPEED) {
        gameState.speed += CONFIG.SPEED_INCREMENT;
    }

    player.velocityY += CONFIG.GRAVITY;
    player.y += player.velocityY;

    const groundY = CONFIG.CANVAS_HEIGHT - CONFIG.GROUND_HEIGHT - player.height;
    if (player.y >= groundY) {
        player.y = groundY;
        player.velocityY = 0;
        player.isJumping = false;
        player.jumpCount = 0; // reset double jump on landing
    }

    // advance player animation when on ground and running
    if (!player.isJumping && !gameState.gameOver) {
        player.sprite.tick++;
        if (player.sprite.tick >= player.sprite.speed) {
            player.sprite.tick = 0;
            player.sprite.current = (player.sprite.current + 1) % Math.max(1, player.sprite.framesCount);
        }
    } else if (player.isJumping) {
        // keep jump frame
        // optionally set to a specific jump frame index; we use jumpImg for rendering
    }

    if (obstacles.length === 0 || 
        CONFIG.CANVAS_WIDTH - obstacles[obstacles.length - 1].x > CONFIG.OBSTACLE_SPAWN_DISTANCE) {
        obstacles.push(createObstacle());
    }

    if (collectibles.length === 0 || 
        CONFIG.CANVAS_WIDTH - collectibles[collectibles.length - 1].x > CONFIG.COLLECTIBLE_SPAWN_DISTANCE) {
        collectibles.push(createCollectible());
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
        obstacles[i].x -= gameState.speed;
        if (checkCollision(player, obstacles[i])) {
            if (obstacles[i].type === 'pizza' || obstacles[i].type === 'coffee') {
                // Collect pizza or coffee for bonus points
                gameState.score += 100;
                obstacles.splice(i, 1);
                continue;
            } else {
                endGame();
            }
        }
        if (obstacles[i].x + obstacles[i].width < 0) {
            obstacles.splice(i, 1);
        }
    }

    for (let i = collectibles.length - 1; i >= 0; i--) {
        collectibles[i].x -= gameState.speed;
        if (!collectibles[i].collected && checkCollision(player, collectibles[i])) {
            collectibles[i].collected = true;
            gameState.score += 50;
        }
        if (collectibles[i].x + collectibles[i].width < 0) {
            collectibles.splice(i, 1);
        }
    }

    document.getElementById('score').textContent = gameState.score;
}

function render() {
    // background (image if loaded)
    if (imagesLoaded >= TOTAL_ASSETS && assets.bg && assets.bg.complete) {
        ctx.drawImage(assets.bg, 0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
    } else {
        ctx.fillStyle = '#87CEEB';
        ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
    }

    ctx.fillStyle = '#8B7355';
    ctx.fillRect(0, CONFIG.CANVAS_HEIGHT - CONFIG.GROUND_HEIGHT, CONFIG.CANVAS_WIDTH, CONFIG.GROUND_HEIGHT);

    ctx.strokeStyle = '#654321';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, CONFIG.CANVAS_HEIGHT - CONFIG.GROUND_HEIGHT);
    ctx.lineTo(CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT - CONFIG.GROUND_HEIGHT);
    ctx.stroke();

    // draw player (sprite when available)
    const allLoaded = imagesLoaded >= TOTAL_ASSETS;
    if (allLoaded && player.sprite && player.sprite.framesCount > 0) {
        let imgToDraw = null;
        if (gameState.gameOver) {
            imgToDraw = player.sprite.fallImg || player.sprite.frames[player.sprite.current];
        } else if (player.isJumping) {
            imgToDraw = player.sprite.jumpImg || player.sprite.frames[player.sprite.current];
        } else {
            imgToDraw = player.sprite.frames[player.sprite.current] || player.sprite.poseImg;
        }
        if (imgToDraw && imgToDraw.complete) {
            ctx.drawImage(imgToDraw, player.x, player.y, player.width, player.height);
        } else {
            ctx.fillStyle = player.color;
            ctx.fillRect(player.x, player.y, player.width, player.height);
        }
    } else {
        // fallback rectangle + eyes
        ctx.fillStyle = player.color;
        ctx.fillRect(player.x, player.y, player.width, player.height);
        ctx.fillStyle = '#FFF';
        ctx.fillRect(player.x + 10, player.y + 15, 8, 8);
        ctx.fillRect(player.x + 22, player.y + 15, 8, 8);
    }

    // Update obstacle image mapping for render()
    const obstacleImageMap = {
        book: assets.obstacles.book,
        coffee: assets.obstacles.coffee,
        assignment: assets.obstacles.papers, // use papers.jpg for assignment
        papers: assets.obstacles.papers,
        pizza: assets.obstacles.pizza,
        spills: assets.obstacles.spills,
        dues: assets.obstacles.dues,
    };

    obstacles.forEach(obstacle => {
        const img = obstacleImageMap[obstacle.type] || assets.obstacles.papers;
        if (allLoaded && img && img.complete) {
            ctx.drawImage(img, obstacle.x, obstacle.y, obstacle.width, obstacle.height);
        } else {
            ctx.fillStyle = obstacle.color;
            ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            ctx.fillStyle = '#FFF';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            let emoji = obstacle.type === 'book' ? 'B' : obstacle.type === 'coffee' ? 'C' : 'A';
            ctx.fillText(emoji, obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height / 2 + 5);
        }
    });

    collectibles.forEach(collectible => {
        if (!collectible.collected) {
            if (allLoaded && assets.collectible && assets.collectible.complete) {
                ctx.drawImage(assets.collectible, collectible.x, collectible.y, collectible.width, collectible.height);
            } else {
                ctx.fillStyle = collectible.color;
                ctx.fillRect(collectible.x, collectible.y, collectible.width, collectible.height);
                ctx.fillStyle = '#FFF';
                ctx.font = '20px Arial';
                ctx.fillText('S', collectible.x + collectible.width / 2, collectible.y + collectible.height / 2 + 7);
            }
        }
    });
}

function gameLoop() {
    if (gameState.isPaused || gameState.gameOver) return;
    update();
    render();
    requestAnimationFrame(gameLoop);
}

let hasStartedOnce = false;
function startGame() {
    gameState = {
        isRunning: true,
        score: 0,
        speed: CONFIG.INITIAL_SPEED,
        distance: 0,
        gameOver: false,
        highScore: gameState.highScore,
        isPaused: false,
    };
    player.y = CONFIG.CANVAS_HEIGHT - CONFIG.GROUND_HEIGHT - player.height;
    player.velocityY = 0;
    player.isJumping = false;
    player.jumpCount = 0; // reset double jump
    obstacles = [];
    collectibles = [];
    lastObstacleX = 0;
    document.getElementById('score').textContent = '0';
    document.getElementById('gameOverModal').classList.add('hidden');
    if (!hasStartedOnce) {
        document.getElementById('startBtn').textContent = 'Restart';
        hasStartedOnce = true;
    }
}

function endGame() {
    gameState.gameOver = true;
    gameState.isRunning = false;
    if (gameState.score > gameState.highScore) {
        gameState.highScore = gameState.score;
        document.getElementById('highScore').textContent = gameState.highScore;
        localStorage.setItem('highScore', gameState.highScore);
    }
    document.getElementById('finalScore').textContent = gameState.score;
    document.getElementById('gameOverModal').classList.remove('hidden');
    document.getElementById('saveMessage').textContent = '';
    // Auto-save if account exists
    const account = localStorage.getItem('playerAccountName');
    if (account) {
        saveScore();
        document.getElementById('saveScoreBtn').style.display = 'none';
    } else {
        document.getElementById('saveScoreBtn').style.display = 'inline-block';
    }
}

async function saveScore() {
    // Prefer account name stored in localStorage; fall back to modal input
    const storedAccount = localStorage.getItem('playerAccountName');
    const playerName = storedAccount ? storedAccount : document.getElementById('playerName').value.trim();
    const saveMessage = document.getElementById('saveMessage');
    
    if (!playerName) {
        saveMessage.textContent = 'Please enter your name!';
        saveMessage.className = 'save-message error';
        return;
    }

    const saveBtn = document.getElementById('saveScoreBtn');
    saveBtn.disabled = true;
    saveMessage.textContent = 'Saving...';
    saveMessage.className = 'save-message';

    try {
        const response = await fetch('/api/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: playerName, score: gameState.score }),
        });
        const data = await response.json();
        if (response.ok) {
            saveMessage.textContent = 'Score saved successfully!';
            saveMessage.className = 'save-message success';
            loadLeaderboard();
        } else {
            saveMessage.textContent = data.error || 'Failed to save score';
            saveMessage.className = 'save-message error';
        }
    } catch (error) {
        saveMessage.textContent = 'Network error. Score saved locally!';
        saveMessage.className = 'save-message error';
    } finally {
        saveBtn.disabled = false;
    }
}

// --- Account modal handling -----------------------------------------------
function openAccountModal() {
    document.getElementById('accountModal').classList.remove('hidden');
    const accountName = localStorage.getItem('playerAccountName') || '';
    document.getElementById('accountName').value = accountName;
    document.getElementById('accountMessage').textContent = '';
}

function closeAccountModal() {
    document.getElementById('accountModal').classList.add('hidden');
}

function createAccount() {
    const name = document.getElementById('accountName').value.trim();
    const msg = document.getElementById('accountMessage');
    if (!name) {
        msg.textContent = 'Please enter an account name.';
        msg.className = 'save-message error';
        return;
    }
    localStorage.setItem('playerAccountName', name);
    // update playerName input and disable editing
    const playerNameInput = document.getElementById('playerName');
    if (playerNameInput) {
        playerNameInput.value = name;
        playerNameInput.disabled = true;
    }
    msg.textContent = 'Account saved.';
    msg.className = 'save-message success';
}

// wire account buttons
function updatePlayerNameDisplay() {
    const display = document.getElementById('playerNameDisplay');
    const signOutBtn = document.getElementById('signOutBtn');
    const googleSignIn = document.getElementById('googleSignIn');
    const name = localStorage.getItem('playerAccountName');
    if (name) {
        display.textContent = `Player: ${name}`;
        display.style.display = 'inline-block';
        signOutBtn.style.display = 'inline-block';
        if (googleSignIn) googleSignIn.style.display = 'none';
    } else {
        display.textContent = '';
        display.style.display = 'none';
        signOutBtn.style.display = 'none';
        if (googleSignIn) googleSignIn.style.display = 'block';
    }
}

// Update display on account changes
window.addEventListener('load', updatePlayerNameDisplay);

// Update display after Google login
async function handleGoogleCredential(response) {
    if (!response || !response.credential) return;
    try {
        const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_token: response.credential })
        });
        const data = await res.json();
        if (res.ok && data.account) {
            localStorage.setItem('playerAccountName', data.account);
            const playerNameInput = document.getElementById('playerName');
            if (playerNameInput) {
                playerNameInput.value = data.account;
                playerNameInput.disabled = true;
            }
            document.getElementById('accountMessage').textContent = 'Signed in as ' + data.account;
            document.getElementById('accountMessage').className = 'save-message success';
            document.getElementById('accountModal').classList.add('hidden');
            updatePlayerNameDisplay();
        } else {
            document.getElementById('accountMessage').textContent = data.error || 'Google sign-in failed';
            document.getElementById('accountMessage').className = 'save-message error';
        }
    } catch (err) {
        console.error('Google auth error', err);
    }
}
// Pause button
document.getElementById('pauseBtn').addEventListener('click', () => {
    gameState.isPaused = !gameState.isPaused;
    document.getElementById('pauseBtn').textContent = gameState.isPaused ? 'Resume' : 'Pause';
    if (!gameState.isPaused && gameState.isRunning && !gameState.gameOver) {
        gameLoop();
    }
});

// Cross button for score modal
document.getElementById('closeScoreModalBtn').addEventListener('click', () => {
    document.getElementById('gameOverModal').classList.add('hidden');
});
// Account button and modal logic removed

// on load, if account exists, prefill and disable name input
window.addEventListener('load', () => {
    const acc = localStorage.getItem('playerAccountName');
    if (acc) {
        const playerNameInput = document.getElementById('playerName');
        if (playerNameInput) {
            playerNameInput.value = acc;
            playerNameInput.disabled = true;
        }
    }
    updatePlayerNameDisplay();
});

// Sign out button logic
document.getElementById('signOutBtn').addEventListener('click', () => {
    localStorage.removeItem('playerAccountName');
    location.reload();
});

async function loadLeaderboard() {
    const leaderboardList = document.getElementById('leaderboardList');
    leaderboardList.innerHTML = '<p>Loading...</p>';
    try {
        const response = await fetch('/api/scores');
        const data = await response.json();
        if (response.ok && data.scores && data.scores.length > 0) {
            leaderboardList.innerHTML = '';
            data.scores.forEach((score, index) => {
                const item = document.createElement('div');
                item.className = 'leaderboard-item' + (index < 3 ? ' top-' + (index + 1) : '');
                const rank = index + 1;
                const medal = rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : rank + '.';
                item.innerHTML = '<span>' + medal + ' ' + score.name + '</span><span><strong>' + score.score + '</strong></span>';
                leaderboardList.appendChild(item);
            });
        } else {
            leaderboardList.innerHTML = '<p>No scores yet. Be the first!</p>';
        }
    } catch (error) {
        leaderboardList.innerHTML = '<p>Failed to load leaderboard</p>';
    }
}

document.getElementById('startBtn').addEventListener('click', () => {
    console.log('Start button clicked');
    startGame();
});
document.getElementById('jumpBtn').addEventListener('click', () => {
    console.log('Jump button clicked');
    jump();
});
document.getElementById('retryBtn').addEventListener('click', () => {
    console.log('Retry button clicked');
    document.getElementById('gameOverModal').classList.add('hidden');
    startGame();
});
document.getElementById('saveScoreBtn').addEventListener('click', () => {
    console.log('Save Score button clicked');
    saveScore();
});
document.getElementById('refreshLeaderboard').addEventListener('click', () => {
    console.log('Refresh Leaderboard button clicked');
    loadLeaderboard();
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        console.log('Spacebar pressed');
        e.preventDefault();
        if (!gameState.isRunning && !gameState.gameOver) {
            console.log('Game started by spacebar');
            startGame();
        } else {
            jump();
        }
    }
});

let origStartGame = startGame;
startGame = function() {
    console.log('startGame() called');
    origStartGame();
    console.log('gameState:', JSON.stringify(gameState));
};

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    jump();
});

window.addEventListener('load', () => {
    const savedHighScore = localStorage.getItem('highScore');
    if (savedHighScore) {
        gameState.highScore = parseInt(savedHighScore);
        document.getElementById('highScore').textContent = gameState.highScore;
    }
    loadLeaderboard();
    document.getElementById('startBtn').textContent = 'Start';
    gameLoop(); // only renders, doesn't start game until button/space pressed
});

// Google Sign-In handling (uses /api/auth/google)
// The server injects GOOGLE_CLIENT_ID into the template as `google_client_id`.
try {
    const googleClientId = window.GOOGLE_CLIENT_ID || null;
    // If the template set the client id as a global, use it; else try meta tag
} catch (e) {}

function initGoogleButton(clientId) {
    if (!clientId) return;
    if (window.google && google.accounts && google.accounts.id) {
        google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCredential
        });
        google.accounts.id.renderButton(
            document.getElementById('googleSignIn'),
            { theme: 'outline', size: 'large' }
        );
        google.accounts.id.prompt();
    }
}

async function handleGoogleCredential(response) {
    if (!response || !response.credential) return;
    try {
        const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_token: response.credential })
        });
        const data = await res.json();
        if (res.ok && data.account) {
            // store account locally and prefill player name
            localStorage.setItem('playerAccountName', data.account);
            const playerNameInput = document.getElementById('playerName');
            if (playerNameInput) {
                playerNameInput.value = data.account;
                playerNameInput.disabled = true;
            }
            document.getElementById('accountMessage').textContent = 'Signed in as ' + data.account;
            document.getElementById('accountMessage').className = 'save-message success';
            // close account modal if open
            document.getElementById('accountModal').classList.add('hidden');
        } else {
            document.getElementById('accountMessage').textContent = data.error || 'Google sign-in failed';
            document.getElementById('accountMessage').className = 'save-message error';
        }
    } catch (err) {
        console.error('Google auth error', err);
    }
}

// Try to init Google button if client id was rendered to window by template
try {
    if (typeof GOOGLE_CLIENT_ID !== 'undefined' && GOOGLE_CLIENT_ID) {
        initGoogleButton(GOOGLE_CLIENT_ID);
    } else {
        // template injection: look for meta tag
        const meta = document.querySelector('meta[name="google-client-id"]');
        if (meta && meta.content) initGoogleButton(meta.content);
    }
} catch (e) {}

