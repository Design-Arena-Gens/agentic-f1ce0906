# Agentic Video Pipeline

This repository contains a fully autonomous pipeline that turns a topic prompt into a published YouTube video. The application:

1. Generates an initial narration script.
2. Enhances the script for pacing and storytelling.
3. Produces narration audio and an animated video backdrop.
4. Uploads the rendered clip directly to YouTube.

All of these steps are orchestrated from a single Next.js app optimised for Vercel deployments.

## Project layout

```
app/                     # Next.js application
  app/
    api/run/route.ts     # Orchestrates the full AI + YouTube automation pipeline
    page.tsx             # Interactive dashboard for triggering and monitoring the agent
    page.module.css      # Styling for the dashboard
```

## Getting started

```bash
cd app
npm install
npm run dev
```

The development server runs on `http://localhost:3000`.

## Required environment variables

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Access to OpenAI text, image, and TTS models. |
| `GOOGLE_CLIENT_ID` | OAuth 2 client configured for the YouTube Data API. |
| `GOOGLE_CLIENT_SECRET` | Secret for the OAuth client. |
| `GOOGLE_REFRESH_TOKEN` | Refresh token with YouTube upload scope. |
| `GOOGLE_REDIRECT_URI` *(optional)* | Custom redirect URI used during OAuth. Defaults to Google Playground. |
| `YOUTUBE_PRIVACY_STATUS` *(optional)* | One of `public`, `unlisted`, or `private`. Defaults to `unlisted`. |

Place these variables in a `.env.local` file inside the `app` directory when running locally. On Vercel, add them through the project settings.

## Running the pipeline

1. Launch the dev server and open the root page.
2. Enter a topic, tone, audience, and call-to-action.
3. Click **Run agent** to trigger the end-to-end workflow.
4. The dashboard displays real-time step results and the final YouTube link when publishing succeeds.

## Deployment

The app is configured for zero-config deployment on Vercel:

```bash
cd app
npm run build
npm start
# or deploy straight to Vercel
vercel deploy --prod --yes --token $VERCEL_TOKEN --name agentic-f1ce0906
```

Ensure all required environment variables are configured in the Vercel dashboard before deploying.

## Notes

- Video rendering relies on `ffmpeg-static` and happens in a Node.js serverless function, producing a simple mp4 clip with AI-generated narration and visuals.
- The YouTube upload uses the refresh token flow; the token must have the `https://www.googleapis.com/auth/youtube.upload` scope.
- The generated video is returned to the client as a data URL for quick preview in the dashboard.
