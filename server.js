// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const compression = require('compression');
const path = require('path');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'your-secret-key-change-in-production';
const NODE_ENV = process.env.NODE_ENV || 'production';

// Configuration Socket.io optimisée pour hébergement mutualisé
const io = socketIo(server, {
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 30000,
    allowUpgrades: true,
    transports: ['websocket', 'polling'],
    compression: true,
    perMessageDeflate: {
        threshold: 1024,
        concurrencyLimit: 10,
        memLevel: 7
    }
});

// Optimisations pour hébergement mutualisé
if (NODE_ENV === 'production') {
    process.env.NODE_OPTIONS = '--max-old-space-size=512';
}

// Compression pour réduire la bande passante
app.use(compression({
    level: 6,
    threshold: 1024
}));

// Middleware optimisé
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ limit: '4mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Base de données SQLite
const db = new sqlite3.Database('game.db');

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

// Variables de jeu optimisées
let players = {};
let bots = {};
let food = [];
const MAX_BOTS = 4; 
const MIN_PLAYERS = 6; 
const UPDATE_RATE = 30; 
const MAX_FOOD = 1000;

const BOT_NAMES = [
    'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta',
    'Viper', 'Cobra', 'Python', 'Anaconda', 'Mamba', 'Boa', 'Adder'
];

// Variables d'optimisation
let lastUpdateTime = Date.now();
let botUpdateIndex = 0;
const UPDATE_INTERVAL = 500 / UPDATE_RATE;

// Classe Bot optimisée
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
        this.lastDirectionChange = Date.now();
        this.aggressiveness = Math.random() * 0.5 + 0.3;
        this.fearDistance = 100 + Math.random() * 50; // Réduit
        this.lastUpdate = 0;
        
        // Initialiser les segments
        for (let i = 0; i < 5; i++) {
            this.segments.push({
                x: this.x - i * 8,
                y: this.y,
                size: this.size - i * 0.5
            });
        }
    }

    update() {
        const now = Date.now();
        // Limiter les mises à jour des bots à 10 FPS
        if (now - this.lastUpdate < 100) return;
        this.lastUpdate = now;

        // Logique simplifiée pour économiser les ressources
        const nearbyFood = this.findNearbyFood(150);
        const nearbyDanger = this.findNearbyDanger(80);

        if (nearbyDanger) {
            this.angle = this.angleTo(nearbyDanger.x, nearbyDanger.y) + Math.PI;
            this.boosting = Math.random() < 0.5;
        } else if (nearbyFood.length > 0) {
            const closest = nearbyFood[0];
            this.angle = this.angleTo(closest.x, closest.y);
            this.boosting = false;
        } else {
            if (now - this.lastDirectionChange > 3000) {
                this.angle += (Math.random() - 0.5) * 0.5;
                this.lastDirectionChange = now;
            }
            this.boosting = Math.random() < 0.05;
        }

        this.speed = this.boosting ? 5 : 3;
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;

        // Limites du monde
        this.x = Math.max(50, Math.min(this.x, 3950));
        this.y = Math.max(50, Math.min(this.y, 3950));

        this.updateSegments();

        // Boost et perte de segments (réduit)
        if (this.boosting && this.segments.length > 5 && Math.random() < 0.2) {
            const removedSegment = this.segments.pop();
            this.score = Math.max(0, this.score - 1);
            
            if (food.length < MAX_FOOD) {
                food.push({
                    id: Math.random().toString(36).substr(2, 9),
                    x: removedSegment.x + (Math.random() - 0.5) * 15,
                    y: removedSegment.y + (Math.random() - 0.5) * 15,
                    color: this.color,
                    size: 4,
                    value: 2
                });
            }
        }
    }

    findNearbyFood(range) {
        return food.filter(f => this.distanceTo(f.x, f.y) < range)
                  .sort((a, b) => this.distanceTo(a.x, a.y) - this.distanceTo(b.x, b.y))
                  .slice(0, 3); // Limiter à 3 éléments
    }

    findNearbyDanger(range) {
        const allPlayers = { ...players, ...bots };
        for (const playerId in allPlayers) {
            if (playerId === this.id) continue;
            
            const otherPlayer = allPlayers[playerId];
            const distance = this.distanceTo(otherPlayer.x, otherPlayer.y);
            
            if (otherPlayer.segments.length > this.segments.length && distance < range) {
                return otherPlayer;
            }
        }
        return null;
    }

    updateSegments() {
        const segmentDistance = 8;
        
        this.segments.unshift({
            x: this.x,
            y: this.y,
            size: this.size
        });

        // Mise à jour simplifiée des segments
        for (let i = 1; i < this.segments.length && i < 15; i++) { // Limiter à 15 segments
            const prevSegment = this.segments[i - 1];
            const currentSegment = this.segments[i];
            
            const distance = this.distanceTo(prevSegment.x, prevSegment.y, currentSegment.x, currentSegment.y);
            
            if (distance > segmentDistance) {
                const angle = this.angleTo(currentSegment.x, currentSegment.y, prevSegment.x, prevSegment.y);
                currentSegment.x = prevSegment.x - Math.cos(angle) * segmentDistance;
                currentSegment.y = prevSegment.y - Math.sin(angle) * segmentDistance;
            }
        }

        const targetLength = Math.max(5, Math.min(Math.floor(this.score / 5) + 5, 20)); // Limiter à 20
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
                
                // Générer nouvelle nourriture seulement si nécessaire
                if (food.length < MAX_FOOD) {
                    food.push({
                        id: Math.random().toString(36).substr(2, 9),
                        x: Math.random() * 4000,
                        y: Math.random() * 4000,
                        color: `hsl(${Math.random() * 360}, 70%, 60%)`,
                        size: 3 + Math.random() * 2,
                        value: 1
                    });
                }
                break;
            }
        }
    }

    checkPlayerCollisions() {
        const allPlayers = { ...players, ...bots };
        for (const playerId in allPlayers) {
            if (playerId === this.id) continue;
            
            const otherPlayer = allPlayers[playerId];
            
            // Vérifier seulement les premiers segments pour optimiser
            const segmentsToCheck = Math.min(otherPlayer.segments.length, 10);
            for (let i = 0; i < segmentsToCheck; i++) {
                const segment = otherPlayer.segments[i];
                const distance = this.distanceTo(segment.x, segment.y);
                
                if (distance < this.size + segment.size - 5) {
                    return true;
                }
            }
        }
        return false;
    }

    die() {
        // Convertir seulement certains segments en nourriture
        const segmentsToConvert = Math.min(this.segments.length, 15);
        for (let i = 0; i < segmentsToConvert; i += 2) {
            if (food.length < MAX_FOOD) {
                const segment = this.segments[i];
                food.push({
                    id: Math.random().toString(36).substr(2, 9),
                    x: segment.x + (Math.random() - 0.5) * 20,
                    y: segment.y + (Math.random() - 0.5) * 20,
                    color: this.color,
                    size: 4 + Math.random() * 3,
                    value: 2
                });
            }
        }
    }
}

