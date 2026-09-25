# TaskFlow – Azure Capstone Project

A secure, end-to-end Task & Project Manager built on Azure, demonstrating a production-pattern architecture with zero public exposure to the backend and database.

**Live Demo:** https://capstone-12662.centralindia.cloudapp.azure.com

---

## 1. What This Project Does

TaskFlow lets a signed-in user:
- Create, edit, and delete **Projects** (with manager and description)
- Create, complete, and delete **Tasks** under a project
- Add **Comments** on tasks

Users authenticate with **Microsoft Entra ID** before any data is created or read. All data is stored in **Azure Cosmos DB**, which has no public network access — it is reachable only through a private endpoint inside the VNet.

## 2. Architecture

See `docs/architecture-diagram.png` for the full diagram. Summary of the request flow:

### Key security properties
- **Cosmos DB public network access is Disabled.** It is reachable only via a Private Endpoint in the `DataSubnet`, resolved through a Private DNS Zone (`privatelink.documents.azure.com`).
- **No connection strings or keys are stored in the backend.** The App Service uses a **System-Assigned Managed Identity**, granted the Cosmos DB *Built-in Data Contributor* role (data-plane RBAC).
- **App Service is not directly exposed.** It sits inside `AppSubnet` with VNet Integration; the only public entry point is the Application Gateway.
- **All API requests require a valid Microsoft Entra ID token.** Requests without a token (or with an invalid one) receive `401 Unauthorized`.

## 3. Components

| Component | Azure Service | Notes |
|---|---|---|
| Frontend | Azure Storage – Static Website | Served through the Application Gateway |
| Identity | Microsoft Entra ID | Two App Registrations: `capstone-frontend` (SPA) and `capstone-api` (exposes the `access` scope) |
| Entry point | Application Gateway (WAF_v2) | HTTPS listener, path-based routing (`/` → Storage, `/api/*` → App Service) |
| Backend | Azure App Service (Node.js / Express) | VNet-integrated, System-Assigned Managed Identity |
| Database | Azure Cosmos DB (NoSQL API) | Public access disabled, Private Endpoint, RBAC via Managed Identity |
| Network | Azure VNet (`10.0.0.0/16`) | `AppSubnet`, `DataSubnet`, `AppGwSubnet` |
| Monitoring | Application Insights + Azure Monitor | 2 metric alerts: backend HTTP 5xx, Cosmos DB RU consumption |
| IaC | Bicep (`infra/main.bicep`) | Covers VNet, Cosmos DB, App Service, Storage |
| CI/CD | GitHub Actions (`.github/workflows/`) | `build.yml` (CI) validates backend/frontend/infra on every push; `deploy.yml` (CD) deploys backend to App Service and frontend to Storage |

## 4. Data Model (Cosmos DB)

Database: `taskdb`

| Container | Partition Key | Purpose |
|---|---|---|
| `boards` | `/ownerId` | Projects |
| `tasks` | `/boardId` | Tasks under a project |
| `comments` | `/taskId` | Comments on a task |

## 5. Repository Structure

## 6. Why These Decisions (for viva)

| Decision | Reason |
|---|---|
| Managed Identity instead of connection strings | No secrets in code or app settings; identity is rotated automatically by Azure |
| Cosmos DB public access Disabled | Database must never be reachable from the public internet |
| Application Gateway with WAF | Single controlled public entry point; blocks common web attacks (SQLi, XSS); TLS termination |
| Path-based routing | Frontend (Storage) and backend (App Service) share one public URL, backend never exposed directly |
| Backend validates JWT itself | Frontend login alone is not enough — the API must also reject unauthenticated calls |
| Bicep for IaC | Infrastructure is repeatable and version-controlled; environments can be redeployed identically |
| GitHub Actions CI/CD | Every push is validated (CI) and automatically deployed (CD) — no manual deployment steps |

## 7. How to Deploy (from scratch)

1. Create a Resource Group, VNet with `AppSubnet`, `DataSubnet`, `AppGwSubnet` (or run `az deployment group create -f infra/main.bicep`)
2. Create Cosmos DB, database `taskdb`, containers `boards`/`tasks`/`comments`; disable public network access after testing
3. Create Private Endpoint + Private DNS Zone for Cosmos DB
4. Create App Service with System-Assigned Managed Identity and VNet Integration; assign it the Cosmos DB Data Contributor role
5. Register `capstone-api` and `capstone-frontend` in Microsoft Entra ID; expose the `access` scope
6. Create Storage Account, enable static website hosting, upload `frontend/`
7. Create Application Gateway (WAF_v2) with path-based routing to Storage and App Service
8. Push to `main` — GitHub Actions builds and deploys automatically

## 8. Security Checklist

- [x] Cosmos DB public network access: Disabled
- [x] Cosmos DB reachable only via Private Endpoint
- [x] Private DNS Zone linked to VNet
- [x] Managed Identity assigned Cosmos DB Data Contributor (no keys/connection strings)
- [x] App Service is VNet-integrated
- [x] Application Gateway sits in front of both frontend and backend (WAF enabled)
- [x] All API endpoints require a valid Entra ID token (verified: `401` without token)

## 9. Monitoring

- Application Insights connected to the backend (live request telemetry)
- Metric alert: backend HTTP 5xx error count
- Metric alert: Cosmos DB Normalized RU Consumption > 80%

## 10. Known Limitations / Notes

- TLS certificate on the Application Gateway is self-signed (acceptable for a demo/capstone environment); a production deployment would use a CA-issued certificate.
- The demo uses a single Dev environment; a Prod stage with manual approval would be the next step for a production-grade pipeline.
