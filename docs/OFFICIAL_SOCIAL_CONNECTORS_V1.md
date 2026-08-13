# Instagram and TikTok official connection V1

This runbook is connection-only. Publication, private posting, draft upload,
scheduling, messages, comments and campaigns remain unavailable in code and in
the local UI.

## Fixed local boundary

- Local operator URL: `http://127.0.0.1:43123/`
- Instagram callback: `http://127.0.0.1:43123/oauth/instagram/callback`
- TikTok Desktop callback: `http://127.0.0.1:43123/oauth/tiktok/callback/`
- Token vault: AES-256-GCM, owner-only file outside the repository.
- Asset delivery: local-only. No HTTPS storage or domain is purchased here.
- Publication: `LOCKED` regardless of OAuth, Insights, creator info or Fabio's
  later content review.

## Instagram contract

Use a Meta Business app named **Onlyway Social Operator** and add the current
Instagram product / Instagram API with Instagram Login. Confirm the API version
shown as current in the App Dashboard rather than hard-coding a stale Graph
version. The expected profile is `@mr.metodo.veloce_official` and must be a
Creator or Business account owned by Fabio.

Only these scopes are requested:

- `instagram_business_basic`
- `instagram_business_content_publish`
- `instagram_business_manage_insights`

Messages, comments and ads permissions are intentionally absent. Standard
Access and any tester role must be confirmed in the Meta App Dashboard. The
connector reads identity, permission status and an Insights preflight only.

Official references:

- <https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/>
- <https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/>
- <https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/insights/>

## TikTok contract

Use a TikTok for Developers app named **Onlyway Social Operator**, platform
Desktop, with Login Kit and Content Posting API. Desktop OAuth uses the v2
authorization endpoint, one-shot code, anti-CSRF state, a 43–128 character PKCE
verifier, and TikTok's documented hex-encoded SHA-256 S256 challenge.

Requested scopes:

- `user.info.basic`
- `user.info.profile` — only because TikTok protects the exact `username` field
  with this scope and exact account binding is mandatory
- `video.publish`

`video.list` is not requested. The expected profile is
`@metodo_veloce.official`. Creator info and available privacy choices are read;
no init, upload or post endpoint is called. Unaudited clients remain marked
private-only and public posting remains locked. Pull-from-URL remains blocked
until a future verified HTTPS domain/prefix exists.

Official references:

- <https://developers.tiktok.com/doc/login-kit-desktop/>
- <https://developers.tiktok.com/doc/oauth-user-access-token-management/>
- <https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info/>
- <https://developers.tiktok.com/doc/content-posting-api-get-started/>
- <https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info/>

## Local secret entry and start

Never paste credentials in chat. Run each interactive script locally; secret
input is hidden and the scripts print only presence and file mode:

```text
./scripts/save-instagram-connector-credentials.sh
./scripts/save-tiktok-connector-credentials.sh
npm run build
npm run social-connectors -- preflight --config ./config/official-social-connectors.json
npm run social-connectors -- start --config ./config/official-social-connectors.json
```

`preflight` performs no browser navigation, OAuth exchange or provider request. It
strictly verifies the contract version, exact redirect URIs, expected accounts,
scope allowlists, owner-only local SecretReferences and the requirement that every
secret/vault path remains outside the repository. Its JSON result contains only
stable check codes and opaque `secretId` values: never a path or resolved value.
Startup remains blocked unless every check is `PASS`.

Open only the local operator root and use its Connect/Reconnect, Verify status or
Disconnect controls. Connect/Reconnect is a local HTML form `POST` to
`/oauth/{platform}/start` with the page's CSRF token and an exact loopback `Origin`;
`GET /oauth/{platform}/start` is deliberately unsupported. Do not paste or manually
construct an authorization URL. There is deliberately no Publish button.

The loopback runtime exposes three read-only operational endpoints:

- `http://127.0.0.1:43123/health` — process readiness and publication lock;
- `http://127.0.0.1:43123/api/status` — redacted connector state;
- `http://127.0.0.1:43123/api/checkpoint` — the single machine-readable browser
  checkpoint with dashboards, products, callbacks, scopes, scripts, accounts and
  expected final states.

Status writes use an owner-only temporary file, file sync and atomic rename. The
artifact rejects access tokens, refresh tokens, authorization codes, client secrets
and PKCE verifiers before any write. It records zero posts, drafts, uploads or
messages and always keeps publication `LOCKED`.

Pending OAuth state is durable across process restart. An unexpired pending request
must complete through its original state-bound callback and blocks a duplicate
Connect action. An expired pending request is removed automatically only when the
operator explicitly starts a new connection; authorization-code replay fingerprints
remain retained. No manual vault editing is required.

Wrong-account, personal-account and explicit Disconnect paths delete the local
credential before attempting best-effort provider revocation. A revocation failure
therefore cannot leave a locally usable token: the receipt becomes `UNCERTAIN`, the
connector remains disconnected/blocked and a later connection requires fresh OAuth.
The deleted credential is never restored merely to retry revocation.

## Single final browser checkpoint for Fabio

Complete this checkpoint only after the media package is ready for review:

1. In the Meta App Dashboard, create or select **Onlyway Social Operator**, add
   Instagram API with Instagram Login, register the exact Instagram callback
   above, enable only the three listed scopes, and confirm the expected account
   is Creator or Business. Do not paste the secret into chat.
2. In TikTok for Developers, create or select **Onlyway Social Operator**, add
   Login Kit and Content Posting API for Desktop, register the exact trailing-
   slash TikTok callback above, enable only the three listed scopes, and complete
   the provider-required domain/audit steps. Do not paste the secret into chat.
3. Save the two provider credential pairs locally with the two scripts above.
   They also create the owner-only OAuth vault key when it is absent.
4. Start the local connector, connect the exact two expected profiles, and use
   **Verify status**. Stop if the Instagram account is personal or either
   username differs from the expected profile.

Exact dashboard entry points used by the machine-readable checkpoint:

- Meta App Dashboard: <https://developers.facebook.com/apps/>
- TikTok for Developers apps: <https://developers.tiktok.com/apps/>

The checkpoint is complete only when Instagram reports `INSIGHTS_READY` and TikTok
reports `CREATOR_INFO_READY`. TikTok audit/domain state remains a separately visible
provider requirement; neither state unlocks publication.

This checkpoint grants connection and read verification only. It does not grant
publication, scheduling, drafts, uploads, messages, comments or campaigns.
