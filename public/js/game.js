// public/js/game.js
class SlitherGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.minimap = document.getElementById('minimap');
        this.minimapCtx = this.minimap.getContext('2d');
        
        // Optimisations de rendu
        this.ctx.imageSmoothingEnabled = false;
        
        // Buffer pour l'interpolation
        this.playerBuffer = {};
        this.lastServerUpdate = Date.now();
        this.lastPositionSent = Date.now();
        this.lastSentPosition = { x: 0, y: 0, angle: 0 };
        
        // Variables d'optimisation
        this.renderDistance = 600;
        this.lastRender = Date.now();
        this.targetFPS = 60;
        this.frameInterval = 1000 / this.targetFPS;
        
        this.setupCanvas();
        this.initializeGame();
        this.setupEventListeners();
        this.connectToServer();
        
        this.gameLoop();
    }

    setupCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.canvas.style.cursor = 'crosshair';
        
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        });
    }

    initializeGame() {
        this.players = {};
        this.food = [];
        this.playerId = null;
        this.camera = { x: 0, y: 0 };
        this.mouse = { x: 0, y: 0 };
        this.keys = {};
        this.gameRunning = true;
        this.isPaused = false;
        this.worldSize = 4000;
        this.boosting = false;
        this.kills = 0;
        this.gameStartTime = Date.now();
        
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        this.playerName = userData.username || 'Joueur';
        this.playerColor = localStorage.getItem('playerColor') || '#ef4444';
        this.bestScore = userData.bestScore || 0;
        
        document.getElementById('playerName').textContent = this.playerName;
        document.getElementById('bestScore').textContent = Utils.formatNumber(this.bestScore);
        document.getElementById('currentKills').textContent = '0';
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });

        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0 && this.gameRunning && !this.isPaused) {
                this.boosting = true;
                document.getElementById('boostIndicator').classList.remove('hidden');
                document.getElementById('boostIndicator').classList.add('boost-effect');
            }
        });

        this.canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.boosting = false;
                document.getElementById('boostIndicator').classList.add('hidden');
            }
        });

        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            
            if (e.code === 'Space') {
                e.preventDefault();
                this.togglePause();
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        document.getElementById('playAgainBtn').addEventListener('click', () => {
            this.respawn();
        });

        document.getElementById('backToMenuBtn').addEventListener('click', () => {
            this.logout();
        });

        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });
    }

    connectToServer() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = '/';
            return;
        }

        this.socket = io({
            auth: { token: token },
            forceNew: true,
            reconnection: true,
            timeout: 5000,
            transports: ['websocket', 'polling']
        });

        this.socket.on('connect', () => {
            console.log('Connecté au serveur');
            this.socket.emit('joinGame', {
                color: this.playerColor
            });
        });

        this.socket.on('connect_error', (error) => {
            console.error('Erreur de connexion:', error.message);
            if (error.message === 'Token invalide' || error.message === 'Token manquant') {
                this.logout();
            }
        });

        this.socket.on('gameState', (state) => {
            this.players = state.players;
            this.food = state.food;
            this.playerId = state.playerId;
        });

        this.socket.on('playerJoined', (player) => {
            this.players[player.id] = player;
        });

        this.socket.on('playerMoved', (data) => {
            if (this.players[data.id]) {
                // Stocker la position précédente pour l'interpolation
                this.playerBuffer[data.id] = {
                    from: {
                        x: this.players[data.id].x,
                        y: this.players[data.id].y,
                        angle: this.players[data.id].angle
                    },
                    to: {
                        x: data.x,
                        y: data.y,
                        angle: data.angle
                    },
                    startTime: Date.now()
                };
                
                // Mettre à jour immédiatement les autres propriétés
                this.players[data.id].segments = data.segments;
                this.players[data.id].speed = data.speed;
                this.players[data.id].boosting = data.boosting;
            }
        });

        this.socket.on('playerLeft', (playerId) => {
            delete this.players[playerId];
            delete this.playerBuffer[playerId];
        });

        this.socket.on('foodEaten', (data) => {
            this.food = this.food.filter(f => f.id !== data.foodId);
            this.food.push(data.newFood);
            
            if (data.playerId === this.playerId) {
                this.updateScore(data.newScore);
            }
        });

        this.socket.on('boostParticle', (particle) => {
            this.food.push(particle);
        });

        this.socket.on('playerDied', (data) => {
            if (data.playerId === this.playerId) {
                // Attendre les stats
            } else {
                delete this.players[data.playerId];
                delete this.playerBuffer[data.playerId];
                this.food = data.newFood;
                
                const player = this.players[this.playerId];
                if (player) {
                    this.kills++;
                    player.kills = this.kills;
                    document.getElementById('currentKills').textContent = this.kills;
                }
            }
        });

        this.socket.on('gameStats', (stats) => {
            this.showStatsScreen(stats);
        });

        this.socket.on('gameUpdate', (state) => {
            this.lastServerUpdate = Date.now();
            
            if (state.players) {
                // Mettre à jour seulement les nouveaux joueurs ou les changements importants
                for (const playerId in state.players) {
                    if (!this.players[playerId] || playerId.startsWith('bot_')) {
                        this.players[playerId] = state.players[playerId];
                    }
                }
            }
            
            this.updateLeaderboard();
        });
    }

    gameLoop() {
        const now = Date.now();
        
        if (this.gameRunning && !this.isPaused) {
            this.update();
        }
        
        // Limiter le rendu à 30 FPS
        if (now - this.lastRender >= this.frameInterval) {
            this.render();
            this.lastRender = now;
        }
        
        requestAnimationFrame(() => this.gameLoop());
    }

    update() {
        const player = this.players[this.playerId];
        if (!player) return;

        const now = Date.now();
        // Limiter les mises à jour de position à 20 FPS
        if (now - this.lastPositionSent < 50) {
            return;
        }

        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const targetAngle = Utils.angle(centerX, centerY, this.mouse.x, this.mouse.y);
        
        let angleDiff = targetAngle - player.angle;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        
        player.angle += angleDiff * 0.1;

        const baseSpeed = 3;
        const boostSpeed = 6;
        player.speed = this.boosting ? boostSpeed : baseSpeed;
        player.boosting = this.boosting;

        player.x += Math.cos(player.angle) * player.speed;
        player.y += Math.sin(player.angle) * player.speed;

        player.x = Utils.clamp(player.x, 50, this.worldSize - 50);
        player.y = Utils.clamp(player.y, 50, this.worldSize - 50);

        this.updateSegments(player);
        this.checkFoodCollisions(player);
        this.checkPlayerCollisions(player);
        this.updateCamera(player);

        // Envoyer seulement si position a changé significativement
        const positionChanged = 
            Math.abs(player.x - this.lastSentPosition.x) > 3 ||
            Math.abs(player.y - this.lastSentPosition.y) > 3 ||
            Math.abs(player.angle - this.lastSentPosition.angle) > 0.1;

        if (positionChanged) {
            this.socket.emit('updatePosition', {
                x: Math.round(player.x),
                y: Math.round(player.y),
                angle: Math.round(player.angle * 100) / 100,
                segments: player.segments.slice(0, 10), // Limiter les segments envoyés
                speed: player.speed,
                boosting: this.boosting
            });
            
            this.lastSentPosition = { x: player.x, y: player.y, angle: player.angle };
            this.lastPositionSent = now;
        }
    }

    // Interpolation fluide des mouvements
    interpolatePlayerMovements() {
        const now = Date.now();
        const interpolationTime = 100;
        
        for (const playerId in this.playerBuffer) {
            const buffer = this.playerBuffer[playerId];
            const elapsed = now - buffer.startTime;
            
            if (elapsed < interpolationTime && this.players[playerId]) {
                const progress = elapsed / interpolationTime;
                const smoothProgress = this.easeOutCubic(progress);
                
                this.players[playerId].x = this.lerp(buffer.from.x, buffer.to.x, smoothProgress);
                this.players[playerId].y = this.lerp(buffer.from.y, buffer.to.y, smoothProgress);
                this.players[playerId].angle = this.lerpAngle(buffer.from.angle, buffer.to.angle, smoothProgress);
            } else if (elapsed >= interpolationTime) {
                delete this.playerBuffer[playerId];
            }
        }
    }

    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    lerp(start, end, factor) {
        return start + (end - start) * factor;
    }

    lerpAngle(start, end, factor) {
        let diff = end - start;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        return start + diff * factor;
    }

    updateSegments(player) {
        const segmentDistance = 8;
        
        player.segments.unshift({
            x: player.x,
            y: player.y,
            size: player.size
        });

        for (let i = 1; i < player.segments.length; i++) {
            const prevSegment = player.segments[i - 1];
            const currentSegment = player.segments[i];
            
            const distance = Utils.distance(prevSegment.x, prevSegment.y, currentSegment.x, currentSegment.y);
            
            if (distance > segmentDistance) {
                const angle = Utils.angle(currentSegment.x, currentSegment.y, prevSegment.x, prevSegment.y);
                currentSegment.x = prevSegment.x - Math.cos(angle) * segmentDistance;
                currentSegment.y = prevSegment.y - Math.sin(angle) * segmentDistance;
            }
        }

        const targetLength = Math.max(5, Math.min(Math.floor(player.score / 5) + 5, 25)); // Limiter à 25
        while (player.segments.length > targetLength) {
            player.segments.pop();
        }
    }

    checkFoodCollisions(player) {
        for (let i = this.food.length - 1; i >= 0; i--) {
            const food = this.food[i];
            const distance = Utils.distance(player.x, player.y, food.x, food.y);
            
            if (distance < player.size + food.size) {
                this.socket.emit('eatFood', { foodId: food.id });
                break;
            }
        }
    }

    checkPlayerCollisions(player) {
        for (const otherPlayerId in this.players) {
            if (otherPlayerId === this.playerId) continue;
            
            const otherPlayer = this.players[otherPlayerId];
            
            // Vérifier seulement les premiers segments pour optimiser
            const segmentsToCheck = Math.min(otherPlayer.segments.length, 8);
            for (let i = 0; i < segmentsToCheck; i++) {
                const segment = otherPlayer.segments[i];
                const distance = Utils.distance(player.x, player.y, segment.x, segment.y);
                
                if (distance < player.size + segment.size - 5) {
                    this.socket.emit('playerDied', { killedBy: otherPlayerId });
                    return;
                }
            }
        }
    }

    updateCamera(player) {
        const targetX = player.x - this.canvas.width / 2;
        const targetY = player.y - this.canvas.height / 2;
        
        this.camera.x = Utils.lerp(this.camera.x, targetX, 0.1);
        this.camera.y = Utils.lerp(this.camera.y, targetY, 0.1);
    }

    render() {
        // Effacer le canvas
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Appliquer l'interpolation
        this.interpolatePlayerMovements();

        this.drawGrid();

        this.ctx.save();
        this.ctx.translate(-this.camera.x, -this.camera.y);

        this.drawVisibleFood();
        this.drawVisiblePlayers();

        this.ctx.restore();

        this.drawUI();
        this.drawMinimap();
    }

    drawGrid() {
        const gridSize = 50;
        const startX = Math.floor(this.camera.x / gridSize) * gridSize;
        const startY = Math.floor(this.camera.y / gridSize) * gridSize;
        
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'; // Plus transparent
        this.ctx.lineWidth = 1;
        
        // Dessiner moins de lignes
        for (let x = startX; x < this.camera.x + this.canvas.width + gridSize; x += gridSize * 2) {
            this.ctx.beginPath();
            this.ctx.moveTo(x - this.camera.x, 0);
            this.ctx.lineTo(x - this.camera.x, this.canvas.height);
            this.ctx.stroke();
        }
        
        for (let y = startY; y < this.camera.y + this.canvas.height + gridSize; y += gridSize * 2) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y - this.camera.y);
            this.ctx.lineTo(this.canvas.width, y - this.camera.y);
            this.ctx.stroke();
        }
    }

    drawVisibleFood() {
        const margin = 50;
        const visibleFood = this.food.filter(food => 
            food.x > this.camera.x - margin &&
            food.x < this.camera.x + this.canvas.width + margin &&
            food.y > this.camera.y - margin &&
            food.y < this.camera.y + this.canvas.height + margin
        );

        for (const food of visibleFood) {
            this.ctx.fillStyle = food.color;
            this.ctx.beginPath();
            this.ctx.arc(food.x, food.y, food.size, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Effet de brillance simplifié
            if (food.value > 1) {
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                this.ctx.lineWidth = 1;
                this.ctx.stroke();
            }
        }
    }

    drawVisiblePlayers() {
        const margin = 100;
        const visiblePlayers = {};
        
        for (const playerId in this.players) {
            const player = this.players[playerId];
            if (player.x > this.camera.x - margin &&
                player.x < this.camera.x + this.canvas.width + margin &&
                player.y > this.camera.y - margin &&
                player.y < this.camera.y + this.canvas.height + margin) {
                visiblePlayers[playerId] = player;
            }
        }

        for (const playerId in visiblePlayers) {
            const player = visiblePlayers[playerId];
            this.drawPlayer(player, playerId === this.playerId);
        }
    }

    drawPlayer(player, isCurrentPlayer) {
        if (player.boosting && isCurrentPlayer) {
            this.ctx.save();
            this.ctx.shadowColor = player.color;
            this.ctx.shadowBlur = 15;
        }

        // Limiter les segments affichés pour optimiser
        const segmentsToRender = Math.min(player.segments.length, 20);
        
        for (let i = segmentsToRender - 1; i >= 0; i--) {
            const segment = player.segments[i];
            const alpha = isCurrentPlayer ? 0.9 : 0.7;
            
            const hsl = Utils.hexToHsl(player.color);
            const lightness = Math.max(20, hsl[2] - i * 1.5);
            
            this.ctx.fillStyle = `hsla(${hsl[0]}, ${hsl[1]}%, ${lightness}%, ${alpha})`;
            this.ctx.beginPath();
            this.ctx.arc(segment.x, segment.y, segment.size, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Contour simplifié
            if (i === 0 || i % 3 === 0) { // Contour seulement sur certains segments
                this.ctx.strokeStyle = isCurrentPlayer ? '#ffffff' : 'rgba(255, 255, 255, 0.3)';
                this.ctx.lineWidth = isCurrentPlayer ? 2 : 1;
                this.ctx.stroke();
            }
        }

        if (player.segments.length > 0) {
            const head = player.segments[0];
            
            this.ctx.fillStyle = player.color;
            this.ctx.beginPath();
            this.ctx.arc(head.x, head.y, head.size + 2, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.strokeStyle = isCurrentPlayer ? '#ffffff' : 'rgba(255, 255, 255, 0.5)';
            this.ctx.lineWidth = isCurrentPlayer ? 3 : 2;
            this.ctx.stroke();
            
            // Yeux simplifiés
            const eyeDistance = head.size * 0.6;
            const eyeSize = head.size * 0.2;
            
            const leftEyeX = head.x + Math.cos(player.angle - 0.5) * eyeDistance;
            const leftEyeY = head.y + Math.sin(player.angle - 0.5) * eyeDistance;
            const rightEyeX = head.x + Math.cos(player.angle + 0.5) * eyeDistance;
            const rightEyeY = head.y + Math.sin(player.angle + 0.5) * eyeDistance;
            
            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(leftEyeX, leftEyeY, eyeSize, 0, Math.PI * 2);
            this.ctx.arc(rightEyeX, rightEyeY, eyeSize, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.fillStyle = '#000000';
            this.ctx.beginPath();
            this.ctx.arc(leftEyeX + Math.cos(player.angle) * eyeSize * 0.5, 
                        leftEyeY + Math.sin(player.angle) * eyeSize * 0.5, eyeSize * 0.5, 0, Math.PI * 2);
            this.ctx.arc(rightEyeX + Math.cos(player.angle) * eyeSize * 0.5, 
                        rightEyeY + Math.sin(player.angle) * eyeSize * 0.5, eyeSize * 0.5, 0, Math.PI * 2);
            this.ctx.fill();
        }

        if (player.boosting && isCurrentPlayer) {
            this.ctx.restore();
        }

        if (!isCurrentPlayer) {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 12px Arial'; // Police plus petite
            this.ctx.textAlign = 'center';
            
            let displayName = player.name;
            if (player.id && player.id.startsWith('bot_')) {
                displayName += ' 🤖';
            }
            
            this.ctx.fillText(displayName, player.x, player.y - player.size - 12);
        }
    }

    drawUI() {
        const player = this.players[this.playerId];
        if (!player) return;

        document.getElementById('currentScore').textContent = Utils.formatNumber(player.score);
        document.getElementById('currentLength').textContent = player.segments.length;
    }

    drawMinimap() {
        const minimapSize = 150;
        const worldScale = minimapSize / this.worldSize;
        
        this.minimapCtx.fillStyle = '#0a0a0a';
        this.minimapCtx.fillRect(0, 0, minimapSize, minimapSize);
        
        // Dessiner seulement les joueurs proches pour optimiser
        const playerList = Object.values(this.players).slice(0, 15); // Limiter à 15 joueurs
        
        for (const player of playerList) {
            const x = player.x * worldScale;
            const y = player.y * worldScale;
            
            if (player.id === this.playerId) {
                this.minimapCtx.fillStyle = '#ffffff';
            } else if (player.id && player.id.startsWith('bot_')) {
                this.minimapCtx.fillStyle = '#888888';
            } else {
                this.minimapCtx.fillStyle = player.color;
            }
            
            this.minimapCtx.beginPath();
            this.minimapCtx.arc(x, y, player.id === this.playerId ? 3 : 2, 0, Math.PI * 2);
            this.minimapCtx.fill();
        }
        
        this.minimapCtx.strokeStyle = '#ffffff';
        this.minimapCtx.lineWidth = 1;
        this.minimapCtx.strokeRect(0, 0, minimapSize, minimapSize);
    }

    updateLeaderboard() {
        const playerList = Object.values(this.players)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8); // Réduire à 8 pour optimiser
        
        const leaderboardHTML = playerList.map((player, index) => {
            const isCurrentPlayer = player.id === this.playerId;
            const isBot = player.id && player.id.startsWith('bot_');
            const medal = index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}.`;
            
            return `
                <div class="flex justify-between items-center ${isCurrentPlayer ? 'bg-yellow-500/20 rounded px-2 py-1' : ''}">
                    <span class="text-xs">
                        ${medal} ${player.name}
                        ${isBot ? '<span class="bot-indicator">🤖</span>' : ''}
                    </span>
                    <span class="text-xs font-bold">${Utils.formatNumber(player.score)}</span>
                </div>
            `;
        }).join('');
        
        document.getElementById('leaderboardList').innerHTML = leaderboardHTML;
    }

    updateScore(newScore) {
        const player = this.players[this.playerId];
        if (!player) return;
        
        player.score = newScore;
        
        if (newScore > this.bestScore) {
            this.bestScore = newScore;
            document.getElementById('bestScore').textContent = Utils.formatNumber(this.bestScore);
        }
    }

    showStatsScreen(stats) {
        this.gameRunning = false;
        this.canvas.style.cursor = 'default';
        
        document.getElementById('statFinalScore').textContent = Utils.formatNumber(stats.finalScore);
        document.getElementById('statFinalLength').textContent = stats.finalLength;
        document.getElementById('statKills').textContent = stats.kills;
        document.getElementById('statGameTime').textContent = this.formatTime(stats.gameTime);
        
        document.getElementById('statBestScore').textContent = Utils.formatNumber(stats.bestScore);
        document.getElementById('statGamesPlayed').textContent = stats.gamesPlayed;
        document.getElementById('statTotalScore').textContent = Utils.formatNumber(stats.totalScore);
        document.getElementById('statTotalKills').textContent = stats.totalKills;
        document.getElementById('statTotalDeaths').textContent = stats.totalDeaths;
        document.getElementById('statTotalTime').textContent = this.formatTime(stats.totalTimePlayed, true);
        
        if (stats.newRecord) {
            document.getElementById('newRecordBanner').classList.remove('hidden');
        }
        
        document.getElementById('statsScreen').classList.remove('hidden');
    }

    formatTime(seconds, showHours = false) {
        if (showHours) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            
            if (hours > 0) {
                return `${hours}h ${minutes}m`;
            } else if (minutes > 0) {
                return `${minutes}m ${secs}s`;
            } else {
                return `${secs}s`;
            }
        } else {
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            
            if (minutes > 0) {
                return `${minutes}m ${secs}s`;
            } else {
                return `${secs}s`;
            }
        }
    }

    respawn() {
        document.getElementById('statsScreen').classList.add('hidden');
        document.getElementById('newRecordBanner').classList.add('hidden');
        this.gameRunning = true;
        this.kills = 0;
        this.gameStartTime = Date.now();
        
        this.canvas.style.cursor = 'crosshair';
        document.getElementById('currentKills').textContent = '0';
        
        this.socket.emit('joinGame', {
            color: this.playerColor
        });
    }

    togglePause() {
        if (!this.gameRunning) return;
        
        this.isPaused = !this.isPaused;
        const pauseScreen = document.getElementById('pauseScreen');
        
        if (this.isPaused) {
            pauseScreen.classList.remove('hidden');
            this.canvas.style.cursor = 'default';
        } else {
            pauseScreen.classList.add('hidden');
            this.canvas.style.cursor = 'crosshair';
        }
    }

    logout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        localStorage.removeItem('playerColor');
        window.location.href = '/';
    }
}

const token = localStorage.getItem('authToken');
if (!token) {
    window.location.href = '/';
} else {
    new SlitherGame();
}
