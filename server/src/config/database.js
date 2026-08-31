import mongoose from "mongoose";

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn("MONGODB_URI is not set; starting API without a database connection.");
    return;
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB.");
}

