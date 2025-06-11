FROM node:22-alpine

# Créer un utilisateur non-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Définir le répertoire de travail
WORKDIR /usr/src/app

# Copier les fichiers de dépendances
COPY package*.json ./

# Changer vers l'utilisateur nodejs avant l'installation
USER nodejs

# Installer les dépendances
RUN npm ci --only=production

# Copier le code de l'application
COPY --chown=nodejs:nodejs . .

# Exposer le port
EXPOSE 3000

# Commande de démarrage
CMD ["node", "server.js"]
