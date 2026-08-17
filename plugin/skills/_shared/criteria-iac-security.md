# Criteria: IaC Security & Hygiene

Shared, criteria-only fragment — what to flag in infrastructure-as-code (Terraform, Bicep, Dockerfiles, Docker Compose, Kubernetes manifests, Helm charts). No workflow, no Next Actions. Consumed by `/claude-tweaks:code-health`'s iac-security judgment lens (infra areas). Confidence floor: `high`.

## What to flag

- **Over-permissive IAM / RBAC:** a role, policy, or binding that grants `*` on actions or resources when the principle of least privilege would allow a narrow, named set.
- **Public exposure without intent:** a storage bucket, database security group, or service with `public: true`, `0.0.0.0/0` ingress, or `AllowAll` that does not have a documented reason for being public.
- **Secrets in IaC source:** API keys, passwords, tokens, or private keys hard-coded in `.tf`, `.bicep`, `values.yaml`, `docker-compose.yml`, or Kubernetes `Secret` manifests committed to the repo (the secret value, not a reference to a secret manager).
- **Container images pinned to `latest` or unpinned tags:** `image: my-service` or `image: my-service:latest` in a manifest — no digest, no pinned version, making builds non-deterministic and vulnerable to supply-chain attacks.
- **Privileged containers or root-user Dockerfiles:** `privileged: true`, `runAsUser: 0`, or a Dockerfile that does not add a non-root USER before the CMD/ENTRYPOINT.
- **Unencrypted data stores:** an RDS instance, S3 bucket, or EBS volume with encryption explicitly disabled or unset in a context where the cloud provider's default is off.

## What NOT to flag

- Resource naming or tagging conventions that are project-specific style choices with no security impact.
- Missing cost-optimization annotations (instance sizes, autoscaling limits).
- Findings that require knowledge of the specific deployment environment to evaluate (e.g., whether a private subnet is truly isolated) — flag only when the code itself reveals the gap.

## Severity calibration

- **high** — a secret value committed to source control, a storage resource publicly readable without intent, `*` IAM actions on a production environment, or a privileged container in a multi-tenant cluster.
- **medium** — unpinned image tags, unencrypted data at rest in a dev/staging environment.
- **low** — a minor hygiene gap (missing label, non-standard structure) with no direct security impact.
