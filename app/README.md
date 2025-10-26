## Agentic Video Producer

This Next.js application automates an end-to-end creative pipeline:

1. Drafts a narration script with OpenAI.
2. Enhances the narration for pacing and story clarity.
3. Generates narration audio plus a cinematic backdrop, then renders a video with FFmpeg.
4. Publishes the rendered clip directly to YouTube using the Data API.

### Local setup

```bash
npm install
npm run dev
```

Create an `.env.local` with the following variables:

```
OPENAI_API_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
```

(Optional) add `GOOGLE_REDIRECT_URI` and `YOUTUBE_PRIVACY_STATUS`.

Open [http://localhost:3000](http://localhost:3000) to drive the pipeline UI. Once satisfied, deploy with:

```bash
vercel deploy --prod --yes --token $VERCEL_TOKEN --name agentic-f1ce0906
```
