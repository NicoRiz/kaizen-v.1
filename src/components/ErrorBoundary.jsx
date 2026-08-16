import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Kaizen render error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="auth-shell">
          <main className="auth-panel">
            <p className="eyebrow">Kaizen</p>
            <h1>KAIZEN</h1>
            <p className="form-error">
              Kaizen ha riscontrato un problema locale. I dati cloud non sono stati
              modificati.
            </p>
            <button
              className="submit-button"
              onClick={() => window.location.reload()}
              type="button"
            >
              Riprova
            </button>
          </main>
        </div>
      );
    }

    return this.props.children;
  }
}
