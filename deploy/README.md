# Deployment

There are two ways to put the platform in front of people.

- **GitHub Pages** — the open-access copy, rebuilt from `main` with no backend. All six
  modules work; the opening poll points at an external poll tool or reports itself
  unavailable, and the facilitator view is open. See "GitHub Pages" below.
- **AWS** — what the ASHG 2026 session ran on, for a live room: the static decision lab
  (S3 behind CloudFront) and the aggregate-only polling API (Lambda + DynamoDB), served
  same-origin under `/api/*` so no CORS is involved and participants only ever talk to one
  hostname. The rest of this runbook covers it.

For a live session, use an **institution-owned AWS account**, not a personal one, and not a
short-lived sandbox account that expires its resources.

---

## 1. Get the account (start here; this has institutional lead time)

Ask your research-computing or cloud team for an AWS account. Typical request fields:

| Field | Value for this project |
| --- | --- |
| Cloud provider | Amazon Web Services |
| Billing and technical contacts | |
| Estimated spend | ~$50/yr is a defensible ceiling (see below) |
| Intended use | "Static educational web application and a small aggregate-only polling API for a workshop." |
| Grant number | include it if the work is grant-funded; some programs discount on it |

**Cost.** The workload is single-digit dollars per month: a few MB in S3, CloudFront
serving ~150 people for two hours once, and DynamoDB on-demand plus Lambda comfortably
inside the free tier.

Provisioning itself can be quick. Purchase orders and billing paths are usually the slow
part, so start before you need it.

### Confirm the guardrails before deploying

Ask your cloud team:

1. Does our permission set allow creating **IAM roles** and an **IAM OIDC identity
   provider**? GitHub Actions deploys need both. If not, set `CreateGitHubOidcProvider`
   and/or `CreateDeployRole` to `false` in the stack and use the role ARN they provide.
2. Any SCPs restricting CloudFront distributions, S3 bucket policies, or Lambda
   Function URLs?
3. Required region and required cost-allocation tags?

### Example: Northwestern

