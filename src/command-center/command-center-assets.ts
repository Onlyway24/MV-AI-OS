export const COMMAND_CENTER_HTML = `
<div class="cc-app" id="command-center">
  <aside class="cc-sidebar" aria-label="Navigazione del Centro di Comando">
    <a class="cc-brand" href="#overview" aria-label="Panoramica del Centro di Comando Onlyway">
      <span class="cc-brand-mark" aria-hidden="true">OW</span>
      <span><b>ONLYWAY</b><small>CENTRO DI COMANDO</small></span>
    </a>
    <nav class="cc-nav">
      <p>PANORAMICA</p>
      <a class="is-active" href="#overview">Quadro operativo</a>
      <a href="#production">Centro Produzione</a>
      <a href="#approvals">Centro Approvazioni</a>
      <p>COMPAGNIA AGENTI</p>
      <a href="#agents">Compagnia Agenti</a>
      <p>CONOSCENZA</p>
      <a href="#evidence">Centro Evidenze</a>
      <p>OPERAZIONI</p>
      <a href="#runtime">Runtime H24</a>
      <p>GOVERNANCE</p>
      <a href="#governance">Regole di sicurezza</a>
    </nav>
    <div class="cc-sidebar-foot">
      <span class="cc-live-dot" aria-hidden="true"></span>
      <span>API privata locale</span>
    </div>
  </aside>

  <main class="cc-main">
    <header class="cc-topbar">
      <div>
        <p class="cc-eyebrow">SISTEMA OPERATIVO PRIVATO</p>
        <h1>Centro di Comando</h1>
      </div>
      <div class="cc-system-line" aria-label="Quadro operativo corrente">
        <span><i class="cc-status-dot" data-status-dot aria-hidden="true"></i>Sistema <b id="system-status">Caricamento</b></span>
        <span>Autonomia <b id="autonomy-status">A3 — Propositiva</b></span>
        <span>Azioni esterne <b class="cc-lock">BLOCCATE</b></span>
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
      <div class="cc-section-heading">
        <div><p class="cc-kicker">PANORAMICA</p><h2 id="overview-heading">Quadro operativo</h2></div>
        <time id="generated-at"></time>
      </div>
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
      <div class="cc-metrics" id="metric-grid" aria-live="polite"></div>
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

    <section class="cc-section" id="production" aria-labelledby="production-heading">
      <div class="cc-section-heading"><div><p class="cc-kicker">METODO VELOCE</p><h2 id="production-heading">Centro Produzione</h2></div><p class="cc-section-note">Seleziona un record per ispezionare gli asset esatti del pacchetto.</p></div>
      <div class="cc-production-layout">
        <div class="cc-kanban" id="production-lanes" aria-live="polite"></div>
        <aside class="cc-preview" aria-labelledby="preview-heading">
          <div class="cc-preview-heading"><p class="cc-kicker">ANTEPRIMA PACCHETTO</p><h3 id="preview-heading">Asset reali del contenuto</h3></div>
          <div id="package-preview" class="cc-preview-body"></div>
        </aside>
      </div>
    </section>

    <section class="cc-section" id="evidence" aria-labelledby="evidence-heading">
      <div class="cc-section-heading"><div><p class="cc-kicker">CONOSCENZA</p><h2 id="evidence-heading">Centro Evidenze</h2></div><p class="cc-section-note">Supporto ai claim, provenienza e freshness dalla fonte di registrazione.</p></div>
      <div class="cc-evidence-grid">
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
      <div class="cc-agent-grid" id="agent-grid"></div>
      <div class="cc-intentional-empty"><span aria-hidden="true">◇</span><div><b>Le altre divisioni non sono mostrate come agenti attivi.</b><p>Restano specifiche finché non sono registrati un runtime eseguibile e telemetria reale.</p></div></div>
    </section>

    <section class="cc-section" id="approvals" aria-labelledby="approvals-heading">
      <div class="cc-section-heading"><div><p class="cc-kicker">GOVERNANCE</p><h2 id="approvals-heading">Centro Approvazioni</h2></div></div>
      <div class="cc-approval-panel"><div><p class="cc-panel-label">CONTROLLO FABIO</p><h3 id="approval-title">Lettura dello stato di approvazione</h3><p id="approval-detail">Il registro delle approvazioni supportate da evidenze è in caricamento.</p></div><a class="cc-text-action" href="#production">Ispeziona i pacchetti <span aria-hidden="true">→</span></a></div>
    </section>

    <section class="cc-section" id="governance" aria-labelledby="governance-heading">
      <div class="cc-governance"><span class="cc-lock-glyph" aria-hidden="true">⌁</span><div><p class="cc-kicker">PIANO DELLE AZIONI ESTERNE</p><h2 id="governance-heading">La pubblicazione resta bloccata per progettazione.</h2><p>Nessun controllo dal browser può pubblicare, spendere, contattare clienti, modificare un CRM o fare deploy. Ogni futura azione autorizzata dovrà attraversare i confini esistenti di dry-run, approvazione, ricevuta e kill switch.</p></div></div>
    </section>
  </main>
</div>
`;

