import express from 'express';
import cors from 'cors';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

// Middleware
// 🌍 CORS Config: ভার্সেল, লোকালহোস্ট সব জায়গা থেকে সেশন ডাটা অ্যাক্সেস অ্যালাউ করা হলো
app.use(cors({
  origin: [
    "http://localhost:3000", 
    "https://doc-appoint-client-beta.vercel.app" // আপনার ভার্সেলের লাইভ লিংক
  ],
  credentials: true
}));
app.use(express.json());

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("❌ MONGODB_URI is missing in .env file!");
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// কালেকশনগুলো গ্লোবালি ডিক্লেয়ার করা হলো
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
app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, image, password } = req.body;

    if (!email || !password || !name) {
      return res.status(400).send({ success: false, message: "Name, email, and password are required!" });
    }
    
    // ইমেইল অলরেডি ডাটাবেজে আছে কি না চেক করা
    const query = { email: email };
    const existingUser = await usersCollection.findOne(query);
    
    if (existingUser) {
      return res.status(400).send({ success: false, message: "This email address is already registered!" });
    }

    const newUser = {
      name,
      email,
      image: image || "", 
      password,
      role: "patient",
      createdAt: new Date()
    };

    const result = await usersCollection.insertOne(newUser);
    res.status(201).send({ success: true, message: "User registered successfully", insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// 🔒 🆕 ২. POST: User Login Verification
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).send({ success: false, message: "Email and password are required!" });
    }

    const user = await usersCollection.findOne({ email: email });

    // ইউজার ভেরিফিকেশন এবং প্লেন পাসওয়ার্ড চেক
    if (user && user.password === password) {
      const { password, ...userWithoutPassword } = user;
      res.send({ success: true, message: "Login Successful", user: userWithoutPassword });
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
        image: user.image || user.photoURL || "",
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

// 🛠️ ৬. POST: Save appointment data (সংশোধিত রাউট)
app.post('/appointments', async (req, res) => {
  try {
    // ফ্রন্টএন্ডের পাঠানো অবজেক্ট কী-গুলো ডিকনস্ট্রাক্ট করা হচ্ছে
    const { 
      doctorId, 
      doctorName, 
      specialty, 
      patientName, 
      patientEmail, 
      phone, 
      date,          // ফ্রন্টএন্ডে এটি 'date' হিসেবে যাচ্ছে 
      appointmentDate, // ব্যাকআপ ট্র্যাকিং হ্যান্ডলার
      timeSlot,      
      selectedSlot,  // ফ্রন্টএন্ডে এটি 'selectedSlot' হিসেবে যাচ্ছে 
      reason 
    } = req.body;

    // ডাটাবেজে সেভ করার জন্য অবজেক্ট তৈরি (যাতে ফ্রন্টএন্ডের ড্যাশবোর্ড সরাসরি ডাটা রিড করতে পারে)
    const bookingData = {
      doctorId,
      doctorName,
      specialty,
      patientName: patientName || "Anonymous Patient", // ড্যাশবোর্ডের patientName কী (Key) ঠিক করা হলো
      userEmail: patientEmail,    
      phone: phone || "Not Specified",
      date: date || appointmentDate || "Not Specified", // ড্যাশবোর্ডের date কী (Key) ঠিক করা হলো
      timeSlot: timeSlot || selectedSlot || "Not Specified",
      reason: reason || "General Checkup",
      createdAt: new Date()
    };

    const result = await bookingsCollection.insertOne(bookingData);
    res.status(201).send({ success: true, message: "Appointment booked successfully", insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// ৭. GET: Fetch bookings by userEmail
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

// ৮. PUT: Update Booking
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

// ৯. DELETE: Remove Booking
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