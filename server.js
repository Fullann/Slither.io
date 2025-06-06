const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));

// Configuration du jeu
const GAME_CONFIG = {
    WORLD_WIDTH: 2000,
    WORLD_HEIGHT: 2000,
    FOOD_COUNT: 200,
    BOT_COUNT: 10,
    SNAKE_SPEED: 2,
    BOOST_SPEED: 4,
    BOOST_DECAY: 0.02,
    BOOST_COOLDOWN: 30,
    FOOD_SIZE: 8,
    INITIAL_SNAKE_SIZE: 3,
    SEGMENT_DISTANCE: 12
};

// État du jeu
let gameState = {
    players: new Map(),
    bots: new Map(),
    food: new Map(),
    leaderboard: []
};

// Générer de la nourriture aléatoire
function generateFood() {
    for (let i = 0; i < GAME_CONFIG.FOOD_COUNT; i++) {
        const id = `food_${i}`;
        gameState.food.set(id, {
            id,
            x: Math.random() * GAME_CONFIG.WORLD_WIDTH,
            y: Math.random() * GAME_CONFIG.WORLD_HEIGHT,
            color: `hsl(${Math.random() * 360}, 70%, 60%)`
        });
    }
}

// Créer un serpent
function createSnake(id, name, isBot = false) {
    return {
        id,
        name,
        isBot,
        x: Math.random() * GAME_CONFIG.WORLD_WIDTH,
        y: Math.random() * GAME_CONFIG.WORLD_HEIGHT,
        angle: Math.random() * Math.PI * 2,
        segments: [],
        size: GAME_CONFIG.INITIAL_SNAKE_SIZE,
        score: 0,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        alive: true,
        boosting: false,
        boostCooldown: 0,
        length: GAME_CONFIG.INITIAL_SNAKE_SIZE
    };
}

// Créer des bots
function createBots() {
    for (let i = 0; i < GAME_CONFIG.BOT_COUNT; i++) {
        const botId = `bot_${i}`;
        const botNames = ['SlitherBot', 'SnakeAI', 'Pythonix', 'Serpentine', 'Viperous', 'Cobrex', 'Naga', 'Anaconda'];
        const bot = createSnake(botId, botNames[i % botNames.length], true);
        
        // Initialiser les segments du bot
        for (let j = 0; j < GAME_CONFIG.INITIAL_SNAKE_SIZE; j++) {
            bot.segments.push({
                x: bot.x - j * GAME_CONFIG.SEGMENT_DISTANCE,
                y: bot.y,
                size: 12 - j * 0.5
            });
        }
        
        bot.length = GAME_CONFIG.INITIAL_SNAKE_SIZE;
        
        gameState.bots.set(botId, bot);
    }
}

// Logique IA pour les bots
function updateBotAI(bot) {
    if (!bot.alive) return;

    // Trouver la nourriture la plus proche
    let closestFood = null;
    let closestDistance = Infinity;
    
    gameState.food.forEach(food => {
        const distance = Math.sqrt(
            Math.pow(food.x - bot.x, 2) + Math.pow(food.y - bot.y, 2)
        );
        if (distance < closestDistance) {
            closestDistance = distance;
            closestFood = food;
        }
    });

    // Se diriger vers la nourriture
    if (closestFood) {
        const targetAngle = Math.atan2(closestFood.y - bot.y, closestFood.x - bot.x);
        bot.angle = targetAngle;
    }

    // Éviter les bords
    const margin = 50;
    if (bot.x < margin) bot.angle = 0;
    if (bot.x > GAME_CONFIG.WORLD_WIDTH - margin) bot.angle = Math.PI;
    if (bot.y < margin) bot.angle = Math.PI / 2;
    if (bot.y > GAME_CONFIG.WORLD_HEIGHT - margin) bot.angle = -Math.PI / 2;

    // Ajouter un peu d'aléatoire
    if (Math.random() < 0.1) {
        bot.angle += (Math.random() - 0.5) * 0.3;
    }
}

