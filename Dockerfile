FROM node:22-alpine

# Créer un utilisateur non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Définir le répertoire de travail
WORKDIR /usr/src/app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm install && npm cache clean --force

# Changer vers l'utilisateur nodejs
USER nodejs

# Copier le code de l'application
COPY --chown=nodejs:nodejs . .

# Créer le répertoire pour la base de données
RUN mkdir -p data

# Exposer le port
EXPOSE 3000

# Vérification de santé
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

# Commande de démarrage
CMD ["node", "server.js"]
