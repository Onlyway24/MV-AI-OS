# Private production start

This boundary turns an explicit, attributable business intake into durable
internal work. It does not invent a market, an offer or evidence. It acquires
only the HTTPS targets declared under registered canonical sources, creates
exactly three Evidence Packs, compares the three opportunities and runs the 17
Agent Company executors to prepare the Business Mission, content, sales,
delivery, engineering and guardian outputs.

The command always establishes the global publication kill switch first. Its
contract requires zero provider calls, zero authorized spend, zero workday
budget, zero validation budget and no external action. Content remains pending
Fabio review. Research that is stale, contradicted, insufficient, outside its
canonical source path or not publicly attributable stops all downstream work.

## Prepare the first real intake

Copy
`ops/production/private-production-intake.example.json` outside the repository
and replace every `replace-*` value. Use a new versioned `intakeId`, research
mission ID, evidence IDs, pack IDs, production ID and workday ID for each new
research cycle. Reusing an unchanged registered source is supported; changing
the policy of an existing source ID is rejected.

The three opportunity scores must point only to evidence contained in their
own pack. The content claim must match the research claim statement exactly.
For finance, health or legal claims, the research engine requires independent
corroboration and the source policies must permit that risk domain.

Install the completed intake through the existing SSH session:

```sh
sudo install -o root -g onlyway -m 0640 \
  /tmp/private-production-intake.json \
  /srv/onlyway/config/private-production-intake.json
```

Do not place credentials, personal data, unpublished customer material or API
keys in the intake. The maximum accepted size is 512 KiB.

## Run and interpret

After the exact feature commit is deployed and private readiness is green:

```sh
sudo /srv/onlyway/current/scripts/production/start-private-production.sh
```

The one-shot `production-starter` container is the only production profile
attached to the research-egress network. It mounts no provider secret, exposes
no port, exits after the bounded acquisition/workday and is not restarted. The
five H24 core services remain on the internal no-egress network.

A successful receipt reports `status: READY`, `researchStatus: READY`, three
packs and `workdayStatus: AWAITING_FABIO`. `NOT_READY` is a fail-closed result:
read the durable research or Agent Company blockers in the private Command
Center, correct the source/business input, then submit a new versioned intake.
Never bypass a blocker by weakening required phrases or fabricating evidence.
