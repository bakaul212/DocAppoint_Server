import express from 'express';
import cors from 'cors';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log("Successfully connected to MongoDB! 🚀");

    const db = client.db("docappoint_db");
    const bookingsCollection = db.collection("bookings");

    // 1. POST: Save appointment data [cite: 63, 65]
    app.post('/appointments', async (req, res) => {
      const booking = req.body;
      const result = await bookingsCollection.insertOne(booking);
      res.status(201).send({ success: true, insertedId: result.insertedId });
    });

    // 2. GET: Fetch bookings by User Email [cite: 137]
    app.get('/my-bookings', async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ message: "Email query parameter required" });
      }
      const query = { userEmail: email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });

    // 3. PUT: Update Booking [cite: 140, 146]
    app.put('/appointments/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedData = req.body;

      // সিকিউরিটি গার্ড: ডাক্তার এবং নিজের ইমেইল আপডেট করা যাবে না [cite: 144]
      delete updatedData.doctorName;
      delete updatedData.userEmail;

      const updateDoc = { $set: updatedData };
      const result = await bookingsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // 4. DELETE: Remove Booking [cite: 151, 152]
    app.delete('/appointments/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingsCollection.deleteOne(query);
      res.send(result);
    });

  } finally {
    // Keeps connection open
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('DocAppoint Server is running smoothly...');
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});