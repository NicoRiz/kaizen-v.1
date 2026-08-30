import kaizenAgentHandler from "./kaizen-agent.js";

// Compatibilità non distruttiva per eventuali client V1: tutte le analisi
// passano comunque dall'unico Agente Kaizen e dalle sue regole validate.
export default function legacyJournalAdapter(request, response) {
  if (request.method !== "POST") return kaizenAgentHandler(request, response);
  let body = request.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const date = typeof body?.date === "string" ? body.date : new Date().toISOString().slice(0, 10);
  const adaptedRequest = {
    ...request,
    body: {
      mode: "journal",
      date,
      includeDreams: false,
      journalEntries: [
        ...(Array.isArray(body?.previousJournals) ? body.previousJournals.map((entry) => ({ id: `legacy-journal:${entry.date}`, type: "daily", date: entry.date, freeText: entry.text })) : []),
        { id: `legacy-journal:${date}`, type: "daily", date, freeText: body?.journal || "" },
      ],
      actions: [
        ...(body?.tasks?.planned || []),
        ...(body?.tasks?.completed || []),
        ...(body?.tasks?.uncompleted || []),
      ],
      strategies: (body?.skillsNotes || []).map((note) => ({ id: note.id || note.title, title: note.title, content: note.content })),
      feedback: [],
    },
  };
  return kaizenAgentHandler(adaptedRequest, response);
}
