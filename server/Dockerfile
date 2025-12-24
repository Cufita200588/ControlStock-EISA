# Imagen base ligera con Node 22
FROM node:22-alpine

WORKDIR /app

# Instala dependencias solo de producción
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copia el resto del código
COPY . .

# Puerto que expone la app (Cloud Run inyecta PORT=8080)
ENV PORT=8080

# Comando de arranque
CMD ["node", "src/index.js"]
