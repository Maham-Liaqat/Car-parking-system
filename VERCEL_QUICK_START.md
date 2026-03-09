# Quick Start: Deploy to Vercel in 5 Minutes

## 🚀 One-Click Deployment

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FMaham-Liaqat%2FCar-parking-system&env=JWT_SECRET,VITE_API_BASE_URL,FRONTEND_ORIGIN&envDescription=Required%20environment%20variables%20for%20deployment)

---

## 📋 Manual Deployment Steps

### 1. **Connect Your Repository to Vercel**

```bash
# Go to https://vercel.com/dashboard
# Click "Add New" → "Project"
# Select your GitHub repository: "Car-parking-system"
```

### 2. **Configure Build Settings**

**Project Settings:**
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### 3. **Add Environment Variables**

In Vercel Dashboard → Project Settings → Environment Variables:

```
JWT_SECRET=your-production-secret-key
VITE_API_BASE_URL=https://your-app.vercel.app/api
FRONTEND_ORIGIN=https://your-app.vercel.app
```

**Generate a secure JWT_SECRET:**
```bash
# On your terminal, run:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. **Deploy!**

Click the "Deploy" button. Vercel will:
1. Build your Vite app
2. Run tests and linting
3. Deploy to CDN
4. Provide you a live URL

---

## ✅ After Deployment

1. **Visit your live site**: `https://your-app.vercel.app`
2. **Test API endpoints**: `https://your-app.vercel.app/api/customers`
3. **Monitor performance**: Vercel Dashboard → Analytics
4. **View logs**: Vercel Dashboard → Deployments → Logs

---

## 🔑 Environment Variables Explained

| Variable | Purpose | Example |
|----------|---------|---------|
| `JWT_SECRET` | Signs authentication tokens | `abc123def456...` |
| `VITE_API_BASE_URL` | Frontend API endpoint | `https://your-app.vercel.app/api` |
| `FRONTEND_ORIGIN` | CORS origin for backend | `https://your-app.vercel.app` |

---

## 🗄️ Database Setup (Important!)

⚠️ **SQLite doesn't persist on Vercel** (serverless environment)

### Option A: Use Neon PostgreSQL (Recommended)

1. Sign up: https://neon.tech
2. Create a database and copy connection string
3. Update your backend to use PostgreSQL
4. Add `DATABASE_URL` to Vercel environment variables

### Option B: Use MongoDB Atlas

1. Create account: https://www.mongodb.com/cloud/atlas
2. Create a cluster and connection string
3. Update backend to use MongoDB
4. Add `MONGODB_URI` to Vercel environment variables

---

## 🔄 Automatic Re-deployment

Every push to your GitHub `main` branch triggers automatic deployment:

```bash
git add .
git commit -m "feature: add new feature"
git push origin main
# Vercel automatically deploys! 🚀
```

---

## 📊 Deployment Monitoring

Monitor your deployment health:

```bash
vercel logs production
vercel env ls
vercel deployments
```

Or use the web dashboard: https://vercel.com/dashboard

---

## ❓ Troubleshooting

### Build fails
```bash
npm run build  # Test locally first
```

### API 404 errors
- Check `VITE_API_BASE_URL` environment variable
- Verify backend routes are properly configured

### Database errors
- Migrate from SQLite to PostgreSQL/MongoDB
- Ensure `DATABASE_URL` is set in environment variables

---

## 🎯 Next Steps

1. ✅ Deploy frontend and backend
2. 📧 Set up SMTP for production emails
3. 🔐 Use a real database (PostgreSQL/MongoDB)
4. 🌐 Add custom domain
5. 📈 Monitor analytics and performance

**Need help?** See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed guide.

Good luck! 🎉
