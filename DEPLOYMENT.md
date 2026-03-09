# Vercel Deployment Guide

This guide explains how to deploy the Park Refine application (both frontend and backend) to Vercel.

## Prerequisites

1. [Vercel Account](https://vercel.com/signup) - Sign up for free
2. GitHub account (already have this ✓)
3. Git installed locally (already have this ✓)

## Deployment Steps

### Step 1: Frontend + Backend Monorepo Setup on Vercel

Since you have both frontend and backend in the same repository, Vercel will automatically detect and deploy both.

#### Option A: Automatic Deployment (Recommended)

1. **Go to [Vercel Dashboard](https://vercel.com/dashboard)**

2. **Click "Add New" → "Project"**

3. **Select your GitHub repo**: `Car-parking-system`
   - If you haven't connected GitHub yet, click "Connect Git Repository"
   - Authorize Vercel to access your GitHub account

4. **Configure Project Settings**:
   - **Project Name**: `park-refine` (or your preferred name)
   - **Framework Preset**: `Vite` (should auto-detect)
   - **Root Directory**: Keep as default `/`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

5. **Add Environment Variables**

   Under "Environment Variables", add:
   ```
   VITE_API_BASE_URL = https://park-refine.vercel.app/api
   ```

6. **Click "Deploy"**

---

### Step 2: Deploy Backend as API Routes (Serverless)

Vercel supports Node.js as serverless functions. Here's how:

#### 2A: Create API Routes Directory

Create a `api/` directory in the root:

```bash
mkdir api
```

#### 2B: Move Backend Routes to API Functions

For each backend route, create a serverless function in `api/`:

**Example: `api/auth.js`**
```javascript
import express from 'express';
import { getDb } from '../server/db.js';

const router = express.Router();
const db = getDb();

// Your auth routes here

module.exports = router;
```

*Or use Vercel's simpler approach:*

Create `api/index.js` as the main API handler:

```javascript
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { getDb } from '../server/db.js';

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN,
  credentials: true
}));

app.use(express.json());

// Import all your routes
import authRoutes from '../server/routes/auth.js';
import customerRoutes from '../server/routes/customers.js';
import sessionRoutes from '../server/routes/sessions.js';

app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/sessions', sessionRoutes);

export default app;
```

---

### Step 3: Environment Variables Setup

1. **In Vercel Dashboard**, go to:
   - Project Settings → Environment Variables

2. **Add these variables**:

   | Variable | Value | Notes |
   |----------|-------|-------|
   | `JWT_SECRET` | `your-production-secret-key` | Generate a strong random string |
   | `FRONTEND_ORIGIN` | `https://your-project.vercel.app` | Your production frontend URL |
   | `VITE_API_BASE_URL` | `https://your-project.vercel.app/api` | API base URL |
   | `SMTP_HOST` | (optional) | For production email |
   | `SMTP_USER` | (optional) | Gmail or SMTP service |
   | `SMTP_PASS` | (optional) | App password or SMTP token |

---

### Step 4: Deploy to Vercel

#### Option 1: Automatic Deployments (Recommended)

Every push to `main` branch automatically triggers a new deployment:

```bash
git add .
git commit -m "chore: add Vercel deployment configuration"
git push origin main
```

Vercel will automatically start the build and deploy!

#### Option 2: Manual CLI Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy project
vercel

# Set as production
vercel --prod
```

---

### Step 5: Verify Deployment

1. **Check Vercel Dashboard**: [https://vercel.com/dashboard](https://vercel.com/dashboard)
2. **Open your deployed site**: `https://your-project.vercel.app`
3. **Test API endpoints**: `https://your-project.vercel.app/api/customers`

---

## Troubleshooting

### Build Fails
- **Error**: "build command exited with code 1"
  - **Solution**: Run `npm run build` locally to see the exact error
  - Check that all imports are correct
  - Verify environment variables are set in Vercel

### API Not Responding
- **Error**: 404 on API routes
  - **Solution**: Verify `VITE_API_BASE_URL` points to correct domain
  - Check that backend routes are correctly exported
  - Verify CORS is configured properly

### Database Connection Issues
- **Error**: SQLite `carpark.db` not found
  - **Solution**: SQLite doesn't persist on Vercel (serverless)
  - **Better approach**: Use PostgreSQL or MongoDB instead
  - Or use Vercel's KV storage for data persistence

---

## Recommended Next Steps

### 1. **Use a Production Database** (Important for Long-term)

SQLite (**current**) → PostgreSQL/MongoDB (**recommended**)

**Using Neon PostgreSQL (free tier)**:
1. Sign up at [https://neon.tech](https://neon.tech)
2. Create a project and copy the connection string
3. Update `server/db.js` to use PostgreSQL instead of SQLite
4. Add `DATABASE_URL` to Vercel environment variables

### 2. **Set Up Custom Domain**
- Go to Vercel Project Settings → Domains
- Add your custom domain (e.g., `parking.yourdomain.com`)

### 3. **Set Up CI/CD Checks**
- Configure branch deployments
- Add preview deployments for pull requests
- Set up automatic rollbacks if needed

### 4. **Monitor Performance**
- Use Vercel Analytics dashboard
- Monitor Serverless Function usage
- Check error logs in real-time

---

## Database Persistence Issue

⚠️ **Important**: SQLite databases don't persist on Vercel because:
- Serverless functions have ephemeral filesystems
- Each deployment creates a fresh environment
- Files are lost after function execution

### Solution: Migrate to PostgreSQL

Update `server/db.js`:

```javascript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export function getDb() {
  // Return pool or wrapper for compatibility
  return pool;
}
```

Install PostgreSQL package:
```bash
npm install pg
```

---

## Contact & Support

- **Vercel Docs**: https://vercel.com/docs
- **Vite Deployment**: https://vitejs.dev/guide/ssr.html
- **Node.js Serverless**: https://vercel.com/docs/functions/nodejs

Good luck with your deployment! 🚀
