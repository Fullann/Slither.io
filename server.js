// server.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = "secret_key";

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Base de données SQLite
const db = new sqlite3.Database("game.db");

// Initialiser la base de données
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        best_score INTEGER DEFAULT 0,
        games_played INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        total_kills INTEGER DEFAULT 0,
        total_deaths INTEGER DEFAULT 0,
        total_time_played INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Variables de jeu
let players = {};
let bots = {};
let food = [];
let gameState = {
  players: {},
  food: [],
};
const TICK_RATE = 30; // 30 FPS
const TICK_INTERVAL = 1000 / TICK_RATE;
const MANAGE_BOT = 10000; // Gérer les bots toutes les 10 secondes
const MIN_PLAYERS = 8; // Minimum de joueurs (humains + bots)
const BOT_NAMES = [
  "Alpha",
  "Beta",
  "Gamma",
  "Delta",
  "Epsilon",
  "Zeta",
  "Eta",
  "Theta",
  "Iota",
  "Kappa",
  "Lambda",
  "Mu",
  "Nu",
  "Xi",
  "Omicron",
  "Pi",
  "Rho",
  "Sigma",
  "Tau",
  "Upsilon",
  "Phi",
  "Chi",
  "Psi",
  "Omega",
  "Viper",
  "Cobra",
  "Python",
  "Anaconda",
  "Mamba",
  "Boa",
  "Adder",
];

// Classe Bot IA
class Bot {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.x = Math.random() * 2000 + 1000;
    this.y = Math.random() * 2000 + 1000;
    this.segments = [];
    this.angle = Math.random() * Math.PI * 2;
    this.speed = 3;
    this.size = 10;
    this.score = 0;
    this.color = `hsl(${Math.random() * 360}, 70%, 60%)`;
    this.boosting = false;
    this.target = null;
    this.lastDirectionChange = Date.now();
    this.aggressiveness = Math.random() * 0.5 + 0.3; // 0.3 à 0.8
    this.fearDistance = 100 + Math.random() * 100; // Distance de fuite

