import { normalizeAgentOutput } from "../src/lib/kaizenLoop.js";

const DEFAULT_MODEL = "gpt-5.6-luna";
const MODES = new Set(["gtd-clarification", "focus", "journal", "weekly-review"]);
const MAX_BODY_CHARS = 60000;

const AGENT_PROMPT = `
Sei l'Agente Kaizen, un assistente personale prudente per GTD, Focus, Journal, Oneiros e revisioni settimanali.

Regole inderogabili:
- distingui sempre fatto, osservazione, interpretazione, ipotesi e suggerimento;
- cita recordId e data per ogni osservazione, ipotesi o pattern;
- non inventare eventi, intenzioni o priorità personali;
- non fare diagnosi mediche o psicologiche, giudizi morali o previsioni;
- non trattare sogni o simboli come fatti: ogni relazione con la vita quotidiana è solo un'ipotesi prudente;
- non proporre mai modifiche automatiche: l'utente deve confermare ogni azione o esperimento;
- proponi al massimo 3 suggerimenti concreti;
- un pattern richiede evidenze su almeno due date differenti;
- evita motivazione generica e ripetizioni già rifiutate nel feedback;
- rispondi in italiano e soltanto con lo schema JSON richiesto.
`.trim();

const EVIDENCE_SCHEMA = {
  type: "array",
  maxItems: 12,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["recordId", "date", "excerpt"],
    properties: {
      recordId: { type: "string" },
      date: { type: "string" },
      excerpt: { type: "string" },
    },
  },
};

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "statements", "suggestions", "patterns"],
  properties: {
    summary: { type: "string" },
    statements: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "text", "confidence", "evidence"],
        properties: {
          type: { type: "string", enum: ["fact", "observation", "interpretation", "hypothesis", "suggestion"] },
          text: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          evidence: EVIDENCE_SCHEMA,
        },
      },
    },
    suggestions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "description", "kind", "evidence"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          kind: { type: "string", enum: ["action", "experiment", "reflection"] },
          evidence: EVIDENCE_SCHEMA,
        },
      },
    },
    patterns: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "scope", "confidence", "status", "evidence"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          scope: { type: "string", enum: ["work", "behavior", "energy", "oneiros", "other"] },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          status: { type: "string", enum: ["observed", "confirmed", "rejected", "archived"] },
          evidence: EVIDENCE_SCHEMA,
        },
      },
    },
  },
};

function cleanText(value, max = 5000) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function cleanRecord(value, includeDreams) {
  if (!value || typeof value !== "object") return null;
  if (value.type === "dream" && !includeDreams) return null;
  return {
    id: cleanText(value.id, 300), type: cleanText(value.type, 40), date: cleanText(value.date, 20),
    title: cleanText(value.title, 200), text: cleanText(value.text, 4000), freeText: cleanText(value.freeText, 5000),
    prompts: value.prompts && typeof value.prompts === "object" ? value.prompts : {}, metrics: value.metrics && typeof value.metrics === "object" ? value.metrics : {},
    emotions: Array.isArray(value.emotions) ? value.emotions.slice(0,20).map((item) => cleanText(item,120)) : [], themes: Array.isArray(value.themes) ? value.themes.slice(0,20).map((item) => cleanText(item,120)) : [],
  };
}

export function normalizeAgentRequest(body) {
  if (!body || JSON.stringify(body).length > MAX_BODY_CHARS) throw Object.assign(new Error("Contesto troppo ampio."), { statusCode: 413 });
  const mode = MODES.has(body.mode) ? body.mode : "journal";
  const includeDreams = Boolean(body.includeDreams);
  return {
    mode, date: cleanText(body.date, 20), includeDreams,
    journalEntries: (Array.isArray(body.journalEntries) ? body.journalEntries : []).map((entry) => cleanRecord(entry, includeDreams)).filter(Boolean).slice(0,8),
    actions: (Array.isArray(body.actions) ? body.actions : []).slice(0,40),
    strategies: (Array.isArray(body.strategies) ? body.strategies : []).slice(0,12),
    feedback: (Array.isArray(body.feedback) ? body.feedback : []).slice(-20),
  };
}

function extractOutputText(result) {
  if (typeof result.output_text === "string") return result.output_text;
  return (result.output || []).flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text).join("\n").trim();
}

function sendJson(response, status, payload) { response.status(status).json(payload); }

export default async function handler(request, response) {
  if (request.method !== "POST") { response.setHeader("Allow", "POST"); return sendJson(response, 405, { error: "Metodo non consentito." }); }
  if (!process.env.OPENAI_API_KEY) return sendJson(response, 503, { error: "L'Agente Kaizen non è configurato. Journal, Oneiros e GTD restano disponibili in locale." });
  let input;
  try { input = normalizeAgentRequest(typeof request.body === "string" ? JSON.parse(request.body) : request.body); }
  catch (error) { return sendJson(response, error.statusCode || 400, { error: error.statusCode === 413 ? error.message : "Richiesta non valida." }); }
  try {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 18000);
    const openaiResponse = await fetch("https://api.openai.com/v1/responses", { method: "POST", signal: controller.signal, headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || DEFAULT_MODEL, store: false, input: [{ role: "system", content: AGENT_PROMPT }, { role: "user", content: JSON.stringify(input) }], max_output_tokens: 2200, text: { format: { type: "json_schema", name: "kaizen_agent_output", strict: true, schema: OUTPUT_SCHEMA } } }) });
    clearTimeout(timeout);
    const result = await openaiResponse.json().catch(() => ({}));
    if (!openaiResponse.ok) return sendJson(response, openaiResponse.status === 401 ? 503 : 502, { error: openaiResponse.status === 401 ? "L'Agente Kaizen non è configurato." : "L'analisi non è disponibile in questo momento." });
    const output = extractOutputText(result); const analysis = normalizeAgentOutput(output ? JSON.parse(output) : result.output_parsed);
    if (!analysis) return sendJson(response, 502, { error: "La risposta dell'Agente Kaizen non è valida. Nessun dato è stato modificato." });
    return sendJson(response, 200, { analysis });
  } catch { return sendJson(response, 502, { error: "L'analisi non è disponibile in questo momento. Nessun testo del Journal è stato registrato nella diagnostica." }); }
}
