import { useState } from "react";

export default function AuthScreen({ error, isConfigured, onSubmit }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!email.trim() || !password) {
      return;
    }

    setIsSubmitting(true);
    await onSubmit(email.trim(), password, mode);
    setIsSubmitting(false);
  }

  return (
    <div className="auth-shell">
      <main className="auth-panel">
        <p className="eyebrow">Kaizen Sync</p>
        <h1>KAIZEN</h1>

        <div className="segmented-control segmented-control--wide auth-toggle">
          <button
            className={mode === "signin" ? "is-selected" : ""}
            onClick={() => setMode("signin")}
            type="button"
          >
            Login
          </button>
          <button
            className={mode === "signup" ? "is-selected" : ""}
            onClick={() => setMode("signup")}
            type="button"
          >
            Crea account
          </button>
        </div>

        {!isConfigured && (
          <p className="form-error">
            Configurazione Supabase mancante. Imposta le variabili Vite prima del login.
          </p>
        )}

        <form className="task-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              autoComplete="email"
              disabled={!isConfigured || isSubmitting}
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </label>
          <label>
            Password
            <input
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              disabled={!isConfigured || isSubmitting}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button
            className="submit-button"
            disabled={!isConfigured || isSubmitting || !email.trim() || !password}
            type="submit"
          >
            {isSubmitting
              ? "Attendi..."
              : mode === "signin"
                ? "Entra"
                : "Crea account"}
          </button>
        </form>
      </main>
    </div>
  );
}