    // Initialiser les segments
    for (let i = 0; i < 5; i++) {
      this.segments.push({
        x: this.x - i * 8,
        y: this.y,
        size: this.size - i * 0.5,
      });
    }
  }

  update() {
    // Trouver la nourriture la plus proche
    let closestFood = null;
    let closestFoodDistance = Infinity;

    for (const foodItem of food) {
      const distance = this.distanceTo(foodItem.x, foodItem.y);
      if (distance < closestFoodDistance) {
        closestFoodDistance = distance;
        closestFood = foodItem;
      }
    }

    // Vérifier les dangers (autres serpents)
    let danger = null;
    let closestDangerDistance = Infinity;

    const allPlayers = { ...players, ...bots };
    for (const playerId in allPlayers) {
      if (playerId === this.id) continue;

      const otherPlayer = allPlayers[playerId];
      const distance = this.distanceTo(otherPlayer.x, otherPlayer.y);

      // Si l'autre serpent est plus gros et proche, c'est un danger
      if (
        otherPlayer.segments.length > this.segments.length &&
        distance < this.fearDistance
      ) {
        if (distance < closestDangerDistance) {
          closestDangerDistance = distance;
          danger = otherPlayer;
        }
      }
    }

    // Logique de décision
    if (danger && closestDangerDistance < 80) {
      // Fuir le danger
      this.angle = this.angleTo(danger.x, danger.y) + Math.PI; // Direction opposée
      this.boosting = Math.random() < 0.7; // 70% de chance de booster en fuyant
    } else if (closestFood && closestFoodDistance < 150) {
      // Aller vers la nourriture
      this.angle = this.angleTo(closestFood.x, closestFood.y);
      this.boosting = false;
    } else {
      // Mouvement aléatoire
      if (Date.now() - this.lastDirectionChange > 2000 + Math.random() * 3000) {
        this.angle += (Math.random() - 0.5) * 0.8;
        this.lastDirectionChange = Date.now();
      }
      this.boosting = Math.random() < 0.1; // 10% de chance de booster aléatoirement
    }

    // Chercher des proies (serpents plus petits)
    if (this.segments.length > 10 && Math.random() < this.aggressiveness) {
      for (const playerId in allPlayers) {
        if (playerId === this.id) continue;

        const otherPlayer = allPlayers[playerId];
        const distance = this.distanceTo(otherPlayer.x, otherPlayer.y);

        if (
          otherPlayer.segments.length < this.segments.length * 0.7 &&
          distance < 200
        ) {
          this.angle = this.angleTo(otherPlayer.x, otherPlayer.y);
          this.boosting = distance > 50;
          break;
        }
      }
    }

    // Vitesse
    this.speed = this.boosting ? 6 : 3;

    // Déplacement
    this.x += Math.cos(this.angle) * this.speed;
    this.y += Math.sin(this.angle) * this.speed;

    // Limites du monde
    this.x = Math.max(50, Math.min(this.x, 3950));
    this.y = Math.max(50, Math.min(this.y, 3950));

    // Éviter les bords
    if (this.x < 200) this.angle = Math.abs(this.angle);
    if (this.x > 3800) this.angle = Math.PI - Math.abs(this.angle);
    if (this.y < 200)
      this.angle = Math.abs(this.angle) * (this.angle > 0 ? 1 : -1);
    if (this.y > 3800)
      this.angle = -Math.abs(this.angle) * (this.angle > 0 ? 1 : -1);

    // Mise à jour des segments
    this.updateSegments();

    // Boost et perte de segments
    if (this.boosting && this.segments.length > 5 && Math.random() < 0.3) {
      const removedSegment = this.segments.pop();
      this.score = Math.max(0, this.score - 1);

      // Créer une particule de boost
      food.push({
        id: Math.random().toString(36).substr(2, 9),
        x: removedSegment.x + (Math.random() - 0.5) * 20,
        y: removedSegment.y + (Math.random() - 0.5) * 20,
        color: this.color,
        size: 4,
        value: 2,
      });
    }
  }

  updateSegments() {
    const segmentDistance = 8;

    this.segments.unshift({
      x: this.x,
      y: this.y,
      size: this.size,
    });

    for (let i = 1; i < this.segments.length; i++) {
      const prevSegment = this.segments[i - 1];
      const currentSegment = this.segments[i];

      const distance = this.distanceTo(
        prevSegment.x,
        prevSegment.y,
        currentSegment.x,
        currentSegment.y
      );

      if (distance > segmentDistance) {
        const angle = this.angleTo(
          currentSegment.x,
          currentSegment.y,
          prevSegment.x,
          prevSegment.y
        );
        currentSegment.x = prevSegment.x - Math.cos(angle) * segmentDistance;
        currentSegment.y = prevSegment.y - Math.sin(angle) * segmentDistance;
      }
    }

    const targetLength = Math.max(5, Math.floor(this.score / 5) + 5);
    while (this.segments.length > targetLength) {
      this.segments.pop();
    }
  }

  distanceTo(x1, y1, x2 = this.x, y2 = this.y) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  angleTo(x1, y1, x2 = this.x, y2 = this.y) {
    return Math.atan2(y1 - y2, x1 - x2);
  }

  checkFoodCollisions() {
    for (let i = food.length - 1; i >= 0; i--) {
      const foodItem = food[i];
      const distance = this.distanceTo(foodItem.x, foodItem.y);

      if (distance < this.size + foodItem.size) {
        food.splice(i, 1);
        this.score += foodItem.value || 1;

        // Générer nouvelle nourriture
        food.push({
          id: Math.random().toString(36).substr(2, 9),
          x: Math.random() * 4000,
          y: Math.random() * 4000,
          color: `hsl(${Math.random() * 360}, 70%, 60%)`,
          size: 3 + Math.random() * 2,
          value: 1,
        });
        break;
      }
    }
  }

  checkPlayerCollisions() {
    const allPlayers = { ...players, ...bots };
    for (const playerId in allPlayers) {
      if (playerId === this.id) continue;

      const otherPlayer = allPlayers[playerId];

      for (const segment of otherPlayer.segments) {
        const distance = this.distanceTo(segment.x, segment.y);

        if (distance < this.size + segment.size - 5) {
          return true; // Collision détectée
        }
      }
    }
    return false;
  }

  die() {
    // Convertir les segments en nourriture
    this.segments.forEach((segment, index) => {
      if (index % 2 === 0) {
        food.push({
          id: Math.random().toString(36).substr(2, 9),
          x: segment.x + (Math.random() - 0.5) * 20,
          y: segment.y + (Math.random() - 0.5) * 20,
          color: this.color,
          size: 4 + Math.random() * 3,
          value: 2,
        });
      }
    });
  }
}

