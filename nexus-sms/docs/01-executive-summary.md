# Nexus SMS — Executive Summary

> **Version:** 1.0.0
> **Date:** 2025
> **Classification:** Internal — Product & Engineering

---

## 1. Platform Overview

**Nexus SMS** is a production-grade, multi-tenant Bulk SMS SaaS platform purpose-built for the East African and broader African market. It enables businesses, resellers, enterprises, and developers to send transactional and promotional SMS messages at scale through a unified, white-label-capable platform.

Nexus SMS abstracts the complexity of SMS gateway integrations, credit management, multi-tenancy, and compliance into a single, developer-friendly product. The platform is built on a modern serverless stack — **Next.js (App Router)**, **Supabase**, **PostgreSQL**, and **Vercel** — ensuring high availability, low operational overhead, and rapid iteration velocity.

---

## 2. Business Opportunity

### 2.1 Market Context

Africa's mobile penetration rate exceeds 80% in key markets, with SMS remaining the most reliable, universally accessible communication channel across all device types. Kenya alone processes hundreds of millions of SMS messages monthly across banking, retail, healthcare, logistics, and government sectors.

Key market drivers include:

| Driver | Detail |
|---|---|
| Mobile-first population | 95%+ of Kenyans access the internet via mobile |
| M-Pesa ecosystem | 30M+ active M-Pesa users requiring transactional SMS |
| Regulatory compliance | CBK, CA Kenya mandate SMS for OTPs and alerts |
| SME growth | 7.4M+ registered SMEs in Kenya needing affordable bulk SMS |
| Developer ecosystem | Growing demand for SMS APIs in fintech, healthtech, agritech |

### 2.2 SMS Gateway Partners

Nexus SMS integrates with two proven Kenyan/African SMS gateway providers:

#### TextSMS Kenya
- **Single SMS Endpoint:** `https://sms.textsms.co.ke/api/services/sendsms/`
- **Bulk SMS Endpoint:** `https://sms.textsms.co.ke/api/services/sendbulk/`
- Competitive per-SMS pricing for Kenyan networks (Safaricom, Airtel, Telkom)
- Supports custom Sender IDs and delivery reports

#### Advanta Africa
- **Endpoint:** `https://quicksms.advantasms.com/api/services/sendsms/`
- Pan-African coverage across 20+ countries
- Enterprise-grade SLAs and dedicated support
- Ideal for cross-border campaigns

The platform implements a **gateway abstraction layer** that allows seamless failover, load balancing, and per-organization gateway routing between providers.

### 2.3 Competitive Landscape

| Competitor | Weakness | Nexus SMS Advantage |
|---|---|---|
| Africa's Talking | Complex pricing, no white-label | White-label, simpler UX |
| Bulk SMS Kenya | No multi-tenancy, basic UI | Full multi-tenant, reseller model |
| Twilio | USD pricing, no M-Pesa | KES pricing, Daraja integration |
| Vonage | No local gateway, expensive | Local gateways, competitive rates |

---

## 3. Target Customers

### 3.1 Customer Segments

