import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StepStatus = "idle" | "working" | "done" | "error";

type StepLog = {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
};

const STEP_TEMPLATE: StepLog[] = [
  {
    id: "script",
    label: "Generate base script",
    status: "idle",
  },
  {
    id: "enhance",
    label: "Enhance script",
    status: "idle",
  },
  {
    id: "video",
    label: "Render video",
    status: "idle",
  },
  {
    id: "upload",
    label: "Publish to YouTube",
    status: "idle",
  },
];

const requestSchema = z.object({
  topic: z.string().min(8, "Topic must be at least 8 characters."),
  tone: z.string().min(3).max(64),
  durationSeconds: z.number().min(30).max(900),
  audience: z.string().min(3).max(120),
  callToAction: z.string().min(3).max(180),
});

const REQUIRED_ENV_VARS = [
  "OPENAI_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
];

if (!ffmpegStatic) {
  throw new Error("ffmpeg-static binary not found. Ensure ffmpeg-static is installed.");
}

ffmpeg.setFfmpegPath(ffmpegStatic);

function cloneStepLog(): StepLog[] {
  return STEP_TEMPLATE.map((step) => ({ ...step }));
}

function setStepStatus(log: StepLog[], id: string, status: StepStatus, detail?: string) {
  const entry = log.find((step) => step?.id === id);
  if (!entry) {
    return;
  }
  entry.status = status;
  entry.detail = detail;
}

async function ensureEnv(): Promise<string[]> {
  return REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
}

async function generateScriptDraft(params: {
  topic: string;
  tone: string;
  durationSeconds: number;
  audience: string;
}, openai: OpenAI) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a seasoned video script writer. Produce structured narration with scene suggestions and clear pacing cues.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Topic: ${params.topic}
Target audience: ${params.audience}
Tone: ${params.tone}
Desired duration: ${params.durationSeconds} seconds

Create a narration script with:
- Hook
- Three supporting segments (each with on-screen direction cues)
- Closing with call-to-action placeholder
- Estimated duration per segment
- Short list of suggested accompanying visuals`,
          },
        ],
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Failed to generate script draft.");
  }
  return content;
}

async function enhanceScript(params: {
  draft: string;
  topic: string;
  tone: string;
  callToAction: string;
  audience: string;
}, openai: OpenAI) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "You elevate scripts into polished YouTube-ready narration. Improve flow, add storytelling beats, and end with the supplied call-to-action. Maintain length and respect the audience level.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Topic: ${params.topic}
Audience: ${params.audience}
Preferred tone: ${params.tone}
Call to action: ${params.callToAction}

Script draft:
${params.draft}

Refine the narration. Keep the structure, tighten pacing, add vivid transitions, and explicitly include the call-to-action in the closing.`,
          },
        ],
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Failed to enhance script.");
  }
  return content;
}

async function generateAssets(enhancedScript: string, topic: string, openai: OpenAI) {
  const [speechResponse, imageResponse] = await Promise.all([
    openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: enhancedScript,
    }),
    openai.images.generate({
      model: "gpt-image-1",
      prompt: `Create a cinematic, modern, and high-contrast wide background image that illustrates the theme: ${topic}. Avoid text. Futurist lighting with gradients.`,
      size: "1024x1024",
      response_format: "b64_json",
    }),
  ]);

  const audioBuffer = Buffer.from(await speechResponse.arrayBuffer());
  const imageBase64 = imageResponse.data?.[0]?.b64_json ?? null;
  if (!imageBase64) {
    throw new Error("Image generation failed.");
  }
  const imageBuffer = Buffer.from(imageBase64, "base64");

  return { audioBuffer, imageBuffer };
}