// Gestion des bots
function manageBots() {
  const totalPlayers = Object.keys(players).length + Object.keys(bots).length;

  // Ajouter des bots si nécessaire
  while (totalPlayers + Object.keys(bots).length < MIN_PLAYERS) {
    const botId = "bot_" + Math.random().toString(36).substr(2, 9);
    const botName =
      BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] +
      "_" +
      Math.floor(Math.random() * 1000);
    bots[botId] = new Bot(botId, botName);
  }

  // Supprimer des bots si trop de joueurs humains
  const humanPlayers = Object.keys(players).length;
  const botCount = Object.keys(bots).length;

  if (humanPlayers > MIN_PLAYERS / 2 && botCount > 2) {
    const botsToRemove = Math.min(botCount - 2, humanPlayers - MIN_PLAYERS / 2);
    const botIds = Object.keys(bots);

    for (let i = 0; i < botsToRemove; i++) {
      const botId = botIds[i];
      delete bots[botId];
      io.emit("playerLeft", botId);
    }
  }
}

// Mise à jour des bots
function updateBots() {
  for (const botId in bots) {
    const bot = bots[botId];
    bot.update();
    bot.checkFoodCollisions();

    if (bot.checkPlayerCollisions()) {
      bot.die();
      delete bots[botId];
      io.emit("playerDied", { playerId: botId, newFood: food });

      // Créer un nouveau bot après un délai
      setTimeout(() => {
        manageBots();
      }, 3000);
    }
  }
}

// Générer de la nourriture
function generateFood() {
  for (let i = 0; i < 1000; i++) {
    food.push({
      id: Math.random().toString(36).substr(2, 9),
      x: Math.random() * 4000,
      y: Math.random() * 4000,
      color: `hsl(${Math.random() * 360}, 70%, 60%)`,
      size: 3 + Math.random() * 2,
      value: 1,
    });
  }
}

// Routes d'authentification (inchangées)
app.post("/api/register", async (req, res) => {
  const { username, password, email } = req.body;

  if (!username || !password || !email) {
    return res.status(400).json({ error: "Tous les champs sont requis" });
  }

  if (password.length < 6) {
    return res
      .status(400)
      .json({ error: "Le mot de passe doit contenir au moins 6 caractères" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(
      "INSERT INTO users (username, password, email) VALUES (?, ?, ?)",
      [username, hashedPassword, email],
      function (err) {
        if (err) {
          if (err.message.includes("UNIQUE constraint failed")) {
            return res
              .status(400)
              .json({ error: "Nom d'utilisateur ou email déjà utilisé" });
          }
          return res
            .status(500)
            .json({ error: "Erreur lors de la création du compte" });
        }

        const token = jwt.sign({ userId: this.lastID, username }, JWT_SECRET);
        res.json({
          token,
          user: {
            id: this.lastID,
            username,
            email,
            bestScore: 0,
            gamesPlayed: 0,
            totalScore: 0,
            totalKills: 0,
            totalDeaths: 0,
            totalTimePlayed: 0,
          },
        });
      }
    );
  } catch (error) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Nom d'utilisateur et mot de passe requis" });
  }

  db.get(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, user) => {
      if (err) {
        return res.status(500).json({ error: "Erreur serveur" });
      }

      if (!user) {
        return res
          .status(400)
          .json({ error: "Nom d'utilisateur ou mot de passe incorrect" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res
          .status(400)
          .json({ error: "Nom d'utilisateur ou mot de passe incorrect" });
      }

      const token = jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET
      );
      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          bestScore: user.best_score,
          gamesPlayed: user.games_played,
          totalScore: user.total_score,
          totalKills: user.total_kills || 0,
          totalDeaths: user.total_deaths || 0,
          totalTimePlayed: user.total_time_played || 0,
        },
      });
    }
  );
});