```
┌─────────────────────────────────────────────────────────────┐
│                    NEXUS SMS CUSTOMER PYRAMID                │
│                                                             │
│                    ┌─────────────┐                          │
│                    │ ENTERPRISES │  (Banks, Telcos, Gov)    │
│                   ┌┴─────────────┴┐                         │
│                   │   RESELLERS   │  (IT firms, agencies)   │
│                  ┌┴───────────────┴┐                        │
│                  │    BUSINESSES   │  (SMEs, startups)      │
│                 ┌┴─────────────────┴┐                       │
│                 │    DEVELOPERS     │  (API integrators)    │
│                 └───────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

| Segment | Description | Primary Need |
|---|---|---|
| **Enterprises** | Banks, insurance, government, large retail | High volume, compliance, SLAs |
| **Resellers** | IT companies, digital agencies, telecom resellers | White-label, margin management |
| **SMEs & Businesses** | Shops, schools, clinics, logistics | Affordable bulk SMS, easy UI |
| **Developers** | Fintech, healthtech, agritech builders | REST API, webhooks, SDKs |
| **NGOs & Government** | Public health, civic engagement | Large-scale campaigns, reporting |

---

## 4. Revenue Model

### 4.1 Credit-Based Prepaid System

Nexus SMS operates on a **prepaid credit model** where 1 credit = 1 SMS (160 characters). Credits are purchased in advance and consumed per message sent.

```
Credit Purchase Flow:
User → M-Pesa STK Push → Daraja 3.0 → Webhook → Credit Wallet Top-up
```

### 4.2 Subscription Plans

| Plan | Monthly Fee | Credits Included | Per Extra Credit | Features |
|---|---|---|---|---|
| **Free** | KES 0 | 50 | KES 1.20 | Basic SMS, 1 Sender ID |
| **Starter** | KES 999 | 1,000 | KES 1.00 | Scheduling, Groups, Reports |
| **Business** | KES 4,999 | 10,000 | KES 0.85 | API Access, Webhooks, Analytics |
| **Enterprise** | Custom | Custom | KES 0.60 | White-label, SLA, Dedicated support |

### 4.3 Reseller Revenue Model

Resellers purchase credits at **wholesale rates** and resell to their sub-organizations at a **markup they control**:

```
Platform Cost:    KES 0.60/SMS
Reseller Price:   KES 0.80/SMS  (Reseller margin: KES 0.20/SMS)
End Customer:     KES 1.00/SMS  (Customer pays market rate)
```

Resellers manage their own branded portal, set their own pricing, and receive consolidated billing from Nexus SMS.

### 4.4 Revenue Streams Summary

| Stream | Description | Estimated Contribution |
|---|---|---|
| Credit Sales | Per-SMS credit purchases | 65% |
| Subscription Fees | Monthly plan fees | 20% |
| Reseller Wholesale | Bulk credit sales to resellers | 12% |
| API Subscriptions | Developer API access tiers | 3% |

### 4.5 Financial Projections (Year 1)

| Metric | Target |
|---|---|
| Active Organizations | 500 |
| Active Resellers | 50 |
| Monthly SMS Volume | 5,000,000 |
| Monthly Recurring Revenue | KES 2,500,000 |
| Annual Revenue Run Rate | KES 30,000,000 |

---

## 5. Technology Stack

### 5.1 Stack Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     NEXUS SMS TECH STACK                     │
├──────────────────┬───────────────────────────────────────────┤
│ Layer            │ Technology                                │
├──────────────────┼───────────────────────────────────────────┤
│ Frontend         │ Next.js 14 (App Router), TailwindCSS      │
│ Backend          │ Node.js TypeScript, Vercel API Routes     │
│ Database         │ PostgreSQL via Supabase                   │
│ Authentication   │ Supabase Auth + JWT                       │
│ Realtime         │ Supabase Realtime (WebSockets)            │
│ Background Jobs  │ Supabase Queues + Edge Functions          │
│ File Storage     │ Supabase Storage (CSV imports)            │
│ Payments         │ Safaricom Daraja 3.0 (M-Pesa STK Push)   │
│ SMS Gateways     │ TextSMS Kenya + Advanta Africa            │
│ Hosting          │ Vercel (Frontend + API Routes)            │
│ CDN              │ Vercel Edge Network                       │
│ Monitoring       │ Vercel Analytics + Supabase Logs          │
└──────────────────┴───────────────────────────────────────────┘
```

### 5.2 Why This Stack

| Decision | Rationale |
|---|---|
| **Next.js App Router** | Unified frontend + API, SSR for SEO, file-based routing |
| **Supabase** | Managed Postgres, built-in Auth, Realtime, Queues — reduces infra ops |
| **Vercel** | Zero-config deployment, edge functions, automatic scaling |
| **TailwindCSS** | Rapid UI development, consistent design system |
| **TypeScript** | Type safety across full stack, reduces runtime errors |
| **Daraja 3.0** | Official Safaricom API, STK Push for seamless M-Pesa payments |

---

## 6. Key Differentiators

### 6.1 Multi-Tenancy with Isolation

Every organization operates in a fully isolated tenant environment. Data isolation is enforced at the database level using **Supabase Row Level Security (RLS)** policies, ensuring zero data leakage between tenants.

### 6.2 White-Label Capability

Resellers can deploy Nexus SMS under their own brand:
- Custom domain support (`sms.yourcompany.co.ke`)
- Custom logo, colors, and branding
- Branded email notifications
- Reseller-controlled pricing and credit packages

### 6.3 Daraja M-Pesa Integration

Native integration with **Safaricom Daraja 3.0** enables:
- STK Push payments (no manual bank transfers)
- Instant credit wallet top-up upon payment confirmation
- Payment history and M-Pesa transaction reference tracking
- Supports both consumer and business M-Pesa numbers

### 6.4 Real-Time Delivery Reports (DLR)

- Webhook-based DLR from SMS gateways
- Real-time status updates via Supabase Realtime
- Per-message status: `queued → sent → delivered / failed`
- Dashboard live counters without page refresh

### 6.5 Gateway Abstraction & Failover

```
SMS Request → Gateway Router → [TextSMS | Advanta Africa]
                                    ↓ (on failure)
                              Automatic Failover
```

### 6.6 Developer-First API

- RESTful API with OpenAPI 3.0 documentation
- API key management with scoped permissions
- Webhook support for delivery reports and events
- Rate limiting with configurable thresholds per plan

---

## 7. User Types & Roles

### 7.1 Role Hierarchy

