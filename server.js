// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'your-secret-key-change-in-production';

// Middleware
app.use(express.json());
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Variables de jeu
let players = {};
let food = [];
let gameState = {
    players: {},
    food: []
};

// Générer de la nourriture
function generateFood() {
    for (let i = 0; i < 1000; i++) {
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
                        totalScore: 0
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
                    totalScore: user.total_score
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

// Initialiser la nourriture
generateFood();

// Gestion des connexions Socket.io
io.on('connection', (socket) => {
    console.log('Nouveau joueur connecté:', socket.username);

    // Rejoindre le jeu
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
            boosting: false
        };

        // Initialiser les segments du serpent
        for (let i = 0; i < 5; i++) {
            players[socket.id].segments.push({
                x: players[socket.id].x - i * 8,
                y: players[socket.id].y,
                size: players[socket.id].size - i * 0.5
            });
        }

        // Incrémenter les parties jouées
        db.run('UPDATE users SET games_played = games_played + 1 WHERE id = ?', [socket.userId]);

        // Envoyer l'état initial au joueur
        socket.emit('gameState', {
            players: players,
            food: food,
            playerId: socket.id
        });

        // Informer les autres joueurs
        socket.broadcast.emit('playerJoined', players[socket.id]);
    });

    // Mise à jour de la position du joueur
    socket.on('updatePosition', (data) => {
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
                // Retirer un segment et créer une particule
                const removedSegment = player.segments.pop();
                player.score = Math.max(0, player.score - 1);
                
                // Créer une particule de boost
                const boostParticle = {
                    id: Math.random().toString(36).substr(2, 9),
                    x: removedSegment.x + (Math.random() - 0.5) * 20,
                    y: removedSegment.y + (Math.random() - 0.5) * 20,
                    color: player.color,
                    size: 4,
                    value: 2
                };
                
                food.push(boostParticle);
                
                // Informer tous les joueurs de la nouvelle particule
                io.emit('boostParticle', boostParticle);
            }

            // Diffuser la position aux autres joueurs
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                x: data.x,
                y: data.y,
                angle: data.angle,
                segments: data.segments,
                speed: data.speed,
                boosting: data.boosting
            });
        }
    });

    // Manger de la nourriture
    socket.on('eatFood', (foodData) => {
        const foodItem = food.find(f => f.id === foodData.foodId);
        if (!foodItem) return;

        food = food.filter(f => f.id !== foodData.foodId);
        
        if (players[socket.id]) {
            const scoreGain = foodItem.value || 1;
            players[socket.id].score += scoreGain;
            
            // Mettre à jour le score total dans la base de données
            db.run('UPDATE users SET total_score = total_score + ? WHERE id = ?', [scoreGain, socket.userId]);
        }

        // Générer nouvelle nourriture normale
        const newFood = {
            id: Math.random().toString(36).substr(2, 9),
            x: Math.random() * 4000,
            y: Math.random() * 4000,
            color: `hsl(${Math.random() * 360}, 70%, 60%)`,
            size: 3 + Math.random() * 2,
            value: 1
        };
        
        food.push(newFood);

        // Informer tous les joueurs
        io.emit('foodEaten', { 
            foodId: foodData.foodId, 
            newFood: newFood, 
            playerId: socket.id,
            newScore: players[socket.id].score
        });
    });

    // Collision avec un autre joueur
    socket.on('playerDied', (data) => {
        if (players[socket.id]) {
            const deadPlayer = players[socket.id];
            
            // Mettre à jour le meilleur score si nécessaire
            db.get('SELECT best_score FROM users WHERE id = ?', [socket.userId], (err, row) => {
                if (!err && row && deadPlayer.score > row.best_score) {
                    db.run('UPDATE users SET best_score = ? WHERE id = ?', [deadPlayer.score, socket.userId]);
                }
            });
            
            // Convertir les segments en nourriture
            deadPlayer.segments.forEach((segment, index) => {
                if (index % 2 === 0) { // Seulement certains segments
                    food.push({
                        id: Math.random().toString(36).substr(2, 9),
                        x: segment.x + (Math.random() - 0.5) * 20,
                        y: segment.y + (Math.random() - 0.5) * 20,
                        color: deadPlayer.color,
                        size: 4 + Math.random() * 3,
                        value: 2
                    });
                }
            });

            delete players[socket.id];
            
            // Informer tous les joueurs
            io.emit('playerDied', { playerId: socket.id, newFood: food });
        }
    });

    // Déconnexion
    socket.on('disconnect', () => {
        console.log('Joueur déconnecté:', socket.username);
        delete players[socket.id];
        socket.broadcast.emit('playerLeft', socket.id);
    });
});

// Envoyer l'état du jeu périodiquement
setInterval(() => {
    io.emit('gameUpdate', {
        players: players,
        food: food
    });
}, 1000 / 30); // 30 FPS

server.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
