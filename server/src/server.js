import "dotenv/config";

import app from "./app.js";
import { connectDatabase } from "./config/database.js";

const port = Number(process.env.PORT || 5000);

async function startServer() {
  await connectDatabase();

  app.listen(port, () => {
    console.log(`RecoverAI API listening on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Unable to start RecoverAI API", error);
  process.exit(1);
});

