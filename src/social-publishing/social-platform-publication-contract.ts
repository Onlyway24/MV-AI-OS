export const SOCIAL_PUBLICATION_CHECKPOINT_CONTRACT_VERSION = "1" as const;

export type SocialPublicationPlatform = "instagram" | "tiktok";

export interface SocialPlatformConnectionRequirements {
  readonly browserActions: readonly string[];
  readonly documentationUrls: readonly string[];
  readonly platform: SocialPublicationPlatform;
  readonly readiness: "BROWSER_CONNECTION_REQUIRED";
  readonly requiredCapabilities: readonly string[];
  readonly verifiedMediaDomainRequirement: string;
}

export interface SocialPublicationBrowserCheckpoint {
  readonly actionsRequiredFromFabio: readonly string[];
  readonly contractVersion: typeof SOCIAL_PUBLICATION_CHECKPOINT_CONTRACT_VERSION;
  readonly externalEffectOccurred: false;
  readonly platform: SocialPublicationPlatform;
  readonly publicationAllowed: false;
  readonly requirements: SocialPlatformConnectionRequirements;
  readonly status: "BROWSER_CONNECTION_REQUIRED";
}

export interface SocialPlatformPublicationTransport {
  readonly platform: SocialPublicationPlatform;
  requestBrowserCheckpoint(): Promise<SocialPublicationBrowserCheckpoint>;
}

/** Test-only transport. It records no token, app ID, account ID, or publication. */
export class FakeSocialPlatformPublicationTransport
  implements SocialPlatformPublicationTransport
{
  public readonly calls: SocialPublicationPlatform[] = [];
  public readonly platform: SocialPublicationPlatform;

  public constructor(platform: SocialPublicationPlatform) {
    this.platform = platform;
  }

  public requestBrowserCheckpoint(): Promise<SocialPublicationBrowserCheckpoint> {
    this.calls.push(this.platform);
    return Promise.resolve(browserCheckpointFor(this.platform));
  }
}

export function browserCheckpointFor(
  platform: SocialPublicationPlatform,
): SocialPublicationBrowserCheckpoint {
  const requirements = connectionRequirementsFor(platform);
  return {
    actionsRequiredFromFabio: requirements.browserActions,
    contractVersion: SOCIAL_PUBLICATION_CHECKPOINT_CONTRACT_VERSION,
    externalEffectOccurred: false,
    platform,
    publicationAllowed: false,
    requirements,
    status: "BROWSER_CONNECTION_REQUIRED",
  };
}

/**
 * Declarative, credential-free readiness contract.  It is intentionally not a
 * transport implementation: Fabio must complete the OAuth/app audit work in a
 * browser before any separately authorized publishing feature can exist.
 */
export function connectionRequirementsFor(
  platform: SocialPublicationPlatform,
): SocialPlatformConnectionRequirements {
  if (platform === "instagram") {
    return {
      browserActions: [
        "Nel checkpoint browser unico, Fabio crea o seleziona l'app Meta corretta, registra l'URL di redirect e collega un account Instagram professionale con la Pagina Facebook richiesta.",
        "Fabio concede i soli permessi di pubblicazione richiesti dall'API Graph nella versione attiva, completa la verifica/app review applicabile e torna qui senza pubblicare.",
      ],
      documentationUrls: [
        "https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing/",
        "https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/",
      ],
      platform,
      readiness: "BROWSER_CONNECTION_REQUIRED",
      requiredCapabilities: [
        "Meta developer app and registered redirect URL",
        "Instagram professional account linked as required by the selected Graph API flow",
        "Version-current Graph API publishing permissions and applicable app review",
      ],
      verifiedMediaDomainRequirement: "A future server-side publishing flow must use an HTTPS media URL hosted on an ownership-verified domain; this local-only factory intentionally exposes no public media URL.",
    };
  }
  return {
    browserActions: [
      "Nel checkpoint browser unico, Fabio crea o seleziona l'app TikTok for Developers, registra l'URL di redirect e avvia l'autorizzazione OAuth dell'account corretto.",
      "Fabio richiede solo gli scope di pubblicazione necessari, completa l'audit/review richiesto da TikTok per il tipo di posting desiderato e torna qui senza pubblicare.",
    ],
    documentationUrls: [
      "https://developers.tiktok.com/doc/content-posting-api-get-started/",
      "https://developers.tiktok.com/doc/login-kit-web/",
    ],
    platform,
    readiness: "BROWSER_CONNECTION_REQUIRED",
    requiredCapabilities: [
      "TikTok developer app and registered redirect URL",
      "OAuth authorization for the intended creator account",
      "Version-current Content Posting API scope and any required audit/review",
    ],
    verifiedMediaDomainRequirement: "If the chosen TikTok posting flow pulls media from a URL, Fabio must use an HTTPS media domain verified or allow-listed in the TikTok developer configuration; this local-only factory intentionally exposes no public media URL.",
  };
}