// Mettre à jour la position du serpent
function updateSnakePosition(snake) {
    if (!snake.alive) return;

    // Gestion du boost et cooldown
    if (snake.boostCooldown > 0) {
        snake.boostCooldown--;
    }

    // Calculer la vitesse actuelle
    let currentSpeed = GAME_CONFIG.SNAKE_SPEED;
    if (snake.boosting && snake.length > 5) {
        currentSpeed = GAME_CONFIG.BOOST_SPEED;
        // Le boost consomme de la longueur (perd un segment tous les 10 frames)
        if (Math.random() < 0.1) {
            snake.length = Math.max(3, snake.length - 0.5);
        }
    }

    // Sauvegarder l'ancienne position
    const oldX = snake.x;
    const oldY = snake.y;

    // Calculer la nouvelle position
    snake.x += Math.cos(snake.angle) * currentSpeed;
    snake.y += Math.sin(snake.angle) * currentSpeed;

    // Téléportation aux bords
    if (snake.x < 0) snake.x = GAME_CONFIG.WORLD_WIDTH;
    if (snake.x > GAME_CONFIG.WORLD_WIDTH) snake.x = 0;
    if (snake.y < 0) snake.y = GAME_CONFIG.WORLD_HEIGHT;
    if (snake.y > GAME_CONFIG.WORLD_HEIGHT) snake.y = 0;

    // Ajouter un nouveau segment à la tête
    snake.segments.unshift({
        x: oldX,
        y: oldY,
        size: 12
    });

    // Maintenir la longueur correcte des segments
    while (snake.segments.length > Math.floor(snake.length)) {
        snake.segments.pop();
    }

    // Ajuster la taille des segments pour un effet dégradé
    snake.segments.forEach((segment, index) => {
        segment.size = Math.max(6, 12 - index * 0.5);
    });
}

// Vérifier les collisions avec la nourriture
function checkFoodCollisions(snake) {
    if (!snake.alive) return;

    gameState.food.forEach((food, foodId) => {
        const distance = Math.sqrt(
            Math.pow(food.x - snake.x, 2) + Math.pow(food.y - snake.y, 2)
        );
        
        if (distance < 15) {
            // Manger la nourriture - augmente la longueur réelle
            snake.length += 2; // Augmente la longueur de 2 segments par nourriture
            snake.score += 10;
            gameState.food.delete(foodId);
            
            // Créer une nouvelle nourriture
            const newFoodId = `food_${Date.now()}_${Math.random()}`;
            gameState.food.set(newFoodId, {
                id: newFoodId,
                x: Math.random() * GAME_CONFIG.WORLD_WIDTH,
                y: Math.random() * GAME_CONFIG.WORLD_HEIGHT,
                color: `hsl(${Math.random() * 360}, 70%, 60%)`
            });
        }
    });
}

// Vérifier les collisions entre serpents
function checkSnakeCollisions() {
    const allSnakes = [...gameState.players.values(), ...gameState.bots.values()];
    
    allSnakes.forEach(snake1 => {
        if (!snake1.alive) return;
        
        allSnakes.forEach(snake2 => {
            if (snake1.id === snake2.id || !snake2.alive) return;
            
            // Vérifier collision avec les segments
            snake2.segments.forEach(segment => {
                const distance = Math.sqrt(
                    Math.pow(segment.x - snake1.x, 2) + Math.pow(segment.y - snake1.y, 2)
                );
                
                if (distance < 12) {
                    snake1.alive = false;
                    // Créer de la nourriture à partir du serpent mort
                    for (let i = 0; i < Math.min(snake1.segments.length, 20); i++) {
                        const foodId = `death_food_${Date.now()}_${i}`;
                        gameState.food.set(foodId, {
                            id: foodId,
                            x: snake1.segments[i].x + (Math.random() - 0.5) * 40,
                            y: snake1.segments[i].y + (Math.random() - 0.5) * 40,
                            color: snake1.color
                        });
                    }
                }
            });
        });
    });
}

