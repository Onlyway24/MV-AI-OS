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
node ./dist/social-publishing/social-connector-cli.js --config ./config/official-social-connectors.json
```

Open the local operator URL and use only Connect/Reconnect, Verify status or
Disconnect. There is deliberately no Publish button.
