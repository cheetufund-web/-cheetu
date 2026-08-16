import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not configured");

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 7000, connectTimeoutMS: 7000 });
try {
  await client.connect();
  const db = client.db("kukkal_seat_chits");
  const ping = await db.command({ ping: 1 });
  const [groups, members, payments, auctions] = await Promise.all([
    db.collection("chitGroups").countDocuments(),
    db.collection("members").countDocuments(),
    db.collection("payments").countDocuments(),
    db.collection("auctions").countDocuments(),
  ]);
  console.log(JSON.stringify({ ping: ping.ok === 1, database: db.databaseName, counts: { groups, members, payments, auctions } }));
} finally {
  await client.close();
}