// Gestion optimisée des bots
function manageBots() {
    const totalPlayers = Object.keys(players).length + Object.keys(bots).length;
    const humanPlayers = Object.keys(players).length;
    
    // Ajouter des bots si nécessaire
    while (totalPlayers < MIN_PLAYERS && Object.keys(bots).length < MAX_BOTS) {
        const botId = 'bot_' + Math.random().toString(36).substr(2, 9);
        const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + '_' + Math.floor(Math.random() * 100);
        bots[botId] = new Bot(botId, botName);
    }
    
    // Supprimer des bots si trop de joueurs humains
    if (humanPlayers > MIN_PLAYERS / 2 && Object.keys(bots).length > 1) {
        const botsToRemove = Math.min(Object.keys(bots).length - 1, humanPlayers - MIN_PLAYERS / 2);
        const botIds = Object.keys(bots);
        
        for (let i = 0; i < botsToRemove; i++) {
            const botId = botIds[i];
            delete bots[botId];
            io.emit('playerLeft', botId);
        }
    }
}

// Mise à jour optimisée des bots
function updateBots() {
    const botIds = Object.keys(bots);
    if (botIds.length === 0) return;
    
    // Mettre à jour seulement 1 bot par frame pour répartir la charge
    const botId = botIds[botUpdateIndex % botIds.length];
    botUpdateIndex++;
    
    if (bots[botId]) {
        bots[botId].update();
        bots[botId].checkFoodCollisions();
        
        if (bots[botId].checkPlayerCollisions()) {
            bots[botId].die();
            delete bots[botId];
            io.emit('playerDied', { playerId: botId, newFood: food });
            
            setTimeout(() => manageBots(), 2000);
        }
    }
}

// Compression des données joueurs
function compressPlayerData(playersObj) {
    const compressed = {};
    for (const id in playersObj) {
        const player = playersObj[id];
        compressed[id] = {
            id: id,
            name: player.name,
            x: Math.round(player.x),
            y: Math.round(player.y),
            angle: Math.round(player.angle * 100) / 100,
            score: player.score,
            segments: player.segments.slice(0, Math.min(player.segments.length, 15)), // Limiter
            boosting: player.boosting,
            color: player.color,
            kills: player.kills || 0
        };
    }
    return compressed;
}

