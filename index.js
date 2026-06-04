import express from 'express';
import cors from 'cors';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

// Middleware
// 🌍 CORS Config: ভার্সেল, লোকালহোস্ট এবং রেন্ডার ব্যাকএন্ড সব জায়গা থেকেই ডাটা অ্যাক্সেস অ্যালাউ করা হলো
app.use(cors({
  origin: [
    "http://localhost:3000", 
    "https://doc-appoint-client-beta.vercel.app" // আপনার ভার্সেলের লাইভ লিংক
  ],
  credentials: true
}));
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
    
    // 👥 কালেকশন: ইউজার ডাটা রাখার জন্য ম্যাপ করা হলো
    const usersCollection = db.collection("users");

    // 🆕 ১. POST: Register new user (নতুন সাধারণ ইউজার তৈরির এপিআই)
    app.post('/users', async (req, res) => {
      try {
        const user = req.body;
        
        // ইমেইল অলরেডি ডাটাবেজে আছে কি না চেক করা
        const query = { email: user.email };
        const existingUser = await usersCollection.findOne(query);
        
        if (existingUser) {
          return res.status(400).send({ success: false, message: "This email address is already registered!" });
        }

        const result = await usersCollection.insertOne(user);
        res.status(201).send({ success: true, message: "User registered successfully", insertedId: result.insertedId });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // 🌟 🆕 ২. PUT/UPSERT: Social Login User Synchronization (সোশ্যাল লগইন ইউজার হ্যান্ডলিং এপিআই)
    // এটি ফ্রন্টএন্ড বা নেক্সট-অথ থেকে যখনই সোশ্যাল লগইন হবে, ইউজার ডাটাবেজে না থাকলে সেভ করবে, থাকলে আপডেট করবে।
    app.put('/users', async (req, res) => {
      try {
        const user = req.body;
        if (!user?.email) {
          return res.status(400).send({ success: false, message: "Email is required for synchronization!" });
        }
        
        const filter = { email: user.email };
        const options = { upsert: true }; // ডাটাবেজে না থাকলে নিজে থেকেই নতুন ডকুমেন্ট তৈরি করবে
        
        const updateDoc = {
          $set: {
            name: user.name,
            email: user.email,
            photoURL: user.photoURL || user.image || "",
            role: user.role || "patient",
            lastLogin: new Date()
          }
        };

        const result = await usersCollection.updateOne(filter, updateDoc, options);
        res.send({ success: true, message: "Social user synced successfully with MongoDB", result });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // 👥 ৩. GET: Fetch all users (নেক্সট-অথ ভেরিফিকেশনের জন্য ইউজার ডাটা রিড করা)
    app.get('/users', async (req, res) => {
      try {
        const users = await usersCollection.find({}).toArray();
        res.send({ success: true, data: users });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // 👤 ৪. PUT: Update User Profile (প্রোফাইলের নাম ও ছবি মঙ্গোডিবিতে সেভ করার এপিআই)
    app.put('/users/profile', async (req, res) => {
      try {
        const { email, name, image } = req.body;

        if (!email) {
          return res.status(400).send({ success: false, message: "Email is required to update profile!" });
        }

        // ইমেইল দিয়ে ইউজার খোঁজার কুয়েরি
        const filter = { email: email };
        
        // ডাটাবেজে যে ফিল্ডগুলো আপডেট হবে
        const updateDoc = {
          $set: {
            name: name,
            image: image
          }
        };

        // মঙ্গোডিবিতে ইউজারের ডাটা আপডেট করা হচ্ছে
        const result = await usersCollection.updateOne(filter, updateDoc);

        if (result.matchedCount > 0) {
          res.send({ success: true, message: "Profile updated successfully in MongoDB! 👤🎉" });
        } else {
          res.status(404).send({ success: false, message: "User profile not found in database!" });
        }
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // ৫. POST: Save appointment data
    app.post('/appointments', async (req, res) => {
      try {
        const { doctorId, doctorName, specialty, patientName, patientEmail, phone, date, timeSlot } = req.body;

        const bookingData = {
          doctorId,
          doctorName,
          specialty,
          userName: patientName,      
          userEmail: patientEmail,    
          phone,
          date,
          timeSlot,
          createdAt: new Date()
        };

        const result = await bookingsCollection.insertOne(bookingData);
        res.status(201).send({ success: true, message: "Appointment booked successfully", insertedId: result.insertedId });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // ৬. GET: Fetch bookings by userEmail
    app.get('/appointments', async (req, res) => {
      try {
        const { userEmail } = req.query; 
        let query = {};
        
        if (userEmail) {
          query = { userEmail: userEmail }; 
        }

        const bookings = await bookingsCollection.find(query).toArray(); 
        
        res.send({
          success: true,
          message: "Bookings fetched successfully",
          data: bookings
        });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // ७. PUT: Update Booking
    app.put('/appointments/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedData = req.body;

        delete updatedData.doctorName;
        delete updatedData.userEmail;

        const updateDoc = { $set: updatedData };
        const result = await bookingsCollection.updateOne(filter, updateDoc);
        
        if (result.modifiedCount > 0 || result.matchedCount > 0) {
          res.send({ success: true, message: "Updated successfully" });
        } else {
          res.status(404).send({ success: false, message: "Booking not found" });
        }
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // ⒏ DELETE: Remove Booking
    app.delete('/appointments/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await bookingsCollection.deleteOne(query);
        
        if (result.deletedCount > 0) {
          res.send({ success: true, message: "Deleted successfully" });
        } else {
          res.status(404).send({ success: false, message: "Booking not found" });
        }
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
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