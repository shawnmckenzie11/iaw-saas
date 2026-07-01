## Project
Mobile-first delivery capture system: pickup capture → e-signature →
invoice generation → QuickBooks Online journal entries.

## Stack
(fill in once decided — e.g. React Native / Node+Postgres / QuickBooks
Online API)

## Data Sensitivity
- Customer names, addresses, and signature data are PII.
- Delivery cost and invoice data is financial data.
- NEVER use real customer or financial records as test/seed data.
  Use synthetic fixtures only.
- Do not log PII or signature data to console, files, or error trackers.

## Schema Discipline
- The Delivery Record schema is the source of truth. Do not modify
  its shape without flagging the change explicitly and stopping for
  review — other components depend on it.

## QuickBooks Integration
- Assume QuickBooks Online (REST API + OAuth2) unless told otherwise.
- Never write directly to a production QuickBooks company file/sandbox
  without explicit approval on each write during development.