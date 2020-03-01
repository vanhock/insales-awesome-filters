const MongoClient = require("mongodb").MongoClient;
const objectId = require("mongodb").ObjectID;
const uri = `mongodb+srv://root:${process.env.DB_PASSWORD}@${process.env.DB_URL}/test?retryWrites=true&w=majority`;
const mongoClient = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
module.exports = { mongoClient, objectId };
