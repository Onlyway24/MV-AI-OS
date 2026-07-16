export const COMMAND_CENTER_HTML = `
<div class="cc-app" id="command-center" data-sidebar-state="expanded">
  <div class="cc-world" aria-hidden="true">
    <div class="cc-world-image"></div>
    <div class="cc-world-vignette"></div>
    <div class="cc-world-light"></div>
  </div>
  <button class="cc-mobile-menu" id="mobile-menu-toggle" type="button" aria-controls="command-sidebar" aria-expanded="false" aria-label="Apri il menu del Centro di Comando"><span aria-hidden="true"></span><span aria-hidden="true"></span></button>
  <div class="cc-sidebar-backdrop" id="sidebar-backdrop" hidden></div>
  <aside class="cc-sidebar" id="command-sidebar" aria-label="Navigazione del Centro di Comando">
    <div class="cc-sidebar-head">
      <a class="cc-brand" href="#overview" aria-label="Panoramica del Centro di Comando Onlyway">
        <span class="cc-brand-mark" aria-hidden="true">OW</span>
        <span class="cc-brand-copy"><b>ONLYWAY</b><small>CENTRO DI COMANDO</small></span>
      </a>
      <button class="cc-sidebar-toggle" id="sidebar-toggle" type="button" aria-controls="command-sidebar" aria-expanded="true" aria-label="Compatta il pannello laterale"><span aria-hidden="true">‹</span></button>
    </div>
    <nav class="cc-nav">
      <p>PANORAMICA</p>
      <a class="is-active" href="#overview" data-label="Quadro operativo"><span class="cc-nav-icon" aria-hidden="true">⌂</span><span class="cc-nav-label">Quadro operativo</span></a>
      <p>BUSINESS</p>
      <a href="#business" data-label="Missioni Business"><span class="cc-nav-icon" aria-hidden="true">◫</span><span class="cc-nav-label">Missioni Business</span></a>
      <a href="#social" data-label="Intelligence Social"><span class="cc-nav-icon" aria-hidden="true">✦</span><span class="cc-nav-label">Intelligence Social</span></a>
      <a href="#production" data-label="Centro Produzione"><span class="cc-nav-icon" aria-hidden="true">◇</span><span class="cc-nav-label">Centro Produzione</span></a>
      <a href="#approvals" data-label="Centro Approvazioni"><span class="cc-nav-icon" aria-hidden="true">◆</span><span class="cc-nav-label">Centro Approvazioni</span></a>
      <p>COMPAGNIA AGENTI</p>
      <a href="#agents" data-label="Compagnia Agenti"><span class="cc-nav-icon" aria-hidden="true">◎</span><span class="cc-nav-label">Compagnia Agenti</span></a>
      <p>CONOSCENZA</p>
      <a href="#evidence" data-label="Centro Evidenze"><span class="cc-nav-icon" aria-hidden="true">◈</span><span class="cc-nav-label">Centro Evidenze</span></a>
      <p>OPERAZIONI</p>
      <a href="#runtime" data-label="Runtime H24"><span class="cc-nav-icon" aria-hidden="true">⌁</span><span class="cc-nav-label">Runtime H24</span></a>
      <p>GOVERNANCE</p>
      <a href="#governance" data-label="Regole di sicurezza"><span class="cc-nav-icon" aria-hidden="true">⌾</span><span class="cc-nav-label">Regole di sicurezza</span></a>
    </nav>
    <div class="cc-sidebar-foot">
      <span class="cc-live-dot" aria-hidden="true"></span>
      <span class="cc-sidebar-foot-label">API privata locale</span>
    </div>
  </aside>

  <main class="cc-main">
    <header class="cc-topbar">
      <div class="cc-command-title">
        <p class="cc-eyebrow">ONLYWAY</p>
        <h1>Centro di Comando</h1>
      </div>
      <div class="cc-status-rail" aria-label="Quadro operativo corrente">
        <span><i class="cc-status-dot" data-status-dot aria-hidden="true"></i>Sistema <b id="system-status">Caricamento</b></span>
        <span>Autonomia <b id="autonomy-status">A3 — Controllata</b></span>
        <span>Azioni esterne <b class="cc-lock">BLOCCATE</b></span>
        <span>Runtime <b id="runtime-location">LOCALE</b></span>
        <span>Decisioni richieste <b id="decisions-required">—</b></span>
      </div>
      <div class="cc-operator" aria-label="Operatore Fabio">
        <span class="cc-avatar" aria-hidden="true">F</span>
        <span><b>Fabio</b><small>Operatore</small></span>
      </div>
    </header>

    <form class="cc-command" id="command-form" role="search">
      <label class="sr-only" for="command-input">Chiedi a Onlyway</label>
      <span aria-hidden="true">⌘</span>
      <input id="command-input" autocomplete="off" placeholder="Chiedi a Onlyway… cerca nello stato operativo" />
      <kbd>⌘ K</kbd>
    </form>
    <p class="cc-command-result" id="command-result" aria-live="polite"></p>

    <section class="cc-section cc-overview" id="overview" aria-labelledby="overview-heading">
      <div class="cc-section-heading cc-overview-heading">
        <div><p class="cc-kicker">PANORAMICA OPERATIVA</p><h2 id="overview-heading">Decisioni e produzione</h2></div>
        <time id="generated-at"></time>
      </div>
      <div class="cc-metrics" id="metric-grid" aria-live="polite"></div>
      <div class="cc-hero-grid">
        <article class="cc-system-core" aria-label="Nucleo del sistema MV-AI-OS">
          <div class="cc-core-orbit cc-core-orbit-a" aria-hidden="true"></div>
          <div class="cc-core-orbit cc-core-orbit-b" aria-hidden="true"></div>
          <div class="cc-core-orbit cc-core-orbit-c" aria-hidden="true"></div>
          <div class="cc-core-center">
            <span class="cc-core-label">MV-AI-OS</span>
            <strong id="core-status">READY</strong>
            <small id="core-detail">Lettura del control plane locale</small>
          </div>
          <span class="cc-core-node cc-node-top">Mission<br />Control</span>
          <span class="cc-core-node cc-node-right">Runtime<br />Workflow</span>
          <span class="cc-core-node cc-node-bottom">Guardiani<br />Qualità</span>
          <span class="cc-core-node cc-node-left">Piano<br />Evidenze</span>
        </article>
        <article class="cc-brief" aria-labelledby="brief-heading">
          <p class="cc-kicker">BRIEF PRODUTTIVO GIORNALIERO</p>
          <h2 id="brief-heading">Quadro decisionale</h2>
          <strong id="brief-decision">Caricamento dello stato locale</strong>
          <p id="brief-detail">L'API locale sta leggendo il sistema di registrazione durevole.</p>
          <div class="cc-brief-rule"></div>
          <p class="cc-brief-label">PROSSIMA AZIONE DELL'OPERATORE</p>
          <p id="brief-priority">Nessuna raccomandazione è generata finché lo stato locale non è disponibile.</p>
        </article>
      </div>
    </section>

    <section class="cc-section" aria-labelledby="pipeline-heading">
      <div class="cc-section-heading"><div><p class="cc-kicker">FLUSSO DI CONTROLLO</p><h2 id="pipeline-heading">Percorso produttivo durevole</h2></div><p class="cc-section-note">Sono conteggiate solo le fasi con un segnale persistito.</p></div>
      <div class="cc-pipeline" aria-label="Pipeline di produzione">
        <div class="cc-pipeline-node" data-stage="evidence"><span>01</span><b>Evidenze</b><strong>0</strong><small>pacchetti immutabili</small></div>
        <div class="cc-pipeline-link" aria-hidden="true"></div>
        <div class="cc-pipeline-node" data-stage="queue"><span>02</span><b>Coda</b><strong>0</strong><small>job durevoli</small></div>
        <div class="cc-pipeline-link" aria-hidden="true"></div>
        <div class="cc-pipeline-node" data-stage="quality"><span>03</span><b>Qualità</b><strong>0</strong><small>record dei pacchetti</small></div>
        <div class="cc-pipeline-link" aria-hidden="true"></div>
        <div class="cc-pipeline-node" data-stage="fabio"><span>04</span><b>Fabio</b><strong>0</strong><small>decisioni di approvazione</small></div>
        <div class="cc-pipeline-link" aria-hidden="true"></div>
        <div class="cc-pipeline-node" data-stage="calendar"><span>05</span><b>Calendario</b><strong>0</strong><small>pianificazione interna</small></div>
      </div>
    </section>

    <section class="cc-section" id="business" aria-labelledby="business-heading">
      <div class="cc-section-heading"><div><p class="cc-kicker">BUSINESS MISSION V1</p><h2 id="business-heading">Decisioni commerciali verificabili</h2></div><span class="cc-section-note">Tre opportunità → una decisione → dossier completo</span></div>
      <div class="cc-business-shell">
        <aside class="cc-business-list" id="business-mission-list"><div class="cc-list-empty">Nessuna Business Mission durevole disponibile.</div></aside>
        <div class="cc-business-workspace">
          <div class="cc-business-comparison" id="business-comparison"><div class="cc-list-empty">Le tre Opportunity Scorecard appariranno qui.</div></div>
          <article class="cc-business-dossier" id="business-dossier"><div class="cc-list-empty">Seleziona una Business Mission per ispezionare offerta, economics, validazione, artefatti e gate.</div></article>
        </div>
      </div>
    </section>

    <section class="cc-section" id="social" aria-labelledby="social-heading">
      <div class="cc-section-heading"><div><p class="cc-kicker">METODO VELOCE · SOCIAL INTELLIGENCE</p><h2 id="social-heading">Report operativo giornaliero</h2></div><span class="cc-section-note" id="social-daily-status">Nessun segnale inventato</span></div>
      <div class="cc-social-live" id="social-live-panel" aria-live="polite"></div>
      <div class="cc-social-summary" id="social-summary-grid" aria-live="polite"></div>
      <div class="cc-social-pack-list" id="social-pack-list" aria-live="polite"><div class="cc-list-empty">Nessun Social Publishing Pack durevole disponibile.</div></div>
    </section>

    <section class="cc-section" id="production" aria-labelledby="production-heading">
      <div class="cc-section-heading"><div><p class="cc-kicker">METODO VELOCE</p><h2 id="production-heading">Centro Produzione</h2></div><p class="cc-section-note">Seleziona un record per ispezionare gli asset esatti del pacchetto.</p></div>
      <div class="cc-production-layout">
        <div class="cc-kanban" id="production-lanes" aria-live="polite"></div>
        <aside class="cc-preview" aria-labelledby="preview-heading">
          <div class="cc-preview-heading"><p class="cc-kicker">ANTEPRIMA PACCHETTO</p><h3 id="preview-heading">Asset reali del contenuto</h3></div>
          <div id="package-preview" class="cc-preview-body"></div>
          <div id="package-actions" class="cc-preview-actions" aria-live="polite"></div>
        </aside>
        <aside class="cc-package-inspector" id="package-inspector" aria-label="Evidenze e controlli del pacchetto"></aside>
      </div>
    </section>

    <section class="cc-section" id="evidence" aria-labelledby="evidence-heading">
      <div class="cc-section-heading"><div><p class="cc-kicker">CONOSCENZA</p><h2 id="evidence-heading">Centro Evidenze</h2></div><p class="cc-section-note">Supporto ai claim, provenienza e freshness dalla fonte di registrazione.</p></div>
      <div class="cc-evidence-grid">
        <article class="cc-evidence-panel"><p class="cc-panel-label">RESEARCH MISSION</p><div id="research-mission-list" class="cc-list"></div></article>
        <article class="cc-evidence-panel"><p class="cc-panel-label">REGISTRO FONTI</p><div id="source-list" class="cc-list"></div></article>
        <article class="cc-evidence-panel"><p class="cc-panel-label">EVIDENCE PACK</p><div id="pack-list" class="cc-list"></div></article>
        <article class="cc-evidence-panel"><p class="cc-panel-label">EVIDENZE DEI CLAIM</p><div id="evidence-list" class="cc-list"></div></article>
      </div>
    </section>

    <section class="cc-section cc-operations" id="runtime" aria-labelledby="runtime-heading">
      <div class="cc-section-heading"><div><p class="cc-kicker">OPERAZIONI</p><h2 id="runtime-heading">Runtime H24</h2></div><span class="cc-runtime-state" id="runtime-status">Caricamento</span></div>
      <div class="cc-runtime-grid">
        <article class="cc-runtime-console"><p class="cc-panel-label">STATO DEL WORKER</p><strong id="worker-status">Verifica della registrazione del worker</strong><p id="worker-detail">Il runtime locale è in lettura.</p><div class="cc-runtime-rule"></div><dl><div><dt>Telegram</dt><dd id="telegram-status">Non osservato</dd></div><div><dt>Kill switch</dt><dd id="kill-switch-status">Bloccato</dd></div></dl></article>
        <article class="cc-runtime-jobs"><p class="cc-panel-label">REGISTRO JOB</p><div id="runtime-bars" class="cc-runtime-bars" aria-live="polite"></div></article>
      </div>
    </section>

    <section class="cc-section" id="agents" aria-labelledby="agents-heading">
      <div class="cc-section-heading"><div><p class="cc-kicker">COMPAGNIA AGENTI</p><h2 id="agents-heading">Reparti misurabili</h2></div><p class="cc-section-note">Un ruolo è mostrato attivo solo quando esiste un runtime eseguibile.</p></div>
      <div class="cc-agent-company-layout">
        <div>
          <p class="cc-panel-label">CATALOGO OPERATIVO</p>
          <div class="cc-agent-grid" id="agent-grid"></div>
        </div>
        <aside class="cc-workday-console" aria-labelledby="workday-heading">
          <div class="cc-workday-heading"><p class="cc-panel-label">GIORNATE DUREVOLI</p><h3 id="workday-heading">Giornata Agent Company</h3></div>
          <div class="cc-workday-list" id="agent-workday-list"></div>
          <div class="cc-workday-detail" id="agent-workday-detail"></div>
        </aside>
      </div>
    </section>

    <section class="cc-section" id="approvals" aria-labelledby="approvals-heading">
      <div class="cc-section-heading"><div><p class="cc-kicker">GOVERNANCE</p><h2 id="approvals-heading">Centro Approvazioni</h2></div></div>
      <div class="cc-approval-panel"><div><p class="cc-panel-label">CONTROLLO FABIO</p><h3 id="approval-title">Lettura dello stato di approvazione</h3><p id="approval-detail">Il registro delle approvazioni supportate da evidenze è in caricamento.</p></div><a class="cc-text-action" href="#production">Ispeziona i pacchetti <span aria-hidden="true">→</span></a></div>
      <div class="cc-approval-review-list" id="approval-review-list"></div>
    </section>

    <section class="cc-section" id="governance" aria-labelledby="governance-heading">
      <div class="cc-governance"><span class="cc-lock-glyph" aria-hidden="true">⌁</span><div><p class="cc-kicker">PIANO DELLE AZIONI ESTERNE</p><h2 id="governance-heading">La pubblicazione resta bloccata per progettazione.</h2><p>Nessun controllo dal browser può pubblicare, spendere, contattare clienti, modificare un CRM o fare deploy. Ogni futura azione autorizzata dovrà attraversare i confini esistenti di dry-run, approvazione, ricevuta e kill switch.</p></div></div>
    </section>
  </main>

  <div class="cc-authorization" id="action-confirmation" hidden>
    <div class="cc-authorization-backdrop" data-confirmation-close></div>
    <section class="cc-authorization-dialog" role="dialog" aria-modal="true" aria-labelledby="action-confirmation-title" aria-describedby="action-confirmation-detail">
      <p class="cc-kicker">CAMERA DI AUTORIZZAZIONE</p>
      <h2 id="action-confirmation-title">Conferma richiesta</h2>
      <p id="action-confirmation-detail">Verifica la versione, il fingerprint e i controlli prima di autorizzare la decisione.</p>
      <div class="cc-authorization-timing"><span>CONFERMA MONOUSO</span><time id="action-confirmation-timer">05:00</time></div>
      <dl class="cc-authorization-details" id="action-confirmation-details"></dl>
      <p class="cc-authorization-notice">La decisione attraverserà il Command Boundary esistente, con chiave di idempotenza e ricevuta durevole.</p>
      <div class="cc-authorization-actions">
        <button class="cc-modal-button cc-modal-button--quiet" type="button" data-confirmation-close>Annulla</button>
        <button class="cc-modal-button cc-modal-button--approve" id="action-confirmation-submit" type="button">Conferma decisione</button>
      </div>
    </section>
  </div>
</div>
`;

