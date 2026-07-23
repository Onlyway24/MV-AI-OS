export const COMMAND_CENTER_HTML = `
<div class="cc-app" id="command-center" data-sidebar-state="expanded" data-navigation="dock" data-active-view="today" data-active-studio="production">
  <a class="cc-skip-link" href="#workspace-title">Vai al contenuto principale</a>
  <div class="cc-world" aria-hidden="true">
    <div class="cc-world-image"></div>
    <div class="cc-world-vignette"></div>
    <div class="cc-world-light"></div>
  </div>
  <button class="cc-mobile-menu" id="mobile-menu-toggle" type="button" aria-controls="command-sidebar" aria-expanded="false" aria-label="Apri il menu del Centro di Comando" hidden><span aria-hidden="true"></span><span aria-hidden="true"></span></button>
  <div class="cc-sidebar-backdrop" id="sidebar-backdrop" hidden></div>
  <header class="cc-sidebar" id="command-sidebar" aria-label="Navigazione principale del Centro di Comando">
    <div class="cc-sidebar-head">
      <a class="cc-brand" href="#today" aria-label="Panoramica del Centro di Comando Onlyway">
        <span class="cc-brand-mark" aria-hidden="true">OW</span>
        <span class="cc-brand-copy"><b>ONLYWAY</b><small>CONTROL</small></span>
      </a>
      <button class="cc-sidebar-toggle" id="sidebar-toggle" type="button" aria-controls="command-sidebar" aria-expanded="true" aria-label="Compatta il pannello laterale" hidden><span aria-hidden="true">‹</span></button>
    </div>
    <nav class="cc-nav" aria-label="Aree principali">
      <a class="is-active" href="#today" data-label="Oggi" data-view-target="today"><span class="cc-nav-icon" aria-hidden="true">●</span><span class="cc-nav-label">Oggi</span></a>
      <a href="#studio" data-label="Studio" data-view-target="studio"><span class="cc-nav-icon" aria-hidden="true">◇</span><span class="cc-nav-label">Studio</span></a>
      <a href="#agents" data-label="Squadra" data-view-target="team"><span class="cc-nav-icon" aria-hidden="true">◎</span><span class="cc-nav-label">Squadra</span></a>
      <a href="#system" data-label="Sistema" data-view-target="system"><span class="cc-nav-icon" aria-hidden="true">⌁</span><span class="cc-nav-label">Sistema</span></a>
    </nav>
    <div class="cc-sidebar-foot" id="live-event-state" data-live-state="connecting">
      <span class="cc-live-dot" aria-hidden="true"></span>
      <span class="cc-sidebar-foot-label" id="live-event-status" aria-live="polite">Live · connessione</span>
    </div>
    <div class="cc-operator" aria-label="Operatore Fabio">
      <span class="cc-avatar" aria-hidden="true">F</span>
      <span><b>Fabio</b><small>Operatore</small></span>
    </div>
  </header>

  <main class="cc-main">
    <header class="cc-topbar" id="workspace-title" tabindex="-1">
      <div class="cc-command-title">
        <p class="cc-eyebrow">CENTRO DI COMANDO</p>
        <h1>Buongiorno, Fabio.</h1>
        <p class="cc-topbar-subtitle">Qui trovi il prossimo collo di bottiglia tra lavoro e ricavo.</p>
      </div>
      <div class="cc-status-rail" aria-label="Quadro operativo corrente">
        <span><i class="cc-status-dot" data-status-dot aria-hidden="true"></i>Sistema <b id="system-status">Caricamento</b></span>
        <span>Autonomia <b id="autonomy-status">A3 — Controllata</b></span>
        <span>Azioni esterne <b class="cc-lock">BLOCCATE</b></span>
        <span>Runtime <b id="runtime-location">LOCALE</b></span>
        <span>Decisioni richieste <b id="decisions-required">—</b></span>
      </div>
    </header>

    <form class="cc-command cc-oracle-composer" id="command-form" aria-describedby="command-help command-result">
      <span class="cc-oracle-mark" aria-hidden="true">OR</span>
      <label class="sr-only" for="command-input">Dai una missione creativa a Onlyway e ORACLE</label>
      <textarea id="command-input" autocomplete="off" aria-describedby="command-help command-result" maxlength="240" rows="2" required placeholder="Descrivi il contenuto da creare: obiettivo, messaggio e pubblico…"></textarea>
      <kbd>⌘ K</kbd>
      <div class="cc-oracle-controls">
        <label class="cc-oracle-select">Business Mission
          <select id="command-business-mission" required aria-label="Business Mission approvata"><option value="">Caricamento missioni…</option></select>
        </label>
        <label class="cc-oracle-select">Obiettivo
          <select id="command-objective" aria-label="Obiettivo del contenuto">
            <option value="lead_generation">Lead generation</option>
            <option value="educate">Educare</option>
            <option value="engage">Coinvolgere</option>
            <option value="soft_sell">Soft sell</option>
          </select>
        </label>
        <fieldset class="cc-oracle-deliverables">
          <legend>Output</legend>
          <label title="Incluso nel bundle locale"><input type="checkbox" name="oracle-deliverable" value="CAROUSEL" checked disabled /> Carosello</label>
          <label title="Incluso nel bundle locale"><input type="checkbox" name="oracle-deliverable" value="INSTAGRAM_COPY" checked disabled /> Instagram</label>
          <label title="Incluso nel bundle locale"><input type="checkbox" name="oracle-deliverable" value="TIKTOK_VIDEO_BLUEPRINT" checked disabled /> TikTok blueprint</label>
          <label title="Richiede autorizzazione media separata"><input type="checkbox" name="oracle-deliverable" value="IMAGE_MASTER" /> Immagine master · gate</label>
          <label title="Provider video non configurato"><input type="checkbox" name="oracle-deliverable" value="VIDEO_RENDER" /> Video render · off</label>
        </fieldset>
        <div class="cc-oracle-actions">
          <button class="cc-oracle-context" id="command-navigate" type="button">Apri contesto</button>
          <button class="cc-oracle-submit" id="command-submit" type="submit">Prepara con ORACLE <span aria-hidden="true">→</span></button>
        </div>
      </div>
    </form>
    <p class="cc-command-result" id="command-result" aria-live="polite"></p>
    <p class="cc-command-help" id="command-help">NEXUS coordina ORACLE, VECTOR, PRISM e FORGE. La proposta usa solo evidenze approvate; provider media e pubblicazione restano sotto gate separati.</p>

    <section class="cc-revenue-hero" id="today" data-primary-view="today" aria-labelledby="revenue-hero-heading">
      <div class="cc-revenue-copy">
        <p class="cc-kicker">ONLYWAY REVENUE OPERATING SYSTEM</p>
        <h2 id="revenue-hero-heading">Dal lavoro al ricavo.<br /><em>Senza perdere il controllo.</em></h2>
        <p>Offerta, contenuti, vendita e consegna diventano un solo sistema misurabile. I dati mancanti restano visibili; Fabio mantiene prezzo, promessa e decisione finale.</p>
        <div class="cc-revenue-actions">
          <a class="cc-primary-link" href="#business">Apri Revenue Studio <span aria-hidden="true">→</span></a>
          <span id="revenue-hero-assurance">Nessuna metrica economica viene inventata.</span>
        </div>
        <div class="cc-revenue-squad" aria-label="Squadra operativa reale">
          <span><b id="team-total">—</b> specialisti</span>
          <span><b id="team-ready">—</b> pronti</span>
          <span><b id="team-active">—</b> attivi</span>
           <span><b id="team-completed">—</b> TASK COMPLETATI</span>
        </div>
      </div>
      <aside class="cc-revenue-pulse" aria-labelledby="revenue-pulse-heading">
        <div class="cc-revenue-pulse-head">
          <div><p class="cc-panel-label">REVENUE PULSE</p><h3 id="revenue-pulse-heading">Stato commerciale reale</h3></div>
          <span class="cc-revenue-state" id="revenue-state">SETUP REQUIRED</span>
        </div>
        <div class="cc-revenue-metrics" aria-live="polite">
          <article><span>Target mensile</span><strong id="revenue-target">—</strong><small id="revenue-target-note">Input Fabio richiesto</small></article>
          <article><span>Piano base</span><strong id="revenue-plan">—</strong><small id="revenue-plan-note">Economics non disponibile</small></article>
          <article><span>Margine contribuzione</span><strong id="revenue-margin">—</strong><small id="revenue-margin-note">Formula in attesa</small></article>
          <article><span>Pipeline verificata</span><strong id="revenue-pipeline">—</strong><small id="revenue-pipeline-note">Nessun CRM inventato</small></article>
        </div>
        <div class="cc-revenue-next">
          <span>PROSSIMA MOSSA</span>
          <strong id="revenue-next-title">Completa il Revenue Input Pack</strong>
          <p id="revenue-next-detail">Definisci target, offerta, prezzo, capacità e canale prima di attivare esperimenti.</p>
        </div>
      </aside>
    </section>

    <section class="cc-revenue-journey" data-primary-view="today" aria-labelledby="revenue-journey-heading">
      <div class="cc-revenue-journey-head"><div><p class="cc-panel-label">VALUE FLOW</p><h3 id="revenue-journey-heading">Una catena, sette segnali verificabili</h3></div><span>La vendita non è un numero: è un percorso osservabile.</span></div>
      <div class="cc-revenue-stages" id="revenue-stage-list" aria-live="polite"></div>
    </section>

    <section class="cc-venture-today" data-primary-view="today" aria-labelledby="venture-today-heading">
      <div class="cc-venture-today-head"><div><p class="cc-panel-label">VENTURE PORTFOLIO</p><h3 id="venture-today-heading">Holding pulse</h3></div><a href="#venture">Apri Venture Studio <span aria-hidden="true">→</span></a></div>
      <div class="cc-venture-today-grid" id="venture-today-grid" aria-live="polite"></div>
      <div class="cc-venture-today-next" id="venture-today-next" aria-live="polite"></div>
    </section>

    <section class="cc-section cc-overview" id="overview" data-primary-view="today" aria-labelledby="overview-heading">
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
      <section class="cc-decision-inbox" aria-labelledby="decision-inbox-heading">
        <div class="cc-daily-heading"><div><p class="cc-panel-label">DECISION INBOX</p><h3 id="decision-inbox-heading">Una voce per ogni decisione corrente</h3></div><span id="decision-inbox-meta">In caricamento</span></div>
        <div id="decision-inbox-list" class="cc-decision-inbox-list" aria-live="polite"></div>
      </section>
      <section class="cc-daily-console" aria-labelledby="daily-operating-heading">
        <div class="cc-daily-heading"><div><p class="cc-panel-label">DAILY OPERATING BRIEF</p><h3 id="daily-operating-heading">Stato operativo persistito</h3></div><span id="daily-operating-meta">In attesa del primo report</span></div>
        <div id="daily-operating-sections" class="cc-daily-sections" aria-live="polite"></div>
      </section>
    </section>

    <section class="cc-section" id="system" data-primary-view="system" aria-labelledby="pipeline-heading" hidden aria-hidden="true">
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

    <section class="cc-studio-switcher" id="studio" data-primary-view="studio" aria-label="Strumenti dello Studio" hidden aria-hidden="true">
      <div>
        <p class="cc-kicker">STUDIO ONLYWAY</p>
        <h2>Un solo spazio. Sei strumenti.</h2>
        <p>Scegli il contesto; il dettaglio si apre soltanto quando serve.</p>
      </div>
      <div class="cc-segmented-control" role="tablist" aria-label="Aree dello Studio">
        <button id="studio-tab-production" type="button" role="tab" data-studio-target="production" aria-controls="production" aria-selected="true">Produzione</button>
        <button id="studio-tab-social" type="button" role="tab" data-studio-target="social" aria-controls="social" aria-selected="false" aria-label="Intelligence Social">Social</button>
        <button id="studio-tab-business" type="button" role="tab" data-studio-target="business" aria-controls="business" aria-selected="false" aria-label="Missioni Business">Business</button>
        <button id="studio-tab-evidence" type="button" role="tab" data-studio-target="evidence" aria-controls="evidence" aria-selected="false">Evidenze</button>
        <button id="studio-tab-vault" type="button" role="tab" data-studio-target="vault" aria-controls="vault" aria-selected="false">Intelligence Creativa</button>
        <button id="studio-tab-venture" type="button" role="tab" data-studio-target="venture" aria-controls="venture" aria-selected="false">Venture Studio</button>
      </div>
    </section>

    <section class="cc-section cc-venture-studio" id="venture" data-primary-view="studio" data-studio-panel="venture" role="tabpanel" aria-labelledby="studio-tab-venture" hidden aria-hidden="true">
      <div class="cc-section-heading"><div><p class="cc-kicker">ONLYWAY VENTURE OPERATING SYSTEM</p><h2 id="venture-heading">Dal segnale alla decisione Founder.</h2></div><span class="cc-section-note">Portfolio interno · proposal only · azioni esterne LOCKED</span></div>
      <div class="cc-venture-health" id="venture-health" aria-live="polite"></div>
      <div class="cc-venture-tool-tabs" role="tablist" aria-label="Strumenti Venture Studio">
        <button id="venture-tab-radar" type="button" role="tab" data-venture-target="radar" aria-controls="venture-radar" aria-selected="true">Opportunity Radar</button>
        <button id="venture-tab-pipeline" type="button" role="tab" data-venture-target="pipeline" aria-controls="venture-pipeline" aria-selected="false">Venture Pipeline</button>
        <button id="venture-tab-portfolio" type="button" role="tab" data-venture-target="portfolio" aria-controls="venture-portfolio" aria-selected="false">Portfolio</button>
        <button id="venture-tab-capital" type="button" role="tab" data-venture-target="capital" aria-controls="venture-capital" aria-selected="false">Capital Board</button>
        <button id="venture-tab-experiments" type="button" role="tab" data-venture-target="experiments" aria-controls="venture-experiments" aria-selected="false">Experiment Lab</button>
        <button id="venture-tab-dossier" type="button" role="tab" data-venture-target="dossier" aria-controls="venture-dossier" aria-selected="false">Venture Dossier</button>
        <button id="venture-tab-assets" type="button" role="tab" data-venture-target="assets" aria-controls="venture-assets" aria-selected="false">Venture Assets</button>
        <button id="venture-tab-decisions" type="button" role="tab" data-venture-target="decisions" aria-controls="venture-decisions" aria-selected="false">Decision Inbox</button>
      </div>
      <div class="cc-venture-workspace">
        <section id="venture-radar" role="tabpanel" data-venture-panel="radar" aria-labelledby="venture-tab-radar"><div class="cc-venture-panel-content" data-venture-content="radar"></div></section>
        <section id="venture-pipeline" role="tabpanel" data-venture-panel="pipeline" aria-labelledby="venture-tab-pipeline" hidden aria-hidden="true"><div class="cc-venture-panel-content" data-venture-content="pipeline"></div></section>
        <section id="venture-portfolio" role="tabpanel" data-venture-panel="portfolio" aria-labelledby="venture-tab-portfolio" hidden aria-hidden="true"><div class="cc-venture-panel-content" data-venture-content="portfolio"></div></section>
        <section id="venture-capital" role="tabpanel" data-venture-panel="capital" aria-labelledby="venture-tab-capital" hidden aria-hidden="true"><div class="cc-venture-panel-content" data-venture-content="capital"></div></section>
        <section id="venture-experiments" role="tabpanel" data-venture-panel="experiments" aria-labelledby="venture-tab-experiments" hidden aria-hidden="true"><div class="cc-venture-panel-content" data-venture-content="experiments"></div></section>
        <section id="venture-dossier" role="tabpanel" data-venture-panel="dossier" aria-labelledby="venture-tab-dossier" hidden aria-hidden="true"><div class="cc-venture-panel-content" data-venture-content="dossier"></div></section>
        <section id="venture-assets" role="tabpanel" data-venture-panel="assets" aria-labelledby="venture-tab-assets" hidden aria-hidden="true"><div class="cc-venture-panel-content" data-venture-content="assets"></div></section>
        <section id="venture-decisions" role="tabpanel" data-venture-panel="decisions" aria-labelledby="venture-tab-decisions" hidden aria-hidden="true"><div class="cc-venture-panel-content" data-venture-content="decisions"></div></section>
      </div>
    </section>

    <section class="cc-section" id="business" data-primary-view="studio" data-studio-panel="business" role="tabpanel" aria-labelledby="studio-tab-business" hidden aria-hidden="true">
      <div class="cc-section-heading"><div><p class="cc-kicker">REVENUE STUDIO · BUSINESS MISSION</p><h2 id="business-heading">Progetta, valida, vendi, consegna.</h2></div><span class="cc-section-note">Un solo spazio commerciale · nessuna metrica dimostrativa</span></div>
      <section class="cc-revenue-readiness" aria-labelledby="revenue-readiness-heading">
        <div class="cc-revenue-readiness-copy"><p class="cc-panel-label">REVENUE READINESS</p><h3 id="revenue-readiness-heading">Dal contesto alla prima vendita verificata</h3><p id="revenue-readiness-summary">Lettura delle fonti durevoli in corso.</p><a class="cc-revenue-download" href="/assets/revenue-os/revenue-mission-input.template.json" download>Scarica Input Pack <span aria-hidden="true">↓</span></a></div>
        <div class="cc-revenue-readiness-grid" id="revenue-readiness-grid" aria-live="polite"></div>
        <div class="cc-revenue-blockers" id="revenue-blockers" aria-live="polite"></div>
      </section>
      <div class="cc-business-shell">
        <aside class="cc-business-list" id="business-mission-list"><div class="cc-list-empty">Nessuna Business Mission durevole disponibile.</div></aside>
        <div class="cc-business-workspace">
          <div class="cc-business-comparison" id="business-comparison"><div class="cc-list-empty">Le tre Opportunity Scorecard appariranno qui.</div></div>
          <article class="cc-business-dossier" id="business-dossier"><div class="cc-list-empty">Seleziona una Business Mission per ispezionare offerta, economics, validazione, artefatti e gate.</div></article>
        </div>
      </div>
    </section>

    <section class="cc-section" id="social" data-primary-view="studio" data-studio-panel="social" role="tabpanel" aria-labelledby="studio-tab-social" hidden aria-hidden="true">
      <div class="cc-section-heading"><div><p class="cc-kicker">METODO VELOCE · SOCIAL INTELLIGENCE</p><h2 id="social-heading">Report operativo giornaliero</h2></div><span class="cc-section-note" id="social-daily-status">Nessun segnale inventato</span></div>
      <div class="cc-social-live" id="social-live-panel" aria-live="polite"></div>
      <div class="cc-social-summary" id="social-summary-grid" aria-live="polite"></div>
      <div class="cc-social-pack-list" id="social-pack-list" aria-live="polite"><div class="cc-list-empty">Nessun Social Publishing Pack durevole disponibile.</div></div>
    </section>

    <section class="cc-section" id="production" data-primary-view="studio" data-studio-panel="production" role="tabpanel" aria-labelledby="studio-tab-production" hidden aria-hidden="true">
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

    <section class="cc-section" id="evidence" data-primary-view="studio" data-studio-panel="evidence" role="tabpanel" aria-labelledby="studio-tab-evidence" hidden aria-hidden="true">
      <div class="cc-section-heading"><div><p class="cc-kicker">CONOSCENZA</p><h2 id="evidence-heading">Centro Evidenze</h2></div><p class="cc-section-note">Supporto ai claim, provenienza e freshness dalla fonte di registrazione.</p></div>
      <div class="cc-evidence-grid">
        <article class="cc-evidence-panel"><p class="cc-panel-label">RESEARCH MISSION</p><div id="research-mission-list" class="cc-list"></div></article>
        <article class="cc-evidence-panel"><p class="cc-panel-label">REGISTRO FONTI</p><div id="source-list" class="cc-list"></div></article>
        <article class="cc-evidence-panel"><p class="cc-panel-label">EVIDENCE PACK</p><div id="pack-list" class="cc-list"></div></article>
        <article class="cc-evidence-panel"><p class="cc-panel-label">EVIDENZE DEI CLAIM</p><div id="evidence-list" class="cc-list"></div></article>
      </div>
    </section>

    <section class="cc-section cc-vault" id="vault" data-primary-view="studio" data-studio-panel="vault" role="tabpanel" aria-labelledby="studio-tab-vault" hidden aria-hidden="true">
      <div class="cc-section-heading">
        <div><p class="cc-kicker">CREATIVE &amp; BUSINESS INTELLIGENCE VAULT</p><h2 id="vault-heading">Intelligence Creativa</h2></div>
        <p class="cc-section-note">Solo riferimenti approvati, con diritti e provenienza verificabili.</p>
      </div>
      <div class="cc-vault-metrics" aria-label="Stato del Reference Vault">
        <article><span>Riferimenti</span><strong id="vault-total">—</strong><small>versioni correnti</small></article>
        <article><span>Approvati</span><strong id="vault-approved">—</strong><small>utilizzabili dagli agenti</small></article>
        <article><span>Da rivedere</span><strong id="vault-review">—</strong><small>decisione esplicita di Fabio</small></article>
        <article><span>Diritti bloccati</span><strong id="vault-rights-blocked">—</strong><small>mai usati come asset finale</small></article>
      </div>
      <div class="cc-vault-shell">
        <div class="cc-vault-gallery-panel">
          <div class="cc-vault-toolbar">
            <div class="cc-vault-filters" role="group" aria-label="Filtra i riferimenti">
              <button type="button" data-vault-filter="ALL" aria-pressed="true">Tutti</button>
              <button type="button" data-vault-filter="APPROVED" aria-pressed="false">Approvati</button>
              <button type="button" data-vault-filter="REJECTED" aria-pressed="false">Rifiutati</button>
              <button type="button" data-vault-filter="RIGHTS_BLOCKED" aria-pressed="false">Diritti bloccati</button>
            </div>
            <span id="vault-gallery-summary" aria-live="polite">Vault in caricamento</span>
          </div>
          <div class="cc-vault-gallery" id="reference-vault-gallery" aria-live="polite"></div>
        </div>
        <aside class="cc-vault-detail" id="reference-vault-detail" aria-label="Metadati del riferimento selezionato" aria-live="polite"></aside>
      </div>
      <div class="cc-vault-secondary-grid">
        <article class="cc-vault-intelligence" aria-labelledby="vault-comparison-label"><p class="cc-panel-label" id="vault-comparison-label">APPROVATI VS RIFIUTATI</p><div id="approved-rejected-comparison"></div></article>
        <article class="cc-vault-intelligence" aria-labelledby="vault-sequences-label"><p class="cc-panel-label" id="vault-sequences-label">SEQUENZE CAROSELLO</p><div id="carousel-sequence-panel"></div></article>
      </div>
      <div class="cc-vault-intelligence-grid">
        <article class="cc-vault-intelligence"><p class="cc-panel-label">FABIO VISUAL FINGERPRINT</p><div id="visual-fingerprint-panel"></div></article>
        <article class="cc-vault-intelligence"><p class="cc-panel-label">FABIO WRITING FINGERPRINT</p><div id="writing-fingerprint-panel"></div></article>
        <article class="cc-vault-intelligence"><p class="cc-panel-label">BUSINESS CONTEXT</p><div id="business-context-panel"></div></article>
        <article class="cc-vault-intelligence"><p class="cc-panel-label">DECISION MEMORY &amp; OUTCOMES</p><div id="decision-memory-panel"></div></article>
      </div>
      <div class="cc-vault-alerts" id="vault-missing-inputs" aria-live="polite"></div>
    </section>

    <section class="cc-section cc-operations" id="runtime" data-primary-view="system" aria-labelledby="runtime-heading" hidden aria-hidden="true">
      <div class="cc-section-heading"><div><p class="cc-kicker">OPERAZIONI</p><h2 id="runtime-heading">Runtime H24</h2></div><span class="cc-runtime-state" id="runtime-status">Caricamento</span></div>
      <div class="cc-runtime-grid">
        <article class="cc-runtime-console"><p class="cc-panel-label">STATO SUPERVISIONE</p><strong id="worker-status">Verifica della registrazione del worker</strong><p id="worker-detail">Il runtime locale è in lettura.</p><div class="cc-runtime-rule"></div><dl><div><dt>Scheduler</dt><dd id="scheduler-status">Non registrato</dd></div><div><dt>Worker</dt><dd id="worker-lease-status">Non registrato</dd></div><div><dt>Maintenance</dt><dd id="maintenance-status">Disabilitata</dd></div><div><dt>Kill switch</dt><dd id="kill-switch-status">Rilasciato</dd></div><div><dt>Telegram</dt><dd id="telegram-status">Non osservato</dd></div><div><dt>Effetti esterni</dt><dd id="external-effects-status">Copertura globale non disponibile</dd></div></dl></article>
        <article class="cc-runtime-jobs"><p class="cc-panel-label">REGISTRO JOB</p><div id="runtime-bars" class="cc-runtime-bars" aria-live="polite"></div></article>
      </div>
    </section>

    <section class="cc-section cc-agent-section" id="agents" data-primary-view="team" aria-labelledby="agents-heading" hidden aria-hidden="true">
      <section class="cc-tower-intro" aria-labelledby="onlyway-tower-heading">
        <div class="cc-tower-copy">
          <p class="cc-kicker">ONLYWAY TOWER · MISSION COMMAND</p>
          <h2 id="onlyway-tower-heading">Un comando.<br /><em>Una squadra coordinata.</em></h2>
          <p>La Tower mostra soltanto capacità, stato e lavoro osservati nel control plane. NEXUS orchestra ORACLE, VECTOR, PRISM e FORGE; Fabio mantiene ogni decisione ad alto impatto.</p>
          <div class="cc-tower-pacts"><span>Evidence-led</span><span>A3 controllata</span><span>Provider gated</span><span>Publication locked</span></div>
        </div>
        <aside class="cc-tower-command" aria-label="Telemetria reale Onlyway Tower">
          <div class="cc-tower-seal" aria-hidden="true"><i></i><span>OW</span></div>
          <div class="cc-tower-rail">
            <div><span>AGENTI</span><strong id="tower-total">—</strong><small>registrati</small></div>
            <div><span>PRONTI</span><strong id="tower-ready">—</strong><small>ready o active</small></div>
            <div><span>GUARDIANI</span><strong id="tower-guardians">—</strong><small>quality · risk · cost</small></div>
            <div><span>PUBBLICAZIONE</span><strong>LOCKED</strong><small>zero effetti esterni</small></div>
          </div>
        </aside>
      </section>
      <div class="cc-agent-hero">
        <div>
          <p class="cc-kicker">COMPAGNIA AGENTI · APEX</p>
          <h2 id="agents-heading">La squadra che trasforma una missione in risultato.</h2>
           <p>Non diciassette chatbot. Sei reparti, diciassette specialisti, un solo comando: ruoli, task, gate, costi e stati arrivano esclusivamente dal control plane.</p>
        </div>
        <div class="cc-agent-hero-stats" aria-label="Stato della Compagnia Agenti">
          <div><strong id="apex-total">—</strong><span>specialisti</span></div>
          <div><strong id="apex-squads">—</strong><span>reparti</span></div>
          <div><strong id="apex-guardians">—</strong><span>guardiani</span></div>
           <div><strong>A3</strong><span>controllata</span></div>
        </div>
      </div>
      <div class="cc-agent-toolbar">
        <div class="cc-agent-filters" role="group" aria-label="Filtra gli agenti per reparto">
          <button type="button" data-agent-filter="ALL" aria-pressed="true">Tutti</button>
          <button type="button" data-agent-filter="COMMAND" aria-pressed="false">Command</button>
          <button type="button" data-agent-filter="INTELLIGENCE" aria-pressed="false">Intelligence</button>
          <button type="button" data-agent-filter="STUDIO" aria-pressed="false">Studio</button>
          <button type="button" data-agent-filter="GROWTH" aria-pressed="false">Growth</button>
          <button type="button" data-agent-filter="BUILD" aria-pressed="false">Build</button>
          <button type="button" data-agent-filter="GUARDIANS" aria-pressed="false">Guardians</button>
        </div>
        <p id="agent-filter-summary" aria-live="polite">Caricamento roster operativo.</p>
      </div>
      <div class="cc-agent-company-layout cc-agent-company-layout--apex">
        <div class="cc-agent-roster">
          <p class="cc-panel-label">ROSTER OPERATIVO</p>
          <div class="cc-agent-grid" id="agent-grid"></div>
        </div>
        <aside class="cc-agent-side">
          <article class="cc-agent-dossier" id="agent-dossier" aria-live="polite">
            <div class="cc-list-empty">Seleziona uno specialista per aprire il dossier operativo.</div>
          </article>
          <section class="cc-workday-console" aria-labelledby="workday-heading">
            <div class="cc-workday-heading"><p class="cc-panel-label">MISSIONI DUREVOLI</p><h3 id="workday-heading">Giornata Agent Company</h3></div>
            <div class="cc-workday-list" id="agent-workday-list"></div>
            <div class="cc-workday-detail" id="agent-workday-detail"></div>
          </section>
          <section class="cc-workday-console cc-founder-workday" aria-labelledby="founder-workday-heading">
            <div class="cc-workday-heading"><p class="cc-panel-label">WORKDAY #001 · FOUNDER DOSSIER</p><h3 id="founder-workday-heading">Piano trasversale verificabile</h3></div>
            <div id="founder-workday-detail" aria-live="polite"></div>
          </section>
        </aside>
      </div>
    </section>

    <section class="cc-section" id="approvals" data-primary-view="today" aria-labelledby="approvals-heading">
      <div class="cc-section-heading"><div><p class="cc-kicker">GOVERNANCE</p><h2 id="approvals-heading">Centro Approvazioni</h2></div></div>
      <div class="cc-approval-panel"><div><p class="cc-panel-label">CONTROLLO FABIO</p><h3 id="approval-title">Lettura dello stato di approvazione</h3><p id="approval-detail">Il registro delle approvazioni supportate da evidenze è in caricamento.</p></div><a class="cc-text-action" href="#production">Ispeziona i pacchetti <span aria-hidden="true">→</span></a></div>
      <div class="cc-approval-review-list" id="approval-review-list"></div>
    </section>

    <section class="cc-section" id="governance" data-primary-view="system" aria-labelledby="governance-heading" hidden aria-hidden="true">
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
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto!important}.cc-world-image,.cc-world-light{animation:none!important;transform:none!important;transition:none!important}.cc-metric,.cc-production-card,.cc-evidence-panel,.cc-runtime-console,.cc-runtime-jobs,.cc-agent,.cc-approval-panel{transition:none!important}}
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

/* Onlyway Tower and Squad Apex: cinematic hierarchy backed only by real agent data. */
.cc-skip-link{background:var(--ow-gold-light);color:#09070b;font-size:12px;font-weight:700;left:18px;padding:10px 14px;position:fixed;top:12px;transform:translateY(-180%);transition:transform .2s ease;z-index:100}.cc-skip-link:focus{outline:2px solid var(--ow-chrome-white);outline-offset:3px;transform:translateY(0)}
.cc-tower-intro{background:radial-gradient(circle at 77% 45%,rgba(117,89,190,.18),transparent 23rem),linear-gradient(118deg,rgba(18,12,25,.94),rgba(4,4,8,.88));border:1px solid rgba(231,200,146,.24);box-shadow:0 36px 110px rgba(0,0,0,.42);display:grid;grid-template-columns:minmax(0,1.12fr) minmax(360px,.88fr);isolation:isolate;margin-top:18px;min-height:430px;overflow:hidden;position:relative}.cc-tower-intro:before{background:linear-gradient(90deg,transparent,rgba(231,200,146,.8),transparent);content:"";height:1px;left:0;position:absolute;right:0;top:0}.cc-tower-intro:after{background:radial-gradient(circle,rgba(231,200,146,.13) 0 1px,transparent 1.5px);background-size:24px 24px;content:"";inset:0;mask-image:linear-gradient(90deg,transparent 25%,#000);opacity:.26;pointer-events:none;position:absolute;z-index:-1}.cc-tower-copy{align-self:center;padding:clamp(38px,6vw,82px)}.cc-tower-copy h2{font:400 clamp(38px,5.1vw,76px)/.95 Georgia,"Times New Roman",serif;letter-spacing:-.055em;margin:18px 0 24px;max-width:900px}.cc-tower-copy h2 em{color:var(--ow-gold-light);font-style:normal}.cc-tower-copy>p:not(.cc-kicker){color:var(--ow-chrome);font-size:clamp(13px,1.2vw,17px);line-height:1.7;margin:0;max-width:720px}.cc-tower-pacts{display:flex;flex-wrap:wrap;gap:8px;margin-top:30px}.cc-tower-pacts span{background:rgba(3,3,7,.42);border:1px solid rgba(226,220,229,.14);color:var(--ow-chrome-bright);font-size:10px;letter-spacing:.1em;padding:9px 12px;text-transform:uppercase}.cc-tower-command{align-items:center;border-left:1px solid rgba(226,220,229,.1);display:grid;grid-template-columns:minmax(180px,.8fr) minmax(170px,1.2fr);padding:38px;position:relative}.cc-tower-seal{aspect-ratio:1;border:1px solid rgba(231,200,146,.34);border-radius:50%;display:grid;max-width:260px;place-items:center;position:relative;width:100%}.cc-tower-seal:before,.cc-tower-seal:after,.cc-tower-seal i{border:1px solid rgba(231,200,146,.18);border-radius:50%;content:"";inset:12%;position:absolute}.cc-tower-seal:after{border-style:dashed;inset:25%;transform:rotate(24deg)}.cc-tower-seal i{border-color:rgba(119,136,199,.32);inset:-9%}.cc-tower-seal span{color:var(--ow-chrome-white);font:400 clamp(32px,4vw,58px)/1 Georgia,"Times New Roman",serif;letter-spacing:.08em;text-shadow:0 0 34px rgba(231,200,146,.28)}.cc-tower-rail{display:grid;gap:0}.cc-tower-rail div{border-bottom:1px solid rgba(226,220,229,.1);display:grid;grid-template-columns:1fr auto;min-width:0;padding:15px 0 15px 24px}.cc-tower-rail div:last-child{border-bottom:0}.cc-tower-rail span{color:var(--ow-bronze);font-size:9px;letter-spacing:.14em}.cc-tower-rail strong{color:var(--ow-chrome-white);font:400 25px/1 Georgia,"Times New Roman",serif;grid-row:1/3}.cc-tower-rail small{color:var(--ow-chrome);font-size:9px;margin-top:4px}
.cc-agent-section{scroll-margin-top:26px}.cc-agent-hero{align-items:end;background:linear-gradient(135deg,rgba(16,10,23,.82),rgba(3,3,7,.68));border:1px solid rgba(226,220,229,.14);display:grid;gap:30px;grid-template-columns:minmax(0,1.35fr) minmax(360px,.65fr);overflow:hidden;padding:clamp(28px,4vw,54px);position:relative}.cc-agent-hero:after{background:linear-gradient(90deg,transparent,rgba(119,136,199,.16));content:"";inset:0;pointer-events:none;position:absolute}.cc-agent-hero h2{font-size:clamp(34px,4vw,58px);line-height:1;margin:12px 0 18px;max-width:870px}.cc-agent-hero>div>p:not(.cc-kicker){color:var(--ow-chrome);font-size:13px;line-height:1.65;margin:0;max-width:760px}.cc-agent-hero-stats{display:grid;gap:1px;grid-template-columns:repeat(2,minmax(0,1fr));position:relative;z-index:1}.cc-agent-hero-stats div{background:rgba(3,3,7,.66);border:1px solid rgba(226,220,229,.1);display:grid;gap:5px;min-height:100px;padding:17px}.cc-agent-hero-stats strong{color:var(--ow-gold-light);font:400 30px/1 Georgia,"Times New Roman",serif}.cc-agent-hero-stats span{color:var(--ow-chrome);font-size:9px;letter-spacing:.11em;text-transform:uppercase}.cc-agent-toolbar{align-items:center;border-bottom:1px solid rgba(226,220,229,.1);display:flex;gap:18px;justify-content:space-between;padding:18px 0}.cc-agent-filters{display:flex;flex-wrap:wrap;gap:7px}.cc-agent-filters button{background:rgba(5,4,8,.62);border:1px solid rgba(226,220,229,.14);color:var(--ow-chrome);cursor:pointer;font:9px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.09em;padding:9px 12px;text-transform:uppercase}.cc-agent-filters button:hover,.cc-agent-filters button:focus-visible,.cc-agent-filters button[aria-pressed="true"]{background:rgba(92,62,113,.22);border-color:rgba(231,200,146,.45);color:var(--ow-chrome-white);outline:0}.cc-agent-toolbar>p{color:var(--ow-chrome);font-size:10px;margin:0;text-align:right}.cc-agent-company-layout--apex{grid-template-columns:minmax(0,1.32fr) minmax(360px,.68fr);margin-top:18px}.cc-agent-roster>.cc-panel-label{margin-bottom:11px}.cc-agent-side{display:grid;gap:14px;min-width:0}.cc-agent-company-layout--apex .cc-agent-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cc-agent-company-layout--apex .cc-agent{--apex-accent:#d7ae71;appearance:none;background:linear-gradient(145deg,color-mix(in srgb,var(--apex-accent) 10%,rgba(12,8,17,.9)),rgba(4,3,7,.84) 60%);border:1px solid color-mix(in srgb,var(--apex-accent) 30%,rgba(226,220,229,.12));border-radius:0;color:var(--ow-chrome-white);cursor:pointer;display:grid;font:inherit;gap:16px;min-height:330px;padding:20px;position:relative;text-align:left;width:100%}.cc-agent-company-layout--apex .cc-agent:before{background:var(--apex-accent);content:"";height:1px;left:0;opacity:.9;position:absolute;top:0;width:64px}.cc-agent-company-layout--apex .cc-agent:hover,.cc-agent-company-layout--apex .cc-agent:focus-visible,.cc-agent-company-layout--apex .cc-agent[aria-pressed="true"]{border-color:color-mix(in srgb,var(--apex-accent) 72%,white 4%);box-shadow:0 24px 68px color-mix(in srgb,var(--apex-accent) 12%,transparent),inset 0 1px rgba(255,255,255,.04);outline:0}.cc-agent[data-squad="COMMAND"],.cc-agent-dossier[data-squad="COMMAND"]{--apex-accent:#e5bd74}.cc-agent[data-squad="INTELLIGENCE"],.cc-agent-dossier[data-squad="INTELLIGENCE"]{--apex-accent:#7f91d8}.cc-agent[data-squad="STUDIO"],.cc-agent-dossier[data-squad="STUDIO"]{--apex-accent:#a578c2}.cc-agent[data-squad="GROWTH"],.cc-agent-dossier[data-squad="GROWTH"]{--apex-accent:#61b58a}.cc-agent[data-squad="BUILD"],.cc-agent-dossier[data-squad="BUILD"]{--apex-accent:#62a8c7}.cc-agent[data-squad="GUARDIANS"],.cc-agent-dossier[data-squad="GUARDIANS"]{--apex-accent:#cf7a70}.cc-agent-card-head{align-items:start;display:grid;gap:12px;grid-template-columns:auto minmax(0,1fr) auto;min-height:auto!important}.cc-agent-emblem,.cc-agent-dossier-emblem{align-items:center;aspect-ratio:1;background:radial-gradient(circle,color-mix(in srgb,var(--apex-accent) 18%,transparent),transparent 70%);border:1px solid color-mix(in srgb,var(--apex-accent) 55%,transparent);color:var(--apex-accent);display:flex;font:400 15px/1 Georgia,"Times New Roman",serif;justify-content:center;letter-spacing:.08em;position:relative;width:50px}.cc-agent-emblem:after,.cc-agent-dossier-emblem:after{border:1px solid color-mix(in srgb,var(--apex-accent) 22%,transparent);content:"";inset:5px;position:absolute;transform:rotate(45deg)}.cc-agent-identity{min-height:auto!important}.cc-agent-call-sign{color:var(--apex-accent)!important;font-size:9px!important;letter-spacing:.13em!important;margin:0!important;text-transform:uppercase}.cc-agent-company-layout--apex .cc-agent h3{font-size:21px;margin:5px 0}.cc-agent-executor{color:var(--ow-chrome)!important;font-size:9px!important;margin-top:6px!important}.cc-agent-state{border:1px solid rgba(226,220,229,.14);color:var(--ow-chrome);font-size:8px;letter-spacing:.09em;padding:6px 7px;text-transform:uppercase}.cc-agent-state[data-state="ACTIVE"],.cc-agent-state[data-state="READY"]{border-color:rgba(80,165,121,.45);color:#a6dfbe}.cc-agent-state[data-state="DEGRADED"],.cc-agent-state[data-state="BLOCKED"]{border-color:rgba(201,86,94,.52);color:#efa9af}.cc-agent-mission{border-bottom:1px solid rgba(226,220,229,.08);border-top:1px solid rgba(226,220,229,.08);padding:13px 0}.cc-agent-mission span,.cc-agent-power>span,.cc-agent-dossier-mission span,.cc-agent-dossier-capability>span{color:var(--apex-accent);font-size:8px;letter-spacing:.14em}.cc-agent-mission p{color:var(--ow-chrome-bright)!important;font-size:12px!important;line-height:1.5!important;margin:7px 0 0!important}.cc-agent-card-stats{display:grid;gap:7px;grid-template-columns:repeat(4,minmax(0,1fr))}.cc-agent-card-stats div{border-left:1px solid color-mix(in srgb,var(--apex-accent) 28%,transparent);display:grid;gap:5px;padding-left:8px}.cc-agent-card-stats span{color:var(--ow-chrome);font-size:8px}.cc-agent-card-stats strong{color:var(--ow-chrome-white);font:400 15px/1 Georgia,"Times New Roman",serif}.cc-agent-power{align-items:end;display:grid;gap:7px;grid-template-columns:minmax(0,1fr) auto;margin-top:auto}.cc-agent-power>span{grid-column:1/-1}.cc-agent-power code{color:var(--ow-chrome);font:9px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}.cc-agent-power b{color:var(--apex-accent);font-size:9px;font-weight:500;white-space:nowrap}.cc-agent-dossier{--apex-accent:#e5bd74;background:linear-gradient(145deg,color-mix(in srgb,var(--apex-accent) 9%,rgba(12,8,17,.94)),rgba(4,3,7,.9));border:1px solid color-mix(in srgb,var(--apex-accent) 36%,rgba(226,220,229,.12));box-shadow:0 24px 72px rgba(0,0,0,.3);display:grid;gap:18px;padding:22px}.cc-agent-dossier-head{align-items:start;display:grid;gap:12px;grid-template-columns:auto minmax(0,1fr) auto}.cc-agent-dossier-emblem{width:64px}.cc-agent-dossier-head h3{font-size:25px;line-height:1;margin:6px 0}.cc-agent-dossier-head small{color:var(--ow-chrome);font:8px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}.cc-agent-dossier-mission,.cc-agent-dossier-capability{border-top:1px solid rgba(226,220,229,.09);display:grid;gap:8px;padding-top:14px}.cc-agent-dossier-mission p{color:var(--ow-chrome-bright);font:400 17px/1.35 Georgia,"Times New Roman",serif;margin:0}.cc-agent-dossier-capability code{background:rgba(0,0,0,.22);border-left:2px solid var(--apex-accent);color:var(--ow-chrome-bright);font:9px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere;padding:9px}.cc-agent-dossier-grid{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr))}.cc-agent-dossier-grid .cc-agent-stat{background:rgba(0,0,0,.16);border:1px solid rgba(226,220,229,.08);padding:10px}.cc-agent-dossier-grid .cc-agent-stat span{color:var(--ow-chrome);font-size:8px}.cc-agent-dossier-grid .cc-agent-stat b{font-size:10px}.cc-agent-guardrail{align-items:start;background:rgba(0,0,0,.2);border:1px solid rgba(226,220,229,.08);display:grid;gap:10px;grid-template-columns:auto 1fr;padding:12px}.cc-agent-guardrail span{border:1px solid color-mix(in srgb,var(--apex-accent) 45%,transparent);color:var(--apex-accent);font:9px ui-monospace,SFMono-Regular,Menlo,monospace;padding:6px}.cc-agent-guardrail p{color:var(--ow-chrome);font-size:9px;line-height:1.5;margin:0}.cc-agent-side .cc-workday-console{max-height:none;position:static}
.cc-agent-card-stats{gap:8px;grid-template-columns:repeat(2,minmax(0,1fr))}.cc-agent-card-stats div{min-height:42px;padding-left:10px}.cc-agent-card-stats span{line-height:1.25}.cc-agent-power{grid-template-columns:1fr}.cc-agent-power b{justify-self:end}
@media (max-width:1280px){.cc-tower-intro{grid-template-columns:1fr}.cc-tower-command{border-left:0;border-top:1px solid rgba(226,220,229,.1);grid-template-columns:minmax(170px,.45fr) minmax(0,1fr)}.cc-tower-seal{max-width:210px}.cc-agent-hero{grid-template-columns:1fr}.cc-agent-company-layout--apex{grid-template-columns:1fr}.cc-agent-side{grid-template-columns:repeat(2,minmax(0,1fr))}.cc-agent-company-layout--apex .cc-agent-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.cc-agent-card-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:1020px){.cc-agent-company-layout--apex .cc-agent-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cc-agent-side{grid-template-columns:1fr}}
@media (max-width:820px){.cc-tower-copy{padding:34px 24px}.cc-tower-copy h2{font-size:clamp(38px,12vw,58px)}.cc-tower-command{grid-template-columns:1fr;padding:28px 24px}.cc-tower-seal{margin:0 auto;max-width:190px}.cc-tower-rail{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:28px}.cc-tower-rail div{border:1px solid rgba(226,220,229,.09);padding:13px}.cc-agent-hero{padding:28px 22px}.cc-agent-hero-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.cc-agent-toolbar{align-items:start;display:grid}.cc-agent-toolbar>p{text-align:left}.cc-agent-filters{flex-wrap:nowrap;max-width:100%;overflow-x:auto;padding-bottom:4px}.cc-agent-filters button{white-space:nowrap}.cc-agent-company-layout--apex .cc-agent-grid{grid-template-columns:1fr}.cc-agent-company-layout--apex .cc-agent{min-height:300px}.cc-agent-dossier-head{grid-template-columns:auto minmax(0,1fr)}.cc-agent-dossier-head>.cc-agent-state{grid-column:1/-1;width:max-content}}
@media (max-width:520px){.cc-tower-intro{margin-inline:-12px}.cc-tower-pacts span{font-size:8px}.cc-tower-rail strong{font-size:21px}.cc-agent-hero{margin-inline:-12px}.cc-agent-card-head{grid-template-columns:auto minmax(0,1fr)}.cc-agent-card-head>.cc-agent-state{grid-column:1/-1;width:max-content}.cc-agent-card-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.cc-agent-dossier-grid{grid-template-columns:1fr}.cc-agent-guardrail{grid-template-columns:1fr}.cc-agent-company-layout--apex .cc-agent{padding:17px}}

/* Social Intelligence: daily decision surface, never placeholder analytics. */
.cc-social-live{background:linear-gradient(145deg,rgba(15,11,20,.8),rgba(4,4,8,.66));backdrop-filter:blur(22px);border:1px solid rgba(205,165,86,.28);display:grid;gap:16px;margin-bottom:14px;padding:20px}.cc-social-live-head{align-items:start;display:flex;gap:18px;justify-content:space-between}.cc-social-live-head h3{font:400 clamp(20px,2.4vw,34px)/1 Georgia,"Times New Roman",serif;margin:3px 0}.cc-social-live-head .cc-social-score{font-size:20px;margin:2px 0 0;text-align:right}.cc-social-live-grid{display:grid;gap:10px;grid-template-columns:repeat(6,minmax(0,1fr))}.cc-social-live-grid div{border-left:1px solid rgba(205,165,86,.3);display:grid;gap:4px;padding:5px 10px}.cc-social-live-grid span{color:var(--ow-bronze);font-size:8px;text-transform:uppercase}.cc-social-live-grid b{font:400 22px/1 Georgia,"Times New Roman",serif}.cc-social-missing{color:var(--ow-chrome);font-size:9px;line-height:1.6;margin:0}.cc-social-candidate{background:rgba(3,3,7,.42);border:1px solid rgba(205,165,86,.2);display:grid;gap:9px;padding:14px}.cc-social-candidate strong{font:400 17px/1.2 Georgia,"Times New Roman",serif}.cc-social-candidate-signals{display:flex;flex-wrap:wrap;gap:6px}.cc-social-candidate-signals span{border:1px solid rgba(255,255,255,.12);font-size:8px;padding:5px 7px}.cc-social-candidate-signals span[data-ready="true"]{border-color:rgba(92,190,139,.4);color:#91d9b1}.cc-social-candidate-signals span[data-ready="false"]{border-color:rgba(222,169,82,.35);color:#d8b574}.cc-social-downloads{display:flex;flex-wrap:wrap;gap:8px 18px}.cc-social-download{color:var(--ow-gold);font-size:9px;letter-spacing:.08em;text-decoration:none;text-transform:uppercase}.cc-social-download:hover{color:var(--ow-ivory);text-decoration:underline}
.cc-social-summary{display:grid;gap:10px;grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:14px}.cc-social-summary article{background:rgba(6,5,9,.62);backdrop-filter:blur(18px);border:1px solid rgba(226,220,229,.14);display:grid;gap:5px;min-height:96px;padding:16px}.cc-social-summary span{color:var(--ow-bronze);font-size:8px;letter-spacing:.09em;text-transform:uppercase}.cc-social-summary strong{color:var(--ow-chrome-white);font:400 25px/1 Georgia,"Times New Roman",serif}.cc-social-summary small{color:var(--ow-chrome);font-size:8px;line-height:1.4}.cc-social-pack-list{display:grid;gap:12px}.cc-social-pack{background:linear-gradient(145deg,rgba(15,11,20,.78),rgba(4,4,8,.68));backdrop-filter:blur(22px);border:1px solid rgba(226,220,229,.17);box-shadow:0 24px 68px rgba(0,0,0,.28);display:grid;gap:18px;grid-template-columns:minmax(210px,.72fr) minmax(0,1.28fr);padding:22px}.cc-social-pack[data-status="BLOCKED"]{border-color:rgba(201,86,94,.46)}.cc-social-pack[data-status="REQUIRES_RESEARCH"]{border-color:rgba(232,173,78,.42)}.cc-social-pack-head{border-right:1px solid rgba(226,220,229,.1);padding-right:20px}.cc-social-pack-head h3{color:var(--ow-chrome-white);font:400 23px/1.08 Georgia,"Times New Roman",serif;margin:8px 0}.cc-social-score{color:var(--ow-gold-light);display:block;font:400 34px/1 Georgia,"Times New Roman",serif;margin:18px 0 5px}.cc-social-pack-head small,.cc-social-block small{color:var(--ow-bronze-dark);font-size:8px;line-height:1.45}.cc-social-grid{display:grid;gap:8px;grid-template-columns:repeat(3,minmax(0,1fr))}.cc-social-block{background:rgba(0,0,0,.18);border-top:1px solid rgba(226,220,229,.12);display:grid;gap:5px;padding:11px}.cc-social-block span{color:var(--ow-bronze);font-size:8px;letter-spacing:.08em}.cc-social-block b{color:var(--ow-chrome-bright);font-size:10px;font-weight:500;overflow-wrap:anywhere}.cc-social-alert{border-top:1px solid rgba(201,86,94,.3);color:var(--ow-warning);font-size:9px;grid-column:1/-1;margin:0;padding-top:10px}
.cc-approval-review-list{display:grid;gap:12px;margin-top:14px;min-width:0}.cc-approval-review{background:linear-gradient(145deg,rgba(18,12,23,.82),rgba(5,4,8,.74));backdrop-filter:blur(23px);border:1px solid rgba(231,200,146,.28);box-shadow:0 26px 76px rgba(0,0,0,.3);display:grid;gap:18px;max-width:100%;min-width:0;padding:22px}.cc-approval-review[data-visual-status="blocked"]{border-color:rgba(201,86,94,.56)}.cc-approval-review-head{align-items:start;border-bottom:1px solid rgba(226,220,229,.1);display:flex;gap:18px;justify-content:space-between;max-width:100%;min-width:0;padding-bottom:16px}.cc-approval-review-head h3{color:var(--ow-chrome-white);font:400 24px/1.15 Georgia,"Times New Roman",serif;margin:6px 0;overflow-wrap:anywhere}.cc-approval-review-head small{color:var(--ow-bronze);font-size:9px}.cc-approval-gates{display:flex;flex-wrap:wrap;gap:7px;min-width:0}.cc-approval-gates span{border:1px solid rgba(80,165,121,.35);color:#91d9b1;font-size:8px;letter-spacing:.08em;overflow-wrap:anywhere;padding:6px 8px}.cc-approval-gates span[data-gate="blocked"]{border-color:rgba(201,86,94,.55);color:#ef9ca3}.cc-visual-review{display:grid;gap:12px;min-width:0}.cc-visual-review-head{align-items:center;display:flex;gap:16px;justify-content:space-between;min-width:0}.cc-visual-review-head p{color:var(--ow-chrome);font-size:9px;line-height:1.5;margin:0;overflow-wrap:anywhere}.cc-visual-review-canvases{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr));min-width:0}.cc-visual-canvas{background:rgba(0,0,0,.24);border:1px solid rgba(226,220,229,.12);display:grid;gap:8px;min-width:0;padding:10px}.cc-visual-canvas span{color:var(--ow-bronze);font-size:8px;letter-spacing:.1em}.cc-visual-canvas img{background:#050505;display:block;height:min(62vh,700px);object-fit:contain;width:100%}.cc-visual-review-nav{align-items:center;display:flex;gap:10px;justify-content:center}.cc-visual-review-nav button{background:rgba(7,5,9,.75);border:1px solid rgba(231,200,146,.35);color:var(--ow-chrome-bright);cursor:pointer;padding:8px 12px}.cc-visual-review-nav button:hover{border-color:var(--ow-gold-light)}.cc-visual-review-warning{background:rgba(93,26,35,.24);border-left:3px solid var(--ow-danger);color:#efb3b8;font-size:9px;line-height:1.55;margin:0;overflow-wrap:anywhere;padding:10px 12px}.cc-approval-review-grid{display:grid;gap:8px;grid-template-columns:repeat(3,minmax(0,1fr));max-width:100%;min-width:0}.cc-approval-review-code{background:rgba(0,0,0,.22);border:1px solid rgba(226,220,229,.08);color:var(--ow-chrome-bright);font:8px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;max-width:100%;min-width:0;overflow-wrap:anywhere;padding:10px}.cc-approval-review-foot{align-items:center;border-top:1px solid rgba(226,220,229,.1);display:flex;gap:18px;justify-content:space-between;min-width:0;padding-top:15px}.cc-approval-review-foot p{color:var(--ow-warning);font-size:9px;line-height:1.5;margin:0;max-width:900px;overflow-wrap:anywhere}

@media (max-width:1280px){.cc-evidence-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cc-social-summary{grid-template-columns:repeat(3,minmax(0,1fr))}.cc-app[data-sidebar-state="compact"] .cc-production-layout{grid-template-columns:minmax(260px,.8fr) minmax(340px,1.2fr)}.cc-app[data-sidebar-state="compact"] .cc-package-inspector{grid-column:1/-1;position:static}.cc-business-shell,.cc-agent-company-layout{grid-template-columns:1fr}.cc-business-list{grid-template-columns:repeat(2,minmax(0,1fr));position:static}.cc-workday-console{max-height:none;position:static}}
@media (max-width:820px){.cc-evidence-grid,.cc-social-summary,.cc-social-grid,.cc-approval-review-grid,.cc-visual-review-canvases{grid-template-columns:1fr}.cc-social-pack{grid-template-columns:1fr}.cc-social-pack-head{border-bottom:1px solid rgba(226,220,229,.1);border-right:0;padding-bottom:16px;padding-right:0}.cc-approval-review-head,.cc-approval-review-foot,.cc-visual-review-head{display:grid}.cc-visual-canvas img{height:auto;max-height:none}.cc-app{display:block;height:auto;overflow:visible}.cc-main{padding-top:78px}.cc-mobile-menu{align-items:center;background:linear-gradient(145deg,rgba(25,19,28,.94),rgba(5,3,7,.95));border:1px solid rgba(226,220,229,.22);border-radius:50%;box-shadow:0 14px 38px rgba(0,0,0,.4);display:grid;height:42px;left:18px;padding:11px;position:fixed;top:16px;width:42px;z-index:62}.cc-mobile-menu span{background:var(--ow-chrome-bright);display:block;height:1px;transition:transform .28s ease;width:18px}.cc-app[data-mobile-sidebar="open"] .cc-mobile-menu span:first-child{transform:translateY(3px) rotate(45deg)}.cc-app[data-mobile-sidebar="open"] .cc-mobile-menu span:last-child{transform:translateY(-3px) rotate(-45deg)}.cc-sidebar{bottom:0;height:100dvh!important;left:0;overflow-y:auto!important;padding:22px 17px;position:fixed!important;top:0;transform:translateX(-104%);transition:transform .42s cubic-bezier(.22,.75,.18,1);width:min(86vw,310px);z-index:60}.cc-app[data-mobile-sidebar="open"] .cc-sidebar{transform:translateX(0)}.cc-sidebar-backdrop{background:rgba(0,0,0,.56);backdrop-filter:blur(4px);display:block;inset:0;position:fixed;z-index:55}.cc-sidebar-backdrop[hidden]{display:none}.cc-sidebar-toggle{display:none}.cc-app[data-sidebar-state="compact"] .cc-sidebar{padding:22px 17px}.cc-app[data-sidebar-state="compact"] .cc-sidebar-head{flex-direction:row}.cc-app[data-sidebar-state="compact"] .cc-brand-copy,.cc-app[data-sidebar-state="compact"] .cc-nav-label,.cc-app[data-sidebar-state="compact"] .cc-nav p,.cc-app[data-sidebar-state="compact"] .cc-sidebar-foot-label{display:block}.cc-nav,.cc-app[data-sidebar-state="compact"] .cc-nav{display:flex;flex-direction:column;gap:3px;margin-top:25px;overflow:visible;padding-bottom:0}.cc-nav p{display:block;width:100%}.cc-app[data-sidebar-state="compact"] .cc-nav a{display:grid;grid-template-columns:24px minmax(0,1fr);justify-items:stretch;padding:8px 10px}.cc-app[data-sidebar-state="compact"] .cc-nav a:after{display:none}.cc-app[data-sidebar-state="compact"] .cc-sidebar-foot{justify-content:flex-start;padding-inline:10px}.cc-business-list,.cc-business-comparison,.cc-business-summary,.cc-business-gates,.cc-scenario-grid,.cc-agent-grid{grid-template-columns:1fr}.cc-production-layout,.cc-app[data-sidebar-state="compact"] .cc-production-layout{grid-template-columns:1fr}.cc-package-inspector,.cc-app[data-sidebar-state="compact"] .cc-package-inspector{grid-column:auto;position:static}.cc-authorization-dialog{height:calc(100dvh - 24px);padding:25px 20px}.cc-authorization-details div{grid-template-columns:1fr}.cc-authorization-actions{justify-content:stretch}.cc-authorization-actions .cc-modal-button{flex:1}}
@media (max-width:820px){.cc-section{scroll-margin-top:72px}}
@media (max-width:1280px){.cc-social-live-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:820px){.cc-social-live-grid{grid-template-columns:1fr}.cc-social-live-head{display:grid}}
@media (max-width:820px){.cc-approval-review,.cc-approval-review>*{max-width:100%;min-width:0}.cc-approval-review-head,.cc-approval-review-foot,.cc-visual-review-head,.cc-approval-review-grid{grid-template-columns:minmax(0,1fr);width:100%}.cc-social-block,.cc-social-block>*,.cc-approval-fingerprint,.cc-approval-fingerprint code{max-width:100%;min-width:0;overflow-wrap:anywhere}.cc-approval-fingerprint code{word-break:break-all}}
@media (prefers-reduced-motion:reduce){.cc-app,.cc-sidebar,.cc-world-image,.cc-nav a:after,.cc-mobile-menu span{transition:none!important}.cc-world-light{animation:none!important}}
.cc-sidebar-foot[data-live-state="connecting"] .cc-live-dot{background:var(--cc-muted);box-shadow:0 0 0 4px rgba(139,137,133,.08)}
.cc-sidebar-foot[data-live-state="reconnecting"] .cc-live-dot{background:var(--cc-gold);box-shadow:0 0 0 4px rgba(209,171,92,.1)}
.cc-sidebar-foot[data-live-state="unavailable"] .cc-live-dot{background:var(--cc-danger);box-shadow:0 0 0 4px rgba(212,93,93,.1)}
.cc-daily-console{background:linear-gradient(145deg,rgba(16,11,23,.86),rgba(4,4,8,.78));border:1px solid rgba(231,200,146,.22);box-shadow:0 24px 72px rgba(0,0,0,.28);margin-top:13px;padding:22px}.cc-daily-heading{align-items:end;display:flex;gap:20px;justify-content:space-between}.cc-daily-heading h3{font:400 22px/1.15 Georgia,"Times New Roman",serif;margin:6px 0 0}.cc-daily-heading>span{color:var(--ow-chrome);font:9px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;text-align:right}.cc-daily-sections{display:grid;gap:8px;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:18px}.cc-daily-section{background:rgba(0,0,0,.2);border:1px solid rgba(226,220,229,.09);border-top:1px solid rgba(231,200,146,.32);display:grid;gap:7px;min-height:145px;padding:13px}.cc-daily-section[data-kind="UNAVAILABLE"]{border-top-color:rgba(201,86,94,.55)}.cc-daily-section[data-kind="ESTIMATE"],.cc-daily-section[data-kind="ASSUMPTION"]{border-top-color:rgba(222,169,82,.5)}.cc-daily-section>strong{color:var(--ow-chrome-white);font-size:9px;letter-spacing:.08em}.cc-daily-section p{color:var(--ow-chrome-bright);font-size:10px;line-height:1.5;margin:0;overflow-wrap:anywhere}.cc-daily-section small{color:var(--ow-bronze-dark);font-size:8px;line-height:1.5;margin-top:auto;overflow-wrap:anywhere}.cc-founder-workday{border-color:rgba(231,200,146,.25);box-shadow:0 22px 64px rgba(0,0,0,.28)}.cc-founder-summary{display:grid;gap:6px;grid-template-columns:repeat(3,minmax(0,1fr));margin:15px 0}.cc-founder-summary .cc-agent-stat{background:rgba(0,0,0,.18);border:1px solid rgba(226,220,229,.08);padding:9px}.cc-founder-objective{border-left:2px solid var(--ow-gold);color:var(--ow-chrome-bright);font:400 15px/1.5 Georgia,"Times New Roman",serif;margin:12px 0;padding-left:12px}.cc-founder-tasks{display:grid;gap:7px}.cc-founder-task{background:rgba(0,0,0,.18);border-left:2px solid rgba(226,220,229,.2);display:grid;gap:6px;padding:11px}.cc-founder-task[data-status="BLOCKED"]{border-left-color:var(--ow-danger)}.cc-founder-task[data-status="AWAITING_FABIO"]{border-left-color:var(--ow-gold)}.cc-founder-task b{color:var(--ow-chrome-white);font-size:10px;font-weight:500}.cc-founder-task p,.cc-founder-task small,.cc-founder-decisions p{color:var(--ow-chrome);font-size:8px;line-height:1.5;margin:0;overflow-wrap:anywhere}.cc-founder-decisions{border-top:1px solid rgba(226,220,229,.1);display:grid;gap:7px;margin-top:14px;padding-top:12px}
@media (max-width:1280px){.cc-daily-sections{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:820px){.cc-daily-heading{align-items:start;display:grid}.cc-daily-heading>span{text-align:left}.cc-daily-sections{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:520px){.cc-daily-sections,.cc-founder-summary{grid-template-columns:1fr}}
@media (max-width:820px){.cc-sidebar-foot{display:flex;margin-top:10px;padding:9px 8px 0;font-size:10px}}
@media (prefers-reduced-motion:reduce){.cc-app[data-runtime-activity="active"] .cc-core-orbit,.cc-app[data-runtime-activity="active"] .cc-system-core:before{animation:none!important}}
.cc-runtime-usage{border-bottom:1px solid rgba(226,220,229,.1);border-top:1px solid rgba(226,220,229,.1);display:grid;gap:7px;grid-template-columns:repeat(5,minmax(0,1fr));margin-top:22px;padding:14px 0}.cc-runtime-usage div{display:grid;gap:3px;min-width:0}.cc-runtime-usage span{color:var(--ow-bronze);font-size:7px;letter-spacing:.06em;text-transform:uppercase}.cc-runtime-usage b{color:var(--ow-chrome-white);font-size:10px;font-weight:500;overflow-wrap:anywhere}.cc-runtime-ledger{display:grid;gap:8px;margin-top:22px}.cc-runtime-empty{color:var(--ow-chrome);font-size:9px;margin:0}.cc-runtime-job{background:rgba(0,0,0,.2);border:1px solid rgba(226,220,229,.09);border-left:2px solid rgba(231,200,146,.34);display:grid;gap:6px;padding:11px}.cc-runtime-job[data-status="FAILED"],.cc-runtime-job[data-status="DEAD_LETTER"],.cc-runtime-job[data-status="OPEN"]{border-left-color:var(--ow-danger)}.cc-runtime-job-head{align-items:baseline;display:flex;gap:12px;justify-content:space-between}.cc-runtime-job-head b{color:var(--ow-chrome-white);font-size:9px;font-weight:500;overflow-wrap:anywhere}.cc-runtime-job-head span,.cc-runtime-job small{color:var(--ow-chrome);font-size:8px;overflow-wrap:anywhere}.cc-runtime-job code{color:var(--ow-bronze);font:8px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}.cc-runtime-job .cc-control-button{justify-self:start;margin-top:4px}.cc-preview-actions .cc-panel-label{margin-top:12px}.cc-preview-actions .cc-panel-label:first-child{margin-top:0}
@media (max-width:820px){.cc-runtime-usage{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:520px){.cc-runtime-job-head{align-items:start;display:grid}.cc-runtime-usage{grid-template-columns:1fr}}
.cc-decision-inbox{background:linear-gradient(145deg,rgba(25,19,28,.76),rgba(8,6,10,.74));border:1px solid rgba(226,220,229,.18);box-shadow:0 24px 72px rgba(0,0,0,.28);margin-top:13px;padding:22px}.cc-decision-inbox-list{display:grid;gap:8px;margin-top:14px}.cc-decision-item{align-items:start;background:rgba(0,0,0,.2);border:1px solid rgba(226,220,229,.1);border-left:2px solid var(--ow-gold);display:grid;gap:7px;grid-template-columns:minmax(140px,.42fr) minmax(0,1.58fr);padding:12px 14px}.cc-decision-item[data-priority="HIGH"]{border-left-color:var(--ow-danger)}.cc-decision-item b{color:var(--ow-chrome-white);font-size:11px}.cc-decision-item p{color:var(--ow-chrome);font-size:10px;margin:0}.cc-decision-item small{color:var(--ow-cobalt-light);font:9px ui-monospace,SFMono-Regular,Menlo,monospace;grid-column:1/-1;overflow-wrap:anywhere}
@media (max-width:520px){.cc-decision-item{grid-template-columns:1fr}}

/* Onlyway Focus UI V1 — one calm workspace, four contexts, progressive detail. */
[hidden]{display:none!important}
:root{--focus-bg:#070708;--focus-surface:#121214;--focus-surface-2:#19191c;--focus-text:#f5f5f7;--focus-secondary:#a1a1a6;--focus-line:rgba(255,255,255,.1);--focus-blue:#2997ff;--focus-radius:22px;--focus-shadow:0 18px 55px rgba(0,0,0,.24)}
html{background:var(--focus-bg);scroll-behavior:auto}body{background:var(--focus-bg);color:var(--focus-text);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",Inter,"Segoe UI",sans-serif;font-size:15px;letter-spacing:-.006em}.cc-world{opacity:.055;transition:opacity .45s ease}.cc-app[data-active-view="team"] .cc-world{opacity:.14}.cc-world-image{background-size:cover;opacity:1}.cc-world-light{display:none}.cc-world-vignette{background:linear-gradient(180deg,rgba(7,7,8,.72),rgba(7,7,8,.94));box-shadow:none}
.cc-app,.cc-app[data-sidebar-state="compact"]{display:block;height:100dvh;min-height:100svh;overflow:hidden}.cc-sidebar{align-items:center;background:rgba(18,18,20,.74);border:0;border-bottom:1px solid var(--focus-line);box-shadow:none;display:grid;gap:24px;grid-template-columns:auto minmax(360px,1fr) auto auto;height:72px;inset:0 0 auto;padding:10px max(24px,calc((100vw - 1240px)/2));position:fixed;transform:none;width:auto;z-index:50;backdrop-filter:saturate(160%) blur(24px)}.cc-sidebar-head{min-height:0}.cc-brand{gap:9px;margin:0;padding:0}.cc-brand-mark{background:#f5f5f7;border:0;border-radius:11px;box-shadow:none;color:#050505;font:700 10px/1 -apple-system,BlinkMacSystemFont,sans-serif;height:34px;letter-spacing:-.02em;text-shadow:none;width:34px}.cc-brand b{background:none;color:var(--focus-text);font:650 13px/1 -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.02em}.cc-brand small{color:var(--focus-secondary);font-size:9px;letter-spacing:.08em;margin-top:3px}.cc-sidebar-toggle,.cc-mobile-menu,.cc-sidebar-backdrop{display:none!important}
.cc-nav,.cc-app[data-sidebar-state="compact"] .cc-nav{background:rgba(118,118,128,.16);border:1px solid rgba(255,255,255,.07);border-radius:15px;display:grid;gap:2px;grid-template-columns:repeat(4,minmax(80px,1fr));justify-self:center;margin:0;max-width:520px;padding:3px;width:100%}.cc-nav p{display:none}.cc-nav a,.cc-app[data-sidebar-state="compact"] .cc-nav a{align-items:center;background:transparent;border:0;border-radius:11px;color:var(--focus-secondary);display:flex;gap:7px;justify-content:center;min-height:36px;padding:7px 13px;position:relative;text-align:center;transition:background .18s ease,color .18s ease;white-space:nowrap}.cc-nav a:before,.cc-nav a:after{display:none!important}.cc-nav a:hover{background:rgba(255,255,255,.055);color:var(--focus-text)}.cc-nav a.is-active{background:rgba(255,255,255,.13);box-shadow:0 1px 5px rgba(0,0,0,.18);color:var(--focus-text)}.cc-nav-icon{color:currentColor;font-size:10px}.cc-nav-label,.cc-app[data-sidebar-state="compact"] .cc-nav-label{display:block;font-size:12px;font-weight:560;overflow:visible}.cc-sidebar-foot{border:0;color:var(--focus-secondary);font-size:11px;gap:7px;margin:0;padding:0;white-space:nowrap}.cc-live-dot{height:6px;width:6px}.cc-sidebar>.cc-operator{border:0;padding:0}.cc-sidebar .cc-avatar{background:rgba(255,255,255,.1);border:0;color:var(--focus-text);font-family:inherit;height:32px;width:32px}.cc-sidebar .cc-operator b{font-size:11px}.cc-sidebar .cc-operator small{font-size:9px}
.cc-main{height:100dvh;margin:0 auto;max-width:1240px;overflow-x:hidden;overflow-y:auto;padding:112px 30px 96px;scrollbar-gutter:stable;width:100%}.cc-topbar{align-items:end;border:0;display:grid;gap:28px;grid-template-columns:minmax(280px,1fr) minmax(520px,1.25fr);padding:0}.cc-command-title .cc-eyebrow{color:var(--focus-secondary);font-family:inherit;font-size:11px;font-weight:650;letter-spacing:.08em}.cc-command-title h1,.cc-topbar h1{background:none;color:var(--focus-text);font-family:inherit;font-size:clamp(38px,4.6vw,58px);font-weight:650;letter-spacing:-.055em;line-height:.96;margin:9px 0 0;text-shadow:none}.cc-topbar-subtitle{color:var(--focus-secondary);font-size:14px;line-height:1.45;margin:13px 0 0}.cc-status-rail{background:transparent;border:0;box-shadow:none;display:grid;gap:8px;grid-template-columns:repeat(5,minmax(0,1fr))}.cc-status-rail span{background:var(--focus-surface);border:1px solid var(--focus-line);border-radius:14px;color:var(--focus-secondary);font-size:10px;min-height:60px;padding:11px 12px}.cc-status-rail b{color:var(--focus-text);font-size:11px;margin-top:5px}.cc-status-rail .cc-lock{color:#ff9f0a}.cc-command{background:rgba(28,28,30,.8);border:1px solid var(--focus-line);border-radius:17px;box-shadow:none;margin:26px 0 0;min-height:52px;padding:0 16px}.cc-command:after{display:none}.cc-command:focus-within{border-color:rgba(41,151,255,.65);box-shadow:0 0 0 4px rgba(41,151,255,.12)}.cc-command input{font-size:14px;height:50px}.cc-command kbd{background:rgba(255,255,255,.06);border:0;border-radius:6px;color:var(--focus-secondary);padding:3px 7px}.cc-command-result{color:var(--focus-secondary);font-size:12px;margin:7px 4px 0;min-height:16px}
.cc-main>[data-primary-view]{animation:cc-view-in .32s cubic-bezier(.2,.75,.25,1) both}.cc-section,.cc-overview{margin-top:34px}.cc-section h3{font-family:inherit}.cc-section-heading{align-items:end;margin-bottom:18px}.cc-section-heading h2,.cc-studio-switcher h2,.cc-agent-hero h2{background:none;color:var(--focus-text);font-family:inherit;font-size:clamp(28px,3vw,40px);font-weight:650;letter-spacing:-.045em;line-height:1.02;margin:6px 0 0}.cc-kicker,.cc-panel-label,.cc-brief-label,.cc-eyebrow{color:var(--focus-secondary);font-weight:650;letter-spacing:.09em}.cc-section-note,.cc-section-heading time{color:var(--focus-secondary);font-size:12px}
.cc-tower-intro{background:linear-gradient(145deg,rgba(29,29,31,.92),rgba(15,15,17,.9));border:1px solid var(--focus-line);border-radius:30px;box-shadow:var(--focus-shadow);grid-template-columns:minmax(0,1.2fr) minmax(360px,.8fr);margin-top:26px;min-height:300px}.cc-tower-intro:before{background:linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent)}.cc-tower-intro:after{display:none}.cc-tower-copy{padding:clamp(34px,5vw,60px)}.cc-tower-copy h2{color:var(--focus-text);font-family:inherit;font-size:clamp(36px,4.8vw,58px);font-weight:650;letter-spacing:-.055em;line-height:.98;margin:15px 0 20px}.cc-tower-copy h2 em{color:var(--focus-text)}.cc-tower-copy>p:not(.cc-kicker){color:var(--focus-secondary);font-size:15px;line-height:1.55;max-width:620px}.cc-tower-pacts{gap:7px;margin-top:24px}.cc-tower-pacts span{background:rgba(255,255,255,.055);border:0;border-radius:999px;color:#d1d1d6;font-size:10px;letter-spacing:0;padding:8px 11px;text-transform:none}.cc-tower-command{border-left:1px solid var(--focus-line);grid-template-columns:120px 1fr;padding:34px}.cc-tower-seal{border-color:rgba(255,255,255,.2);max-width:118px}.cc-tower-seal span{font-family:inherit;font-size:34px;font-weight:650}.cc-tower-seal i{border-color:rgba(41,151,255,.22)}.cc-tower-rail div{border-bottom-color:var(--focus-line);padding:11px 0 11px 18px}.cc-tower-rail span,.cc-tower-rail small{font-size:10px;letter-spacing:0}.cc-tower-rail strong{font-family:inherit;font-size:22px;font-weight:620}
.cc-metrics{gap:9px;grid-template-columns:repeat(6,minmax(0,1fr));margin:0}.cc-metric,.cc-system-core,.cc-brief,.cc-decision-inbox,.cc-daily-console,.cc-evidence-panel,.cc-runtime-console,.cc-runtime-jobs,.cc-approval-panel,.cc-governance,.cc-preview,.cc-package-inspector,.cc-social-live,.cc-social-summary article,.cc-social-pack,.cc-approval-review,.cc-workday-console,.cc-agent-dossier{background:var(--focus-surface);border:1px solid var(--focus-line);border-radius:var(--focus-radius);box-shadow:none;backdrop-filter:none}.cc-metric{border-left:1px solid var(--focus-line);min-height:104px;padding:15px}.cc-metric:after{display:none}.cc-metric .cc-metric-label{font-size:11px}.cc-metric strong{font-family:inherit;font-size:26px;font-weight:620;margin:12px 0 7px}.cc-metric p{font-size:10px}.cc-hero-grid{gap:12px;grid-template-columns:minmax(280px,.7fr) minmax(360px,1.3fr);margin-top:12px}.cc-system-core{min-height:250px}.cc-brief{padding:30px}.cc-brief h2{background:none;color:var(--focus-text);font-family:inherit;font-size:27px;font-weight:620}.cc-brief strong{color:var(--focus-text);font-family:inherit;font-size:21px;font-weight:600}.cc-brief p{color:var(--focus-secondary);font-size:13px}.cc-decision-inbox,.cc-daily-console{margin-top:12px;padding:22px}.cc-decision-item{background:var(--focus-surface-2);border:0;border-radius:14px;grid-template-columns:minmax(150px,.4fr) minmax(0,1.6fr);padding:14px 16px}.cc-decision-item b{font-size:12px}.cc-decision-item p{color:var(--focus-secondary);font-size:12px}.cc-daily-sections{gap:9px}.cc-daily-section{background:var(--focus-surface-2);border:0;border-radius:14px;min-height:132px}.cc-daily-section p{font-size:11px}.cc-daily-section small{font-size:10px}
.cc-studio-switcher{align-items:end;background:linear-gradient(145deg,rgba(28,28,30,.96),rgba(17,17,19,.94));border:1px solid var(--focus-line);border-radius:28px;display:grid;gap:30px;grid-template-columns:1fr auto;margin-top:26px;padding:32px}.cc-studio-switcher h2{margin-top:8px}.cc-studio-switcher>div>p:not(.cc-kicker){color:var(--focus-secondary);font-size:13px;margin:12px 0 0}.cc-segmented-control{background:rgba(118,118,128,.18);border-radius:13px;display:flex;gap:2px;padding:3px}.cc-segmented-control button{background:transparent;border:0;border-radius:10px;color:var(--focus-secondary);font:560 12px/1 -apple-system,BlinkMacSystemFont,sans-serif;min-height:38px;padding:10px 14px}.cc-segmented-control button:hover{color:var(--focus-text)}.cc-segmented-control button[aria-selected="true"]{background:rgba(255,255,255,.14);box-shadow:0 1px 5px rgba(0,0,0,.22);color:var(--focus-text)}
.cc-production-layout{gap:14px;grid-template-columns:minmax(260px,.72fr) minmax(360px,1.28fr)}.cc-package-inspector{grid-column:1/-1;position:static}.cc-lane{border-top-color:var(--focus-line)}.cc-production-card{background:var(--focus-surface);border:1px solid var(--focus-line);border-left:1px solid var(--focus-line);border-radius:17px;box-shadow:none;padding:16px;transform:none}.cc-production-card:hover,.cc-production-card[aria-pressed="true"]{background:var(--focus-surface-2);border-color:rgba(41,151,255,.48);transform:none}.cc-preview{overflow:hidden;position:sticky;top:20px}.cc-preview-heading{border-bottom-color:var(--focus-line)}.cc-asset-frame{border-radius:18px}.cc-control-button,.cc-modal-button{background:#f5f5f7;border:0;border-radius:999px;box-shadow:none;color:#050505;font:600 12px/1 -apple-system,BlinkMacSystemFont,sans-serif;min-height:42px;padding:11px 16px}.cc-control-button:hover,.cc-modal-button:hover{filter:none;opacity:.88;transform:none}.cc-control-button[data-action="REJECT_CONTENT"]{background:#3a181c;color:#ffb4ba}.cc-control-button[data-action="APPROVE_CONTENT"],.cc-modal-button--approve{background:var(--focus-blue);color:white}.cc-modal-button--quiet{background:rgba(255,255,255,.1);color:var(--focus-text)}
.cc-social-live,.cc-social-pack,.cc-approval-review{padding:22px}.cc-social-live-head h3,.cc-social-pack-head h3,.cc-approval-review-head h3{color:var(--focus-text);font-family:inherit;font-size:24px;font-weight:620;letter-spacing:-.025em}.cc-social-live-grid div,.cc-social-block{background:var(--focus-surface-2);border:0;border-radius:13px;padding:12px}.cc-social-live-grid span,.cc-social-block span,.cc-social-summary span{font-size:10px;letter-spacing:0}.cc-social-block b{font-size:12px}.cc-social-block small,.cc-social-summary small,.cc-social-pack-head small{color:var(--focus-secondary);font-size:10px}.cc-social-summary{gap:8px}.cc-social-summary article{min-height:90px}.cc-social-pack{display:block}.cc-social-pack-head{border:0;padding:0}.cc-progressive-details{border-top:1px solid var(--focus-line);margin-top:17px;padding-top:4px}.cc-progressive-details>summary{align-items:center;color:var(--focus-blue);cursor:pointer;display:flex;font-size:12px;font-weight:580;justify-content:space-between;list-style:none;min-height:44px}.cc-progressive-details>summary::-webkit-details-marker{display:none}.cc-progressive-details>summary:after{content:"+";font-size:20px;font-weight:300}.cc-progressive-details[open]>summary:after{content:"−"}.cc-progressive-details-body{display:grid;gap:14px;padding-top:12px}.cc-progressive-details:not([open]) .cc-progressive-details-body{display:none}.cc-approval-review-head{border:0;padding:0}.cc-approval-gates span{border-radius:999px;font-size:10px;letter-spacing:0;padding:7px 10px}.cc-approval-review-grid{gap:9px}.cc-approval-review-code{background:var(--focus-surface-2);border:0;border-radius:12px;font-size:10px}.cc-visual-canvas{border:0;border-radius:16px;overflow:hidden}.cc-visual-canvas img{height:min(60vh,650px)}
.cc-evidence-grid{gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}.cc-evidence-panel{min-height:220px;padding:22px}.cc-list-item p{font-size:11px}.cc-runtime-grid{gap:12px}.cc-runtime-console,.cc-runtime-jobs{padding:25px}.cc-pipeline{gap:7px;grid-template-columns:repeat(5,minmax(0,1fr))}.cc-pipeline-link{display:none}.cc-pipeline-node{background:var(--focus-surface);border:1px solid var(--focus-line);border-radius:17px;min-height:120px;padding:16px}.cc-pipeline-node:before{border-radius:3px;left:15px;top:0;width:36px}
.cc-agent-hero{background:linear-gradient(145deg,rgba(29,29,31,.96),rgba(15,15,17,.92));border:1px solid var(--focus-line);border-radius:30px;grid-template-columns:minmax(0,1.4fr) minmax(320px,.6fr);padding:40px}.cc-agent-hero:after{display:none}.cc-agent-hero>div>p:not(.cc-kicker){color:var(--focus-secondary);font-size:14px}.cc-agent-hero-stats{gap:8px}.cc-agent-hero-stats div{background:rgba(255,255,255,.055);border:0;border-radius:14px;min-height:88px}.cc-agent-hero-stats strong{color:var(--focus-text);font-family:inherit;font-size:27px;font-weight:620}.cc-agent-toolbar{border-bottom-color:var(--focus-line)}.cc-agent-filters button{background:transparent;border:1px solid var(--focus-line);border-radius:999px;color:var(--focus-secondary);font-size:10px;min-height:36px;padding:8px 12px}.cc-agent-filters button[aria-pressed="true"]{background:#f5f5f7;border-color:#f5f5f7;color:#050505}.cc-agent-company-layout--apex{gap:14px;grid-template-columns:minmax(0,1.45fr) minmax(350px,.55fr)}.cc-agent-company-layout--apex .cc-agent-grid{gap:9px;grid-template-columns:repeat(3,minmax(0,1fr))}.cc-agent-company-layout--apex .cc-agent{background:var(--focus-surface);border:1px solid var(--focus-line);border-radius:18px;gap:12px;min-height:220px;padding:16px}.cc-agent-company-layout--apex .cc-agent:hover,.cc-agent-company-layout--apex .cc-agent:focus-visible,.cc-agent-company-layout--apex .cc-agent[aria-pressed="true"]{border-color:color-mix(in srgb,var(--apex-accent) 58%,white 2%);box-shadow:none}.cc-agent-emblem{border-radius:12px;width:40px}.cc-agent-emblem:after{display:none}.cc-agent-company-layout--apex .cc-agent h3{font-family:inherit;font-size:17px;font-weight:620}.cc-agent-mission{padding:10px 0}.cc-agent-mission p{font-size:11px!important}.cc-agent-card-stats{gap:5px}.cc-agent-card-stats div{min-height:34px}.cc-agent-power{display:none}.cc-agent-dossier{border-radius:22px;padding:20px}.cc-agent-dossier-head h3{font-family:inherit;font-size:23px;font-weight:620}.cc-workday-console{border-radius:22px;padding:20px}
.cc-governance{align-items:center;border-radius:22px;padding:24px}.cc-governance h2{background:none;color:var(--focus-text);font-family:inherit;font-size:25px;font-weight:620}.cc-lock-glyph{background:rgba(255,159,10,.1);border:0;color:#ff9f0a}.cc-authorization-dialog{background:#1c1c1e;border:1px solid var(--focus-line);border-radius:24px;max-width:580px}.cc-authorization-dialog:before{display:none}.cc-authorization-dialog h2{color:var(--focus-text);font-family:inherit;font-weight:650}
.cc-vault-metrics{display:grid;gap:9px;grid-template-columns:repeat(4,minmax(0,1fr))}.cc-vault-metrics article,.cc-vault-intelligence{background:var(--focus-surface);border:1px solid var(--focus-line);border-radius:18px;display:grid;gap:6px;padding:18px}.cc-vault-metrics span{color:var(--focus-secondary);font-size:11px}.cc-vault-metrics strong{font-size:27px;font-weight:620}.cc-vault-metrics small{color:var(--focus-secondary);font-size:10px}.cc-vault-shell{align-items:start;display:grid;gap:13px;grid-template-columns:minmax(0,1.45fr) minmax(320px,.55fr);margin-top:13px}.cc-vault-gallery-panel,.cc-vault-detail{background:var(--focus-surface);border:1px solid var(--focus-line);border-radius:22px;padding:20px}.cc-vault-toolbar{align-items:center;display:flex;gap:14px;justify-content:space-between}.cc-vault-toolbar>span{color:var(--focus-secondary);font-size:11px}.cc-vault-filters{display:flex;flex-wrap:wrap;gap:6px}.cc-vault-filters button{background:transparent;border:1px solid var(--focus-line);border-radius:999px;color:var(--focus-secondary);font:560 10px/1 -apple-system,BlinkMacSystemFont,sans-serif;min-height:34px;padding:8px 11px}.cc-vault-filters button[aria-pressed="true"]{background:#f5f5f7;border-color:#f5f5f7;color:#050505}.cc-vault-gallery{display:grid;gap:8px;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:16px}.cc-reference-card{background:var(--focus-surface-2);border:1px solid transparent;border-radius:16px;color:var(--focus-text);display:grid;gap:7px;min-height:164px;padding:15px;text-align:left}.cc-reference-card:hover,.cc-reference-card:focus-visible,.cc-reference-card[aria-pressed="true"]{border-color:rgba(41,151,255,.55);outline:0}.cc-reference-card[data-status="RIGHTS_BLOCKED"]{border-color:rgba(255,69,58,.35)}.cc-reference-kind{color:var(--focus-blue);font-size:10px;font-weight:650;text-transform:uppercase}.cc-reference-card strong{font-size:14px;line-height:1.25}.cc-reference-card small,.cc-reference-card p{color:var(--focus-secondary);font-size:10px;margin:0}.cc-vault-detail{position:sticky;top:20px}.cc-reference-detail-head{display:grid;gap:7px;grid-template-columns:1fr auto}.cc-reference-detail-head .cc-panel-label,.cc-reference-detail-head h3{grid-column:1}.cc-reference-detail-head .cc-agent-state{grid-column:2;grid-row:1/3}.cc-reference-detail-head h3{font-size:24px;letter-spacing:-.03em;margin:0}.cc-reference-purpose{color:var(--focus-secondary);font-size:12px;line-height:1.5;margin:15px 0 7px}.cc-vault-detail>small{color:var(--focus-secondary);font-size:10px}.cc-reference-metadata{display:grid;gap:1px;grid-template-columns:repeat(2,minmax(0,1fr));overflow:hidden}.cc-vault-datum{background:var(--focus-surface-2);display:grid;gap:5px;min-width:0;padding:11px}.cc-vault-datum span{color:var(--focus-secondary);font-size:9px;text-transform:none}.cc-vault-datum b{font-size:11px;font-weight:570;overflow-wrap:anywhere}.cc-vault-intelligence-grid{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:13px}.cc-vault-intelligence{min-height:190px}.cc-fingerprint-summary{display:grid;gap:1px;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:10px}.cc-vault-empty{color:var(--focus-secondary);font-size:12px;line-height:1.5}.cc-vault-decision-list{display:grid;gap:1px;margin-top:10px}.cc-vault-alerts{display:grid;gap:8px;margin-top:13px}.cc-vault-alert,.cc-vault-ok{background:rgba(255,159,10,.09);border:1px solid rgba(255,159,10,.18);border-radius:16px;padding:15px}.cc-vault-alert strong{color:#ffc56b;font-size:12px}.cc-vault-alert p,.cc-vault-ok{color:var(--focus-secondary);font-size:11px;margin:5px 0 0}.cc-vault-ok{background:rgba(48,209,88,.08);border-color:rgba(48,209,88,.17);margin:0}
.cc-vault-secondary-grid{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:13px}.cc-vault-compare-grid{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:10px}.cc-vault-compare-column{background:var(--focus-surface-2);border-radius:14px;display:grid;gap:7px;min-width:0;padding:13px}.cc-vault-compare-column>span{color:var(--focus-secondary);font-size:9px}.cc-vault-compare-column strong{font-size:12px;overflow-wrap:anywhere}.cc-vault-sequence-list{display:grid;gap:8px;margin-top:10px}.cc-vault-sequence{background:var(--focus-surface-2);border-radius:14px;padding:13px}.cc-vault-sequence summary{cursor:pointer;font-size:12px;font-weight:600;min-height:28px}.cc-vault-sequence ol{color:var(--focus-secondary);font-size:10px;margin:8px 0 0;padding-left:22px}.cc-vault-sequence li{padding:3px 0}
/* Revenue OS V1 — first viewport follows value creation, not dashboard chrome. */
.cc-revenue-hero{background:linear-gradient(145deg,rgba(29,29,31,.97),rgba(13,13,15,.95));border:1px solid var(--focus-line);border-radius:34px;box-shadow:var(--focus-shadow);display:grid;gap:0;grid-template-columns:minmax(0,1.08fr) minmax(430px,.92fr);isolation:isolate;margin-top:26px;min-height:390px;overflow:hidden;position:relative}.cc-revenue-hero:before{background:radial-gradient(circle at 12% 8%,rgba(41,151,255,.18),transparent 34%),radial-gradient(circle at 86% 82%,rgba(175,82,222,.12),transparent 38%);content:"";inset:0;pointer-events:none;position:absolute;z-index:-1}.cc-revenue-copy{align-content:center;display:grid;padding:clamp(38px,5vw,68px)}.cc-revenue-copy h2{color:var(--focus-text);font-family:inherit;font-size:clamp(45px,5.5vw,72px);font-weight:680;letter-spacing:-.064em;line-height:.94;margin:16px 0 23px;max-width:760px}.cc-revenue-copy h2 em{color:#b8d9ff;font-style:normal}.cc-revenue-copy>p:not(.cc-kicker){color:var(--focus-secondary);font-size:15px;line-height:1.6;margin:0;max-width:650px}.cc-revenue-actions{align-items:center;display:flex;flex-wrap:wrap;gap:18px;margin-top:28px}.cc-primary-link{align-items:center;background:#f5f5f7;border-radius:999px;color:#050505;display:inline-flex;font-size:12px;font-weight:650;gap:9px;min-height:44px;padding:12px 18px;text-decoration:none}.cc-primary-link:hover{opacity:.88}.cc-revenue-actions>span{color:var(--focus-secondary);font-size:11px}.cc-revenue-squad{display:flex;flex-wrap:wrap;gap:7px 18px;margin-top:32px}.cc-revenue-squad span{color:var(--focus-secondary);font-size:10px}.cc-revenue-squad b{color:var(--focus-text);font-size:11px;font-weight:650}.cc-revenue-pulse{align-content:center;background:rgba(8,8,10,.42);border-left:1px solid var(--focus-line);display:grid;gap:18px;padding:clamp(28px,4vw,46px)}.cc-revenue-pulse-head{align-items:start;display:flex;gap:20px;justify-content:space-between}.cc-revenue-pulse-head h3{color:var(--focus-text);font-family:inherit;font-size:25px;font-weight:650;letter-spacing:-.035em;margin:7px 0 0}.cc-revenue-state{background:rgba(255,159,10,.12);border:1px solid rgba(255,159,10,.22);border-radius:999px;color:#ffc568;font-size:9px;font-weight:680;letter-spacing:.06em;padding:7px 9px;white-space:nowrap}.cc-revenue-state[data-state="READY"]{background:rgba(48,209,88,.1);border-color:rgba(48,209,88,.2);color:#8ce9a5}.cc-revenue-state[data-state="REVIEW_REQUIRED"]{background:rgba(41,151,255,.12);border-color:rgba(41,151,255,.25);color:#82c5ff}.cc-revenue-metrics{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr))}.cc-revenue-metrics article{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.065);border-radius:16px;display:grid;gap:5px;min-height:106px;padding:15px}.cc-revenue-metrics span{color:var(--focus-secondary);font-size:10px}.cc-revenue-metrics strong{color:var(--focus-text);font-size:25px;font-weight:640;letter-spacing:-.035em}.cc-revenue-metrics small{color:var(--focus-secondary);font-size:9px;line-height:1.35}.cc-revenue-next{border-top:1px solid var(--focus-line);display:grid;gap:6px;padding-top:18px}.cc-revenue-next>span{color:#82c5ff;font-size:9px;font-weight:680;letter-spacing:.09em}.cc-revenue-next strong{color:var(--focus-text);font-size:16px;font-weight:620}.cc-revenue-next p{color:var(--focus-secondary);font-size:11px;line-height:1.45;margin:0}.cc-revenue-journey{background:var(--focus-surface);border:1px solid var(--focus-line);border-radius:24px;margin-top:12px;padding:20px 22px}.cc-revenue-journey-head{align-items:end;display:flex;gap:20px;justify-content:space-between}.cc-revenue-journey-head h3{color:var(--focus-text);font-family:inherit;font-size:20px;font-weight:650;letter-spacing:-.025em;margin:5px 0 0}.cc-revenue-journey-head>span{color:var(--focus-secondary);font-size:11px}.cc-revenue-stages{display:grid;gap:7px;grid-template-columns:repeat(7,minmax(0,1fr));margin-top:17px}.cc-revenue-stage{background:var(--focus-surface-2);border:1px solid transparent;border-radius:14px;display:grid;gap:5px;min-height:96px;padding:13px;position:relative}.cc-revenue-stage:before{background:#636366;border-radius:99px;content:"";height:4px;position:absolute;right:13px;top:13px;width:4px}.cc-revenue-stage[data-status="READY"]:before,.cc-revenue-stage[data-status="MEASURED"]:before{background:#30d158;box-shadow:0 0 0 4px rgba(48,209,88,.09)}.cc-revenue-stage[data-status="REVIEW_REQUIRED"]:before,.cc-revenue-stage[data-status="PLANNED"]:before{background:#2997ff;box-shadow:0 0 0 4px rgba(41,151,255,.09)}.cc-revenue-stage[data-status="BLOCKED"]:before{background:#ff453a}.cc-revenue-stage span{color:var(--focus-secondary);font-size:9px}.cc-revenue-stage strong{color:var(--focus-text);font-size:12px;font-weight:620}.cc-revenue-stage small{color:var(--focus-secondary);font-size:9px;line-height:1.35;margin-top:auto}.cc-revenue-readiness{background:linear-gradient(145deg,rgba(28,28,30,.96),rgba(17,17,19,.94));border:1px solid var(--focus-line);border-radius:24px;display:grid;gap:18px;grid-template-columns:minmax(230px,.55fr) minmax(0,1.45fr);margin-bottom:14px;padding:24px}.cc-revenue-readiness-copy h3{color:var(--focus-text);font-family:inherit;font-size:24px;font-weight:650;letter-spacing:-.035em;line-height:1.05;margin:8px 0}.cc-revenue-readiness-copy>p:not(.cc-panel-label){color:var(--focus-secondary);font-size:11px;line-height:1.5;margin:0}.cc-revenue-readiness-grid{display:grid;gap:7px;grid-template-columns:repeat(4,minmax(0,1fr))}.cc-readiness-card{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.065);border-radius:15px;display:grid;gap:6px;min-height:108px;padding:14px}.cc-readiness-card span{color:var(--focus-secondary);font-size:9px}.cc-readiness-card strong{color:var(--focus-text);font-size:13px;font-weight:620}.cc-readiness-card small{color:var(--focus-secondary);font-size:9px;line-height:1.4;margin-top:auto}.cc-readiness-card[data-status="READY"]{border-color:rgba(48,209,88,.18)}.cc-readiness-card[data-status="BLOCKED"]{border-color:rgba(255,69,58,.25)}.cc-readiness-card[data-status="REVIEW_REQUIRED"]{border-color:rgba(41,151,255,.25)}.cc-revenue-blockers{grid-column:1/-1}.cc-revenue-blocker{align-items:start;background:rgba(255,159,10,.08);border:1px solid rgba(255,159,10,.16);border-radius:14px;color:var(--focus-secondary);display:grid;font-size:10px;gap:5px;grid-template-columns:auto 1fr;padding:12px 14px}.cc-revenue-blocker b{color:#ffc568;font-size:10px}.cc-revenue-blocker p{margin:0}.cc-business-mission-card,.cc-opportunity-card,.cc-business-dossier,.cc-business-panel{border-radius:18px}.cc-business-mission-card{cursor:pointer}.cc-business-dossier{background:var(--focus-surface);border-color:var(--focus-line)}.cc-business-panel{background:var(--focus-surface-2);border:0;box-shadow:none}.cc-business-comparison{gap:9px}.cc-opportunity-card{background:var(--focus-surface);border-color:var(--focus-line);box-shadow:none}.cc-business-gate,.cc-business-scenario{border-radius:14px}
.cc-revenue-blocker+.cc-revenue-blocker{margin-top:6px}.cc-business-dossier>h3{font-family:inherit;font-size:26px;font-weight:640;letter-spacing:-.035em}.cc-business-lock-note{background:rgba(255,159,10,.08);border-radius:13px;color:#ffc568;font-size:10px;line-height:1.5;padding:11px 13px}.cc-business-panel h4{font-family:inherit;font-size:20px;font-weight:630;letter-spacing:-.025em}.cc-business-panel p:not(.cc-panel-label),.cc-business-panel small{color:var(--focus-secondary);font-size:11px;line-height:1.5}.cc-opportunity-card h3{font-family:inherit;font-weight:620}.cc-business-offer-summary,.cc-business-tier-list,.cc-business-channel-list,.cc-business-scenario-metrics{display:grid;gap:7px;grid-template-columns:repeat(2,minmax(0,1fr))}.cc-business-offer-summary .cc-business-datum,.cc-business-tier-list .cc-business-datum,.cc-business-channel-list .cc-business-datum,.cc-business-scenario-metrics .cc-business-datum{background:rgba(255,255,255,.035);border:0;border-radius:12px;padding:11px}.cc-business-datum span{font-size:10px}.cc-business-datum b{font-size:11px;overflow-wrap:anywhere}.cc-business-datum small{font-size:9px;line-height:1.4;overflow-wrap:anywhere}.cc-business-detail-stack{display:grid;gap:14px}.cc-business-list-block{background:rgba(255,255,255,.03);border-radius:13px;padding:13px}.cc-business-list-block ul{color:var(--focus-secondary);display:grid;font-size:11px;gap:7px;line-height:1.45;margin:9px 0 0;padding-left:19px}.cc-business-scenario{align-content:start}.cc-business-scenario>.cc-progressive-details{margin-top:8px}.cc-business-scenario-metrics{grid-template-columns:1fr}.cc-experiment-list{display:grid;gap:8px}.cc-experiment-card{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.06);border-radius:14px;display:grid;gap:7px;padding:14px}.cc-experiment-card>span{color:#82c5ff;font-size:9px;font-weight:650}.cc-experiment-card>strong{font-size:13px}.cc-experiment-card>p,.cc-experiment-card>small{color:var(--focus-secondary);font-size:10px;margin:0}.cc-experiment-card>b{color:#ffc568;font-size:9px;font-weight:650}.cc-artifact-list span{border-radius:999px;font-size:9px;text-transform:none}
.cc-revenue-download{color:#82c5ff;display:inline-flex;font-size:11px;font-weight:620;gap:7px;margin-top:15px;text-decoration:none}.cc-revenue-download:hover{text-decoration:underline}
@keyframes cc-view-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.cc-main>[data-primary-view]{animation:none!important}}
@media (max-width:1100px){.cc-sidebar{grid-template-columns:auto minmax(340px,1fr) auto}.cc-sidebar>.cc-operator{display:none}.cc-topbar{grid-template-columns:1fr}.cc-status-rail{grid-template-columns:repeat(5,minmax(0,1fr))}.cc-revenue-hero{grid-template-columns:1fr}.cc-revenue-pulse{border-left:0;border-top:1px solid var(--focus-line)}.cc-revenue-stages{display:flex;overflow-x:auto;scroll-snap-type:x proximity}.cc-revenue-stage{flex:0 0 155px;scroll-snap-align:start}.cc-revenue-readiness{grid-template-columns:1fr}.cc-agent-company-layout--apex{grid-template-columns:1fr}.cc-agent-side{grid-template-columns:repeat(2,minmax(0,1fr))}.cc-agent-company-layout--apex .cc-agent-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.cc-vault-shell{grid-template-columns:1fr}.cc-vault-detail{position:static}}
@media (max-width:820px){body{padding-bottom:calc(76px + env(safe-area-inset-bottom))}.cc-app,.cc-app[data-sidebar-state="compact"]{height:auto;min-height:100svh;overflow:visible}.cc-sidebar{background:rgba(18,18,20,.88);display:flex;height:56px!important;justify-content:space-between;padding:8px 16px;position:fixed;transform:none!important;width:100%}.cc-sidebar-head{display:flex}.cc-brand-mark{border-radius:10px;height:32px;width:32px}.cc-brand-copy small{display:none}.cc-sidebar-foot{font-size:0}.cc-sidebar-foot-label{display:none!important}.cc-sidebar>.cc-operator{display:none}.cc-nav,.cc-app[data-sidebar-state="compact"] .cc-nav{background:rgba(24,24,26,.94);border:1px solid rgba(255,255,255,.12);border-radius:20px;bottom:calc(8px + env(safe-area-inset-bottom));box-shadow:0 16px 44px rgba(0,0,0,.38);display:grid;grid-template-columns:repeat(4,1fr);left:10px;margin:0;max-width:none;padding:4px;position:fixed;right:10px;width:auto;z-index:70;backdrop-filter:saturate(160%) blur(24px)}.cc-nav a,.cc-app[data-sidebar-state="compact"] .cc-nav a{display:grid;gap:2px;grid-template-columns:1fr;justify-items:center;min-height:54px;padding:6px 4px}.cc-nav-icon{font-size:11px}.cc-nav-label,.cc-app[data-sidebar-state="compact"] .cc-nav-label{font-size:10px}.cc-main{height:auto;min-height:100svh;overflow:visible;padding:82px 16px 110px}.cc-topbar{display:block}.cc-command-title h1,.cc-topbar h1{font-size:38px}.cc-topbar-subtitle{font-size:13px}.cc-status-rail{display:flex;gap:7px;margin-top:20px;overflow-x:auto;padding-bottom:4px;scroll-snap-type:x proximity}.cc-status-rail span{flex:0 0 142px;min-height:58px;scroll-snap-align:start}.cc-command{margin-top:18px}.cc-revenue-hero{border-radius:26px;margin-top:20px;min-height:0}.cc-revenue-copy{padding:34px 24px}.cc-revenue-copy h2{font-size:44px}.cc-revenue-pulse{padding:26px 22px}.cc-revenue-journey{padding:18px}.cc-revenue-journey-head{align-items:start;display:grid}.cc-revenue-readiness{padding:20px}.cc-revenue-readiness-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cc-metrics{display:flex;overflow-x:auto;padding-bottom:4px;scroll-snap-type:x proximity}.cc-metric{flex:0 0 154px;scroll-snap-align:start}.cc-hero-grid,.cc-runtime-grid{grid-template-columns:1fr}.cc-system-core{display:none}.cc-section{margin-top:28px}.cc-section-heading{align-items:start;display:grid;gap:8px}.cc-decision-item{grid-template-columns:1fr}.cc-daily-sections{grid-template-columns:1fr}.cc-studio-switcher{align-items:start;border-radius:24px;display:grid;grid-template-columns:1fr;padding:24px 20px}.cc-segmented-control{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));overflow-x:auto;width:100%}.cc-segmented-control button{min-width:0;padding:10px 6px}.cc-production-layout,.cc-app[data-sidebar-state="compact"] .cc-production-layout{grid-template-columns:1fr}.cc-preview,.cc-package-inspector{position:static}.cc-social-summary{display:flex;overflow-x:auto}.cc-social-summary article{flex:0 0 158px}.cc-social-live-grid,.cc-social-grid,.cc-approval-review-grid{grid-template-columns:1fr}.cc-visual-review-canvases{display:flex;overflow-x:auto;scroll-snap-type:x mandatory}.cc-visual-canvas{flex:0 0 88%;scroll-snap-align:center}.cc-evidence-grid{grid-template-columns:1fr}.cc-pipeline{display:flex;overflow-x:auto}.cc-pipeline-node{flex:0 0 170px}.cc-agent-hero{border-radius:24px;grid-template-columns:1fr;padding:26px 20px}.cc-agent-company-layout--apex .cc-agent-grid{display:flex;overflow-x:auto;scroll-snap-type:x proximity}.cc-agent-company-layout--apex .cc-agent{flex:0 0 82%;min-height:210px;scroll-snap-align:start}.cc-agent-side{grid-template-columns:1fr}.cc-authorization{padding:12px}.cc-authorization-dialog{border-radius:22px;height:auto;max-height:calc(100dvh - 24px);overflow:auto}.cc-control-button{min-height:44px}.cc-progressive-details>summary{min-height:48px}}
@media (max-width:820px){.cc-vault-metrics{display:flex;overflow-x:auto}.cc-vault-metrics article{flex:0 0 170px}.cc-vault-toolbar{align-items:start;display:grid}.cc-vault-filters{flex-wrap:nowrap;max-width:100%;overflow-x:auto}.cc-vault-filters button{white-space:nowrap}.cc-vault-gallery{display:flex;overflow-x:auto;scroll-snap-type:x proximity}.cc-reference-card{flex:0 0 72%;scroll-snap-align:start}.cc-vault-intelligence-grid{grid-template-columns:1fr}.cc-reference-metadata{grid-template-columns:1fr}}
@media (max-width:820px){.cc-business-offer-summary,.cc-business-tier-list,.cc-business-channel-list{grid-template-columns:1fr}.cc-revenue-blocker{grid-template-columns:1fr}.cc-business-panel{padding:16px}}
@media (max-width:820px){.cc-sidebar{backdrop-filter:none!important;overflow:visible!important}.cc-nav,.cc-app[data-sidebar-state="compact"] .cc-nav{justify-self:stretch;width:calc(100vw - 20px)}.cc-agent-company-layout--apex{grid-template-columns:minmax(0,1fr)}.cc-agent-roster,.cc-agent-company-layout--apex .cc-agent-grid,.cc-agent-company-layout--apex .cc-agent,.cc-agent-card-head,.cc-agent-identity{min-width:0}.cc-agent-company-layout--apex .cc-agent{max-width:100%;overflow:hidden}.cc-vault-secondary-grid{grid-template-columns:1fr}.cc-vault-filters button{min-height:44px}}
@media (max-width:430px){.cc-status-rail span{flex-basis:132px}.cc-revenue-copy h2{font-size:38px}.cc-revenue-actions{align-items:start;display:grid}.cc-revenue-metrics,.cc-revenue-readiness-grid{grid-template-columns:1fr}.cc-revenue-squad{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.cc-segmented-control{grid-template-columns:repeat(2,minmax(0,1fr))}.cc-approval-review-head,.cc-approval-review-foot,.cc-visual-review-head{display:grid}.cc-visual-canvas{flex-basis:92%}.cc-agent-company-layout--apex .cc-agent{flex-basis:90%}.cc-agent-hero-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.cc-reference-card{flex-basis:88%}.cc-fingerprint-summary{grid-template-columns:1fr}.cc-vault-compare-grid{grid-template-columns:1fr}}

/* ORACLE Creative Connector — one governed prompt, explicit capabilities. */
.cc-oracle-composer{align-items:start;border-radius:24px;display:grid;gap:12px 14px;grid-template-columns:auto minmax(0,1fr) auto;padding:15px 17px 17px}.cc-oracle-composer .cc-oracle-mark{align-items:center;background:linear-gradient(145deg,rgba(41,151,255,.2),rgba(175,82,222,.15));border:1px solid rgba(130,190,255,.22);border-radius:12px;color:#b8d9ff;display:flex;font-size:10px;font-weight:750;height:38px;justify-content:center;letter-spacing:.08em;margin-top:2px;width:38px}.cc-oracle-composer textarea{background:transparent;border:0;color:var(--focus-text);font:500 14px/1.5 Inter,ui-sans-serif,system-ui,sans-serif;max-height:150px;min-height:48px;outline:0;padding:8px 0;resize:vertical;width:100%}.cc-oracle-composer textarea::placeholder{color:var(--focus-secondary)}.cc-oracle-composer kbd{margin-top:10px}.cc-oracle-controls{align-items:end;border-top:1px solid var(--focus-line);display:grid;gap:12px;grid-column:1/-1;grid-template-columns:minmax(180px,.8fr) minmax(150px,.55fr) minmax(0,1.65fr) auto;padding-top:14px}.cc-oracle-select{color:var(--focus-secondary);display:grid;font-size:9px;gap:6px;letter-spacing:.04em}.cc-oracle-select select{appearance:none;background:var(--focus-surface-2);border:1px solid var(--focus-line);border-radius:12px;color:var(--focus-text);font:500 11px/1.2 Inter,ui-sans-serif,system-ui,sans-serif;height:44px;max-width:100%;padding:0 34px 0 12px}.cc-oracle-deliverables{border:0;display:flex;flex-wrap:wrap;gap:6px;margin:0;min-width:0;padding:0}.cc-oracle-deliverables legend{color:var(--focus-secondary);font-size:9px;letter-spacing:.04em;margin-bottom:6px;padding:0;width:100%}.cc-oracle-deliverables label{align-items:center;background:rgba(255,255,255,.045);border:1px solid var(--focus-line);border-radius:999px;color:var(--focus-secondary);display:flex;font-size:9px;gap:6px;min-height:30px;padding:5px 9px;white-space:nowrap}.cc-oracle-deliverables input{accent-color:#2997ff;margin:0}.cc-oracle-actions{display:flex;gap:7px}.cc-oracle-actions button{border-radius:999px;cursor:pointer;font:650 10px/1 Inter,ui-sans-serif,system-ui,sans-serif;min-height:44px;padding:0 15px;white-space:nowrap}.cc-oracle-context{background:transparent;border:1px solid var(--focus-line);color:var(--focus-text)}.cc-oracle-submit{background:#f5f5f7;border:1px solid #f5f5f7;color:#050505}.cc-oracle-actions button:disabled{cursor:wait;opacity:.55}.cc-oracle-composer[aria-busy="true"]{border-color:rgba(41,151,255,.45)}.cc-command-help{color:var(--focus-secondary);font-size:10px;line-height:1.45;margin:2px 3px 0}.cc-command-result{color:#b8d9ff}
@media (max-width:1100px){.cc-oracle-controls{grid-template-columns:repeat(2,minmax(0,1fr))}.cc-oracle-deliverables,.cc-oracle-actions{grid-column:1/-1}.cc-oracle-actions{justify-content:flex-end}}
@media (max-width:820px){.cc-oracle-composer{border-radius:20px;grid-template-columns:auto minmax(0,1fr);padding:13px}.cc-oracle-composer kbd{display:none}.cc-oracle-controls{grid-template-columns:1fr}.cc-oracle-deliverables,.cc-oracle-actions{grid-column:auto}.cc-oracle-deliverables{flex-wrap:nowrap;overflow-x:auto;padding-bottom:3px}.cc-oracle-deliverables label{flex:0 0 auto;min-height:36px}.cc-oracle-actions{display:grid;grid-template-columns:1fr 1fr}.cc-oracle-actions button{width:100%}}
@media (max-width:430px){.cc-oracle-composer{grid-template-columns:1fr}.cc-oracle-composer .cc-oracle-mark{display:none}.cc-oracle-composer textarea{min-height:72px}.cc-oracle-actions{grid-template-columns:1fr}.cc-command-help{padding:0 3px}}
.cc-oracle-deliverables label{font-size:10px;min-height:44px;padding:7px 11px}.cc-oracle-deliverables input:disabled{opacity:.72}
.cc-tiktok-motion-preview{background:linear-gradient(155deg,rgba(41,151,255,.1),rgba(175,82,222,.08));border:1px solid var(--focus-line);border-radius:18px;display:grid;gap:10px;margin-top:12px;overflow:hidden;padding:15px}.cc-tiktok-motion-preview-head{align-items:center;display:flex;gap:12px;justify-content:space-between}.cc-tiktok-motion-preview-head span{color:var(--focus-secondary);font-size:9px;letter-spacing:.07em}.cc-tiktok-motion-preview-head button{background:#f5f5f7;border:0;border-radius:999px;color:#050505;cursor:pointer;font:650 10px/1 Inter,ui-sans-serif,system-ui,sans-serif;min-height:38px;padding:9px 13px}.cc-tiktok-motion-beats{display:grid;gap:6px}.cc-tiktok-motion-beat{background:rgba(255,255,255,.045);border-radius:11px;color:var(--focus-secondary);display:grid;font-size:10px;gap:4px;padding:9px 11px}.cc-tiktok-motion-beat b{color:var(--focus-text);font-size:11px}.cc-tiktok-motion-marker{color:#ff9f0a!important;font:8px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
@media (max-width:820px){.cc-oracle-deliverables label{min-height:44px}}
.cc-venture-today,.cc-venture-health,.cc-venture-workspace{background:var(--focus-surface);border:1px solid var(--focus-line);border-radius:var(--focus-radius)}.cc-venture-today{margin-top:18px;padding:22px}.cc-venture-today-head{align-items:end;display:flex;gap:20px;justify-content:space-between}.cc-venture-today-head h3{font:650 24px/1.1 -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:-.035em;margin:6px 0 0}.cc-venture-today-head a{color:#82c5ff;font-size:11px;font-weight:620;text-decoration:none}.cc-venture-today-grid{display:grid;gap:8px;grid-template-columns:repeat(6,minmax(0,1fr));margin-top:17px}.cc-venture-pulse-card{background:var(--focus-surface-2);border-radius:14px;display:grid;gap:6px;min-height:100px;padding:13px}.cc-venture-pulse-card span{color:var(--focus-secondary);font-size:9px}.cc-venture-pulse-card strong{color:var(--focus-text);font-size:18px;font-weight:620;overflow-wrap:anywhere}.cc-venture-pulse-card small{color:var(--focus-secondary);font-size:9px;line-height:1.4}.cc-venture-today-next{border-top:1px solid var(--focus-line);color:var(--focus-secondary);font-size:11px;line-height:1.5;margin-top:15px;padding-top:13px}.cc-venture-today-next b{color:var(--focus-text);font-weight:620}.cc-venture-health{display:grid;gap:8px;grid-template-columns:minmax(0,1fr) auto;margin-bottom:14px;padding:17px}.cc-venture-health strong{font-size:14px}.cc-venture-health p{color:var(--focus-secondary);font-size:11px;margin:0}.cc-venture-health span{align-self:start;border:1px solid var(--focus-line);border-radius:999px;color:#ff9f0a;font-size:9px;padding:7px 10px}.cc-venture-tool-tabs{background:rgba(118,118,128,.18);border-radius:15px;display:grid;gap:3px;grid-template-columns:repeat(4,minmax(0,1fr));padding:4px}.cc-venture-tool-tabs button{background:transparent;border:0;border-radius:11px;color:var(--focus-secondary);cursor:pointer;font:560 11px/1.2 -apple-system,BlinkMacSystemFont,sans-serif;min-height:44px;padding:9px}.cc-venture-tool-tabs button:hover{color:var(--focus-text)}.cc-venture-tool-tabs button[aria-selected="true"]{background:rgba(255,255,255,.14);box-shadow:0 1px 5px rgba(0,0,0,.22);color:var(--focus-text)}.cc-venture-workspace{margin-top:11px;min-width:0;padding:22px}.cc-venture-panel-content{display:grid;gap:10px}.cc-venture-summary-grid{display:grid;gap:9px;grid-template-columns:repeat(3,minmax(0,1fr))}.cc-venture-card{background:var(--focus-surface-2);border:1px solid rgba(255,255,255,.055);border-radius:15px;display:grid;gap:7px;min-width:0;padding:15px}.cc-venture-card[data-attention="true"]{border-left:2px solid #ff9f0a}.cc-venture-card span{color:#82c5ff;font-size:9px;font-weight:650;letter-spacing:.035em}.cc-venture-card strong{font-size:13px;overflow-wrap:anywhere}.cc-venture-card p,.cc-venture-card small{color:var(--focus-secondary);font-size:10px;line-height:1.45;margin:0;overflow-wrap:anywhere}.cc-venture-empty{color:var(--focus-secondary);display:grid;font-size:12px;min-height:150px;place-items:center;text-align:center}.cc-venture-lock{border-top:1px solid var(--focus-line);color:#ff9f0a;font-size:9px;margin-top:4px;padding-top:10px}
@media (max-width:1100px){.cc-venture-today-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.cc-segmented-control{flex-wrap:wrap}.cc-venture-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:820px){.cc-venture-today-grid{display:flex;overflow-x:auto;scroll-snap-type:x proximity}.cc-venture-pulse-card{flex:0 0 150px;scroll-snap-align:start}.cc-venture-tool-tabs{display:flex;max-width:100%;overflow-x:auto}.cc-venture-tool-tabs button{flex:0 0 145px}.cc-venture-workspace{padding:16px}.cc-venture-summary-grid{grid-template-columns:1fr}.cc-venture-health{grid-template-columns:1fr}.cc-venture-tool-tabs button{min-height:48px}}
@media (max-width:430px){.cc-venture-today,.cc-venture-workspace{max-width:100%;overflow:hidden}.cc-venture-today-head{align-items:start;display:grid}.cc-venture-tool-tabs{max-width:calc(100vw - 32px)}}
`;

