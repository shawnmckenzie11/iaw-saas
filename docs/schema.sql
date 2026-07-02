-- PostgreSQL DDL for IAW Courier SaaS Delivery Records

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums for Lifecycle status, Vehicle types, Sync status, and priority
CREATE TYPE delivery_status AS ENUM (
    'DRAFT',
    'PICKED_UP',
    'DELIVERED',
    'INVOICED',
    'VOIDED'
);

CREATE TYPE vehicle_type AS ENUM (
    'CAR',
    'MINIVAN',
    'TRUCK',
    'CARGO_VAN',
    'OTHER'
);

CREATE TYPE priority_level AS ENUM (
    'REGULAR',
    'RUSH'
);

CREATE TYPE sync_status AS ENUM (
    'PENDING',
    'SYNCED',
    'CONFLICT'
);

CREATE TYPE qbo_sync_status AS ENUM (
    'NOT_SYNCED',
    'SYNCED',
    'FAILED'
);

CREATE TYPE pricing_tier AS ENUM (
    'TIER_1', -- Common routes lookup (route_rates table)
    'TIER_2', -- In-town standard ($60 flat, dispatcher adjustable)
    'TIER_3'  -- Out of town (manual dispatcher entry)
);

-- Customers table (caches QuickBooks Online customer records)
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qbo_customer_id VARCHAR(100) UNIQUE, -- QuickBooks Online Customer ID
    name VARCHAR(255) NOT NULL, -- PII
    email VARCHAR(255), -- PII
    phone VARCHAR(50), -- PII
    billing_address TEXT, -- PII
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Drivers table
CREATE TABLE drivers (
    id VARCHAR(100) PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL, -- PII
    last_name VARCHAR(100) NOT NULL, -- PII
    phone VARCHAR(50), -- PII
    pin_hash VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Dispatchers table
CREATE TABLE dispatchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Route Rates table (Tier 1 flat rates for specific routes)
CREATE TABLE route_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    origin VARCHAR(255) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    flat_rate NUMERIC(10, 2) NOT NULL,
    effective_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Delivery Records table
CREATE TABLE delivery_records (
    -- Identifiers
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_side_uuid UUID UNIQUE NOT NULL, -- Generated on mobile device for offline conflict resolution
    waybill_number VARCHAR(50) UNIQUE NOT NULL, -- Format: IAW-YYYYMMDD-XXXX (unique, human-readable)

    -- Status & Sync
    status delivery_status NOT NULL DEFAULT 'DRAFT',
    sync_status sync_status NOT NULL DEFAULT 'PENDING',
    sync_error TEXT,

    -- Customer Relationship
    customer_id UUID REFERENCES customers(id),
    qbo_customer_id VARCHAR(100), -- Denormalized for direct QBO mapping validation

    -- Driver/Vehicle Details
    driver_id VARCHAR(100) REFERENCES drivers(id),
    vehicle_type vehicle_type NOT NULL DEFAULT 'CAR',

    -- Parcel / Cargo Details
    parcel_description TEXT NOT NULL,
    parcel_quantity INTEGER NOT NULL DEFAULT 1,
    parcel_weight_lbs NUMERIC(6, 2),
    parcel_weight_class VARCHAR(50), -- Match archive.csv weight classes e.g. "Less than 10 lbs", "11-50 lbs", "51-100 lbs", "Over 100 lbs"
    parcel_dimensions_inch VARCHAR(50), -- e.g. "12x12x12"

    -- Pickup Details (Captured at pickup)
    pickup_location_name VARCHAR(255) NOT NULL, -- Name of location/business
    pickup_address TEXT NOT NULL, -- PII
    pickup_contact_name VARCHAR(255), -- PII
    pickup_contact_phone VARCHAR(50), -- PII
    pickup_latitude NUMERIC(9, 6), -- GPS coordinates
    pickup_longitude NUMERIC(9, 6),

    -- Dropoff Details
    dropoff_destination_name VARCHAR(255) NOT NULL, -- Name of destination/business
    dropoff_address TEXT NOT NULL, -- PII
    dropoff_contact_name VARCHAR(255), -- PII
    dropoff_contact_phone VARCHAR(50), -- PII
    dropoff_latitude NUMERIC(9, 6), -- GPS coordinates
    dropoff_longitude NUMERIC(9, 6),

    -- Delivery Logistics & Comments
    priority priority_level NOT NULL DEFAULT 'REGULAR',
    business_or_residential VARCHAR(50) DEFAULT 'Business',
    additional_comments TEXT,
    requested_pickup_time TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- DB record creation
    captured_at TIMESTAMP WITH TIME ZONE NOT NULL, -- Client-side timestamp when driver initialized pickup
    signed_at TIMESTAMP WITH TIME ZONE, -- When signature was captured
    delivered_at TIMESTAMP WITH TIME ZONE, -- When marked delivered
    synced_at TIMESTAMP WITH TIME ZONE, -- When local data successfully reached server
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Electronic Signature Blob & Auditing
    signature_name VARCHAR(255), -- PII: Printed name of the person signing
    signature_image_url TEXT, -- Path to signed signature image (hosted on S3/R2 securely)
    signature_hash VARCHAR(64), -- SHA-256 cryptographic hash of: signature image bytes/file content + client_side_uuid + delivered_at + signature_name + driver_id
    signature_consent_text TEXT, -- Legal consent statement accepted by signer
    signature_ip_address VARCHAR(45), -- IP address of signing device (IPv4/IPv6)
    signature_gps_latitude NUMERIC(9, 6), -- Verification GPS coordinates of signing event
    signature_gps_longitude NUMERIC(9, 6),

    -- Photos / Attachments
    proof_photo_url TEXT, -- Optional delivery verification photo path

    -- Cost Inputs & Financials
    pricing_tier pricing_tier NOT NULL DEFAULT 'TIER_2',
    applied_route_rate_id UUID REFERENCES route_rates(id), -- Tracks exact Tier 1 rate record applied
    pricing_is_manually_adjusted BOOLEAN NOT NULL DEFAULT FALSE,
    pricing_override_reason TEXT,
    pricing_base_rate NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    pricing_distance_miles NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    pricing_distance_rate NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    pricing_fuel_surcharge NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    pricing_priority_surcharge NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    pricing_after_hours_surcharge NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    pricing_extra_weight_surcharge NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    pricing_total_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00, -- Mutable to support manual adjustments/tiers

    -- QuickBooks Online Integration Meta
    qbo_sync_status qbo_sync_status NOT NULL DEFAULT 'NOT_SYNCED',
    qbo_invoice_id VARCHAR(100) UNIQUE, -- QBO Invoice ID mapping
    qbo_journal_entry_id VARCHAR(100) UNIQUE, -- QBO Journal Entry ID mapping
    qbo_sync_error TEXT,
    qbo_posted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance & integrity lookup
CREATE INDEX idx_delivery_records_client_uuid ON delivery_records(client_side_uuid);
CREATE INDEX idx_delivery_records_waybill ON delivery_records(waybill_number);
CREATE INDEX idx_delivery_records_status ON delivery_records(status);
CREATE INDEX idx_delivery_records_customer ON delivery_records(customer_id);
CREATE INDEX idx_delivery_records_driver ON delivery_records(driver_id);
CREATE INDEX idx_route_rates_lookup ON route_rates(origin, destination, effective_date DESC);

-- Waybill Events table for Event Sourcing
CREATE TABLE waybill_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_side_uuid UUID NOT NULL,
    waybill_number VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    data JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_waybill_events_waybill ON waybill_events(waybill_number);
CREATE INDEX idx_waybill_events_client_uuid ON waybill_events(client_side_uuid);