export const COMMAND_CENTER_CSS = `
:root{color-scheme:dark;--cc-bg:#050505;--cc-surface:#0d0d0f;--cc-elevated:#151517;--cc-gold:#d1ab5c;--cc-bright:#e8cc8b;--cc-ivory:#f1ede5;--cc-muted:#8b8985;--cc-border:rgba(209,171,92,.28);--cc-line:rgba(241,237,229,.09);--cc-success:#65a77a;--cc-danger:#d45d5d;--cc-shadow:0 24px 80px rgba(0,0,0,.42)}
*{box-sizing:border-box}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}html{scroll-behavior:smooth;background:var(--cc-bg)}body{margin:0;background:radial-gradient(circle at 74% 5%,rgba(209,171,92,.09),transparent 24rem),var(--cc-bg);color:var(--cc-ivory);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;line-height:1.5}.cc-app{min-height:100vh;display:grid;grid-template-columns:252px minmax(0,1fr)}.cc-sidebar{position:sticky;top:0;height:100vh;padding:30px 18px 18px;border-right:1px solid var(--cc-line);background:linear-gradient(180deg,rgba(13,13,15,.95),rgba(5,5,5,.92));display:flex;flex-direction:column}.cc-brand{display:flex;gap:12px;align-items:center;color:var(--cc-ivory);text-decoration:none;margin:0 8px 44px}.cc-brand-mark{display:grid;place-items:center;width:34px;height:34px;border:1px solid var(--cc-border);border-radius:50%;color:var(--cc-bright);font-family:Georgia,"Times New Roman",serif;font-size:12px;letter-spacing:.08em;box-shadow:inset 0 0 20px rgba(209,171,92,.08)}.cc-brand b,.cc-brand small{display:block}.cc-brand b{font-family:Georgia,"Times New Roman",serif;font-size:14px;letter-spacing:.12em;font-weight:500}.cc-brand small{font-size:9px;letter-spacing:.17em;color:var(--cc-muted);margin-top:1px}.cc-nav{display:grid;gap:3px}.cc-nav p{color:#686560;font-size:9px;letter-spacing:.15em;margin:19px 10px 5px}.cc-nav a{border-left:1px solid transparent;color:var(--cc-muted);font-size:12px;padding:8px 10px;text-decoration:none;transition:color .28s ease,border-color .28s ease,background .28s ease}.cc-nav a:hover,.cc-nav a.is-active{color:var(--cc-ivory);border-left-color:var(--cc-gold);background:linear-gradient(90deg,rgba(209,171,92,.09),transparent)}.cc-sidebar-foot{margin-top:auto;border-top:1px solid var(--cc-line);padding:16px 10px 0;color:var(--cc-muted);display:flex;align-items:center;gap:8px;font-size:11px}.cc-live-dot,.cc-status-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--cc-success);box-shadow:0 0 0 4px rgba(101,167,122,.08)}.cc-main{width:min(1600px,100%);margin:0 auto;padding:28px clamp(22px,4vw,72px) 80px}.cc-topbar{display:grid;grid-template-columns:minmax(220px,1fr) auto auto;gap:28px;align-items:center;border-bottom:1px solid var(--cc-line);padding:0 0 23px}.cc-eyebrow,.cc-kicker,.cc-panel-label,.cc-brief-label{margin:0;color:var(--cc-gold);font-size:10px;letter-spacing:.16em}.cc-topbar h1,.cc-section h2,.cc-section h3{font-family:Georgia,"Times New Roman",serif;font-weight:400;letter-spacing:-.025em}.cc-topbar h1{font-size:31px;line-height:1.1;margin:5px 0 0}.cc-system-line{display:flex;gap:14px;flex-wrap:wrap;color:var(--cc-muted);font-size:11px}.cc-system-line span{white-space:nowrap}.cc-system-line b{color:var(--cc-ivory);font-weight:500;margin-left:3px}.cc-system-line .cc-lock{color:var(--cc-bright);letter-spacing:.09em}.cc-operator{display:flex;gap:10px;align-items:center;border-left:1px solid var(--cc-line);padding-left:24px}.cc-avatar{width:30px;height:30px;border:1px solid var(--cc-border);border-radius:50%;display:grid;place-items:center;color:var(--cc-bright);font-family:Georgia,"Times New Roman",serif}.cc-operator b,.cc-operator small{display:block}.cc-operator b{font-size:12px;font-weight:500}.cc-operator small{font-size:10px;color:var(--cc-muted)}.cc-command{margin:24px 0 0;display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;background:rgba(21,21,23,.72);border:1px solid var(--cc-line);padding:0 14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.02),var(--cc-shadow)}.cc-command:focus-within{border-color:var(--cc-border);box-shadow:inset 0 0 0 1px rgba(209,171,92,.08),var(--cc-shadow)}.cc-command>span{color:var(--cc-gold);font-size:17px}.cc-command input{min-width:0;height:52px;background:transparent;border:0;outline:0;color:var(--cc-ivory);font:inherit;font-size:13px}.cc-command input::placeholder{color:#77736d}.cc-command kbd{border:1px solid var(--cc-line);padding:2px 6px;color:var(--cc-muted);font:10px ui-monospace,SFMono-Regular,Menlo,monospace}.cc-command-result{min-height:18px;margin:7px 2px 0;color:var(--cc-muted);font-size:11px}.cc-section{margin-top:54px}.cc-section-heading{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:20px}.cc-section-heading h2{margin:4px 0 0;font-size:28px;line-height:1.13}.cc-section-heading time,.cc-section-note{margin:0;color:var(--cc-muted);font-size:11px}.cc-hero-grid{display:grid;grid-template-columns:minmax(340px,1.1fr) minmax(280px,.9fr);gap:18px}.cc-system-core,.cc-brief,.cc-evidence-panel,.cc-runtime-console,.cc-runtime-jobs,.cc-approval-panel,.cc-governance{background:linear-gradient(145deg,rgba(21,21,23,.92),rgba(10,10,11,.9));border:1px solid var(--cc-line);box-shadow:var(--cc-shadow)}.cc-system-core{min-height:332px;position:relative;overflow:hidden;display:grid;place-items:center;isolation:isolate;background:radial-gradient(circle at center,rgba(209,171,92,.12),transparent 25%),linear-gradient(145deg,rgba(21,21,23,.92),rgba(10,10,11,.9))}.cc-core-orbit{position:absolute;border:1px solid rgba(209,171,92,.24);border-radius:50%;animation:cc-orbit 18s linear infinite}.cc-core-orbit-a{width:170px;height:170px}.cc-core-orbit-b{width:250px;height:250px;border-style:dashed;opacity:.65;animation-duration:29s;animation-direction:reverse}.cc-core-orbit-c{width:330px;height:330px;opacity:.28;animation-duration:40s}.cc-core-center{z-index:1;width:132px;height:132px;border:1px solid var(--cc-border);border-radius:50%;display:flex;flex-direction:column;justify-content:center;align-items:center;background:radial-gradient(circle,rgba(209,171,92,.12),rgba(13,13,15,.92) 68%);box-shadow:0 0 40px rgba(209,171,92,.08),inset 0 0 36px rgba(209,171,92,.07);text-align:center}.cc-core-label{color:var(--cc-muted);font-size:9px;letter-spacing:.12em}.cc-core-center strong{color:var(--cc-bright);font-family:Georgia,"Times New Roman",serif;font-size:20px;font-weight:400;letter-spacing:.06em;margin:3px 0}.cc-core-center small{max-width:100px;color:var(--cc-muted);font-size:9px;line-height:1.25}.cc-core-node{position:absolute;z-index:1;color:var(--cc-muted);font-size:10px;line-height:1.25;text-align:center}.cc-node-top{top:28px}.cc-node-right{right:8%;top:47%}.cc-node-bottom{bottom:22px}.cc-node-left{left:8%;top:47%}.cc-brief{padding:34px;display:flex;flex-direction:column;justify-content:center}.cc-brief h2{font-size:29px;margin:6px 0 26px}.cc-brief strong{font-family:Georgia,"Times New Roman",serif;font-size:21px;font-weight:400;color:var(--cc-bright);line-height:1.2}.cc-brief p{color:var(--cc-muted);margin:11px 0 0;font-size:12px}.cc-brief-rule,.cc-runtime-rule{height:1px;background:var(--cc-line);margin:25px 0 16px}.cc-brief-label{font-size:9px!important;color:var(--cc-gold)!important;margin:0!important}.cc-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-top:16px}.cc-metric{padding:17px;background:rgba(13,13,15,.76);border:1px solid var(--cc-line);min-height:120px}.cc-metric .cc-metric-label{display:block;color:var(--cc-muted);font-size:10px;line-height:1.3}.cc-metric strong{display:block;font-family:Georgia,"Times New Roman",serif;font-size:30px;font-weight:400;line-height:1;margin:14px 0 9px}.cc-metric p{color:var(--cc-muted);font-size:10px;line-height:1.35;margin:0}.cc-metric[data-tone="gold"] strong{color:var(--cc-bright)}.cc-metric[data-tone="success"] strong{color:var(--cc-success)}.cc-metric[data-tone="attention"] strong{color:var(--cc-danger)}.cc-pipeline{display:grid;grid-template-columns:1fr 28px 1fr 28px 1fr 28px 1fr 28px 1fr;align-items:center}.cc-pipeline-node{min-height:126px;padding:19px 16px;border-top:1px solid var(--cc-line);border-bottom:1px solid var(--cc-line);position:relative;background:linear-gradient(180deg,rgba(21,21,23,.54),transparent)}.cc-pipeline-node:before{content:"";position:absolute;left:0;top:0;width:28px;height:1px;background:var(--cc-gold)}.cc-pipeline-node span{color:var(--cc-gold);font:10px ui-monospace,SFMono-Regular,Menlo,monospace}.cc-pipeline-node b,.cc-pipeline-node small{display:block}.cc-pipeline-node b{font-family:Georgia,"Times New Roman",serif;font-size:17px;font-weight:400;margin:12px 0 7px}.cc-pipeline-node strong{font-size:19px;color:var(--cc-bright);font-weight:500}.cc-pipeline-node small{color:var(--cc-muted);font-size:10px;margin-top:1px}.cc-pipeline-link{height:1px;background:linear-gradient(90deg,var(--cc-border),transparent);position:relative}.cc-pipeline-link:after{content:"";position:absolute;right:0;top:-3px;border-left:5px solid var(--cc-gold);border-top:3px solid transparent;border-bottom:3px solid transparent}.cc-production-layout{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(330px,.9fr);gap:18px}.cc-kanban{display:grid;gap:11px}.cc-lane{border-top:1px solid var(--cc-line);padding:14px 0 2px}.cc-lane-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}.cc-lane-head b{font-size:10px;letter-spacing:.14em;color:var(--cc-gold);font-weight:500}.cc-lane-head span{color:var(--cc-muted);font:10px ui-monospace,SFMono-Regular,Menlo,monospace}.cc-production-card{width:100%;text-align:left;border:1px solid var(--cc-line);border-left:2px solid var(--cc-border);background:rgba(21,21,23,.68);padding:15px;display:grid;gap:10px;color:var(--cc-ivory);font:inherit;cursor:pointer;transition:border-color .22s ease,background .22s ease,transform .22s ease}.cc-production-card:hover,.cc-production-card[aria-pressed="true"]{border-color:var(--cc-border);border-left-color:var(--cc-bright);background:rgba(30,29,27,.88);transform:translateX(3px)}.cc-card-meta{display:flex;justify-content:space-between;gap:12px;color:var(--cc-muted);font-size:10px}.cc-production-card h3{font-family:Georgia,"Times New Roman",serif;font-size:18px;font-weight:400;line-height:1.18;margin:0}.cc-card-signals{display:flex;gap:12px;flex-wrap:wrap;color:var(--cc-muted);font-size:10px}.cc-card-signals b{color:var(--cc-ivory);font-weight:500}.cc-preview{position:sticky;top:22px;height:max-content;border:1px solid var(--cc-line);background:linear-gradient(155deg,rgba(21,21,23,.95),rgba(10,10,11,.95));box-shadow:var(--cc-shadow)}.cc-preview-heading{padding:22px 23px 17px;border-bottom:1px solid var(--cc-line)}.cc-preview-heading h3{margin:5px 0 0;font-size:22px;font-weight:400}.cc-preview-body{padding:22px}.cc-preview-empty,.cc-list-empty{min-height:210px;display:grid;place-items:center;text-align:center;color:var(--cc-muted);font-size:12px;padding:24px}.cc-preview-empty span{display:block;color:var(--cc-gold);font:42px Georgia,"Times New Roman",serif;margin-bottom:9px}.cc-asset-frame{width:min(100%,290px);aspect-ratio:4/5;margin:0 auto;background:linear-gradient(145deg,rgba(209,171,92,.15),rgba(13,13,15,.9) 53%),#0b0b0c;border:1px solid var(--cc-border);padding:23px;display:flex;flex-direction:column}.cc-asset-frame .cc-asset-index{color:var(--cc-gold);font-size:10px;letter-spacing:.15em}.cc-asset-frame h4{font-family:Georgia,"Times New Roman",serif;font-size:28px;line-height:1.05;font-weight:400;margin:22px 0 0}.cc-asset-frame p{color:var(--cc-muted);font-size:11px;line-height:1.45;margin-top:auto}.cc-preview-nav{display:flex;align-items:center;justify-content:space-between;margin:15px 0}.cc-preview-nav button{color:var(--cc-ivory);background:transparent;border:1px solid var(--cc-line);padding:6px 10px;cursor:pointer;font:inherit;font-size:11px}.cc-preview-nav button:hover{border-color:var(--cc-border);color:var(--cc-bright)}.cc-preview-nav span{color:var(--cc-muted);font-size:10px}.cc-preview-details{border-top:1px solid var(--cc-line);padding-top:15px;margin-top:18px}.cc-preview-details p{color:var(--cc-muted);font-size:11px;line-height:1.45;margin:6px 0}.cc-preview-details b{color:var(--cc-ivory);font-weight:500}.cc-evidence-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.cc-evidence-panel{min-height:236px;padding:20px}.cc-panel-label{font-size:9px}.cc-list{display:grid;gap:9px;margin-top:15px}.cc-list-item{padding:11px 0;border-bottom:1px solid var(--cc-line);display:grid;gap:3px}.cc-list-item:last-child{border-bottom:0}.cc-list-item b{font-size:12px;font-weight:500}.cc-list-item p{color:var(--cc-muted);font-size:10px;line-height:1.4;margin:0;overflow-wrap:anywhere}.cc-list-item span{color:var(--cc-gold);font:9px ui-monospace,SFMono-Regular,Menlo,monospace}.cc-list-empty{min-height:160px;padding:15px}.cc-runtime-grid{display:grid;grid-template-columns:minmax(290px,.8fr) minmax(0,1.2fr);gap:16px}.cc-runtime-console,.cc-runtime-jobs{padding:26px;min-height:240px}.cc-runtime-console>strong{display:block;font-family:Georgia,"Times New Roman",serif;font-weight:400;font-size:23px;line-height:1.15;color:var(--cc-bright);margin-top:15px}.cc-runtime-console>p{color:var(--cc-muted);font-size:12px;margin:11px 0 0}.cc-runtime-console dl{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:0}.cc-runtime-console dl div{display:grid;gap:3px}.cc-runtime-console dt{color:var(--cc-muted);font-size:10px}.cc-runtime-console dd{margin:0;font-size:12px;color:var(--cc-ivory)}.cc-runtime-state{color:var(--cc-bright);font:10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em}.cc-runtime-bars{display:grid;gap:15px;margin-top:22px}.cc-runtime-bar{display:grid;grid-template-columns:105px minmax(0,1fr) 28px;gap:10px;align-items:center}.cc-runtime-bar span{color:var(--cc-muted);font-size:10px}.cc-runtime-bar b{font-weight:500;color:var(--cc-ivory);text-align:right;font-size:12px}.cc-runtime-track{height:5px;background:rgba(241,237,229,.07);overflow:hidden}.cc-runtime-fill{height:100%;background:linear-gradient(90deg,var(--cc-gold),var(--cc-bright));min-width:0;transition:width .45s ease}.cc-runtime-bar[data-tone="danger"] .cc-runtime-fill{background:var(--cc-danger)}.cc-agent-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}.cc-agent{padding:22px;border:1px solid var(--cc-line);background:linear-gradient(90deg,rgba(21,21,23,.8),rgba(21,21,23,.35));display:grid;grid-template-columns:minmax(180px,1fr) repeat(3,minmax(110px,.5fr));gap:18px;align-items:center}.cc-agent h3{font-family:Georgia,"Times New Roman",serif;font-size:23px;font-weight:400;margin:4px 0}.cc-agent p{color:var(--cc-muted);font-size:11px;margin:0}.cc-agent-stat{border-left:1px solid var(--cc-line);padding-left:18px}.cc-agent-stat span{color:var(--cc-muted);font-size:10px;display:block}.cc-agent-stat b{color:var(--cc-bright);font-size:12px;font-weight:500;display:block;margin-top:4px}.cc-intentional-empty{margin-top:14px;padding:17px 19px;border-top:1px solid var(--cc-line);border-bottom:1px solid var(--cc-line);display:flex;gap:14px;align-items:center;color:var(--cc-muted)}.cc-intentional-empty>span{color:var(--cc-gold);font-size:24px}.cc-intentional-empty b{color:var(--cc-ivory);font-size:12px;font-weight:500}.cc-intentional-empty p{font-size:11px;margin:3px 0 0}.cc-approval-panel{padding:28px;display:flex;align-items:center;justify-content:space-between;gap:24px}.cc-approval-panel h3{font-family:Georgia,"Times New Roman",serif;font-size:25px;font-weight:400;margin:7px 0}.cc-approval-panel p:not(.cc-panel-label){color:var(--cc-muted);font-size:12px;margin:0}.cc-text-action{border-bottom:1px solid var(--cc-border);color:var(--cc-bright);font-size:11px;padding-bottom:4px;text-decoration:none;white-space:nowrap}.cc-text-action span{margin-left:8px}.cc-governance{padding:31px;display:flex;gap:23px;align-items:flex-start}.cc-lock-glyph{width:42px;height:42px;border:1px solid var(--cc-border);border-radius:50%;display:grid;place-items:center;color:var(--cc-bright);font-size:23px}.cc-governance h2{font-size:26px;margin:5px 0 8px}.cc-governance p:not(.cc-kicker){color:var(--cc-muted);margin:0;max-width:760px;font-size:12px;line-height:1.6}@keyframes cc-orbit{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;transition-duration:.01ms!important}}@media (max-width:1180px){.cc-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.cc-topbar{grid-template-columns:1fr auto}.cc-system-line{grid-column:1/-1;grid-row:2}.cc-production-layout{grid-template-columns:1fr}.cc-preview{position:static}.cc-evidence-grid{grid-template-columns:1fr}.cc-evidence-panel{min-height:auto}.cc-pipeline{grid-template-columns:1fr}.cc-pipeline-link{width:1px;height:20px;margin:0 auto;background:linear-gradient(180deg,var(--cc-border),transparent)}.cc-pipeline-link:after{right:-2px;top:auto;bottom:0;border-left:3px solid transparent;border-right:3px solid transparent;border-top:5px solid var(--cc-gold);border-bottom:0}}@media (max-width:820px){.cc-app{grid-template-columns:1fr}.cc-sidebar{position:static;height:auto;padding:20px;border-right:0;border-bottom:1px solid var(--cc-line)}.cc-brand{margin:0 8px 18px}.cc-nav{display:flex;overflow:auto;gap:0;padding-bottom:4px}.cc-nav p{display:none}.cc-nav a{white-space:nowrap;border-left:0;border-bottom:1px solid transparent}.cc-nav a.is-active{border-bottom-color:var(--cc-gold)}.cc-sidebar-foot{display:none}.cc-main{padding:24px 20px 60px}.cc-topbar{grid-template-columns:1fr auto;gap:16px}.cc-system-line{gap:8px}.cc-operator{padding-left:12px}.cc-hero-grid,.cc-runtime-grid{grid-template-columns:1fr}.cc-system-core{min-height:300px}.cc-agent{grid-template-columns:1fr 1fr}.cc-agent>div:first-child{grid-column:1/-1}.cc-agent-stat{padding-left:0;border-left:0;border-top:1px solid var(--cc-line);padding-top:12px}.cc-section{margin-top:42px}}@media (max-width:520px){.cc-topbar{grid-template-columns:1fr}.cc-operator{display:none}.cc-system-line{grid-column:auto;grid-row:auto}.cc-metrics{grid-template-columns:1fr 1fr}.cc-metric{min-height:106px;padding:14px}.cc-brief{padding:25px}.cc-section-heading{display:block}.cc-section-heading time,.cc-section-note{display:block;margin-top:7px}.cc-approval-panel,.cc-governance{align-items:flex-start;flex-direction:column}.cc-agent{grid-template-columns:1fr}.cc-agent>div:first-child{grid-column:auto}.cc-system-core{min-height:280px}.cc-core-orbit-c{width:270px;height:270px}.cc-node-right{right:3%}.cc-node-left{left:3%}}
`;

