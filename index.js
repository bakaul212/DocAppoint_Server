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
    
    // 👥 নতুন কালেকশন: ইউজার ডাটা রাখার জন্য ম্যাপ করা হলো
    const usersCollection = db.collection("users");

    // 🆕 ১. POST: Register new user (নতুন ইউজার তৈরির এপিআই)
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

    // ২. POST: Save appointment data (বুকিং পেজের সাথে ফিল্ড সামঞ্জস্য করা হয়েছে)
    app.post('/appointments', async (req, res) => {
      try {
        const { doctorId, doctorName, specialty, patientName, patientEmail, phone, date, timeSlot } = req.body;

        // মঙ্গোডিবিতে সেভ করার আগে আপনার ড্যাশবোর্ডের স্কিমার সাথে মিল রেখে অবজেক্ট তৈরি
        const bookingData = {
          doctorId,
          doctorName,
          specialty,
          userName: patientName,      // আপনার ড্যাশবোর্ডের patientName ফিল্ড
          userEmail: patientEmail,    // GET এপিআই এর ফিল্টারিং এর জন্য userEmail
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

    // ৩. GET: Fetch bookings by userEmail (ড্যাশবোর্ড ডাটা লোড করার জন্য ফিক্সড রুট)
    app.get('/appointments', async (req, res) => {
      try {
        const { userEmail } = req.query; // ফ্রন্টএন্ড থেকে পাঠানো userEmail ধরা হচ্ছে
        let query = {};
        
        if (userEmail) {
          query = { userEmail: userEmail }; // মঙ্গোডিবি ফিল্টারিং অবজেক্ট
        }

        // মঙ্গোডিবি কালেকশন থেকে ডাটা খোঁজা হচ্ছে
        const bookings = await bookingsCollection.find(query).toArray(); 
        
        // ফ্রন্টএন্ডের স্টেট স্ট্রাকচারের সাথে মিল রেখে রেসপন্স পাঠানো হচ্ছে
        res.send({
          success: true,
          message: "Bookings fetched successfully",
          data: bookings
        });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // ৪. PUT: Update Booking
    app.put('/appointments/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedData = req.body;

        // সিকিউরিটি গার্ড: ডাক্তার এবং নিজের ইমেইল আপডেট করা যাবে না
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

    // ৫. DELETE: Remove Booking
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