export const COMMAND_CENTER_CSS = `
:root{color-scheme:dark;--cc-bg:#050505;--cc-surface:#0d0d0f;--cc-elevated:#151517;--cc-gold:#d1ab5c;--cc-bright:#e8cc8b;--cc-ivory:#f1ede5;--cc-muted:#8b8985;--cc-border:rgba(209,171,92,.28);--cc-line:rgba(241,237,229,.09);--cc-success:#65a77a;--cc-danger:#d45d5d;--cc-shadow:0 24px 80px rgba(0,0,0,.42)}
*{box-sizing:border-box}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}html{scroll-behavior:smooth;background:var(--cc-bg)}body{margin:0;background:radial-gradient(circle at 74% 5%,rgba(209,171,92,.09),transparent 24rem),var(--cc-bg);color:var(--cc-ivory);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;line-height:1.5}.cc-app{min-height:100vh;display:grid;grid-template-columns:252px minmax(0,1fr)}.cc-sidebar{position:sticky;top:0;height:100vh;padding:30px 18px 18px;border-right:1px solid var(--cc-line);background:linear-gradient(180deg,rgba(13,13,15,.95),rgba(5,5,5,.92));display:flex;flex-direction:column}.cc-brand{display:flex;gap:12px;align-items:center;color:var(--cc-ivory);text-decoration:none;margin:0 8px 44px}.cc-brand-mark{display:grid;place-items:center;width:34px;height:34px;border:1px solid var(--cc-border);border-radius:50%;color:var(--cc-bright);font-family:Georgia,"Times New Roman",serif;font-size:12px;letter-spacing:.08em;box-shadow:inset 0 0 20px rgba(209,171,92,.08)}.cc-brand b,.cc-brand small{display:block}.cc-brand b{font-family:Georgia,"Times New Roman",serif;font-size:14px;letter-spacing:.12em;font-weight:500}.cc-brand small{font-size:9px;letter-spacing:.17em;color:var(--cc-muted);margin-top:1px}.cc-nav{display:grid;gap:3px}.cc-nav p{color:#686560;font-size:9px;letter-spacing:.15em;margin:19px 10px 5px}.cc-nav a{border-left:1px solid transparent;color:var(--cc-muted);font-size:12px;padding:8px 10px;text-decoration:none;transition:color .28s ease,border-color .28s ease,background .28s ease}.cc-nav a:hover,.cc-nav a.is-active{color:var(--cc-ivory);border-left-color:var(--cc-gold);background:linear-gradient(90deg,rgba(209,171,92,.09),transparent)}.cc-sidebar-foot{margin-top:auto;border-top:1px solid var(--cc-line);padding:16px 10px 0;color:var(--cc-muted);display:flex;align-items:center;gap:8px;font-size:11px}.cc-live-dot,.cc-status-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--cc-success);box-shadow:0 0 0 4px rgba(101,167,122,.08)}.cc-main{width:min(1600px,100%);margin:0 auto;padding:28px clamp(22px,4vw,72px) 80px}.cc-topbar{display:grid;grid-template-columns:minmax(220px,1fr) auto auto;gap:28px;align-items:center;border-bottom:1px solid var(--cc-line);padding:0 0 23px}.cc-eyebrow,.cc-kicker,.cc-panel-label,.cc-brief-label{margin:0;color:var(--cc-gold);font-size:10px;letter-spacing:.16em}.cc-topbar h1,.cc-section h2,.cc-section h3{font-family:Georgia,"Times New Roman",serif;font-weight:400;letter-spacing:-.025em}.cc-topbar h1{font-size:31px;line-height:1.1;margin:5px 0 0}.cc-system-line{display:flex;gap:14px;flex-wrap:wrap;color:var(--cc-muted);font-size:11px}.cc-system-line span{white-space:nowrap}.cc-system-line b{color:var(--cc-ivory);font-weight:500;margin-left:3px}.cc-system-line .cc-lock{color:var(--cc-bright);letter-spacing:.09em}.cc-operator{display:flex;gap:10px;align-items:center;border-left:1px solid var(--cc-line);padding-left:24px}.cc-avatar{width:30px;height:30px;border:1px solid var(--cc-border);border-radius:50%;display:grid;place-items:center;color:var(--cc-bright);font-family:Georgia,"Times New Roman",serif}.cc-operator b,.cc-operator small{display:block}.cc-operator b{font-size:12px;font-weight:500}.cc-operator small{font-size:10px;color:var(--cc-muted)}.cc-command{margin:24px 0 0;display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;background:rgba(21,21,23,.72);border:1px solid var(--cc-line);padding:0 14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.02),var(--cc-shadow)}.cc-command:focus-within{border-color:var(--cc-border);box-shadow:inset 0 0 0 1px rgba(209,171,92,.08),var(--cc-shadow)}.cc-command>span{color:var(--cc-gold);font-size:17px}.cc-command input{min-width:0;height:52px;background:transparent;border:0;outline:0;color:var(--cc-ivory);font:inherit;font-size:13px}.cc-command input::placeholder{color:#77736d}.cc-command kbd{border:1px solid var(--cc-line);padding:2px 6px;color:var(--cc-muted);font:10px ui-monospace,SFMono-Regular,Menlo,monospace}.cc-command-result{min-height:18px;margin:7px 2px 0;color:var(--cc-muted);font-size:11px}.cc-section{margin-top:54px}.cc-section-heading{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:20px}.cc-section-heading h2{margin:4px 0 0;font-size:28px;line-height:1.13}.cc-section-heading time,.cc-section-note{margin:0;color:var(--cc-muted);font-size:11px}.cc-hero-grid{display:grid;grid-template-columns:minmax(340px,1.1fr) minmax(280px,.9fr);gap:18px}.cc-system-core,.cc-brief,.cc-evidence-panel,.cc-runtime-console,.cc-runtime-jobs,.cc-approval-panel,.cc-governance{background:linear-gradient(145deg,rgba(21,21,23,.92),rgba(10,10,11,.9));border:1px solid var(--cc-line);box-shadow:var(--cc-shadow)}.cc-system-core{min-height:332px;position:relative;overflow:hidden;display:grid;place-items:center;isolation:isolate;background:radial-gradient(circle at center,rgba(209,171,92,.12),transparent 25%),linear-gradient(145deg,rgba(21,21,23,.92),rgba(10,10,11,.9))}.cc-core-orbit{position:absolute;border:1px solid rgba(209,171,92,.24);border-radius:50%;animation:cc-orbit 18s linear infinite}.cc-core-orbit-a{width:170px;height:170px}.cc-core-orbit-b{width:250px;height:250px;border-style:dashed;opacity:.65;animation-duration:29s;animation-direction:reverse}.cc-core-orbit-c{width:330px;height:330px;opacity:.28;animation-duration:40s}.cc-core-center{z-index:1;width:132px;height:132px;border:1px solid var(--cc-border);border-radius:50%;display:flex;flex-direction:column;justify-content:center;align-items:center;background:radial-gradient(circle,rgba(209,171,92,.12),rgba(13,13,15,.92) 68%);box-shadow:0 0 40px rgba(209,171,92,.08),inset 0 0 36px rgba(209,171,92,.07);text-align:center}.cc-core-label{color:var(--cc-muted);font-size:9px;letter-spacing:.12em}.cc-core-center strong{color:var(--cc-bright);font-family:Georgia,"Times New Roman",serif;font-size:20px;font-weight:400;letter-spacing:.06em;margin:3px 0}.cc-core-center small{max-width:100px;color:var(--cc-muted);font-size:9px;line-height:1.25}.cc-core-node{position:absolute;z-index:1;color:var(--cc-muted);font-size:10px;line-height:1.25;text-align:center}.cc-node-top{top:28px}.cc-node-right{right:8%;top:47%}.cc-node-bottom{bottom:22px}.cc-node-left{left:8%;top:47%}.cc-brief{padding:34px;display:flex;flex-direction:column;justify-content:center}.cc-brief h2{font-size:29px;margin:6px 0 26px}.cc-brief strong{font-family:Georgia,"Times New Roman",serif;font-size:21px;font-weight:400;color:var(--cc-bright);line-height:1.2}.cc-brief p{color:var(--cc-muted);margin:11px 0 0;font-size:12px}.cc-brief-rule,.cc-runtime-rule{height:1px;background:var(--cc-line);margin:25px 0 16px}.cc-brief-label{font-size:9px!important;color:var(--cc-gold)!important;margin:0!important}.cc-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-top:16px}.cc-metric{padding:17px;background:rgba(13,13,15,.76);border:1px solid var(--cc-line);min-height:120px}.cc-metric .cc-metric-label{display:block;color:var(--cc-muted);font-size:10px;line-height:1.3}.cc-metric strong{display:block;font-family:Georgia,"Times New Roman",serif;font-size:30px;font-weight:400;line-height:1;margin:14px 0 9px}.cc-metric p{color:var(--cc-muted);font-size:10px;line-height:1.35;margin:0}.cc-metric[data-tone="gold"] strong{color:var(--cc-bright)}.cc-metric[data-tone="success"] strong{color:var(--cc-success)}.cc-metric[data-tone="attention"] strong{color:var(--cc-danger)}.cc-pipeline{display:grid;grid-template-columns:1fr 28px 1fr 28px 1fr 28px 1fr 28px 1fr;align-items:center}.cc-pipeline-node{min-height:126px;padding:19px 16px;border-top:1px solid var(--cc-line);border-bottom:1px solid var(--cc-line);position:relative;background:linear-gradient(180deg,rgba(21,21,23,.54),transparent)}.cc-pipeline-node:before{content:"";position:absolute;left:0;top:0;width:28px;height:1px;background:var(--cc-gold)}.cc-pipeline-node span{color:var(--cc-gold);font:10px ui-monospace,SFMono-Regular,Menlo,monospace}.cc-pipeline-node b,.cc-pipeline-node small{display:block}.cc-pipeline-node b{font-family:Georgia,"Times New Roman",serif;font-size:17px;font-weight:400;margin:12px 0 7px}.cc-pipeline-node strong{font-size:19px;color:var(--cc-bright);font-weight:500}.cc-pipeline-node small{color:var(--cc-muted);font-size:10px;margin-top:1px}.cc-pipeline-link{height:1px;background:linear-gradient(90deg,var(--cc-border),transparent);position:relative}.cc-pipeline-link:after{content:"";position:absolute;right:0;top:-3px;border-left:5px solid var(--cc-gold);border-top:3px solid transparent;border-bottom:3px solid transparent}.cc-production-layout{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(330px,.9fr);gap:18px}.cc-kanban{display:grid;gap:11px}.cc-lane{border-top:1px solid var(--cc-line);padding:14px 0 2px}.cc-lane-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}.cc-lane-head b{font-size:10px;letter-spacing:.14em;color:var(--cc-gold);font-weight:500}.cc-lane-head span{color:var(--cc-muted);font:10px ui-monospace,SFMono-Regular,Menlo,monospace}.cc-production-card{width:100%;text-align:left;border:1px solid var(--cc-line);border-left:2px solid var(--cc-border);background:rgba(21,21,23,.68);padding:15px;display:grid;gap:10px;color:var(--cc-ivory);font:inherit;cursor:pointer;transition:border-color .22s ease,background .22s ease,transform .22s ease}.cc-production-card:hover,.cc-production-card[aria-pressed="true"]{border-color:var(--cc-border);border-left-color:var(--cc-bright);background:rgba(30,29,27,.88);transform:translateX(3px)}.cc-card-meta{display:flex;justify-content:space-between;gap:12px;color:var(--cc-muted);font-size:10px}.cc-production-card h3{font-family:Georgia,"Times New Roman",serif;font-size:18px;font-weight:400;line-height:1.18;margin:0}.cc-card-signals{display:flex;gap:12px;flex-wrap:wrap;color:var(--cc-muted);font-size:10px}.cc-card-signals b{color:var(--cc-ivory);font-weight:500}.cc-preview{position:sticky;top:22px;height:max-content;border:1px solid var(--cc-line);background:linear-gradient(155deg,rgba(21,21,23,.95),rgba(10,10,11,.95));box-shadow:var(--cc-shadow)}.cc-preview-heading{padding:22px 23px 17px;border-bottom:1px solid var(--cc-line)}.cc-preview-heading h3{margin:5px 0 0;font-size:22px;font-weight:400}.cc-preview-body{padding:22px}.cc-preview-empty,.cc-list-empty{min-height:210px;display:grid;place-items:center;text-align:center;color:var(--cc-muted);font-size:12px;padding:24px}.cc-preview-empty span{display:block;color:var(--cc-gold);font:42px Georgia,"Times New Roman",serif;margin-bottom:9px}.cc-asset-frame{width:min(100%,290px);aspect-ratio:4/5;margin:0 auto;background:linear-gradient(145deg,rgba(209,171,92,.15),rgba(13,13,15,.9) 53%),#0b0b0c;border:1px solid var(--cc-border);padding:23px;display:flex;flex-direction:column}.cc-asset-frame .cc-asset-index{color:var(--cc-gold);font-size:10px;letter-spacing:.15em}.cc-asset-frame h4{font-family:Georgia,"Times New Roman",serif;font-size:28px;line-height:1.05;font-weight:400;margin:22px 0 0}.cc-asset-frame p{color:var(--cc-muted);font-size:11px;line-height:1.45;margin-top:auto}.cc-preview-nav{display:flex;align-items:center;justify-content:space-between;margin:15px 0}.cc-preview-nav button{color:var(--cc-ivory);background:transparent;border:1px solid var(--cc-line);padding:6px 10px;cursor:pointer;font:inherit;font-size:11px}.cc-preview-nav button:hover{border-color:var(--cc-border);color:var(--cc-bright)}.cc-preview-nav span{color:var(--cc-muted);font-size:10px}.cc-preview-details{border-top:1px solid var(--cc-line);padding-top:15px;margin-top:18px}.cc-preview-details p{color:var(--cc-muted);font-size:11px;line-height:1.45;margin:6px 0}.cc-preview-details b{color:var(--cc-ivory);font-weight:500}.cc-evidence-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.cc-evidence-panel{min-height:236px;padding:20px}.cc-panel-label{font-size:9px}.cc-list{display:grid;gap:9px;margin-top:15px}.cc-list-item{padding:11px 0;border-bottom:1px solid var(--cc-line);display:grid;gap:3px}.cc-list-item:last-child{border-bottom:0}.cc-list-item b{font-size:12px;font-weight:500}.cc-list-item p{color:var(--cc-muted);font-size:10px;line-height:1.4;margin:0;overflow-wrap:anywhere}.cc-list-item span{color:var(--cc-gold);font:9px ui-monospace,SFMono-Regular,Menlo,monospace}.cc-list-empty{min-height:160px;padding:15px}.cc-runtime-grid{display:grid;grid-template-columns:minmax(290px,.8fr) minmax(0,1.2fr);gap:16px}.cc-runtime-console,.cc-runtime-jobs{padding:26px;min-height:240px}.cc-runtime-console>strong{display:block;font-family:Georgia,"Times New Roman",serif;font-weight:400;font-size:23px;line-height:1.15;color:var(--cc-bright);margin-top:15px}.cc-runtime-console>p{color:var(--cc-muted);font-size:12px;margin:11px 0 0}.cc-runtime-console dl{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:0}.cc-runtime-console dl div{display:grid;gap:3px}.cc-runtime-console dt{color:var(--cc-muted);font-size:10px}.cc-runtime-console dd{margin:0;font-size:12px;color:var(--cc-ivory)}.cc-runtime-state{color:var(--cc-bright);font:10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em}.cc-runtime-bars{display:grid;gap:15px;margin-top:22px}.cc-runtime-bar{display:grid;grid-template-columns:105px minmax(0,1fr) 28px;gap:10px;align-items:center}.cc-runtime-bar span{color:var(--cc-muted);font-size:10px}.cc-runtime-bar b{font-weight:500;color:var(--cc-ivory);text-align:right;font-size:12px}.cc-runtime-track{height:5px;background:rgba(241,237,229,.07);overflow:hidden}.cc-runtime-fill{height:100%;background:linear-gradient(90deg,var(--cc-gold),var(--cc-bright));min-width:0;transition:width .45s ease}.cc-runtime-bar[data-tone="danger"] .cc-runtime-fill{background:var(--cc-danger)}.cc-agent-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}.cc-agent{padding:22px;border:1px solid var(--cc-line);background:linear-gradient(90deg,rgba(21,21,23,.8),rgba(21,21,23,.35));display:grid;grid-template-columns:minmax(180px,1fr) repeat(3,minmax(110px,.5fr));gap:18px;align-items:center}.cc-agent h3{font-family:Georgia,"Times New Roman",serif;font-size:23px;font-weight:400;margin:4px 0}.cc-agent p{color:var(--cc-muted);font-size:11px;margin:0}.cc-agent-stat{border-left:1px solid var(--cc-line);padding-left:18px}.cc-agent-stat span{color:var(--cc-muted);font-size:10px;display:block}.cc-agent-stat b{color:var(--cc-bright);font-size:12px;font-weight:500;display:block;margin-top:4px}.cc-intentional-empty{margin-top:14px;padding:17px 19px;border-top:1px solid var(--cc-line);border-bottom:1px solid var(--cc-line);display:flex;gap:14px;align-items:center;color:var(--cc-muted)}.cc-intentional-empty>span{color:var(--cc-gold);font-size:24px}.cc-intentional-empty b{color:var(--cc-ivory);font-size:12px;font-weight:500}.cc-intentional-empty p{font-size:11px;margin:3px 0 0}.cc-approval-panel{padding:28px;display:flex;align-items:center;justify-content:space-between;gap:24px}.cc-approval-panel h3{font-family:Georgia,"Times New Roman",serif;font-size:25px;font-weight:400;margin:7px 0}.cc-approval-panel p:not(.cc-panel-label){color:var(--cc-muted);font-size:12px;margin:0}.cc-text-action{border-bottom:1px solid var(--cc-border);color:var(--cc-bright);font-size:11px;padding-bottom:4px;text-decoration:none;white-space:nowrap}.cc-text-action span{margin-left:8px}.cc-governance{padding:31px;display:flex;gap:23px;align-items:flex-start}.cc-lock-glyph{width:42px;height:42px;border:1px solid var(--cc-border);border-radius:50%;display:grid;place-items:center;color:var(--cc-bright);font-size:23px}.cc-governance h2{font-size:26px;margin:5px 0 8px}.cc-governance p:not(.cc-kicker){color:var(--cc-muted);margin:0;max-width:760px;font-size:12px;line-height:1.6}@keyframes cc-orbit{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;transition-duration:.01ms!important}}@media (max-width:1180px){.cc-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.cc-topbar{grid-template-columns:1fr auto}.cc-system-line{grid-column:1/-1;grid-row:2}.cc-production-layout{grid-template-columns:1fr}.cc-preview{position:static}.cc-evidence-grid{grid-template-columns:1fr}.cc-evidence-panel{min-height:auto}.cc-pipeline{grid-template-columns:1fr}.cc-pipeline-link{width:1px;height:20px;margin:0 auto;background:linear-gradient(180deg,var(--cc-border),transparent)}.cc-pipeline-link:after{right:-2px;top:auto;bottom:0;border-left:3px solid transparent;border-right:3px solid transparent;border-top:5px solid var(--cc-gold);border-bottom:0}}@media (max-width:820px){.cc-app{grid-template-columns:1fr}.cc-sidebar{position:static;height:auto;padding:20px;border-right:0;border-bottom:1px solid var(--cc-line)}.cc-brand{margin:0 8px 18px}.cc-nav{display:flex;overflow:auto;gap:0;padding-bottom:4px}.cc-nav p{display:none}.cc-nav a{white-space:nowrap;border-left:0;border-bottom:1px solid transparent}.cc-nav a.is-active{border-bottom-color:var(--cc-gold)}.cc-sidebar-foot{display:none}.cc-main{padding:24px 20px 60px}.cc-topbar{grid-template-columns:1fr auto;gap:16px}.cc-system-line{gap:8px}.cc-operator{padding-left:12px}.cc-hero-grid,.cc-runtime-grid{grid-template-columns:1fr}.cc-system-core{min-height:300px}.cc-agent{grid-template-columns:1fr 1fr}.cc-agent>div:first-child{grid-column:1/-1}.cc-agent-stat{padding-left:0;border-left:0;border-top:1px solid var(--cc-line);padding-top:12px}.cc-section{margin-top:42px}}@media (max-width:520px){.cc-topbar{grid-template-columns:1fr}.cc-operator{display:none}.cc-system-line{grid-column:auto;grid-row:auto}.cc-metrics{grid-template-columns:1fr 1fr}.cc-metric{min-height:106px;padding:14px}.cc-brief{padding:25px}.cc-section-heading{display:block}.cc-section-heading time,.cc-section-note{display:block;margin-top:7px}.cc-approval-panel,.cc-governance{align-items:flex-start;flex-direction:column}.cc-agent{grid-template-columns:1fr}.cc-agent>div:first-child{grid-column:auto}.cc-system-core{min-height:280px}.cc-core-orbit-c{width:270px;height:270px}.cc-node-right{right:3%}.cc-node-left{left:3%}}
`;