export const COMMAND_CENTER_RESPONSIVE_CSS = `
.cc-main{padding-top:20px}.cc-topbar{grid-template-columns:minmax(220px,.72fr) minmax(420px,1.7fr) auto;gap:22px;padding-bottom:18px}.cc-command-title .cc-eyebrow{color:var(--cc-bright);font-family:Georgia,"Times New Roman",serif;font-size:11px;letter-spacing:.22em}.cc-command-title h1{font-size:27px;margin-top:3px}.cc-status-rail{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1px;border:1px solid var(--cc-line);background:var(--cc-line)}.cc-status-rail span{min-width:0;padding:10px 11px;background:rgba(13,13,15,.9);color:var(--cc-muted);font-size:9px;line-height:1.35}.cc-status-rail b{display:block;overflow:hidden;color:var(--cc-ivory);font-size:10px;font-weight:500;letter-spacing:.035em;text-overflow:ellipsis;white-space:nowrap}.cc-status-rail .cc-lock{color:var(--cc-bright)}.cc-overview{margin-top:34px}.cc-overview-heading{margin-bottom:14px}.cc-metrics{margin-top:0;gap:8px}.cc-metric{min-height:112px;padding:15px}.cc-metric strong{font-size:25px;margin:12px 0 7px;letter-spacing:-.02em}.cc-metric p{font-size:9px}.cc-hero-grid{grid-template-columns:minmax(270px,.7fr) minmax(320px,1.3fr);gap:12px;margin-top:13px}.cc-system-core{min-height:250px}.cc-core-orbit-a{width:132px;height:132px}.cc-core-orbit-b{width:185px;height:185px}.cc-core-orbit-c{width:244px;height:244px}.cc-core-center{width:110px;height:110px}.cc-core-node{font-size:9px}.cc-node-top{top:18px}.cc-node-bottom{bottom:15px}.cc-brief{padding:27px}.cc-brief h2{font-size:25px;margin:5px 0 17px}.cc-brief strong{font-size:19px}.cc-preview-actions{display:flex;gap:9px;flex-wrap:wrap;padding:0 22px 22px}.cc-preview-actions .cc-panel-label{width:100%;margin:3px 0 1px}.cc-preview-actions .cc-text-action{font-size:11px;cursor:pointer}.cc-preview-actions .cc-text-action:disabled{cursor:wait;opacity:.55}
@media (max-width:820px){
  .cc-app,.cc-sidebar,.cc-main{min-width:0}.cc-topbar{grid-template-columns:1fr auto}.cc-status-rail{grid-column:1/-1;grid-template-columns:repeat(3,minmax(0,1fr))}.cc-hero-grid{grid-template-columns:1fr}.cc-nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));min-width:0;width:100%;overflow:visible}.cc-nav a{white-space:normal}
}
@media (max-width:520px){
  .cc-status-rail{grid-template-columns:repeat(2,minmax(0,1fr))}.cc-nav{grid-template-columns:1fr}.cc-metrics{grid-template-columns:1fr 1fr}.cc-metric{min-height:100px}.cc-metric strong{font-size:21px}
}

/* Onlyway Obsidian Chrome — materials and semantic colour language. */
:root{
  --ow-black-pure:#000;--ow-obsidian:#050306;--ow-obsidian-soft:#0b070c;--ow-surface:#100c12;--ow-elevated:#17121a;--ow-glass:rgba(20,15,23,.78);
  --ow-bronze-dark:#795330;--ow-bronze:#a1784f;--ow-gold:#d7ae7c;--ow-gold-bright:#e7c892;--ow-gold-light:#f2ddae;
  --ow-chrome-dark:#59505e;--ow-chrome:#a99fab;--ow-chrome-bright:#e2dce5;--ow-chrome-white:#f3eff5;
  --ow-violet-deep:#2d173d;--ow-violet:#783cb2;--ow-violet-light:#a786de;--ow-cobalt-deep:#252b83;--ow-cobalt:#53689f;--ow-cobalt-light:#7788c7;
  --ow-success:#64a77c;--ow-warning:#d2a454;--ow-danger:#c9565e;--ow-muted:#8c858f;--ow-ivory:#f2ede5;
  --cc-bg:var(--ow-obsidian);--cc-surface:var(--ow-surface);--cc-elevated:var(--ow-elevated);--cc-gold:var(--ow-gold);--cc-bright:var(--ow-gold-bright);--cc-ivory:var(--ow-ivory);--cc-muted:var(--ow-muted);--cc-border:rgba(215,174,124,.24);--cc-line:rgba(226,220,229,.105);--cc-success:var(--ow-success);--cc-danger:var(--ow-danger);--cc-shadow:0 28px 90px rgba(0,0,0,.46)
}
html{background:var(--ow-black-pure)}
body{background:radial-gradient(circle at 12% 14%,rgba(120,60,178,.11),transparent 30%),radial-gradient(circle at 86% 10%,rgba(70,91,180,.09),transparent 28%),radial-gradient(circle at 50% 100%,rgba(215,174,124,.07),transparent 38%),linear-gradient(180deg,#030204 0%,#09060b 48%,#020102 100%);background-attachment:fixed}
body:before{background:linear-gradient(116deg,transparent 0%,rgba(255,255,255,.013) 47%,transparent 51%);content:"";inset:0;pointer-events:none;position:fixed;z-index:-1}
.cc-app{isolation:isolate;position:relative}.cc-sidebar{background:linear-gradient(180deg,rgba(16,10,18,.9),rgba(4,2,5,.95));border-right-color:rgba(215,174,124,.2);box-shadow:inset -1px 0 rgba(226,220,229,.025),22px 0 80px rgba(0,0,0,.16);backdrop-filter:blur(18px)}
.cc-brand{margin-bottom:38px}.cc-brand-mark{background:radial-gradient(circle at 34% 28%,rgba(242,221,174,.22),transparent 35%),linear-gradient(140deg,rgba(226,220,229,.16),rgba(14,9,16,.94) 54%,rgba(120,60,178,.2));border-color:rgba(226,220,229,.4);box-shadow:inset 0 1px rgba(255,255,255,.17),0 0 24px rgba(215,174,124,.08);color:var(--ow-chrome-white);text-shadow:0 1px 12px rgba(231,200,146,.55)}
.cc-brand b{background:linear-gradient(100deg,var(--ow-chrome-white),var(--ow-gold-light) 45%,var(--ow-chrome-bright));background-clip:text;color:transparent;text-shadow:none}.cc-brand small{color:var(--ow-chrome)}
.cc-nav p{color:var(--ow-chrome-dark)}.cc-nav a{border-left-color:transparent;color:var(--ow-chrome);position:relative}.cc-nav a:before{background:linear-gradient(180deg,var(--ow-gold-bright),var(--ow-bronze-dark));content:"";height:16px;left:-1px;opacity:0;position:absolute;top:50%;transform:translateY(-50%);transition:opacity .35s ease;width:1px}.cc-nav a:hover,.cc-nav a.is-active{background:linear-gradient(90deg,rgba(215,174,124,.12),rgba(120,60,178,.055),transparent 84%);border-left-color:transparent;color:var(--ow-chrome-white)}.cc-nav a:hover:before,.cc-nav a.is-active:before{opacity:1}.cc-sidebar-foot{border-top-color:rgba(226,220,229,.1);color:var(--ow-chrome)}
.cc-topbar{border-bottom-color:rgba(226,220,229,.12)}.cc-command-title .cc-eyebrow,.cc-kicker,.cc-panel-label,.cc-brief-label{color:var(--ow-gold-bright)}.cc-command-title h1{color:var(--ow-chrome-white);text-shadow:0 1px 24px rgba(226,220,229,.08)}.cc-operator{border-left-color:rgba(226,220,229,.14)}.cc-avatar{background:linear-gradient(145deg,rgba(226,220,229,.15),rgba(16,10,18,.94));border-color:rgba(226,220,229,.36);color:var(--ow-gold-light);box-shadow:inset 0 1px rgba(255,255,255,.1)}
.cc-status-rail{background:rgba(226,220,229,.12);border-color:rgba(226,220,229,.14);box-shadow:inset 0 1px rgba(255,255,255,.035),0 14px 42px rgba(0,0,0,.16)}.cc-status-rail span{background:linear-gradient(135deg,rgba(23,18,26,.92),rgba(8,5,10,.94));color:var(--ow-chrome)}.cc-status-rail b{color:var(--ow-chrome-white)}.cc-status-rail .cc-lock{color:var(--ow-bronze)}.cc-status-dot{box-shadow:0 0 0 4px rgba(100,167,124,.1),0 0 15px rgba(100,167,124,.24)}
.cc-command{background:linear-gradient(100deg,rgba(23,18,26,.9),rgba(10,7,13,.94));border-color:rgba(226,220,229,.18);box-shadow:inset 0 1px rgba(255,255,255,.045),inset 0 -1px rgba(0,0,0,.45),0 20px 60px rgba(0,0,0,.25);position:relative}.cc-command:after{background:linear-gradient(90deg,transparent,rgba(83,104,159,.28),transparent);content:"";height:1px;pointer-events:none;position:absolute;right:8%;top:-1px;width:28%}.cc-command:focus-within{border-color:rgba(231,200,146,.52);box-shadow:inset 0 0 0 1px rgba(167,134,222,.12),0 0 34px rgba(120,60,178,.11),0 20px 60px rgba(0,0,0,.25)}.cc-command>span{color:var(--ow-gold-light);text-shadow:0 0 16px rgba(215,174,124,.35)}.cc-command kbd{background:rgba(89,80,94,.17);border-color:rgba(226,220,229,.14);color:var(--ow-chrome)}
.cc-section-heading h2{color:var(--ow-chrome-white)}.cc-section-note,.cc-section-heading time{color:var(--ow-chrome)}
.cc-system-core,.cc-brief,.cc-evidence-panel,.cc-runtime-console,.cc-runtime-jobs,.cc-approval-panel,.cc-governance,.cc-preview,.cc-metric{background:linear-gradient(145deg,rgba(25,19,28,.92),rgba(8,6,10,.94));border-color:rgba(215,174,124,.16);box-shadow:inset 0 1px rgba(255,255,255,.035),0 24px 80px rgba(0,0,0,.38),0 0 40px rgba(120,60,178,.025);backdrop-filter:blur(18px)}
.cc-system-core{background:radial-gradient(circle at center,rgba(215,174,124,.12),transparent 26%),radial-gradient(circle at 34% 56%,rgba(120,60,178,.13),transparent 38%),radial-gradient(circle at 70% 40%,rgba(83,104,159,.1),transparent 34%),linear-gradient(145deg,rgba(25,19,28,.92),rgba(8,6,10,.94))}.cc-system-core:before{background:conic-gradient(from 130deg,transparent 0 19%,rgba(83,104,159,.68) 24% 30%,transparent 35% 59%,rgba(120,60,178,.7) 64% 70%,transparent 76%);border-radius:50%;content:"";height:206px;opacity:.48;position:absolute;width:206px}.cc-core-orbit-a{border-color:rgba(231,200,146,.52);box-shadow:0 0 24px rgba(215,174,124,.12)}.cc-core-orbit-b{border-color:rgba(226,220,229,.35);border-style:solid}.cc-core-orbit-c{border-color:rgba(83,104,159,.45);border-style:dashed}.cc-core-center{background:radial-gradient(circle at 38% 28%,rgba(242,221,174,.2),transparent 26%),radial-gradient(circle,rgba(42,28,47,.94),rgba(7,4,8,.96) 68%);border-color:rgba(231,200,146,.53);box-shadow:0 0 42px rgba(215,174,124,.13),inset 0 0 36px rgba(120,60,178,.13),inset 0 1px rgba(255,255,255,.08)}.cc-core-center strong{background:linear-gradient(100deg,var(--ow-bronze),var(--ow-gold-light),var(--ow-chrome-bright));background-clip:text;color:transparent;text-shadow:none}.cc-core-label,.cc-core-node{color:var(--ow-chrome)}
.cc-brief{background:linear-gradient(145deg,rgba(30,23,34,.94),rgba(10,7,13,.96))}.cc-brief strong{color:var(--ow-gold-light)}.cc-brief-rule,.cc-runtime-rule{background:linear-gradient(90deg,rgba(215,174,124,.36),rgba(226,220,229,.1),transparent)}.cc-brief p{color:var(--ow-chrome)}
.cc-metric{border-left:2px solid var(--ow-chrome-dark);position:relative;overflow:hidden}.cc-metric:after{background:linear-gradient(90deg,transparent,rgba(255,255,255,.04),transparent);content:"";height:1px;left:0;position:absolute;top:0;width:100%}.cc-metric .cc-metric-label,.cc-metric p{color:var(--ow-chrome)}.cc-metric strong{color:var(--ow-chrome-white)}.cc-metric[data-metric="approval"]{border-left-color:var(--ow-gold)}.cc-metric[data-metric="approval"] strong{color:var(--ow-gold-light)}.cc-metric[data-metric="production-queue"]{border-left-color:var(--ow-violet)}.cc-metric[data-metric="production-queue"] strong{color:var(--ow-violet-light)}.cc-metric[data-metric="claim-blocked"]{border-left-color:var(--ow-danger)}.cc-metric[data-metric="claim-blocked"] strong{color:var(--ow-danger)}.cc-metric[data-metric="quality"]{border-left-color:var(--ow-chrome-bright)}.cc-metric[data-metric="quality"] strong{color:var(--ow-success)}.cc-metric[data-metric="worker"]{border-left-color:var(--ow-cobalt)}.cc-metric[data-metric="worker"] strong{color:var(--ow-cobalt-light)}.cc-metric[data-metric="dead-letter"]{border-left-color:var(--ow-bronze)}.cc-metric[data-metric="dead-letter"] strong{color:var(--ow-bronze)}
.cc-pipeline-node{background:linear-gradient(180deg,rgba(28,21,32,.7),rgba(9,6,11,.32));border-color:rgba(226,220,229,.13)}.cc-pipeline-node:before{background:var(--ow-chrome-bright)}.cc-pipeline-node span{color:var(--ow-chrome)}.cc-pipeline-node b{color:var(--ow-chrome-white)}.cc-pipeline-node strong{color:var(--ow-chrome-bright)}.cc-pipeline-node[data-stage="evidence"]:before{background:var(--ow-cobalt-light)}.cc-pipeline-node[data-stage="queue"]:before{background:var(--ow-violet)}.cc-pipeline-node[data-stage="quality"]:before{background:var(--ow-gold-light)}.cc-pipeline-node[data-stage="fabio"]:before{background:var(--ow-gold)}.cc-pipeline-node[data-stage="calendar"]:before{background:var(--ow-cobalt)}.cc-pipeline-link{background:linear-gradient(90deg,var(--ow-chrome-dark),transparent)}.cc-pipeline-link:after{border-left-color:var(--ow-chrome-bright)}
.cc-lane{border-top-color:rgba(226,220,229,.13)}.cc-lane-head b{color:var(--ow-violet-light)}.cc-lane:first-child .cc-lane-head b{color:var(--ow-gold-light)}.cc-lane:nth-child(2) .cc-lane-head b{color:var(--ow-success)}.cc-lane:nth-child(3) .cc-lane-head b{color:var(--ow-cobalt-light)}.cc-lane:nth-child(4) .cc-lane-head b{color:var(--ow-danger)}.cc-production-card{background:linear-gradient(135deg,rgba(28,20,35,.88),rgba(9,6,12,.92));border-color:rgba(167,134,222,.18);border-left-color:var(--ow-violet);box-shadow:inset 0 1px rgba(255,255,255,.025),0 12px 38px rgba(0,0,0,.17)}.cc-production-card:hover,.cc-production-card[aria-pressed="true"]{background:linear-gradient(135deg,rgba(48,29,65,.88),rgba(14,9,18,.96));border-color:rgba(231,200,146,.47);border-left-color:var(--ow-gold-light);box-shadow:inset 0 1px rgba(255,255,255,.07),0 0 0 1px rgba(167,134,222,.08),0 0 42px rgba(215,174,124,.08)}.cc-card-meta,.cc-card-signals{color:var(--ow-chrome)}.cc-production-card h3{color:var(--ow-chrome-white)}.cc-card-signals b{color:var(--ow-chrome-bright)}.cc-preview{border-color:rgba(231,200,146,.28);background:linear-gradient(155deg,rgba(27,20,31,.96),rgba(7,4,9,.98));box-shadow:inset 0 1px rgba(255,255,255,.06),0 24px 80px rgba(0,0,0,.45),0 0 44px rgba(120,60,178,.06)}.cc-preview-heading{border-bottom-color:rgba(226,220,229,.13)}.cc-preview-heading h3{color:var(--ow-chrome-white)}.cc-asset-frame{background:radial-gradient(circle at 16% 10%,rgba(231,200,146,.2),transparent 25%),linear-gradient(145deg,rgba(7,5,9,.98),rgba(38,23,50,.8) 55%,rgba(10,9,24,.92));border-color:rgba(231,200,146,.5);box-shadow:inset 0 1px rgba(255,255,255,.12),inset 9px 0 rgba(226,220,229,.035),0 0 28px rgba(120,60,178,.12)}.cc-asset-frame h4{color:var(--ow-chrome-white)}.cc-asset-frame .cc-asset-index{color:var(--ow-gold-light)}.cc-asset-frame p,.cc-preview-details p{color:var(--ow-chrome)}.cc-preview-details{border-top-color:rgba(226,220,229,.14)}.cc-preview-details b{color:var(--ow-chrome-bright)}.cc-preview-nav button{background:rgba(89,80,94,.12);border-color:rgba(226,220,229,.18);color:var(--ow-chrome-bright)}.cc-preview-nav button:hover{border-color:var(--ow-gold);color:var(--ow-gold-light)}
.cc-control-button,.cc-modal-button{border:1px solid rgba(231,200,146,.48);box-shadow:inset 0 1px rgba(255,255,255,.12),0 8px 24px rgba(0,0,0,.18);color:#160d08;cursor:pointer;font:600 11px/1.1 Inter,ui-sans-serif,system-ui,sans-serif;letter-spacing:.035em;padding:10px 13px;transition:filter .24s ease,transform .24s ease,box-shadow .24s ease}.cc-control-button:hover,.cc-modal-button:hover{filter:brightness(1.09);transform:translateY(-1px)}.cc-control-button:disabled,.cc-modal-button:disabled{cursor:wait;filter:saturate(.4);opacity:.58;transform:none}.cc-control-button[data-action="APPROVE_CONTENT"],.cc-modal-button--approve{background:linear-gradient(135deg,var(--ow-gold-light),var(--ow-bronze));border-color:var(--ow-gold-light)}.cc-control-button[data-action="REJECT_CONTENT"]{background:linear-gradient(135deg,#6f2d36,#35161c);border-color:rgba(201,86,94,.55);color:var(--ow-chrome-white)}.cc-preview-actions .cc-panel-label{color:var(--ow-gold-light)}
.cc-evidence-panel:nth-child(1){border-top:1px solid var(--ow-chrome)}.cc-evidence-panel:nth-child(2){border-top:1px solid var(--ow-cobalt-light)}.cc-evidence-panel:nth-child(3){border-top:1px solid var(--ow-violet-light)}.cc-list-item{border-bottom-color:rgba(226,220,229,.1)}.cc-list-item b{color:var(--ow-chrome-white)}.cc-list-item p{color:var(--ow-chrome)}.cc-list-item span{color:var(--ow-cobalt-light)}.cc-list-empty,.cc-preview-empty{background:radial-gradient(circle at center,rgba(120,60,178,.07),transparent 56%);color:var(--ow-chrome)}.cc-preview-empty span,.cc-intentional-empty>span{color:var(--ow-chrome-bright);text-shadow:0 0 25px rgba(167,134,222,.22)}
.cc-runtime-console{border-top-color:var(--ow-cobalt-light)}.cc-runtime-jobs{border-top-color:var(--ow-violet-light)}.cc-runtime-console>strong{color:var(--ow-chrome-white)}.cc-runtime-console>p,.cc-runtime-console dt,.cc-runtime-bar span{color:var(--ow-chrome)}.cc-runtime-console dd,.cc-runtime-bar b{color:var(--ow-chrome-bright)}.cc-runtime-state{color:var(--ow-cobalt-light)}.cc-runtime-track{background:rgba(226,220,229,.1)}.cc-runtime-fill{background:linear-gradient(90deg,var(--ow-violet),var(--ow-cobalt-light));box-shadow:0 0 12px rgba(83,104,159,.26)}.cc-runtime-bar[data-tone="danger"] .cc-runtime-fill{background:linear-gradient(90deg,var(--ow-bronze),var(--ow-danger));box-shadow:0 0 12px rgba(201,86,94,.24)}
.cc-agent{background:linear-gradient(100deg,rgba(42,24,55,.72),rgba(10,7,14,.62));border-color:rgba(167,134,222,.19);border-left:2px solid var(--ow-violet);box-shadow:inset 0 1px rgba(255,255,255,.03),0 18px 52px rgba(0,0,0,.22)}.cc-agent[data-agent="content-director"] .cc-kicker{color:var(--ow-gold-light)}.cc-agent h3{color:var(--ow-chrome-white)}.cc-agent p,.cc-agent-stat span{color:var(--ow-chrome)}.cc-agent-stat{border-left-color:rgba(226,220,229,.13)}.cc-agent-stat b{color:var(--ow-violet-light)}.cc-intentional-empty{background:linear-gradient(90deg,rgba(89,80,94,.08),transparent);border-color:rgba(226,220,229,.13);color:var(--ow-chrome)}.cc-intentional-empty b{color:var(--ow-chrome-bright)}
.cc-approval-panel{border-color:rgba(231,200,146,.32);background:linear-gradient(135deg,rgba(45,31,26,.82),rgba(17,11,18,.94));box-shadow:inset 0 1px rgba(255,255,255,.065),0 28px 90px rgba(0,0,0,.43),0 0 45px rgba(215,174,124,.045)}.cc-approval-panel h3{color:var(--ow-gold-light)}.cc-approval-panel p:not(.cc-panel-label){color:var(--ow-chrome)}.cc-text-action{border-bottom-color:var(--ow-gold);color:var(--ow-gold-light)}.cc-governance{border-color:rgba(226,220,229,.2);background:linear-gradient(135deg,rgba(20,15,23,.94),rgba(6,4,7,.96))}.cc-governance h2{color:var(--ow-chrome-white)}.cc-governance p:not(.cc-kicker){color:var(--ow-chrome)}.cc-lock-glyph{background:linear-gradient(145deg,rgba(226,220,229,.11),rgba(8,5,9,.9));border-color:rgba(226,220,229,.34);color:var(--ow-chrome-bright);box-shadow:inset 0 1px rgba(255,255,255,.1)}
.cc-authorization{align-items:center;display:grid;inset:0;isolation:isolate;justify-items:center;padding:22px;position:fixed;z-index:20}.cc-authorization[hidden]{display:none}.cc-authorization-backdrop{background:rgba(0,0,0,.73);backdrop-filter:blur(11px);inset:0;position:absolute}.cc-authorization-dialog{background:radial-gradient(circle at 86% 8%,rgba(215,174,124,.15),transparent 31%),radial-gradient(circle at 12% 90%,rgba(120,60,178,.14),transparent 35%),linear-gradient(145deg,rgba(27,20,31,.99),rgba(5,3,7,.99));border:1px solid rgba(231,200,146,.5);box-shadow:inset 0 1px rgba(255,255,255,.12),0 38px 120px rgba(0,0,0,.72),0 0 55px rgba(215,174,124,.1);max-width:560px;padding:30px;position:relative;width:min(100%,560px)}.cc-authorization-dialog:before{background:linear-gradient(90deg,var(--ow-chrome-dark),var(--ow-gold-light),var(--ow-chrome-dark));content:"";height:1px;left:30px;position:absolute;right:30px;top:0}.cc-authorization-dialog h2{color:var(--ow-gold-light);font-family:Georgia,"Times New Roman",serif;font-size:30px;font-weight:400;letter-spacing:-.025em;margin:7px 0 10px}.cc-authorization-dialog>p:not(.cc-kicker){color:var(--ow-chrome);font-size:12px;line-height:1.55;margin:0}.cc-authorization-details{border-bottom:1px solid rgba(226,220,229,.12);border-top:1px solid rgba(226,220,229,.12);display:grid;gap:0;margin:23px 0 16px;padding:5px 0}.cc-authorization-details div{display:grid;gap:14px;grid-template-columns:minmax(105px,.65fr) minmax(0,1.35fr);padding:8px 0}.cc-authorization-details dt{color:var(--ow-chrome);font-size:10px}.cc-authorization-details dd{color:var(--ow-chrome-bright);font:10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;margin:0;overflow-wrap:anywhere}.cc-authorization-notice{color:var(--ow-chrome)!important;font-size:11px!important}.cc-authorization-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;margin-top:25px}.cc-modal-button--quiet{background:rgba(89,80,94,.12);border-color:rgba(226,220,229,.2);color:var(--ow-chrome-bright)}
@media (prefers-reduced-motion:no-preference){.cc-system-core:before{animation:cc-core-arc 22s linear infinite}.cc-brand-mark{animation:cc-metal-shimmer 9s ease-in-out infinite}.cc-control-button[data-action="APPROVE_CONTENT"],.cc-modal-button--approve{background-size:180% 100%;animation:cc-metal-shimmer 8s ease-in-out infinite}}@keyframes cc-core-arc{to{transform:rotate(360deg)}}@keyframes cc-metal-shimmer{50%{background-position:100% 0}}
@media (max-width:520px){.cc-authorization-dialog{padding:24px 19px}.cc-authorization-dialog:before{left:19px;right:19px}.cc-authorization-details div{grid-template-columns:1fr}.cc-authorization-details dd{font-size:9px}.cc-authorization-actions{justify-content:stretch}.cc-authorization-actions .cc-modal-button{flex:1}.cc-control-button{width:100%}}

/* Full-screen environment. The original unmodified brand asset is only read
   from the exact local route below; all readability protection is layered CSS. */
html,body,button,a,input{cursor:auto}button,a,[role="button"]{cursor:pointer}
.cc-app{--cc-parallax-x:0px;--cc-parallax-y:0px;--cc-scroll-shift:0px;grid-template-columns:276px minmax(0,1fr);min-height:100svh}
.cc-world{inset:0;overflow:hidden;pointer-events:none;position:fixed;z-index:0}.cc-world-image,.cc-world-vignette,.cc-world-light{inset:-18px;position:absolute}.cc-world-image{background-image:url("/assets/brand/onlyway-obsidian-chrome-original.png");background-position:50% 50%;background-repeat:no-repeat;background-size:cover;filter:brightness(.56) contrast(1.06) saturate(.9);opacity:.58;transform:translate(var(--cc-parallax-x),calc(var(--cc-parallax-y) - var(--cc-scroll-shift))) scale(1.035);transition:background-position 1.2s ease,transform .9s ease}.cc-world-vignette{background:radial-gradient(ellipse at 50% 42%,rgba(4,2,6,.43) 0%,rgba(4,2,6,.57) 47%,rgba(0,0,0,.88) 100%),linear-gradient(180deg,rgba(215,174,124,.11),transparent 20%,rgba(2,1,3,.38) 75%,rgba(0,0,0,.66));box-shadow:inset 0 0 180px rgba(0,0,0,.7)}.cc-world-light{background:radial-gradient(ellipse at 12% 28%,rgba(120,60,178,.2),transparent 30%),radial-gradient(ellipse at 85% 55%,rgba(83,104,159,.16),transparent 32%),radial-gradient(ellipse at 52% 1%,rgba(215,174,124,.16),transparent 32%);mix-blend-mode:screen;opacity:.55;transform:translate3d(0,0,0)}.cc-sidebar,.cc-main{position:relative;z-index:1}.cc-sidebar{background:linear-gradient(180deg,rgba(10,6,12,.78),rgba(3,2,5,.88));backdrop-filter:blur(24px);border-right-color:rgba(226,220,229,.2)}.cc-main{margin:0;max-width:none;padding:30px clamp(32px,3vw,48px) 88px;width:100%}
.cc-system-core,.cc-brief,.cc-evidence-panel,.cc-runtime-console,.cc-runtime-jobs,.cc-approval-panel,.cc-governance,.cc-preview,.cc-metric{background:linear-gradient(145deg,rgba(25,19,28,.72),rgba(8,6,10,.68));backdrop-filter:blur(23px);border-color:rgba(226,220,229,.18)}.cc-system-core{background:radial-gradient(circle at center,rgba(215,174,124,.11),transparent 27%),radial-gradient(circle at 34% 56%,rgba(120,60,178,.12),transparent 38%),radial-gradient(circle at 70% 40%,rgba(83,104,159,.1),transparent 34%),linear-gradient(145deg,rgba(22,16,27,.68),rgba(5,4,8,.6))}.cc-brief{background:linear-gradient(145deg,rgba(30,23,34,.72),rgba(10,7,13,.65))}.cc-production-card{background:linear-gradient(135deg,rgba(28,20,35,.73),rgba(9,6,12,.68));backdrop-filter:blur(18px)}.cc-preview{background:linear-gradient(155deg,rgba(27,20,31,.78),rgba(7,4,9,.76))}.cc-approval-panel{background:linear-gradient(135deg,rgba(45,31,26,.72),rgba(17,11,18,.7))}.cc-governance{background:linear-gradient(135deg,rgba(20,15,23,.72),rgba(6,4,7,.69))}
.cc-metric,.cc-production-card,.cc-evidence-panel,.cc-runtime-console,.cc-runtime-jobs,.cc-agent,.cc-approval-panel{transition:background .32s ease,border-color .32s ease,box-shadow .32s ease,transform .32s ease}.cc-metric:hover,.cc-production-card:hover,.cc-evidence-panel:hover,.cc-runtime-console:hover,.cc-runtime-jobs:hover,.cc-agent:hover{box-shadow:inset 0 1px rgba(255,255,255,.08),0 28px 84px rgba(0,0,0,.4),0 0 26px rgba(226,220,229,.06);transform:translateY(-2px)}
.cc-app[data-section="overview"] .cc-world-image{background-position:50% 45%}.cc-app[data-section="production"] .cc-world-image{background-position:62% 50%}.cc-app[data-section="evidence"] .cc-world-image{background-position:75% 50%;filter:brightness(.53) contrast(1.08) saturate(.98)}.cc-app[data-section="runtime"] .cc-world-image{background-position:80% 42%;filter:brightness(.5) contrast(1.1) saturate(1.02)}.cc-app[data-section="approvals"] .cc-world-image{background-position:50% 35%;filter:brightness(.58) contrast(1.06) saturate(.88)}.cc-app[data-section="governance"] .cc-world-image{background-position:34% 48%;filter:brightness(.46) contrast(1.05) saturate(.62)}
.cc-core-orbit,.cc-system-core:before{animation:none!important}.cc-app[data-runtime-activity="active"] .cc-core-orbit-a{animation:cc-orbit 18s linear infinite!important}.cc-app[data-runtime-activity="active"] .cc-core-orbit-b{animation:cc-orbit 29s linear infinite reverse!important}.cc-app[data-runtime-activity="active"] .cc-core-orbit-c{animation:cc-orbit 40s linear infinite!important}.cc-app[data-runtime-activity="active"] .cc-system-core:before{animation:cc-core-arc 22s linear infinite!important}
@media (prefers-reduced-motion:no-preference){.cc-world-light{animation:cc-ambient-drift 28s ease-in-out infinite alternate}}@keyframes cc-ambient-drift{from{transform:translate3d(-6px,-3px,0) scale(1.01)}to{transform:translate3d(8px,5px,0) scale(1.04)}}
@media (prefers-reduced-motion:reduce){.cc-world-image,.cc-world-light{animation:none!important;transform:none!important;transition:none!important}.cc-metric,.cc-production-card,.cc-evidence-panel,.cc-runtime-console,.cc-runtime-jobs,.cc-agent,.cc-approval-panel{transition:none!important}}
@media (max-width:820px){.cc-app{grid-template-columns:1fr}.cc-sidebar{background:linear-gradient(180deg,rgba(10,6,12,.88),rgba(3,2,5,.9));backdrop-filter:blur(20px)}.cc-main{padding:24px 20px 64px}.cc-world-image{opacity:.43;background-position:50% 50%!important}.cc-world-vignette{background:radial-gradient(ellipse at 50% 35%,rgba(4,2,6,.44),rgba(0,0,0,.84) 100%)}}

/* Keep the source pixels intact: readability comes from separate overlays, never image filters. */
.cc-world-image{filter:none;opacity:.55}.cc-world-vignette{background:radial-gradient(ellipse at 50% 42%,rgba(4,2,6,.24) 0%,rgba(4,2,6,.42) 48%,rgba(0,0,0,.72) 100%),linear-gradient(180deg,rgba(215,174,124,.08),transparent 22%,rgba(2,1,3,.22) 74%,rgba(0,0,0,.46));box-shadow:inset 0 0 140px rgba(0,0,0,.48)}.cc-app[data-section] .cc-world-image{filter:none}.cc-main{background:transparent!important}.cc-metric:hover,.cc-production-card:hover,.cc-evidence-panel:hover,.cc-runtime-console:hover,.cc-runtime-jobs:hover,.cc-agent:hover,.cc-approval-panel:hover{transform:none!important}
@media (min-width:821px){.cc-app{height:100dvh;overflow:hidden}.cc-sidebar{height:100dvh;overflow-y:auto;overscroll-behavior:contain;position:sticky;top:0}.cc-main{height:100dvh;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}}
@media (max-width:820px){.cc-world-image{filter:none;opacity:.48}.cc-world-vignette{background:radial-gradient(ellipse at 50% 35%,rgba(4,2,6,.3),rgba(0,0,0,.7) 100%)}.cc-main{height:auto;overflow:visible}.cc-sidebar{height:auto;overflow:visible}}

/* Fluid navigation shell. */
.cc-app{--cc-sidebar-width:280px;--cc-sidebar-shift:0px;grid-template-columns:var(--cc-sidebar-width) minmax(0,1fr);transition:grid-template-columns .65s cubic-bezier(.22,.75,.18,1)}.cc-app[data-sidebar-state="compact"]{--cc-sidebar-width:76px;--cc-sidebar-shift:-7px}.cc-world-image{transform:translate(calc(var(--cc-parallax-x) + var(--cc-sidebar-shift)),calc(var(--cc-parallax-y) - var(--cc-scroll-shift))) scale(1.035);transition:background-position 1.2s ease,transform .75s cubic-bezier(.22,.75,.18,1)}
.cc-sidebar{padding:22px 14px 18px;transition:padding .55s ease,width .55s ease}.cc-sidebar-head{align-items:center;display:flex;gap:8px;justify-content:space-between;min-height:42px}.cc-brand{gap:11px;margin:0;min-width:0;padding:4px}.cc-brand-copy{overflow:hidden;white-space:nowrap}.cc-sidebar-toggle{align-items:center;background:rgba(12,8,15,.52);border:1px solid rgba(226,220,229,.16);border-radius:50%;color:var(--ow-chrome);display:flex;flex:0 0 auto;font:20px/1 Georgia,serif;height:30px;justify-content:center;padding:0;transition:border-color .28s ease,box-shadow .28s ease,color .28s ease;width:30px}.cc-sidebar-toggle:hover,.cc-sidebar-toggle:focus-visible{border-color:rgba(231,200,146,.5);box-shadow:0 0 22px rgba(120,60,178,.14);color:var(--ow-gold-light);outline:0}.cc-nav{margin-top:25px}.cc-nav a{align-items:center;display:grid;gap:11px;grid-template-columns:24px minmax(0,1fr);min-height:39px;position:relative}.cc-nav-icon{color:var(--ow-chrome);display:grid;font-size:15px;place-items:center;transition:color .28s ease}.cc-nav a.is-active .cc-nav-icon{color:var(--ow-gold-light)}.cc-nav-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cc-mobile-menu,.cc-sidebar-backdrop{display:none}
.cc-app[data-sidebar-state="compact"] .cc-sidebar{padding-inline:10px}.cc-app[data-sidebar-state="compact"] .cc-sidebar-head{flex-direction:column}.cc-app[data-sidebar-state="compact"] .cc-brand-copy,.cc-app[data-sidebar-state="compact"] .cc-nav-label,.cc-app[data-sidebar-state="compact"] .cc-nav p,.cc-app[data-sidebar-state="compact"] .cc-sidebar-foot-label{display:none}.cc-app[data-sidebar-state="compact"] .cc-brand{justify-content:center}.cc-app[data-sidebar-state="compact"] .cc-nav{gap:5px;margin-top:22px}.cc-app[data-sidebar-state="compact"] .cc-nav a{display:grid;grid-template-columns:1fr;justify-items:center;padding:8px}.cc-app[data-sidebar-state="compact"] .cc-nav a:after{background:linear-gradient(145deg,rgba(25,19,28,.98),rgba(5,3,7,.98));border:1px solid rgba(226,220,229,.18);box-shadow:0 16px 48px rgba(0,0,0,.5);color:var(--ow-chrome-white);content:attr(data-label);font-size:11px;left:calc(100% + 12px);opacity:0;padding:8px 11px;pointer-events:none;position:absolute;top:50%;transform:translate(-4px,-50%);transition:opacity .18s ease,transform .18s ease;white-space:nowrap;z-index:8}.cc-app[data-sidebar-state="compact"] .cc-nav a:hover:after,.cc-app[data-sidebar-state="compact"] .cc-nav a:focus-visible:after{opacity:1;transform:translate(0,-50%)}.cc-app[data-sidebar-state="compact"] .cc-sidebar-foot{justify-content:center;padding-inline:0}

/* Typography and semantic surfaces. */
.cc-topbar h1,.cc-section-heading h2,.cc-preview-heading h3,.cc-approval-panel h3,.cc-authorization-dialog h2{background:linear-gradient(102deg,var(--ow-ivory),var(--ow-gold-light) 54%,var(--ow-chrome-white));background-clip:text;color:transparent;text-shadow:0 1px 24px rgba(215,174,124,.055)}.cc-kicker,.cc-panel-label,.cc-brief-label,.cc-eyebrow{color:var(--ow-bronze);font-weight:600;letter-spacing:.19em}.cc-card-meta,.cc-list-item span,.cc-inspector-code code,.cc-authorization-details dd{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.cc-inspector-code code,.cc-authorization-details dd{background:rgba(0,0,0,.2);border:1px solid rgba(226,220,229,.08);border-radius:3px;color:var(--ow-chrome-bright);padding:6px 8px}
.cc-metric,.cc-production-card,.cc-evidence-panel,.cc-runtime-console,.cc-runtime-jobs,.cc-agent,.cc-approval-panel,.cc-package-inspector{overflow:hidden;position:relative}.cc-metric:after,.cc-production-card:after,.cc-evidence-panel:after,.cc-runtime-console:after,.cc-runtime-jobs:after,.cc-agent:after,.cc-approval-panel:after,.cc-package-inspector:after{background:linear-gradient(105deg,transparent 32%,rgba(242,221,174,.075) 47%,rgba(226,220,229,.045) 53%,transparent 68%);content:"";inset:0;pointer-events:none;transform:translateX(-115%);transition:transform 1.05s ease}.cc-metric:hover:after,.cc-production-card:hover:after,.cc-evidence-panel:hover:after,.cc-runtime-console:hover:after,.cc-runtime-jobs:hover:after,.cc-agent:hover:after,.cc-approval-panel:hover:after,.cc-package-inspector:hover:after{transform:translateX(115%)}.cc-metric:hover,.cc-production-card:hover,.cc-evidence-panel:hover,.cc-runtime-console:hover,.cc-runtime-jobs:hover,.cc-agent:hover,.cc-approval-panel:hover,.cc-package-inspector:hover{transform:none!important}

/* Immersive package viewer. */
.cc-production-layout{align-items:start;grid-template-columns:minmax(280px,.8fr) minmax(360px,1.2fr)}.cc-package-inspector{background:linear-gradient(145deg,rgba(16,18,32,.75),rgba(7,5,11,.72));border:1px solid rgba(119,136,199,.3);box-shadow:inset 0 1px rgba(255,255,255,.04),0 24px 72px rgba(0,0,0,.32);grid-column:1/-1;padding:24px}.cc-package-inspector h3{color:var(--ow-chrome-white);font-family:Georgia,"Times New Roman",serif;font-size:22px;font-weight:400;margin:7px 0 18px}.cc-inspector-row,.cc-inspector-code{align-items:start;border-bottom:1px solid rgba(226,220,229,.09);display:grid;gap:12px;grid-template-columns:minmax(100px,.8fr) minmax(0,1.2fr);padding:10px 0}.cc-inspector-row span,.cc-inspector-code span{color:var(--ow-chrome);font-size:10px}.cc-inspector-row b{color:var(--ow-chrome-bright);font-size:11px;font-weight:500;text-align:right}.cc-inspector-code code{font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cc-inspector-warning{color:var(--ow-warning);font-size:10px;line-height:1.45;margin:14px 0 0}.cc-app[data-sidebar-state="compact"] .cc-production-layout{grid-template-columns:minmax(250px,.72fr) minmax(360px,1.22fr) minmax(245px,.72fr)}.cc-app[data-sidebar-state="compact"] .cc-package-inspector{grid-column:auto;position:sticky;top:22px}.cc-app[data-sidebar-state="compact"] .cc-preview{position:sticky;top:22px}

/* Business Mission V1. */
.cc-business-shell{display:grid;gap:16px;grid-template-columns:minmax(210px,.34fr) minmax(0,1.66fr)}.cc-business-list{display:grid;gap:8px;height:max-content;position:sticky;top:22px}.cc-business-mission-card{background:rgba(8,5,11,.7);border:1px solid rgba(226,220,229,.13);color:var(--ow-chrome);display:grid;gap:7px;padding:16px;text-align:left}.cc-business-mission-card[aria-pressed="true"]{background:linear-gradient(135deg,rgba(215,174,124,.12),rgba(65,32,88,.18));border-color:rgba(231,200,146,.42)}.cc-business-mission-card b{color:var(--ow-chrome-white);font:400 16px/1.2 Georgia,"Times New Roman",serif}.cc-business-mission-card small{font:9px ui-monospace,SFMono-Regular,Menlo,monospace}.cc-business-workspace{display:grid;gap:14px}.cc-business-comparison{display:grid;gap:10px;grid-template-columns:repeat(3,minmax(0,1fr))}.cc-opportunity-card,.cc-business-dossier,.cc-business-panel{background:linear-gradient(145deg,rgba(13,8,17,.72),rgba(4,3,7,.68));border:1px solid rgba(226,220,229,.13);box-shadow:0 24px 68px rgba(0,0,0,.26);padding:20px}.cc-opportunity-card[data-selected="true"]{border-color:rgba(231,200,146,.56);box-shadow:inset 0 1px rgba(255,255,255,.04),0 0 44px rgba(215,174,124,.08)}.cc-opportunity-card h3,.cc-business-dossier>h3,.cc-business-panel h4{color:var(--ow-chrome-white);font-family:Georgia,"Times New Roman",serif;font-weight:400;margin:7px 0}.cc-opportunity-card h3{font-size:18px}.cc-opportunity-card p:not(.cc-panel-label){color:var(--ow-chrome);font-size:10px;min-height:44px}.cc-opportunity-card small{color:var(--ow-bronze);font-size:9px}.cc-opportunity-score{color:var(--ow-gold-light);display:block;font:30px Georgia,"Times New Roman",serif;margin:16px 0 8px}.cc-score-criteria{border-top:1px solid rgba(226,220,229,.09);display:grid;margin-top:16px}.cc-business-datum{align-items:center;border-bottom:1px solid rgba(226,220,229,.075);display:grid;gap:7px;grid-template-columns:minmax(0,1fr) auto;padding:8px 0}.cc-business-datum span{color:var(--ow-chrome);font-size:9px}.cc-business-datum b{color:var(--ow-chrome-bright);font-size:10px}.cc-business-datum small{color:var(--ow-bronze-dark);font-size:8px;grid-column:1/-1}.cc-business-dossier{padding:26px}.cc-business-dossier>h3{font-size:24px;line-height:1.25}.cc-business-summary,.cc-business-gates,.cc-scenario-grid{display:grid;gap:9px;grid-template-columns:repeat(4,minmax(0,1fr));margin:20px 0}.cc-business-summary .cc-business-datum{background:rgba(0,0,0,.2);border:1px solid rgba(226,220,229,.08);padding:12px}.cc-business-gates,.cc-scenario-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.cc-business-gate,.cc-business-scenario{background:rgba(0,0,0,.2);border:1px solid rgba(226,220,229,.1);display:grid;gap:6px;padding:14px}.cc-business-gate[data-status="PASSED"]{border-color:rgba(80,165,121,.3)}.cc-business-gate[data-status="BLOCKED"]{border-color:rgba(201,86,94,.42)}.cc-business-gate span,.cc-business-scenario span{color:var(--ow-bronze);font-size:9px;letter-spacing:.13em}.cc-business-gate strong,.cc-business-scenario b{color:var(--ow-chrome-white);font:400 18px Georgia,"Times New Roman",serif}.cc-business-gate small,.cc-business-scenario small{color:var(--ow-chrome);font-size:9px;line-height:1.45}.cc-business-panel{margin-top:10px;padding:19px}.cc-business-panel h4{font-size:19px}.cc-business-panel p:not(.cc-panel-label),.cc-business-panel small{color:var(--ow-chrome);font-size:10px}.cc-artifact-list{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.cc-artifact-list span{background:rgba(119,136,199,.08);border:1px solid rgba(119,136,199,.23);color:var(--ow-chrome-bright);font-size:8px;letter-spacing:.08em;padding:7px 9px}.cc-business-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}.cc-business-actions .cc-control-button{background:rgba(6,4,8,.72);border:1px solid rgba(226,220,229,.2);color:var(--ow-chrome-bright);padding:10px 14px}.cc-business-actions .cc-control-button[data-action="APPROVE_BUSINESS"]{border-color:rgba(80,165,121,.45)}.cc-business-actions .cc-control-button[data-action="REJECT_BUSINESS"]{border-color:rgba(201,86,94,.45)}

/* Authorization chamber. */
.cc-authorization-backdrop{background:radial-gradient(circle at 50% 46%,rgba(6,3,8,.46),rgba(0,0,0,.82));backdrop-filter:blur(9px)}.cc-authorization-dialog{display:flex;flex-direction:column;height:min(760px,calc(100dvh - 42px));isolation:isolate;max-width:680px;overflow:auto}.cc-authorization-dialog:after{background:url("/assets/brand/onlyway-obsidian-chrome-original.png") center/cover no-repeat;content:"";inset:0;opacity:.11;pointer-events:none;position:absolute;z-index:-1}.cc-authorization-timing{align-items:center;border-bottom:1px solid rgba(226,220,229,.1);border-top:1px solid rgba(226,220,229,.1);display:flex;justify-content:space-between;margin:20px 0 0;padding:10px 0}.cc-authorization-timing span{color:var(--ow-bronze);font-size:9px;letter-spacing:.16em}.cc-authorization-timing time{color:var(--ow-gold-light);font:15px ui-monospace,SFMono-Regular,Menlo,monospace}.cc-authorization-details{overflow:auto}.cc-authorization-actions{margin-top:auto;padding-top:20px}.cc-modal-button--approve[data-action="REJECT_CONTENT"]{background:linear-gradient(135deg,#6f2d36,#35161c);border-color:rgba(201,86,94,.55);color:var(--ow-chrome-white)}

/* Controlled ambient breathing. */
@media (prefers-reduced-motion:no-preference){.cc-world-light{animation:cc-chromatic-breath 16s ease-in-out infinite alternate}}@keyframes cc-chromatic-breath{0%{opacity:.42;transform:translate3d(-4px,-2px,0) scale(1.01)}50%{opacity:.62}100%{opacity:.5;transform:translate3d(7px,4px,0) scale(1.035)}}

/* Operational Agent Company: executable catalog plus durable workday evidence. */
.cc-evidence-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
.cc-agent-company-layout{align-items:start;display:grid;gap:18px;grid-template-columns:minmax(0,1.35fr) minmax(360px,.65fr)}.cc-agent-company-layout>div>.cc-panel-label{margin-bottom:11px}.cc-agent-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.cc-agent{align-items:start;background:linear-gradient(145deg,rgba(18,12,23,.72),rgba(5,4,8,.68));backdrop-filter:blur(20px);grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:18px}.cc-agent>div:first-child{grid-column:1/-1;min-height:112px}.cc-agent h3{font-size:19px;line-height:1.1;margin:6px 0}.cc-agent .cc-kicker{font-size:8px;overflow-wrap:anywhere}.cc-agent-executor{color:var(--ow-bronze-dark);display:block;font:8px ui-monospace,SFMono-Regular,Menlo,monospace;margin-top:10px;overflow-wrap:anywhere}.cc-agent-stat{border-left:0;border-top:1px solid rgba(226,220,229,.09);padding-left:0;padding-top:9px}.cc-agent-stat span{font-size:8px}.cc-agent-stat b{color:var(--ow-chrome-bright);font-size:10px}.cc-agent[data-state="DEGRADED"]{border-color:rgba(201,86,94,.42)}.cc-agent[data-state="ACTIVE"]{border-color:rgba(80,165,121,.38)}.cc-workday-console{background:linear-gradient(145deg,rgba(18,12,23,.78),rgba(5,4,8,.74));backdrop-filter:blur(23px);border:1px solid rgba(226,220,229,.17);box-shadow:0 24px 72px rgba(0,0,0,.3);max-height:calc(100dvh - 48px);overflow:auto;padding:22px;position:sticky;top:22px}.cc-workday-heading{border-bottom:1px solid rgba(226,220,229,.1);padding-bottom:15px}.cc-workday-heading h3{color:var(--ow-chrome-white);font-size:21px;margin:6px 0 0}.cc-workday-list{display:grid;gap:7px;margin-top:14px}.cc-workday-card{background:rgba(4,3,7,.45);border:1px solid rgba(226,220,229,.12);color:var(--ow-chrome);display:grid;gap:5px;padding:12px;text-align:left}.cc-workday-card:hover,.cc-workday-card:focus-visible,.cc-workday-card[aria-pressed="true"]{background:rgba(48,30,57,.28);border-color:rgba(231,200,146,.42);box-shadow:inset 0 1px rgba(255,255,255,.04);outline:0;transform:none}.cc-workday-card b{color:var(--ow-chrome-white);font:400 14px/1.25 Georgia,"Times New Roman",serif}.cc-workday-card span{color:var(--ow-bronze);font-size:8px;letter-spacing:.08em}.cc-workday-detail{border-top:1px solid rgba(226,220,229,.1);margin-top:16px;padding-top:16px}.cc-workday-summary{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr))}.cc-workday-tasks{display:grid;gap:7px;margin-top:18px}.cc-workday-task{background:rgba(0,0,0,.2);border-left:2px solid rgba(226,220,229,.19);display:grid;gap:4px;padding:11px 12px}.cc-workday-task[data-status="COMPLETED"]{border-left-color:rgba(80,165,121,.7)}.cc-workday-task[data-status="BLOCKED"]{border-left-color:rgba(201,86,94,.78)}.cc-workday-task>span{color:var(--ow-bronze);font:8px ui-monospace,SFMono-Regular,Menlo,monospace}.cc-workday-task>b{color:var(--ow-chrome-white);font-size:10px;font-weight:500;overflow-wrap:anywhere}.cc-workday-task>p,.cc-workday-task>small{color:var(--ow-chrome);font-size:8px;margin:0;overflow-wrap:anywhere}.cc-workday-task>small{color:var(--ow-bronze-dark);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.cc-task-output{border-top:1px solid rgba(226,220,229,.08);margin-top:5px;padding-top:7px}.cc-task-output summary{color:var(--ow-bronze);cursor:pointer;font-size:8px}.cc-task-output pre{color:var(--ow-chrome);font:8px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;margin:8px 0 0;overflow:auto;white-space:pre-wrap}.cc-workday-console,.cc-workday-card,.cc-agent{transition:background .28s ease,border-color .28s ease,box-shadow .28s ease}.cc-workday-console:hover,.cc-workday-card:hover,.cc-agent:hover{transform:none!important}

/* Social Intelligence: daily decision surface, never placeholder analytics. */
.cc-social-live{background:linear-gradient(145deg,rgba(15,11,20,.8),rgba(4,4,8,.66));backdrop-filter:blur(22px);border:1px solid rgba(205,165,86,.28);display:grid;gap:16px;margin-bottom:14px;padding:20px}.cc-social-live-head{align-items:start;display:flex;gap:18px;justify-content:space-between}.cc-social-live-head h3{font:400 clamp(20px,2.4vw,34px)/1 Georgia,"Times New Roman",serif;margin:3px 0}.cc-social-live-head .cc-social-score{font-size:20px;margin:2px 0 0;text-align:right}.cc-social-live-grid{display:grid;gap:10px;grid-template-columns:repeat(6,minmax(0,1fr))}.cc-social-live-grid div{border-left:1px solid rgba(205,165,86,.3);display:grid;gap:4px;padding:5px 10px}.cc-social-live-grid span{color:var(--ow-bronze);font-size:8px;text-transform:uppercase}.cc-social-live-grid b{font:400 22px/1 Georgia,"Times New Roman",serif}.cc-social-missing{color:var(--ow-chrome);font-size:9px;line-height:1.6;margin:0}.cc-social-candidate{background:rgba(3,3,7,.42);border:1px solid rgba(205,165,86,.2);display:grid;gap:9px;padding:14px}.cc-social-candidate strong{font:400 17px/1.2 Georgia,"Times New Roman",serif}.cc-social-candidate-signals{display:flex;flex-wrap:wrap;gap:6px}.cc-social-candidate-signals span{border:1px solid rgba(255,255,255,.12);font-size:8px;padding:5px 7px}.cc-social-candidate-signals span[data-ready="true"]{border-color:rgba(92,190,139,.4);color:#91d9b1}.cc-social-candidate-signals span[data-ready="false"]{border-color:rgba(222,169,82,.35);color:#d8b574}.cc-social-downloads{display:flex;flex-wrap:wrap;gap:8px 18px}.cc-social-download{color:var(--ow-gold);font-size:9px;letter-spacing:.08em;text-decoration:none;text-transform:uppercase}.cc-social-download:hover{color:var(--ow-ivory);text-decoration:underline}
.cc-social-summary{display:grid;gap:10px;grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:14px}.cc-social-summary article{background:rgba(6,5,9,.62);backdrop-filter:blur(18px);border:1px solid rgba(226,220,229,.14);display:grid;gap:5px;min-height:96px;padding:16px}.cc-social-summary span{color:var(--ow-bronze);font-size:8px;letter-spacing:.09em;text-transform:uppercase}.cc-social-summary strong{color:var(--ow-chrome-white);font:400 25px/1 Georgia,"Times New Roman",serif}.cc-social-summary small{color:var(--ow-chrome);font-size:8px;line-height:1.4}.cc-social-pack-list{display:grid;gap:12px}.cc-social-pack{background:linear-gradient(145deg,rgba(15,11,20,.78),rgba(4,4,8,.68));backdrop-filter:blur(22px);border:1px solid rgba(226,220,229,.17);box-shadow:0 24px 68px rgba(0,0,0,.28);display:grid;gap:18px;grid-template-columns:minmax(210px,.72fr) minmax(0,1.28fr);padding:22px}.cc-social-pack[data-status="BLOCKED"]{border-color:rgba(201,86,94,.46)}.cc-social-pack[data-status="REQUIRES_RESEARCH"]{border-color:rgba(232,173,78,.42)}.cc-social-pack-head{border-right:1px solid rgba(226,220,229,.1);padding-right:20px}.cc-social-pack-head h3{color:var(--ow-chrome-white);font:400 23px/1.08 Georgia,"Times New Roman",serif;margin:8px 0}.cc-social-score{color:var(--ow-gold-light);display:block;font:400 34px/1 Georgia,"Times New Roman",serif;margin:18px 0 5px}.cc-social-pack-head small,.cc-social-block small{color:var(--ow-bronze-dark);font-size:8px;line-height:1.45}.cc-social-grid{display:grid;gap:8px;grid-template-columns:repeat(3,minmax(0,1fr))}.cc-social-block{background:rgba(0,0,0,.18);border-top:1px solid rgba(226,220,229,.12);display:grid;gap:5px;padding:11px}.cc-social-block span{color:var(--ow-bronze);font-size:8px;letter-spacing:.08em}.cc-social-block b{color:var(--ow-chrome-bright);font-size:10px;font-weight:500;overflow-wrap:anywhere}.cc-social-alert{border-top:1px solid rgba(201,86,94,.3);color:var(--ow-warning);font-size:9px;grid-column:1/-1;margin:0;padding-top:10px}
.cc-approval-review-list{display:grid;gap:12px;margin-top:14px}.cc-approval-review{background:linear-gradient(145deg,rgba(18,12,23,.82),rgba(5,4,8,.74));backdrop-filter:blur(23px);border:1px solid rgba(231,200,146,.28);box-shadow:0 26px 76px rgba(0,0,0,.3);display:grid;gap:18px;padding:22px}.cc-approval-review[data-visual-status="blocked"]{border-color:rgba(201,86,94,.56)}.cc-approval-review-head{align-items:start;border-bottom:1px solid rgba(226,220,229,.1);display:flex;gap:18px;justify-content:space-between;padding-bottom:16px}.cc-approval-review-head h3{color:var(--ow-chrome-white);font:400 24px/1.15 Georgia,"Times New Roman",serif;margin:6px 0}.cc-approval-review-head small{color:var(--ow-bronze);font-size:9px}.cc-approval-gates{display:flex;flex-wrap:wrap;gap:7px}.cc-approval-gates span{border:1px solid rgba(80,165,121,.35);color:#91d9b1;font-size:8px;letter-spacing:.08em;padding:6px 8px}.cc-approval-gates span[data-gate="blocked"]{border-color:rgba(201,86,94,.55);color:#ef9ca3}.cc-visual-review{display:grid;gap:12px}.cc-visual-review-head{align-items:center;display:flex;gap:16px;justify-content:space-between}.cc-visual-review-head p{color:var(--ow-chrome);font-size:9px;line-height:1.5;margin:0}.cc-visual-review-canvases{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}.cc-visual-canvas{background:rgba(0,0,0,.24);border:1px solid rgba(226,220,229,.12);display:grid;gap:8px;padding:10px}.cc-visual-canvas span{color:var(--ow-bronze);font-size:8px;letter-spacing:.1em}.cc-visual-canvas img{background:#050505;display:block;height:min(62vh,700px);object-fit:contain;width:100%}.cc-visual-review-nav{align-items:center;display:flex;gap:10px;justify-content:center}.cc-visual-review-nav button{background:rgba(7,5,9,.75);border:1px solid rgba(231,200,146,.35);color:var(--ow-chrome-bright);cursor:pointer;padding:8px 12px}.cc-visual-review-nav button:hover{border-color:var(--ow-gold-light)}.cc-visual-review-warning{background:rgba(93,26,35,.24);border-left:3px solid var(--ow-danger);color:#efb3b8;font-size:9px;line-height:1.55;margin:0;padding:10px 12px}.cc-approval-review-grid{display:grid;gap:8px;grid-template-columns:repeat(3,minmax(0,1fr))}.cc-approval-review-code{background:rgba(0,0,0,.22);border:1px solid rgba(226,220,229,.08);color:var(--ow-chrome-bright);font:8px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere;padding:10px}.cc-approval-review-foot{align-items:center;border-top:1px solid rgba(226,220,229,.1);display:flex;gap:18px;justify-content:space-between;padding-top:15px}.cc-approval-review-foot p{color:var(--ow-warning);font-size:9px;line-height:1.5;margin:0;max-width:900px}

@media (max-width:1280px){.cc-evidence-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cc-social-summary{grid-template-columns:repeat(3,minmax(0,1fr))}.cc-app[data-sidebar-state="compact"] .cc-production-layout{grid-template-columns:minmax(260px,.8fr) minmax(340px,1.2fr)}.cc-app[data-sidebar-state="compact"] .cc-package-inspector{grid-column:1/-1;position:static}.cc-business-shell,.cc-agent-company-layout{grid-template-columns:1fr}.cc-business-list{grid-template-columns:repeat(2,minmax(0,1fr));position:static}.cc-workday-console{max-height:none;position:static}}
@media (max-width:820px){.cc-evidence-grid,.cc-social-summary,.cc-social-grid,.cc-approval-review-grid,.cc-visual-review-canvases{grid-template-columns:1fr}.cc-social-pack{grid-template-columns:1fr}.cc-social-pack-head{border-bottom:1px solid rgba(226,220,229,.1);border-right:0;padding-bottom:16px;padding-right:0}.cc-approval-review-head,.cc-approval-review-foot,.cc-visual-review-head{display:grid}.cc-visual-canvas img{height:auto;max-height:none}.cc-app{display:block;height:auto;overflow:visible}.cc-main{padding-top:78px}.cc-mobile-menu{align-items:center;background:linear-gradient(145deg,rgba(25,19,28,.94),rgba(5,3,7,.95));border:1px solid rgba(226,220,229,.22);border-radius:50%;box-shadow:0 14px 38px rgba(0,0,0,.4);display:grid;height:42px;left:18px;padding:11px;position:fixed;top:16px;width:42px;z-index:62}.cc-mobile-menu span{background:var(--ow-chrome-bright);display:block;height:1px;transition:transform .28s ease;width:18px}.cc-app[data-mobile-sidebar="open"] .cc-mobile-menu span:first-child{transform:translateY(3px) rotate(45deg)}.cc-app[data-mobile-sidebar="open"] .cc-mobile-menu span:last-child{transform:translateY(-3px) rotate(-45deg)}.cc-sidebar{bottom:0;height:100dvh!important;left:0;overflow-y:auto!important;padding:22px 17px;position:fixed!important;top:0;transform:translateX(-104%);transition:transform .42s cubic-bezier(.22,.75,.18,1);width:min(86vw,310px);z-index:60}.cc-app[data-mobile-sidebar="open"] .cc-sidebar{transform:translateX(0)}.cc-sidebar-backdrop{background:rgba(0,0,0,.56);backdrop-filter:blur(4px);display:block;inset:0;position:fixed;z-index:55}.cc-sidebar-backdrop[hidden]{display:none}.cc-sidebar-toggle{display:none}.cc-app[data-sidebar-state="compact"] .cc-sidebar{padding:22px 17px}.cc-app[data-sidebar-state="compact"] .cc-sidebar-head{flex-direction:row}.cc-app[data-sidebar-state="compact"] .cc-brand-copy,.cc-app[data-sidebar-state="compact"] .cc-nav-label,.cc-app[data-sidebar-state="compact"] .cc-nav p,.cc-app[data-sidebar-state="compact"] .cc-sidebar-foot-label{display:block}.cc-nav,.cc-app[data-sidebar-state="compact"] .cc-nav{display:flex;flex-direction:column;gap:3px;margin-top:25px;overflow:visible;padding-bottom:0}.cc-nav p{display:block;width:100%}.cc-app[data-sidebar-state="compact"] .cc-nav a{display:grid;grid-template-columns:24px minmax(0,1fr);justify-items:stretch;padding:8px 10px}.cc-app[data-sidebar-state="compact"] .cc-nav a:after{display:none}.cc-app[data-sidebar-state="compact"] .cc-sidebar-foot{justify-content:flex-start;padding-inline:10px}.cc-business-list,.cc-business-comparison,.cc-business-summary,.cc-business-gates,.cc-scenario-grid,.cc-agent-grid{grid-template-columns:1fr}.cc-production-layout,.cc-app[data-sidebar-state="compact"] .cc-production-layout{grid-template-columns:1fr}.cc-package-inspector,.cc-app[data-sidebar-state="compact"] .cc-package-inspector{grid-column:auto;position:static}.cc-authorization-dialog{height:calc(100dvh - 24px);padding:25px 20px}.cc-authorization-details div{grid-template-columns:1fr}.cc-authorization-actions{justify-content:stretch}.cc-authorization-actions .cc-modal-button{flex:1}}
@media (max-width:820px){.cc-section{scroll-margin-top:72px}}
@media (max-width:1280px){.cc-social-live-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:820px){.cc-social-live-grid{grid-template-columns:1fr}.cc-social-live-head{display:grid}}
@media (prefers-reduced-motion:reduce){.cc-app,.cc-sidebar,.cc-world-image,.cc-nav a:after,.cc-mobile-menu span{transition:none!important}.cc-world-light{animation:none!important}}
`;

