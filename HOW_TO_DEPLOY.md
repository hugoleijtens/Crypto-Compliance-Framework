# HOW TO DEPLOY

This guide explains how to deploy the Crypto Compliance Framework to Vercel.

## 🚨 Important: Manual Deployment Required

**AI agents cannot deploy directly to Vercel** because they cannot:
- Authenticate with Vercel
- Access your Vercel dashboard
- Use your Vercel credentials

**You must deploy manually** using one of the methods below.

---

## Method 1: GitHub Integration (Recommended) ⭐

This is the **easiest and most automated** approach.

### Step 1: Merge This PR

First, merge this pull request to the `main` branch.

### Step 2: Connect to Vercel

1. Go to **https://vercel.com/dashboard**
2. Click **"Add New..."** → **"Project"**
3. Select **"Import Git Repository"**
4. Find and import **`hugoleijtens/Crypto-Compliance-Framework`**
5. Configure settings:
   - Framework: **Next.js** (auto-detected)
   - Build Command: **`npm run build`** (auto-detected)
   - Output Directory: **`.next`** (auto-detected)
6. Click **"Deploy"**

### Step 3: Automatic Deployments

Once connected, Vercel will automatically:
- ✅ Deploy `main` branch to production on every push
- ✅ Create preview deployments for all pull requests
- ✅ Run builds and tests before deployment

**That's it!** Future deployments are automatic.

---

## Method 2: Vercel CLI (Manual)

Use this method if you prefer command-line deployment.

### Prerequisites

Install Vercel CLI globally:

```bash
npm install -g vercel
```

Or with yarn:

```bash
yarn global add vercel
```

### Login

Authenticate with your Vercel account:

```bash
vercel login
```

### Deploy Using the Helper Script

We've included a deployment script that handles everything:

```bash
./deploy.sh
```

The script will:
1. ✅ Check if Vercel CLI is installed
2. ✅ Verify you're logged in
3. ✅ Ask if you want production or preview deployment
4. ✅ Include commit metadata in the build
5. ✅ Deploy to Vercel
6. ✅ Show post-deployment checklist

### Manual Deployment (Without Script)

If you prefer to deploy manually:

**For Production:**

```bash
vercel --prod \
  -b CCF_COMMIT_SHA="$(git rev-parse HEAD)" \
  -b CCF_COMMIT_TIME="$(git show -s --format=%cI HEAD)"
```

**For Preview:**

```bash
vercel \
  -b CCF_COMMIT_SHA="$(git rev-parse HEAD)" \
  -b CCF_COMMIT_TIME="$(git show -s --format=%cI HEAD)"
```

---

## Method 3: Vercel for GitHub App

This integrates Vercel more deeply with GitHub.

1. Install the **Vercel for GitHub** app
2. Go to **https://github.com/apps/vercel**
3. Click **"Install"** or **"Configure"**
4. Select your repository
5. Vercel will automatically detect and deploy

---

## Post-Deployment Verification

After deployment, test these endpoints (replace `YOUR-URL` with your actual Vercel URL):

```bash
# Set your deployment URL
export SITE_URL="https://crypto-compliance-framework.vercel.app"

# Test homepage
curl -I $SITE_URL

# Check robots.txt
curl -sS $SITE_URL/robots.txt

# Check sitemap
curl -sS $SITE_URL/sitemap.xml | head -20

# Check machine interface
curl -sS $SITE_URL/machine-interface/canonical-definitions.json | head -30

# Check a framework entry
curl -sS $SITE_URL/framework/definitions/crypto-exposure | head -30
```

All endpoints should return **200 OK** with valid content.

---

## Environment Variables

If you need the content pipeline to run on Vercel:

1. Go to **Vercel Dashboard** → Your Project
2. Navigate to **Settings** → **Environment Variables**
3. Add the following (optional):

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Optional | OpenAI API key for canonicalizer agent |
| `OPENAI_MODEL` | Optional | OpenAI model to use (e.g., gpt-4) |
| `OPENAI_BASE_URL` | Optional | Custom OpenAI API base URL |
| `CCF_MAX_DRAFTS_PER_RUN` | Optional | Max drafts per pipeline run |

**Note:** These are only needed if you want to run the agent pipeline. The main site works without them.

---

## Troubleshooting

### Build Fails

**Issue:** Build fails during deployment

**Solutions:**
1. Check build logs in Vercel dashboard
2. Verify `npm run build` works locally
3. Ensure all dependencies are in `package.json`
4. Check for environment variable issues

### Permission Denied

**Issue:** `vercel` command returns "not authenticated"

**Solution:**
```bash
vercel logout
vercel login
```

### CLI Not Found

**Issue:** `vercel: command not found`

**Solution:**
```bash
npm install -g vercel
```

Or check your PATH:
```bash
echo $PATH
npm config get prefix
```

---

## What Happens During Build

The build process runs these steps:

1. **Install dependencies:** `npm install`
2. **Validate content:** `npm run validate`
3. **Generate machine interface:** `npm run generate:machine`
4. **Build Next.js app:** `next build`

Build time: ~2-3 minutes

---

## Production URL

After deployment, your site will be available at:

- **Production:** `https://crypto-compliance-framework.vercel.app`
- **Preview:** `https://crypto-compliance-framework-git-BRANCH.vercel.app`

You can also configure a custom domain in Vercel settings.

---

## Summary

**Recommended Approach:** Use GitHub Integration (Method 1)

1. ✅ Merge this PR to `main`
2. ✅ Go to vercel.com/dashboard
3. ✅ Import the GitHub repository
4. ✅ Click "Deploy"
5. ✅ Done! Future deployments are automatic

**Alternative:** Use `./deploy.sh` with Vercel CLI

---

## Need Help?

- **Vercel Docs:** https://vercel.com/docs
- **Next.js Docs:** https://nextjs.org/docs
- **This Repo:** See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed guide

---

**Ready to deploy?** Choose a method above and follow the steps! 🚀
