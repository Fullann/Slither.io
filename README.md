# 🐍 Slither.io Clone

Un clone complet de Slither.io avec serveur multijoueur en temps réel et bots IA intelligents.

## ✨ Fonctionnalités

- **Multijoueur en temps réel** : Jouez avec d'autres joueurs connectés
- **Bots IA intelligents** : 10 bots qui simulent des joueurs réels
- **Graphismes modernes** : Interface utilisateur attrayante avec effets visuels
- **Classement en direct** : Tableau des scores en temps réel
- **Respawn automatique** : Les bots se recréent automatiquement
- **Monde toroïdal** : Téléportation aux bords du monde
- **Caméra suivant le joueur** : Vue centrée sur votre serpent

## 🚀 Installation

### Prérequis
- Node.js (version 14 ou supérieure)
- npm ou yarn

### Étapes d'installation

1. **Créer le dossier du projet**
```bash
mkdir slither-io-clone
cd slither-io-clone
```

2. **Créer la structure des fichiers**
```bash
mkdir public
```

3. **Copier les fichiers**
   - Placez `server.js` à la racine
   - Placez `package.json` à la racine
   - Placez `index.html` dans le dossier `public/`

4. **Installer les dépendances**
```bash
npm install
```

5. **Démarrer le serveur**
```bash
npm start
```

Ou pour le développement avec rechargement automatique :
```bash
npm run dev
```

6. **Ouvrir le jeu**
   Ouvrez votre navigateur et allez à : `http://localhost:3000`

## 🎮 Comment jouer

1. **Démarrer** : Entrez votre nom et cliquez sur "Commencer à jouer"
2. **Se déplacer** : Utilisez votre souris pour diriger votre serpent
3. **Grandir** : Mangez la nourriture colorée pour grandir et gagner des points
4. **Éviter** : Ne touchez pas les autres serpents ou vous mourrez
5. **Dominer** : Essayez d'être le serpent le plus long du serveur !

## 🤖 Bots IA

Le jeu inclut 10 bots intelligents qui :
- Cherchent activement la nourriture
- Évitent les bords du monde
- Se comportent de manière réaliste
- Se recréent automatiquement après la mort
- Sont identifiés par le tag "BOT" dans le classement

## ⚙️ Configuration

Vous pouvez modifier les paramètres du jeu dans `server.js` :

```javascript
const GAME_CONFIG = {
    WORLD_WIDTH: 2000,      // Largeur du monde
    WORLD_HEIGHT: 2000,     // Hauteur du monde
    FOOD_COUNT: 200,        // Nombre de nourritures
    BOT_COUNT: 10,          // Nombre de bots
    SNAKE_SPEED: 2,         // Vitesse des serpents
    FOOD_SIZE: 8,           // Taille de la nourriture
    INITIAL_SNAKE_SIZE: 3   // Taille initiale des serpents
};
```

## 🌐 Déploiement

### Déploiement local
Le serveur fonctionne sur le port 3000 par défaut. Vous pouvez le changer avec :
```bash
PORT=8080 npm start
```

### Déploiement sur Heroku
1. Créez un compte Heroku
2. Installez Heroku CLI
3. Dans votre dossier de projet :
```bash
git init
git add .
git commit -m "Initial commit"
heroku create votre-nom-app
git push heroku main
```

### Déploiement sur Railway/Render
1. Connectez votre repository GitHub
2. Sélectionnez Node.js comme environnement
3. La commande de build sera automatiquement `npm install`
4. La commande de démarrage sera `npm start`

## 🔧 Structure du projet

```
slither-io-clone/
├── server.js           # Serveur Node.js avec Socket.io
├── package.json        # Dépendances et scripts
├── README.md          # Documentation
└── public/
    └── index.html     # Client web avec interface
```

## 🎯 Fonctionnalités techniques

### Serveur (Node.js)
- **Express.js** : Serveur web pour servir les fichiers statiques
- **Socket.io** : Communication en temps réel WebSocket
- **Boucle de jeu** : 60 FPS pour des animations fluides
- **Gestion des collisions** : Détection précise des collisions
- **IA des bots** : Algorithmes de recherche de nourriture

### Client (HTML5/JavaScript)
- **Canvas 2D** : Rendu graphique haute performance
- **Caméra dynamique** : Suit le joueur automatiquement
- **Interface moderne** : Design responsive avec effets visuels
- **Gestion des événements** : Contrôles souris fluides

## 🐛 Dépannage

### Le serveur ne démarre pas
- Vérifiez que Node.js est installé : `node --version`
- Vérifiez que les dépendances sont installées : `npm install`
- Vérifiez que le port 3000 n'est pas utilisé

### Les joueurs ne se connectent pas
- Vérifiez que le serveur fonctionne sur `http://localhost:3000`
- Vérifiez la console du navigateur pour les erreurs
- Assurez-vous que le firewall n'bloque pas le port

### Performance lente
- Réduisez `FOOD_COUNT` ou `BOT_COUNT` dans la configuration
- Vérifiez que votre serveur a suffisamment de ressources

## 📝 Licence

Ce projet est sous licence MIT. Vous pouvez l'utiliser, le modifier et le distribuer librement.

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à :
- Signaler des bugs
- Proposer de nouvelles fonctionnalités
- Améliorer le code existant
- Traduire en d'autres langues

---

Amusez-vous bien à jouer ! 🎮🐍