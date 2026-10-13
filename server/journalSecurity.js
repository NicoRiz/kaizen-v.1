// Per-process protection only: serverless instances do not share this memory.
// A durable global budget requires a separately approved database/service change.
export function createJournalLimiter({ now = Date.now } = {}) {
  const users = new Map();
  const hour = 60 * 60 * 1000;
  return {
    acquire(userId) {
      const time = now();
      for (const [id, state] of users) {
        state.attempts = state.attempts.filter((at) => at > time - hour);
        if (!state.active && !state.attempts.length) users.delete(id);
      }
      const state = users.get(userId) || { active: false, attempts: [] };
      const recent = state.attempts.filter((at) => at > time - 60000);
      let retryAfter = 0;
      if (state.active) retryAfter = 30;
      else if (recent.length >= 2) retryAfter = Math.ceil((recent[0] + 60000 - time) / 1000);
      else if (state.attempts.length >= 10) retryAfter = Math.ceil((state.attempts[0] + hour - time) / 1000);
      else if (!users.has(userId) && users.size >= 1000) retryAfter = 60;
      if (retryAfter) return { allowed: false, retryAfter };
      state.attempts.push(time);
      state.active = true;
      users.set(userId, state);
      return { allowed: true, release: () => { state.active = false; } };
    },
  };
}

export async function authenticateJournalRequest(request, env, fetchImpl) {
  const authorization = request.headers?.authorization;
  if (typeof authorization !== "string" || !/^Bearer \S+$/i.test(authorization) || authorization.length > 8192) {
    return { status: 401, code: "AUTH_REQUIRED", error: "Accedi per analizzare il journal." };
  }
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return { status: 503, code: "AUTH_UNAVAILABLE", error: "Verifica della sessione non configurata." };
  }
  try {
    const response = await fetchImpl(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: key, Authorization: authorization },
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    if (!response.ok) {
      const invalid = response.status === 401 || response.status === 403;
      return { status: invalid ? 401 : 503, code: invalid ? "AUTH_REQUIRED" : "AUTH_UNAVAILABLE",
        error: invalid ? "Sessione scaduta o non valida. Accedi nuovamente." : "Verifica della sessione temporaneamente non disponibile." };
    }
    const user = await response.json();
    if (!user.id || user.role !== "authenticated" || user.is_anonymous) {
      return { status: 401, code: "AUTH_REQUIRED", error: "Accedi per analizzare il journal." };
    }
    return { userId: user.id };
  } catch {
    return { status: 503, code: "AUTH_UNAVAILABLE", error: "Verifica della sessione temporaneamente non disponibile." };
  }
}
