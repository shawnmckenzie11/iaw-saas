import app from './app';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const PORT = process.env.PORT || 3002;
const frontendDist = process.env.FRONTEND_DIST || path.join(process.cwd(), '../frontend/dist');
const servingUi = process.env.SERVE_FRONTEND === 'true' || process.env.NODE_ENV === 'production';

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`[Server] API running on port ${PORT}`);
  if (servingUi) {
    console.log(`[Server] PWA + API served from ${frontendDist}`);
  } else {
    console.log(`[Server] UI (PWA)  →  http://localhost:3000  (run "npm run dev" from repo root)`);
  }
});
