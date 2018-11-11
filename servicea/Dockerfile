FROM node:carbon AS build
WORKDIR /srv
ADD package.json .
RUN npm install
ADD . .

FROM node:carbon
COPY --from=build /srv .
EXPOSE 80
CMD ["node", "index.js"]
