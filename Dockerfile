FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/frontend/dist ./frontend/dist
EXPOSE 8787
CMD ["npm", "run", "start", "-w", "@maintenance/api"]