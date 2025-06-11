FROM node:22-alpine

WORKDIR /usr/src/app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm install && npm cache clean --force

# Copier le code de l'application
COPY . .

# Créer le répertoire data
RUN mkdir -p data

# Exposer le port
EXPOSE 3000

# Commande de démarrage
CMD ["node", "server.js"]
