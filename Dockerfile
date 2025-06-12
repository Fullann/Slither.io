FROM node:22-alpine AS builder

WORKDIR /app

# Copie des fichiers de dépendances
COPY package*.json ./

# Installation des dépendances en mode production
RUN npm i --production

# Copie du code source de l'application
COPY . .

FROM node:22-alpine

WORKDIR /app

# Installation des dépendances nécessaires à l'exécution de sqlite3
RUN apk add --no-cache --virtual .sqlite-libs sqlite-libs

# Copie uniquement les fichiers nécessaires depuis l'étape de build
COPY --from=builder /app ./

# Expose le port utilisé par le serveur (3000 par défaut)
EXPOSE 3000

# Démarre le serveur Node.js
CMD ["node", "server.js"]
