// scripts/init-db.js
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('game.db');

db.serialize(() => {
    // Supprimer les tables existantes si elles existent
    db.run('DROP TABLE IF EXISTS users');
    
    // Créer la table users avec toutes les colonnes nécessaires
    db.run(`CREATE TABLE users (
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
    
    console.log('Base de données initialisée avec succès!');
});

db.close();
