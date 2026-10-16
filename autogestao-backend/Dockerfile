FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate && npm run build
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
