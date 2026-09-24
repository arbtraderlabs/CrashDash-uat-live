# CrashDash UAT website publication

**UAT publication artifacts only.** This repository is the deployment target for
the on-demand CrashDash UAT acceptance website. It is not the production site and
must never receive production output.

## What belongs here

- the generated static website (HTML/CSS/JS/assets) produced by a **successful**
  UAT full-chain run
- a machine-readable provenance file
- minimal static-hosting metadata (for example `CNAME`)

## What must never be here

- CrashDash application source, tests, Dockerfiles or Python
- runtime state, run trees or databases
- secrets, provider credentials, tokens or `.env` files
- internal evidence bundles or logs containing internal detail
- anything copied from a production publication

## Provenance

Every publication records, at minimum:

| field | meaning |
| --- | --- |
| `source_sha` | the commit the image was built from |
| `image_id` | immutable image identity (`sha256:...`) |
| `image_ref` | image tag, e.g. `crashdash:sha-<short>` |
| `uat_run_id` | the UAT execution that produced these artifacts |
| `generated_at` | UTC timestamp of generation |
| `reference` | master/snapshot hashes the UAT cohort was derived from |

A publication with missing or inconsistent provenance is invalid and should be
rejected rather than served.

## Status

Scaffolding only. **No UAT run has produced accepted output yet**, so no website
artifacts have been published. The latest UAT chain execution failed at the live
market-data stage (provider HTTP 429 and delisted tickers), which is precisely the
dependency that deterministic UAT mode exists to remove but does not yet implement.

Custom domain (planned, not yet configured): `uat.crashdash.ai`.