export const COMMAND_CENTER_CLIENT_JS = `
(() => {
  "use strict";
  const root = document.getElementById("command-center");
  const commandForm = document.getElementById("command-form");
  const commandInput = document.getElementById("command-input");
  const commandResult = document.getElementById("command-result");
  const sidebar = document.getElementById("command-sidebar");
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");
  const actionConfirmation = document.getElementById("action-confirmation");
  const actionConfirmationTitle = document.getElementById("action-confirmation-title");
  const actionConfirmationDetail = document.getElementById("action-confirmation-detail");
  const actionConfirmationDetails = document.getElementById("action-confirmation-details");
  const actionConfirmationSubmit = document.getElementById("action-confirmation-submit");
  const actionConfirmationTimer = document.getElementById("action-confirmation-timer");
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobileSidebar = window.matchMedia ? window.matchMedia("(max-width: 820px)") : { matches: false };
  const state = { confirmationInterval: null, csrfToken: null, pendingConfirmation: null, snapshot: null, selectedBusinessMissionId: null, selectedProductionId: null, selectedWorkdayId: null, sidebarState: "expanded", slideIndex: 0, visualReview: null, visualSlideIndex: 0 };

  function byId(id) { return document.getElementById(id); }
  function text(id, value) { const element = byId(id); if (element) element.textContent = value; }
  function element(tag, className, value) { const node = document.createElement(tag); if (className) node.className = className; if (value !== undefined) node.textContent = value; return node; }
  function number(value) { return new Intl.NumberFormat("it-IT").format(value); }
  function timestamp(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Data locale non disponibile" : new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(date); }
  function statusLabel(value) { const labels = { ACTIVE: "ATTIVO", ATTENTION_REQUIRED: "ATTENZIONE RICHIESTA", AVAILABLE: "DISPONIBILE", AWAITING_FABIO: "IN ATTESA DI FABIO", BLOCKED: "BLOCCATO", COMPLETED: "COMPLETATO", DEGRADED: "DEGRADATO", IMPLEMENTING: "IN IMPLEMENTAZIONE", LOCKED: "BLOCCATO", NOT_OBSERVED: "NON OSSERVATO", NOT_REGISTERED: "NON REGISTRATO", QUEUED: "IN CODA", READY: "PRONTO", RUNNING: "IN ESECUZIONE", SPECIFIED: "SPECIFICATO", TRIGGERED: "ATTIVATO" }; return labels[value] || value.replaceAll("_", " "); }
  function statusLane(status) { if (status === "PENDING_FABIO_APPROVAL") return "REVISIONE FABIO"; if (status === "APPROVED_FOR_SCHEDULING") return "APPROVATI"; if (status === "SCHEDULED") return "CALENDARIO"; if (status === "BLOCKED") return "BLOCCATI DAL RISCHIO"; return "ARCHIVIATI"; }

  async function refresh() {
    try {
      const [response, visualResponse] = await Promise.all([fetch("/api/overview", { cache: "no-store", credentials: "same-origin" }), fetch("/api/social-visual-review", { cache: "no-store", credentials: "same-origin" })]);
      if (!response.ok) throw new Error("L'API locale del Centro di Comando non è disponibile.");
      state.snapshot = await response.json();
      state.visualReview = visualResponse.ok ? await visualResponse.json() : null;
      render(state.snapshot);
    } catch (error) {
      root.dataset.apiState = "error";
      text("system-status", "API LOCALE NON DISPONIBILE");
      text("core-status", "IN ATTESA");
      text("core-detail", "L'API locale non ha potuto leggere il sistema di registrazione.");
      text("brief-decision", "È richiesta la connessione all'API locale");
      text("brief-detail", error instanceof Error ? error.message : "L'API locale non è raggiungibile.");
    }
  }

  function render(snapshot) {
    root.dataset.apiState = "ready";
    root.dataset.runtimeActivity = snapshot.runtime.counts.running > 0 || snapshot.runtime.counts.queued > 0 ? "active" : "idle";
    text("system-status", statusLabel(snapshot.overview.system));
    text("autonomy-status", snapshot.overview.autonomy);
    text("runtime-location", "LOCALE");
    text("decisions-required", number(snapshot.overview.decisionsRequired));
    text("core-status", statusLabel(snapshot.overview.system));
    text("core-detail", snapshot.runtime.continuousWorker === "NOT_REGISTERED" ? "Control plane durevole pronto; nessun worker continuativo registrato." : "Il control plane durevole è disponibile.");
    text("generated-at", "Aggiornato " + timestamp(snapshot.generatedAt));
    text("brief-decision", snapshot.overview.dailyBrief.decision);
    text("brief-detail", snapshot.overview.dailyBrief.detail);
    text("brief-priority", snapshot.overview.dailyBrief.priority);
    renderMetrics(snapshot.overview.metrics);
    renderPipeline(snapshot);
    renderBusiness(snapshot.business || []);
    renderSocialIntelligence(snapshot.socialIntelligence || { blocked: 0, expiringWithin24Hours: 0, packs: [], readyForFabio: 0, requiresResearch: 0 }, snapshot.socialLive);
    renderProductions(snapshot.productions);
    renderEvidence(snapshot.evidence);
    renderRuntime(snapshot.runtime);
    renderAgents(snapshot.agents);
    renderAgentWorkdays(snapshot.agentCompany || []);
    renderApprovals(snapshot.productions, snapshot.business || [], snapshot.socialLive, state.visualReview);
  }

  function renderMetrics(metrics) {
    const target = byId("metric-grid");
    target.replaceChildren();
    for (const metric of metrics) {
      const card = element("article", "cc-metric");
      card.dataset.metric = metric.id;
      card.dataset.tone = metric.tone;
      const value = typeof metric.value === "number" ? number(metric.value) : metric.value;
      card.append(element("span", "cc-metric-label", metric.label), element("strong", "", value), element("p", "", metric.context));
      target.append(card);
    }
  }

  function renderBusiness(missions) {
    const list = byId("business-mission-list");
    const comparison = byId("business-comparison");
    const dossier = byId("business-dossier");
    list.replaceChildren(); comparison.replaceChildren(); dossier.replaceChildren();
    if (missions.length === 0) {
      list.append(element("div", "cc-list-empty", "Nessuna Business Mission durevole. Il sistema non mostra opportunità o numeri dimostrativi."));
      comparison.append(element("div", "cc-list-empty", "Le tre Opportunity Scorecard appariranno solo dopo tre Evidence Pack reali."));
      dossier.append(element("div", "cc-list-empty", "Il dossier commerciale apparirà dopo il confronto deterministico."));
      state.selectedBusinessMissionId = null;
      return;
    }
    if (!missions.some((mission) => mission.mission.missionId === state.selectedBusinessMissionId)) state.selectedBusinessMissionId = missions[0].mission.missionId;
    for (const mission of missions) {
      const button = element("button", "cc-business-mission-card"); button.type = "button"; button.setAttribute("aria-pressed", String(mission.mission.missionId === state.selectedBusinessMissionId));
      button.append(element("span", "cc-panel-label", statusLabel(mission.status)), element("b", "", mission.mission.objective), element("small", "", "v" + String(mission.version) + " · " + mission.mission.missionId));
      button.addEventListener("click", () => { state.selectedBusinessMissionId = mission.mission.missionId; renderBusiness(missions); }); list.append(button);
    }
    const selected = missions.find((mission) => mission.mission.missionId === state.selectedBusinessMissionId);
    if (!selected) return;
    for (const candidate of selected.candidates) {
      const scorecard = selected.scorecards.find((entry) => entry.opportunityId === candidate.opportunityId);
      const card = element("article", "cc-opportunity-card"); card.dataset.selected = String(candidate.opportunityId === selected.selectedOpportunityId);
      card.append(element("p", "cc-panel-label", candidate.opportunityId === selected.selectedOpportunityId ? "OPPORTUNITÀ SELEZIONATA" : "OPPORTUNITÀ"), element("h3", "", candidate.title));
      const score = element("strong", "cc-opportunity-score", scorecard && scorecard.totalScore !== undefined ? String(scorecard.totalScore) + "/100" : "DATI MANCANTI");
      card.append(score, element("p", "", candidate.problem), element("small", "", "Evidence Pack " + candidate.evidencePackId));
      const criteria = element("div", "cc-score-criteria");
      if (scorecard) for (const item of scorecard.criteria) criteria.append(businessDatum(item.criterion, item.weightedContribution === undefined ? "—" : String(item.weightedContribution), item.dataKind));
      card.append(criteria); comparison.append(card);
    }
    dossier.append(element("p", "cc-panel-label", "COMMERCIAL PACKAGE"), element("h3", "", selected.selectionExplanation));
    const summary = element("div", "cc-business-summary");
    summary.append(businessDatum("Stato", statusLabel(selected.status), "DUREVOLE"), businessDatum("Versione", "v" + String(selected.version), "ESATTA"), businessDatum("Artefatti", String(selected.artifacts.length), "FINGERPRINTED"), businessDatum("Azioni esterne", "0", "BLOCCATE")); dossier.append(summary);
    const gates = element("div", "cc-business-gates"); for (const gate of selected.gates) gates.append(businessGate(gate)); dossier.append(gates);
    const offer = selected.commercialPlan.offer;
    const offerPanel = element("section", "cc-business-panel"); offerPanel.append(element("p", "cc-panel-label", "OFFERTA"), element("h4", "", offer.promisedOutcome), element("p", "", offer.positioning), element("small", "", offer.deliverables.join(" · "))); dossier.append(offerPanel);
    const economics = element("section", "cc-business-panel"); economics.append(element("p", "cc-panel-label", "ECONOMICS DETERMINISTICO"));
    const scenarioGrid = element("div", "cc-scenario-grid"); for (const scenario of selected.economics) scenarioGrid.append(businessScenario(scenario)); economics.append(scenarioGrid); dossier.append(economics);
    const validation = element("section", "cc-business-panel"); validation.append(element("p", "cc-panel-label", "VALIDAZIONE"), element("h4", "", String(selected.commercialPlan.validation.length) + " esperimento/i preparati"), element("p", "", "Budget massimo dichiarato: " + euro(selected.commercialPlan.validation.reduce((sum, experiment) => sum + experiment.maxCostCents, 0)) + ". Nessuna esecuzione esterna.")); dossier.append(validation);
    const artifacts = element("section", "cc-business-panel"); artifacts.append(element("p", "cc-panel-label", "ARTIFACT FACTORY")); const artifactList = element("div", "cc-artifact-list"); for (const artifact of selected.artifacts) artifactList.append(element("span", "", artifact.kind.replaceAll("_", " "))); artifacts.append(artifactList); dossier.append(artifacts);
    if (selected.status === "PENDING_FABIO_APPROVAL") {
      const actions = element("div", "cc-business-actions");
      actions.append(businessAction("Approva dossier", "APPROVE_BUSINESS", selected), businessAction("Richiedi revisione", "REQUEST_BUSINESS_REVISION", selected), businessAction("Rifiuta dossier", "REJECT_BUSINESS", selected)); dossier.append(actions);
    }
  }

  function businessDatum(label, value, meta) { const item = element("div", "cc-business-datum"); item.append(element("span", "", label), element("b", "", value), element("small", "", meta)); return item; }
  function businessGate(gate) { const item = element("article", "cc-business-gate"); item.dataset.status = gate.status; item.append(element("span", "", gate.name), element("strong", "", String(gate.score) + "/100"), element("small", "", gate.findings.length === 0 ? "Nessun blocco" : gate.findings.join(" · "))); return item; }
  function businessScenario(scenario) { const item = element("article", "cc-business-scenario"); item.append(element("span", "", scenario.name), element("b", "", scenario.contributionMarginCents.value === undefined ? "NON DISPONIBILE" : euro(scenario.contributionMarginCents.value)), element("small", "", "Margine di contribuzione")); return item; }
  function euro(cents) { return new Intl.NumberFormat("it-IT", { currency: "EUR", style: "currency" }).format(cents / 100); }
  function businessAction(label, action, mission) { const button = element("button", "cc-control-button", label); button.type = "button"; button.dataset.action = action; button.addEventListener("click", () => { void proposeBusinessAction(action, mission, button); }); return button; }

  function renderSocialIntelligence(social, live) {
    const summary = byId("social-summary-grid");
    const list = byId("social-pack-list");
    summary.replaceChildren(); list.replaceChildren();
    renderSocialLive(live);
    const entries = [
      ["Pacchetti durevoli", social.packs.length, "Solo record con fingerprint valido"],
      ["Pronti per Fabio", social.readyForFabio, "Nessuna pubblicazione autorizzata"],
      ["Richiedono ricerca", social.requiresResearch, "Il sistema non imputa dati mancanti"],
      ["Bloccati", social.blocked, "Expiry, rischio, fatigue o score insufficiente"],
      ["Scadenza entro 24h", social.expiringWithin24Hours, "Finestra ricalcolata dai record dichiarati"],
    ];
    for (const entry of entries) {
      const card = element("article");
      card.append(element("span", "", entry[0]), element("strong", "", number(entry[1])), element("small", "", entry[2]));
      summary.append(card);
    }
    text("social-daily-status", social.packs.length > 0 ? number(social.packs.length) + " pacchetto/i verificabile/i" : live && live.totalTrends > 0 ? number(live.totalTrends) + " segnali live · ciclo " + statusLabel(live.cycleReadiness.status) : "Dati social non ancora disponibili");
    if (social.packs.length === 0) {
      list.append(element("div", "cc-list-empty", "Nessun Social Publishing Pack durevole. Trend, hashtag, audio e orari non vengono mostrati finché non esistono segnali autorizzati."));
      return;
    }
    for (const pack of social.packs) {
      const card = element("article", "cc-social-pack"); card.dataset.status = pack.status;
      const head = element("div", "cc-social-pack-head");
      head.append(element("p", "cc-panel-label", statusLabel(pack.status)), element("h3", "", pack.productionId), element("strong", "cc-social-score", pack.opportunity.score === undefined ? "DATO NON DISPONIBILE" : String(pack.opportunity.score) + "/100"), element("small", "", "Decisione: " + statusLabel(pack.decision) + " · completezza " + String(pack.opportunity.completeness) + "%"));
      const grid = element("div", "cc-social-grid");
      grid.append(
        socialBlock("Trend e scadenza", statusLabel(pack.trendAnalysis.phase), pack.trendAnalysis.publishBy ? "Pubblica entro " + timestamp(pack.trendAnalysis.publishBy) : "Nessuna finestra trend dichiarata"),
        socialBlock("Domanda pubblico", statusLabel(pack.audienceDemand.status), String(pack.audienceDemand.intents.length) + " intento/i con provenienza"),
        socialBlock("Concorrenza", statusLabel(pack.competitorGap.status), String(pack.competitorGap.authorizedCompetitors) + " fonte/i competitor autorizzata/e"),
        socialBlock("Hashtag", statusLabel(pack.hashtagSets.status), String(pack.hashtagSets.main.length) + " principali · " + String(pack.hashtagSets.alternate.length) + " alternativi · " + String(pack.hashtagSets.experimental.length) + " sperimentali"),
        socialBlock("Audio e diritti", statusLabel(pack.audioPlan.status), pack.audioPlan.selected ? pack.audioPlan.selected.title : "Nessuna traccia dichiarata utilizzabile"),
        socialBlock("Finestra pubblicazione", statusLabel(pack.publicationWindows.status), pack.publicationWindows.windows.length === 0 ? "Nessun orario inventato" : String(pack.publicationWindows.windows.length) + " intervallo/i dichiarato/i"),
        socialBlock("Distintività brand", String(pack.brandDistinctiveness.score) + "/100", statusLabel(pack.brandDistinctiveness.status)),
        socialBlock("Fatigue", String(pack.fatigue.score) + "/100", statusLabel(pack.fatigue.status)),
        socialBlock("Misurazione", "IN ATTESA DI DATI REALI", pack.measurement.nextDecision)
      );
      const alerts = [...pack.blockingReasons];
      if (pack.status === "REQUIRES_RESEARCH") alerts.push("Score incompleto: acquisire i segnali mancanti senza sostituirli con stime arbitrarie.");
      if (pack.publicationWindows.status === "DATI_INSUFFICIENTI") alerts.push(pack.publicationWindows.testPlan || "Preparare una finestra sperimentale misurabile.");
      if (alerts.length > 0) grid.append(element("p", "cc-social-alert", alerts.join(" · ")));
      if (pack.masterContentPack) {
        const variants = pack.masterContentPack.nativeVariants;
        grid.append(
          socialBlock("Instagram nativo", variants.instagram.canvas + " · " + variants.instagram.format, variants.instagram.caption),
          socialBlock("TikTok nativo", variants.tiktok.canvas + " · " + variants.tiktok.format, variants.tiktok.caption),
          socialBlock("Ambito approvazione", statusLabel(pack.approvalScope.scope), pack.approvalScope.consequences.join(" "))
        );
      }
      card.append(head, grid); list.append(card);
    }
  }

  function renderSocialLive(live) {
    const target = byId("social-live-panel"); target.replaceChildren();
    if (!live) { target.append(element("p", "cc-social-missing", "Piano Live non ancora disponibile.")); return; }
    const head = element("div", "cc-social-live-head"); const title = element("div");
    const baselineState = live.baseline.status === "MEASURED" ? "Baseline misurata" : "Baseline insufficiente · esperimento richiesto";
    title.append(element("p", "cc-panel-label", "INTELLIGENCE SOCIAL ONLYWAY"), element("h3", "", "Attivazione dati reali"), element("small", "", baselineState + " · Acquisizione " + statusLabel(live.acquisitionReadiness)));
    head.append(title, element("strong", "cc-social-score", String(live.decisionsRequired) + " decisioni richieste"));
    const grid = element("div", "cc-social-live-grid");
    const entries = [["Fonti ufficiali", live.officialSourcesRegistered], ["Trend analizzati", live.totalTrends], ["Non classificati", live.unclassifiedTrends], ["Compatibili", live.compatibleTrends], ["In scadenza", live.trendsExpiringWithin24Hours], ["Competitor autorizzati", live.competitorAccountsAuthorized], ["Audio autorizzati", live.audioAuthorized], ["Post con Insights", live.baseline.postCount > 0 ? live.baseline.postCount : "NON DISPONIBILE"]];
    for (const item of entries) { const cell = element("div"); cell.append(element("span", "", item[0]), element("b", "", typeof item[1] === "number" ? number(item[1]) : String(item[1]))); grid.append(cell); }
    const missing = live.missingInputs.length === 0 ? "Tutti i flussi richiesti hanno almeno un record reale." : "Input mancanti: " + live.missingInputs.map(statusLabel).join(" · ");
    const experiment = live.experiment ? " Esperimento: " + live.experiment.contentTheme + " · " + statusLabel(live.experiment.status) + ". Variabile unica: finestra di pubblicazione." : " Il primo esperimento non è ancora registrato.";
    const cycle = live.cycleReadiness ? " Ciclo: " + statusLabel(live.cycleReadiness.status) + (live.cycleReadiness.blockers.length === 0 ? "." : " · " + live.cycleReadiness.blockers.map(statusLabel).join(" · ") + ".") : "";
    const candidate = element("article", "cc-social-candidate");
    if (live.firstPackageReadiness) {
      candidate.append(element("span", "cc-panel-label", "PRIMO PACCHETTO LIVE"), element("strong", "", live.firstPackageReadiness.theme), element("small", "", "Stato " + statusLabel(live.firstPackageReadiness.status) + " · pubblicazione " + statusLabel(live.firstPackageReadiness.publication)));
      const signals = element("div", "cc-social-candidate-signals");
      const inputLabels = { analyticsImported: "Insights", audioLibraryVerified: "Diritti audio", competitorObservationsComplete: "Osservazioni 6/6", competitorSetAuthorized: "Competitor 6/6", compatibleTrendAvailable: "Trend compatibile", trendFeedAcquired: "Feed trend" };
      for (const [key, label] of Object.entries(inputLabels)) { const signal = element("span", "", label); signal.dataset.ready = String(Boolean(live.firstPackageReadiness.inputs[key])); signals.append(signal); }
      candidate.append(signals);
    }
    const competitorPack = element("article", "cc-social-candidate");
    if (live.competitorIntelligencePack) {
      const pack = live.competitorIntelligencePack;
      competitorPack.append(
        element("span", "cc-panel-label", "COMPETITOR INTELLIGENCE PACK"),
        element("strong", "", statusLabel(pack.status) + " · VERSIONE " + String(pack.version || 1)),
        element("small", "", String(pack.coverage.usableObservations) + "/" + String(pack.coverage.expectedAccounts) + " osservazioni utilizzabili · fingerprint " + pack.fingerprint.slice(0, 12)),
        element("p", "cc-social-missing", pack.risks.length === 0 ? pack.nextAction : pack.risks.map(statusLabel).join(" · ") + ". " + pack.nextAction)
      );
      if (Array.isArray(live.competitorIntelligencePackHistory) && live.competitorIntelligencePackHistory.length > 1) competitorPack.append(element("p", "cc-social-missing", "Storico immutabile: " + live.competitorIntelligencePackHistory.map((item) => "v" + String(item.version) + " · " + item.fingerprint.slice(0, 12)).join(" → ")));
    }
    const downloads = element("div", "cc-social-downloads");
    const download = (label, href, filename) => { const link = element("a", "cc-social-download", label); link.href = href; link.setAttribute("download", filename); return link; };
    downloads.append(download("Modello Insights", "/downloads/metodo-veloce-insights-template.csv", "metodo-veloce-insights-template.csv"), download("Modello competitor", "/downloads/metodo-veloce-competitor-observations-template.csv", "metodo-veloce-competitor-observations-template.csv"), download("Modello diritti audio", "/downloads/metodo-veloce-audio-rights-template.csv", "metodo-veloce-audio-rights-template.csv"));
    target.append(head, grid, candidate, competitorPack, element("p", "cc-social-missing", missing + experiment + cycle), downloads);
  }

  function socialBlock(label, value, detail) { const block = element("div", "cc-social-block"); block.append(element("span", "", label), element("b", "", value), element("small", "", detail)); return block; }

  function setStage(name, value) {
    const target = root.querySelector('[data-stage="' + name + '"] strong');
    if (target) target.textContent = number(value);
  }

  function renderPipeline(snapshot) {
    const productions = snapshot.productions;
    const queue = snapshot.runtime.counts.queued + snapshot.runtime.counts.retryScheduled + snapshot.runtime.counts.running;
    setStage("evidence", snapshot.evidence.evidencePacks.length);
    setStage("queue", queue);
    setStage("quality", productions.filter((item) => item.status !== "ARCHIVED").length);
    setStage("fabio", productions.filter((item) => item.status === "PENDING_FABIO_APPROVAL").length);
    setStage("calendar", productions.filter((item) => item.status === "SCHEDULED").length);
  }

  function renderProductions(productions) {
    const target = byId("production-lanes");
    target.replaceChildren();
    if (productions.length === 0) {
      const empty = element("div", "cc-list-empty");
      empty.textContent = "Nessun pacchetto Metodo Veloce durevole è stato creato. Il primo apparirà qui solo dopo la persistenza del suo record di produzione reale.";
      target.append(empty);
      state.selectedProductionId = null;
      renderPreview(null);
      return;
    }
    if (!productions.some((item) => item.productionId === state.selectedProductionId)) state.selectedProductionId = productions[0].productionId;
    const laneNames = ["REVISIONE FABIO", "APPROVATI", "CALENDARIO", "BLOCCATI DAL RISCHIO", "ARCHIVIATI"];
    for (const laneName of laneNames) {
      const records = productions.filter((item) => statusLane(item.status) === laneName);
      const lane = element("section", "cc-lane");
      const heading = element("div", "cc-lane-head");
      heading.append(element("b", "", laneName), element("span", "", number(records.length)));
      lane.append(heading);
      if (records.length === 0) lane.append(element("p", "cc-lane-empty", "Nessun dato persistito in questa fase."));
      for (const record of records) lane.append(productionCard(record));
      target.append(lane);
    }
    renderPreview(productions.find((item) => item.productionId === state.selectedProductionId) || null);
  }

  function productionCard(record) {
    const button = element("button", "cc-production-card");
    button.type = "button";
    button.setAttribute("aria-pressed", String(record.productionId === state.selectedProductionId));
    const meta = element("div", "cc-card-meta");
    meta.append(element("span", "", record.productionId), element("span", "", "v" + String(record.version)));
    const title = element("h3", "", record.package.editorialPlan.selectedIdea);
    const signals = element("div", "cc-card-signals");
    signals.append(signal("Qualità", String(record.package.quality.readinessScore) + "/100"), signal("Rischio", record.package.risk.status), signal("Evidenze", record.evidencePack ? "ALLEGATO" : "NON ALLEGATO"));
    button.append(meta, title, signals);
    button.addEventListener("click", () => { state.selectedProductionId = record.productionId; state.slideIndex = 0; renderProductions(state.snapshot.productions); });
    return button;
  }

  function signal(label, value) { const node = element("span"); const bold = element("b", "", label + " "); node.append(bold, document.createTextNode(value)); return node; }

  function renderPreview(record) {
    renderPackageActions(record);
    renderPackageInspector(record);
    const target = byId("package-preview");
    target.replaceChildren();
    if (!record) {
      const empty = element("div", "cc-preview-empty");
      empty.append(element("span", "", "◇"), element("div", "", "Seleziona un pacchetto persistito per vedere il suo carosello reale o script breve. Qui non sono mostrati contenuti segnaposto."));
      target.append(empty);
      return;
    }
    const assets = record.package.assets;
    const socialPack = record.package.socialPublishingPack;
    const slides = assets && Array.isArray(assets.carousel) ? assets.carousel : socialPack && Array.isArray(socialPack.carousel) ? socialPack.carousel : [];
    if (slides.length > 0) {
      state.slideIndex = ((state.slideIndex % slides.length) + slides.length) % slides.length;
      const slide = slides[state.slideIndex];
      const frame = element("article", "cc-asset-frame");
      frame.append(element("span", "cc-asset-index", "CAROSELLO / " + String(slide.slide).padStart(2, "0")), element("h4", "", slide.title), element("p", "", slide.body));
      const nav = element("div", "cc-preview-nav");
      const previous = element("button", "", "Precedente"); previous.type = "button"; previous.addEventListener("click", () => { state.slideIndex -= 1; renderPreview(record); });
      const position = element("span", "", String(state.slideIndex + 1) + " / " + String(slides.length));
      const next = element("button", "", "Successivo"); next.type = "button"; next.addEventListener("click", () => { state.slideIndex += 1; renderPreview(record); });
      nav.append(previous, position, next);
      target.append(frame, nav, previewDetails(record));
      return;
    }
    if (assets && assets.tiktok) {
      const frame = element("article", "cc-asset-frame");
      frame.append(element("span", "cc-asset-index", "SCRIPT BREVE"), element("h4", "", assets.tiktok.hook), element("p", "", assets.tiktok.caption));
      target.append(frame, previewDetails(record));
      return;
    }
    const empty = element("div", "cc-preview-empty");
    empty.append(element("span", "", "◇"), element("div", "", "Questo pacchetto durevole non ha asset visivi generati. Il suo stato esatto di qualità, rischio ed evidenze è comunque mostrato qui sotto."));
    target.append(empty, previewDetails(record));
  }

  function previewDetails(record) {
    const details = element("div", "cc-preview-details");
    details.append(detail("Controllo qualità", String(record.package.quality.readinessScore) + "/100"), detail("Controllo rischio", record.package.risk.status), detail("Evidence Pack", record.evidencePack ? record.evidencePack.packId : "Nessun pacchetto immutabile allegato"));
    return details;
  }

  function renderPackageInspector(record) {
    const target = byId("package-inspector");
    target.replaceChildren();
    target.append(element("p", "cc-panel-label", "EVIDENZE E GATE"));
    if (!record) {
      target.append(element("div", "cc-list-empty", "Seleziona un pacchetto durevole per ispezionare versione, controlli ed evidenze."));
      return;
    }
    const heading = element("h3", "", "Pacchetto verificabile");
    const version = inspectorRow("Versione", "v" + String(record.version));
    const status = inspectorRow("Stato", statusLabel(record.status));
    const quality = inspectorRow("Quality Gate", String(record.package.quality.readinessScore) + "/100");
    const risk = inspectorRow("Risk Gate", record.package.risk.status);
    target.append(heading, version, status, quality, risk);
    if (record.package.socialPublishingPack) {
      const social = record.package.socialPublishingPack;
      target.append(inspectorRow("Decisione Social", statusLabel(social.decision)), inspectorRow("Opportunity Score", social.opportunity.score === undefined ? "DATO NON DISPONIBILE" : String(social.opportunity.score) + "/100"), inspectorRow("Audio", statusLabel(social.audioPlan.status)), inspectorRow("Orari", statusLabel(social.publicationWindows.status)), inspectorRow("Approvazione", social.approvalScope ? statusLabel(social.approvalScope.scope) : "PACCHETTO INTERNO"), inspectorCode("Fingerprint Social Pack", social.fingerprint));
      if (social.masterContentPack) target.append(inspectorCode("Fingerprint Master Content Pack", social.masterContentPack.fingerprint), inspectorRow("Instagram", social.masterContentPack.nativeVariants.instagram.canvas + " · " + social.masterContentPack.nativeVariants.instagram.format), inspectorRow("TikTok", social.masterContentPack.nativeVariants.tiktok.canvas + " · " + social.masterContentPack.nativeVariants.tiktok.format));
    }
    if (record.evidencePack) {
      target.append(inspectorRow("Evidence Pack", record.evidencePack.packId), inspectorCode("Fingerprint evidenze", record.evidencePack.fingerprint), inspectorRow("Freshness minima", timestamp(record.evidencePack.minFreshnessExpiresAt)));
    } else {
      target.append(inspectorRow("Evidence Pack", "NON ALLEGATO"), element("p", "cc-inspector-warning", "L'approvazione resta bloccata finché non esiste un'attestazione immutabile."));
    }
  }

  function inspectorRow(label, value) { const row = element("div", "cc-inspector-row"); row.append(element("span", "", label), element("b", "", value)); return row; }
  function inspectorCode(label, value) { const row = element("div", "cc-inspector-code"); const code = element("code", "", value); code.title = value; row.append(element("span", "", label), code); return row; }

  function detail(label, value) { const paragraph = element("p"); paragraph.append(element("b", "", label + ": "), document.createTextNode(value)); return paragraph; }

  function renderPackageActions(record) {
    const target = byId("package-actions"); target.replaceChildren();
    if (!record || record.status !== "PENDING_FABIO_APPROVAL") return;
    const label = element("p", "cc-panel-label", "AZIONI CONTROLLATE");
    target.append(label);
    const visualBlocked = record.package.socialPublishingPack && (!state.visualReview || state.visualReview.visualReview.status !== "READY_FOR_HUMAN_DECISION");
    if (record.evidencePack && !visualBlocked) target.append(actionButton("Approva pacchetto", "APPROVE_CONTENT", record));
    if (visualBlocked) {
      const blocked = element("button", "cc-control-button", "Approvazione bloccata: logo originale mancante");
      blocked.type = "button"; blocked.disabled = true; target.append(blocked);
    }
    target.append(actionButton("Rifiuta pacchetto", "REJECT_CONTENT", record));
  }

  function actionButton(label, action, record) {
    const button = element("button", "cc-control-button", label); button.type = "button";
    button.dataset.action = action;
    button.addEventListener("click", () => { void proposeContentAction(action, record, button); });
    return button;
  }

  async function csrfToken() {
    if (state.csrfToken) return state.csrfToken;
    const response = await fetch("/api/session", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error("Sessione locale non disponibile.");
    const session = await response.json();
    if (!session || typeof session.csrfToken !== "string") throw new Error("Token di protezione della sessione non disponibile.");
    state.csrfToken = session.csrfToken; return state.csrfToken;
  }

  async function actionPost(path, payload) {
    const response = await fetch(path, { body: JSON.stringify(payload), cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Onlyway-Csrf": await csrfToken() }, method: "POST" });
    if (!response.ok) throw new Error(await response.text() || "Azione non eseguita.");
    return response.json();
  }

  async function proposeContentAction(action, record, button) {
    try {
      button.disabled = true;
      const proposal = await actionPost("/api/actions/propose", { action, productionId: record.productionId });
      openActionConfirmation(action, proposal);
    } catch (error) {
      commandResult.textContent = error instanceof Error ? error.message : "Azione non eseguita.";
    } finally { button.disabled = false; }
  }

  async function proposeBusinessAction(action, mission, button) {
    try {
      button.disabled = true;
      const proposal = await actionPost("/api/actions/propose", { action, missionId: mission.mission.missionId });
      openActionConfirmation(action, proposal);
    } catch (error) {
      commandResult.textContent = error instanceof Error ? error.message : "Azione Business non eseguita.";
    } finally { button.disabled = false; }
  }

  function openActionConfirmation(action, proposal) {
    const isBusiness = action === "APPROVE_BUSINESS" || action === "REJECT_BUSINESS" || action === "REQUEST_BUSINESS_REVISION";
    if (isBusiness) {
      const title = action === "APPROVE_BUSINESS" ? "Approvare questo dossier Business" : action === "REJECT_BUSINESS" ? "Rifiutare questo dossier Business" : "Richiedere la revisione del dossier";
      const consequence = action === "APPROVE_BUSINESS" ? "Decisione Business approvata; nessun esperimento o azione esterna viene eseguito" : action === "REJECT_BUSINESS" ? "Dossier rifiutato e mantenuto fuori dall'esecuzione" : "Dossier restituito alla revisione senza azioni esterne";
      state.pendingConfirmation = { action, proposal };
      actionConfirmationTitle.textContent = title;
      actionConfirmationDetail.textContent = "Verifica missione, opportunità selezionata, Evidence Pack, gate e fingerprint prima della decisione.";
      actionConfirmationSubmit.textContent = action === "APPROVE_BUSINESS" ? "Approva dossier" : action === "REJECT_BUSINESS" ? "Conferma rifiuto" : "Richiedi revisione";
      actionConfirmationSubmit.dataset.action = action;
      actionConfirmationDetails.replaceChildren();
      const entries = [["Missione", proposal.summary.missionId], ["Versione", "v" + String(proposal.summary.version)], ["Fingerprint dossier", proposal.summary.dossierFingerprint], ["Fingerprint pacchetto", proposal.summary.packageFingerprint], ["Opportunità selezionata", proposal.summary.selectedOpportunityId], ["Evidence Pack", proposal.summary.evidencePackIds.join(" · ")], ["Gate", proposal.summary.gates.map((gate) => gate.name + " " + gate.status + " " + String(gate.score) + "/100").join(" · ")], ["Conseguenza", consequence]];
      for (const [label, value] of entries) { const row = document.createElement("div"); row.append(element("dt", "", label), element("dd", "", value)); actionConfirmationDetails.append(row); }
      actionConfirmation.hidden = false;
      startConfirmationTimer(proposal.expiresAt);
      actionConfirmationSubmit.focus();
      return;
    }
    const isApproval = action === "APPROVE_CONTENT";
    state.pendingConfirmation = { action, proposal };
    actionConfirmationTitle.textContent = isApproval ? "Autorizzare questo pacchetto" : "Rifiutare questo pacchetto";
    actionConfirmationDetail.textContent = isApproval
      ? "Stai autorizzando il passaggio controllato alla pianificazione interna."
      : "Stai registrando il rifiuto controllato del pacchetto e la sua archiviazione.";
    actionConfirmationSubmit.textContent = isApproval ? "Autorizza pacchetto" : "Conferma rifiuto";
    actionConfirmationSubmit.dataset.action = action;
    actionConfirmationDetails.replaceChildren();
    const consequence = isApproval
      ? "Passaggio controllato alla pianificazione interna"
      : "Rifiuto durevole e archiviazione del pacchetto";
    const entries = [["Produzione", proposal.summary.productionId], ["Versione", "v" + String(proposal.summary.version)], ["Fingerprint pacchetto", proposal.summary.packageFingerprint], ["Evidence Pack", proposal.summary.evidencePackId || "NON ALLEGATO"], ["Qualità", String(proposal.summary.qualityScore) + "/100"], ["Rischio", proposal.summary.riskStatus], ["Conseguenza", consequence]];
    if (proposal.summary.evidencePackFingerprint) entries.splice(4, 0, ["Fingerprint evidenze", proposal.summary.evidencePackFingerprint]);
    for (const [label, value] of entries) { const row = document.createElement("div"); row.append(element("dt", "", label), element("dd", "", value)); actionConfirmationDetails.append(row); }
    actionConfirmation.hidden = false;
    startConfirmationTimer(proposal.expiresAt);
    actionConfirmationSubmit.focus();
  }

  function closeActionConfirmation(message) {
    if (state.confirmationInterval !== null) window.clearInterval(state.confirmationInterval);
    state.confirmationInterval = null;
    state.pendingConfirmation = null;
    actionConfirmation.hidden = true;
    if (message) commandResult.textContent = message;
  }

  function startConfirmationTimer(expiresAt) {
    if (state.confirmationInterval !== null) window.clearInterval(state.confirmationInterval);
    const update = () => {
      const remaining = Math.max(0, Date.parse(expiresAt) - Date.now());
      const seconds = Math.ceil(remaining / 1000);
      actionConfirmationTimer.textContent = String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
      if (remaining <= 0) closeActionConfirmation("Conferma scaduta: nessuna modifica eseguita.");
    };
    update();
    state.confirmationInterval = window.setInterval(update, 250);
  }

  async function confirmPendingAction() {
    const pending = state.pendingConfirmation;
    if (!pending) return;
    try {
      actionConfirmationSubmit.disabled = true;
      const proposal = pending.proposal;
      const receipt = await actionPost("/api/actions/confirm", { actionId: proposal.actionId, confirmationToken: proposal.confirmationToken, packageFingerprint: proposal.summary.packageFingerprint });
      closeActionConfirmation("Azione registrata. Ricevuta durevole: " + receipt.command.commandId + ".");
      await refresh();
    } catch (error) {
      closeActionConfirmation(error instanceof Error ? error.message : "Azione non eseguita.");
    } finally { actionConfirmationSubmit.disabled = false; }
  }

  function renderEvidence(evidence) {
    renderList("research-mission-list", evidence.researchMissions || [], (mission) => {
      const verified = mission.claimResults.filter((claim) => claim.status === "VERIFIED").length;
      const unresolved = mission.claimResults.length - verified;
      return { title: mission.input.missionId, meta: statusLabel(mission.status) + " · " + String(verified) + " claim verificati", detail: unresolved > 0 ? String(unresolved) + " claim non risolti · " + mission.blockers.join(" · ") : String(mission.snapshotIds.length) + " snapshot immutabili · " + String(mission.packIds.length) + " Evidence Pack" };
    });
    renderList("source-list", evidence.sources, (source) => ({ title: source.name, meta: source.reliability + " · " + source.category, detail: source.canonicalReference }));
    renderList("pack-list", evidence.evidencePacks, (pack) => ({ title: pack.packId, meta: "Fingerprint " + pack.fingerprint.slice(0, 16) + "…", detail: String(pack.evidence.length) + " elemento/i di evidenza · valido fino al " + timestamp(pack.minFreshnessExpiresAt) }));
    renderList("evidence-list", evidence.evidence, (record) => ({ title: record.evidenceId, meta: record.status + " · " + record.riskDomain, detail: record.claimMappings.length > 0 ? record.claimMappings.map((claim) => claim.statement).join(" · ") : "Nessuna mappatura claim registrata." }));
  }

  function renderList(targetId, records, format) {
    const target = byId(targetId); target.replaceChildren();
    if (records.length === 0) { target.append(element("div", "cc-list-empty", "Nessun record durevole è stato ancora importato in questo piano.")); return; }
    for (const record of records) {
      const content = format(record);
      const item = element("article", "cc-list-item");
      item.append(element("b", "", content.title), element("span", "", content.meta), element("p", "", content.detail));
      target.append(item);
    }
  }

  function renderRuntime(runtime) {
    text("runtime-status", statusLabel(runtime.status));
    text("worker-status", runtime.continuousWorker === "NOT_REGISTERED" ? "Nessun worker continuativo registrato" : "Worker continuativo registrato");
    text("worker-detail", runtime.continuousWorker === "NOT_REGISTERED" ? "Esistono coda, lease, retry e recupero. Un processo H24 supervisionato non è stato registrato, quindi non è dichiarato alcun uptime." : "Lo stato del worker runtime è visibile tramite il control plane locale.");
    text("telegram-status", runtime.telegram === "NOT_OBSERVED" ? "Nessuna telemetria di ciclo di vita esposta" : statusLabel(runtime.telegram));
    text("kill-switch-status", statusLabel(runtime.killSwitch));
    const target = byId("runtime-bars"); target.replaceChildren();
    const items = [["In coda", runtime.counts.queued, "normal"], ["In esecuzione", runtime.counts.running, "normal"], ["Retry pianificati", runtime.counts.retryScheduled, "normal"], ["Completati", runtime.counts.completed, "normal"], ["Dead-letter", runtime.counts.deadLetter, "danger"]];
    const max = Math.max(1, ...items.map((item) => item[1]));
    for (const [label, value, tone] of items) {
      const row = element("div", "cc-runtime-bar"); row.dataset.tone = tone;
      const track = element("div", "cc-runtime-track"); const fill = element("div", "cc-runtime-fill"); fill.style.width = String((value / max) * 100) + "%"; track.append(fill);
      row.append(element("span", "", label), track, element("b", "", number(value))); target.append(row);
    }
  }

  function renderAgents(agents) {
    const target = byId("agent-grid"); target.replaceChildren();
    for (const agent of agents) {
      const card = element("article", "cc-agent");
      card.dataset.agent = agent.agentId;
      card.dataset.state = agent.state;
      const identity = element("div");
      identity.append(
        element("p", "cc-kicker", agent.supportedTasks.join(" · ")),
        element("h3", "", agent.displayName),
        element("p", "", agent.role),
        element("small", "cc-agent-executor", agent.executor),
      );
      card.append(
        identity,
        agentStat("Stato", statusLabel(agent.state)),
        agentStat("Task completati", number(agent.completedTasks)),
        agentStat("Accettati al primo tentativo", number(agent.acceptedFirstPassTasks)),
        agentStat("Task bloccati", number(agent.blockedTasks)),
        agentStat("Qualità media", agent.averageQualityScore === "NOT_AVAILABLE" ? "Dato non disponibile" : number(agent.averageQualityScore) + "/100"),
        agentStat("Revisioni", number(agent.revisionsRequired)),
        agentStat("Tempo misurato", duration(agent.measuredDurationMs)),
        agentStat("Costo misurato", euro(agent.measuredCostCents)),
      );
      target.append(card);
    }
  }

  function renderAgentWorkdays(workdays) {
    const list = byId("agent-workday-list");
    const detail = byId("agent-workday-detail");
    list.replaceChildren(); detail.replaceChildren();
    if (workdays.length === 0) {
      state.selectedWorkdayId = null;
      detail.append(element("div", "cc-list-empty", "Nessuna giornata operativa è stata eseguita. Il catalogo indica capacità disponibili, non risultati inventati."));
      return;
    }
    if (!workdays.some((workday) => workday.workdayId === state.selectedWorkdayId)) state.selectedWorkdayId = workdays[0].workdayId;
    for (const workday of workdays) {
      const button = element("button", "cc-workday-card");
      button.type = "button";
      button.setAttribute("aria-pressed", String(workday.workdayId === state.selectedWorkdayId));
      const completed = workday.tasks.filter((task) => task.status === "COMPLETED").length;
      button.append(
        element("b", "", workday.input.objective),
        element("span", "", statusLabel(workday.status) + " · " + String(completed) + "/" + String(workday.tasks.length) + " task"),
      );
      button.addEventListener("click", () => { state.selectedWorkdayId = workday.workdayId; renderAgentWorkdays(workdays); });
      list.append(button);
    }
    const selected = workdays.find((workday) => workday.workdayId === state.selectedWorkdayId);
    if (!selected) return;
    const completedTasks = selected.tasks.filter((task) => task.status === "COMPLETED").length;
    const blockedTasks = selected.tasks.filter((task) => task.status === "BLOCKED").length;
    const waitingTasks = selected.tasks.filter((task) => task.status === "QUEUED" || task.status === "RUNNING").length;
    const researchTask = selected.tasks.find((task) => task.agentId === "research-agent");
    const evidencePacks = researchTask && researchTask.output && Array.isArray(researchTask.output.evidencePacks) ? researchTask.output.evidencePacks.length : null;
    const claimResults = researchTask && researchTask.output && Array.isArray(researchTask.output.claimResults) ? researchTask.output.claimResults : [];
    const verifiedClaims = claimResults.filter((claim) => claim && claim.status === "VERIFIED").length;
    const unresolvedClaims = claimResults.filter((claim) => claim && claim.status !== "VERIFIED").length;
    const summary = element("div", "cc-workday-summary");
    summary.append(
      agentStat("Stato", statusLabel(selected.status)),
      agentStat("Reparti assegnati", number(selected.tasks.length)),
      agentStat("Completati", number(completedTasks)),
      agentStat("Bloccati", number(blockedTasks)),
      agentStat("In attesa", number(waitingTasks)),
      agentStat("Decisioni Fabio", selected.status === "AWAITING_FABIO" || selected.status === "BLOCKED" ? "1" : "0"),
      agentStat("Evidence Pack", evidencePacks === null ? "Dato non disponibile" : number(evidencePacks)),
      agentStat("Claim verificati", claimResults.length === 0 ? "Dato non disponibile" : number(verifiedClaims)),
      agentStat("Claim insufficienti", claimResults.length === 0 ? "Dato non disponibile" : number(unresolvedClaims)),
      agentStat("Costo operativo", euro(selected.tasks.reduce((total, task) => total + task.costCents, 0))),
      agentStat("Versione", String(selected.version)),
      agentStat("Azioni esterne", selected.externalActionsExecuted ? "ESEGUITE" : "NESSUNA"),
      agentStat("Aggiornata", timestamp(selected.updatedAt)),
    );
    const taskList = element("div", "cc-workday-tasks");
    for (const task of selected.tasks) {
      const taskRow = element("article", "cc-workday-task");
      taskRow.dataset.status = task.status;
      const passedGates = task.gates.filter((gate) => gate.status === "PASSED").length;
      taskRow.append(
        element("span", "", task.agentId + " · " + task.executorId),
        element("b", "", task.taskType),
        element("p", "", statusLabel(task.status) + " · gate " + String(passedGates) + "/" + String(task.gates.length) + " · tentativi " + String(task.attempts) + " · " + duration(task.durationMs) + " · " + euro(task.costCents)),
        element("p", "", task.dependencies.length === 0 ? "Nessuna dipendenza" : "Dipendenze: " + task.dependencies.join(", ")),
        element("small", "", task.blocker || (task.outputFingerprint ? "Fingerprint " + task.outputFingerprint.slice(0, 16) + "…" : "Output non ancora disponibile")),
      );
      if (task.output) {
        const output = element("details", "cc-task-output");
        output.append(element("summary", "", "Apri output e Gate"), element("pre", "", JSON.stringify({ gates: task.gates, output: task.output }, null, 2)));
        taskRow.append(output);
      }
      taskList.append(taskRow);
    }
    detail.append(summary, taskList);
  }

  function agentStat(label, value) { const item = element("div", "cc-agent-stat"); item.append(element("span", "", label), element("b", "", value)); return item; }
  function duration(milliseconds) { if (!Number.isFinite(milliseconds)) return "—"; if (milliseconds < 1000) return number(milliseconds) + " ms"; return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(milliseconds / 1000) + " s"; }

  function renderApprovals(productions, business, live, visualReview) {
    const pending = productions.filter((item) => item.status === "PENDING_FABIO_APPROVAL");
    const pendingBusiness = business.filter((item) => item.status === "PENDING_FABIO_APPROVAL");
    const reviewList = byId("approval-review-list");
    reviewList.replaceChildren();
    if (pending.length === 0 && pendingBusiness.length === 0) {
      text("approval-title", "Nessun pacchetto richiede la decisione di Fabio");
      text("approval-detail", "Un futuro pacchetto contenuti o dossier Business apparirà qui con versione esatta, fingerprint, evidenze e gate.");
      return;
    }
    const evidenceAttested = pending.filter((item) => item.evidencePack).length;
    text("approval-title", String(pendingBusiness.length) + " dossier Business e " + String(pending.length) + " pacchetto/i contenuto attendono Fabio");
    text("approval-detail", evidenceAttested === pending.length ? "La review appare soltanto dopo Quality Gate, Risk Gate ed Evidence Pack. L'approvazione resta interna e non autorizza programmazione o pubblicazione." : String(evidenceAttested) + " pacchetto/i contenuto sono attestati dalle evidenze; quelli privi di Evidence Pack restano non approvabili.");
    for (const record of pending) {
      const social = record.package.socialPublishingPack;
      if (!social || !record.evidencePack || record.package.risk.status !== "CLEAR") continue;
      const master = social.masterContentPack;
      const card = element("article", "cc-approval-review");
      const visualBlocked = !visualReview || visualReview.visualReview.status !== "READY_FOR_HUMAN_DECISION";
      card.dataset.visualStatus = visualBlocked ? "blocked" : "ready";
      const head = element("div", "cc-approval-review-head");
      const identity = element("div");
      identity.append(element("p", "cc-panel-label", visualBlocked ? "REVIEW VISIVA BLOCCATA" : "REVIEW PRONTA DOPO I GATE"), element("h3", "", master ? master.topic : record.package.editorialPlan.selectedIdea), element("small", "", record.productionId + " · v" + String(record.version)));
      const gates = element("div", "cc-approval-gates");
      gates.append(element("span", "", "QUALITY " + String(record.package.quality.readinessScore) + "/100"), element("span", "", "RISK CLEAR"), element("span", "", "EVIDENCE PACK ALLEGATO"));
      const visualGate = element("span", "", visualBlocked ? "VISUAL GATE BLOCCATO" : "VISUAL GATE PRONTO"); visualGate.dataset.gate = visualBlocked ? "blocked" : "ready"; gates.append(visualGate);
      head.append(identity, gates);
      const visual = visualReviewGallery(visualReview);
      const grid = element("div", "cc-approval-review-grid");
      const evidenceStatements = record.package.evidence.items.slice(0, 2).map((item) => item.statement);
      const insights = live && live.baseline.postCount > 0 ? String(live.baseline.postCount) + " snapshot importati" : "INSUFFICIENT_DATA · Insights dettagliati mancanti";
      const instagramCaption = visualReview ? visualReview.captions.instagram : (master ? master.nativeVariants.instagram.caption : "Caption non disponibile");
      const tiktokCaption = visualReview ? visualReview.captions.tiktok : "Caption TikTok non disponibile";
      const hashtagDetail = visualReview ? "Instagram: " + visualReview.hashtags.instagram.join(" ") + " · TikTok: " + visualReview.hashtags.tiktok.join(" ") : "Main: " + (social.hashtagSets.main.join(" ") || "—") + " · Alternative: " + (social.hashtagSets.alternate.join(" ") || "—") + " · Test: " + (social.hashtagSets.experimental.join(" ") || "—");
      const audioDetail = visualReview ? "Nessun audio selezionato. Audio originale Metodo Veloce solo dopo attestazione; altrimenti nessun audio." : (social.audioPlan.status === "AUDIO_NON_AUTORIZZATO" ? "Usare audio originale Metodo Veloce oppure nessun audio; nessuna traccia è programmabile." : (social.audioPlan.selected ? social.audioPlan.selected.title : "Nessun audio selezionato"));
      const windowDetail = visualReview ? visualReview.publicationWindows.windows.map((window) => window.platform + " " + window.variant + " · " + window.label + " · " + window.localTime).join(" | ") : social.publicationWindows.windows.map((window) => window.label + ": " + timestamp(window.startAt)).join(" · ");
      grid.append(
        socialBlock("Perché questo trend", statusLabel(social.trendAnalysis.phase), social.audienceDemand.intents.join(" · ") || "Segnale compatibile attestato, velocità non misurata."),
        socialBlock("Due evidenze", String(evidenceStatements.length) + "/2", evidenceStatements.join(" · ")),
        socialBlock("Competitor gap", statusLabel(social.competitorGap.status), social.competitorGap.gaps.join(" · ")),
        socialBlock("Insights disponibili e mancanti", statusLabel(live ? live.baseline.status : "INSUFFICIENT_DATA"), insights),
        socialBlock("Opportunity Score", social.opportunity.score === undefined ? "NON CALCOLABILE" : String(social.opportunity.score) + "/100", "Completezza " + String(social.opportunity.completeness) + "%"),
        socialBlock("Carosello da sei slide", String(social.carousel.length) + "/6", social.carousel.map((slide) => String(slide.slide) + ". " + slide.title).join(" · ")),
        socialBlock("Caption Instagram", "DISTINTA", instagramCaption),
        socialBlock("Caption TikTok", "DISTINTA", tiktokCaption),
        socialBlock("Hashtag pack", statusLabel(social.hashtagSets.status), hashtagDetail),
        socialBlock("Audio", visualReview ? statusLabel(visualReview.audio.status) : statusLabel(social.audioPlan.status), audioDetail),
        socialBlock("Quattro finestre sperimentali", visualReview ? "NON SONO ORARI OTTIMALI" : statusLabel(social.publicationWindows.status), windowDetail),
        socialBlock("Versione esatta", "SOCIAL + MASTER", "Social " + social.fingerprint.slice(0, 16) + "… · Master " + (master ? master.fingerprint.slice(0, 16) + "…" : "NON DISPONIBILE")),
        socialBlock("Conseguenze", statusLabel(social.approvalScope.scope), social.approvalScope.consequences.join(" "))
      );
      const fingerprint = element("code", "cc-approval-review-code", "Visual Asset Set V3 " + (visualReview ? visualReview.fingerprint : "NON DISPONIBILE") + "\\nSocial Pack " + social.fingerprint + "\\nMaster Content Pack " + (master ? master.fingerprint : "NON DISPONIBILE") + "\\nEvidence Pack " + record.evidencePack.fingerprint);
      const foot = element("div", "cc-approval-review-foot");
      foot.append(element("p", "", visualBlocked ? "Il Visual Gate non è superato: l'approvazione interna non viene proposta. Programmazione e pubblicazione restano separate e bloccate." : "L'approvazione autorizza soltanto questo pacchetto interno. Programmazione e pubblicazione restano separate e bloccate."), element("a", "cc-text-action", "Apri asset e azioni controllate →"));
      foot.lastChild.href = "#production";
      card.append(head, visual, grid, fingerprint, foot);
      reviewList.append(card);
    }
  }

  function visualReviewGallery(review) {
    const shell = element("section", "cc-visual-review");
    if (!review || !review.assets) {
      shell.append(element("p", "cc-visual-review-warning", "Asset reali non disponibili: il pacchetto non può essere approvato."));
      return shell;
    }
    state.visualSlideIndex = ((state.visualSlideIndex % 6) + 6) % 6;
    const head = element("div", "cc-visual-review-head");
    head.append(element("p", "", "Confronto reale della stessa slide nei due formati. Controllare logo, ritaglio, leggibilità, realismo e testo prima della decisione."));
    const nav = element("div", "cc-visual-review-nav");
    const previous = element("button", "", "← Precedente"); previous.type = "button";
    const position = element("strong", "", String(state.visualSlideIndex + 1) + " / 6");
    const next = element("button", "", "Successiva →"); next.type = "button";
    previous.addEventListener("click", () => { state.visualSlideIndex -= 1; renderApprovals(state.snapshot.productions, state.snapshot.business || [], state.snapshot.socialLive, state.visualReview); });
    next.addEventListener("click", () => { state.visualSlideIndex += 1; renderApprovals(state.snapshot.productions, state.snapshot.business || [], state.snapshot.socialLive, state.visualReview); });
    nav.append(previous, position, next); head.append(nav); shell.append(head);
    const canvases = element("div", "cc-visual-review-canvases");
    for (const platform of ["instagram", "tiktok"]) {
      const asset = review.assets[platform][state.visualSlideIndex];
      const frame = element("figure", "cc-visual-canvas");
      const label = element("span", "", platform.toUpperCase() + " · " + String(asset.width) + "×" + String(asset.height));
      const image = document.createElement("img"); image.alt = "Slide " + String(asset.slide) + " Metodo Veloce per " + platform; image.src = "/" + asset.path; image.loading = "eager";
      frame.append(label, image); canvases.append(frame);
    }
    shell.append(canvases);
    if (review.visualReview.status !== "READY_FOR_HUMAN_DECISION") shell.append(element("p", "cc-visual-review-warning", "BLOCCO: il logo visibile è un estratto pixel-per-pixel del post reale, ma manca il file originale autonomo. Nessuna approvazione viene proposta."));
    return shell;
  }

  function navigate(query) {
    const normalized = query.toLocaleLowerCase("it-IT");
    const mapping = [["trend", "social"], ["hashtag", "social"], ["audio", "social"], ["social", "social"], ["business", "business"], ["opportun", "business"], ["econom", "business"], ["offert", "business"], ["validaz", "business"], ["approv", "approvals"], ["evid", "evidence"], ["fonte", "evidence"], ["claim", "evidence"], ["runtime", "runtime"], ["queue", "runtime"], ["agent", "agents"], ["produz", "production"], ["conten", "production"], ["pacchet", "production"]];
    const found = mapping.find(([keyword]) => normalized.includes(keyword));
    if (!found) { commandResult.textContent = "Usa un termine come Social, trend, Business, approvazioni, evidenze, runtime, agenti o produzioni."; return; }
    const target = byId(found[1]); if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    commandResult.textContent = "Aperta la sezione richiesta.";
  }

  function syncVisualContext() {
    const candidate = window.location.hash.slice(1);
    root.dataset.section = ["business", "social", "production", "evidence", "runtime", "approvals", "governance", "agents"].includes(candidate) ? candidate : "overview";
    root.querySelectorAll(".cc-nav a").forEach((link) => link.classList.toggle("is-active", link.getAttribute("href") === "#" + root.dataset.section));
    if (mobileSidebar.matches) setMobileSidebar(false);
  }

  function storedSidebarState() {
    try { return window.localStorage.getItem("onlyway.command-center.sidebar") === "compact" ? "compact" : "expanded"; } catch { return "expanded"; }
  }

  function setDesktopSidebar(next, persist) {
    state.sidebarState = next;
    root.dataset.sidebarState = next;
    sidebarToggle.setAttribute("aria-expanded", String(next === "expanded"));
    sidebarToggle.setAttribute("aria-label", next === "expanded" ? "Compatta il pannello laterale" : "Espandi il pannello laterale");
    sidebarToggle.querySelector("span").textContent = next === "expanded" ? "‹" : "›";
    if (persist) { try { window.localStorage.setItem("onlyway.command-center.sidebar", next); } catch {} }
  }

  function setMobileSidebar(open) {
    root.dataset.mobileSidebar = open ? "open" : "closed";
    mobileMenuToggle.setAttribute("aria-expanded", String(open));
    mobileMenuToggle.setAttribute("aria-label", open ? "Chiudi il menu del Centro di Comando" : "Apri il menu del Centro di Comando");
    sidebarBackdrop.hidden = !open;
  }

  function toggleSidebar() {
    if (mobileSidebar.matches) { setMobileSidebar(root.dataset.mobileSidebar !== "open"); return; }
    setDesktopSidebar(state.sidebarState === "expanded" ? "compact" : "expanded", true);
  }

  function initializeSidebar() {
    setDesktopSidebar(storedSidebarState(), false);
    setMobileSidebar(false);
    sidebarToggle.addEventListener("click", toggleSidebar);
    mobileMenuToggle.addEventListener("click", toggleSidebar);
    sidebarBackdrop.addEventListener("click", () => setMobileSidebar(false));
    sidebar.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => { if (mobileSidebar.matches) setMobileSidebar(false); }));
  }

  function prepareAmbientMotion() {
    if (reduceMotion) return;
    const reset = () => { root.style.setProperty("--cc-parallax-x", "0px"); root.style.setProperty("--cc-parallax-y", "0px"); };
    root.addEventListener("pointermove", (event) => {
      const x = Math.round(((event.clientX / Math.max(window.innerWidth, 1)) - .5) * 12);
      const y = Math.round(((event.clientY / Math.max(window.innerHeight, 1)) - .5) * 8);
      root.style.setProperty("--cc-parallax-x", String(x) + "px");
      root.style.setProperty("--cc-parallax-y", String(y) + "px");
    });
    root.addEventListener("pointerleave", reset);
    window.addEventListener("scroll", () => { root.style.setProperty("--cc-scroll-shift", String(Math.min(8, Math.round(window.scrollY * .018))) + "px"); }, { passive: true });
  }

  commandForm.addEventListener("submit", (event) => { event.preventDefault(); navigate(commandInput.value.trim()); });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); commandInput.focus(); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") { event.preventDefault(); toggleSidebar(); }
    if (event.key === "Escape" && mobileSidebar.matches && root.dataset.mobileSidebar === "open") setMobileSidebar(false);
  });
  document.querySelectorAll("[data-confirmation-close]").forEach((button) => button.addEventListener("click", () => closeActionConfirmation("Azione annullata: nessuna modifica eseguita.")));
  actionConfirmationSubmit.addEventListener("click", () => { void confirmPendingAction(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !actionConfirmation.hidden) closeActionConfirmation("Azione annullata: nessuna modifica eseguita."); });
  window.addEventListener("hashchange", syncVisualContext);
  initializeSidebar();
  syncVisualContext();
  prepareAmbientMotion();
  refresh();
  window.setInterval(refresh, 30000);
})();
`;
