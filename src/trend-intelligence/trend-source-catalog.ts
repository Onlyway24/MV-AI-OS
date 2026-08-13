import { deepFreezeTrend, type TrendAccessGrant, type TrendCredentialRequirement, type TrendSignalFamily, type TrendSourceCatalogEntry, type TrendSourceKey } from "./trend-intelligence-contract.js";

const TERMS = Object.freeze(["PUBLIC_TERMS_CONFIRMED"] as const);
const AUTHORIZED_IMPORT = Object.freeze(["AUTHORIZED_IMPORT_CONFIRMED", "PUBLIC_TERMS_CONFIRMED"] as const);
const OAUTH = Object.freeze(["APP_REVIEW_CONFIRMED", "OAUTH_CONNECTION_CONFIRMED", "PUBLIC_TERMS_CONFIRMED"] as const);
const ACCOUNT = Object.freeze(["ACCOUNT_APPROVAL_CONFIRMED", "APP_REVIEW_CONFIRMED", "OAUTH_CONNECTION_CONFIRMED", "PUBLIC_TERMS_CONFIRMED"] as const);
const LICENSE = Object.freeze(["COMMERCIAL_TERMS_CONFIRMED", "LICENSE_CONFIRMED"] as const);

export const PREMIUM_TREND_SOURCE_CATALOG: readonly TrendSourceCatalogEntry[] = deepFreezeTrend([
  source("GOOGLE_TRENDS", "social-google-trends-it", "Google Trends", "Google", "https://trends.google.com/trending/", "OFFICIAL_FEED", "PUBLIC_OFFICIAL_ENDPOINT", "PUBLIC_TERMS_REVIEW_REQUIRED", TERMS, [], ["SEARCH", "ATTENTION"], "CONFIGURABLE", "Il feed pubblico misura attenzione relativa; non dimostra volume assoluto né intento commerciale."),
  source("GDELT", "trend-gdelt", "GDELT Project", "GDELT Project", "https://api.gdeltproject.org/api/v2/doc/", "OFFICIAL_API", "PUBLIC_OFFICIAL_ENDPOINT", "PUBLIC_TERMS_REVIEW_REQUIRED", TERMS, [], ["NEWS", "ATTENTION"], "CONFIGURABLE", "Usare soltanto endpoint e dataset ufficiali con attribuzione e limiti di utilizzo verificati."),
  source("WIKIMEDIA", "trend-wikimedia", "Wikimedia Analytics", "Wikimedia Foundation", "https://wikimedia.org/api/rest_v1/", "OFFICIAL_API", "PUBLIC_OFFICIAL_ENDPOINT", "PUBLIC_TERMS_REVIEW_REQUIRED", TERMS, [], ["CULTURE", "ATTENTION"], "CONFIGURABLE", "Pageview e contenuti Wikimedia sono segnali di attenzione, non domanda commerciale."),
  source("ARXIV", "trend-arxiv", "arXiv API", "arXiv", "https://export.arxiv.org/api/", "OFFICIAL_API", "PUBLIC_OFFICIAL_ENDPOINT", "PUBLIC_TERMS_REVIEW_REQUIRED", TERMS, [], ["RESEARCH", "TECHNOLOGY"], "CONFIGURABLE", "Rispettare attribution, rate limits e termini arXiv; una pubblicazione non equivale ad adozione di mercato."),
  source("GITHUB", "trend-github", "GitHub APIs", "GitHub", "https://api.github.com/", "OFFICIAL_API", "PUBLIC_OFFICIAL_ENDPOINT", "PLATFORM_TERMS_REVIEW_REQUIRED", TERMS, [], ["TECHNOLOGY", "ATTENTION"], "CONFIGURABLE", "La lettura di metadata pubblici può essere anonima con quota inferiore; stelle e attività richiedono contesto e policy GitHub."),
  source("YOUTUBE", "trend-youtube", "YouTube Data API", "Google", "https://www.googleapis.com/youtube/v3/", "OFFICIAL_API", "SECRET_REFERENCE_REQUIRED", "PLATFORM_TERMS_REVIEW_REQUIRED", TERMS, [credential("youtube-api-key", "SecretReference per la chiave YouTube Data API autorizzata.")], ["SOCIAL", "ATTENTION"], "DISABLED", "Second-wave connector disabilitato in V1. Quote e policy YouTube si applicano; mostPopular non è una prova di acquisto."),
  source("META_AD_LIBRARY", "trend-meta-ad-library", "Meta Ad Library", "Meta", "https://graph.facebook.com/", "OFFICIAL_API", "OAUTH_AND_APP_REVIEW_REQUIRED", "AUTHORIZED_IMPORT_ONLY", OAUTH, [credential("meta-access-token", "SecretReference per un token Meta ottenuto tramite flusso e review autorizzati.")], ["COMMERCE", "SOCIAL"], "DISABLED", "Second-wave connector disabilitato in V1; nessun accesso prima di app review, token e finalità conformi."),
  source("PINTEREST_TRENDS", "trend-pinterest-trends", "Pinterest Trends API", "Pinterest", "https://developers.pinterest.com/docs/api/v5/trends/", "COMMERCIAL_PROVIDER", "LICENSE_REQUIRED", "LICENSE_REQUIRED", LICENSE, [], ["CULTURE", "SEARCH", "COMMERCE"], "DISABLED", "Accesso API limitato ai soggetti idonei secondo Pinterest; runtime disabilitato senza relazione enterprise/agency/partner verificata."),
  source("PINTEREST_PREDICTS", "trend-pinterest-predicts", "Pinterest Predicts", "Pinterest", "https://business.pinterest.com/pinterest-predicts/", "OFFICIAL_EXPORT", "AUTHORIZED_IMPORT_REQUIRED", "AUTHORIZED_IMPORT_ONLY", AUTHORIZED_IMPORT, [], ["CULTURE", "COMMERCE"], "DISABLED", "Second-wave import disabilitato in V1. Report strategico, non telemetria real-time."),
  source("TIKTOK_COMMERCIAL_CONTENT", "trend-tiktok-commercial-content", "TikTok Commercial Content API", "TikTok", "https://open.tiktokapis.com/", "OFFICIAL_API", "ACCOUNT_AND_DEVELOPER_APPROVAL_REQUIRED", "PLATFORM_TERMS_REVIEW_REQUIRED", ACCOUNT, [credential("tiktok-commercial-content-token", "SecretReference per token con accesso approvato e scope research.adlib.basic.")], ["COMMERCE", "SOCIAL"], "DISABLED", "Second-wave connector disabilitato in V1; app, approvazione e scope research.adlib.basic non implicano readiness."),
  source("TIKTOK_CREATIVE_CENTER", "social-tiktok-creative-center", "TikTok Creative Center", "TikTok", "https://ads.tiktok.com/business/creativecenter/", "OPERATOR_RESEARCH", "AUTHORIZED_IMPORT_REQUIRED", "AUTHORIZED_IMPORT_ONLY", AUTHORIZED_IMPORT, [], ["CULTURE", "SOCIAL", "COMMERCE"], "DISABLED", "Second-wave import disabilitato in V1; nessuno scraping o account inventato."),
  source("GOOGLE_ADS", "trend-google-ads", "Google Ads API", "Google", "https://googleads.googleapis.com/", "OFFICIAL_API", "ACCOUNT_AND_DEVELOPER_APPROVAL_REQUIRED", "PLATFORM_TERMS_REVIEW_REQUIRED", ACCOUNT, [credential("google-ads-developer-token", "SecretReference per developer token Google Ads autorizzato."), credential("google-ads-oauth", "SecretReference per credenziale OAuth Google Ads autorizzata.")], ["SEARCH", "COMMERCE"], "DISABLED", "Second-wave connector disabilitato in V1; account, token e OAuth non implicano readiness."),
  source("REDDIT", "trend-reddit", "Reddit Data API", "Reddit", "https://oauth.reddit.com/", "COMMERCIAL_PROVIDER", "LICENSE_REQUIRED", "LICENSE_REQUIRED", LICENSE, [], ["CULTURE", "SOCIAL"], "DISABLED", "Uso commerciale soggetto a termini/licenza separati: runtime disabilitato finché autorizzazione e condizioni non sono documentate."),
  source("PRODUCT_HUNT", "trend-product-hunt", "Product Hunt API", "Product Hunt", "https://api.producthunt.com/v2/api/graphql", "COMMERCIAL_PROVIDER", "LICENSE_REQUIRED", "LICENSE_REQUIRED", LICENSE, [], ["TECHNOLOGY", "COMMERCE"], "DISABLED", "Uso commerciale richiede permesso scritto verificato; runtime disabilitato. Ranking e voti non provano revenue."),
  source("HACKER_NEWS", "trend-hacker-news", "Hacker News API", "Y Combinator", "https://hacker-news.firebaseio.com/v0/", "OFFICIAL_API", "PUBLIC_OFFICIAL_ENDPOINT", "PUBLIC_TERMS_REVIEW_REQUIRED", TERMS, [], ["TECHNOLOGY", "ATTENTION"], "DISABLED", "Second-wave connector disabilitato in V1. Punteggi e discussioni non costituiscono validazione commerciale."),
  source("ETSY", "trend-etsy", "Etsy Marketplace Insights", "Etsy", "https://www.etsy.com/marketplace-insights", "OFFICIAL_EXPORT", "AUTHORIZED_IMPORT_REQUIRED", "AUTHORIZED_IMPORT_ONLY", AUTHORIZED_IMPORT, [], ["COMMERCE", "CULTURE"], "DISABLED", "Second-wave import disabilitato in V1; Etsy Open API non viene presentata come trend analytics."),
  source("WGSN_INTELLIGENCE", "trend-wgsn-intelligence", "WGSN Intelligence", "WGSN", "https://www.wgsn.com/", "COMMERCIAL_PROVIDER", "LICENSE_REQUIRED", "LICENSE_REQUIRED", LICENSE, [], ["CULTURE", "COMMERCE"], "DISABLED", "Catalogato per discovery enterprise. API, licenza e diritti non sono assunti; runtime disabilitato fino a contratto verificato."),
  source("EXPLODING_TOPICS", "trend-exploding-topics", "Exploding Topics", "Exploding Topics", "https://explodingtopics.com/", "COMMERCIAL_PROVIDER", "LICENSE_REQUIRED", "LICENSE_REQUIRED", LICENSE, [], ["SEARCH", "ATTENTION"], "DISABLED", "Catalogato per discovery. Accesso API, piano, limiti e diritti devono essere verificati contrattualmente."),
  source("SIMILARWEB", "trend-similarweb", "Similarweb API", "Similarweb", "https://developers.similarweb.com/", "COMMERCIAL_PROVIDER", "LICENSE_REQUIRED", "LICENSE_REQUIRED", LICENSE, [], ["COMMERCE", "ATTENTION"], "DISABLED", "Catalogato per discovery enterprise. Il runtime V5 resta disabilitato senza licenza e documentazione di accesso verificate."),
  source("TRENDALYTICS", "trend-trendalytics", "Trendalytics", "Trendalytics", "https://trendalytics.co/", "COMMERCIAL_PROVIDER", "LICENSE_REQUIRED", "COMMERCIAL_DISCOVERY_REQUIRED", LICENSE, [], ["CULTURE", "COMMERCE"], "DISABLED", "Commercial discovery required: non viene dichiarata alcuna API o connessione finché il vendor non la documenta e autorizza."),
]);

