const mongoose = require('mongoose');
const env = require('./env');

module.exports = async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 15000 });
  console.log('MongoDB Atlas connected:', mongoose.connection.name);
};