// Diffusion optimisée aux joueurs proches
function broadcastToNearbyPlayers(playerId, data, range = 800) {
    const player = players[playerId];
    if (!player) return;
    
    for (const socketId in players) {
        if (socketId === playerId) continue;
        
        const otherPlayer = players[socketId];
        const distance = Math.sqrt(
            (player.x - otherPlayer.x) ** 2 + 
            (player.y - otherPlayer.y) ** 2
        );
        
        if (distance < range) {
            io.to(socketId).emit('playerMoved', data);
        }
    }
}

// Générer de la nourriture optimisée
function generateFood() {
    for (let i = 0; i < MAX_FOOD; i++) {
        food.push({
            id: Math.random().toString(36).substr(2, 9),
            x: Math.random() * 4000,
            y: Math.random() * 4000,
            color: `hsl(${Math.random() * 360}, 70%, 60%)`,
            size: 3 + Math.random() * 2,
            value: 1
        });
    }
}

// Optimisation de la nourriture
function optimizeFood() {
    if (food.length > MAX_FOOD) {
        food = food.slice(0, MAX_FOOD);
    }
}

// Routes d'authentification
app.post('/api/register', async (req, res) => {
    const { username, password, email } = req.body;
    
    if (!username || !password || !email) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run(
            'INSERT INTO users (username, password, email) VALUES (?, ?, ?)',
            [username, hashedPassword, email],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: 'Nom d\'utilisateur ou email déjà utilisé' });
                    }
                    return res.status(500).json({ error: 'Erreur lors de la création du compte' });
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
                        totalTimePlayed: 0
                    } 
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
    }

    db.get(
        'SELECT * FROM users WHERE username = ?',
        [username],
        async (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Erreur serveur' });
            }
            
            if (!user) {
                return res.status(400).json({ error: 'Nom d\'utilisateur ou mot de passe incorrect' });
            }

            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(400).json({ error: 'Nom d\'utilisateur ou mot de passe incorrect' });
            }

            const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET);
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
                    totalTimePlayed: user.total_time_played || 0
                } 
            });
        }
    );
});

// Middleware d'authentification pour Socket.io
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Token manquant'));
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.userId = decoded.userId;
        socket.username = decoded.username;
        next();
    } catch (err) {
        next(new Error('Token invalide'));
    }
});

// Initialiser la nourriture et les bots
generateFood();
manageBots();

