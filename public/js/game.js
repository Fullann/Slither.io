// public/js/game.js
class SlitherGame {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.minimap = document.getElementById("minimap");
    this.minimapCtx = this.minimap.getContext("2d");

    this.setupCanvas();
    this.initializeGame();
    this.setupEventListeners();
    this.connectToServer();

    this.gameLoop();
  }

  setupCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // Afficher le curseur
    this.canvas.style.cursor = "crosshair";

    window.addEventListener("resize", () => {
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

    // Récupérer les données utilisateur
    const userData = JSON.parse(localStorage.getItem("userData") || "{}");
    this.playerName = userData.username || "Joueur";
    this.playerColor = localStorage.getItem("playerColor") || "#ef4444";
    this.bestScore = userData.bestScore || 0;

    // Afficher les informations utilisateur
    document.getElementById("playerName").textContent = this.playerName;
    document.getElementById("bestScore").textContent = Utils.formatNumber(
      this.bestScore
    );
    document.getElementById("currentKills").textContent = "0";
  }

  setupEventListeners() {
    // Mouvement de la souris
    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
    });

    // Clic pour accélérer
    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0 && this.gameRunning && !this.isPaused) {
        this.boosting = true;
        document.getElementById("boostIndicator").classList.remove("hidden");
        document.getElementById("boostIndicator").classList.add("boost-effect");
      }
    });

    this.canvas.addEventListener("mouseup", (e) => {
      if (e.button === 0) {
        this.boosting = false;
        document.getElementById("boostIndicator").classList.add("hidden");
      }
    });

    // Empêcher le menu contextuel
    this.canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    // Clavier
    document.addEventListener("keydown", (e) => {
      this.keys[e.code] = true;

      if (e.code === "Space") {
        e.preventDefault();
        this.togglePause();
      }
    });

    document.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
    });

    // Boutons de l'interface
    document.getElementById("playAgainBtn").addEventListener("click", () => {
      this.respawn();
    });

    document.getElementById("backToMenuBtn").addEventListener("click", () => {
      this.logout();
    });

    document.getElementById("logoutBtn").addEventListener("click", () => {
      this.logout();
    });
  }

  connectToServer() {
    const token = localStorage.getItem("authToken");
    if (!token) {
      window.location.href = "/";
      return;
    }

    this.socket = io({
      auth: { token: token },
      compression: false,
      transports: ["polling", "websocket"],
    });

    this.latency = 0;
    setInterval(() => {
      const start = Date.now();
      this.socket.emit("ping", () => {
        this.latency = Date.now() - start;
        // Optionnel : afficher dans la console
        console.log("Latence:", this.latency, "ms");
        // Mettre à jour l’affichage
        document.getElementById("latencyIndicator").textContent =
          this.latency + " ms";
      });
    }, 1000);

    this.socket.on("connect", () => {
      console.log("Connecté au serveur");
      this.socket.emit("joinGame", {
        color: this.playerColor,
      });
    });

    this.socket.on("connect_error", (error) => {
      console.error("Erreur de connexion:", error.message);
      if (
        error.message === "Token invalide" ||
        error.message === "Token manquant"
      ) {
        this.logout();
      }
    });

    this.socket.on("gameState", (state) => {
      this.players = state.players;
      this.food = state.food;
      this.playerId = state.playerId;
    });

    this.socket.on("playerJoined", (player) => {
      this.players[player.id] = player;
    });

    this.socket.on("playerMoved", (data) => {
      if (this.players[data.id]) {
        // Si c'est la première fois, initialise displayX/Y
        if (this.players[data.id].displayX === undefined) {
          this.players[data.id].displayX = data.x;
          this.players[data.id].displayY = data.y;
        }
        // Toujours mettre à jour la cible
        this.players[data.id].targetX = data.x;
        this.players[data.id].targetY = data.y;
        this.players[data.id].angle = data.angle;
        this.players[data.id].segments = data.segments;
        this.players[data.id].speed = data.speed;
        this.players[data.id].boosting = data.boosting;
      }
    });

    this.socket.on("playerLeft", (playerId) => {
      delete this.players[playerId];
    });

    this.socket.on("foodEaten", (data) => {
      this.food = this.food.filter((f) => f.id !== data.foodId);
      this.food.push(data.newFood);

      if (data.playerId === this.playerId) {
        this.updateScore(data.newScore);
      }
    });

    this.socket.on("boostParticle", (particle) => {
      this.food.push(particle);
    });

    this.socket.on("playerDied", (data) => {
      if (data.playerId === this.playerId) {
        // Ne pas afficher l'écran de mort ici, attendre les stats
      } else {
        delete this.players[data.playerId];
        this.food = data.newFood;

        // Incrémenter les kills si c'est nous qui avons tué
        const player = this.players[this.playerId];
        if (player) {
          this.kills++;
          player.kills = this.kills;
          document.getElementById("currentKills").textContent = this.kills;
        }
      }
    });

    this.socket.on("gameStats", (stats) => {
      this.showStatsScreen(stats);
    });

    this.socket.on("gameUpdate", (state) => {
      // Mettre à jour avec tous les joueurs (humains + bots)
      this.players = state.players;
      this.updateLeaderboard();
    });
  }

  gameLoop() {
    if (this.gameRunning && !this.isPaused) {
      this.update();
    }
    this.render();
    requestAnimationFrame(() => this.gameLoop());
  }

  update() {
    const player = this.players[this.playerId];
    if (!player) return;

    // Calculer l'angle vers la souris
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const targetAngle = Utils.angle(
      centerX,
      centerY,
      this.mouse.x,
      this.mouse.y
    );

    // Mouvement fluide de la direction
    let angleDiff = targetAngle - player.angle;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    player.angle += angleDiff * 0.1;

    // Vitesse (boost si clic maintenu)
    const baseSpeed = 3;
    const boostSpeed = 6;
    player.speed = this.boosting ? boostSpeed : baseSpeed;
    player.boosting = this.boosting;

    // Déplacement
    player.x += Math.cos(player.angle) * player.speed;
    player.y += Math.sin(player.angle) * player.speed;

    // Limites du monde
    player.x = Utils.clamp(player.x, 50, this.worldSize - 50);
    player.y = Utils.clamp(player.y, 50, this.worldSize - 50);

    // Mise à jour des segments
    this.updateSegments(player);

    // Vérification des collisions avec la nourriture
    this.checkFoodCollisions(player);

    // Vérification des collisions avec les autres joueurs
    this.checkPlayerCollisions(player);

    // Mise à jour de la caméra
    this.updateCamera(player);

    // === INTERPOLATION DES AUTRES JOUEURS ===
    for (const id in this.players) {
      if (id === this.playerId) continue; // Ne pas interpoler soi-même
      const p = this.players[id];

      // Initialisation si nécessaire
      if (p.displayX === undefined) p.displayX = p.x;
      if (p.displayY === undefined) p.displayY = p.y;

      // Utiliser targetX/targetY si tu les mets à jour à la réception du serveur,
      // sinon interpoler directement vers p.x/p.y (le plus simple ici)
      const targetX = p.targetX !== undefined ? p.targetX : p.x;
      const targetY = p.targetY !== undefined ? p.targetY : p.y;

      p.displayX += (targetX - p.displayX) * 0.2;
      p.displayY += (targetY - p.displayY) * 0.2;
    }

    // Envoyer la position au serveur
    this.socket.emit("updatePosition", {
      x: player.x,
      y: player.y,
      angle: player.angle,
      segments: player.segments,
      speed: player.speed,
      boosting: this.boosting,
    });
  }

  updateSegments(player) {
    const segmentDistance = 8;

    // Ajouter un nouveau segment en tête
    player.segments.unshift({
      x: player.x,
      y: player.y,
      size: player.size,
    });

    // Ajuster les positions des segments
    for (let i = 1; i < player.segments.length; i++) {
      const prevSegment = player.segments[i - 1];
      const currentSegment = player.segments[i];

      const distance = Utils.distance(
        prevSegment.x,
        prevSegment.y,
        currentSegment.x,
        currentSegment.y
      );

      if (distance > segmentDistance) {
        const angle = Utils.angle(
          currentSegment.x,
          currentSegment.y,
          prevSegment.x,
          prevSegment.y
        );
        currentSegment.x = prevSegment.x - Math.cos(angle) * segmentDistance;
        currentSegment.y = prevSegment.y - Math.sin(angle) * segmentDistance;
      }
    }

    // Maintenir la longueur appropriée
    const targetLength = Math.max(5, Math.floor(player.score / 5) + 5);
    while (player.segments.length > targetLength) {
      player.segments.pop();
    }
  }

  checkFoodCollisions(player) {
    for (let i = this.food.length - 1; i >= 0; i--) {
      const food = this.food[i];
      const distance = Utils.distance(player.x, player.y, food.x, food.y);

      if (distance < player.size + food.size) {
        this.socket.emit("eatFood", { foodId: food.id });
        break;
      }
    }
  }

  checkPlayerCollisions(player) {
    for (const otherPlayerId in this.players) {
      if (otherPlayerId === this.playerId) continue;

      const otherPlayer = this.players[otherPlayerId];

      // Vérifier collision avec les segments de l'autre joueur
      for (const segment of otherPlayer.segments) {
        const distance = Utils.distance(
          player.x,
          player.y,
          segment.x,
          segment.y
        );

        if (distance < player.size + segment.size - 5) {
          this.socket.emit("playerDied", { killedBy: otherPlayerId });
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
    this.ctx.fillStyle = "#1a1a2e";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Dessiner la grille
    this.drawGrid();

    // Sauvegarder le contexte pour les transformations de caméra
    this.ctx.save();
    this.ctx.translate(-this.camera.x, -this.camera.y);

    // Dessiner la nourriture
    this.drawFood();

    // Dessiner les joueurs
    this.drawPlayers();

    // Restaurer le contexte
    this.ctx.restore();

    // Dessiner l'interface
    this.drawUI();

    // Dessiner la mini-carte
    this.drawMinimap();
  }

  drawGrid() {
    const gridSize = 50;
    const startX = Math.floor(this.camera.x / gridSize) * gridSize;
    const startY = Math.floor(this.camera.y / gridSize) * gridSize;

    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    this.ctx.lineWidth = 1;

    for (
      let x = startX;
      x < this.camera.x + this.canvas.width + gridSize;
      x += gridSize
    ) {
      this.ctx.beginPath();
      this.ctx.moveTo(x - this.camera.x, 0);
      this.ctx.lineTo(x - this.camera.x, this.canvas.height);
      this.ctx.stroke();
    }

    for (
      let y = startY;
      y < this.camera.y + this.canvas.height + gridSize;
      y += gridSize
    ) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y - this.camera.y);
      this.ctx.lineTo(this.canvas.width, y - this.camera.y);
      this.ctx.stroke();
    }
  }

  drawFood() {
    for (const food of this.food) {
      // Culling - ne dessiner que la nourriture visible
      if (
        food.x < this.camera.x - 50 ||
        food.x > this.camera.x + this.canvas.width + 50 ||
        food.y < this.camera.y - 50 ||
        food.y > this.camera.y + this.canvas.height + 50
      ) {
        continue;
      }

      this.ctx.fillStyle = food.color;
      this.ctx.beginPath();
      this.ctx.arc(food.x, food.y, food.size, 0, Math.PI * 2);
      this.ctx.fill();

      // Effet de brillance
      this.ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      this.ctx.beginPath();
      this.ctx.arc(
        food.x - food.size * 0.3,
        food.y - food.size * 0.3,
        food.size * 0.4,
        0,
        Math.PI * 2
      );
      this.ctx.fill();

      // Particules de boost plus visibles
      if (food.value > 1) {
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      }
    }
  }

  drawPlayers() {
    for (const playerId in this.players) {
      const player = this.players[playerId];
      this.drawPlayer(player, playerId === this.playerId);
    }
  }

  drawPlayer(player, isCurrentPlayer) {
    // Effet de boost
    if (player.boosting) {
      this.ctx.save();
      this.ctx.shadowColor = player.color;
      this.ctx.shadowBlur = 20;
    }

    // Dessiner les segments du corps
    for (let i = player.segments.length - 1; i >= 0; i--) {
      const segment = player.segments[i];
      const alpha = isCurrentPlayer ? 0.9 : 0.7;

      // Couleur du segment avec dégradé
      const hsl = Utils.hexToHsl(player.color);
      const lightness = Math.max(20, hsl[2] - i * 2);

      this.ctx.fillStyle = `hsla(${hsl[0]}, ${hsl[1]}%, ${lightness}%, ${alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(segment.x, segment.y, segment.size, 0, Math.PI * 2);
      this.ctx.fill();

      // Contour
      this.ctx.strokeStyle = isCurrentPlayer
        ? "#ffffff"
        : "rgba(255, 255, 255, 0.3)";
      this.ctx.lineWidth = isCurrentPlayer ? 2 : 1;
      this.ctx.stroke();
    }

    // Dessiner la tête (premier segment)
    if (player.segments.length > 0) {
      const head = player.segments[0];

      // Tête principale
      this.ctx.fillStyle = player.color;
      this.ctx.beginPath();
      this.ctx.arc(head.x, head.y, head.size + 2, 0, Math.PI * 2);
      this.ctx.fill();

      // Contour de la tête
      this.ctx.strokeStyle = isCurrentPlayer
        ? "#ffffff"
        : "rgba(255, 255, 255, 0.5)";
      this.ctx.lineWidth = isCurrentPlayer ? 3 : 2;
      this.ctx.stroke();

      // Yeux
      const eyeDistance = head.size * 0.6;
      const eyeSize = head.size * 0.2;

      const leftEyeX = head.x + Math.cos(player.angle - 0.5) * eyeDistance;
      const leftEyeY = head.y + Math.sin(player.angle - 0.5) * eyeDistance;
      const rightEyeX = head.x + Math.cos(player.angle + 0.5) * eyeDistance;
      const rightEyeY = head.y + Math.sin(player.angle + 0.5) * eyeDistance;

      this.ctx.fillStyle = "#ffffff";
      this.ctx.beginPath();
      this.ctx.arc(leftEyeX, leftEyeY, eyeSize, 0, Math.PI * 2);
      this.ctx.arc(rightEyeX, rightEyeY, eyeSize, 0, Math.PI * 2);
      this.ctx.fill();

      // Pupilles
      this.ctx.fillStyle = "#000000";
      this.ctx.beginPath();
      this.ctx.arc(
        leftEyeX + Math.cos(player.angle) * eyeSize * 0.5,
        leftEyeY + Math.sin(player.angle) * eyeSize * 0.5,
        eyeSize * 0.5,
        0,
        Math.PI * 2
      );
      this.ctx.arc(
        rightEyeX + Math.cos(player.angle) * eyeSize * 0.5,
        rightEyeY + Math.sin(player.angle) * eyeSize * 0.5,
        eyeSize * 0.5,
        0,
        Math.PI * 2
      );
      this.ctx.fill();
    }

    if (player.boosting) {
      this.ctx.restore();
    }

    // Nom du joueur avec indicateur bot
    if (!isCurrentPlayer) {
      this.ctx.fillStyle = "#ffffff";
      this.ctx.font = "bold 14px Arial";
      this.ctx.textAlign = "center";

      let displayName = player.name;
      if (player.id && player.id.startsWith("bot_")) {
        displayName += " 🤖";
      }

      this.ctx.fillText(displayName, player.x, player.y - player.size - 15);
    }
  }

  drawUI() {
    const player = this.players[this.playerId];
    if (!player) return;

    // Mettre à jour le score
    document.getElementById("currentScore").textContent = Utils.formatNumber(
      player.score
    );
    document.getElementById("currentLength").textContent =
      player.segments.length;
  }

  drawMinimap() {
    const minimapSize = 150;
    const worldScale = minimapSize / this.worldSize;

    // Effacer la mini-carte
    this.minimapCtx.fillStyle = "#0a0a0a";
    this.minimapCtx.fillRect(0, 0, minimapSize, minimapSize);

    // Dessiner les joueurs sur la mini-carte
    for (const playerId in this.players) {
      const player = this.players[playerId];
      const x = player.x * worldScale;
      const y = player.y * worldScale;

      // Différencier les bots
      if (playerId === this.playerId) {
        this.minimapCtx.fillStyle = "#ffffff";
      } else if (playerId.startsWith("bot_")) {
        this.minimapCtx.fillStyle = "#888888";
      } else {
        this.minimapCtx.fillStyle = player.color;
      }

      this.minimapCtx.beginPath();
      this.minimapCtx.arc(
        x,
        y,
        playerId === this.playerId ? 3 : 2,
        0,
        Math.PI * 2
      );
      this.minimapCtx.fill();

      // Effet de boost sur la minimap
      if (player.boosting) {
        this.minimapCtx.strokeStyle = "#ffff00";
        this.minimapCtx.lineWidth = 1;
        this.minimapCtx.stroke();
      }
    }

    // Dessiner les limites du monde
    this.minimapCtx.strokeStyle = "#ffffff";
    this.minimapCtx.lineWidth = 1;
    this.minimapCtx.strokeRect(0, 0, minimapSize, minimapSize);
  }

  updateLeaderboard() {
    const playerList = Object.values(this.players)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const leaderboardHTML = playerList
      .map((player, index) => {
        const isCurrentPlayer = player.id === this.playerId;
        const isBot = player.id && player.id.startsWith("bot_");
        const medal = index < 3 ? ["🥇", "🥈", "🥉"][index] : `${index + 1}.`;

        return `
                <div class="flex justify-between items-center ${
                  isCurrentPlayer ? "bg-yellow-500/20 rounded px-2 py-1" : ""
                }">
                    <span class="text-xs">
                        ${medal} ${player.name}
                        ${isBot ? '<span class="bot-indicator">🤖</span>' : ""}
                    </span>
                    <span class="text-xs font-bold">${Utils.formatNumber(
                      player.score
                    )}</span>
                </div>
            `;
      })
      .join("");

    document.getElementById("leaderboardList").innerHTML = leaderboardHTML;
  }

  updateScore(newScore) {
    const player = this.players[this.playerId];
    if (!player) return;

    player.score = newScore;

    // Vérifier nouveau record
    if (newScore > this.bestScore) {
      this.bestScore = newScore;
      document.getElementById("bestScore").textContent = Utils.formatNumber(
        this.bestScore
      );
    }
  }

  showStatsScreen(stats) {
    this.gameRunning = false;

    // Remettre le curseur normal
    this.canvas.style.cursor = "default";

    // Remplir les statistiques de la partie
    document.getElementById("statFinalScore").textContent = Utils.formatNumber(
      stats.finalScore
    );
    document.getElementById("statFinalLength").textContent = stats.finalLength;
    document.getElementById("statKills").textContent = stats.kills;
    document.getElementById("statGameTime").textContent = this.formatTime(
      stats.gameTime
    );

    // Remplir les statistiques globales
    document.getElementById("statBestScore").textContent = Utils.formatNumber(
      stats.bestScore
    );
    document.getElementById("statGamesPlayed").textContent = stats.gamesPlayed;
    document.getElementById("statTotalScore").textContent = Utils.formatNumber(
      stats.totalScore
    );
    document.getElementById("statTotalKills").textContent = stats.totalKills;
    document.getElementById("statTotalDeaths").textContent = stats.totalDeaths;
    document.getElementById("statTotalTime").textContent = this.formatTime(
      stats.totalTimePlayed,
      true
    );

    // Afficher le banner de nouveau record si applicable
    if (stats.newRecord) {
      document.getElementById("newRecordBanner").classList.remove("hidden");
    }

    // Afficher l'écran de statistiques
    document.getElementById("statsScreen").classList.remove("hidden");
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
    document.getElementById("statsScreen").classList.add("hidden");
    document.getElementById("newRecordBanner").classList.add("hidden");
    this.gameRunning = true;
    this.kills = 0;
    this.gameStartTime = Date.now();

    // Remettre le curseur de jeu
    this.canvas.style.cursor = "crosshair";

    // Réinitialiser les compteurs
    document.getElementById("currentKills").textContent = "0";

    this.socket.emit("joinGame", {
      color: this.playerColor,
    });
  }

  togglePause() {
    if (!this.gameRunning) return;

    this.isPaused = !this.isPaused;
    const pauseScreen = document.getElementById("pauseScreen");

    if (this.isPaused) {
      pauseScreen.classList.remove("hidden");
      this.canvas.style.cursor = "default";
    } else {
      pauseScreen.classList.add("hidden");
      this.canvas.style.cursor = "crosshair";
    }
  }

  logout() {
    localStorage.removeItem("authToken");
    localStorage.removeItem("userData");
    localStorage.removeItem("playerColor");
    window.location.href = "/";
  }
}

// Vérifier l'authentification
const token = localStorage.getItem("authToken");
if (!token) {
  window.location.href = "/";
} else {
  // Initialiser le jeu
  new SlitherGame();
}