// Middleware d'authentification pour Socket.io
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Token manquant"));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.userId;
    socket.username = decoded.username;
    next();
  } catch (err) {
    next(new Error("Token invalide"));
  }
});

// Initialiser la nourriture et les bots
generateFood();
manageBots();

// Gestion des connexions Socket.io
io.on("connection", (socket) => {
  console.log("Nouveau joueur connecté:", socket.username);
  socket.gameStartTime = Date.now();

  // Rejoindre le jeu
  socket.on("joinGame", (playerData) => {
    players[socket.id] = {
      id: socket.id,
      userId: socket.userId,
      name: socket.username,
      x: Math.random() * 2000 + 1000,
      y: Math.random() * 2000 + 1000,
      segments: [],
      angle: 0,
      speed: 3,
      size: 10,
      score: 0,
      color: playerData.color || `hsl(${Math.random() * 360}, 70%, 60%)`,
      boosting: false,
      kills: 0,
    };

    // Initialiser les segments du serpent
    for (let i = 0; i < 5; i++) {
      players[socket.id].segments.push({
        x: players[socket.id].x - i * 8,
        y: players[socket.id].y,
        size: players[socket.id].size - i * 0.5,
      });
    }

    // Incrémenter les parties jouées
    db.run("UPDATE users SET games_played = games_played + 1 WHERE id = ?", [
      socket.userId,
    ]);

    // Envoyer l'état initial au joueur (inclure les bots)
    const allPlayers = { ...players, ...bots };
    socket.emit("gameState", {
      players: allPlayers,
      food: food,
      playerId: socket.id,
    });

    // Informer les autres joueurs
    socket.broadcast.emit("playerJoined", players[socket.id]);

    // Gérer les bots
    manageBots();
  });
  socket.on("ping", (callback) => {
    callback();
  });

  // Mise à jour de la position du joueur
  socket.on("updatePosition", (data) => {
    if (players[socket.id]) {
      const player = players[socket.id];
      player.x = data.x;
      player.y = data.y;
      player.angle = data.angle;
      player.segments = data.segments;
      player.speed = data.speed;
      player.boosting = data.boosting;

      // Si le joueur boost, déposer des particules
      if (data.boosting && player.segments.length > 5 && Math.random() < 0.3) {
        const removedSegment = player.segments.pop();
        player.score = Math.max(0, player.score - 1);

        const boostParticle = {
          id: Math.random().toString(36).substr(2, 9),
          x: removedSegment.x + (Math.random() - 0.5) * 20,
          y: removedSegment.y + (Math.random() - 0.5) * 20,
          color: player.color,
          size: 4,
          value: 2,
        };

        food.push(boostParticle);
        io.emit("boostParticle", boostParticle);
      }

      // Diffuser la position aux autres joueurs
      socket.broadcast.emit("playerMoved", {
        id: socket.id,
        x: data.x,
        y: data.y,
        angle: data.angle,
        segments: data.segments,
        speed: data.speed,
        boosting: data.boosting,
      });
    }
  });

  // Manger de la nourriture
  socket.on("eatFood", (foodData) => {
    const foodItem = food.find((f) => f.id === foodData.foodId);
    if (!foodItem) return;

    food = food.filter((f) => f.id !== foodData.foodId);

    if (players[socket.id]) {
      const scoreGain = foodItem.value || 1;
      players[socket.id].score += scoreGain;

      db.run("UPDATE users SET total_score = total_score + ? WHERE id = ?", [
        scoreGain,
        socket.userId,
      ]);
    }

    const newFood = {
      id: Math.random().toString(36).substr(2, 9),
      x: Math.random() * 4000,
      y: Math.random() * 4000,
      color: `hsl(${Math.random() * 360}, 70%, 60%)`,
      size: 3 + Math.random() * 2,
      value: 1,
    };

    food.push(newFood);

    io.emit("foodEaten", {
      foodId: foodData.foodId,
      newFood: newFood,
      playerId: socket.id,
      newScore: players[socket.id].score,
    });
  });

  // Collision avec un autre joueur
  socket.on("playerDied", (data) => {
    if (players[socket.id]) {
      const deadPlayer = players[socket.id];
      const gameTime = Math.floor((Date.now() - socket.gameStartTime) / 1000);

      // Mettre à jour les statistiques
      db.get(
        "SELECT best_score FROM users WHERE id = ?",
        [socket.userId],
        (err, row) => {
          if (!err && row && deadPlayer.score > row.best_score) {
            db.run("UPDATE users SET best_score = ? WHERE id = ?", [
              deadPlayer.score,
              socket.userId,
            ]);
          }
        }
      );

      db.run(
        `UPDATE users SET 
                total_deaths = total_deaths + 1,
                total_time_played = total_time_played + ?,
                total_kills = total_kills + ?
                WHERE id = ?`,
        [gameTime, deadPlayer.kills || 0, socket.userId]
      );

      // Convertir les segments en nourriture
      deadPlayer.segments.forEach((segment, index) => {
        if (index % 2 === 0) {
          food.push({
            id: Math.random().toString(36).substr(2, 9),
            x: segment.x + (Math.random() - 0.5) * 20,
            y: segment.y + (Math.random() - 0.5) * 20,
            color: deadPlayer.color,
            size: 4 + Math.random() * 3,
            value: 2,
          });
        }
      });

      // Envoyer les stats finales
      db.get(
        `SELECT best_score, games_played, total_score, total_kills, 
                    total_deaths, total_time_played FROM users WHERE id = ?`,
        [socket.userId],
        (err, stats) => {
          if (!err && stats) {
            socket.emit("gameStats", {
              finalScore: deadPlayer.score,
              finalLength: deadPlayer.segments.length,
              kills: deadPlayer.kills || 0,
              gameTime: gameTime,
              bestScore: Math.max(stats.best_score, deadPlayer.score),
              gamesPlayed: stats.games_played,
              totalScore: stats.total_score,
              totalKills: stats.total_kills + (deadPlayer.kills || 0),
              totalDeaths: stats.total_deaths + 1,
              totalTimePlayed: stats.total_time_played + gameTime,
              newRecord: deadPlayer.score > stats.best_score,
            });
          }
        }
      );

      delete players[socket.id];
      io.emit("playerDied", { playerId: socket.id, newFood: food });
    }
  });

  // Déconnexion
  socket.on("disconnect", () => {
    console.log("Joueur déconnecté:", socket.username);

    if (players[socket.id]) {
      const gameTime = Math.floor((Date.now() - socket.gameStartTime) / 1000);
      db.run(
        "UPDATE users SET total_time_played = total_time_played + ? WHERE id = ?",
        [gameTime, socket.userId]
      );
    }

    delete players[socket.id];
    socket.broadcast.emit("playerLeft", socket.id);
    manageBots();
  });
});

// Mise à jour du jeu
setInterval(() => {
  updateBots();
  const allPlayers = { ...players, ...bots };
  io.emit("gameUpdate", {
    players: allPlayers,
    food: food,
  });
}, TICK_INTERVAL);

// Gestion périodique des bots
setInterval(() => {
  manageBots();
}, MANAGE_BOT);
server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
