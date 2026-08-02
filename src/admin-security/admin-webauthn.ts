import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";

import type {
  AdminWebAuthnCredential,
  ReadyAdminSecurityProfile,
} from "./admin-security-contracts.js";

export type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
};

export interface AdminRegistrationVerification {
  readonly backedUp: boolean;
  readonly counter: number;
  readonly credentialId: string;
  readonly deviceType: "multiDevice" | "singleDevice";
  readonly publicKey: string;
  readonly transports: readonly string[];
}

export interface AdminAuthenticationVerification {
  readonly newCounter: number;
}

export interface AdminWebAuthn {
  generateAuthenticationOptions(input: {
    readonly credentials: readonly AdminWebAuthnCredential[];
    readonly profile: ReadyAdminSecurityProfile;
  }): Promise<PublicKeyCredentialRequestOptionsJSON>;
  generateRegistrationOptions(input: {
    readonly existingCredentials: readonly AdminWebAuthnCredential[];
    readonly profile: ReadyAdminSecurityProfile;
    readonly userDisplayName: string;
    readonly userId: Uint8Array;
    readonly userName: string;
  }): Promise<PublicKeyCredentialCreationOptionsJSON>;
  verifyAuthentication(input: {
    readonly challenge: string;
    readonly credential: AdminWebAuthnCredential;
    readonly profile: ReadyAdminSecurityProfile;
    readonly response: AuthenticationResponseJSON;
  }): Promise<AdminAuthenticationVerification | null>;
  verifyRegistration(input: {
    readonly challenge: string;
    readonly profile: ReadyAdminSecurityProfile;
    readonly response: RegistrationResponseJSON;
  }): Promise<AdminRegistrationVerification | null>;
}

export class SimpleAdminWebAuthn implements AdminWebAuthn {
  public async generateAuthenticationOptions(input: {
    readonly credentials: readonly AdminWebAuthnCredential[];
    readonly profile: ReadyAdminSecurityProfile;
  }): Promise<PublicKeyCredentialRequestOptionsJSON> {
    return generateAuthenticationOptions({
      allowCredentials: input.credentials.map((credential) => ({
        id: credential.credentialId,
        transports: asAuthenticatorTransports(credential.transports),
      })),
      rpID: input.profile.relyingPartyId,
      timeout: 60_000,
      userVerification: "required",
    });
  }

  public async generateRegistrationOptions(input: {
    readonly existingCredentials: readonly AdminWebAuthnCredential[];
    readonly profile: ReadyAdminSecurityProfile;
    readonly userDisplayName: string;
    readonly userId: Uint8Array;
    readonly userName: string;
  }): Promise<PublicKeyCredentialCreationOptionsJSON> {
    return generateRegistrationOptions({
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      excludeCredentials: input.existingCredentials.map((credential) => ({
        id: credential.credentialId,
        transports: asAuthenticatorTransports(credential.transports),
      })),
      rpID: input.profile.relyingPartyId,
      rpName: input.profile.relyingPartyName,
      timeout: 60_000,
      userDisplayName: input.userDisplayName,
      userID: copyUint8Array(input.userId),
      userName: input.userName,
    });
  }

  public async verifyAuthentication(input: {
    readonly challenge: string;
    readonly credential: AdminWebAuthnCredential;
    readonly profile: ReadyAdminSecurityProfile;
    readonly response: AuthenticationResponseJSON;
  }): Promise<AdminAuthenticationVerification | null> {
    if (input.response.id !== input.credential.credentialId) return null;
    const result = await verifyAuthenticationResponse({
      credential: {
        counter: input.credential.counter,
        id: input.credential.credentialId,
        publicKey: decodeBase64Url(input.credential.publicKey),
        transports: asAuthenticatorTransports(input.credential.transports),
      },
      expectedChallenge: input.challenge,
      expectedOrigin: input.profile.origin,
      expectedRPID: input.profile.relyingPartyId,
      requireUserVerification: true,
      response: input.response,
    });
    if (
      !result.verified
      || !result.authenticationInfo.userVerified
    ) {
      return null;
    }
    return Object.freeze({
      newCounter: result.authenticationInfo.newCounter,
    });
  }

  public async verifyRegistration(input: {
    readonly challenge: string;
    readonly profile: ReadyAdminSecurityProfile;
    readonly response: RegistrationResponseJSON;
  }): Promise<AdminRegistrationVerification | null> {
    const result = await verifyRegistrationResponse({
      expectedChallenge: input.challenge,
      expectedOrigin: input.profile.origin,
      expectedRPID: input.profile.relyingPartyId,
      requireUserPresence: true,
      requireUserVerification: true,
      response: input.response,
    });
    if (
      !result.verified
      || !result.registrationInfo.userVerified
    ) {
      return null;
    }
    return Object.freeze({
      backedUp: result.registrationInfo.credentialBackedUp,
      counter: result.registrationInfo.credential.counter,
      credentialId: result.registrationInfo.credential.id,
      deviceType: result.registrationInfo.credentialDeviceType,
      publicKey: Buffer.from(
        result.registrationInfo.credential.publicKey,
      ).toString("base64url"),
      transports: Object.freeze([
        ...(result.registrationInfo.credential.transports ?? []),
      ]),
    });
  }
}

const asAuthenticatorTransports = (
  transports: readonly string[],
): AuthenticatorTransportFuture[] =>
  transports.filter(isAuthenticatorTransport);

const isAuthenticatorTransport = (
  value: string,
): value is AuthenticatorTransportFuture =>
  value === "ble"
  || value === "cable"
  || value === "hybrid"
  || value === "internal"
  || value === "nfc"
  || value === "smart-card"
  || value === "usb";

const decodeBase64Url = (value: string): Uint8Array<ArrayBuffer> => {
  const decoded = Buffer.from(value, "base64url");
  return copyUint8Array(decoded);
};

const copyUint8Array = (
  value: Uint8Array,
): Uint8Array<ArrayBuffer> => {
  const result = new Uint8Array(value.byteLength);
  result.set(value);
  return result;
};
