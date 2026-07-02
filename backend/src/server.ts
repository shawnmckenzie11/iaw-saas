import app from './app';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`[Server] API running on http://localhost:${PORT}`);
  console.log(`[Server] UI (PWA)  →  http://localhost:3000  (run "npm run dev" from repo root)`);
});