// Mettre à jour le classement
function updateLeaderboard() {
    const allSnakes = [...gameState.players.values(), ...gameState.bots.values()];
    gameState.leaderboard = allSnakes
        .filter(snake => snake.alive)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(snake => ({
            name: snake.name,
            score: snake.score,
            isBot: snake.isBot
        }));
}

// Boucle de jeu principale
function gameLoop() {
    // Mettre à jour les bots
    gameState.bots.forEach(bot => {
        updateBotAI(bot);
        updateSnakePosition(bot);
        checkFoodCollisions(bot);
    });

    // Mettre à jour les joueurs
    gameState.players.forEach(player => {
        updateSnakePosition(player);
        checkFoodCollisions(player);
    });

    // Vérifier les collisions
    checkSnakeCollisions();

    // Supprimer les serpents morts
    gameState.players.forEach((player, id) => {
        if (!player.alive) {
            gameState.players.delete(id);
        }
    });

    gameState.bots.forEach((bot, id) => {
        if (!bot.alive) {
            // Recréer le bot
            const newBot = createSnake(id, bot.name, true);
            for (let j = 0; j < GAME_CONFIG.INITIAL_SNAKE_SIZE; j++) {
                newBot.segments.push({
                    x: newBot.x - j * GAME_CONFIG.SEGMENT_DISTANCE,
                    y: newBot.y,
                    size: 12 - j * 0.5
                });
            }
            newBot.length = GAME_CONFIG.INITIAL_SNAKE_SIZE;
            gameState.bots.set(id, newBot);
        }
    });

    // Mettre à jour le classement
    updateLeaderboard();

    // Envoyer l'état du jeu aux clients
    io.emit('gameUpdate', {
        players: Array.from(gameState.players.values()),
        bots: Array.from(gameState.bots.values()),
        food: Array.from(gameState.food.values()),
        leaderboard: gameState.leaderboard
    });
}

// Gestion des connexions
io.on('connection', (socket) => {
    console.log('Nouveau joueur connecté:', socket.id);

    socket.on('joinGame', (playerName) => {
        const player = createSnake(socket.id, playerName || 'Joueur');
        
        // Initialiser les segments
        for (let i = 0; i < GAME_CONFIG.INITIAL_SNAKE_SIZE; i++) {
            player.segments.push({
                x: player.x - i * GAME_CONFIG.SEGMENT_DISTANCE,
                y: player.y,
                size: 12 - i * 0.5
            });
        }
        
        player.length = GAME_CONFIG.INITIAL_SNAKE_SIZE;
        
        gameState.players.set(socket.id, player);
        
        socket.emit('gameJoined', {
            playerId: socket.id,
            worldSize: {
                width: GAME_CONFIG.WORLD_WIDTH,
                height: GAME_CONFIG.WORLD_HEIGHT
            }
        });
    });

    socket.on('updateDirection', (angle) => {
        const player = gameState.players.get(socket.id);
        if (player && player.alive) {
            player.angle = angle;
        }
    });

    socket.on('startBoost', () => {
        const player = gameState.players.get(socket.id);
        if (player && player.alive && player.boostCooldown <= 0 && player.length > 5) {
            player.boosting = true;
        }
    });

    socket.on('stopBoost', () => {
        const player = gameState.players.get(socket.id);
        if (player && player.alive) {
            player.boosting = false;
            player.boostCooldown = GAME_CONFIG.BOOST_COOLDOWN;
        }
    });

    socket.on('disconnect', () => {
        gameState.players.delete(socket.id);
        console.log('Joueur déconnecté:', socket.id);
    });
});

// Initialiser le jeu
generateFood();
createBots();

// Démarrer la boucle de jeu (60 FPS)
setInterval(gameLoop, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});