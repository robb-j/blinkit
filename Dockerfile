# Use a node alpine image install packages and run the start script
FROM node:10-alpine
RUN apk add --no-cache build-base python3
WORKDIR /app
EXPOSE 3000
ENV NODE_ENV production
COPY ["package*.json", "/app/"]
RUN npm ci
COPY ["src", "/app/src"]
ENTRYPOINT [ "node", "src/cli.js" ]
CMD ["serve"]
