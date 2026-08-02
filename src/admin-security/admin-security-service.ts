import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import type { Logger } from "../logging/logger.js";
import {
  ADMIN_SECURITY_CONTRACT_VERSION,
  AdminSecurityError,
  assertCapability,
  assertCommandFingerprint,
  assertSafeIdentifier,
  createServicePrincipal,
  isLoopbackAddress,
  type AdminCapability,
  type AdminChallengeKind,
  type AdminChallengeRecord,
  type AdminPrincipal,
  type AdminSecurityEvent,
  type AdminSecurityEventOutcome,
  type AdminSecurityEventType,
  type AdminSecurityProfile,
  type AdminSecurityState,
  type AdminSessionRecord,
  type AdminStepUpReceiptRecord,
  type AdminWebAuthnCredential,
  type FounderBootstrapRecord,
  type ReadyAdminSecurityProfile,
  type ServiceAdminPrincipal,
  type ServicePrincipalProfile,
} from "./admin-security-contracts.js";
import type { AdminSecurityRepository } from "./admin-security-repository.js";
import {
  mutateAdminSecurityState,
  withoutRevision,
} from "./admin-security-state.js";
import {
  SimpleAdminWebAuthn,
  type AdminWebAuthn,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "./admin-webauthn.js";
import {
  PersistentAdminRateLimiter,
  type AdminRateLimiterConfig,
} from "./persistent-admin-rate-limiter.js";

const DEFAULT_BOOTSTRAP_TTL_MS = 10 * 60_000;
const DEFAULT_CHALLENGE_TTL_MS = 5 * 60_000;
const DEFAULT_SESSION_ABSOLUTE_TTL_MS = 8 * 60 * 60_000;
const DEFAULT_SESSION_IDLE_TTL_MS = 30 * 60_000;
const DEFAULT_SESSION_TOUCH_INTERVAL_MS = 60_000;
const DEFAULT_STEP_UP_TTL_MS = 2 * 60_000;
const MAX_CHALLENGES = 256;
const MAX_SECURITY_EVENTS = 5_000;
const MAX_SESSIONS = 1_024;
const MAX_STEP_UP_RECEIPTS = 512;
const FOUNDER_PRINCIPAL_ID = "founder";

export interface AdminSecurityClock {
  now(): Date;
}

export interface AdminSecurityRequestContext {
  readonly origin: string;
  readonly sourceKey: string;
}

export interface FounderBootstrapRequestContext
  extends AdminSecurityRequestContext {
  readonly connectionAddress: string;
}

export interface FounderBootstrapSecret {
  readonly bootstrapToken: string;
  readonly expiresAt: string;
}

export interface FounderRegistrationStart {
  readonly expiresAt: string;
  readonly flowId: string;
  readonly options: PublicKeyCredentialCreationOptionsJSON;
}

export interface FounderRegistrationReceipt {
  readonly credentialId: string;
  readonly principalId: string;
  readonly registeredAt: string;
}

export interface AdminAuthenticationStart {
  readonly expiresAt: string;
  readonly flowId: string;
  readonly options: PublicKeyCredentialRequestOptionsJSON;
}

export interface AdminAuthenticationReceipt {
  readonly absoluteExpiresAt: string;
  readonly cookie: string;
  readonly idleExpiresAt: string;
  readonly principal: AdminPrincipal;
  readonly sessionId: string;
  readonly sessionToken: string;
}

export interface AuthenticatedAdminSession {
  readonly principal: AdminPrincipal;
  readonly session: AdminSessionRecord;
}

export interface AdminStepUpStart {
  readonly expiresAt: string;
  readonly flowId: string;
  readonly options: PublicKeyCredentialRequestOptionsJSON;
}

export interface AdminStepUpReceipt {
  readonly capability: AdminCapability;
  readonly command: string;
  readonly commandFingerprint: string;
  readonly expiresAt: string;
  readonly receiptToken: string;
}

export interface KillSwitchAuthorizationReceipt {
  readonly authorizationId: string;
  readonly authorizedAt: string;
  readonly desiredState: boolean;
  readonly principalId: string;
  readonly switchId: string;
}

export interface AdminSecurityServiceOptions {
  readonly bootstrapTtlMs?: number;
  readonly challengeTtlMs?: number;
  readonly clock?: AdminSecurityClock;
  readonly logger?: Logger;
  readonly profile: AdminSecurityProfile;
  readonly rateLimit?: AdminRateLimiterConfig;
  readonly repository: AdminSecurityRepository;
  readonly sessionAbsoluteTtlMs?: number;
  readonly sessionIdleTtlMs?: number;
  readonly sessionTouchIntervalMs?: number;
  readonly sourceKeyPepper: string | Uint8Array;
  readonly stepUpTtlMs?: number;
  readonly webAuthn?: AdminWebAuthn;
}

export class AdminSecurityService {
  readonly #bootstrapTtlMs: number;
  readonly #challengeTtlMs: number;
  readonly #clock: AdminSecurityClock;
  readonly #logger: Logger | undefined;
  readonly #profile: AdminSecurityProfile;
  readonly #rateLimiter: PersistentAdminRateLimiter;
  readonly #repository: AdminSecurityRepository;
  readonly #sessionAbsoluteTtlMs: number;
  readonly #sessionIdleTtlMs: number;
  readonly #sessionTouchIntervalMs: number;
  readonly #sourceKeyPepper: Uint8Array;
  readonly #stepUpTtlMs: number;
  readonly #webAuthn: AdminWebAuthn;

  public constructor(options: AdminSecurityServiceOptions) {
    this.#profile = options.profile;
    this.#repository = options.repository;
    this.#clock = options.clock ?? { now: () => new Date() };
    this.#logger = options.logger;
    this.#webAuthn = options.webAuthn ?? new SimpleAdminWebAuthn();
    this.#bootstrapTtlMs = positiveDuration(
      options.bootstrapTtlMs,
      DEFAULT_BOOTSTRAP_TTL_MS,
      "bootstrapTtlMs",
    );
    this.#challengeTtlMs = positiveDuration(
      options.challengeTtlMs,
      DEFAULT_CHALLENGE_TTL_MS,
      "challengeTtlMs",
    );
    this.#sessionAbsoluteTtlMs = positiveDuration(
      options.sessionAbsoluteTtlMs,
      DEFAULT_SESSION_ABSOLUTE_TTL_MS,
      "sessionAbsoluteTtlMs",
    );
    this.#sessionIdleTtlMs = positiveDuration(
      options.sessionIdleTtlMs,
      DEFAULT_SESSION_IDLE_TTL_MS,
      "sessionIdleTtlMs",
    );
    this.#sessionTouchIntervalMs = positiveDuration(
      options.sessionTouchIntervalMs,
      DEFAULT_SESSION_TOUCH_INTERVAL_MS,
      "sessionTouchIntervalMs",
    );
    this.#stepUpTtlMs = positiveDuration(
      options.stepUpTtlMs,
      DEFAULT_STEP_UP_TTL_MS,
      "stepUpTtlMs",
    );
    if (this.#sessionIdleTtlMs > this.#sessionAbsoluteTtlMs) {
      throw new AdminSecurityError(
        "INPUT_INVALID",
        "Session idle lifetime cannot exceed its absolute lifetime.",
      );
    }
    const pepper = typeof options.sourceKeyPepper === "string"
      ? Buffer.from(options.sourceKeyPepper, "utf8")
      : Buffer.from(options.sourceKeyPepper);
    if (pepper.byteLength < 32) {
      throw new AdminSecurityError(
        "INPUT_INVALID",
        "Source-key pepper must contain at least 32 bytes.",
      );
    }
    this.#sourceKeyPepper = new Uint8Array(pepper);
    this.#rateLimiter = new PersistentAdminRateLimiter({
      clock: this.#clock,
      ...(options.rateLimit === undefined
        ? {}
        : { config: options.rateLimit }),
      repository: this.#repository,
    });
  }

  public async createFounderBootstrap(
    context: FounderBootstrapRequestContext,
  ): Promise<FounderBootstrapSecret> {
    const profile = this.#readyProfile();
    const sourceKeyHash = this.#validateRequestContext(context, profile);
    await this.#checkRateLimit("BOOTSTRAP", sourceKeyHash);
    if (!isLoopbackAddress(context.connectionAddress)) {
      await this.#recordEvent({
        eventType: "BOOTSTRAP_REJECTED",
        outcome: "DENIED",
        principalId: null,
        reasonCode: "NON_LOOPBACK_CONNECTION",
        sourceKeyHash,
        subjectId: null,
      });
      throw new AdminSecurityError(
        "BOOTSTRAP_INVALID",
        "Founder bootstrap is available only from a loopback connection.",
      );
    }

    const now = this.#clock.now();
    const bootstrapToken = opaqueToken(32);
    const bootstrap: FounderBootstrapRecord = Object.freeze({
      consumedAt: null,
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + this.#bootstrapTtlMs,
      ).toISOString(),
      tokenHash: tokenHash(bootstrapToken),
    });
    const event = this.#newEvent({
      eventType: "BOOTSTRAP_CREATED",
      outcome: "SUCCEEDED",
      principalId: null,
      reasonCode: "LOCAL_ONE_TIME_BOOTSTRAP",
      sourceKeyHash,
      subjectId: FOUNDER_PRINCIPAL_ID,
    });
    await mutateAdminSecurityState(this.#repository, (state) => {
      if (
        state.principals.some(
          (principal) => principal.principalId === FOUNDER_PRINCIPAL_ID,
        )
        || state.bootstrap?.consumedAt !== null
          && state.bootstrap !== null
      ) {
        throw new AdminSecurityError(
          "BOOTSTRAP_ALREADY_COMPLETED",
          "Founder bootstrap has already been completed.",
        );
      }
      if (
        state.bootstrap !== null
        && state.bootstrap.consumedAt === null
        && isFuture(state.bootstrap.expiresAt, now)
      ) {
        throw new AdminSecurityError(
          "BOOTSTRAP_INVALID",
          "An active Founder bootstrap ceremony already exists.",
        );
      }
      return {
        result: undefined,
        state: {
          ...withoutRevision(state),
          bootstrap,
          securityEvents: appendEvent(state.securityEvents, event),
        },
      };
    });
    this.#logEvent(event);
    return Object.freeze({
      bootstrapToken,
      expiresAt: bootstrap.expiresAt,
    });
  }

  public async beginFounderRegistration(input: {
    readonly bootstrapToken: string;
    readonly context: AdminSecurityRequestContext;
  }): Promise<FounderRegistrationStart> {
    const profile = this.#readyProfile();
    const sourceKeyHash = this.#validateRequestContext(input.context, profile);
    await this.#checkRateLimit("REGISTRATION", sourceKeyHash);
    const presentedHash = tokenHashChecked(
      input.bootstrapToken,
      "BOOTSTRAP_INVALID",
    );
    const state = await this.#repository.read();
    assertActiveBootstrap(state, presentedHash, this.#clock.now());
    const options = await this.#webAuthn.generateRegistrationOptions({
      existingCredentials: state.credentials.filter(
        (credential) => credential.principalId === FOUNDER_PRINCIPAL_ID,
      ),
      profile,
      userDisplayName: "Founder",
      userId: new Uint8Array(
        createHash("sha256").update(FOUNDER_PRINCIPAL_ID).digest(),
      ),
      userName: FOUNDER_PRINCIPAL_ID,
    });
    const now = this.#clock.now();
    const challenge = this.#newChallenge({
      bootstrapTokenHash: presentedHash,
      capability: null,
      challenge: options.challenge,
      command: null,
      commandFingerprint: null,
      kind: "FOUNDER_REGISTRATION",
      now,
      principalId: null,
      sessionId: null,
      sourceKeyHash,
    });
    await mutateAdminSecurityState(this.#repository, (latest) => {
      assertActiveBootstrap(latest, presentedHash, now);
      return {
        result: undefined,
        state: {
          ...withoutRevision(latest),
          challenges: appendChallenge(latest.challenges, challenge, now),
        },
      };
    });
    return Object.freeze({
      expiresAt: challenge.expiresAt,
      flowId: challenge.flowId,
      options,
    });
  }

  public async finishFounderRegistration(input: {
    readonly context: AdminSecurityRequestContext;
    readonly flowId: string;
    readonly response: RegistrationResponseJSON;
  }): Promise<FounderRegistrationReceipt> {
    const profile = this.#readyProfile();
    const sourceKeyHash = this.#validateRequestContext(input.context, profile);
    await this.#checkRateLimit("REGISTRATION", sourceKeyHash);
    let challenge: AdminChallengeRecord;
    try {
      challenge = await this.#consumeChallenge(
        input.flowId,
        "FOUNDER_REGISTRATION",
        sourceKeyHash,
      );
      const verification = await this.#webAuthn.verifyRegistration({
        challenge: challenge.challenge,
        profile,
        response: input.response,
      });
      if (verification === null) {
        throw new AdminSecurityError(
          "CREDENTIAL_INVALID",
          "Passkey registration could not be verified.",
        );
      }
      const now = this.#clock.now();
      const principal: AdminPrincipal = Object.freeze({
        capabilities: Object.freeze([]),
        createdAt: now.toISOString(),
        displayName: "Founder",
        kind: "HUMAN",
        principalId: FOUNDER_PRINCIPAL_ID,
        roles: Object.freeze(["FOUNDER"] as const),
        status: "ACTIVE",
      });
      const credential: AdminWebAuthnCredential = Object.freeze({
        backedUp: verification.backedUp,
        counter: verification.counter,
        createdAt: now.toISOString(),
        credentialId: verification.credentialId,
        deviceType: verification.deviceType,
        principalId: FOUNDER_PRINCIPAL_ID,
        publicKey: verification.publicKey,
        transports: Object.freeze([...verification.transports]),
      });
      const event = this.#newEvent({
        eventType: "FOUNDER_REGISTERED",
        outcome: "SUCCEEDED",
        principalId: FOUNDER_PRINCIPAL_ID,
        reasonCode: "PASSKEY_USER_VERIFIED",
        sourceKeyHash,
        subjectId: FOUNDER_PRINCIPAL_ID,
      });
      await mutateAdminSecurityState(this.#repository, (state) => {
        const bootstrap = state.bootstrap;
        if (
          challenge.bootstrapTokenHash === null
          || bootstrap?.consumedAt !== null
          || !isFuture(bootstrap.expiresAt, now)
          || !hashesEqual(
            challenge.bootstrapTokenHash,
            bootstrap.tokenHash,
          )
          || state.principals.some(
            (candidate) =>
              candidate.principalId === FOUNDER_PRINCIPAL_ID,
          )
          || state.credentials.some(
            (candidate) =>
              candidate.credentialId === credential.credentialId,
          )
        ) {
          throw new AdminSecurityError(
            "BOOTSTRAP_ALREADY_COMPLETED",
            "Founder bootstrap can no longer be completed.",
          );
        }
        return {
          result: undefined,
          state: {
            ...withoutRevision(state),
            bootstrap: Object.freeze({
              ...bootstrap,
              consumedAt: now.toISOString(),
            }),
            credentials: Object.freeze([...state.credentials, credential]),
            principals: Object.freeze([...state.principals, principal]),
            securityEvents: appendEvent(state.securityEvents, event),
          },
        };
      });
      await this.#rateLimiter.recordSuccess(
        "REGISTRATION",
        sourceKeyHash,
      );
      this.#logEvent(event);
      return Object.freeze({
        credentialId: credential.credentialId,
        principalId: FOUNDER_PRINCIPAL_ID,
        registeredAt: now.toISOString(),
      });
    } catch (error) {
      if (!isRateLimited(error)) {
        await this.#rateLimiter.recordFailure(
          "REGISTRATION",
          sourceKeyHash,
        );
        await this.#recordEvent({
          eventType: "BOOTSTRAP_REJECTED",
          outcome: "DENIED",
          principalId: null,
          reasonCode: "REGISTRATION_VERIFICATION_FAILED",
          sourceKeyHash,
          subjectId: FOUNDER_PRINCIPAL_ID,
        });
      }
      throw publicCredentialError(error);
    }
  }

  public async beginAuthentication(
    context: AdminSecurityRequestContext,
  ): Promise<AdminAuthenticationStart> {
    const profile = this.#readyProfile();
    const sourceKeyHash = this.#validateRequestContext(context, profile);
    await this.#checkRateLimit("AUTHENTICATION", sourceKeyHash);
    const state = await this.#repository.read();
    const principal = founderPrincipal(state);
    const credentials = state.credentials.filter(
      (credential) => credential.principalId === principal.principalId,
    );
    if (credentials.length === 0) {
      throw new AdminSecurityError(
        "CREDENTIAL_INVALID",
        "No active passkey is available.",
      );
    }
    const options = await this.#webAuthn.generateAuthenticationOptions({
      credentials,
      profile,
    });
    const now = this.#clock.now();
    const challenge = this.#newChallenge({
      bootstrapTokenHash: null,
      capability: null,
      challenge: options.challenge,
      command: null,
      commandFingerprint: null,
      kind: "AUTHENTICATION",
      now,
      principalId: principal.principalId,
      sessionId: null,
      sourceKeyHash,
    });
    const event = this.#newEvent({
      eventType: "AUTHENTICATION_CHALLENGE_CREATED",
      outcome: "SUCCEEDED",
      principalId: principal.principalId,
      reasonCode: "PASSKEY_CHALLENGE",
      sourceKeyHash,
      subjectId: challenge.flowId,
    });
    await mutateAdminSecurityState(this.#repository, (latest) => ({
      result: undefined,
      state: {
        ...withoutRevision(latest),
        challenges: appendChallenge(latest.challenges, challenge, now),
        securityEvents: appendEvent(latest.securityEvents, event),
      },
    }));
    this.#logEvent(event);
    return Object.freeze({
      expiresAt: challenge.expiresAt,
      flowId: challenge.flowId,
      options,
    });
  }

  public async finishAuthentication(input: {
    readonly context: AdminSecurityRequestContext;
    readonly flowId: string;
    readonly response: AuthenticationResponseJSON;
  }): Promise<AdminAuthenticationReceipt> {
    const profile = this.#readyProfile();
    const sourceKeyHash = this.#validateRequestContext(input.context, profile);
    await this.#checkRateLimit("AUTHENTICATION", sourceKeyHash);
    try {
      const challenge = await this.#consumeChallenge(
        input.flowId,
        "AUTHENTICATION",
        sourceKeyHash,
      );
      if (challenge.principalId === null) {
        throw new AdminSecurityError(
          "CHALLENGE_INVALID",
          "Authentication challenge is invalid.",
        );
      }
      const state = await this.#repository.read();
      const principal = activePrincipal(state, challenge.principalId);
      const credential = state.credentials.find(
        (candidate) =>
          candidate.principalId === principal.principalId
          && candidate.credentialId === input.response.id,
      );
      if (credential === undefined) {
        throw new AdminSecurityError(
          "CREDENTIAL_INVALID",
          "Passkey authentication could not be verified.",
        );
      }
      const verification = await this.#webAuthn.verifyAuthentication({
        challenge: challenge.challenge,
        credential,
        profile,
        response: input.response,
      });
      if (verification === null) {
        throw new AdminSecurityError(
          "CREDENTIAL_INVALID",
          "Passkey authentication could not be verified.",
        );
      }
      const now = this.#clock.now();
      const rawSessionToken = opaqueToken(32);
      const absoluteExpiresAt = new Date(
        now.getTime() + this.#sessionAbsoluteTtlMs,
      );
      const idleExpiresAt = new Date(
        Math.min(
          absoluteExpiresAt.getTime(),
          now.getTime() + this.#sessionIdleTtlMs,
        ),
      );
      const session: AdminSessionRecord = Object.freeze({
        absoluteExpiresAt: absoluteExpiresAt.toISOString(),
        createdAt: now.toISOString(),
        idleExpiresAt: idleExpiresAt.toISOString(),
        lastSeenAt: now.toISOString(),
        principalId: principal.principalId,
        revokedAt: null,
        sessionId: opaqueIdentifier("session", 18),
        tokenHash: tokenHash(rawSessionToken),
      });
      const event = this.#newEvent({
        eventType: "AUTHENTICATION_SUCCEEDED",
        outcome: "SUCCEEDED",
        principalId: principal.principalId,
        reasonCode: "PASSKEY_USER_VERIFIED",
        sourceKeyHash,
        subjectId: session.sessionId,
      });
      await mutateAdminSecurityState(this.#repository, (latest) => {
        const currentCredential = latest.credentials.find(
          (candidate) =>
            candidate.credentialId === credential.credentialId
            && candidate.principalId === credential.principalId,
        );
        if (
          currentCredential?.counter !== credential.counter
        ) {
          throw new AdminSecurityError(
            "CREDENTIAL_INVALID",
            "Passkey counter changed concurrently.",
          );
        }
        activePrincipal(latest, principal.principalId);
        return {
          result: undefined,
          state: {
            ...withoutRevision(latest),
            credentials: latest.credentials.map((candidate) =>
              candidate.credentialId === credential.credentialId
                ? Object.freeze({
                    ...candidate,
                    counter: verification.newCounter,
                  })
                : candidate),
            securityEvents: appendEvent(latest.securityEvents, event),
            sessions: appendSession(latest.sessions, session, now),
          },
        };
      });
      await this.#rateLimiter.recordSuccess(
        "AUTHENTICATION",
        sourceKeyHash,
      );
      this.#logEvent(event);
      return Object.freeze({
        absoluteExpiresAt: session.absoluteExpiresAt,
        cookie: this.serializeSessionCookie(
          rawSessionToken,
          this.#sessionAbsoluteTtlMs,
        ),
        idleExpiresAt: session.idleExpiresAt,
        principal,
        sessionId: session.sessionId,
        sessionToken: rawSessionToken,
      });
    } catch (error) {
      if (!isRateLimited(error)) {
        await this.#rateLimiter.recordFailure(
          "AUTHENTICATION",
          sourceKeyHash,
        );
        await this.#recordEvent({
          eventType: "AUTHENTICATION_FAILED",
          outcome: "DENIED",
          principalId: null,
          reasonCode: "PASSKEY_VERIFICATION_FAILED",
          sourceKeyHash,
          subjectId: null,
        });
      }
      throw publicCredentialError(error);
    }
  }

  public async authenticateSession(
    sessionToken: string,
    capability?: AdminCapability,
  ): Promise<AuthenticatedAdminSession> {
    const presentedHash = tokenHashChecked(sessionToken, "SESSION_INVALID");
    const now = this.#clock.now();
    const state = await this.#repository.read();
    const session = state.sessions.find((candidate) =>
      hashesEqual(candidate.tokenHash, presentedHash));
    if (!isActiveSession(session, now)) {
      throw new AdminSecurityError(
        "SESSION_INVALID",
        "Admin session is invalid or expired.",
      );
    }
    const principal = activePrincipal(state, session.principalId);
    if (capability !== undefined) {
      try {
        assertCapability(principal, capability);
      } catch (error) {
        await this.#recordEvent({
          eventType: "AUTHORIZATION_DENIED",
          outcome: "DENIED",
          principalId: principal.principalId,
          reasonCode: capability,
          sourceKeyHash: null,
          subjectId: session.sessionId,
        });
        throw error;
      }
    }
    if (
      now.getTime() - Date.parse(session.lastSeenAt)
      < this.#sessionTouchIntervalMs
    ) {
      return Object.freeze({ principal, session });
    }
    const touched = await mutateAdminSecurityState(
      this.#repository,
      (latest) => {
        const current = latest.sessions.find(
          (candidate) => candidate.sessionId === session.sessionId,
        );
        if (!isActiveSession(current, now)) {
          throw new AdminSecurityError(
            "SESSION_INVALID",
            "Admin session is invalid or expired.",
          );
        }
        const next: AdminSessionRecord = Object.freeze({
          ...current,
          idleExpiresAt: new Date(
            Math.min(
              Date.parse(current.absoluteExpiresAt),
              now.getTime() + this.#sessionIdleTtlMs,
            ),
          ).toISOString(),
          lastSeenAt: now.toISOString(),
        });
        return {
          result: next,
          state: {
            ...withoutRevision(latest),
            sessions: latest.sessions.map((candidate) =>
              candidate.sessionId === next.sessionId ? next : candidate),
          },
        };
      },
    );
    return Object.freeze({ principal, session: touched });
  }

  public async logout(sessionToken: string): Promise<void> {
    const presentedHash = tokenHashChecked(sessionToken, "SESSION_INVALID");
    const now = this.#clock.now();
    let event: AdminSecurityEvent | undefined;
    await mutateAdminSecurityState(this.#repository, (state) => {
      const session = state.sessions.find((candidate) =>
        hashesEqual(candidate.tokenHash, presentedHash));
      if (session?.revokedAt !== null) {
        throw new AdminSecurityError(
          "SESSION_INVALID",
          "Admin session is invalid.",
        );
      }
      event = this.#newEvent({
        eventType: "SESSION_REVOKED",
        outcome: "SUCCEEDED",
        principalId: session.principalId,
        reasonCode: "LOGOUT",
        sourceKeyHash: null,
        subjectId: session.sessionId,
      });
      return {
        result: undefined,
        state: {
          ...withoutRevision(state),
          securityEvents: appendEvent(state.securityEvents, event),
          sessions: state.sessions.map((candidate) =>
            candidate.sessionId === session.sessionId
              ? Object.freeze({
                  ...candidate,
                  revokedAt: now.toISOString(),
                })
              : candidate),
        },
      };
    });
    if (event !== undefined) this.#logEvent(event);
  }

  public async revokeSession(input: {
    readonly adminSessionToken: string;
    readonly targetSessionId: string;
  }): Promise<void> {
    assertSafeIdentifier(input.targetSessionId, "targetSessionId");
    const authenticated = await this.authenticateSession(
      input.adminSessionToken,
      "ADMIN_SESSION_MANAGE",
    );
    const now = this.#clock.now();
    const event = this.#newEvent({
      eventType: "SESSION_REVOKED",
      outcome: "SUCCEEDED",
      principalId: authenticated.principal.principalId,
      reasonCode: "ADMIN_REVOCATION",
      sourceKeyHash: null,
      subjectId: input.targetSessionId,
    });
    await mutateAdminSecurityState(this.#repository, (state) => {
      const target = state.sessions.find(
        (candidate) => candidate.sessionId === input.targetSessionId,
      );
      if (target === undefined) {
        throw new AdminSecurityError(
          "SESSION_INVALID",
          "Target admin session does not exist.",
        );
      }
      return {
        result: undefined,
        state: {
          ...withoutRevision(state),
          securityEvents: appendEvent(state.securityEvents, event),
          sessions: state.sessions.map((candidate) =>
            candidate.sessionId === target.sessionId
              ? Object.freeze({
                  ...candidate,
                  revokedAt: candidate.revokedAt ?? now.toISOString(),
                })
              : candidate),
        },
      };
    });
    this.#logEvent(event);
  }

  public async revokeAllSessions(input: {
    readonly adminSessionToken: string;
    readonly principalId?: string;
  }): Promise<number> {
    const authenticated = await this.authenticateSession(
      input.adminSessionToken,
      "ADMIN_SESSION_MANAGE",
    );
    const targetPrincipalId =
      input.principalId ?? authenticated.principal.principalId;
    assertSafeIdentifier(targetPrincipalId, "principalId");
    const now = this.#clock.now();
    let event: AdminSecurityEvent | undefined;
    const count = await mutateAdminSecurityState(
      this.#repository,
      (state) => {
        const activeCount = state.sessions.filter(
          (session) =>
            session.principalId === targetPrincipalId
            && session.revokedAt === null,
        ).length;
        event = this.#newEvent({
          eventType: "ALL_SESSIONS_REVOKED",
          outcome: "SUCCEEDED",
          principalId: authenticated.principal.principalId,
          reasonCode: "GLOBAL_LOGOUT",
          sourceKeyHash: null,
          subjectId: targetPrincipalId,
        });
        return {
          result: activeCount,
          state: {
            ...withoutRevision(state),
            securityEvents: appendEvent(state.securityEvents, event),
            sessions: state.sessions.map((session) =>
              session.principalId === targetPrincipalId
                && session.revokedAt === null
                ? Object.freeze({
                    ...session,
                    revokedAt: now.toISOString(),
                  })
                : session),
          },
        };
      },
    );
    if (event !== undefined) this.#logEvent(event);
    return count;
  }

  public async beginStepUp(input: {
    readonly capability: AdminCapability;
    readonly command: string;
    readonly commandFingerprint: string;
    readonly context: AdminSecurityRequestContext;
    readonly sessionToken: string;
  }): Promise<AdminStepUpStart> {
    assertSafeIdentifier(input.command, "command");
    assertCommandFingerprint(input.commandFingerprint);
    const profile = this.#readyProfile();
    const sourceKeyHash = this.#validateRequestContext(input.context, profile);
    await this.#checkRateLimit("STEP_UP", sourceKeyHash);
    const authenticated = await this.authenticateSession(
      input.sessionToken,
      input.capability,
    );
    if (authenticated.principal.kind !== "HUMAN") {
      throw new AdminSecurityError(
        "CAPABILITY_DENIED",
        "Service principals cannot perform interactive step-up.",
      );
    }
    const state = await this.#repository.read();
    const credentials = state.credentials.filter(
      (credential) =>
        credential.principalId === authenticated.principal.principalId,
    );
    const options = await this.#webAuthn.generateAuthenticationOptions({
      credentials,
      profile,
    });
    const now = this.#clock.now();
    const challenge = this.#newChallenge({
      bootstrapTokenHash: null,
      capability: input.capability,
      challenge: options.challenge,
      command: input.command,
      commandFingerprint: input.commandFingerprint,
      kind: "STEP_UP",
      now,
      principalId: authenticated.principal.principalId,
      sessionId: authenticated.session.sessionId,
      sourceKeyHash,
    });
    const event = this.#newEvent({
      eventType: "STEP_UP_CHALLENGE_CREATED",
      outcome: "SUCCEEDED",
      principalId: authenticated.principal.principalId,
      reasonCode: input.capability,
      sourceKeyHash,
      subjectId: challenge.flowId,
    });
    await mutateAdminSecurityState(this.#repository, (latest) => ({
      result: undefined,
      state: {
        ...withoutRevision(latest),
        challenges: appendChallenge(latest.challenges, challenge, now),
        securityEvents: appendEvent(latest.securityEvents, event),
      },
    }));
    this.#logEvent(event);
    return Object.freeze({
      expiresAt: challenge.expiresAt,
      flowId: challenge.flowId,
      options,
    });
  }

  public async finishStepUp(input: {
    readonly context: AdminSecurityRequestContext;
    readonly flowId: string;
    readonly response: AuthenticationResponseJSON;
    readonly sessionToken: string;
  }): Promise<AdminStepUpReceipt> {
    const profile = this.#readyProfile();
    const sourceKeyHash = this.#validateRequestContext(input.context, profile);
    await this.#checkRateLimit("STEP_UP", sourceKeyHash);
    try {
      const challenge = await this.#consumeChallenge(
        input.flowId,
        "STEP_UP",
        sourceKeyHash,
      );
      if (
        challenge.principalId === null
        || challenge.sessionId === null
        || challenge.capability === null
        || challenge.command === null
        || challenge.commandFingerprint === null
      ) {
        throw new AdminSecurityError(
          "CHALLENGE_INVALID",
          "Step-up challenge is invalid.",
        );
      }
      const authenticated = await this.authenticateSession(
        input.sessionToken,
        challenge.capability,
      );
      if (
        authenticated.principal.principalId !== challenge.principalId
        || authenticated.session.sessionId !== challenge.sessionId
      ) {
        throw new AdminSecurityError(
          "CHALLENGE_INVALID",
          "Step-up challenge is not bound to this session.",
        );
      }
      const state = await this.#repository.read();
      const credential = state.credentials.find(
        (candidate) =>
          candidate.principalId === challenge.principalId
          && candidate.credentialId === input.response.id,
      );
      if (credential === undefined) {
        throw new AdminSecurityError(
          "CREDENTIAL_INVALID",
          "Step-up passkey could not be verified.",
        );
      }
      const verification = await this.#webAuthn.verifyAuthentication({
        challenge: challenge.challenge,
        credential,
        profile,
        response: input.response,
      });
      if (verification === null) {
        throw new AdminSecurityError(
          "CREDENTIAL_INVALID",
          "Step-up passkey could not be verified.",
        );
      }
      const now = this.#clock.now();
      const receiptToken = opaqueToken(32);
      const receipt: AdminStepUpReceiptRecord = Object.freeze({
        capability: challenge.capability,
        command: challenge.command,
        commandFingerprint: challenge.commandFingerprint,
        consumedAt: null,
        createdAt: now.toISOString(),
        expiresAt: new Date(
          now.getTime() + this.#stepUpTtlMs,
        ).toISOString(),
        principalId: challenge.principalId,
        receiptId: opaqueIdentifier("stepup", 18),
        sessionId: challenge.sessionId,
        tokenHash: tokenHash(receiptToken),
      });
      const event = this.#newEvent({
        eventType: "STEP_UP_SUCCEEDED",
        outcome: "SUCCEEDED",
        principalId: challenge.principalId,
        reasonCode: challenge.capability,
        sourceKeyHash,
        subjectId: receipt.receiptId,
      });
      await mutateAdminSecurityState(this.#repository, (latest) => {
        const currentCredential = latest.credentials.find(
          (candidate) =>
            candidate.credentialId === credential.credentialId,
        );
        const currentSession = latest.sessions.find(
          (candidate) =>
            candidate.sessionId === authenticated.session.sessionId,
        );
        if (
          currentCredential?.counter !== credential.counter
          || !isActiveSession(currentSession, now)
        ) {
          throw new AdminSecurityError(
            "STEP_UP_INVALID",
            "Step-up state changed concurrently.",
          );
        }
        return {
          result: undefined,
          state: {
            ...withoutRevision(latest),
            credentials: latest.credentials.map((candidate) =>
              candidate.credentialId === credential.credentialId
                ? Object.freeze({
                    ...candidate,
                    counter: verification.newCounter,
                  })
                : candidate),
            securityEvents: appendEvent(latest.securityEvents, event),
            stepUpReceipts: appendStepUpReceipt(
              latest.stepUpReceipts,
              receipt,
              now,
            ),
          },
        };
      });
      await this.#rateLimiter.recordSuccess("STEP_UP", sourceKeyHash);
      this.#logEvent(event);
      return Object.freeze({
        capability: receipt.capability,
        command: receipt.command,
        commandFingerprint: receipt.commandFingerprint,
        expiresAt: receipt.expiresAt,
        receiptToken,
      });
    } catch (error) {
      if (!isRateLimited(error)) {
        await this.#rateLimiter.recordFailure("STEP_UP", sourceKeyHash);
        await this.#recordEvent({
          eventType: "STEP_UP_FAILED",
          outcome: "DENIED",
          principalId: null,
          reasonCode: "PASSKEY_VERIFICATION_FAILED",
          sourceKeyHash,
          subjectId: null,
        });
      }
      throw publicStepUpError(error);
    }
  }

  public async consumeStepUpReceipt(input: {
    readonly capability: AdminCapability;
    readonly command: string;
    readonly commandFingerprint: string;
    readonly receiptToken: string;
    readonly sessionToken: string;
  }): Promise<void> {
    assertSafeIdentifier(input.command, "command");
    assertCommandFingerprint(input.commandFingerprint);
    const authenticated = await this.authenticateSession(
      input.sessionToken,
      input.capability,
    );
    const receiptHash = tokenHashChecked(
      input.receiptToken,
      "STEP_UP_INVALID",
    );
    const now = this.#clock.now();
    const event = this.#newEvent({
      eventType: "STEP_UP_RECEIPT_CONSUMED",
      outcome: "SUCCEEDED",
      principalId: authenticated.principal.principalId,
      reasonCode: input.capability,
      sourceKeyHash: null,
      subjectId: input.command,
    });
    await mutateAdminSecurityState(this.#repository, (state) => {
      const receipt = state.stepUpReceipts.find((candidate) =>
        hashesEqual(candidate.tokenHash, receiptHash));
      if (
        receipt?.consumedAt !== null
        || !isFuture(receipt.expiresAt, now)
        || receipt.principalId !== authenticated.principal.principalId
        || receipt.sessionId !== authenticated.session.sessionId
        || receipt.capability !== input.capability
        || receipt.command !== input.command
        || !hashesEqual(
          receipt.commandFingerprint,
          input.commandFingerprint,
        )
      ) {
        throw new AdminSecurityError(
          "STEP_UP_INVALID",
          "Step-up receipt is invalid, expired, or already consumed.",
        );
      }
      return {
        result: undefined,
        state: {
          ...withoutRevision(state),
          securityEvents: appendEvent(state.securityEvents, event),
          stepUpReceipts: state.stepUpReceipts.map((candidate) =>
            candidate.receiptId === receipt.receiptId
              ? Object.freeze({
                  ...candidate,
                  consumedAt: now.toISOString(),
                })
              : candidate),
        },
      };
    });
    this.#logEvent(event);
  }

  public async registerServicePrincipal(input: {
    readonly commandFingerprint: string;
    readonly displayName: string;
    readonly principalId: string;
    readonly profile: ServicePrincipalProfile;
    readonly receiptToken: string;
    readonly sessionToken: string;
  }): Promise<ServiceAdminPrincipal> {
    const command = servicePrincipalRegistrationCommand(
      input.principalId,
      input.profile,
    );
    await this.consumeStepUpReceipt({
      capability: "ADMIN_SERVICE_PRINCIPAL_MANAGE",
      command,
      commandFingerprint: input.commandFingerprint,
      receiptToken: input.receiptToken,
      sessionToken: input.sessionToken,
    });
    const authenticated = await this.authenticateSession(
      input.sessionToken,
      "ADMIN_SERVICE_PRINCIPAL_MANAGE",
    );
    const principal = createServicePrincipal({
      createdAt: this.#clock.now().toISOString(),
      displayName: input.displayName,
      principalId: input.principalId,
      profile: input.profile,
    });
    const event = this.#newEvent({
      eventType: "SERVICE_PRINCIPAL_REGISTERED",
      outcome: "SUCCEEDED",
      principalId: authenticated.principal.principalId,
      reasonCode: input.profile,
      sourceKeyHash: null,
      subjectId: input.principalId,
    });
    await mutateAdminSecurityState(this.#repository, (state) => {
      if (
        state.principals.some(
          (candidate) => candidate.principalId === input.principalId,
        )
      ) {
        throw new AdminSecurityError(
          "INPUT_INVALID",
          "Service principal already exists.",
        );
      }
      return {
        result: undefined,
        state: {
          ...withoutRevision(state),
          principals: Object.freeze([...state.principals, principal]),
          securityEvents: appendEvent(state.securityEvents, event),
        },
      };
    });
    this.#logEvent(event);
    return principal;
  }

  public async authorizeKillSwitchChange(input: {
    readonly commandFingerprint: string;
    readonly desiredState: boolean;
    readonly receiptToken: string;
    readonly sessionToken: string;
    readonly switchId: string;
  }): Promise<KillSwitchAuthorizationReceipt> {
    const command = killSwitchCommand(
      input.switchId,
      input.desiredState,
    );
    await this.consumeStepUpReceipt({
      capability: "ADMIN_KILL_SWITCH_CONTROL",
      command,
      commandFingerprint: input.commandFingerprint,
      receiptToken: input.receiptToken,
      sessionToken: input.sessionToken,
    });
    const authenticated = await this.authenticateSession(
      input.sessionToken,
      "ADMIN_KILL_SWITCH_CONTROL",
    );
    const now = this.#clock.now();
    const authorization: KillSwitchAuthorizationReceipt = Object.freeze({
      authorizationId: opaqueIdentifier("authorization", 18),
      authorizedAt: now.toISOString(),
      desiredState: input.desiredState,
      principalId: authenticated.principal.principalId,
      switchId: input.switchId,
    });
    await this.#recordEvent({
      eventType: "KILL_SWITCH_AUTHORIZED",
      outcome: "SUCCEEDED",
      principalId: authenticated.principal.principalId,
      reasonCode: input.desiredState ? "ENABLED" : "DISABLED",
      sourceKeyHash: null,
      subjectId: input.switchId,
    });
    return authorization;
  }

  public async listSecurityEvents(input: {
    readonly limit?: number;
    readonly sessionToken: string;
  }): Promise<readonly AdminSecurityEvent[]> {
    await this.authenticateSession(
      input.sessionToken,
      "ADMIN_SECURITY_EVENT_READ",
    );
    const limit = input.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new AdminSecurityError(
        "INPUT_INVALID",
        "Security event limit must be between 1 and 500.",
      );
    }
    const state = await this.#repository.read();
    return Object.freeze(state.securityEvents.slice(-limit));
  }

  public serializeSessionCookie(
    sessionToken: string,
    lifetimeMs = this.#sessionAbsoluteTtlMs,
  ): string {
    tokenHashChecked(sessionToken, "SESSION_INVALID");
    const profile = this.#readyProfile();
    const attributes = [
      `${profile.cookieName}=${sessionToken}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      "Priority=High",
      `Max-Age=${String(Math.max(0, Math.floor(lifetimeMs / 1_000)))}`,
    ];
    if (profile.cookieSecure) attributes.push("Secure");
    return attributes.join("; ");
  }

  public clearSessionCookie(): string {
    const profile = this.#readyProfile();
    const attributes = [
      `${profile.cookieName}=`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      "Priority=High",
      "Max-Age=0",
    ];
    if (profile.cookieSecure) attributes.push("Secure");
    return attributes.join("; ");
  }

  async #checkRateLimit(
    scope: "AUTHENTICATION" | "BOOTSTRAP" | "REGISTRATION" | "STEP_UP",
    sourceKeyHash: string,
  ): Promise<void> {
    try {
      await this.#rateLimiter.checkAndConsume(scope, sourceKeyHash);
    } catch (error) {
      if (isRateLimited(error)) {
        await this.#recordEvent({
          eventType: "RATE_LIMITED",
          outcome: "DENIED",
          principalId: null,
          reasonCode: scope,
          sourceKeyHash,
          subjectId: null,
        });
      }
      throw error;
    }
  }

  async #consumeChallenge(
    flowId: string,
    kind: AdminChallengeKind,
    sourceKeyHash: string,
  ): Promise<AdminChallengeRecord> {
    assertSafeIdentifier(flowId, "flowId");
    const now = this.#clock.now();
    return mutateAdminSecurityState(this.#repository, (state) => {
      const challenge = state.challenges.find(
        (candidate) =>
          candidate.flowId === flowId && candidate.kind === kind,
      );
      if (
        challenge?.usedAt !== null
        || !isFuture(challenge.expiresAt, now)
        || !hashesEqual(challenge.sourceKeyHash, sourceKeyHash)
      ) {
        throw new AdminSecurityError(
          challenge !== undefined && !isFuture(challenge.expiresAt, now)
            ? "CHALLENGE_EXPIRED"
            : "CHALLENGE_INVALID",
          "WebAuthn challenge is invalid, expired, or already used.",
        );
      }
      return {
        result: challenge,
        state: {
          ...withoutRevision(state),
          challenges: state.challenges.map((candidate) =>
            candidate.flowId === challenge.flowId
              ? Object.freeze({
                  ...candidate,
                  usedAt: now.toISOString(),
                })
              : candidate),
        },
      };
    });
  }

  #newChallenge(input: {
    readonly bootstrapTokenHash: string | null;
    readonly capability: AdminCapability | null;
    readonly challenge: string;
    readonly command: string | null;
    readonly commandFingerprint: string | null;
    readonly kind: AdminChallengeKind;
    readonly now: Date;
    readonly principalId: string | null;
    readonly sessionId: string | null;
    readonly sourceKeyHash: string;
  }): AdminChallengeRecord {
    return Object.freeze({
      bootstrapTokenHash: input.bootstrapTokenHash,
      capability: input.capability,
      challenge: input.challenge,
      command: input.command,
      commandFingerprint: input.commandFingerprint,
      createdAt: input.now.toISOString(),
      expiresAt: new Date(
        input.now.getTime() + this.#challengeTtlMs,
      ).toISOString(),
      flowId: opaqueIdentifier("flow", 18),
      kind: input.kind,
      principalId: input.principalId,
      sessionId: input.sessionId,
      sourceKeyHash: input.sourceKeyHash,
      usedAt: null,
    });
  }

  #newEvent(input: {
    readonly eventType: AdminSecurityEventType;
    readonly outcome: AdminSecurityEventOutcome;
    readonly principalId: string | null;
    readonly reasonCode: string;
    readonly sourceKeyHash: string | null;
    readonly subjectId: string | null;
  }): AdminSecurityEvent {
    return Object.freeze({
      contractVersion: ADMIN_SECURITY_CONTRACT_VERSION,
      eventId: opaqueIdentifier("event", 18),
      eventType: input.eventType,
      occurredAt: this.#clock.now().toISOString(),
      outcome: input.outcome,
      principalId: input.principalId,
      reasonCode: safeEventField(input.reasonCode),
      sourceKeyHash: input.sourceKeyHash,
      subjectId: input.subjectId === null
        ? null
        : safeEventField(input.subjectId),
    });
  }

  async #recordEvent(input: {
    readonly eventType: AdminSecurityEventType;
    readonly outcome: AdminSecurityEventOutcome;
    readonly principalId: string | null;
    readonly reasonCode: string;
    readonly sourceKeyHash: string | null;
    readonly subjectId: string | null;
  }): Promise<void> {
    const event = this.#newEvent(input);
    await mutateAdminSecurityState(this.#repository, (state) => ({
      result: undefined,
      state: {
        ...withoutRevision(state),
        securityEvents: appendEvent(state.securityEvents, event),
      },
    }));
    this.#logEvent(event);
  }

  #logEvent(event: AdminSecurityEvent): void {
    this.#logger?.log({
      event: "admin_security_event",
      level: event.outcome === "DENIED" ? "warn" : "info",
      message: event.eventType,
      metadata: {
        eventId: event.eventId,
        eventType: event.eventType,
        outcome: event.outcome,
        principalId: event.principalId,
        reasonCode: event.reasonCode,
        sourceKeyHash: event.sourceKeyHash,
        subjectId: event.subjectId,
      },
    });
  }

  #readyProfile(): ReadyAdminSecurityProfile {
    if (this.#profile.readiness !== "READY") {
      throw new AdminSecurityError(
        "CONFIGURATION_REQUIRED",
        "Production-domain Admin Security configuration is incomplete.",
      );
    }
    return this.#profile;
  }

  #validateRequestContext(
    context: AdminSecurityRequestContext,
    profile: ReadyAdminSecurityProfile,
  ): string {
    if (context.origin !== profile.origin) {
      throw new AdminSecurityError(
        "CREDENTIAL_INVALID",
        "Security-sensitive request origin is not trusted.",
      );
    }
    const sourceKey = context.sourceKey.trim();
    if (sourceKey.length === 0 || sourceKey.length > 512) {
      throw new AdminSecurityError(
        "INPUT_INVALID",
        "Request source key is invalid.",
      );
    }
    return createHmac("sha256", this.#sourceKeyPepper)
      .update(sourceKey)
      .digest("hex");
  }
}

export const killSwitchCommand = (
  switchId: string,
  desiredState: boolean,
): string => {
  assertSafeIdentifier(switchId, "switchId");
  return `SET_KILL_SWITCH:${switchId}:${desiredState ? "ON" : "OFF"}`;
};

export const servicePrincipalRegistrationCommand = (
  principalId: string,
  profile: ServicePrincipalProfile,
): string => {
  assertSafeIdentifier(principalId, "principalId");
  return `REGISTER_SERVICE_PRINCIPAL:${principalId}:${profile}`;
};

const assertActiveBootstrap = (
  state: AdminSecurityState,
  presentedHash: string,
  now: Date,
): void => {
  if (
    state.bootstrap?.consumedAt !== null
    || !isFuture(state.bootstrap.expiresAt, now)
    || !hashesEqual(state.bootstrap.tokenHash, presentedHash)
    || state.principals.some(
      (principal) => principal.principalId === FOUNDER_PRINCIPAL_ID,
    )
  ) {
    throw new AdminSecurityError(
      "BOOTSTRAP_INVALID",
      "Founder bootstrap token is invalid or expired.",
    );
  }
};

const founderPrincipal = (state: AdminSecurityState): AdminPrincipal =>
  activePrincipal(state, FOUNDER_PRINCIPAL_ID);

const activePrincipal = (
  state: AdminSecurityState,
  principalId: string,
): AdminPrincipal => {
  const principal = state.principals.find(
    (candidate) => candidate.principalId === principalId,
  );
  if (principal?.status !== "ACTIVE") {
    throw new AdminSecurityError(
      "CREDENTIAL_INVALID",
      "Admin principal is unavailable.",
    );
  }
  return principal;
};

const appendChallenge = (
  challenges: readonly AdminChallengeRecord[],
  challenge: AdminChallengeRecord,
  now: Date,
): readonly AdminChallengeRecord[] =>
  Object.freeze(
    [
      ...challenges.filter(
        (candidate) =>
          candidate.usedAt === null
          || now.getTime() - Date.parse(candidate.usedAt)
            <= DEFAULT_CHALLENGE_TTL_MS,
      ),
      challenge,
    ].slice(-MAX_CHALLENGES),
  );

const appendSession = (
  sessions: readonly AdminSessionRecord[],
  session: AdminSessionRecord,
  now: Date,
): readonly AdminSessionRecord[] =>
  Object.freeze(
    [
      ...sessions.filter(
        (candidate) =>
          candidate.revokedAt === null
          && isFuture(candidate.absoluteExpiresAt, now),
      ),
      session,
    ].slice(-MAX_SESSIONS),
  );

const appendStepUpReceipt = (
  receipts: readonly AdminStepUpReceiptRecord[],
  receipt: AdminStepUpReceiptRecord,
  now: Date,
): readonly AdminStepUpReceiptRecord[] =>
  Object.freeze(
    [
      ...receipts.filter(
        (candidate) =>
          candidate.consumedAt === null
          && isFuture(candidate.expiresAt, now),
      ),
      receipt,
    ].slice(-MAX_STEP_UP_RECEIPTS),
  );

const appendEvent = (
  events: readonly AdminSecurityEvent[],
  event: AdminSecurityEvent,
): readonly AdminSecurityEvent[] =>
  Object.freeze([...events, event].slice(-MAX_SECURITY_EVENTS));

const tokenHashChecked = (
  token: string,
  code: "BOOTSTRAP_INVALID" | "SESSION_INVALID" | "STEP_UP_INVALID",
): string => {
  if (
    token.length < 20
    || token.length > 256
    || !/^[A-Za-z0-9_-]+$/u.test(token)
  ) {
    throw new AdminSecurityError(code, "Opaque security token is invalid.");
  }
  return tokenHash(token);
};

const tokenHash = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

const hashesEqual = (left: string, right: string): boolean => {
  if (
    !/^[a-f0-9]{64}$/u.test(left)
    || !/^[a-f0-9]{64}$/u.test(right)
  ) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(left, "hex"),
    Buffer.from(right, "hex"),
  );
};

const opaqueToken = (bytes: number): string =>
  randomBytes(bytes).toString("base64url");

const opaqueIdentifier = (prefix: string, bytes: number): string =>
  `${prefix}_${opaqueToken(bytes)}`;

const isFuture = (iso: string, now: Date): boolean => {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) && parsed > now.getTime();
};

const isActiveSession = (
  session: AdminSessionRecord | undefined,
  now: Date,
): session is AdminSessionRecord =>
  session?.revokedAt === null
  && isFuture(session.absoluteExpiresAt, now)
  && isFuture(session.idleExpiresAt, now);

const positiveDuration = (
  value: number | undefined,
  defaultValue: number,
  name: string,
): number => {
  const result = value ?? defaultValue;
  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new AdminSecurityError(
      "INPUT_INVALID",
      `${name} must be a positive safe integer.`,
    );
  }
  return result;
};

const safeEventField = (value: string): string => {
  const normalized = value.trim();
  if (
    normalized.length === 0
    || normalized.length > 128
    || !/^[A-Za-z0-9._:-]+$/u.test(normalized)
  ) {
    return "REDACTED_INVALID_FIELD";
  }
  return normalized;
};

const publicCredentialError = (error: unknown): AdminSecurityError => {
  if (
    error instanceof AdminSecurityError
    && (
      error.code === "RATE_LIMITED"
      || error.code === "CONFIGURATION_REQUIRED"
      || error.code === "BOOTSTRAP_ALREADY_COMPLETED"
    )
  ) {
    return error;
  }
  return new AdminSecurityError(
    "CREDENTIAL_INVALID",
    "Passkey ceremony failed.",
  );
};

const publicStepUpError = (error: unknown): AdminSecurityError => {
  if (
    error instanceof AdminSecurityError
    && (
      error.code === "RATE_LIMITED"
      || error.code === "CONFIGURATION_REQUIRED"
    )
  ) {
    return error;
  }
  return new AdminSecurityError(
    "STEP_UP_INVALID",
    "Passkey step-up ceremony failed.",
  );
};

const isRateLimited = (error: unknown): boolean =>
  error instanceof AdminSecurityError && error.code === "RATE_LIMITED";
