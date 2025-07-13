const redis = require("redis");

const redisClient = redis.createClient({
  url: 'redis://127.0.0.1:6379' // or your Redis URL
});

redisClient.connect().catch(console.error);

module.exports = redisClient;