The ASHG 2026 session ran in a Northwestern account. There, the request is a
[Public Cloud Account Request](https://services.northwestern.edu/TDClient/30/Portal/Requests/ServiceOfferingDet?ID=96)
(or email `consultant@northwestern.edu`, asking for **NUIT-CI-CloudOps**), and guardrail
questions go to `awscloudops@northwestern.edu`.
[NET+ AWS](https://services.northwestern.edu/TDClient/30/Portal/KB/ArticleDet?ID=1854)
gives 4.5% off and waived egress. **NIH STRIDES** gives 9% (14% on S3 storage), waived
egress, and free enterprise-level support for NIH-funded projects. For a first production
deployment the included support is worth more than the discount.

## 2. Authenticate

Use IAM Identity Center (SSO), not static access keys. A profile in `~/.aws/config` looks
like this — the values below are Northwestern's STRIDES portal; substitute your own:

```ini
[sso-session nu-strides]
sso_start_url = https://nu-strides-sso.awsapps.com/start
sso_region = us-east-2
sso_registration_scopes = sso:account:access

[profile ashg2026]
sso_session = nu-strides
sso_account_id = <account id from the Identity Center portal>
sso_role_name = AWSAdministratorAccess
region = us-east-2
output = json
```

```bash
aws sso login --profile ashg2026       # each session; lasts a few hours
aws sts get-caller-identity --profile ashg2026
```

Keep the account id out of the repository. It is not a credential, but nothing here needs
it, and a public tree is permanent.

Stack creation needs the `AWSAdministratorAccess` permission set — note the `AWS` prefix, which is
what Identity Center actually names it; `AdministratorAccess` is rejected as `No access` at
`GetRoleCredentials`. `PowerUserAccess` cannot create the IAM roles.

Every command below takes `--profile ashg2026`. No long-lived AWS keys belong in this
repository or in GitHub secrets — CI authenticates by OIDC role assumption.

## 3. Create the stack

One CloudFormation stack covers the bucket, distribution, edge auth function, DynamoDB
table, Lambda, and the GitHub deploy role.

```bash
# 'Basic ' + base64(username:password) for the edge gate on /facilitator. Prompted so the
# password stays out of shell history; -w0 because GNU base64 wraps long output, which
# would silently break the header comparison.
read -rsp 'Facilitator password: ' FPW; echo
FACILITATOR_AUTH="Basic $(printf 'facilitator:%s' "$FPW" | base64 -w0)"

aws cloudformation deploy \
  --profile ashg2026 \
  --stack-name ashg2026-omics-workshop \
  --template-file deploy/infra/workshop-stack.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --tags Project=ashg2026-omics-workshop \
  --parameter-overrides \
      "FacilitatorBasicAuth=$FACILITATOR_AUTH" \
      GitHubRepository=<owner>/<repo> \
      "GitHubRepositoryImmutableId=<owner>@$(gh api orgs/<owner> --jq .id)/<repo>@$(gh api repos/<owner>/<repo> --jq .id)"

aws cloudformation describe-stacks \
  --profile ashg2026 \
  --stack-name ashg2026-omics-workshop \
  --query 'Stacks[0].Outputs' --output table
```

The distribution takes a few minutes to reach `Deployed`.

> `deploy/infra/facilitator-auth.js` is the readable, lint-checked source of the edge
> function. The template inlines the same logic with the credential substituted in. If you
> change one, change both.

## 4. Configure the repository

From the stack outputs, set these **repository variables** (Settings → Secrets and
variables → Actions → Variables):

| Variable | From output |
| --- | --- |
| `AWS_REGION` | the region you deployed into |
| `AWS_DEPLOY_ROLE_ARN` | `DeployRoleArn` |
| `SITE_BUCKET` | `SiteBucketName` |
| `SITE_URL` | `SiteUrl` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `DistributionId` |
| `POLL_FUNCTION_NAME` | `PollFunctionName` |

And these **secrets**:

| Secret | Notes |
| --- | --- |
| `VITE_FACILITATOR_USERNAME` | must match the Basic auth pair above |
| `VITE_FACILITATOR_PASSWORD` | the in-app gate fails closed if either is unset |

The deploy workflow fails fast if the facilitator secrets are missing, because a build
without them ships a facilitator view that cannot be opened at all.

**These two must hold the same pair as `FacilitatorBasicAuth` in step 3.** The edge gate reads
its credential from the stack parameter and the in-app gate from these secrets, so the two can
disagree while every other check stays green — the browser prompt then opens for one password and
the form behind it demands another. This happened on the first deploy: the stack was built from a
password in `apps/web/.env.local` that had drifted from the secret. Since a secret's value cannot
be read back, do not assume a local file matches it; set both from the same source, and let the
deploy smoke check confirm it. That check now posts the built-in pair at `/facilitator` and fails
on anything but 200, which is the only thing that actually ties the two gates together.

## 5. Deploy

```bash
git tag -a v1.0.0-ashg -m "ASHG 2026 workshop build"
git push origin v1.0.0-ashg
```

`.github/workflows/deploy.yml` then lints, validates, tests, builds, ships the Lambda,
uploads the site with per-asset cache headers, invalidates the edge, and **smoke-checks
both the app shell and `/api/polls/analytic-practice`** before reporting success.

Cache policy, matching the upload passes:

| Path | Cache-Control | Why |
| --- | --- | --- |
| `assets/*` | `max-age=31536000, immutable` | Vite filenames are content-hashed |
| `data/scenarios/*.json` | `max-age=86400` | raised for the frozen workshop tag |
| `index.html` | `no-cache` | so a rollback propagates immediately |

## 6. Before the session

```bash
# Substantiate the concurrency claim against the deployed stack, not a laptop process.
POLLING_BASE_URL=https://YOUR_DISTRIBUTION.cloudfront.net npm run test:polling-load

# Clear any counts left over from rehearsal.
AWS_PROFILE=ashg2026 POLLING_TABLE_NAME=<PollTableName> npm run polling:reset
```

Then walk `workshop/rehearsal-checklist.md` against the production URL, on a network that
is not the office LAN.

## Custom domain (optional)

An institutional hostname usually goes through your DNS team (at Northwestern, the NUIT
[Hostmaster Request](https://www.it.northwestern.edu/network/dns/index.html), under the
owning school's subdomain). The ACM certificate must be issued in `us-east-1` for
CloudFront. If that adds schedule risk, ship on the default `*.cloudfront.net` domain — the
workshop needs a working URL on a slide, not a vanity name.

## GitHub Pages

The open-access copy, and the fallback for a live session if an AWS account is not usable
about four weeks out: publish the static site to Pages and run the opening poll on an
external tool. The scenario platform is static-first by design and loses nothing; only the
in-platform poll and the synthesis view depend on the backend.

`.github/workflows/pages.yml` implements this. It runs the same lint, data-validation, and
test gates as the AWS deploy, builds under the repository sub-path, and publishes to Pages
on every push to `main`. It touches no AWS resource, so it is safe to run alongside the AWS
path.

### One-time setup

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.** Do this *before*
   the first run, or `actions/configure-pages` fails.
2. **Settings → Environments → `github-pages` → Deployment branches.** Confirm `main` is
   allowed. Branch protection here blocks `workflow_dispatch` from other branches with an
   error that reads like a permissions problem.
3. Optional: create the poll in the external tool with the same question and four options as
   `backend/polling/poll.mjs`, set it to require no signup, and capture both the join URL
   and the presenter URL.
4. Set the **repository variables** below. They are variables rather than secrets because
   the join link goes on a slide.

| Variable | Notes |
| --- | --- |
| `EXTERNAL_POLL_URL` | participant join link; only `http(s)` is honoured |
| `EXTERNAL_POLL_QUESTION` | optional; defaults to the question in `backend/polling/poll.mjs` |
| `EXTERNAL_POLL_RESULTS_URL` | optional; the tool's presenter view, linked from the run sheet |
| `EXTERNAL_POLL_LABEL` | optional; projected instead of the raw URL, e.g. a join code |

With none of these set, the opening poll reports itself unavailable and every module still
works. The workflow sets no `VITE_FACILITATOR_*`, so the facilitator view is open; to gate
it for a live session, add both to the build step's `env` from **repository** secrets (the
Pages job declares no environment, so environment-scoped secrets arrive empty).

### Deploy

Push to `main`, or run **Actions → Pages → Run workflow**. Then:

- Participants: `https://heart-gen.github.io/modeling-choices-omics-ashg2026/`
- Facilitator: `https://heart-gen.github.io/modeling-choices-omics-ashg2026/#/facilitator`

Use the hash URL on the run sheet. The `<base>/facilitator` pathname also works — the
workflow copies `index.html` to `404.html`, which is how Pages does SPA fallback — but
Pages serves it with a 404 status, so never write a check that asserts on the status code.

### How it differs from the primary deployment

| | CloudFront | Pages |
| --- | --- | --- |
| Audience | anyone with the URL | anyone with the URL |
| Facilitator gate | CloudFront Function at the edge, plus the in-app gate | none by default; in-app gate if configured |
| Opening poll | in-platform, aggregate counts in the app | external tool; counts live in that tool |
| Synthesis view | live `PollResultsPanel` chart | a projectable pointer, no counts |
| Cache headers | tuned per asset class | Pages defaults |
| Load test | `POLLING_BASE_URL=… npm run test:polling-load` | not applicable, no backend |

On Pages there is no edge check, so if you gate the facilitator view there, the in-app form
is the only thing in front of the run sheet. See "Facilitator access is not a security
boundary" below.

## Facilitator access is not a security boundary

The in-app gate compares against values baked into the bundle, which anyone can read. The
CloudFront Function adds an edge check so the path is not casually browsable. Neither
protects sensitive data, and none exists here: every number in the platform is synthetic or
aggregate, and the poll stores counts only — no names, accounts, IP addresses, or free
text.
