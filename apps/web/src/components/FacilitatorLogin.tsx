import { FormEvent, useState } from "react";
import type { ReactNode } from "react";

const sessionKey = "omics-modeling-choices-facilitator-authenticated";
const configuredUsername = import.meta.env.VITE_FACILITATOR_USERNAME;
const configuredPassword = import.meta.env.VITE_FACILITATOR_PASSWORD;

/**
 * A live session sets both variables and gets the sign-in form. With either unset the view is
 * open: the open-access build publishes the run sheet and reveal notes for other educators,
 * and nothing behind the gate was ever secret.
 */
export function facilitatorGateEnabled(username: string | undefined, password: string | undefined): boolean {
  return Boolean(username?.trim() && password?.trim());
}

const gateEnabled = facilitatorGateEnabled(configuredUsername, configuredPassword);

type Props = {
  children: ReactNode;
};

export function FacilitatorLogin({ children }: Props) {
  const [authenticated, setAuthenticated] = useState(() => window.sessionStorage.getItem(sessionKey) === "true");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (username === configuredUsername && password === configuredPassword) {
      window.sessionStorage.setItem(sessionKey, "true");
      setAuthenticated(true);
      setError("");
      return;
    }
    setError("Username or password is incorrect.");
  };

  if (authenticated || !gateEnabled) {
    return <>{children}</>;
  }

  return (
    <section className="login-shell" aria-labelledby="facilitator-login-title">
      <form className="login-card" onSubmit={submit}>
        <p className="eyebrow">Instructor mode</p>
        <h1 id="facilitator-login-title">Facilitator sign in</h1>
        <p>Enter the facilitator credentials to open timing cues, reveal notes, and instructor prompts.</p>
        <label className="field">
          <span>Username</span>
          <input
            autoComplete="username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full-width" type="submit">
          Sign in
        </button>
      </form>
    </section>
  );
}
