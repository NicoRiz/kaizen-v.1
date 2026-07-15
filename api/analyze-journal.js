import { normalizeJournalAnalysis } from "../src/lib/journal.js";
import { JOURNAL_ANALYST_PROMPT } from "../src/lib/journalAnalystPrompt.js";

const DEFAULT_MODEL = "gpt-5.6-luna";
const MAX_BODY_CHARS = 60000;
const MAX_JOURNAL_CHARS = 12000;
const MAX_PREVIOUS_JOURNAL_CHARS = 6000;
const MAX_SKILL_NOTE_CHARS = 3000;
const MAX_TASK_TITLE_CHARS = 240;

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "progress",
    "obstacles",
    "hypotheses",
    "suggestedSteps",
    "patterns",
  ],
  properties: {
    summary: { type: "string" },
    progress: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "evidence"],
        properties: {
          title: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
    obstacles: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "recurring"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          recurring: { type: "boolean" },
        },
      },
    },
    hypotheses: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "confidence"],
        properties: {
          description: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
      },
    },
    suggestedSteps: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "sourceActivity", "type"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          sourceActivity: { type: "string" },
          type: { type: "string", enum: ["next_step", "experiment", "habit"] },
        },
      },
    },
    patterns: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "evidence"],
        properties: {
          name: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
  },
};

function sendJson(response, status, payload) {
  response.status(status).json(payload);
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function parseBody(body) {
  if (!body) {
    return {};
  }

  if (typeof body === "string") {
    return JSON.parse(body);
  }

  return body;
}

function normalizeInput(body) {
  const serializedLength = JSON.stringify(body).length;

  if (serializedLength > MAX_BODY_CHARS) {
    const error = new Error("Il journal e il contesto sono troppo lunghi.");
    error.statusCode = 413;
    throw error;
  }

  const journal = cleanText(body.journal, MAX_JOURNAL_CHARS);

  if (!journal) {
    const error = new Error("Scrivi qualcosa nel journal prima di analizzarlo.");
    error.statusCode = 400;
    throw error;
  }

  return {
    date: cleanText(body.date, 20),
    journal,
    tasks: {
      planned: normalizeTasks(body.tasks?.planned),
      completed: normalizeTasks(body.tasks?.completed),
      uncompleted: normalizeTasks(body.tasks?.uncompleted),
      postponementCount: Math.max(0, Number(body.tasks?.postponementCount) || 0),
    },
    previousJournals: Array.isArray(body.previousJournals)
      ? body.previousJournals.slice(0, 7).map((entry) => ({
          date: cleanText(entry?.date, 20),
          text: cleanText(entry?.text, MAX_PREVIOUS_JOURNAL_CHARS),
        }))
      : [],
    skillsNotes: Array.isArray(body.skillsNotes)
      ? body.skillsNotes.slice(0, 20).map((note) => ({
          title: cleanText(note?.title, 160),
          content: cleanText(note?.content, MAX_SKILL_NOTE_CHARS),
          updatedAt: cleanText(note?.updatedAt, 40),
        }))
      : [],
  };
}

function normalizeTasks(tasks) {
  if (!Array.isArray(tasks)) {
    return [];
  }

  return tasks.slice(0, 80).map((task) => ({
    title: cleanText(task?.title, MAX_TASK_TITLE_CHARS),
    type: cleanText(task?.type, 80),
    postponeCount: Math.max(0, Number(task?.postponeCount) || 0),
    completed: Boolean(task?.completed),
  }));
}

function extractOutputText(result) {
  if (typeof result.output_text === "string") {
    return result.output_text;
  }

  const texts = [];

  for (const outputItem of result.output || []) {
    for (const contentItem of outputItem.content || []) {
      if (contentItem.type === "output_text" && contentItem.text) {
        texts.push(contentItem.text);
      }
    }
  }

  return texts.join("\n").trim();
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Metodo non consentito." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return sendJson(response, 503, {
      error: "Kaizen Analyst non è ancora configurato.",
    });
  }

  let input;

  try {
    input = normalizeInput(parseBody(request.body));
  } catch (error) {
    return sendJson(response, error.statusCode || 400, {
      error: error.message || "Richiesta non valida.",
    });
  }

  try {
    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        store: false,
        input: [
          {
            role: "system",
            content: JOURNAL_ANALYST_PROMPT,
          },
          {
            role: "user",
            content: JSON.stringify(input),
          },
        ],
        max_output_tokens: 1800,
        text: {
          format: {
            type: "json_schema",
            name: "kaizen_journal_analysis",
            strict: true,
            schema: ANALYSIS_SCHEMA,
          },
        },
      }),
    });

    const result = await openaiResponse.json().catch(() => ({}));

    if (!openaiResponse.ok) {
      return sendJson(response, openaiResponse.status === 401 ? 503 : 502, {
        error:
          openaiResponse.status === 401
            ? "Kaizen Analyst non è ancora configurato."
            : "Kaizen Analyst non è riuscito a completare l'analisi.",
      });
    }

    const outputText = extractOutputText(result);
    const parsed = outputText ? JSON.parse(outputText) : result.output_parsed;
    const analysis = normalizeJournalAnalysis(parsed);

    if (!analysis) {
      return sendJson(response, 502, {
        error: "Kaizen Analyst ha restituito una risposta non valida.",
      });
    }

    return sendJson(response, 200, { analysis });
  } catch {
    return sendJson(response, 502, {
      error: "Kaizen Analyst non è riuscito a completare l'analisi.",
    });
  }
}
