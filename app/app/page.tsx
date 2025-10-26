"use client";

import { useMemo, useState } from "react";
import styles from "./page.module.css";

type PipelineStep = {
  id: string;
  label: string;
  status: "idle" | "working" | "done" | "error";
  detail?: string;
};

type PipelineResult = {
  scriptDraft: string;
  enhancedScript: string;
  videoUrl: string;
  youtubeUrl: string;
};

const INITIAL_STEPS: PipelineStep[] = [
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

type RunResponse =
  | { success: true; result: PipelineResult; log: PipelineStep[] }
  | { success: false; error: string; log: PipelineStep[] };

export default function Home() {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("Educational");
  const [duration, setDuration] = useState("120");
  const [audience, setAudience] = useState("General");
  const [callToAction, setCallToAction] = useState("Subscribe for more insights!");

  const [steps, setSteps] = useState<PipelineStep[]>(INITIAL_STEPS);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return topic.trim().length >= 8 && !isRunning;
  }, [topic, isRunning]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);
    setSteps(INITIAL_STEPS);

    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic,
          tone,
          durationSeconds: Number.parseInt(duration, 10),
          audience,
          callToAction,
        }),
      });

      const payload = (await response.json()) as RunResponse;
      setSteps(payload.log);

      if (!payload.success) {
        setError(payload.error);
        return;
      }

      setResult(payload.result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unknown error while executing the pipeline."
      );
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.content}>
        <header className={styles.hero}>
          <div>
            <h1>Autonomous Video Agent</h1>
            <p>
              Generate a topic-driven script, enhance it, render a narrated video,
              and publish it straight to YouTube in one click.
            </p>
          </div>
        </header>
        <section className={styles.panel}>
          <form className={styles.form} onSubmit={onSubmit}>
            <label className={styles.label}>
              Topic
              <textarea
                className={styles.textarea}
                placeholder="Explain quantum computing to beginners..."
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                minLength={8}
                required
              />
            </label>

            <div className={styles.row}>
              <label className={styles.label}>
                Tone
                <input
                  className={styles.input}
                  value={tone}
                  onChange={(event) => setTone(event.target.value)}
                  placeholder="Educational"
                  required
                />
              </label>
              <label className={styles.label}>
                Duration (seconds)
                <input
                  className={styles.input}
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  type="number"
                  min={30}
                  max={600}
                  required
                />
              </label>
            </div>

            <div className={styles.row}>
              <label className={styles.label}>
                Audience
                <input
                  className={styles.input}
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                  placeholder="Tech-curious beginners"
                  required
                />
              </label>
              <label className={styles.label}>
                Call to action
                <input
                  className={styles.input}
                  value={callToAction}
                  onChange={(event) => setCallToAction(event.target.value)}
                  placeholder="Subscribe for more insights!"
                  required
                />
              </label>
            </div>

            <button className={styles.submit} type="submit" disabled={!canSubmit}>
              {isRunning ? "Running pipeline..." : "Run agent"}
            </button>
          </form>
          <aside className={styles.status}>
            <h2>Pipeline</h2>
            <ol className={styles.stepList}>
              {steps.map((step) => {
                if (!step) {
                  return null;
                }
                return (
                  <li key={step.id} className={styles.stepItem}>
                    <div className={styles.stepHeader}>
                      <span className={styles.stepLabel}>{step.label}</span>
                      <span
                        className={`${styles.stepStatus} ${
                          styles[`status-${step.status}`]
                        }`}
                      >
                        {step.status}
                      </span>
                    </div>
                    {step.detail ? (
                      <p className={styles.stepDetail}>{step.detail}</p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            {error ? <p className={styles.error}>⚠️ {error}</p> : null}
            {result ? (
              <div className={styles.result}>
                <h3>Result</h3>
                <div className={styles.resultSection}>
                  <strong>Enhanced script</strong>
                  <pre>{result.enhancedScript}</pre>
                </div>
                <div className={styles.resultSection}>
                  <strong>Video preview</strong>
                  <video
                    className={styles.video}
                    controls
                    src={result.videoUrl}
                    preload="metadata"
                  />
                </div>
                <div className={styles.resultSection}>
                  <strong>YouTube link</strong>
                  <a href={result.youtubeUrl} target="_blank" rel="noreferrer">
                    {result.youtubeUrl}
                  </a>
                </div>
              </div>
            ) : null}
          </aside>
        </section>
      </main>
    </div>
  );
}