async function synthesizeVideo(audioBuffer: Buffer, imageBuffer: Buffer) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-"));
  const audioPath = path.join(tempDir, `audio-${randomUUID()}.mp3`);
  const imagePath = path.join(tempDir, `image-${randomUUID()}.png`);
  const videoPath = path.join(tempDir, `video-${randomUUID()}.mp4`);

  try {
    await fs.writeFile(audioPath, audioBuffer);
    await fs.writeFile(imagePath, imageBuffer);

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(imagePath)
        .inputOptions(["-loop 1"])
        .input(audioPath)
        .outputOptions([
          "-c:v libx264",
          "-tune stillimage",
          "-c:a aac",
          "-b:a 192k",
          "-pix_fmt yuv420p",
          "-shortest",
        ])
        .on("end", () => resolve())
        .on("error", (error) => reject(error))
        .save(videoPath);
    });

    const videoBuffer = await fs.readFile(videoPath);
    return videoBuffer;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function uploadToYouTube(params: {
  videoBuffer: Buffer;
  title: string;
  description: string;
  tags: string[];
}) {
  const oauth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ?? "https://developers.google.com/oauthplayground"
  );

  oauth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  const youtube = google.youtube("v3");

  const response = await youtube.videos.insert({
    auth: oauth,
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: params.title,
        description: params.description,
        tags: params.tags,
      },
      status: {
        privacyStatus: process.env.YOUTUBE_PRIVACY_STATUS ?? "unlisted",
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: Readable.from(params.videoBuffer),
    },
  });

  const videoId = response.data.id;
  if (!videoId) {
    throw new Error("Unable to retrieve YouTube video ID after upload.");
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
}

export async function POST(request: Request) {
  const log = cloneStepLog();

  try {
    const missingEnv = await ensureEnv();
    if (missingEnv.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Missing required environment variables: ${missingEnv.join(", ")}`,
          log,
        },
        { status: 500 }
      );
    }

    const json = await request.json();
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues.map((issue) => issue.message).join("; "),
          log,
        },
        { status: 400 }
      );
    }

    const { topic, tone, durationSeconds, audience, callToAction } = parsed.data;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    setStepStatus(log, "script", "working", "Drafting narration...");
    const scriptDraft = await generateScriptDraft(
      { topic, tone, durationSeconds, audience },
      openai
    );
    const draftWordCount = scriptDraft.split(/\s+/).length;
    setStepStatus(
      log,
      "script",
      "done",
      `Draft complete (${draftWordCount} words).`
    );

    setStepStatus(log, "enhance", "working", "Polishing presentation...");
    const enhancedScript = await enhanceScript(
      { draft: scriptDraft, topic, tone, callToAction, audience },
      openai
    );
    const enhancedWordCount = enhancedScript.split(/\s+/).length;
    setStepStatus(
      log,
      "enhance",
      "done",
      `Enhanced script ready (${enhancedWordCount} words).`
    );

    setStepStatus(log, "video", "working", "Rendering narration and visuals...");
    const { audioBuffer, imageBuffer } = await generateAssets(
      enhancedScript,
      topic,
      openai
    );
    const videoBuffer = await synthesizeVideo(audioBuffer, imageBuffer);
    const videoSizeMb = (videoBuffer.byteLength / (1024 * 1024)).toFixed(2);
    setStepStatus(
      log,
      "video",
      "done",
      `Video rendered (${videoSizeMb} MB).`
    );

    setStepStatus(log, "upload", "working", "Uploading to YouTube...");
    const videoTitle = `${topic} | ${tone} explainer`;
    const videoDescription = `${enhancedScript}

---
Call to action: ${callToAction}
Audience: ${audience}
Automated by Agentic Studio.`;

    const youtubeUrl = await uploadToYouTube({
      videoBuffer,
      title: videoTitle.slice(0, 95),
      description: videoDescription.slice(0, 4800),
      tags: ["AI", "Automation", "YouTube Agent", topic.slice(0, 60)],
    });
    setStepStatus(
      log,
      "upload",
      "done",
      `Published to ${youtubeUrl}.`
    );

    const videoDataUrl = `data:video/mp4;base64,${videoBuffer.toString("base64")}`;

    return NextResponse.json({
      success: true,
      result: {
        scriptDraft,
        enhancedScript,
        videoUrl: videoDataUrl,
        youtubeUrl,
      },
      log,
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    const failingStep = log.find((step) => step.status === "working");
    if (failingStep) {
      setStepStatus(log, failingStep.id, "error", detail);
    }
    return NextResponse.json(
      {
        success: false,
        error: detail,
        log,
      },
      { status: 500 }
    );
  }
}
