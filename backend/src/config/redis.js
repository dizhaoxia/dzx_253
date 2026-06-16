const redis = require('redis');

let client = null;
let isConnected = false;

const initRedis = async () => {
  try {
    client = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    client.on('error', (err) => {
      console.error('Redis Client Error:', err.message);
      isConnected = false;
    });

    client.on('connect', () => {
      console.log('Redis connected successfully');
      isConnected = true;
    });

    client.on('ready', () => {
      isConnected = true;
    });

    await client.connect();
    return client;
  } catch (error) {
    console.error('Failed to connect to Redis, will fall back to in-memory cache:', error.message);
    isConnected = false;
    return null;
  }
};

const getRedisClient = () => client;
const isRedisConnected = () => isConnected;

const memoryCache = new Map();

const setCache = async (key, value, ttlSeconds) => {
  try {
    if (isConnected && client) {
      if (ttlSeconds) {
        await client.setEx(key, ttlSeconds, JSON.stringify(value));
      } else {
        await client.set(key, JSON.stringify(value));
      }
    } else {
      memoryCache.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
    }
  } catch (e) {
    console.error('setCache error:', e.message);
  }
};

const getCache = async (key) => {
  try {
    if (isConnected && client) {
      const data = await client.get(key);
      return data ? JSON.parse(data) : null;
    } else {
      const cached = memoryCache.get(key);
      if (!cached) return null;
      if (cached.expiresAt && Date.now() > cached.expiresAt) {
        memoryCache.delete(key);
        return null;
      }
      return cached.value;
    }
  } catch (e) {
    console.error('getCache error:', e.message);
    return null;
  }
};

const delCache = async (key) => {
  try {
    if (isConnected && client) {
      await client.del(key);
    } else {
      memoryCache.delete(key);
    }
  } catch (e) {
    console.error('delCache error:', e.message);
  }
};

module.exports = { initRedis, getRedisClient, isRedisConnected, setCache, getCache, delCache };