export const COMMAND_CENTER_CLIENT_JS = `
(() => {
  "use strict";
  const root = document.getElementById("command-center");
  const commandForm = document.getElementById("command-form");
  const commandInput = document.getElementById("command-input");
  const commandBusinessMission = document.getElementById("command-business-mission");
  const commandNavigate = document.getElementById("command-navigate");
  const commandObjective = document.getElementById("command-objective");
  const commandResult = document.getElementById("command-result");
  const commandSubmit = document.getElementById("command-submit");
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
  const reducedMotionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  const mobileSidebar = window.matchMedia ? window.matchMedia("(max-width: 820px)") : { matches: false };
  const AGENT_IDENTITIES = Object.freeze({
    "onlyway-assistant": { callSign: "NEXUS", glyph: "OW", squad: "COMMAND", squadLabel: "Mission Command" },
    "research-agent": { callSign: "ORACLE", glyph: "OR", squad: "INTELLIGENCE", squadLabel: "Intelligence" },
    "business-agent": { callSign: "VECTOR", glyph: "VE", squad: "INTELLIGENCE", squadLabel: "Intelligence" },
    "content-director": { callSign: "PRISM", glyph: "PR", squad: "STUDIO", squadLabel: "Creative Studio" },
    "content-producer": { callSign: "FORGE", glyph: "FO", squad: "STUDIO", squadLabel: "Creative Studio" },
    "sales-agent": { callSign: "PULSE", glyph: "PU", squad: "GROWTH", squadLabel: "Growth" },
    "customer-delivery-agent": { callSign: "BRIDGE", glyph: "BR", squad: "GROWTH", squadLabel: "Growth" },
    "knowledge-curator": { callSign: "ARCHIVE", glyph: "AR", squad: "INTELLIGENCE", squadLabel: "Intelligence" },
    "developer-agent": { callSign: "TITAN", glyph: "TI", squad: "BUILD", squadLabel: "Build Lab" },
    "finance-cost-analyst": { callSign: "LEDGER", glyph: "LE", squad: "GROWTH", squadLabel: "Growth" },
    "legal-risk-reviewer": { callSign: "AEGIS", glyph: "AE", squad: "GROWTH", squadLabel: "Growth" },
    "quality-guardian": { callSign: "PRIME", glyph: "QP", squad: "GUARDIANS", squadLabel: "Guardians" },
    "risk-guardian": { callSign: "SENTINEL", glyph: "RS", squad: "GUARDIANS", squadLabel: "Guardians" },
    "cost-guardian": { callSign: "SCALE", glyph: "CS", squad: "GUARDIANS", squadLabel: "Guardians" },
    "security-guardian": { callSign: "CIPHER", glyph: "SC", squad: "GUARDIANS", squadLabel: "Guardians" },
    "backup-guardian": { callSign: "VAULT", glyph: "BV", squad: "GUARDIANS", squadLabel: "Guardians" },
    "publisher-agent": { callSign: "LAUNCH", glyph: "LA", squad: "GROWTH", squadLabel: "Growth" },
  });
  const state = { agentFilter: "ALL", confirmationInertedNodes: [], confirmationInterval: null, csrfToken: null, eventSource: null, lastEventSequence: 0, liveFallbackInterval: null, liveRefreshTimer: null, mediaFactory: null, mobileReturnFocus: null, pendingConfirmation: null, refreshInFlight: null, refreshQueued: false, returnFocus: null, selectedAgentId: null, selectedBusinessMissionId: null, selectedProductionId: null, selectedReferenceId: null, selectedWorkdayId: null, sidebarState: "expanded", slideIndex: 0, snapshot: null, vaultFilter: "ALL", ventureTool: "radar", visualReview: null, visualSlideIndex: 0 };

  function byId(id) { return document.getElementById(id); }
  function text(id, value) { const element = byId(id); if (element) element.textContent = value; }
  function element(tag, className, value) { const node = document.createElement(tag); if (className) node.className = className; if (value !== undefined) node.textContent = value; return node; }
  function emitMotion(name, detail) { window.dispatchEvent(new CustomEvent("onlyway:motion:" + name, { detail })); }
  function number(value) { return new Intl.NumberFormat("it-IT").format(value); }
  function prefersReducedMotion() { return Boolean(reducedMotionQuery.matches); }
  function timestamp(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Data locale non disponibile" : new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(date); }
  function statusLabel(value) { const labels = { ACTIVE: "ATTIVO", ATTENTION_REQUIRED: "ATTENZIONE RICHIESTA", AVAILABLE: "DISPONIBILE", AWAITING_DEPENDENCY: "IN ATTESA DI DIPENDENZA", AWAITING_FABIO: "IN ATTESA DI FABIO", BLOCKED: "BLOCCATO", COMPLETED: "COMPLETATO", DEGRADED: "DEGRADATO", DISABLED: "DISABILITATA", ENABLED: "ABILITATA", IMPLEMENTING: "IN IMPLEMENTAZIONE", LOCKED: "BLOCCATO", MEASURED: "MISURATO", MISSING: "NON REGISTRATO", NOT_AVAILABLE: "NON DISPONIBILE", NOT_OBSERVED: "NON OSSERVATO", NOT_REGISTERED: "NON REGISTRATO", PLANNED: "PIANIFICATO", QUEUED: "IN CODA", READY: "PRONTO", REVIEW_REQUIRED: "REVISIONE RICHIESTA", RUNNING: "IN ESECUZIONE", SETUP_REQUIRED: "CONFIGURAZIONE RICHIESTA", SPECIFIED: "SPECIFICATO", STALE: "SCADUTO", TRIGGERED: "ATTIVATO", UNAVAILABLE: "NON DISPONIBILE", VALIDATION_PLANNED: "VALIDAZIONE PIANIFICATA" }; return labels[value] || value.replaceAll("_", " "); }
  function statusLane(status) { if (status === "PENDING_FABIO_APPROVAL") return "REVISIONE FABIO"; if (status === "APPROVED_FOR_SCHEDULING") return "APPROVATI"; if (status === "SCHEDULED") return "CALENDARIO"; if (status === "BLOCKED") return "BLOCCATI DAL RISCHIO"; return "ARCHIVIATI"; }
  function agentIdentity(agentId) { return AGENT_IDENTITIES[agentId] || { callSign: agentId.toLocaleUpperCase("it-IT"), glyph: "AI", squad: "BUILD", squadLabel: "Build Lab" }; }

  function refresh() {
    if (state.refreshInFlight) { state.refreshQueued = true; return state.refreshInFlight; }
    const execution = (async () => {
      try {
        const [response, visualResponse, mediaFactoryResponse] = await Promise.all([fetch("/api/overview", { cache: "no-store", credentials: "same-origin" }), fetch("/api/social-visual-review", { cache: "no-store", credentials: "same-origin" }), fetch("/api/brand-media-factory", { cache: "no-store", credentials: "same-origin" })]);
        if (!response.ok) throw new Error("L'API locale del Centro di Comando non è disponibile.");
        state.snapshot = await response.json();
        state.visualReview = visualResponse.ok ? await visualResponse.json() : null;
        state.mediaFactory = mediaFactoryResponse.ok ? await mediaFactoryResponse.json() : null;
        render(state.snapshot);
      } catch (error) {
        root.dataset.apiState = "error";
        text("system-status", "API LOCALE NON DISPONIBILE");
        text("core-status", "IN ATTESA");
        text("core-detail", "L'API locale non ha potuto leggere il sistema di registrazione.");
        text("brief-decision", "È richiesta la connessione all'API locale");
        text("brief-detail", error instanceof Error ? error.message : "L'API locale non è raggiungibile.");
      }
    })();
    state.refreshInFlight = execution;
    void execution.finally(() => {
      state.refreshInFlight = null;
      if (state.refreshQueued) { state.refreshQueued = false; scheduleLiveRefresh(); }
    });
    return execution;
  }

  function setLiveEventState(status, label) {
    const target = byId("live-event-state");
    if (target) target.dataset.liveState = status;
    text("live-event-status", label);
  }

  function scheduleLiveRefresh() {
    if (state.liveRefreshTimer !== null) window.clearTimeout(state.liveRefreshTimer);
    state.liveRefreshTimer = window.setTimeout(() => {
      state.liveRefreshTimer = null;
      void refresh();
    }, 180);
  }

  function acceptLiveCursor(event) {
    const id = event.lastEventId;
    if (typeof id !== "string" || !/^(?:0|[1-9]\\d{0,15})$/.test(id)) return false;
    const sequence = Number(id);
    if (!Number.isSafeInteger(sequence) || sequence <= state.lastEventSequence) return false;
    state.lastEventSequence = sequence;
    return true;
  }

  function startLiveFallback() {
    if (state.liveFallbackInterval !== null) return;
    void refresh();
    state.liveFallbackInterval = window.setInterval(() => { void refresh(); }, 30000);
  }

  function stopLiveFallback() {
    if (state.liveFallbackInterval === null) return;
    window.clearInterval(state.liveFallbackInterval);
    state.liveFallbackInterval = null;
  }

  function connectLiveEvents() {
    if (!("EventSource" in window)) {
      setLiveEventState("unavailable", "Eventi live non supportati");
      startLiveFallback();
      return;
    }
    setLiveEventState("connecting", "Eventi live · connessione");
    const source = new EventSource("/api/events");
    state.eventSource = source;
    source.addEventListener("open", () => {
      stopLiveFallback();
      setLiveEventState("live", "Eventi live · connessi");
      void refresh();
    });
    source.addEventListener("operational", (event) => {
      if (!acceptLiveCursor(event)) return;
      try {
        const payload = JSON.parse(event.data);
        const statuses = { APPROVAL_REQUESTED: "AWAITING_FABIO", JOB_BLOCKED: "BLOCKED", JOB_COMPLETED: "COMPLETED", JOB_DEAD_LETTER: "BLOCKED", JOB_FAILED: "BLOCKED", JOB_LEASE_ACQUIRED: "RUNNING", JOB_QUEUED: "QUEUED" };
        emitMotion("operational", { eventId: payload.eventId, eventType: payload.eventType, sequence: Number(event.lastEventId), status: statuses[payload.eventType] || "IDLE" });
      } catch { emitMotion("stop", { reasonCode: "INVALID_REDACTED_EVENT" }); }
      scheduleLiveRefresh();
    });
    source.addEventListener("cursor_reset", (event) => {
      const id = event.lastEventId;
      if (typeof id === "string" && /^(?:0|[1-9]\\d{0,15})$/.test(id)) {
        const sequence = Number(id);
        if (Number.isSafeInteger(sequence)) state.lastEventSequence = sequence;
      }
      setLiveEventState("live", "Eventi live · stato riallineato");
      emitMotion("stop", { reasonCode: "EVENT_CURSOR_RESET" });
      scheduleLiveRefresh();
    });
    source.addEventListener("source_unavailable", () => {
      setLiveEventState("reconnecting", "Eventi live · riconnessione");
      emitMotion("stop", { reasonCode: "EVENT_SOURCE_UNAVAILABLE" });
      startLiveFallback();
    });
    source.addEventListener("shutdown", () => {
      setLiveEventState("reconnecting", "Eventi live · arresto controllato");
      emitMotion("stop", { reasonCode: "COMMAND_CENTER_SHUTDOWN" });
      startLiveFallback();
    });
    source.addEventListener("error", () => {
      setLiveEventState("reconnecting", "Eventi live · riconnessione");
      emitMotion("stop", { reasonCode: "EVENT_RECONNECTING" });
      startLiveFallback();
    });
  }

  function render(snapshot) {
    const productionCoverage = snapshot.overview.operationalWindow && snapshot.overview.operationalWindow.productions ? snapshot.overview.operationalWindow.productions.status : "LIMIT_REACHED";
    const approvalCoverageLimited = isApprovalCoverageLimited(snapshot);
    root.dataset.apiState = "ready";
    root.dataset.runtimeActivity = snapshot.runtime.counts.running > 0 ? "active" : "idle";
    text("system-status", statusLabel(snapshot.overview.system));
    text("autonomy-status", snapshot.overview.autonomy);
    text("runtime-location", "LOCALE");
    text("decisions-required", snapshot.overview.decisionInboxCoverage === "LIMIT_REACHED" ? "≥ " + number(snapshot.overview.decisionsRequired) : number(snapshot.overview.decisionsRequired));
    text("core-status", statusLabel(snapshot.overview.system));
    text("core-detail", snapshot.overview.system === "ATTENTION_REQUIRED" ? "Readiness bloccata: verificare blocker, incidenti, copertura e runtime prima di procedere." : snapshot.runtime.continuousWorker === "NOT_REGISTERED" ? "Control plane durevole pronto; nessun worker continuativo registrato." : "Il control plane durevole è disponibile.");
    text("generated-at", "Aggiornato " + timestamp(snapshot.generatedAt));
    text("brief-decision", snapshot.overview.dailyBrief.decision);
    text("brief-detail", snapshot.overview.dailyBrief.detail);
    text("brief-priority", snapshot.overview.dailyBrief.priority);
    renderMetrics(snapshot.overview.metrics);
    renderDecisionInbox(snapshot.overview.decisionInbox || [], snapshot.overview.decisionInboxCoverage || "LIMIT_REACHED");
    renderVentureStudio(snapshot.venture || unavailableVentureView());
    renderDailyOperatingBrief(snapshot.dailyOperatingBriefs || []);
    renderPipeline(snapshot);
    renderRevenue(snapshot.revenue || null);
    renderOracleMissionOptions(snapshot.oracleBusinessMissions || snapshot.business || [], snapshot.overview && snapshot.overview.operationalWindow ? snapshot.overview.operationalWindow.businessMissions : null);
    renderBusiness(snapshot.business || []);
    renderSocialIntelligence(snapshot.socialIntelligence || { blocked: 0, coverage: "LIMIT_REACHED", expiringWithin24Hours: 0, packs: [], readyForFabio: 0, requiresResearch: 0 }, snapshot.socialLive);
    renderProductions(snapshot.productions, productionCoverage);
    renderEvidence(snapshot.evidence);
    renderReferenceVault(snapshot.referenceVault || { assets: [], businessContext: null, decisions: [], missingInputs: ["Nessun riferimento importato"], outcomeLinks: [], rightsBlockers: [], visualFingerprint: null, writingFingerprint: null });
    renderRuntime(snapshot.runtime, snapshot.controls || { incidents: [], targets: [] });
    renderTeamPulse(snapshot.agents);
    renderAgents(snapshot.agents);
    renderAgentWorkdays(snapshot.agentCompany || []);
    renderFounderWorkday(snapshot.founderWorkdays || []);
    renderApprovals(snapshot.productions, snapshot.business || [], snapshot.socialLive, state.visualReview, state.mediaFactory, approvalCoverageLimited);
  }

  function isApprovalCoverageLimited(snapshot) {
    const windows = snapshot && snapshot.overview ? snapshot.overview.operationalWindow : null;
    return !windows || [windows.agentCompanyWorkdays, windows.businessMissions, windows.productions].some((window) => !window || window.status === "LIMIT_REACHED");
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

  function renderDecisionInbox(items, coverage) {
    const target = byId("decision-inbox-list");
    target.replaceChildren();
    text("decision-inbox-meta", coverage === "LIMIT_REACHED" ? "Copertura parziale · almeno " + number(items.length) + " decisione/i" : items.length === 0 ? "Nessuna decisione corrente" : number(items.length) + " decisione/i correnti e deduplicate");
    if (items.length === 0) {
      target.append(element("div", "cc-list-empty", coverage === "LIMIT_REACHED" ? "Nessuna decisione nella finestra osservata; la copertura è parziale e il totale globale non è determinabile." : "Nessuna decisione operativa corrente. Gli snapshot storici non vengono ricontati."));
      return;
    }
    for (const item of items) {
      const row = element("article", "cc-decision-item");
      row.dataset.priority = item.priority;
      row.append(
        element("b", "", statusLabel(item.entityType)),
        element("p", "", item.question),
        element("small", "", item.priority + " · " + item.reasonCode + " · " + item.entityId),
      );
      target.append(row);
    }
  }

  function unavailableVentureView() {
    return { artifacts: [], briefs: [], capital: { approvedCents: "NOT_AVAILABLE", proposedCents: "NOT_AVAILABLE" }, capitalProposals: [], coverage: "NOT_AVAILABLE", decisions: [], experiments: [], externalActions: "LOCKED", health: { nextAction: "Registra la Founder Venture Policy e le evidenze ammesse.", reasonCode: "VENTURE_PORTFOLIO_NOT_AVAILABLE", status: "NOT_AVAILABLE" }, opportunities: [], portfolio: null, publication: "LOCKED", summaries: { blockedVentures: 0, capacity: "NOT_AVAILABLE", founderDecisions: 0, portfolioRiskCount: 0, readyExperiments: 0, venturesInProgress: 0 }, ventures: [] };
  }

  function renderVentureStudio(venture) {
    const health = byId("venture-health");
    health.replaceChildren();
    const copy = element("div", "");
    copy.append(element("strong", "", statusLabel(venture.health.status) + " · " + venture.health.reasonCode), element("p", "", venture.health.nextAction));
    health.append(copy, element("span", "", "ESTERNO " + venture.externalActions + " · PUBBLICAZIONE " + venture.publication));

    const pulse = byId("venture-today-grid");
    pulse.replaceChildren();
    const capacity = typeof venture.summaries.capacity === "number" ? number(venture.summaries.capacity) : statusLabel(venture.summaries.capacity);
    const proposed = moneyOrUnavailable(venture.capital.proposedCents);
    const pulseItems = [
      ["Portfolio health", statusLabel(venture.health.status), venture.health.reasonCode],
      ["Venture in corso", number(venture.summaries.venturesInProgress), number(venture.summaries.blockedVentures) + " bloccate"],
      ["Decisioni Fabio", number(venture.summaries.founderDecisions), venture.coverage === "LIMIT_REACHED" ? "copertura parziale" : "version-bound"],
      ["Esperimenti pronti", number(venture.summaries.readyExperiments), "nessuna osservazione simulata"],
      ["Capitale proposto", proposed, "CAPITAL_ALLOCATION_PROPOSAL"],
      ["Capacità", capacity, number(venture.summaries.portfolioRiskCount) + " rischi aggregati"],
    ];
    for (const item of pulseItems) pulse.append(venturePulseCard(item[0], item[1], item[2]));
    const next = byId("venture-today-next");
    next.replaceChildren(element("b", "", "Prossima azione · "), document.createTextNode(venture.health.nextAction));

    renderVentureEntities("radar", venture.opportunities, (item) => [statusLabel(item.outcome) + " · " + statusLabel(item.demand), item.title, item.evidenceRefs.length + " evidence ref · expiry " + item.expiry]);
    renderVentureEntities("pipeline", venture.ventures, (item) => [statusLabel(item.stage), item.title, item.blockerCodes.length === 0 ? "Nessun blocker registrato" : item.blockerCodes.join(" · ")]);
    renderVenturePortfolio(venture);
    renderVentureEntities("capital", venture.capitalProposals, (item) => [statusLabel(item.status), item.title, moneyOrUnavailable(item.amountCents) + " · " + statusLabel(item.currency) + " · PROPOSAL ONLY"]);
    renderVentureEntities("experiments", venture.experiments, (item) => [statusLabel(item.status), item.title, statusLabel(item.observation) + " · venture " + item.ventureId]);
    renderVentureDossier(venture);
    renderVentureEntities("assets", venture.artifacts, (item) => [statusLabel(item.reviewState), item.title, item.artifactKind + " · " + item.allowedUse]);
    renderVentureDecisions(venture.decisions, venture.coverage);
  }

  function venturePulseCard(label, value, detail) {
    const card = element("article", "cc-venture-pulse-card");
    card.append(element("span", "", label), element("strong", "", value), element("small", "", detail));
    return card;
  }

  function moneyOrUnavailable(value) {
    return Number.isSafeInteger(value) ? euro(value) : statusLabel(typeof value === "string" ? value : "NOT_AVAILABLE");
  }

  function renderVentureEntities(tool, values, project) {
    const target = root.querySelector('[data-venture-content="' + tool + '"]');
    if (!target) return;
    target.replaceChildren();
    if (!Array.isArray(values) || values.length === 0) {
      target.append(element("div", "cc-venture-empty", "Nessun record durevole disponibile. Il sistema non crea attività, domanda o risultati dimostrativi."));
      return;
    }
    const grid = element("div", "cc-venture-summary-grid");
    for (const item of values) {
      const projected = project(item);
      const card = element("article", "cc-venture-card");
      card.append(element("span", "", projected[0]), element("strong", "", projected[1]), element("p", "", projected[2]), element("small", "", "v" + String(item.version) + " · " + item.entityId + " · " + item.fingerprint.slice(0, 12)));
      grid.append(card);
    }
    target.append(grid, element("div", "cc-venture-lock", "INTERNAL_PACKAGE_ONLY · EXTERNAL_ACTION_LOCKED · PUBLICATION_LOCKED"));
  }

  function renderVenturePortfolio(venture) {
    const target = root.querySelector('[data-venture-content="portfolio"]');
    if (!target) return;
    target.replaceChildren();
    if (!venture.portfolio) {
      target.append(element("div", "cc-venture-empty", "Portfolio non disponibile. Nessuna concentrazione, capitale o capacità viene dedotta."));
      return;
    }
    const grid = element("div", "cc-venture-summary-grid");
    grid.append(
      venturePulseCard("Portfolio", venture.portfolio.title, "v" + String(venture.portfolio.version)),
      venturePulseCard("Capitale approvato", moneyOrUnavailable(venture.capital.approvedCents), "solo decisioni durevoli"),
      venturePulseCard("Rischi aggregati", number(venture.summaries.portfolioRiskCount), "nessun rischio nascosto"),
    );
    target.append(grid, element("div", "cc-venture-lock", "EXTERNAL_ACTION_LOCKED · nessuna Venture viene attivata automaticamente"));
  }

  function renderVentureDossier(venture) {
    const combined = [...venture.ventures, ...venture.briefs];
    renderVentureEntities("dossier", combined, (item) => [item.briefKind ? statusLabel(item.briefKind) : statusLabel(item.stage), item.title, item.briefKind ? number(item.founderDecisions) + " decisioni · " + number(item.riskCount) + " rischi" : item.blockerCodes.length + " blocker"]);
  }

  function renderVentureDecisions(decisions, coverage) {
    const target = root.querySelector('[data-venture-content="decisions"]');
    if (!target) return;
    target.replaceChildren();
    if (!Array.isArray(decisions) || decisions.length === 0) {
      target.append(element("div", "cc-venture-empty", coverage === "LIMIT_REACHED" ? "Nessuna decisione nella finestra osservata; copertura parziale." : "Nessuna decisione Founder aperta."));
      return;
    }
    const grid = element("div", "cc-venture-summary-grid");
    for (const decision of decisions) {
      const card = element("article", "cc-venture-card"); card.dataset.attention = "true";
      card.append(element("span", "", decision.priority + " · " + decision.reasonCode), element("strong", "", decision.question), element("p", "", statusLabel(decision.entityType) + " · " + decision.entityId), element("small", "", "v" + String(decision.entityVersion) + " · " + decision.entityFingerprint.slice(0, 12) + " · revisione Fabio richiesta"));
      grid.append(card);
    }
    target.append(grid, element("div", "cc-venture-lock", "Questa vista non approva, non spende e non avvia esperimenti esterni."));
  }

  function renderRevenue(revenue) {
    const target = revenue && revenue.targetMonthlyRevenueCents ? revenue.targetMonthlyRevenueCents : { reasonCode: "BUSINESS_CONTEXT_REQUIRED", status: "NOT_AVAILABLE" };
    const plan = revenue && revenue.plannedRevenueCents ? revenue.plannedRevenueCents : { reasonCode: "ECONOMICS_INPUT_REQUIRED", status: "NOT_AVAILABLE" };
    const margin = revenue && revenue.contributionMarginCents ? revenue.contributionMarginCents : { reasonCode: "ECONOMICS_INPUT_REQUIRED", status: "NOT_AVAILABLE" };
    const pipeline = revenue && revenue.verifiedPipelineCents ? revenue.verifiedPipelineCents : { reasonCode: "PIPELINE_AGGREGATE_NOT_AVAILABLE", status: "NOT_AVAILABLE" };
    const stateValue = revenue ? revenue.state : "SETUP_REQUIRED";
    const stateNode = byId("revenue-state");
    if (stateNode) { stateNode.textContent = statusLabel(stateValue); stateNode.dataset.state = stateValue; }
    renderRevenueMetric("revenue-target", "revenue-target-note", target, "Target esplicito di Fabio");
    renderRevenueMetric("revenue-plan", "revenue-plan-note", plan, "Previsione del piano BASE, non ricavo effettivo");
    renderRevenueMetric("revenue-margin", "revenue-margin-note", margin, "Margine del piano BASE, non risultato effettivo");
    renderRevenueMetric("revenue-pipeline", "revenue-pipeline-note", pipeline, "Solo opportunità con valore e probabilità verificati");
    text("revenue-next-title", revenue ? revenue.nextAction.label : "Completa il Revenue Input Pack");
    text("revenue-next-detail", revenue ? revenue.nextAction.detail : "Definisci target, offerta, prezzo, capacità e canale prima di attivare esperimenti.");
    text("revenue-hero-assurance", revenue && revenue.coverage === "LIMIT_REACHED" ? "Copertura parziale: nessun totale globale viene dedotto." : "Nessuna metrica economica viene inventata.");
    const primaryLink = root.querySelector(".cc-primary-link");
    if (primaryLink && revenue) { primaryLink.href = revenue.nextAction.href; primaryLink.firstChild.textContent = revenue.nextAction.label + " "; }

    const stages = byId("revenue-stage-list");
    stages.replaceChildren();
    for (const item of revenue && Array.isArray(revenue.stages) ? revenue.stages : []) {
      const card = element("article", "cc-revenue-stage"); card.dataset.status = item.status;
      card.append(element("span", "", statusLabel(item.status)), element("strong", "", item.label), element("b", "", item.value), element("small", "", item.detail));
      stages.append(card);
    }
    if (stages.childElementCount === 0) stages.append(element("div", "cc-list-empty", "Revenue View non disponibile: nessun numero sostitutivo è stato mostrato."));

    const readiness = byId("revenue-readiness-grid");
    readiness.replaceChildren();
    for (const item of revenue && Array.isArray(revenue.readiness) ? revenue.readiness : []) {
      const card = element("article", "cc-readiness-card"); card.dataset.status = item.status;
      card.append(element("span", "", statusLabel(item.status)), element("strong", "", item.label), element("small", "", item.detail));
      readiness.append(card);
    }
    if (readiness.childElementCount === 0) readiness.append(element("div", "cc-list-empty", "Revenue readiness non disponibile."));
    text("revenue-readiness-summary", revenue ? statusLabel(revenue.state) + " · " + revenue.reasonCode + (revenue.coverage === "LIMIT_REACHED" ? " · COPERTURA PARZIALE" : "") : "CONFIGURAZIONE RICHIESTA · BUSINESS_MISSION_REQUIRED");

    const blockers = byId("revenue-blockers");
    blockers.replaceChildren();
    for (const item of revenue && Array.isArray(revenue.blockers) ? revenue.blockers : []) {
      const row = element("article", "cc-revenue-blocker");
      row.append(element("b", "", item.reasonCode), element("p", "", item.detail));
      blockers.append(row);
    }
  }

  function renderRevenueMetric(valueId, noteId, metric, availableNote) {
    const available = metric && metric.status === "AVAILABLE" && Number.isSafeInteger(metric.valueCents);
    text(valueId, available ? euro(metric.valueCents) : "NON DISPONIBILE");
    text(noteId, available ? availableNote : statusLabel(metric && metric.reasonCode ? metric.reasonCode : "NOT_AVAILABLE"));
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
    dossier.append(element("p", "cc-panel-label", "REVENUE MISSION · DRAFT INTERNO"), element("h3", "", selected.selectionExplanation), element("p", "cc-business-lock-note", "Approvazione Business ≠ autorizzazione esterna. Invio, contatto, spesa e pubblicazione restano BLOCCATI."));
    const summary = element("div", "cc-business-summary");
    summary.append(businessDatum("Stato", statusLabel(selected.status), "DUREVOLE"), businessDatum("Versione", "v" + String(selected.version), "ESATTA"), businessDatum("Artefatti", String(selected.artifacts.length), "FINGERPRINTED"), businessDatum("Azioni esterne", "0", "BLOCCATE")); dossier.append(summary);
    const gates = element("div", "cc-business-gates"); for (const gate of selected.gates) gates.append(businessGate(gate)); dossier.append(gates);
    const offer = selected.commercialPlan.offer;
    const offerPanel = renderOfferPanel(offer); dossier.append(offerPanel);
    dossier.append(renderFunnelPanel(selected.commercialPlan.acquisition));
    const economics = element("section", "cc-business-panel"); economics.append(element("p", "cc-panel-label", "ECONOMICS DETERMINISTICO"), element("h4", "", "Tre scenari. Nessun input nascosto."), element("p", "", "I valori sono previsioni del piano, non fatturato o margine effettivo."));
    const scenarioGrid = element("div", "cc-scenario-grid"); for (const scenario of selected.economics) scenarioGrid.append(businessScenario(scenario)); economics.append(scenarioGrid); dossier.append(economics);
    dossier.append(renderExperimentsPanel(selected.commercialPlan.validation));
    dossier.append(renderDeliveryPanel(offer));
    dossier.append(renderCommercialArtifacts(selected.artifacts));
    if (selected.status === "PENDING_FABIO_APPROVAL") {
      const actions = element("div", "cc-business-actions");
      actions.append(businessAction("Approva dossier", "APPROVE_BUSINESS", selected), businessAction("Richiedi revisione", "REQUEST_BUSINESS_REVISION", selected), businessAction("Rifiuta dossier", "REJECT_BUSINESS", selected)); dossier.append(actions);
    }
  }

  function renderOracleMissionOptions(missions, coverage) {
    const current = commandBusinessMission.value;
    const approved = missions.filter((mission) => mission.status === "APPROVED" && mission.selectedOpportunityId);
    commandBusinessMission.replaceChildren();
    if (approved.length === 0) {
      const option = document.createElement("option"); option.value = ""; option.textContent = coverage && coverage.status === "LIMIT_REACHED" ? "Nessuna missione APPROVED nella finestra corrente" : "Prima approva una Business Mission"; commandBusinessMission.append(option);
      commandBusinessMission.disabled = true; commandSubmit.disabled = true;
      return;
    }
    for (const mission of approved) {
      const option = document.createElement("option"); option.value = mission.mission.missionId; option.textContent = mission.mission.objective + " · " + mission.selectedOpportunityId; commandBusinessMission.append(option);
    }
    const preferred = approved.some((mission) => mission.mission.missionId === current) ? current : approved.some((mission) => mission.mission.missionId === state.selectedBusinessMissionId) ? state.selectedBusinessMissionId : approved[0].mission.missionId;
    commandBusinessMission.value = preferred; commandBusinessMission.disabled = false; commandSubmit.disabled = false;
  }

  function businessDatum(label, value, meta) { const item = element("div", "cc-business-datum"); item.append(element("span", "", label), element("b", "", value), element("small", "", meta)); return item; }
  function businessGate(gate) { const item = element("article", "cc-business-gate"); item.dataset.status = gate.status; item.append(element("span", "", gate.name), element("strong", "", String(gate.score) + "/100"), element("small", "", gate.findings.length === 0 ? "Nessun blocco" : gate.findings.join(" · "))); return item; }
  function businessScenario(scenario) {
    const item = element("article", "cc-business-scenario");
    item.append(element("span", "", scenario.name), element("b", "", scenario.contributionMarginCents.value === undefined ? "NON DISPONIBILE" : euro(scenario.contributionMarginCents.value)), element("small", "", "Margine di contribuzione pianificato"));
    const metrics = element("div", "cc-business-scenario-metrics");
    metrics.append(
      businessDatum("Ricavi piano", moneyValue(scenario.revenueCents), scenario.revenueCents.formula),
      businessDatum("Ricavi netti piano", moneyValue(scenario.netRevenueCents), scenario.netRevenueCents.formula),
      businessDatum("Margine lordo", moneyValue(scenario.grossMarginCents), scenario.grossMarginCents.formula),
      businessDatum("Break-even", countValue(scenario.breakEvenClients), scenario.breakEvenClients.formula),
      businessDatum("CAC massimo", moneyValue(scenario.maximumSustainableCacCents), scenario.maximumSustainableCacCents.formula),
      businessDatum("Payback", decimalValue(scenario.paybackMonths, " mesi"), scenario.paybackMonths.formula),
    );
    item.append(businessDisclosure("Apri formule e sensibilità", metrics, scenario.sensitivity));
    return item;
  }
  function renderOfferPanel(offer) {
    const panel = element("section", "cc-business-panel");
    panel.append(element("p", "cc-panel-label", "OFFERTA"), element("h4", "", offer.promisedOutcome), element("p", "", offer.positioning));
    const summary = element("div", "cc-business-offer-summary");
    summary.append(businessDatum("Cliente ideale", offer.idealCustomer, "ICP DICHIARATO"), businessDatum("Problema", offer.primaryProblem, "PROBLEMA DICHIARATO"), businessDatum("Meccanismo", offer.mechanism, "COME VIENE CREATO VALORE"), businessDatum("Differenziazione", offer.differentiation, "PERCHÉ ONLYWAY"));
    const body = element("div", "cc-business-detail-stack");
    body.append(summary, businessList("Deliverable", offer.deliverables), businessList("Bonus", offer.bonuses), businessList("Limiti", offer.limits), businessList("Esclusioni cliente", offer.customerExclusions));
    const tiers = element("div", "cc-business-tier-list");
    for (const tier of offer.tiers) tiers.append(businessDatum(tier.name, tier.priceCents === undefined ? "NON DISPONIBILE" : euro(tier.priceCents), tier.deliverables.join(" · ")));
    body.append(element("p", "cc-panel-label", "TIER E PREZZI"), tiers, businessList("Obiezioni", offer.objections.map((item) => item.objection + " → " + item.response)));
    panel.append(businessDisclosure("Apri struttura completa dell'offerta", body));
    return panel;
  }
  function renderFunnelPanel(acquisition) {
    const panel = element("section", "cc-business-panel");
    panel.append(element("p", "cc-panel-label", "FUNNEL & SALES SYSTEM"), element("h4", "", acquisition.landingCopy.headline), element("p", "", acquisition.landingCopy.subheadline), element("small", "", "CTA DRAFT · " + acquisition.landingCopy.callToAction));
    const body = element("div", "cc-business-detail-stack");
    const channels = element("div", "cc-business-channel-list");
    for (const channel of [...acquisition.channels].sort((left, right) => left.priority - right.priority)) channels.append(businessDatum("Priorità " + String(channel.priority) + " · " + channel.channel, channel.message, "DRAFT INTERNO · INVIO BLOCCATO"));
    body.append(element("p", "cc-panel-label", "CANALI"), channels, businessList("Sequenza email", acquisition.emailSequence.map((item) => item.subject + " — " + item.body)), businessList("Supporto social", acquisition.socialSupport), businessList("FAQ", acquisition.faq.map((item) => item.question + " → " + item.answer)), businessDatum("Outreach", acquisition.outreachScript, "DRAFT INTERNO · CONTATTO BLOCCATO"));
    panel.append(businessDisclosure("Apri funnel, messaggi e obiezioni", body));
    return panel;
  }
  function renderExperimentsPanel(experiments) {
    const panel = element("section", "cc-business-panel");
    const budget = experiments.reduce((sum, experiment) => sum + experiment.maxCostCents, 0);
    panel.append(element("p", "cc-panel-label", "EXPERIMENT ENGINE"), element("h4", "", String(experiments.length) + " esperimento/i pianificati"), element("p", "", "Budget massimo dichiarato: " + euro(budget) + ". Stato: PIANIFICATO, non eseguito."));
    const list = element("div", "cc-experiment-list");
    for (const experiment of experiments) {
      const card = element("article", "cc-experiment-card");
      card.append(element("span", "", experiment.method + " · " + String(experiment.durationDays) + " giorni"), element("strong", "", experiment.hypothesis), element("p", "", "Audience: " + experiment.audience), element("small", "", "METRICA · " + experiment.primaryMetric + " · SOGLIA · " + experiment.minimumThreshold), element("small", "", "STOP · " + experiment.stopCondition + " · NEXT · " + experiment.nextDecision), element("b", "", "PIANIFICATO · AZIONE ESTERNA BLOCCATA"));
      list.append(card);
    }
    panel.append(businessDisclosure("Apri ipotesi, soglie e stop condition", list));
    return panel;
  }
  function renderDeliveryPanel(offer) {
    const panel = element("section", "cc-business-panel");
    panel.append(element("p", "cc-panel-label", "DELIVERY SYSTEM"), element("h4", "", "Consegna definita prima della vendita"), element("p", "", offer.guarantee));
    const body = element("div", "cc-business-detail-stack");
    body.append(businessList("Cosa viene consegnato", offer.deliverables), businessList("Confini operativi", offer.limits), businessList("Richieste escluse", offer.customerExclusions), businessDatum("Capacità verificata", "NON DISPONIBILE", "DELIVERY_RUN_NOT_AVAILABLE"));
    panel.append(businessDisclosure("Apri scope e protezioni della consegna", body));
    return panel;
  }
  function renderCommercialArtifacts(artifacts) {
    const panel = element("section", "cc-business-panel");
    panel.append(element("p", "cc-panel-label", "COMMERCIAL ASSET FACTORY"), element("h4", "", String(artifacts.length) + " artefatti fingerprinted"), element("p", "", "Tutti gli artefatti sono draft interni: nessun invio o pubblicazione."));
    const list = element("div", "cc-artifact-list");
    for (const artifact of artifacts) list.append(element("span", "", artifact.kind.replaceAll("_", " ") + " · " + artifact.mediaType));
    panel.append(list);
    return panel;
  }
  function businessDisclosure(label, content, notes) {
    const details = element("details", "cc-progressive-details");
    const body = element("div", "cc-progressive-details-body"); body.append(content);
    if (Array.isArray(notes) && notes.length > 0) body.append(businessList("Sensibilità", notes));
    details.append(element("summary", "", label), body); return details;
  }
  function businessList(label, items) {
    const block = element("div", "cc-business-list-block"); block.append(element("p", "cc-panel-label", label));
    const list = element("ul", ""); for (const item of items) list.append(element("li", "", item)); block.append(list); return block;
  }
  function moneyValue(metric) { return metric && metric.value !== undefined ? euro(metric.value) : "NON DISPONIBILE"; }
  function countValue(metric) { return metric && metric.value !== undefined ? number(metric.value) : "NON DISPONIBILE"; }
  function decimalValue(metric, suffix) { return metric && metric.value !== undefined ? String(metric.value) + suffix : "NON DISPONIBILE"; }
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
    text("social-daily-status", social.coverage === "LIMIT_REACHED" ? "Copertura social parziale · segnali e readiness non conclusivi" : social.packs.length > 0 ? number(social.packs.length) + " pacchetto/i verificabile/i" : live && live.totalTrends > 0 ? number(live.totalTrends) + " segnali live · ciclo " + statusLabel(live.cycleReadiness.status) : "Dati social non ancora disponibili");
    if (social.packs.length === 0) {
      list.append(element("div", "cc-list-empty", social.coverage === "LIMIT_REACHED" ? "Nessun Social Publishing Pack nella finestra osservata; la copertura è parziale e il totale globale non è determinabile." : "Nessun Social Publishing Pack durevole. Trend, hashtag, audio e orari non vengono mostrati finché non esistono segnali autorizzati."));
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
      const disclosure = element("details", "cc-progressive-details");
      disclosure.append(element("summary", "", "Apri analisi completa"), grid);
      card.append(head, disclosure); list.append(card);
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
    const disclosure = element("details", "cc-progressive-details");
    const disclosureBody = element("div", "cc-progressive-details-body");
    disclosureBody.append(grid, candidate, competitorPack, element("p", "cc-social-missing", missing + experiment + cycle), downloads);
    disclosure.append(element("summary", "", "Dati, fonti e piano sperimentale"), disclosureBody);
    target.append(head, disclosure);
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

  function renderProductions(productions, coverage) {
    const target = byId("production-lanes");
    target.replaceChildren();
    if (productions.length === 0) {
      const empty = element("div", "cc-list-empty");
      empty.textContent = coverage === "LIMIT_REACHED" ? "Nessun pacchetto nella finestra osservata; la copertura è parziale e il totale globale non è determinabile." : "Nessun pacchetto Metodo Veloce durevole è stato creato. Il primo apparirà qui solo dopo la persistenza del suo record di produzione reale.";
      target.append(empty);
      state.selectedProductionId = null;
      renderPreview(null);
      return;
    }
    if (!productions.some((item) => item.productionId === state.selectedProductionId)) state.selectedProductionId = productions[0].productionId;
    const laneNames = ["REVISIONE RICHIESTA", "REVISIONE FABIO", "APPROVATI", "CALENDARIO", "BLOCCATI DAL RISCHIO", "ARCHIVIATI"];
    for (const laneName of laneNames) {
      const records = productions.filter((item) => effectiveStatusLane(item) === laneName);
      const lane = element("section", "cc-lane");
      const heading = element("div", "cc-lane-head");
      heading.append(element("b", "", laneName), element("span", "", number(records.length)));
      lane.append(heading);
      if (records.length === 0) lane.append(element("p", "cc-lane-empty", coverage === "LIMIT_REACHED" ? "Nessun dato in questa fase nella finestra osservata; copertura parziale." : "Nessun dato persistito in questa fase."));
      for (const record of records) lane.append(productionCard(record));
      target.append(lane);
    }
    renderPreview(productions.find((item) => item.productionId === state.selectedProductionId) || null);
  }

  function effectiveStatusLane(record) {
    const control = productionControl(record);
    return control && control.state === "REVISION_REQUIRED" ? "REVISIONE RICHIESTA" : statusLane(record.status);
  }

  function productionCard(record) {
    const button = element("button", "cc-production-card");
    button.type = "button";
    button.setAttribute("aria-pressed", String(record.productionId === state.selectedProductionId));
    const meta = element("div", "cc-card-meta");
    meta.append(element("span", "", record.productionId), element("span", "", "v" + String(record.version)));
    const title = element("h3", "", record.package.editorialPlan.selectedIdea);
    const signals = element("div", "cc-card-signals");
    const control = productionControl(record);
    signals.append(signal("Qualità", String(record.package.quality.readinessScore) + "/100"), signal("Rischio", record.package.risk.status), signal("Evidenze", record.evidencePack ? "ALLEGATO" : "NON ALLEGATO"), signal("Esecuzione", control ? statusLabel(control.state) : "ATTIVO"));
    button.append(meta, title, signals);
    button.addEventListener("click", () => { state.selectedProductionId = record.productionId; state.slideIndex = 0; renderProductions(state.snapshot.productions, state.snapshot.overview.operationalWindow.productions.status); });
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
      target.append(frame, nav, tiktokMotionPreview(record), previewDetails(record));
      return;
    }
    if (assets && assets.tiktok) {
      const frame = element("article", "cc-asset-frame");
      frame.append(element("span", "cc-asset-index", "SCRIPT BREVE"), element("h4", "", assets.tiktok.hook), element("p", "", assets.tiktok.caption));
      target.append(frame, tiktokMotionPreview(record), previewDetails(record));
      return;
    }
    const empty = element("div", "cc-preview-empty");
    empty.append(element("span", "", "◇"), element("div", "", "Questo pacchetto durevole non ha asset visivi generati. Il suo stato esatto di qualità, rischio ed evidenze è comunque mostrato qui sotto."));
    target.append(empty, previewDetails(record));
  }

  function tiktokMotionPreview(record) {
    const shell = element("section", "cc-tiktok-motion-preview");
    shell.dataset.motionPreview = "tiktok";
    const head = element("div", "cc-tiktok-motion-preview-head");
    const play = element("button", "", "Anteprima transizioni");
    play.type = "button";
    play.addEventListener("click", () => emitMotion("tiktok-preview", { marker: "PREVIEW_ONLY_NOT_RENDERED_VIDEO", productionId: record.productionId }));
    head.append(element("span", "", "TIKTOK · TRANSITION PREVIEW 9:16"), play);
    const beats = element("div", "cc-tiktok-motion-beats");
    const source = record.package.assets && record.package.assets.tiktok && Array.isArray(record.package.assets.tiktok.beats) ? record.package.assets.tiktok.beats.slice(0, 6) : [];
    const effects = ["PAN", "ZOOM", "TEXT STAGGER", "FADE"];
    for (const [index, beat] of source.entries()) {
      const item = element("div", "cc-tiktok-motion-beat");
      item.dataset.motionPreviewBeat = String(index + 1);
      item.append(element("span", "", String(index + 1).padStart(2, "0") + " · " + effects[index % effects.length] + " · 900 ms"), element("b", "", beat.onScreenText));
      beats.append(item);
    }
    if (source.length === 0) beats.append(element("div", "cc-tiktok-motion-beat", "Blueprint non disponibile: nessuna transizione simulata."));
    shell.append(head, beats, element("span", "cc-tiktok-motion-marker", "PREVIEW_ONLY_NOT_RENDERED_VIDEO · provider calls 0 · publication LOCKED"));
    return shell;
  }

  function previewDetails(record) {
    const details = element("div", "cc-preview-details");
    const control = productionControl(record);
    details.append(detail("Controllo qualità", String(record.package.quality.readinessScore) + "/100"), detail("Controllo rischio", record.package.risk.status), detail("Evidence Pack", record.evidencePack ? record.evidencePack.packId : "Nessun pacchetto immutabile allegato"), detail("Controllo esecuzione", control ? statusLabel(control.state) + " · v" + String(control.version) : "ATTIVO · nessun override"));
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
    const control = productionControl(record);
    if (control) {
      target.append(inspectorRow("Controllo esecuzione", statusLabel(control.state) + " · v" + String(control.version)), inspectorCode("Fingerprint pacchetto sorgente", control.sourcePackageFingerprint));
      const history = element("details", "cc-task-output");
      history.append(element("summary", "", "Cronologia controlli e revisioni · " + String(control.history.length) + " evento/i"));
      const historyBody = element("div", "cc-control-history");
      for (const item of control.history) historyBody.append(element("p", "", "v" + String(item.version) + " · " + item.action + " · " + item.reasonCode + " · " + timestamp(item.occurredAt)));
      for (const revision of control.revisions) historyBody.append(element("p", "", "Revisione " + revision.revisionId + " · " + revision.category + " / " + revision.priority + " · target " + revision.targets.map((item) => item.kind + ":" + item.reference).join(" · ")));
      history.append(historyBody); target.append(history);
    }
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
    if (!record) return;
    const control = productionControl(record);
    const exactTarget = controlTarget("PRODUCTION", record.productionId);
    if (exactTarget && exactTarget.actions.length > 0) {
      target.append(element("p", "cc-panel-label", "CONTROLLO PRODUZIONE DUREVOLE"));
      for (const action of exactTarget.actions) {
        const label = action === "REQUEST_PRODUCTION_REVISION"
          ? revisionButtonLabel(record)
          : action === "PAUSE_PRODUCTION"
            ? "Metti in pausa"
            : action === "RESUME_PRODUCTION"
              ? "Riprendi produzione"
              : "Annulla produzione";
        target.append(controlActionButton(label, action, exactTarget, record));
      }
    }
    if (record.status !== "PENDING_FABIO_APPROVAL") return;
    target.append(element("p", "cc-panel-label", "DECISIONE DI APPROVAZIONE"));
    if (control && control.state !== "ACTIVE") {
      const blocked = element("button", "cc-control-button", "Approvazione invalidata · " + statusLabel(control.state));
      blocked.type = "button"; blocked.disabled = true; target.append(blocked); return;
    }
    const visualBlocked = record.package.socialPublishingPack && !visualReviewBoundToRecord(state.visualReview, record);
    if (record.evidencePack && !visualBlocked) target.append(actionButton("Approva pacchetto", "APPROVE_CONTENT", record));
    if (visualBlocked) {
      const blocked = element("button", "cc-control-button", "Approvazione bloccata: logo originale mancante");
      blocked.type = "button"; blocked.disabled = true; target.append(blocked);
    }
    target.append(actionButton("Rifiuta pacchetto", "REJECT_CONTENT", record));
  }

  function productionControl(record) {
    const controls = state.snapshot && state.snapshot.controls && Array.isArray(state.snapshot.controls.productionControls) ? state.snapshot.controls.productionControls : [];
    return controls.find((control) => control.productionId === record.productionId) || null;
  }

  function visualReviewBoundToRecord(review, production) {
    const social = production && production.package && production.package.socialPublishingPack;
    const binding = review && review.approvalBinding;
    const target = production ? controlTarget("PRODUCTION", production.productionId) : null;
    const hash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
    return Boolean(
      review && review.visualReview && review.visualReview.status === "READY_FOR_HUMAN_DECISION" &&
      binding && social && social.masterContentPack &&
      binding.workspaceId === production.workspaceId &&
      binding.productionId === production.productionId &&
      binding.productionVersion === production.version &&
      target && hash(target.contentPackageFingerprint) &&
      binding.contentPackageFingerprint === target.contentPackageFingerprint &&
      hash(binding.assetSetFingerprint) &&
      binding.socialPublishingPackFingerprint === social.fingerprint &&
      binding.masterContentPackFingerprint === social.masterContentPack.fingerprint
    );
  }

  function controlTarget(kind, entityId) {
    const targets = state.snapshot && state.snapshot.controls && Array.isArray(state.snapshot.controls.targets) ? state.snapshot.controls.targets : [];
    return targets.find((target) => target.kind === kind && target.entityId === entityId) || null;
  }

  function revisionTarget(record) {
    const assets = record.package && record.package.assets;
    const social = record.package && record.package.socialPublishingPack;
    const slides = assets && Array.isArray(assets.carousel) ? assets.carousel : social && Array.isArray(social.carousel) ? social.carousel : [];
    if (slides.length > 0) {
      const index = Math.max(0, Math.min(state.slideIndex, slides.length - 1));
      return { category: "SLIDE", priority: "HIGH", targets: [{ kind: "SLIDE", reference: "slide-" + String(index + 1).padStart(2, "0") }] };
    }
    if (assets && assets.tiktok) return { category: "CAPTION", priority: "HIGH", targets: [{ kind: "CAPTION", reference: "tiktok-caption" }] };
    return { category: "ASSET", priority: "HIGH", targets: [{ kind: "ASSET", reference: "package-master" }] };
  }

  function revisionButtonLabel(record) {
    const target = revisionTarget(record).targets[0];
    return target.kind === "SLIDE" ? "Richiedi revisione " + target.reference : target.kind === "CAPTION" ? "Richiedi revisione caption" : "Richiedi revisione master asset";
  }

  function controlActionButton(label, action, exactTarget, context) {
    const button = element("button", "cc-control-button", label); button.type = "button";
    button.dataset.action = action;
    button.addEventListener("click", () => { void proposeControlAction(action, exactTarget, context, button); });
    return button;
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

  function oraclePromptInput() {
    const prompt = commandInput.value.trim().replace(/\s+/g, " ");
    if (prompt.length < 12 || prompt.length > 240) throw new Error("Descrivi la missione creativa in 12–240 caratteri.");
    if (!commandBusinessMission.value) throw new Error("Seleziona prima una Business Mission approvata.");
    const deliverables = Array.from(document.querySelectorAll('input[name="oracle-deliverable"]:checked')).map((input) => input.value);
    if (deliverables.length === 0) throw new Error("Seleziona almeno un output.");
    const platforms = [];
    if (deliverables.some((value) => value === "CAROUSEL" || value === "INSTAGRAM_COPY" || value === "IMAGE_MASTER")) platforms.push("instagram");
    if (deliverables.some((value) => value === "TIKTOK_VIDEO_BLUEPRINT" || value === "VIDEO_RENDER" || value === "IMAGE_MASTER")) platforms.push("tiktok");
    return { businessMissionId: commandBusinessMission.value, contractVersion: "1", deliverables, objective: commandObjective.value, platforms, prompt, promptId: nextIdempotencyKey("ORACLE_PROMPT", "creative").slice(0, 80) };
  }

  async function proposeOraclePrompt() {
    const returnFocus = document.activeElement;
    try {
      commandForm.setAttribute("aria-busy", "true"); commandSubmit.disabled = true; commandNavigate.disabled = true;
      commandResult.textContent = "ORACLE sta verificando missione, evidenze e capability. Nessuna generazione live è in corso.";
      const input = oraclePromptInput();
      const proposal = await actionPost("/api/prompt-missions/propose", input);
      openOraclePromptConfirmation(proposal, input, returnFocus);
    } catch (error) {
      commandResult.textContent = error instanceof Error ? error.message : "Missione ORACLE non preparata.";
      emitMotion("validation", { reasonCode: "ORACLE_PREFLIGHT_REJECTED" });
    } finally {
      commandForm.setAttribute("aria-busy", "false"); commandNavigate.disabled = false; commandSubmit.disabled = commandBusinessMission.disabled;
    }
  }

  function openOraclePromptConfirmation(proposal, input, returnFocus) {
    state.returnFocus = returnFocus;
    state.pendingConfirmation = { input, oracle: true, proposal };
    actionConfirmationTitle.textContent = proposal.canConfirm ? "Creare la bozza con la squadra ORACLE" : "Missione ORACLE bloccata";
    actionConfirmationDetail.textContent = proposal.canConfirm ? "La conferma crea soltanto un pacchetto interno evidence-led per la review di Fabio." : "Il preflight ha trovato un blocker reale. Nessun contenuto o asset è stato creato.";
    actionConfirmationSubmit.textContent = "Crea bozza interna";
    actionConfirmationSubmit.dataset.action = "ORACLE_PROMPT";
    actionConfirmationSubmit.disabled = !proposal.canConfirm;
    actionConfirmationDetails.replaceChildren();
    const mission = proposal.businessMission ? proposal.businessMission.missionId + " · " + proposal.businessMission.selectedOpportunityId : "NON DISPONIBILE";
    const packs = proposal.evidencePacks.length === 0 ? "NON DISPONIBILI" : proposal.evidencePacks.map((pack) => pack.packId + " · " + pack.fingerprint.slice(0, 12) + "…" + (pack.selectedForContent ? " · SELECTED" : "")).join(" | ");
    const route = proposal.route.map((stage) => stage.callSign + " " + stage.status).join(" → ");
    const capabilities = proposal.capabilities.map((capability) => capability.deliverable + " " + capability.status).join(" · ");
    const entries = [["Stato", proposal.status + " · " + proposal.reasonCode], ["Missione", mission], ["Evidence Pack", packs], ["Squadra", route], ["Capability", capabilities], ["Costo / provider", "USD " + Number(proposal.estimatedCostUsd).toFixed(2) + " · " + String(proposal.providerCalls) + " chiamate"], ["Prompt SHA-256", proposal.promptFingerprint], ["Context SHA-256", proposal.proposalFingerprint], ["Pubblicazione", proposal.publication + " · effetti esterni ZERO"]];
    for (const [label, value] of entries) { const row = document.createElement("div"); row.append(element("dt", "", label), element("dd", "", value)); actionConfirmationDetails.append(row); }
    showActionConfirmation(proposal.expiresAt);
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

  function nextIdempotencyKey(action, entityId) {
    let nonce;
    if (window.crypto && typeof window.crypto.randomUUID === "function") nonce = window.crypto.randomUUID();
    else {
      const bytes = new Uint32Array(4);
      window.crypto.getRandomValues(bytes);
      nonce = Array.from(bytes).map((value) => value.toString(16).padStart(8, "0")).join("-");
    }
    return ("ui-" + action.toLowerCase().replaceAll("_", "-") + "-" + entityId + "-" + nonce).slice(0, 128);
  }

  function controlReason(action) {
    const reasons = {
      ACKNOWLEDGE_INCIDENT: { code: "FABIO_INCIDENT_ACK", detail: "Incidente verificato e riconosciuto dal Centro di Comando locale." },
      CANCEL_PRODUCTION: { code: "FABIO_PRODUCTION_CANCEL", detail: "Annullamento controllato richiesto dal Package Viewer locale." },
      PAUSE_PRODUCTION: { code: "FABIO_PRODUCTION_PAUSE", detail: "Pausa controllata richiesta dal Package Viewer locale." },
      REQUEST_PRODUCTION_REVISION: { code: "FABIO_REVISION_REQUEST", detail: "Revisione mirata richiesta dal Package Viewer locale." },
      REQUEUE_DEAD_LETTER_JOB: { code: "FABIO_DEAD_LETTER_REQUEUE", detail: "Successore controllato richiesto per un job dead-letter ispezionato." },
      RESUME_PRODUCTION: { code: "FABIO_PRODUCTION_RESUME", detail: "Ripresa controllata richiesta dal Package Viewer locale." },
      RETRY_FAILED_JOB: { code: "FABIO_FAILED_JOB_RETRY", detail: "Successore controllato richiesto per un job locale fallito." },
    };
    return reasons[action];
  }

  async function proposeControlAction(action, exactTarget, context, button) {
    try {
      button.disabled = true;
      const payload = { action, contractVersion: "1", entityId: exactTarget.entityId, entityVersion: exactTarget.version, fingerprint: exactTarget.fingerprint, idempotencyKey: nextIdempotencyKey(action, exactTarget.entityId), reason: controlReason(action) };
      if (action === "REQUEST_PRODUCTION_REVISION") payload.revision = revisionTarget(context);
      const proposal = await actionPost("/api/control-actions/propose", payload);
      openActionConfirmation(action, proposal);
    } catch (error) {
      commandResult.textContent = error instanceof Error ? error.message : "Comando operativo non eseguito.";
    } finally { button.disabled = false; }
  }

  function openActionConfirmation(action, proposal) {
    state.returnFocus = document.activeElement;
    actionConfirmationSubmit.disabled = false;
    if (proposal && proposal.proposal) {
      if (proposal.receipt) {
        commandResult.textContent = "Comando già registrato. Ricevuta durevole: " + proposal.receipt.receiptId + ".";
        return;
      }
      const record = proposal.proposal;
      const labels = { ACKNOWLEDGE_INCIDENT: "Riconoscere l'incidente", CANCEL_PRODUCTION: "Annullare la produzione", PAUSE_PRODUCTION: "Mettere in pausa la produzione", REQUEST_PRODUCTION_REVISION: "Richiedere la revisione mirata", REQUEUE_DEAD_LETTER_JOB: "Accodare un successore del dead-letter", RESUME_PRODUCTION: "Riprendere la produzione", RETRY_FAILED_JOB: "Accodare un successore del job fallito" };
      state.pendingConfirmation = { action, control: true, proposal };
      actionConfirmationTitle.textContent = labels[action] || "Confermare il comando operativo";
      actionConfirmationDetail.textContent = "La conferma è monouso e vincolata a identità, versione e fingerprint esatti. L'azione produce audit e ricevuta durevoli.";
      actionConfirmationSubmit.textContent = "Conferma comando";
      actionConfirmationSubmit.dataset.action = action;
      actionConfirmationDetails.replaceChildren();
      const target = record.target;
      const revision = record.revision ? record.revision.category + " · " + record.revision.priority + " · " + record.revision.targets.map((item) => item.kind + ":" + item.reference).join(" · ") : "NON APPLICABILE";
      const entries = [["Azione", action], ["Entità", target.kind + " · " + target.entityId], ["Versione", "v" + String(target.entityVersion)], ["Fingerprint", target.entityFingerprint], ["Reason code", record.reason.code], ["Motivazione", record.reason.detail], ["Target revisione", revision], ["Effetti esterni", "ZERO · PUBLICATION LOCKED"]];
      for (const [label, value] of entries) { const row = document.createElement("div"); row.append(element("dt", "", label), element("dd", "", value)); actionConfirmationDetails.append(row); }
      showActionConfirmation(record.expiresAt);
      return;
    }
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
      showActionConfirmation(proposal.expiresAt);
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
    showActionConfirmation(proposal.expiresAt);
  }

  function showActionConfirmation(expiresAt) {
    const background = Array.from(root.children).filter((node) => node !== actionConfirmation);
    state.confirmationInertedNodes = background.filter((node) => !node.hasAttribute("inert"));
    for (const node of background) node.setAttribute("inert", "");
    actionConfirmation.hidden = false;
    emitMotion("review", { status: "AWAITING_FABIO" });
    startConfirmationTimer(expiresAt);
    const quietButton = actionConfirmation.querySelector(".cc-modal-button--quiet");
    if (actionConfirmationSubmit.disabled && quietButton) quietButton.focus(); else actionConfirmationSubmit.focus();
  }

  function closeActionConfirmation(message) {
    const returnFocus = state.returnFocus;
    if (state.confirmationInterval !== null) window.clearInterval(state.confirmationInterval);
    state.confirmationInterval = null;
    state.pendingConfirmation = null;
    state.returnFocus = null;
    actionConfirmation.hidden = true;
    actionConfirmationSubmit.disabled = false;
    for (const node of state.confirmationInertedNodes) node.removeAttribute("inert");
    state.confirmationInertedNodes = [];
    if (message) commandResult.textContent = message;
    if (returnFocus && typeof returnFocus.focus === "function") returnFocus.focus();
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
      const receipt = pending.oracle
        ? await actionPost("/api/prompt-missions/confirm", { confirmationToken: proposal.confirmationToken, contractVersion: "1", prompt: pending.input.prompt, promptFingerprint: proposal.promptFingerprint, proposalFingerprint: proposal.proposalFingerprint, proposalId: proposal.proposalId })
        : pending.control
          ? await actionPost("/api/control-actions/confirm", { confirmationToken: proposal.confirmationToken, contractVersion: "1", entityFingerprint: proposal.proposal.target.entityFingerprint, proposalId: proposal.proposal.proposalId })
          : await actionPost("/api/actions/confirm", { actionId: proposal.actionId, confirmationToken: proposal.confirmationToken, packageFingerprint: proposal.summary.packageFingerprint });
      if (pending.oracle) { commandInput.value = ""; state.selectedProductionId = receipt.productionId; }
      const deferredMedia = pending.oracle && proposal.capabilities.some((capability) => capability.status !== "READY_LOCAL");
      closeActionConfirmation(pending.oracle ? "Bozza interna creata: " + receipt.productionId + ". Review Fabio richiesta; pubblicazione LOCKED." + (deferredMedia ? " Gli output media selezionati restano differiti sotto gate separato." : "") : "Azione registrata. Ricevuta durevole: " + (pending.control ? receipt.receiptId : receipt.command.commandId) + ".");
      emitMotion("receipt", { status: pending.oracle ? "AWAITING_FABIO" : "COMPLETED" });
      await refresh();
      if (pending.oracle) window.location.hash = "#production";
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

  function renderReferenceVault(vault) {
    const assets = Array.isArray(vault.assets) ? vault.assets : [];
    const current = assets.filter((asset) => asset.current !== false);
    const approved = current.filter((asset) => asset.status === "APPROVED" && !isVaultRightsBlocked(asset));
    const pending = current.filter((asset) => asset.status === "PENDING_FABIO_REVIEW" || asset.status === "IMPORTED");
    const rightsBlocked = current.filter(isVaultRightsBlocked);
    text("vault-total", number(current.length));
    text("vault-approved", number(approved.length));
    text("vault-review", number(pending.length));
    text("vault-rights-blocked", number(rightsBlocked.length));
    const gallery = byId("reference-vault-gallery");
    const detailPanel = byId("reference-vault-detail");
    gallery.replaceChildren(); detailPanel.replaceChildren();
    const visible = current.filter((asset) => state.vaultFilter === "ALL" || (state.vaultFilter === "RIGHTS_BLOCKED" ? isVaultRightsBlocked(asset) : asset.status === state.vaultFilter));
    document.querySelectorAll("[data-vault-filter]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.vaultFilter === state.vaultFilter)));
    const coverage = vault.coverage === "LIMIT_REACHED" ? " · finestra parziale" : vault.coverage === "NOT_AVAILABLE" ? " · copertura non disponibile" : "";
    text("vault-gallery-summary", (visible.length === 0 ? "Nessun riferimento in questa vista" : number(visible.length) + " riferimento/i verificabili") + coverage);
    if (!visible.some((asset) => asset.referenceId === state.selectedReferenceId)) state.selectedReferenceId = visible[0] ? visible[0].referenceId : null;
    if (visible.length === 0) {
      gallery.append(element("div", "cc-list-empty", current.length === 0 ? "Il Vault è pronto. Nessun file viene importato automaticamente: usa il Fabio Input Pack e una preview durevole." : "Nessun riferimento corrisponde al filtro selezionato."));
      detailPanel.append(element("div", "cc-list-empty", "Seleziona un riferimento per vedere metadati, diritti, scopo e collegamenti."));
    } else {
      for (const asset of visible) {
        const card = element("button", "cc-reference-card"); card.type = "button";
        card.dataset.referenceId = asset.referenceId; card.dataset.status = asset.status;
        card.setAttribute("aria-controls", "reference-vault-detail");
        card.setAttribute("aria-pressed", String(asset.referenceId === state.selectedReferenceId));
        const roles = Array.isArray(asset.referenceRoles) ? asset.referenceRoles : [];
        card.append(
          element("span", "cc-reference-kind", (asset.mimeType || "FILE").replace("image/", "")),
          element("strong", "", asset.title || asset.originalFilename || asset.referenceId),
          element("small", "", statusLabel(asset.status || "IMPORTED") + " · v" + String(asset.version === undefined ? "—" : asset.version)),
          element("p", "", roles.slice(0, 3).map(statusLabel).join(" · ") || "Ruolo da classificare"),
        );
        card.addEventListener("click", () => { state.selectedReferenceId = asset.referenceId; renderReferenceVault(vault); });
        gallery.append(card);
      }
      const selected = visible.find((asset) => asset.referenceId === state.selectedReferenceId);
      if (selected) renderReferenceDetail(detailPanel, selected, vault);
    }
    renderFingerprint("visual-fingerprint-panel", vault.visualFingerprint, "Il profilo visivo nasce solo da decisioni esplicite di Fabio.");
    renderFingerprint("writing-fingerprint-panel", vault.writingFingerprint, "Il profilo di scrittura nasce solo da decisioni esplicite di Fabio.");
    renderBusinessContext(vault.businessContext);
    renderDecisionMemory(vault.decisions || [], vault.outcomeLinks || []);
    renderVaultComparison(approved, current.filter((asset) => asset.status === "REJECTED"));
    renderVaultSequences(vault.sequences || []);
    const alerts = byId("vault-missing-inputs"); alerts.replaceChildren();
    const missing = Array.isArray(vault.missingInputs) ? vault.missingInputs : [];
    const blockers = Array.isArray(vault.rightsBlockers) ? vault.rightsBlockers : [];
    if (vault.queryStatus === "UNAVAILABLE") alerts.append(vaultAlert("Vault non disponibile", ["La lettura è fallita chiusa; nessun riferimento è stato esposto."]));
    if (vault.coverage === "LIMIT_REACHED") alerts.append(vaultAlert("Copertura parziale", ["Metriche e gallery descrivono soltanto la finestra bounded osservata."]));
    if (missing.length === 0 && blockers.length === 0 && vault.queryStatus !== "UNAVAILABLE" && vault.coverage !== "LIMIT_REACHED") alerts.append(element("p", "cc-vault-ok", "Nessun input o diritto mancante nel perimetro osservato."));
    else {
      if (missing.length > 0) alerts.append(vaultAlert("Input ancora necessari", missing));
      if (blockers.length > 0) alerts.append(vaultAlert("Diritti bloccati", blockers));
    }
  }

  function renderVaultComparison(approved, rejected) {
    const target = byId("approved-rejected-comparison"); target.replaceChildren();
    const grid = element("div", "cc-vault-compare-grid");
    const columns = [["APPROVATO", approved[0]], ["RIFIUTATO", rejected[0]]];
    for (const [label, asset] of columns) {
      const column = element("section", "cc-vault-compare-column");
      column.append(element("span", "", label));
      if (!asset) column.append(element("p", "cc-vault-empty", "NOT AVAILABLE · nessuna decisione reale."));
      else column.append(element("strong", "", asset.title || asset.referenceId), element("small", "", asset.referenceId + " · v" + String(asset.version)), element("p", "cc-vault-empty", formatVaultValue(asset.approvalReason)));
      grid.append(column);
    }
    target.append(grid, element("p", "cc-vault-empty", "Confronto metadati: gli originali privati non vengono serviti dal browser."));
  }

  function renderVaultSequences(sequences) {
    const target = byId("carousel-sequence-panel"); target.replaceChildren();
    if (!Array.isArray(sequences) || sequences.length === 0) { target.append(element("p", "cc-vault-empty", "Nessuna sequenza reale registrata. Nessuna slide segnaposto viene mostrata.")); return; }
    const list = element("div", "cc-vault-sequence-list");
    for (const sequence of sequences) {
      const disclosure = element("details", "cc-vault-sequence");
      const items = Array.isArray(sequence.items) ? sequence.items : [];
      const ordered = element("ol", "");
      for (const item of items) {
        const requested = item.requestedVersion === undefined ? "" : " · richiesto v" + String(item.requestedVersion);
        const reasons = Array.isArray(item.eligibilityReasonCodes) && item.eligibilityReasonCodes.length > 0 ? " · " + item.eligibilityReasonCodes.join(", ") : "";
        ordered.append(element("li", "", String(item.referenceId) + " · corrente v" + String(item.version) + requested + (item.available ? " · IDONEO" : " · NON IDONEO") + reasons));
      }
      disclosure.append(element("summary", "", (sequence.title || sequence.collectionId) + " · " + String(items.length) + " slide"), element("p", "cc-vault-empty", formatVaultValue(sequence.description)), ordered);
      list.append(disclosure);
    }
    target.append(list);
  }

  function isVaultRightsBlocked(asset) {
    if (asset && typeof asset.eligible === "boolean") return asset.eligible !== true;
    const rights = asset && asset.rights ? asset.rights : {};
    const status = rights.status || asset && asset.rightsStatus;
    const expiresAt = rights.expiresAt || asset && asset.rightsExpiresAt;
    return Boolean(
      !status ||
      asset.status === "RIGHTS_BLOCKED" ||
      ["BLOCKED", "PUBLIC_ANALYSIS_ONLY", "UNKNOWN"].includes(status) ||
      (expiresAt && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) <= Date.now())
    );
  }

  function renderReferenceDetail(target, asset, vault) {
    const head = element("div", "cc-reference-detail-head");
    head.append(element("p", "cc-panel-label", "REFERENCE DOSSIER"), element("h3", "", asset.title || asset.referenceId), element("span", "cc-agent-state", statusLabel(asset.status || "IMPORTED")));
    const metadata = element("div", "cc-reference-metadata");
    const rights = asset.rights || {};
    const source = asset.source || {};
    const dimensions = asset.dimensions && asset.dimensions.width && asset.dimensions.height ? String(asset.dimensions.width) + "×" + String(asset.dimensions.height) : "NOT AVAILABLE";
    const rows = [
      ["ID / versione", asset.referenceId + " · v" + String(asset.version === undefined ? "—" : asset.version)],
      ["File", asset.originalFilename || "NOT AVAILABLE"],
      ["SHA-256", asset.sha256 || asset.fingerprint || "NOT AVAILABLE"],
      ["Formato", (asset.mimeType || "NOT AVAILABLE") + " · " + dimensions],
      ["Fonte", statusLabel(source.type || asset.sourceType || "NOT_AVAILABLE")],
      ["Diritti", statusLabel(rights.status || asset.rightsStatus || "UNKNOWN")],
      ["Uso consentito", formatVaultValue(rights.allowedUse || asset.allowedUse)],
      ["Privacy / retention", (asset.privacy && statusLabel(asset.privacy.status) || "NOT AVAILABLE") + " · " + (asset.privacy && asset.privacy.retentionExpiresAt || "NOT AVAILABLE")],
      ["Idoneità creative direction", asset.eligible === true ? "IDONEO" : "BLOCCATO · " + formatVaultValue(asset.eligibilityReasonCodes)],
      ["Obiettivo", formatVaultValue(asset.businessObjective)],
      ["Audience", formatVaultValue(asset.audience)],
      ["Da imparare", formatVaultValue(asset.whatToLearn)],
      ["Da non copiare", formatVaultValue(asset.whatNotToCopy)],
      ["Missione collegata", formatVaultValue(asset.linkedMission)],
      ["Pacchetto collegato", formatVaultValue(asset.linkedPackage)],
      ["Outcome collegato", formatVaultValue(asset.linkedOutcome)],
    ];
    for (const [label, value] of rows) metadata.append(vaultDatum(label, value));
    const disclosure = element("details", "cc-progressive-details");
    disclosure.append(element("summary", "", "Metadati, fonte e diritti"), metadata);
    const outcomeCount = Array.isArray(vault.outcomeLinks) ? vault.outcomeLinks.filter((link) => link.referenceId === asset.referenceId).length : 0;
    target.append(head, element("p", "cc-reference-purpose", formatVaultValue(asset.approvalReason || "Nessuna decisione Fabio registrata per questa versione.")), element("small", "", String(outcomeCount) + " outcome collegato/i"), disclosure);
  }

  function renderFingerprint(targetId, fingerprint, emptyMessage) {
    const target = byId(targetId); target.replaceChildren();
    if (!fingerprint) { target.append(element("p", "cc-vault-empty", emptyMessage + " Campioni: 0 · confidenza non disponibile.")); return; }
    const sampleCount = fingerprint.sampleCount === undefined ? 0 : fingerprint.sampleCount;
    const confidence = fingerprint.confidence === undefined ? "NOT AVAILABLE" : typeof fingerprint.confidence === "number" ? new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1, style: "percent" }).format(fingerprint.confidence) : statusLabel(String(fingerprint.confidence));
    const summary = element("div", "cc-fingerprint-summary");
    summary.append(vaultDatum("Campioni espliciti", number(sampleCount)), vaultDatum("Confidenza", confidence), vaultDatum("Versione", "v" + String(fingerprint.version === undefined ? "—" : fingerprint.version)));
    const dimensions = fingerprint.preferences || fingerprint.dimensions || {};
    const disclosure = element("details", "cc-progressive-details");
    const body = element("div", "cc-reference-metadata");
    for (const [key, value] of Object.entries(dimensions).slice(0, 16)) body.append(vaultDatum(statusLabel(key), formatVaultValue(value)));
    disclosure.append(element("summary", "", "Dimensioni del fingerprint"), body);
    target.append(summary, disclosure);
  }

  function renderBusinessContext(context) {
    const target = byId("business-context-panel"); target.replaceChildren();
    if (!context) { target.append(element("p", "cc-vault-empty", "Contesto non ancora registrato. Valori economici e vincoli restano NOT AVAILABLE.")); return; }
    const keys = ["founderConstraints", "revenueTargets", "budget", "availableTime", "riskTolerance", "audience", "offers", "pricing", "deliveryCapacity", "channels", "successMetrics", "unitEconomics", "activeExperiments"];
    const disclosure = element("details", "cc-progressive-details");
    const body = element("div", "cc-reference-metadata");
    for (const key of keys) body.append(vaultDatum(statusLabel(key), formatVaultValue(context[key])));
    disclosure.append(element("summary", "", "Vincoli, offerte e obiettivi"), body);
    target.append(element("p", "cc-vault-empty", "Versione " + String(context.version === undefined ? "—" : context.version) + " · valori mancanti non stimati"), disclosure);
  }

  function renderDecisionMemory(decisions, outcomes) {
    const target = byId("decision-memory-panel"); target.replaceChildren();
    const summary = element("div", "cc-fingerprint-summary");
    summary.append(vaultDatum("Decisioni", number(decisions.length)), vaultDatum("Outcome", number(outcomes.length)), vaultDatum("Aggiornamento", decisions[0] && decisions[0].createdAt ? timestamp(decisions[0].createdAt) : "NOT AVAILABLE"));
    target.append(summary);
    if (decisions.length === 0) { target.append(element("p", "cc-vault-empty", "Nessuna preferenza viene dedotta senza una decisione esplicita di Fabio.")); return; }
    const list = element("div", "cc-vault-decision-list");
    for (const decision of decisions.slice(0, 6)) {
      const disclosure = element("details", "cc-progressive-details");
      const metadata = element("div", "cc-reference-metadata");
      metadata.append(
        vaultDatum("Motivo", formatVaultValue(decision.structuredReason)),
        vaultDatum("Elemento", formatVaultValue(decision.affectedElement)),
        vaultDatum("Regola riutilizzabile", formatVaultValue(decision.reusableRule)),
        vaultDatum("Scope / confidenza", formatVaultValue(decision.scope) + " · " + formatVaultValue(decision.confidence)),
        vaultDatum("Pacchetto", formatVaultValue(decision.packageIds)),
        vaultDatum("Revisione risultante", decision.resultingRevision && decision.resultingRevision.status === "AVAILABLE" ? decision.resultingRevision.packageId + " · v" + String(decision.resultingRevision.version) : "NOT AVAILABLE"),
        vaultDatum("Scadenza", formatVaultValue(decision.expiresAt)),
      );
      disclosure.append(element("summary", "", statusLabel(decision.decision || decision.type || "DECISION") + " · " + formatVaultValue(decision.reusableRule)), metadata);
      list.append(disclosure);
    }
    target.append(list);
  }

  function vaultDatum(label, value) { const row = element("div", "cc-vault-datum"); row.append(element("span", "", label), element("b", "", value)); return row; }
  function vaultAlert(title, items) { const card = element("article", "cc-vault-alert"); card.append(element("strong", "", title), element("p", "", items.map((item) => typeof item === "string" ? item : item.reasonCode || item.referenceId || "Record bloccato").join(" · "))); return card; }
  function formatVaultValue(value) { if (value === undefined || value === null || value === "") return "NOT AVAILABLE"; if (Array.isArray(value)) return value.length === 0 ? "NOT AVAILABLE" : value.map((item) => typeof item === "string" ? item : item.label || item.id || "Dato strutturato").join(" · "); if (typeof value === "object") return value.status || value.label || value.value || "Dato strutturato disponibile"; return String(value); }

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

  function renderDailyOperatingBrief(briefs) {
    const target = byId("daily-operating-sections");
    target.replaceChildren();
    if (briefs.length === 0) {
      text("daily-operating-meta", "Nessun brief durevole");
      target.append(element("div", "cc-list-empty", "Il Daily Operating Brief apparirà soltanto dopo una generazione locale da stato persistito."));
      return;
    }
    const brief = briefs[0];
    text("daily-operating-meta", brief.businessDate + " · " + timestamp(brief.generatedAt) + " · " + brief.fingerprint.slice(0, 16) + "…");
    const labels = { approvalsRequired: "Approvazioni", backupState: "Backup", blockedTasks: "Task bloccati", businessMissions: "Business Mission", costsAndBudgets: "Costi e budget", evidenceFreshness: "Freshness evidenze", externalActionsPerformed: "Azioni esterne", incidents: "Incidenti", productionQueue: "Coda produzione", recommendedFounderDecisions: "Decisioni Fabio", socialIntelligence: "Social Intelligence", systemHealth: "Salute sistema", workCompleted: "Lavoro completato", workInProgress: "Lavoro in corso" };
    for (const [key, datum] of Object.entries(brief.sections)) {
      const card = element("article", "cc-daily-section");
      card.dataset.kind = datum.kind;
      card.append(element("span", "cc-panel-label", labels[key] || key), element("strong", "", statusLabel(datum.kind)), element("p", "", dailyDatumSummary(key, datum.value)));
      const provenance = datum.provenance.length === 0 ? "Provenienza non disponibile" : "Provenienza: " + datum.provenance.join(" · ");
      card.append(element("small", "", datum.limitation ? provenance + " · Limite: " + datum.limitation : provenance));
      target.append(card);
    }
  }

  function dailyDatumSummary(key, value) {
    if (Array.isArray(value)) {
      if (key === "recommendedFounderDecisions") return value.length === 0 ? "Nessuna decisione aperta." : value.map((item) => item.priority + " · " + item.question).join(" | ");
      if (key === "blockedTasks") return value.length === 0 ? "Nessun task bloccato misurato." : value.map((item) => item.taskId + " · " + item.reasonCode + " · " + item.owner).join(" | ");
      if (key === "approvalsRequired") return value.length === 0 ? "Nessuna approvazione richiesta." : value.map((item) => item.entityType + " · " + item.entityId + " · " + statusLabel(item.status)).join(" | ");
      if (key === "businessMissions") return value.length === 0 ? "Nessuna Business Mission persistita." : value.map((item) => item.missionId + " · " + statusLabel(item.status)).join(" | ");
      if (key === "incidents") return value.length === 0 ? "Nessun incidente aperto." : value.map((item) => item.incidentId + " · " + item.severity + " · " + statusLabel(item.status)).join(" | ");
      if (key === "workCompleted") return value.length === 0 ? "Nessun completamento nel perimetro misurato." : value.map((item) => item.kind + " · " + item.identity).join(" | ");
      if (key === "workInProgress") return value.length === 0 ? "Nessun lavoro in corso nel perimetro misurato." : value.map((item) => item.kind + " · " + item.identity + " · " + statusLabel(item.status)).join(" | ");
      return String(value.length) + " record persistiti.";
    }
    if (!value || typeof value !== "object") return String(value);
    if (key === "systemHealth") return "Sistema " + statusLabel(value.status) + " · scheduler " + statusLabel(value.scheduler) + " · worker " + statusLabel(value.worker) + " · kill switch " + statusLabel(value.killSwitch) + " · maintenance " + statusLabel(value.maintenanceMode);
    if (key === "productionQueue") return String(value.active) + " attivi · " + String(value.pendingFabio) + " in revisione Fabio · " + String(value.deadLetter) + " dead-letter";
    if (key === "socialIntelligence") return String(value.records) + " segnali · " + String(value.analyticsRecords) + " record analytics · " + statusLabel(value.status);
    if (key === "evidenceFreshness") return String(value.fresh) + " freschi · " + String(value.stale) + " scaduti · " + String(value.total) + " totali";
    if (key === "costsAndBudgets") return "Misurato " + euro(value.measuredCostCents) + " · stimato " + euro(value.estimatedCostCents) + " · budget " + (value.budgetCents === "NOT_CONFIGURED" ? "non configurato" : euro(value.budgetCents)) + " · " + statusLabel(value.reconciliation);
    if (key === "externalActionsPerformed") return "Pubblicazioni " + String(value.publications) + " · messaggi " + String(value.messages) + " · paid call " + String(value.paidCalls) + " · deploy " + String(value.deployments) + " · acquisti " + String(value.purchases);
    if (key === "backupState") return statusLabel(value.status) + (value.lastVerifiedAt ? " · verificato " + timestamp(value.lastVerifiedAt) : " · ultima verifica non disponibile");
    return "Dato operativo persistito.";
  }

  function renderFounderWorkday(records) {
    const target = byId("founder-workday-detail");
    target.replaceChildren();
    if (records.length === 0) {
      target.append(element("div", "cc-list-empty", "Workday #001 non ancora materializzato. Nessuna attività agente viene simulata."));
      return;
    }
    const workday = records[0];
    const summary = element("div", "cc-founder-summary");
    const completed = workday.tasks.filter((task) => task.status === "COMPLETED").length;
    const blocked = workday.tasks.filter((task) => task.status === "BLOCKED").length;
    const waitingFabio = workday.tasks.filter((task) => task.status === "AWAITING_FABIO").length;
    summary.append(agentStat("Stato", statusLabel(workday.status)), agentStat("Task", String(workday.tasks.length)), agentStat("Completati", String(completed)), agentStat("Bloccati", String(blocked)), agentStat("Attesa Fabio", String(waitingFabio)), agentStat("Copertura costi/effetti", "SOLO PREFLIGHT"), agentStat("Costo preflight", euro(workday.artifacts.costSummary.measuredCostCents)), agentStat("Paid call preflight", String(workday.artifacts.externalEffectsSummary.paidCalls)), agentStat("Pubblicazioni preflight", String(workday.artifacts.externalEffectsSummary.publications)), agentStat("Fingerprint", workday.fingerprint.slice(0, 16) + "…"));
    const objective = element("p", "cc-founder-objective", workday.objective);
    const tasks = element("div", "cc-founder-tasks");
    for (const task of workday.tasks) {
      const row = element("article", "cc-founder-task");
      row.dataset.status = task.status;
      row.append(element("span", "cc-panel-label", task.department + " · " + task.agentId), element("b", "", task.assignment), element("p", "", statusLabel(task.status) + " · Gate " + statusLabel(task.gateStatus) + " · tentativi " + String(task.attempts) + " · " + task.costClass));
      if (task.blocker) row.append(element("small", "", "Blocco: " + task.blocker.missingInput + " · evidenza " + task.blocker.evidence.join(" / ") + " · rimedio " + task.blocker.remediation + " · owner " + task.blocker.owner + " · prossima azione " + task.blocker.nextAction));
      else if (task.receipt) row.append(element("small", "", "Ricevuta " + task.receipt.receiptId + " · output " + task.receipt.outputFingerprint.slice(0, 16) + "… · effetti esterni " + String(task.receipt.externalEffects)));
      else row.append(element("small", "", "Nessuna attività dichiarata senza executor e ricevuta durevole."));
      tasks.append(row);
    }
    const decisions = element("div", "cc-founder-decisions");
    decisions.append(element("p", "cc-panel-label", "DECISIONI APERTE"));
    if (workday.artifacts.decisionList.length === 0) decisions.append(element("p", "", "Nessuna decisione aperta."));
    for (const decision of workday.artifacts.decisionList) decisions.append(element("p", "", decision.priority + " · " + decision.question + " · evidenze " + decision.evidence.join(" / ")));
    target.append(summary, objective, tasks, decisions);
  }

  function renderRuntime(runtime, controls) {
    text("runtime-status", statusLabel(runtime.status));
    text("worker-status", runtime.continuousWorker === "READY" ? "Runtime H24 supervisionato" : runtime.continuousWorker === "STALE" ? "Lease worker scaduta" : "Nessun worker continuativo registrato");
    text("worker-detail", runtime.continuousWorker === "READY" ? String(runtime.workers.active) + " worker con lease attiva; scheduler " + statusLabel(runtime.scheduler) + "." : runtime.continuousWorker === "STALE" ? "Il processo non è dichiarato attivo: riconciliare la lease prima di avviare nuovo lavoro." : "Esistono coda, lease, retry e recupero. Nessun uptime viene dichiarato senza una lease attiva.");
    text("scheduler-status", statusLabel(runtime.scheduler));
    text("worker-lease-status", statusLabel(runtime.continuousWorker) + " · " + String(runtime.workers.active) + " attivi / " + String(runtime.workers.stale) + " stale");
    text("maintenance-status", statusLabel(runtime.maintenanceMode));
    text("telegram-status", runtime.telegram === "NOT_OBSERVED" ? "Nessuna telemetria di ciclo di vita esposta" : statusLabel(runtime.telegram));
    text("external-effects-status", runtime.usage && runtime.usage.externalEffectsExecuted === false ? "Runtime H24: zero · copertura non globale" : "Copertura globale non disponibile");
    text("kill-switch-status", statusLabel(runtime.killSwitch));
    const target = byId("runtime-bars"); target.replaceChildren();
    const items = [["In coda", runtime.counts.queued, "normal"], ["In esecuzione", runtime.counts.running, "normal"], ["Retry pianificati", runtime.counts.retryScheduled, "normal"], ["Completati", runtime.counts.completed, "normal"], ["Falliti", runtime.counts.failed, "danger"], ["Dead-letter", runtime.counts.deadLetter, "danger"]];
    const max = Math.max(1, ...items.map((item) => item[1]));
    for (const [label, value, tone] of items) {
      const row = element("div", "cc-runtime-bar"); row.dataset.tone = tone;
      const track = element("div", "cc-runtime-track"); const fill = element("div", "cc-runtime-fill"); fill.style.width = String((value / max) * 100) + "%"; track.append(fill);
      row.append(element("span", "", label), track, element("b", "", number(value))); target.append(row);
    }
    const usage = element("div", "cc-runtime-usage");
    usage.append(
      runtimeDatum("Tentativi misurati", number(runtime.usage ? runtime.usage.attempts : 0)),
      runtimeDatum("Costo misurato", euro(runtime.usage ? runtime.usage.costCents : 0)),
      runtimeDatum("Provider call", number(runtime.usage ? runtime.usage.providerCalls : 0)),
      runtimeDatum("Tool call", number(runtime.usage ? runtime.usage.toolCalls : 0)),
      runtimeDatum("Effetti esterni", runtime.usage && runtime.usage.externalEffectsExecuted ? "ERRORE" : "Runtime H24: zero · non globale"),
    );
    target.append(usage);
    const jobs = element("div", "cc-runtime-ledger");
    jobs.append(element("p", "cc-panel-label", "JOB DUREVOLI · ULTIMI " + String(Math.min((runtime.jobs || []).length, 12))));
    if (!runtime.jobs || runtime.jobs.length === 0) jobs.append(element("p", "cc-runtime-empty", "Nessun job durevole registrato."));
    for (const job of (runtime.jobs || []).slice(0, 12)) {
      const card = element("article", "cc-runtime-job"); card.dataset.status = job.status;
      const head = element("div", "cc-runtime-job-head");
      head.append(element("b", "", job.jobType), element("span", "", statusLabel(job.status) + " · v" + String(job.version)));
      card.append(head, element("code", "", job.jobId), element("small", "", "Owner " + job.owner + " · tentativo " + String(job.attempt) + " · aggiornato " + timestamp(job.updatedAt) + (job.failureCode ? " · " + job.failureCode : "")));
      const exactTarget = controlTarget("JOB", job.jobId);
      if (exactTarget) {
        const action = exactTarget.actions[0];
        card.append(controlActionButton(action === "RETRY_FAILED_JOB" ? "Riprova con job successore" : "Riaccoda con job successore", action, exactTarget, job));
      }
      jobs.append(card);
    }
    target.append(jobs);
    const incidents = element("div", "cc-runtime-ledger");
    incidents.append(element("p", "cc-panel-label", "INCIDENTI OPERATIVI"));
    const records = Array.isArray(controls.incidents) ? controls.incidents.slice(0, 12) : [];
    if (records.length === 0) incidents.append(element("p", "cc-runtime-empty", "Nessun incidente durevole registrato."));
    for (const incident of records) {
      const card = element("article", "cc-runtime-job"); card.dataset.status = incident.status;
      card.append(element("div", "cc-runtime-job-head", undefined), element("code", "", incident.incidentId), element("small", "", incident.severity + " · " + incident.summaryCode + " · " + statusLabel(incident.status)));
      card.firstChild.append(element("b", "", "Incidente"), element("span", "", "v" + String(incident.version)));
      const exactTarget = controlTarget("INCIDENT", incident.incidentId);
      if (exactTarget) card.append(controlActionButton("Riconosci incidente", "ACKNOWLEDGE_INCIDENT", exactTarget, incident));
      incidents.append(card);
    }
    target.append(incidents);
  }

  function runtimeDatum(label, value) { const item = element("div"); item.append(element("span", "", label), element("b", "", value)); return item; }

  function renderAgents(agents) {
    const target = byId("agent-grid");
    const dossier = byId("agent-dossier");
    const focused = document.activeElement;
    const focusedCard = focused && typeof focused.closest === "function" ? focused.closest(".cc-agent") : null;
    const focusedAgentId = focusedCard ? focusedCard.dataset.agent : null;
    const visible = agents.filter((agent) => state.agentFilter === "ALL" || agentIdentity(agent.agentId).squad === state.agentFilter);
    target.replaceChildren();
    document.querySelectorAll("[data-agent-filter]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.agentFilter === state.agentFilter)));
    const partialCoverage = agents.some((agent) => agent.coverage === "LIMIT_REACHED");
    const observedWorkdays = agents.reduce((maximum, agent) => Math.max(maximum, Number(agent.observedWorkdays || 0)), 0);
    text("agent-filter-summary", String(visible.length) + " specialista/i visibili · metriche da task durevoli" + (partialCoverage ? " · finestra ultimi " + String(observedWorkdays) + " workday, copertura parziale" : " · copertura completa su " + String(observedWorkdays) + " workday"));
    if (!visible.some((agent) => agent.agentId === state.selectedAgentId)) state.selectedAgentId = visible[0] ? visible[0].agentId : null;
    for (const agent of visible) {
      const visual = agentIdentity(agent.agentId);
      const card = element("button", "cc-agent");
      card.type = "button";
      card.dataset.agent = agent.agentId;
      card.dataset.state = agent.state;
      card.dataset.squad = visual.squad;
      card.setAttribute("aria-pressed", String(agent.agentId === state.selectedAgentId));
      const head = element("div", "cc-agent-card-head");
      const emblem = element("span", "cc-agent-emblem", visual.glyph);
      const identity = element("div", "cc-agent-identity");
      identity.append(
        element("p", "cc-agent-call-sign", visual.squadLabel + " · " + visual.callSign),
        element("h3", "", agent.displayName),
        element("small", "cc-agent-executor", agent.agentId),
      );
      const status = element("span", "cc-agent-state", statusLabel(agent.state));
      status.dataset.state = agent.state;
      head.append(emblem, identity, status);
      const mission = element("div", "cc-agent-mission");
      mission.append(element("span", "", "MISSIONE"), element("p", "", agent.role));
      const stats = element("div", "cc-agent-card-stats");
      stats.append(
        agentCardMetric("Completati", boundedAgentValue(agent, agent.completedTasks)),
        agentCardMetric("First pass", boundedAgentValue(agent, agent.acceptedFirstPassTasks)),
        agentCardMetric("Bloccati", boundedAgentValue(agent, agent.blockedTasks)),
        agentCardMetric("Qualità", agent.averageQualityScore === "NOT_AVAILABLE" ? "—" : number(agent.averageQualityScore) + "/100"),
      );
      const power = element("div", "cc-agent-power");
      power.append(element("span", "", "CAPACITÀ"), element("code", "", agent.supportedTasks.join(" · ")), element("b", "", "Apri dossier →"));
      card.append(head, mission, stats, power);
      const selectAgent = () => { state.selectedAgentId = agent.agentId; renderAgents(agents); };
      card.addEventListener("click", selectAgent);
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectAgent();
      });
      target.append(card);
    }
    const selected = agents.find((agent) => agent.agentId === state.selectedAgentId);
    if (selected) renderAgentDossier(selected);
    else dossier.replaceChildren(element("div", "cc-list-empty", "Nessuno specialista disponibile nel reparto selezionato."));
    if (focusedAgentId) {
      const replacement = Array.from(target.querySelectorAll(".cc-agent")).find((card) => card.dataset.agent === focusedAgentId);
      if (replacement) replacement.focus();
    }
  }

  function renderTeamPulse(agents) {
    const ready = agents.filter((agent) => agent.state === "READY" || agent.state === "ACTIVE").length;
    const active = agents.filter((agent) => agent.state === "ACTIVE").length;
    const completed = agents.reduce((total, agent) => total + agent.completedTasks, 0);
    const guardians = agents.filter((agent) => agentIdentity(agent.agentId).squad === "GUARDIANS").length;
    const squads = new Set(agents.map((agent) => agentIdentity(agent.agentId).squad)).size;
    text("team-total", number(agents.length));
    text("team-ready", number(ready));
    text("team-active", number(active));
    text("team-completed", agents.some((agent) => agent.coverage === "LIMIT_REACHED") ? "≥ " + number(completed) : number(completed));
    text("apex-total", number(agents.length));
    text("apex-squads", number(squads));
    text("apex-guardians", number(guardians));
    text("tower-total", number(agents.length));
    text("tower-ready", number(ready));
    text("tower-guardians", number(guardians));
  }

  function renderAgentDossier(agent) {
    const target = byId("agent-dossier");
    const visual = agentIdentity(agent.agentId);
    target.replaceChildren();
    target.dataset.squad = visual.squad;
    const head = element("div", "cc-agent-dossier-head");
    head.append(element("span", "cc-agent-dossier-emblem", visual.glyph));
    const title = element("div");
    title.append(element("p", "cc-agent-call-sign", visual.squadLabel + " · " + visual.callSign), element("h3", "", agent.displayName), element("small", "", agent.executor));
    head.append(title);
    const status = element("span", "cc-agent-state", statusLabel(agent.state));
    status.dataset.state = agent.state;
    head.append(status);
    const mission = element("section", "cc-agent-dossier-mission");
    mission.append(element("span", "", "MISSIONE ASSEGNATA"), element("p", "", agent.role));
    const capability = element("section", "cc-agent-dossier-capability");
    capability.append(element("span", "", "POWER SET OPERATIVO"));
    for (const task of agent.supportedTasks) capability.append(element("code", "", task));
    const telemetry = element("div", "cc-agent-dossier-grid");
    telemetry.append(
      agentStat("Task completati · finestra", boundedAgentValue(agent, agent.completedTasks)),
      agentStat("First pass · finestra", boundedAgentValue(agent, agent.acceptedFirstPassTasks)),
      agentStat("Task bloccati · finestra", boundedAgentValue(agent, agent.blockedTasks)),
      agentStat("Revisioni · finestra", boundedAgentValue(agent, agent.revisionsRequired)),
      agentStat("Qualità media · finestra", agent.averageQualityScore === "NOT_AVAILABLE" ? "Dato non disponibile" : number(agent.averageQualityScore) + "/100"),
      agentStat("Tempo misurato · finestra", (agent.coverage === "LIMIT_REACHED" ? "≥ " : "") + duration(agent.measuredDurationMs)),
      agentStat("Costo misurato · finestra", (agent.coverage === "LIMIT_REACHED" ? "≥ " : "") + euro(agent.measuredCostCents)),
      agentStat("Autonomia", agent.autonomy),
    );
    const guardrail = element("div", "cc-agent-guardrail");
    guardrail.append(element("span", "", "Q · R · C"), element("p", "", "Quality, Risk e Cost Gate obbligatori. Nessuna pubblicazione, spesa, contatto, merge o deploy autonomo."));
    target.append(head, mission, capability, telemetry, guardrail);
  }

  function agentCardMetric(label, value) { const item = element("div"); item.append(element("span", "", label), element("strong", "", value)); return item; }

  function boundedAgentValue(agent, value) { return (agent.coverage === "LIMIT_REACHED" ? "≥ " : "") + number(value); }

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
        element("small", "", task.blocker ? agentBlockerText(task.blocker) : task.outputFingerprint ? "Fingerprint " + task.outputFingerprint.slice(0, 16) + "…" : "Output non ancora disponibile"),
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

  function agentBlockerText(blocker) { return "Blocco " + blocker.reasonCode + " · input " + blocker.missingInput + " · evidenza " + blocker.evidence.join(" / ") + " · rimedio " + blocker.remediation + " · owner " + blocker.owner + " · prossima azione " + blocker.nextAction; }

  function agentStat(label, value) { const item = element("div", "cc-agent-stat"); item.append(element("span", "", label), element("b", "", value)); return item; }
  function duration(milliseconds) { if (!Number.isFinite(milliseconds)) return "—"; if (milliseconds < 1000) return number(milliseconds) + " ms"; return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(milliseconds / 1000) + " s"; }

  function renderApprovals(productions, business, live, visualReview, mediaFactory, coverageLimited) {
    const pending = productions.filter((item) => item.status === "PENDING_FABIO_APPROVAL");
    const pendingBusiness = business.filter((item) => item.status === "PENDING_FABIO_APPROVAL");
    const reviewList = byId("approval-review-list");
    reviewList.replaceChildren();
    if (mediaFactory) reviewList.append(mediaFactoryApprovalCard(mediaFactory));
    if (pending.length === 0 && pendingBusiness.length === 0) {
      text("approval-title", mediaFactory ? "Pilot Live AI in attesa di Fabio" : coverageLimited ? "Nessuna richiesta nella finestra osservata" : "Nessun pacchetto richiede la decisione di Fabio");
      text("approval-detail", mediaFactory ? "Il factory mostra lo stato reale di budget, asset e gate. Non approva, programma o pubblica nulla." + (coverageLimited ? " La copertura delle approvazioni è parziale: il totale globale non è determinabile." : "") : coverageLimited ? "La copertura è parziale: riconciliare l'intera finestra prima di concludere che non esistano richieste." : "Un futuro pacchetto contenuti o dossier Business apparirà qui con versione esatta, fingerprint, evidenze e gate.");
      return;
    }
    const evidenceAttested = pending.filter((item) => item.evidencePack).length;
    text("approval-title", String(pendingBusiness.length) + " dossier Business e " + String(pending.length) + " pacchetto/i contenuto attendono Fabio");
    text("approval-detail", evidenceAttested === pending.length ? "La review appare soltanto dopo Quality Gate, Risk Gate ed Evidence Pack. L'approvazione resta interna e non autorizza programmazione o pubblicazione." : String(evidenceAttested) + " pacchetto/i contenuto sono attestati dalle evidenze; quelli privi di Evidence Pack restano non approvabili.");
    for (const record of pending) {
      const social = record.package.socialPublishingPack;
      if (!social || !record.evidencePack || record.package.risk.status !== "CLEAR") continue;
      const master = social.masterContentPack;
      const boundVisualReview = visualReviewBoundToRecord(visualReview, record) ? visualReview : null;
      const card = element("article", "cc-approval-review");
      const visualBlocked = !boundVisualReview;
      card.dataset.visualStatus = visualBlocked ? "blocked" : "ready";
      const head = element("div", "cc-approval-review-head");
      const identity = element("div");
      identity.append(element("p", "cc-panel-label", visualBlocked ? "REVIEW VISIVA BLOCCATA" : "REVIEW PRONTA DOPO I GATE"), element("h3", "", master ? master.topic : record.package.editorialPlan.selectedIdea), element("small", "", record.productionId + " · v" + String(record.version)));
      const gates = element("div", "cc-approval-gates");
      gates.append(element("span", "", "QUALITY " + String(record.package.quality.readinessScore) + "/100"), element("span", "", "RISK CLEAR"), element("span", "", "EVIDENCE PACK ALLEGATO"));
      const visualGate = element("span", "", visualBlocked ? "VISUAL GATE BLOCCATO" : "VISUAL GATE PRONTO"); visualGate.dataset.gate = visualBlocked ? "blocked" : "ready"; gates.append(visualGate);
      head.append(identity, gates);
      const visual = visualReviewGallery(boundVisualReview);
      const grid = element("div", "cc-approval-review-grid");
      const evidenceStatements = record.package.evidence.items.slice(0, 2).map((item) => item.statement);
      const insights = live && live.baseline.postCount > 0 ? String(live.baseline.postCount) + " snapshot importati" : "INSUFFICIENT_DATA · Insights dettagliati mancanti";
      const instagramCaption = boundVisualReview ? boundVisualReview.captions.instagram : (master ? master.nativeVariants.instagram.caption : "Caption non disponibile");
      const tiktokCaption = boundVisualReview ? boundVisualReview.captions.tiktok : "Caption TikTok non disponibile";
      const hashtagDetail = boundVisualReview ? "Instagram: " + boundVisualReview.hashtags.instagram.join(" ") + " · TikTok: " + boundVisualReview.hashtags.tiktok.join(" ") : "Main: " + (social.hashtagSets.main.join(" ") || "—") + " · Alternative: " + (social.hashtagSets.alternate.join(" ") || "—") + " · Test: " + (social.hashtagSets.experimental.join(" ") || "—");
      const audioDetail = boundVisualReview ? "Nessun audio selezionato. Audio originale Metodo Veloce solo dopo attestazione; altrimenti nessun audio." : (social.audioPlan.status === "AUDIO_NON_AUTORIZZATO" ? "Usare audio originale Metodo Veloce oppure nessun audio; nessuna traccia è programmabile." : (social.audioPlan.selected ? social.audioPlan.selected.title : "Nessun audio selezionato"));
      const windowDetail = boundVisualReview ? boundVisualReview.publicationWindows.windows.map((window) => window.platform + " " + window.variant + " · " + window.label + " · " + window.localTime).join(" | ") : social.publicationWindows.windows.map((window) => window.label + ": " + timestamp(window.startAt)).join(" · ");
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
        socialBlock("Audio", boundVisualReview ? statusLabel(boundVisualReview.audio.status) : statusLabel(social.audioPlan.status), audioDetail),
        socialBlock("Quattro finestre sperimentali", boundVisualReview ? "NON SONO ORARI OTTIMALI" : statusLabel(social.publicationWindows.status), windowDetail),
        socialBlock("Versione esatta", "SOCIAL + MASTER", "Social " + social.fingerprint.slice(0, 16) + "… · Master " + (master ? master.fingerprint.slice(0, 16) + "…" : "NON DISPONIBILE")),
        socialBlock("Conseguenze", statusLabel(social.approvalScope.scope), social.approvalScope.consequences.join(" "))
      );
      const fingerprint = element("code", "cc-approval-review-code", "Visual Asset Set V3 " + (boundVisualReview ? boundVisualReview.fingerprint : "NON DISPONIBILE O NON LEGATO") + "\\nSocial Pack " + social.fingerprint + "\\nMaster Content Pack " + (master ? master.fingerprint : "NON DISPONIBILE") + "\\nEvidence Pack " + record.evidencePack.fingerprint);
      const foot = element("div", "cc-approval-review-foot");
      foot.append(element("p", "", visualBlocked ? "Il Visual Gate non è superato: l'approvazione interna non viene proposta. Programmazione e pubblicazione restano separate e bloccate." : "L'approvazione autorizza soltanto questo pacchetto interno. Programmazione e pubblicazione restano separate e bloccate."), element("a", "cc-text-action", "Apri asset e azioni controllate →"));
      foot.lastChild.href = "#production";
      card.append(head, visual, grid, fingerprint, foot);
      collapseCardDetails(card, visualBlocked ? "Apri blocker e audit" : "Apri dossier completo");
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
    previous.addEventListener("click", () => { state.visualSlideIndex -= 1; renderApprovals(state.snapshot.productions, state.snapshot.business || [], state.snapshot.socialLive, state.visualReview, state.mediaFactory, isApprovalCoverageLimited(state.snapshot)); });
    next.addEventListener("click", () => { state.visualSlideIndex += 1; renderApprovals(state.snapshot.productions, state.snapshot.business || [], state.snapshot.socialLive, state.visualReview, state.mediaFactory, isApprovalCoverageLimited(state.snapshot)); });
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

  function mediaFactoryApprovalCard(factory) {
    const card = element("article", "cc-approval-review");
    const readyForFabio = factory.status === "PENDING_FABIO_APPROVAL" || factory.status === "READY_FOR_FABIO_REVIEW";
    card.dataset.visualStatus = readyForFabio ? "ready" : "blocked";
    const head = element("div", "cc-approval-review-head");
    const title = readyForFabio ? "PILOT LIVE AI · DECISIONE VISIVA RICHIESTA" : "PILOT LIVE AI · BLOCCATO IN SICUREZZA";
    const identity = element("div");
    identity.append(element("p", "cc-panel-label", title), element("h3", "", "Brand-Locked Media Factory"), element("small", "", "Solo asset locali · nessuna pubblicazione"));
    const gates = element("div", "cc-approval-gates");
    for (const [label, gate] of [["QUALITY", factory.qualityGate], ["RISK", factory.riskGate], ["COST", factory.costGate], ["VISUAL", factory.visualGate]]) {
      const status = gate && gate.status ? gate.status : "NON DISPONIBILE";
      const chip = element("span", "", label + " " + statusLabel(status));
      chip.dataset.gate = status.includes("PASS") || status.includes("PENDING_FABIO") ? "ready" : "blocked";
      gates.append(chip);
    }
    head.append(identity, gates); card.append(head);
    const grid = element("div", "cc-approval-review-grid");
    const calls = factory.liveCalls === undefined ? "—" : String(factory.liveCalls);
    const social = factory.social || {};
    const models = factory.models || { image: factory.imageModel, text: factory.textModel };
    const ledger = factory.costLedger || factory.costGate || {};
    const estimatedCost = typeof ledger.estimatedCumulativeCostUsd === "number" ? "USD " + ledger.estimatedCumulativeCostUsd.toFixed(3) : "—";
    const hardStopUsd = typeof ledger.hardStopUsd === "number" ? ledger.hardStopUsd : ledger.dailyHardLimitUsd;
    const budget = typeof hardStopUsd === "number" ? "Hard stop USD " + hardStopUsd + " · Budget API EUR " + String(ledger.apiBudgetEur || ledger.dailyApiBudgetEur || "—") : "Budget non disponibile";
    grid.append(
      socialBlock("Stato", statusLabel(factory.status), factory.reason || "Asset e gate sono conservati solo localmente."),
      socialBlock("Chiamate live", calls, "Il limite assoluto è otto; massimo una generazione immagine."),
      socialBlock("Provider", statusLabel(factory.provider || "NON DISPONIBILE"), "Il confine di generazione resta provider-neutral."),
      socialBlock("Modello testo", models.text || "—", "Solo il modello esplicitamente selezionato."),
      socialBlock("Modello immagine", models.image || "—", "Nessun fallback costoso o implicito."),
      socialBlock("Costo stimato", estimatedCost, budget),
      socialBlock("TikTok", statusLabel(social.tiktok || "BROWSER_CONNECTION_REQUIRED"), "Nessuna app, token, account o pubblicazione è inventata."),
      socialBlock("Instagram", statusLabel(social.instagram || "BROWSER_CONNECTION_REQUIRED"), "Nessuna app, token, account o pubblicazione è inventata.")
    );
    if (factory.diagnosis) {
      const diagnosis = factory.diagnosis;
      const diagnosticCost = diagnosis.cost || {};
      const diagnosticSession = diagnosis.session || {};
      grid.append(
        socialBlock("Diagnosi OpenAI", statusLabel(diagnosis.providerStatus || "NON DISPONIBILE"), "Stage " + (diagnosis.stage || "—") + " · codice " + (diagnosis.reasonCode || "NESSUNO")),
        socialBlock("Sessione testuale", String(diagnosticSession.liveCalls === undefined ? "—" : diagnosticSession.liveCalls) + "/2 chiamate", "Cap USD 0,02 · retry automatici 0 · immagini 0"),
        socialBlock("Costo diagnostica", typeof diagnosticCost.estimatedCostUsd === "number" ? "USD " + diagnosticCost.estimatedCostUsd.toFixed(6) : "DA RICONCILIARE", "Classificazione " + (diagnosticCost.classification || "—"))
      );
    }
    if (factory.responsesConformance) {
      const conformance = factory.responsesConformance;
      const conformanceCost = conformance.cost || {};
      const conformanceSession = conformance.session || {};
      const preflight = conformance.preflight || {};
      const previousShape = conformance.previousRequestShape || {};
      const canonicalShape = conformance.canonicalRequestShape || {};
      const provider = conformance.provider || {};
      const result = conformance.result || {};
      const fields = Array.isArray(canonicalShape.fieldNames) ? canonicalShape.fieldNames.join(", ") : "—";
      const previousFields = Array.isArray(previousShape.legacyPayloadFieldNames) ? previousShape.legacyPayloadFieldNames.join(", ") : "—";
      const diagnostic = provider.diagnostic || {};
      const parameter = diagnostic.providerParameter ? " · parametro " + diagnostic.providerParameter : "";
      grid.append(
        socialBlock("Conformità Responses", statusLabel(result.status || conformance.status || "NON DISPONIBILE"), "Gate " + statusLabel(conformance.conformanceGate && conformance.conformanceGate.status || "—") + " · provider " + statusLabel(provider.status || "—")),
        socialBlock("Shape precedente", previousFields, previousShape.rootCause || "Contratto storico non disponibile."),
        socialBlock("Shape corretta", (canonicalShape.method || preflight.method || "POST") + " " + (canonicalShape.endpoint || preflight.endpoint || "/v1/responses"), "Solo campi: " + fields),
        socialBlock("Sessione monouso", String(conformanceSession.liveCalls === undefined ? "—" : conformanceSession.liveCalls) + "/1 chiamata", "Cap USD 0,01 · retry 0 · immagini 0 · stato " + statusLabel(conformanceSession.status || "—")),
        socialBlock("Costo Responses", typeof conformanceCost.estimatedCostUsd === "number" ? "Stimato USD " + conformanceCost.estimatedCostUsd.toFixed(6) : "DA RICONCILIARE", "Effettivo non disponibile · riservato USD " + String(conformanceCost.reservedCostUsd === undefined ? "—" : conformanceCost.reservedCostUsd)),
        socialBlock("Diagnostica HTTP", diagnostic.httpStatus === undefined ? "Nessun errore HTTP" : "HTTP " + diagnostic.httpStatus + parameter, "Codice " + (result.reasonCode || "PROVIDER_PLAIN_READY") + " · nessun body o segreto esposto."),
        socialBlock("Visual Gate", statusLabel(conformance.visualGate && conformance.visualGate.status || "BLOCCATO"), "Nessuna immagine è autorizzata in questa milestone.")
      );
    }
    card.append(grid);
    if (factory.brandAssets || factory.fingerprint) {
      const provenance = element("div", "cc-approval-fingerprint");
      provenance.append(element("strong", "", "Provenienza e impronta"));
      if (factory.brandAssets) provenance.append(
        element("code", "", "Logo originale " + (factory.brandAssets.originalLogoSha256 || "—")),
        element("code", "", "Overlay tecnico " + (factory.brandAssets.technicalOverlaySha256 || "—"))
      );
      if (factory.fingerprint) provenance.append(element("code", "", "Fingerprint " + factory.fingerprint));
      card.append(provenance);
    }
    if (factory.assets && factory.assets.instagram && factory.assets.tiktok) {
      const canvases = element("div", "cc-visual-review-canvases");
      for (const platform of ["instagram", "tiktok"]) {
        const asset = factory.assets[platform];
        const frame = element("figure", "cc-visual-canvas");
        frame.append(element("span", "", platform.toUpperCase() + " · " + String(asset.width) + "×" + String(asset.height)));
        const image = document.createElement("img"); image.alt = "Variante locale Metodo Veloce per " + platform; image.src = "/" + asset.path; image.loading = "eager";
        frame.append(image); canvases.append(frame);
      }
      card.append(canvases);
    }
    const connections = factory.socialConnections || {};
    const connectorPanel = element("section", "cc-approval-review-grid");
    const connectorCheckpoint = "http://127.0.0.1:43123/";
    for (const [platform, label] of [["instagram", "Instagram"], ["tiktok", "TikTok"]]) {
      const status = connections[platform] || {};
      const shell = element("div", "cc-approval-review-code");
      shell.append(
        element("strong", "", label + " · " + statusLabel(status.state || "APP_CONFIGURATION_REQUIRED")),
        element("p", "", (status.expectedAccount || (platform === "instagram" ? "@mr.metodo.veloce_official" : "@metodo_veloce.official")) + " · PUBBLICAZIONE LOCKED")
      );
      const link = element("a", "cc-control-button", "Apri checkpoint locale");
      link.href = connectorCheckpoint; link.target = "_blank"; link.rel = "noopener noreferrer";
      shell.append(link, element("p", "", "Connessione, verifica, riconnessione e revoca restano operazioni esplicite nel runtime locale; questo link non ne esegue alcuna."));
      connectorPanel.append(shell);
    }
    card.append(connectorPanel);
    card.append(element("p", "", "Fabio deve verificare il Visual Gate e, in un unico checkpoint browser, collegare o verificare gli account TikTok e Instagram senza pubblicare."));
    collapseCardDetails(card, "Apri asset, costi e provenienza");
    return card;
  }

  function collapseCardDetails(card, label) {
    const children = Array.from(card.children).slice(1);
    if (children.length === 0) return;
    const disclosure = element("details", "cc-progressive-details");
    const body = element("div", "cc-progressive-details-body");
    body.append(...children);
    disclosure.append(element("summary", "", label), body);
    card.append(disclosure);
  }

  function navigate(query) {
    const normalized = query.toLocaleLowerCase("it-IT");
    const mapping = [["fingerprint", "vault"], ["riferiment", "vault"], ["creativ", "vault"], ["prefer", "vault"], ["vault", "vault"], ["trend", "social"], ["hashtag", "social"], ["audio", "social"], ["social", "social"], ["portfolio", "venture"], ["venture", "venture"], ["opportun", "venture"], ["capital", "venture"], ["esperiment", "venture"], ["revenue", "business"], ["ricav", "business"], ["vendit", "business"], ["funnel", "business"], ["lead", "business"], ["prezz", "business"], ["margine", "business"], ["business", "business"], ["econom", "business"], ["offert", "business"], ["validaz", "business"], ["approv", "approvals"], ["evid", "evidence"], ["fonte", "evidence"], ["claim", "evidence"], ["runtime", "runtime"], ["queue", "runtime"], ["agent", "agents"], ["produz", "production"], ["conten", "production"], ["pacchet", "production"]];
    const found = mapping.find(([keyword]) => normalized.includes(keyword));
    if (!found) { commandResult.textContent = "Prova con ricavi, offerta, funnel, evidenze, produzione, squadra o sistema."; return; }
    const nextHash = "#" + found[1];
    if (window.location.hash === nextHash) syncVisualContext();
    else window.location.hash = nextHash;
    commandResult.textContent = "Contesto aperto. Nessuna azione è stata eseguita.";
  }

  function syncVisualContext() {
    const candidate = window.location.hash.slice(1);
    const routes = {
      agents: ["team", "production"],
      approvals: ["today", "production"],
      business: ["studio", "business"],
      evidence: ["studio", "evidence"],
      governance: ["system", "production"],
      overview: ["today", "production"],
      production: ["studio", "production"],
      runtime: ["system", "production"],
      social: ["studio", "social"],
      studio: ["studio", root.dataset.activeStudio || "production"],
      system: ["system", "production"],
      team: ["team", "production"],
      today: ["today", "production"],
      vault: ["studio", "vault"],
      venture: ["studio", "venture"],
    };
    const route = routes[candidate] || routes.today;
    const previousView = root.dataset.activeView;
    const previousStudio = root.dataset.activeStudio;
    root.dataset.activeView = route[0];
    root.dataset.activeStudio = route[1];
    root.dataset.section = candidate || "today";
    root.querySelectorAll(".cc-main > [data-primary-view]").forEach((panel) => {
      const visible = panel.dataset.primaryView === route[0];
      panel.hidden = !visible;
      panel.setAttribute("aria-hidden", String(!visible));
    });
    root.querySelectorAll("[data-studio-panel]").forEach((panel) => {
      const visible = route[0] === "studio" && panel.dataset.studioPanel === route[1];
      panel.hidden = !visible;
      panel.setAttribute("aria-hidden", String(!visible));
    });
    root.querySelectorAll(".cc-nav a[data-view-target]").forEach((link) => {
      const active = link.dataset.viewTarget === route[0];
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    root.querySelectorAll("[data-studio-target]").forEach((button) => {
      const active = button.dataset.studioTarget === route[1];
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    const viewCopy = {
      studio: ["Studio", "Produzione, intelligence e riferimenti in un unico spazio."],
      system: ["Sistema", "Runtime, flussi e vincoli operativi senza rumore."],
      team: ["Squadra Apex", "Diciassette specialisti coordinati da un solo comando."],
      today: ["Buongiorno, Fabio.", "Qui trovi il prossimo collo di bottiglia tra lavoro e ricavo."],
    };
    const heading = root.querySelector(".cc-command-title h1");
    const subtitle = root.querySelector(".cc-topbar-subtitle");
    if (heading) heading.textContent = viewCopy[route[0]][0];
    if (subtitle) subtitle.textContent = viewCopy[route[0]][1];
    if (previousView !== route[0] || previousStudio !== route[1]) {
      const main = root.querySelector(".cc-main");
      if (main && typeof main.scrollTo === "function") main.scrollTo({ behavior: prefersReducedMotion() ? "auto" : "smooth", top: 0 });
      window.scrollTo({ behavior: prefersReducedMotion() ? "auto" : "smooth", top: 0 });
      emitMotion("route", { selector: candidate && /^[a-zA-Z0-9_-]+$/.test(candidate) ? "#" + candidate : "#today" });
    }
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
    const wasOpen = root.dataset.mobileSidebar === "open";
    const drawerOpen = mobileSidebar.matches && open;
    if (drawerOpen && !wasOpen) state.mobileReturnFocus = document.activeElement;
    root.dataset.mobileSidebar = drawerOpen ? "open" : "closed";
    mobileMenuToggle.setAttribute("aria-expanded", String(drawerOpen));
    mobileMenuToggle.setAttribute("aria-label", drawerOpen ? "Chiudi il menu del Centro di Comando" : "Apri il menu del Centro di Comando");
    sidebarBackdrop.hidden = !drawerOpen;
    sidebar.toggleAttribute("inert", mobileSidebar.matches && !drawerOpen);
    if (mobileSidebar.matches && !drawerOpen) sidebar.setAttribute("aria-hidden", "true");
    else sidebar.removeAttribute("aria-hidden");
    const main = root.querySelector(".cc-main");
    if (main) {
      main.toggleAttribute("inert", drawerOpen);
      if (drawerOpen) main.setAttribute("aria-hidden", "true");
      else main.removeAttribute("aria-hidden");
    }
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    if (drawerOpen && !wasOpen) {
      const first = sidebar.querySelector('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])');
      if (first) first.focus();
    } else if (!drawerOpen && wasOpen) {
      const returnFocus = state.mobileReturnFocus && typeof state.mobileReturnFocus.focus === "function" ? state.mobileReturnFocus : mobileMenuToggle;
      state.mobileReturnFocus = null;
      returnFocus.focus();
    }
  }

  function toggleSidebar() {
    if (mobileSidebar.matches) { setMobileSidebar(root.dataset.mobileSidebar !== "open"); return; }
    setDesktopSidebar(state.sidebarState === "expanded" ? "compact" : "expanded", true);
  }

  function initializeSidebar() {
    if (root.dataset.navigation === "dock") {
      sidebarToggle.hidden = true;
      mobileMenuToggle.hidden = true;
      sidebarBackdrop.hidden = true;
      sidebar.removeAttribute("inert");
      sidebar.removeAttribute("aria-hidden");
      root.dataset.mobileSidebar = "closed";
      return;
    }
    setDesktopSidebar(storedSidebarState(), false);
    setMobileSidebar(false);
    sidebarToggle.addEventListener("click", toggleSidebar);
    mobileMenuToggle.addEventListener("click", toggleSidebar);
    for (const button of [sidebarToggle, mobileMenuToggle]) button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleSidebar();
    });
    sidebarBackdrop.addEventListener("click", () => setMobileSidebar(false));
    sidebar.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => { if (mobileSidebar.matches) setMobileSidebar(false); }));
    if (typeof mobileSidebar.addEventListener === "function") {
      mobileSidebar.addEventListener("change", () => setMobileSidebar(false));
    }
  }

  function initializeViewControls() {
    document.querySelectorAll("[data-studio-target]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.dataset.studioTarget || "production";
        const nextHash = "#" + target;
        if (window.location.hash === nextHash) syncVisualContext();
        else window.location.hash = nextHash;
      });
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const controls = Array.from(document.querySelectorAll("[data-studio-target]"));
        const current = controls.indexOf(button);
        if (current < 0) return;
        event.preventDefault();
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1 : (current + (event.key === "ArrowLeft" ? -1 : 1) + controls.length) % controls.length;
        const next = controls[nextIndex];
        next.focus();
        next.click();
      });
    });
  }

  function showVentureTool(tool, focus) {
    state.ventureTool = tool;
    root.querySelectorAll("[data-venture-target]").forEach((button) => {
      const active = button.dataset.ventureTarget === tool;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
    });
    root.querySelectorAll("[data-venture-panel]").forEach((panel) => {
      const visible = panel.dataset.venturePanel === tool;
      panel.hidden = !visible;
      panel.setAttribute("aria-hidden", String(!visible));
    });
  }

  function initializeVentureControls() {
    const controls = Array.from(root.querySelectorAll("[data-venture-target]"));
    for (const button of controls) {
      button.addEventListener("click", () => showVentureTool(button.dataset.ventureTarget || "radar", false));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const current = controls.indexOf(button);
        if (current < 0) return;
        event.preventDefault();
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1 : (current + (event.key === "ArrowLeft" ? -1 : 1) + controls.length) % controls.length;
        const next = controls[nextIndex];
        showVentureTool(next.dataset.ventureTarget || "radar", true);
      });
    }
    showVentureTool(state.ventureTool, false);
  }

  function initializeAgentControls() {
    document.querySelectorAll("[data-agent-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.agentFilter = button.dataset.agentFilter || "ALL";
        state.selectedAgentId = null;
        if (state.snapshot) renderAgents(state.snapshot.agents);
      });
    });
  }

  function initializeVaultControls() {
    document.querySelectorAll("[data-vault-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.vaultFilter = button.dataset.vaultFilter || "ALL";
        state.selectedReferenceId = null;
        if (state.snapshot) renderReferenceVault(state.snapshot.referenceVault || { assets: [], businessContext: null, decisions: [], missingInputs: ["Nessun riferimento importato"], outcomeLinks: [], rightsBlockers: [], visualFingerprint: null, writingFingerprint: null });
      });
    });
  }

  function prepareAmbientMotion() {
    const reset = () => { root.style.setProperty("--cc-parallax-x", "0px"); root.style.setProperty("--cc-parallax-y", "0px"); };
    root.addEventListener("pointermove", (event) => {
      if (prefersReducedMotion()) { reset(); return; }
      const x = Math.round(((event.clientX / Math.max(window.innerWidth, 1)) - .5) * 12);
      const y = Math.round(((event.clientY / Math.max(window.innerHeight, 1)) - .5) * 8);
      root.style.setProperty("--cc-parallax-x", String(x) + "px");
      root.style.setProperty("--cc-parallax-y", String(y) + "px");
    });
    root.addEventListener("pointerleave", reset);
    window.addEventListener("scroll", () => { root.style.setProperty("--cc-scroll-shift", prefersReducedMotion() ? "0px" : String(Math.min(8, Math.round(window.scrollY * .018))) + "px"); }, { passive: true });
    if (typeof reducedMotionQuery.addEventListener === "function") reducedMotionQuery.addEventListener("change", reset);
  }

  commandForm.addEventListener("submit", (event) => { event.preventDefault(); void proposeOraclePrompt(); });
  commandNavigate.addEventListener("click", () => { navigate(commandInput.value.trim()); });
  document.addEventListener("keydown", (event) => {
    if (!actionConfirmation.hidden) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); commandInput.focus(); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b" && root.dataset.navigation !== "dock") { event.preventDefault(); toggleSidebar(); }
    if (event.key === "Escape" && mobileSidebar.matches && root.dataset.mobileSidebar === "open") { event.preventDefault(); setMobileSidebar(false); return; }
    if (event.key === "Tab" && mobileSidebar.matches && root.dataset.mobileSidebar === "open") {
      const controls = Array.from(sidebar.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'));
      if (controls.length === 0) { event.preventDefault(); mobileMenuToggle.focus(); return; }
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  document.querySelectorAll("[data-confirmation-close]").forEach((button) => button.addEventListener("click", () => closeActionConfirmation("Azione annullata: nessuna modifica eseguita.")));
  actionConfirmationSubmit.addEventListener("click", () => { void confirmPendingAction(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !actionConfirmation.hidden) {
      closeActionConfirmation("Azione annullata: nessuna modifica eseguita.");
      return;
    }
    if (event.key !== "Tab" || actionConfirmation.hidden) return;
    const controls = Array.from(actionConfirmation.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'));
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.addEventListener("hashchange", syncVisualContext);
  initializeSidebar();
  initializeViewControls();
  initializeVentureControls();
  initializeAgentControls();
  initializeVaultControls();
  syncVisualContext();
  prepareAmbientMotion();
  connectLiveEvents();
  window.addEventListener("beforeunload", () => {
    emitMotion("stop", { reasonCode: "BROWSER_UNLOAD" });
    if (state.eventSource) state.eventSource.close();
    if (state.liveFallbackInterval !== null) window.clearInterval(state.liveFallbackInterval);
    if (state.liveRefreshTimer !== null) window.clearTimeout(state.liveRefreshTimer);
  });
})();
`;
