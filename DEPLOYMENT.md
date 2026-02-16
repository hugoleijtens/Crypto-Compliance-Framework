# Vercel Deployment Guide

This document provides instructions for deploying the Crypto Compliance Framework to Vercel.

## Prerequisites

1. A Vercel account (sign up at https://vercel.com)
2. Vercel CLI installed (optional, for manual deployments)
3. GitHub repository connected to Vercel

## Automatic Deployment via GitHub Integration

The easiest way to deploy this application to Vercel is through GitHub integration:

### Initial Setup

1. **Connect Repository to Vercel:**
   - Go to https://vercel.com/dashboard
   - Click "Add New Project"
   - Import your GitHub repository: `hugoleijtens/Crypto-Compliance-Framework`
   - Vercel will automatically detect that this is a Next.js project

2. **Configure Project Settings:**
   - **Framework Preset:** Next.js (auto-detected)
   - **Root Directory:** `./` (default)
   - **Build Command:** `npm run build` (auto-detected)
   - **Output Directory:** `.next` (auto-detected)
   - **Install Command:** `npm install` (auto-detected)

3. **Set Environment Variables** (if needed):
   - `OPENAI_API_KEY` - Required for the canonicalizer agent (if you plan to run the pipeline)
   - `OPENAI_MODEL` - Optional, OpenAI model to use
   - `OPENAI_BASE_URL` - Optional, custom OpenAI API base URL
   - `CCF_MAX_DRAFTS_PER_RUN` - Optional, max drafts per pipeline run

4. **Deploy:**
   - Click "Deploy"
   - Vercel will automatically build and deploy your application
   - Once complete, you'll receive a production URL

### Automatic Deployments

Once connected, Vercel will automatically:
- Deploy the `main` branch to production
- Create preview deployments for pull requests
- Redeploy when you push changes to `main`

## Manual Deployment via Vercel CLI

If you prefer to deploy manually using the Vercel CLI:

### Installation

```bash
npm install -g vercel
```

### Login

```bash
vercel login
```

### Deploy

For production deployment:

```bash
vercel --prod
```

For preview deployment:

```bash
vercel
```

### With Build Metadata

To include commit information in the deployment:

```bash
vercel deploy --prod \
  -b CCF_COMMIT_SHA="$(git rev-parse HEAD)" \
  -b CCF_COMMIT_TIME="$(git show -s --format=%cI HEAD)"
```

## Post-Deployment Verification

After deployment, verify the following endpoints are working:

```bash
# Check robots.txt
curl -sS https://crypto-compliance-framework.vercel.app/robots.txt

# Check sitemap
curl -sS https://crypto-compliance-framework.vercel.app/sitemap.xml

# Check a sample framework entry
curl -sS https://crypto-compliance-framework.vercel.app/framework/definitions/crypto-exposure | head

# Check machine interface
curl -sS https://crypto-compliance-framework.vercel.app/machine-interface/canonical-definitions.json | head
```

## Domain Configuration

If you want to use a custom domain:

1. Go to your project settings in Vercel
2. Navigate to "Domains"
3. Add your custom domain
4. Follow the DNS configuration instructions provided by Vercel

## CI/CD Integration

The repository includes GitHub Actions workflows:

- **Build Workflow** (`.github/workflows/build.yml`): Validates and builds on every push/PR
- **Pipeline Workflow** (`.github/workflows/pipeline.yml`): Runs the content pipeline daily

Vercel deployments run independently and can be triggered by GitHub pushes or manually through the Vercel dashboard.

## Troubleshooting

### Build Failures

If the build fails on Vercel:

1. Check the build logs in the Vercel dashboard
2. Ensure all dependencies are listed in `package.json`
3. Verify that `npm run build` works locally
4. Check that environment variables are set correctly

### Content Not Updating

If content changes aren't reflected:

1. Ensure you've pushed changes to GitHub
2. Check that the build completed successfully in Vercel
3. Clear your browser cache
4. Verify that `status: published` is set in the MDX frontmatter

### Machine Interface Issues

If machine interface JSON files are not updating:

1. Verify that `npm run generate:machine` completes successfully
2. Check that the generated files are in the `machine-interface/` directory
3. Ensure the build process includes the machine interface generation step

## Production URLs

After deployment, your application will be available at:

- **Production:** https://crypto-compliance-framework.vercel.app (or your custom domain)
- **Preview:** Unique URLs for each PR (e.g., `crypto-compliance-framework-git-branch-name.vercel.app`)

## Monitoring

Vercel provides:

- Real-time logs
- Analytics (visits, performance metrics)
- Deployment history
- Build logs

Access these through your Vercel dashboard.

## Support

For Vercel-specific issues, consult:
- Vercel Documentation: https://vercel.com/docs
- Next.js Documentation: https://nextjs.org/docs
- Vercel Support: https://vercel.com/support