// Gestion des connexions Socket.io optimisée
io.on('connection', (socket) => {
    console.log('Nouveau joueur connecté:', socket.username);
    socket.gameStartTime = Date.now();
    socket.rateLimiter = new Map();

    socket.on('joinGame', (playerData) => {
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
            kills: 0
        };

        for (let i = 0; i < 5; i++) {
            players[socket.id].segments.push({
                x: players[socket.id].x - i * 8,
                y: players[socket.id].y,
                size: players[socket.id].size - i * 0.5
            });
        }

        db.run('UPDATE users SET games_played = games_played + 1 WHERE id = ?', [socket.userId]);

        const allPlayers = { ...players, ...bots };
        socket.emit('gameState', {
            players: allPlayers,
            food: food,
            playerId: socket.id
        });

        socket.broadcast.emit('playerJoined', players[socket.id]);
        manageBots();
    });

    socket.on('updatePosition', (data) => {
        const now = Date.now();
        const lastUpdate = socket.rateLimiter.get('position') || 0;
        
        // Limiter à 15 mises à jour par seconde
        if (now - lastUpdate < 66) {
            return;
        }
        socket.rateLimiter.set('position', now);
        
        if (players[socket.id]) {
            const player = players[socket.id];
            player.x = data.x;
            player.y = data.y;
            player.angle = data.angle;
            player.segments = data.segments;
            player.speed = data.speed;
            player.boosting = data.boosting;

            if (data.boosting && player.segments.length > 5 && Math.random() < 0.2) {
                const removedSegment = player.segments.pop();
                player.score = Math.max(0, player.score - 1);
                
                if (food.length < MAX_FOOD) {
                    const boostParticle = {
                        id: Math.random().toString(36).substr(2, 9),
                        x: removedSegment.x + (Math.random() - 0.5) * 20,
                        y: removedSegment.y + (Math.random() - 0.5) * 20,
                        color: player.color,
                        size: 4,
                        value: 2
                    };
                    
                    food.push(boostParticle);
                    io.emit('boostParticle', boostParticle);
                }
            }

            broadcastToNearbyPlayers(socket.id, {
                id: socket.id,
                x: data.x,
                y: data.y,
                angle: data.angle,
                segments: data.segments.slice(0, 10), // Limiter les segments transmis
                speed: data.speed,
                boosting: data.boosting
            });
        }
    });

    socket.on('eatFood', (foodData) => {
        const foodItem = food.find(f => f.id === foodData.foodId);
        if (!foodItem) return;

        food = food.filter(f => f.id !== foodData.foodId);
        
        if (players[socket.id]) {
            const scoreGain = foodItem.value || 1;
            players[socket.id].score += scoreGain;
            
            db.run('UPDATE users SET total_score = total_score + ? WHERE id = ?', [scoreGain, socket.userId]);
        }

        if (food.length < MAX_FOOD) {
            const newFood = {
                id: Math.random().toString(36).substr(2, 9),
                x: Math.random() * 4000,
                y: Math.random() * 4000,
                color: `hsl(${Math.random() * 360}, 70%, 60%)`,
                size: 3 + Math.random() * 2,
                value: 1
            };
            
            food.push(newFood);

            io.emit('foodEaten', { 
                foodId: foodData.foodId, 
                newFood: newFood, 
                playerId: socket.id,
                newScore: players[socket.id].score
            });
        }
    });

    socket.on('playerDied', (data) => {
        if (players[socket.id]) {
            const deadPlayer = players[socket.id];
            const gameTime = Math.floor((Date.now() - socket.gameStartTime) / 1000);
            
            db.get('SELECT best_score FROM users WHERE id = ?', [socket.userId], (err, row) => {
                if (!err && row && deadPlayer.score > row.best_score) {
                    db.run('UPDATE users SET best_score = ? WHERE id = ?', [deadPlayer.score, socket.userId]);
                }
            });
            
            db.run(`UPDATE users SET 
                total_deaths = total_deaths + 1,
                total_time_played = total_time_played + ?,
                total_kills = total_kills + ?
                WHERE id = ?`, 
                [gameTime, deadPlayer.kills || 0, socket.userId]
            );
            
            // Convertir seulement certains segments en nourriture
            const segmentsToConvert = Math.min(deadPlayer.segments.length, 15);
            for (let i = 0; i < segmentsToConvert; i += 2) {
                if (food.length < MAX_FOOD) {
                    const segment = deadPlayer.segments[i];
                    food.push({
                        id: Math.random().toString(36).substr(2, 9),
                        x: segment.x + (Math.random() - 0.5) * 20,
                        y: segment.y + (Math.random() - 0.5) * 20,
                        color: deadPlayer.color,
                        size: 4 + Math.random() * 3,
                        value: 2
                    });
                }
            }

            db.get(`SELECT best_score, games_played, total_score, total_kills, 
                    total_deaths, total_time_played FROM users WHERE id = ?`, 
                    [socket.userId], (err, stats) => {
                if (!err && stats) {
                    socket.emit('gameStats', {
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
                        newRecord: deadPlayer.score > stats.best_score
                    });
                }
            });

            delete players[socket.id];
            io.emit('playerDied', { playerId: socket.id, newFood: food });
        }
    });

    socket.on('disconnect', () => {
        console.log('Joueur déconnecté:', socket.username);
        
        if (players[socket.id]) {
            const gameTime = Math.floor((Date.now() - socket.gameStartTime) / 1000);
            db.run('UPDATE users SET total_time_played = total_time_played + ? WHERE id = ?', 
                   [gameTime, socket.userId]);
        }
        
        delete players[socket.id];
        socket.broadcast.emit('playerLeft', socket.id);
        manageBots();
    });
});

// Fonction de mise à jour optimisée
function optimizedGameUpdate() {
    const now = Date.now();
    if (now - lastUpdateTime < UPDATE_INTERVAL) {
        return;
    }
    lastUpdateTime = now;

    updateBots();
    
    const allPlayers = { ...players, ...bots };
    const compressedData = {
        players: compressPlayerData(allPlayers),
        foodCount: food.length
    };
    
    io.emit('gameUpdate', compressedData);
}

// Nettoyage périodique
setInterval(() => {
    optimizeFood();
    
    // Nettoyer les objets inutiles
    if (global.gc) {
        global.gc();
    }
}, 30000);

// Gestion périodique des bots
setInterval(() => {
    manageBots();
}, 15000);

// Mise à jour du jeu optimisée
setInterval(optimizedGameUpdate, UPDATE_INTERVAL);

server.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
