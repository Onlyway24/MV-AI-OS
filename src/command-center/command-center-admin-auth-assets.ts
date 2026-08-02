export const COMMAND_CENTER_ADMIN_AUTH_HTML = `
<main class="admin-auth-shell">
  <section class="admin-auth-card" aria-labelledby="admin-auth-title">
    <p class="admin-auth-kicker">ONLYWAY / PRIVATE ADMIN ACCESS</p>
    <h1 id="admin-auth-title">Centro di Comando</h1>
    <p>Accedi con la passkey Founder. Nessuna password o session token viene esposta alla pagina.</p>
    <div class="admin-auth-actions">
      <button id="admin-auth-login" type="button">Accedi con passkey</button>
    </div>
    <details>
      <summary>Prima attivazione Founder</summary>
      <p>Leggi il token monouso dal file bootstrap owner-only sul server e incollalo qui. Il token non deve essere inserito in URL, log o messaggi.</p>
      <label for="admin-bootstrap-token">Token bootstrap monouso</label>
      <input id="admin-bootstrap-token" type="password" autocomplete="off" spellcheck="false" />
      <button id="admin-bootstrap-register" type="button">Registra passkey Founder</button>
    </details>
    <p id="admin-auth-status" role="status" aria-live="polite"></p>
  </section>
</main>`;

export const COMMAND_CENTER_ADMIN_AUTH_CSS = `
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#07090c;color:#f5f7fa}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% 0,#202833 0,#0c1015 42%,#050608 100%)}
.admin-auth-shell{min-height:100vh;display:grid;place-items:center;padding:24px}
.admin-auth-card{width:min(100%,520px);padding:32px;border:1px solid #323b46;border-radius:18px;background:rgba(13,17,22,.96);box-shadow:0 28px 80px rgba(0,0,0,.55)}
.admin-auth-kicker{font-size:.72rem;letter-spacing:.18em;color:#aeb8c4}
h1{margin:.35rem 0 1rem;font-size:clamp(2rem,7vw,3.4rem)}
p{color:#c7ced8;line-height:1.55}
.admin-auth-actions{margin:24px 0}
details{border-top:1px solid #303844;padding-top:20px}
summary{cursor:pointer;font-weight:700}
label{display:block;margin:18px 0 8px;font-size:.85rem;color:#dce2e9}
input{width:100%;padding:12px;border:1px solid #46505d;border-radius:8px;background:#090c10;color:#fff}
button{margin-top:12px;padding:12px 16px;border:0;border-radius:8px;background:#e5e9ee;color:#080a0d;font-weight:800;cursor:pointer}
button:disabled{cursor:wait;opacity:.55}
#admin-auth-status[data-state="error"]{color:#ff9b9b}
#admin-auth-status[data-state="success"]{color:#9ce6ba}
`;

