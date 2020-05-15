# Use a node alpine image install packages and run the start script
FROM node:12-alpine
WORKDIR /app
EXPOSE 3000
ENV NODE_ENV production
COPY ["package*.json", "/app/"]
RUN npm ci &> /dev/null
COPY ["src", "/app/src"]
ENTRYPOINT [ "node", "src/cli.js" ]
CMD ["serve"]