```
Platform Super Admin
    └── Reseller
            └── Organization Admin
                    ├── Business User
                    └── API User
```

### 7.2 Role Descriptions

| Role | Description | Key Capabilities |
|---|---|---|
| **Platform Super Admin** | Nexus SMS platform operator | Full system access, manage resellers, view all orgs, configure gateways, set global pricing |
| **Reseller** | White-label partner managing sub-organizations | Create/manage orgs, set pricing, purchase wholesale credits, view reseller analytics |
| **Organization Admin** | Admin of a business account | Manage users, sender IDs, billing, campaigns, view org analytics |
| **Business User** | Operational staff within an org | Send SMS, manage contacts, view own campaign reports |
| **API User** | Developer/system integration account | API key access, programmatic SMS sending, webhook configuration |

---

## 8. Core Modules

### 8.1 Module Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   NEXUS SMS CORE MODULES                    │
├─────────────────┬───────────────────────────────────────────┤
│ Module          │ Description                               │
├─────────────────┼───────────────────────────────────────────┤
│ 1. Auth         │ Registration, login, MFA, RBAC, JWT       │
│ 2. Contacts     │ CRUD, CSV import, deduplication, groups   │
│ 3. Campaigns    │ Single SMS, bulk, scheduled, templates    │
│ 4. Billing      │ Wallet, credits, M-Pesa payments, invoices│
│ 5. Analytics    │ Delivery stats, campaign reports, exports │
└─────────────────┴───────────────────────────────────────────┘
```

### 8.2 Supporting Modules

| Module | Description |
|---|---|
| **Sender ID Management** | Request, approve, and manage alphanumeric sender IDs |
| **API Access** | API key generation, scoping, rate limiting |
| **Audit Logs** | Immutable activity logs for compliance |
| **Webhooks** | Outbound event notifications to customer endpoints |
| **Reseller Portal** | White-label management, sub-org billing, margin control |

---

## 9. Go-To-Market Strategy

### 9.1 Phase 1 — Foundation (Months 1–3)

- Launch MVP with core modules (Auth, SMS, Billing, Basic Analytics)
- Onboard 10 pilot businesses in Nairobi
- Integrate TextSMS Kenya as primary gateway
- Enable M-Pesa STK Push payments
- Establish pricing and credit packages

### 9.2 Phase 2 — Growth (Months 4–6)

- Launch reseller program with 5 initial reseller partners
- Add Advanta Africa as secondary gateway
- Release public REST API with documentation
- Implement white-label capabilities
- Target: 100 active organizations

### 9.3 Phase 3 — Scale (Months 7–12)

- Expand to Uganda, Tanzania, Rwanda
- Enterprise sales motion (banks, insurance, government)
- SDK releases (JavaScript, Python, PHP)
- Advanced analytics and reporting
- Target: 500 active organizations, KES 2.5M MRR

### 9.4 Marketing Channels

| Channel | Strategy |
|---|---|
| **Developer Community** | API docs, GitHub, developer meetups |
| **Digital Marketing** | Google Ads targeting "bulk SMS Kenya" keywords |
| **Reseller Network** | Partner program with revenue sharing |
| **Direct Sales** | Enterprise outreach to banks, SACCOs, logistics |
| **Content Marketing** | Blog, case studies, SMS marketing guides |

---

## 10. Success Metrics

| KPI | Target (Year 1) |
|---|---|
| Monthly Active Organizations | 500 |
| Monthly SMS Volume | 5,000,000 |
| Platform Uptime | 99.9% |
| Average Delivery Rate | ≥ 95% |
| Customer Churn Rate | < 5% monthly |
| API Adoption | 30% of orgs using API |
| Reseller Partners | 50 |
| Net Promoter Score | ≥ 50 |

---

## 11. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SMS gateway downtime | Medium | High | Dual-gateway failover |
| M-Pesa API changes | Low | High | Daraja version pinning, monitoring |
| Regulatory changes (CA Kenya) | Low | Medium | Legal counsel, compliance module |
| Competitor price war | Medium | Medium | Value-add features, reseller lock-in |
| Data breach | Low | Critical | RLS, encryption, audit logs, pen testing |
| Supabase outage | Low | High | DB backups, read replicas |

---

## 12. Team Requirements

| Role | Responsibility |
|---|---|
| Full-Stack Engineer (2x) | Next.js frontend, API routes, Supabase integration |
| Backend Engineer (1x) | SMS engine, queue processing, gateway integration |
| DevOps Engineer (1x) | Vercel deployment, monitoring, CI/CD |
| Product Manager (1x) | Roadmap, customer feedback, prioritization |
| Sales & BD (1x) | Reseller partnerships, enterprise sales |

---

*This document is the authoritative executive overview of the Nexus SMS platform. For detailed technical specifications, refer to the PRD, FRS, and Architecture Blueprint documents.*