export const COMMAND_CENTER_ADMIN_AUTH_JS = `
(() => {
  "use strict";
  const login = document.getElementById("admin-auth-login");
  const register = document.getElementById("admin-bootstrap-register");
  const bootstrapToken = document.getElementById("admin-bootstrap-token");
  const status = document.getElementById("admin-auth-status");

  function setStatus(message, state) {
    status.textContent = message;
    status.dataset.state = state || "";
  }

  function base64UrlToBytes(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + padding);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  function bytesToBase64Url(value) {
    const bytes = new Uint8Array(value);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
  }

  function creationOptions(options) {
    return {
      ...options,
      challenge: base64UrlToBytes(options.challenge),
      excludeCredentials: (options.excludeCredentials || []).map((credential) => ({
        ...credential,
        id: base64UrlToBytes(credential.id),
      })),
      user: { ...options.user, id: base64UrlToBytes(options.user.id) },
    };
  }

  function requestOptions(options) {
    return {
      ...options,
      allowCredentials: (options.allowCredentials || []).map((credential) => ({
        ...credential,
        id: base64UrlToBytes(credential.id),
      })),
      challenge: base64UrlToBytes(options.challenge),
    };
  }

  function registrationResponse(credential) {
    const response = credential.response;
    const publicKey = typeof response.getPublicKey === "function" ? response.getPublicKey() : null;
    const publicKeyAlgorithm = typeof response.getPublicKeyAlgorithm === "function" ? response.getPublicKeyAlgorithm() : undefined;
    const transports = typeof response.getTransports === "function" ? response.getTransports() : [];
    return {
      authenticatorAttachment: credential.authenticatorAttachment,
      clientExtensionResults: credential.getClientExtensionResults(),
      id: credential.id,
      rawId: bytesToBase64Url(credential.rawId),
      response: {
        attestationObject: bytesToBase64Url(response.attestationObject),
        clientDataJSON: bytesToBase64Url(response.clientDataJSON),
        ...(publicKey === null ? {} : { publicKey: bytesToBase64Url(publicKey) }),
        ...(publicKeyAlgorithm === undefined ? {} : { publicKeyAlgorithm }),
        transports,
      },
      type: credential.type,
    };
  }

  function authenticationResponse(credential) {
    const response = credential.response;
    return {
      authenticatorAttachment: credential.authenticatorAttachment,
      clientExtensionResults: credential.getClientExtensionResults(),
      id: credential.id,
      rawId: bytesToBase64Url(credential.rawId),
      response: {
        authenticatorData: bytesToBase64Url(response.authenticatorData),
        clientDataJSON: bytesToBase64Url(response.clientDataJSON),
        signature: bytesToBase64Url(response.signature),
        userHandle: response.userHandle === null ? undefined : bytesToBase64Url(response.userHandle),
      },
      type: credential.type,
    };
  }

  async function post(path, payload) {
    const response = await fetch(path, {
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const code = body && typeof body.reasonCode === "string" ? body.reasonCode : "REQUEST_DENIED";
      throw new Error("Accesso non completato (" + code + ").");
    }
    return body;
  }

  async function authenticate() {
    setStatus("Verifica della passkey in corso…");
    const start = await post("/api/admin/authentication/begin", {});
    const credential = await navigator.credentials.get({
      publicKey: requestOptions(start.options),
    });
    if (!(credential instanceof PublicKeyCredential)) throw new Error("La passkey non ha restituito una credenziale valida.");
    await post("/api/admin/authentication/finish", {
      flowId: start.flowId,
      response: authenticationResponse(credential),
    });
    setStatus("Accesso verificato.", "success");
    window.location.assign("/");
  }

  async function registerFounder() {
    const token = bootstrapToken.value.trim();
    if (token.length < 32) throw new Error("Inserisci il token bootstrap owner-only.");
    setStatus("Registrazione della passkey Founder in corso…");
    const start = await post("/api/admin/bootstrap/begin", { bootstrapToken: token });
    bootstrapToken.value = "";
    const credential = await navigator.credentials.create({
      publicKey: creationOptions(start.options),
    });
    if (!(credential instanceof PublicKeyCredential)) throw new Error("La passkey non ha restituito una credenziale valida.");
    await post("/api/admin/bootstrap/finish", {
      flowId: start.flowId,
      response: registrationResponse(credential),
    });
    setStatus("Passkey Founder registrata. Completo l’accesso…", "success");
    await authenticate();
  }

  async function execute(button, operation) {
    if (!window.isSecureContext || typeof PublicKeyCredential !== "function") {
      setStatus("WebAuthn non è disponibile in questo contesto browser.", "error");
      return;
    }
    login.disabled = true;
    register.disabled = true;
    try {
      await operation();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Accesso non completato.", "error");
    } finally {
      button.blur();
      login.disabled = false;
      register.disabled = false;
    }
  }

  login.addEventListener("click", () => { void execute(login, authenticate); });
  register.addEventListener("click", () => { void execute(register, registerFounder); });
})();
`;
