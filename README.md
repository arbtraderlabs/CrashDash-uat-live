# CrashDash UAT website publication

**UAT publication artifacts only.** This repository is the deployment target for
the on-demand CrashDash UAT acceptance website. It is not the production site and
must never receive production output.

## Layout

GitHub Pages is configured as **Deploy from a branch -> `main` -> `/docs`**, with
custom domain `uat.crashdash.ai`. The currently committed `docs/` contains a
generated UAT publication for canonical run `market-cycle-2026-09-30-1000`,
image `sha256:d18fc4eac5646dd5c2a005cdc727cc750b570432f17af71704f943561eb69754`,
and UAT execution `uat-20260929T152632Z-1000`. This identifies the committed
artifact and is not a live HTTPS health check.

```
/                README.md and minimal repo metadata only
/docs/           the generated static UAT website  <- the published artifact
/docs/index.html must exist
```

UAT publication steps:

1. build the static site from the accepted UAT run output
2. replace `docs/` atomically (stale publications from a previous run must not survive)
3. write the provenance file into `docs/`
4. add `docs/CNAME` when the Pages custom-domain target is confirmed
5. commit and push `main`
6. verify `https://uat.crashdash.ai` serves the expected run before claiming PASS

## Publication-only transforms

These are the only permitted differences between the accepted UAT product tree
and the published `docs/` tree. Every publication must apply them, and any new
transform must be added here before it is used.

| transform | why |
| --- | --- |
| flatten module imports: `../browser.js` -> `./browser.js` in `shell.js`, `shell_views.js`, `shell_data.js`, `real_contract.js` | the product tree is published flat, so parent-relative module paths cannot resolve |
| cache-invalidation shim in `index.html` | `build.json` and `data/*.json` are served with `Cache-Control: max-age=600`, so a cached response could otherwise survive a deployment and render a stale site with no error; the shim applies the same `cache: "no-store"` policy that `preview-context.txt` already uses. Never rely on visitors to hard-refresh. |
| deployment-stamped entry module (`shell.js?v=<deployment token>`) | forces a fresh module graph per publication |
| generated `build.json` and `publication.json` | provenance, per the Provenance section above |

`docs/CNAME` is preserved from the previous publication.

## What belongs in docs/

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

The committed artifact is generated UAT output. Build provenance and the
execution record in `docs/build.json` are authoritative for that publication.
The README does not claim that the current Pages endpoint or custom-domain TLS
is healthy; verify the public endpoint separately when that is the acceptance
criterion.
