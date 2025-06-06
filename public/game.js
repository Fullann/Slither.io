 class SlitherGame {
            constructor() {
                this.canvas = document.getElementById('gameCanvas');
                this.ctx = this.canvas.getContext('2d');
                this.socket = io();
                
                this.canvas.width = window.innerWidth;
                this.canvas.height = window.innerHeight;
                
                this.camera = { x: 0, y: 0 };
                this.gameData = {
                    players: [],
                    bots: [],
                    food: [],
                    leaderboard: []
                };
                
                this.playerId = null;
                this.playerScore = 0;
                this.isGameStarted = false;
                this.isBoosting = false;
                
                this.setupEventListeners();
                this.setupSocketEvents();
                this.gameLoop();
            }

            setupEventListeners() {
                // Redimensionnement de la fenêtre
                window.addEventListener('resize', () => {
                    this.canvas.width = window.innerWidth;
                    this.canvas.height = window.innerHeight;
                });

                // Mouvement de la souris
                this.canvas.addEventListener('mousemove', (e) => {
                    if (!this.isGameStarted) return;
                    
                    const player = this.getCurrentPlayer();
                    if (!player) return;

                    const rect = this.canvas.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;
                    
                    const worldMouseX = mouseX + this.camera.x;
                    const worldMouseY = mouseY + this.camera.y;
                    
                    const angle = Math.atan2(worldMouseY - player.y, worldMouseX - player.x);
                    this.socket.emit('updateDirection', angle);
                });

                // Boost avec clic souris
                this.canvas.addEventListener('mousedown', (e) => {
                    if (!this.isGameStarted) return;
                    e.preventDefault();
                    
                    const player = this.getCurrentPlayer();
                    if (player && player.alive && player.length > 5) {
                        this.isBoosting = true;
                        this.socket.emit('startBoost');
                    }
                });

                this.canvas.addEventListener('mouseup', (e) => {
                    if (!this.isGameStarted) return;
                    e.preventDefault();
                    
                    if (this.isBoosting) {
                        this.isBoosting = false;
                        this.socket.emit('stopBoost');
                    }
                });

                // Boost avec espace (alternative)
                document.addEventListener('keydown', (e) => {
                    if (e.code === 'Space' && this.isGameStarted && !this.isBoosting) {
                        e.preventDefault();
                        const player = this.getCurrentPlayer();
                        if (player && player.alive && player.length > 5) {
                            this.isBoosting = true;
                            this.socket.emit('startBoost');
                        }
                    }
                });

                document.addEventListener('keyup', (e) => {
                    if (e.code === 'Space' && this.isGameStarted && this.isBoosting) {
                        e.preventDefault();
                        this.isBoosting = false;
                        this.socket.emit('stopBoost');
                    }
                });

                // Bouton de démarrage
                document.getElementById('startButton').addEventListener('click', () => {
                    const playerName = document.getElementById('playerNameInput').value.trim() || 'Joueur';
                    this.startGame(playerName);
                });

                // Bouton de respawn
                document.getElementById('respawnButton').addEventListener('click', () => {
                    const playerName = document.getElementById('playerNameInput').value.trim() || 'Joueur';
                    this.startGame(playerName);
                });

                // Entrée pour démarrer
                document.getElementById('playerNameInput').addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        const playerName = e.target.value.trim() || 'Joueur';
                        this.startGame(playerName);
                    }
                });
            }

            setupSocketEvents() {
                this.socket.on('gameJoined', (data) => {
                    this.playerId = data.playerId;
                    this.worldSize = data.worldSize;
                    this.isGameStarted = true;
                    document.getElementById('startScreen').style.display = 'none';
                    document.getElementById('deathScreen').style.display = 'none';
                });

                this.socket.on('gameUpdate', (data) => {
                    this.gameData = data;
                    this.updateUI();
                });

                this.socket.on('disconnect', () => {
                    this.isGameStarted = false;
                    document.getElementById('startScreen').style.display = 'flex';
                });
            }

            startGame(playerName) {
                this.socket.emit('joinGame', playerName);
            }

            getCurrentPlayer() {
                return this.gameData.players.find(p => p.id === this.playerId);
            }

            updateCamera() {
                const player = this.getCurrentPlayer();
                if (!player) return;

                // Suivre le joueur avec la caméra
                this.camera.x = player.x - this.canvas.width / 2;
                this.camera.y = player.y - this.canvas.height / 2;

                // Limiter la caméra aux bords du monde
                if (this.worldSize) {
                    this.camera.x = Math.max(0, Math.min(this.camera.x, this.worldSize.width - this.canvas.width));
                    this.camera.y = Math.max(0, Math.min(this.camera.y, this.worldSize.height - this.canvas.height));
                }
            }

            drawGrid() {
                const gridSize = 50;
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                this.ctx.lineWidth = 1;

                const startX = Math.floor(this.camera.x / gridSize) * gridSize;
                const startY = Math.floor(this.camera.y / gridSize) * gridSize;

                for (let x = startX; x < this.camera.x + this.canvas.width; x += gridSize) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(x - this.camera.x, 0);
                    this.ctx.lineTo(x - this.camera.x, this.canvas.height);
                    this.ctx.stroke();
                }

                for (let y = startY; y < this.camera.y + this.canvas.height; y += gridSize) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(0, y - this.camera.y);
                    this.ctx.lineTo(this.canvas.width, y - this.camera.y);
                    this.ctx.stroke();
                }
            }

            drawFood() {
                this.gameData.food.forEach(food => {
                    const screenX = food.x - this.camera.x;
                    const screenY = food.y - this.camera.y;

                    if (screenX > -20 && screenX < this.canvas.width + 20 &&
                        screenY > -20 && screenY < this.canvas.height + 20) {
                        
                        this.ctx.fillStyle = food.color;
                        this.ctx.beginPath();
                        this.ctx.arc(screenX, screenY, 8, 0, Math.PI * 2);
                        this.ctx.fill();
                        
                        // Effet de brillance
                        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                        this.ctx.beginPath();
                        this.ctx.arc(screenX - 2, screenY - 2, 3, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                });
            }

            drawSnake(snake) {
                const screenX = snake.x - this.camera.x;
                const screenY = snake.y - this.camera.y;

                // Dessiner les segments
                snake.segments.forEach((segment, index) => {
                    const segScreenX = segment.x - this.camera.x;
                    const segScreenY = segment.y - this.camera.y;
                    
                    if (segScreenX > -30 && segScreenX < this.canvas.width + 30 &&
                        segScreenY > -30 && segScreenY < this.canvas.height + 30) {
                        
                        const size = segment.size || (12 - index * 0.5);
                        
                        // Ombre
                        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                        this.ctx.beginPath();
                        this.ctx.arc(segScreenX + 2, segScreenY + 2, size, 0, Math.PI * 2);
                        this.ctx.fill();
                        
                        // Corps
                        this.ctx.fillStyle = snake.color;
                        this.ctx.beginPath();
                        this.ctx.arc(segScreenX, segScreenY, size, 0, Math.PI * 2);
                        this.ctx.fill();
                        
                        // Contour
                        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                        this.ctx.lineWidth = 2;
                        this.ctx.stroke();
                    }
                });

                // Dessiner la tête
                if (screenX > -30 && screenX < this.canvas.width + 30 &&
                    screenY > -30 && screenY < this.canvas.height + 30) {
                    
                    // Tête avec effet de boost
                    let headColor = snake.color;
                    let headSize = 15;
                    
                    if (snake.boosting) {
                        // Effet visuel de boost
                        headColor = '#ff6b6b';
                        headSize = 18;
                        
                        // Particules de boost
                        this.ctx.fillStyle = 'rgba(255, 107, 107, 0.6)';
                        for (let i = 0; i < 5; i++) {
                            const particleX = screenX - Math.cos(snake.angle) * (20 + i * 5) + (Math.random() - 0.5) * 10;
                            const particleY = screenY - Math.sin(snake.angle) * (20 + i * 5) + (Math.random() - 0.5) * 10;
                            this.ctx.beginPath();
                            this.ctx.arc(particleX, particleY, 3 - i * 0.5, 0, Math.PI * 2);
                            this.ctx.fill();
                        }
                    }
                    
                    // Ombre de la tête
                    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                    this.ctx.beginPath();
                    this.ctx.arc(screenX + 2, screenY + 2, headSize, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // Tête
                    this.ctx.fillStyle = headColor;
                    this.ctx.beginPath();
                    this.ctx.arc(screenX, screenY, headSize, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // Contour de la tête
                    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
                    this.ctx.lineWidth = 3;
                    this.ctx.stroke();
                    
                    // Yeux
                    const eyeOffsetX = Math.cos(snake.angle) * 8;
                    const eyeOffsetY = Math.sin(snake.angle) * 8;
                    const eyePerpX = Math.cos(snake.angle + Math.PI / 2) * 4;
                    const eyePerpY = Math.sin(snake.angle + Math.PI / 2) * 4;
                    
                    this.ctx.fillStyle = 'white';
                    this.ctx.beginPath();
                    this.ctx.arc(screenX + eyeOffsetX + eyePerpX, screenY + eyeOffsetY + eyePerpY, 3, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.beginPath();
                    this.ctx.arc(screenX + eyeOffsetX - eyePerpX, screenY + eyeOffsetY - eyePerpY, 3, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    this.ctx.fillStyle = 'black';
                    this.ctx.beginPath();
                    this.ctx.arc(screenX + eyeOffsetX + eyePerpX + 1, screenY + eyeOffsetY + eyePerpY + 1, 1.5, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.beginPath();
                    this.ctx.arc(screenX + eyeOffsetX - eyePerpX + 1, screenY + eyeOffsetY - eyePerpY + 1, 1.5, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // Nom du joueur
                    if (snake.name) {
                        this.ctx.fillStyle = 'white';
                        this.ctx.font = 'bold 14px Arial';
                        this.ctx.textAlign = 'center';
                        this.ctx.fillText(snake.name, screenX, screenY - 25);
                        
                        if (snake.isBot) {
                            this.ctx.fillStyle = '#ff6b6b';
                            this.ctx.font = '10px Arial';
                            this.ctx.fillText('BOT', screenX, screenY - 10);
                        }
                    }
                }
            }

            drawSnakes() {
                // Dessiner d'abord les autres serpents
                [...this.gameData.players, ...this.gameData.bots].forEach(snake => {
                    if (snake.id !== this.playerId && snake.alive) {
                        this.drawSnake(snake);
                    }
                });

                // Dessiner le joueur en dernier (au-dessus)
                const player = this.getCurrentPlayer();
                if (player && player.alive) {
                    this.drawSnake(player);
                }
            }

            updateUI() {
                const player = this.getCurrentPlayer();
                if (player) {
                    this.playerScore = player.score;
                    document.getElementById('score').innerHTML = `
                        Score: ${this.playerScore}<br>
                        <span style="font-size: 0.6em;">Longueur: ${Math.floor(player.length || 3)}</span>
                        ${player.boosting ? '<br><span style="color: #ff6b6b; font-size: 0.5em;">🚀 BOOST!</span>' : ''}
                        ${player.length <= 5 ? '<br><span style="color: #ffa502; font-size: 0.4em;">Mangez pour débloquer le boost!</span>' : ''}
                    `;
                    
                    if (!player.alive) {
                        this.showDeathScreen();
                    }
                } else if (this.isGameStarted) {
                    this.showDeathScreen();
                }

                // Mettre à jour le classement
                this.updateLeaderboard();
            }

            updateLeaderboard() {
                const leaderboardList = document.getElementById('leaderboardList');
                leaderboardList.innerHTML = '';

                this.gameData.leaderboard.forEach((entry, index) => {
                    const item = document.createElement('div');
                    item.className = 'leaderboard-item';
                    
                    const name = document.createElement('span');
                    name.textContent = `${index + 1}. ${entry.name}`;
                    if (entry.isBot) {
                        name.innerHTML += ' <span class="bot-indicator">BOT</span>';
                    }
                    
                    const score = document.createElement('span');
                    score.textContent = entry.score;
                    
                    item.appendChild(name);
                    item.appendChild(score);
                    leaderboardList.appendChild(item);
                });
            }

            showDeathScreen() {
                this.isGameStarted = false;
                document.getElementById('finalScore').textContent = `Score: ${this.playerScore}`;
                document.getElementById('deathScreen').style.display = 'flex';
            }

            render() {
                // Effacer le canvas
                this.ctx.fillStyle = '#0a1a2e';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

                if (!this.isGameStarted) return;

                // Mettre à jour la caméra
                this.updateCamera();

                // Dessiner la grille
                this.drawGrid();

                // Dessiner la nourriture
                this.drawFood();

                // Dessiner les serpents
                this.drawSnakes();

                // Dessiner les bordures du monde
                if (this.worldSize) {
                    this.ctx.strokeStyle = '#ff4757';
                    this.ctx.lineWidth = 5;
                    this.ctx.strokeRect(
                        -this.camera.x,
                        -this.camera.y,
                        this.worldSize.width,
                        this.worldSize.height
                    );
                }
            }

            gameLoop() {
                this.render();
                requestAnimationFrame(() => this.gameLoop());
            }
        }

        // Démarrer le jeu
        window.addEventListener('load', () => {
            new SlitherGame();
        });