export const COMMAND_CENTER_RESPONSIVE_CSS = `
@media (max-width:820px){
  .cc-app,.cc-sidebar,.cc-main{min-width:0}
  .cc-nav{min-width:0;width:100%;overflow-x:auto}
}
`;

export const COMMAND_CENTER_CLIENT_JS = `
(() => {
  "use strict";
  const root = document.getElementById("command-center");
  const commandForm = document.getElementById("command-form");
  const commandInput = document.getElementById("command-input");
  const commandResult = document.getElementById("command-result");
  const state = { snapshot: null, selectedProductionId: null, slideIndex: 0 };

  function byId(id) { return document.getElementById(id); }
  function text(id, value) { const element = byId(id); if (element) element.textContent = value; }
  function element(tag, className, value) { const node = document.createElement(tag); if (className) node.className = className; if (value !== undefined) node.textContent = value; return node; }
  function number(value) { return new Intl.NumberFormat("it-IT").format(value); }
  function timestamp(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Data locale non disponibile" : new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(date); }
  function statusLabel(value) { const labels = { ATTENTION_REQUIRED: "ATTENZIONE RICHIESTA", AVAILABLE: "DISPONIBILE", LOCKED: "BLOCCATO", NOT_OBSERVED: "NON OSSERVATO", NOT_REGISTERED: "NON REGISTRATO", READY: "PRONTO", TRIGGERED: "ATTIVATO" }; return labels[value] || value.replaceAll("_", " "); }
  function statusLane(status) { if (status === "PENDING_FABIO_APPROVAL") return "REVISIONE FABIO"; if (status === "APPROVED_FOR_SCHEDULING") return "APPROVATI"; if (status === "SCHEDULED") return "CALENDARIO"; if (status === "BLOCKED") return "BLOCCATI DAL RISCHIO"; return "ARCHIVIATI"; }

  async function refresh() {
    try {
      const response = await fetch("/api/overview", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("L'API locale del Centro di Comando non è disponibile.");
      state.snapshot = await response.json();
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
    text("system-status", statusLabel(snapshot.overview.system));
    text("autonomy-status", snapshot.overview.autonomy);
    text("core-status", statusLabel(snapshot.overview.system));
    text("core-detail", snapshot.runtime.continuousWorker === "NOT_REGISTERED" ? "Control plane durevole pronto; nessun worker continuativo registrato." : "Il control plane durevole è disponibile.");
    text("generated-at", "Aggiornato " + timestamp(snapshot.generatedAt));
    text("brief-decision", snapshot.overview.dailyBrief.decision);
    text("brief-detail", snapshot.overview.dailyBrief.detail);
    text("brief-priority", snapshot.overview.dailyBrief.priority);
    renderMetrics(snapshot.overview.metrics);
    renderPipeline(snapshot);
    renderProductions(snapshot.productions);
    renderEvidence(snapshot.evidence);
    renderRuntime(snapshot.runtime);
    renderAgents(snapshot.agents);
    renderApprovals(snapshot.productions);
  }

  function renderMetrics(metrics) {
    const target = byId("metric-grid");
    target.replaceChildren();
    for (const metric of metrics) {
      const card = element("article", "cc-metric");
      card.dataset.tone = metric.tone;
      card.append(element("span", "cc-metric-label", metric.label), element("strong", "", number(metric.value)), element("p", "", metric.context));
      target.append(card);
    }
  }

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
    const target = byId("package-preview");
    target.replaceChildren();
    if (!record) {
      const empty = element("div", "cc-preview-empty");
      empty.append(element("span", "", "◇"), element("div", "", "Seleziona un pacchetto persistito per vedere il suo carosello reale o script breve. Qui non sono mostrati contenuti segnaposto."));
      target.append(empty);
      return;
    }
    const assets = record.package.assets;
    const slides = assets && Array.isArray(assets.carousel) ? assets.carousel : [];
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

  function detail(label, value) { const paragraph = element("p"); paragraph.append(element("b", "", label + ": "), document.createTextNode(value)); return paragraph; }

  function renderEvidence(evidence) {
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
      const identity = element("div"); identity.append(element("p", "cc-kicker", agent.role), element("h3", "", "CONTENT DIRECTOR"), element("p", "", "Divisione locale eseguibile"));
      card.append(identity, agentStat("Stato", statusLabel(agent.state)), agentStat("Autonomia", agent.autonomy), agentStat("Telemetria", agent.telemetry));
      target.append(card);
    }
  }

  function agentStat(label, value) { const item = element("div", "cc-agent-stat"); item.append(element("span", "", label), element("b", "", value)); return item; }

  function renderApprovals(productions) {
    const pending = productions.filter((item) => item.status === "PENDING_FABIO_APPROVAL");
    if (pending.length === 0) {
      text("approval-title", "Nessun pacchetto richiede la decisione di Fabio");
      text("approval-detail", "Un futuro pacchetto guidato dalle evidenze apparirà qui con versione esatta, fingerprint, mappatura claim e stato del rischio.");
      return;
    }
    const evidenceAttested = pending.filter((item) => item.evidencePack).length;
    text("approval-title", String(pending.length) + " pacchetto/i di contenuto attendono Fabio");
    text("approval-detail", evidenceAttested === pending.length ? "La revisione resta controllata nel confine di approvazione Telegram esistente. Questa vista locale espone gli stessi dati durevoli del pacchetto senza creare un secondo workflow di approvazione." : String(evidenceAttested) + " pacchetto/i sono attestati dalle evidenze. Un pacchetto senza Evidence Pack immutabile resta visibile per la revisione ma non può usare il percorso di approvazione Telegram.");
  }

  function navigate(query) {
    const normalized = query.toLocaleLowerCase("it-IT");
    const mapping = [["approv", "approvals"], ["evid", "evidence"], ["fonte", "evidence"], ["claim", "evidence"], ["runtime", "runtime"], ["queue", "runtime"], ["agent", "agents"], ["produz", "production"], ["conten", "production"], ["pacchet", "production"]];
    const found = mapping.find(([keyword]) => normalized.includes(keyword));
    if (!found) { commandResult.textContent = "Usa un termine come approvazioni, evidenze, runtime, agenti o produzioni."; return; }
    const target = byId(found[1]); if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    commandResult.textContent = "Aperta la sezione richiesta.";
  }

  commandForm.addEventListener("submit", (event) => { event.preventDefault(); navigate(commandInput.value.trim()); });
  document.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); commandInput.focus(); } });
  refresh();
  window.setInterval(refresh, 30000);
})();
`;