export function trendSourceByKey(sourceKey: TrendSourceKey): TrendSourceCatalogEntry {
  const entry = PREMIUM_TREND_SOURCE_CATALOG.find((candidate) => candidate.sourceKey === sourceKey);
  if (entry === undefined) throw new Error("Trend source catalog invariant violated");
  return entry;
}

function credential(bindingId: string, description: string): TrendCredentialRequirement {
  return { bindingId, description };
}

function source(
  sourceKey: TrendSourceKey,
  sourceId: string,
  displayName: string,
  owner: string,
  canonicalReference: string,
  acquisitionMode: TrendSourceCatalogEntry["acquisitionMode"],
  accessRequirement: TrendSourceCatalogEntry["accessRequirement"],
  licenseState: TrendSourceCatalogEntry["licenseState"],
  requiredGrants: readonly TrendAccessGrant[],
  requiredCredentialBindings: readonly TrendCredentialRequirement[],
  dataClasses: TrendSourceCatalogEntry["dataClasses"],
  providerRuntime: TrendSourceCatalogEntry["providerRuntime"],
  termsNote: string,
): TrendSourceCatalogEntry {
  return {
    accessRequirement,
    acquisitionMode,
    canonicalReference,
    connectionDeclaration: "NOT_CONFIGURED",
    dataClasses,
    displayName,
    licenseState,
    owner,
    providerRuntime,
    requiredCredentialBindings,
    requiredGrants,
    signalFamilies: families(dataClasses),
    sourceId,
    sourceKey,
    termsNote,
  };
}

function families(dataClasses: TrendSourceCatalogEntry["dataClasses"]): readonly TrendSignalFamily[] {
  const values: TrendSignalFamily[] = [];
  if (dataClasses.some((value) => value === "ATTENTION" || value === "CULTURE" || value === "SOCIAL")) values.push("ATTENTION_SIGNAL");
  if (dataClasses.includes("SEARCH")) values.push("SEARCH_INTENT");
  if (dataClasses.includes("COMMERCE")) values.push("COMMERCE_INTENT");
  if (dataClasses.some((value) => value === "NEWS" || value === "RESEARCH" || value === "TECHNOLOGY")) values.push("MARKET_EVIDENCE");
  return Object.freeze([...new Set(values)]);
}
