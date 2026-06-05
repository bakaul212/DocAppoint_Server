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

// কালেকশনগুলো গ্লোবালি ডিক্লেয়ার করা হলো যাতে সব রাউট এগুলো অ্যাক্সেস করতে পারে
let bookingsCollection;
let usersCollection;

async function run() {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log("Successfully connected to MongoDB! 🚀");

    const db = client.db("docappoint_db");
    bookingsCollection = db.collection("bookings");
    usersCollection = db.collection("users");

  } catch (error) {
    console.error("MongoDB Connection Error: ", error);
  }
}
run().catch(console.dir);

// ==========================================
// 👥 USER & AUTHENTICATION ENDPOINTS
// ==========================================

// 🆕 ১. POST: Register new user
app.post('/users', async (req, res) => {
  try {
    const user = req.body;
    
    // ইমেইল অলরেডি ডাটাবেজে আছে কি না চেক করা
    const query = { email: user.email };
    const existingUser = await usersCollection.findOne(query);
    
    if (existingUser) {
      return res.status(400).send({ success: false, message: "This email address is already registered!" });
    }

    // ডাটাবেজে ইউজার রোল ডিফল্ট "patient" হিসেবে সেট করা
    if (!user.role) {
      user.role = "patient";
    }

    const result = await usersCollection.insertOne(user);
    res.status(201).send({ success: true, message: "User registered successfully", insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// 🔒 🆕 ২. POST: User Login Verification (Next-Auth Credentials Call)
// এই এন্ডপয়েন্টটি আপনার ফ্রন্টএন্ডের Next-Auth এর authorize ব্লকে fetch এর মাধ্যমে কল করবেন
app.post('/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).send({ success: false, message: "Email and password are required!" });
    }

    const user = await usersCollection.findOne({ email: email });

    // ইউজার ভেরিফিকেশন এবং পাসওয়ার্ড চেক
    if (user && user.password === password) {
      // সিকিউরিটির জন্য রেসপন্স থেকে পাসওয়ার্ড বাদ দিয়ে পাঠানো হচ্ছে
      const { password, ...userWithoutPassword } = user;
      res.send({ success: true, user: userWithoutPassword });
    } else {
      res.status(401).send({ success: false, message: "Invalid email or password!" });
    }
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// 🌟 ৩. PUT/UPSERT: Social Login User Synchronization
app.put('/users', async (req, res) => {
  try {
    const user = req.body;
    if (!user?.email) {
      return res.status(400).send({ success: false, message: "Email is required for synchronization!" });
    }
    
    const filter = { email: user.email };
    const options = { upsert: true };
    
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

// 👥 ৪. GET: Fetch all users
app.get('/users', async (req, res) => {
  try {
    const users = await usersCollection.find({}).toArray();
    res.send({ success: true, data: users });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// 👤 ৫. PUT: Update User Profile
app.put('/users/profile', async (req, res) => {
  try {
    const { email, name, image } = req.body;

    if (!email) {
      return res.status(400).send({ success: false, message: "Email is required to update profile!" });
    }

    const filter = { email: email };
    const updateDoc = {
      $set: {
        name: name,
        image: image
      }
    };

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

// ==========================================
// 🩺 APPOINTMENT / BOOKING ENDPOINTS
// ==========================================

// ৬. POST: Save appointment data
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

// ૭. GET: Fetch bookings by userEmail
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

// ⒏ PUT: Update Booking
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

// 🪓 算法. DELETE: Remove Booking
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

// Base Route
app.get('/', (req, res) => {
  res.send('DocAppoint Server is running smoothly...');
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});