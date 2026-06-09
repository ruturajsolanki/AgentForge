"""Seed 12 realistic past projects spanning TCS industry verticals.

Run: python -m app.scripts.seed_past_projects
Idempotent via ON CONFLICT (public_id) DO NOTHING.
"""

from __future__ import annotations

import asyncio
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal

TENANT_SLUG = "dev"

PROJECTS = [
    {
        "public_id": "PROJ-BNK-001",
        "description": "Core banking digital onboarding platform with KYC/AML integration, video verification, and real-time account provisioning for a top-5 Indian private bank.",
        "domain": "banking",
        "problem_type": "web_app",
        "complexity": "high",
        "reuse_components": ["auth_module", "kyc_ocr_pipeline", "notification_engine", "audit_trail"],
        "reuse_rationale": {
            "why_reusable": ["KYC/AML pipeline is regulation-standard and reusable across banks", "Notification engine supports SMS/email/push generically"],
            "why_not_reusable": ["Bank-specific regulatory APIs differ per institution", "UI theme and branding are bank-proprietary"],
            "components_kept": ["auth_module", "kyc_ocr_pipeline", "notification_engine", "audit_trail"],
            "components_replaced": ["bank_integration_layer", "branded_ui_theme"],
            "estimated_savings_days": 18,
        },
    },
    {
        "public_id": "PROJ-CM-002",
        "description": "Algorithmic trade reconciliation dashboard for a capital markets firm — real-time position monitoring, P&L attribution, and exception management.",
        "domain": "capital_markets",
        "problem_type": "dashboard",
        "complexity": "high",
        "reuse_components": ["data_pipeline", "chart_components", "alert_engine"],
        "reuse_rationale": {
            "why_reusable": ["Chart components (candlestick, heatmap, waterfall) are generic", "Alert engine with configurable thresholds is domain-agnostic"],
            "why_not_reusable": ["Trade reconciliation logic is proprietary to the client's OMS", "FIX protocol adapters are broker-specific"],
            "components_kept": ["chart_components", "alert_engine", "data_pipeline"],
            "components_replaced": ["fix_adapter", "oms_reconciler"],
            "estimated_savings_days": 14,
        },
    },
    {
        "public_id": "PROJ-CPG-003",
        "description": "Demand forecasting and shelf-space optimization tool for a global CPG brand using ML-driven sales prediction and planogram generation.",
        "domain": "cpg",
        "problem_type": "ml_pipeline",
        "complexity": "high",
        "reuse_components": ["forecast_model", "data_ingestion", "report_generator"],
        "reuse_rationale": {
            "why_reusable": ["Demand forecasting model architecture (Prophet + XGBoost ensemble) is transferable", "Data ingestion pipeline handles CSV/API/SFTP generically"],
            "why_not_reusable": ["Planogram generation is tied to client's retail partner APIs", "Brand-specific product hierarchy encoding"],
            "components_kept": ["forecast_model", "data_ingestion", "report_generator"],
            "components_replaced": ["planogram_engine", "product_taxonomy"],
            "estimated_savings_days": 12,
        },
    },
    {
        "public_id": "PROJ-HC-004",
        "description": "Patient engagement portal for a multi-specialty hospital chain — appointment scheduling, telemedicine, prescription management, and health records access.",
        "domain": "healthcare",
        "problem_type": "web_app",
        "complexity": "high",
        "reuse_components": ["appointment_scheduler", "video_call_module", "pdf_generator", "auth_module"],
        "reuse_rationale": {
            "why_reusable": ["Appointment scheduler with calendar slots is generic", "Video call module wraps WebRTC and works across domains"],
            "why_not_reusable": ["EHR integration varies per hospital's HIS vendor (Epic, Cerner, etc.)", "Prescription module needs country-specific drug database"],
            "components_kept": ["appointment_scheduler", "video_call_module", "auth_module", "pdf_generator"],
            "components_replaced": ["ehr_connector", "drug_database_adapter"],
            "estimated_savings_days": 15,
        },
    },
    {
        "public_id": "PROJ-INS-005",
        "description": "Motor insurance claims processing automation — FNOL intake, damage assessment via AI image analysis, fraud scoring, and adjuster workflow.",
        "domain": "insurance",
        "problem_type": "automation",
        "complexity": "high",
        "reuse_components": ["image_classifier", "fraud_scorer", "workflow_engine", "notification_engine"],
        "reuse_rationale": {
            "why_reusable": ["Image classifier for vehicle damage is retrained easily for new markets", "Workflow engine handles multi-step approval chains generically"],
            "why_not_reusable": ["Fraud scoring thresholds are calibrated per insurer's loss history", "Policy admin system integration differs per carrier"],
            "components_kept": ["image_classifier", "workflow_engine", "notification_engine"],
            "components_replaced": ["fraud_scorer_weights", "policy_admin_connector"],
            "estimated_savings_days": 11,
        },
    },
    {
        "public_id": "PROJ-MFG-006",
        "description": "IoT-based predictive maintenance platform for a manufacturing plant — sensor data ingestion, anomaly detection, maintenance scheduling, and spare parts inventory.",
        "domain": "manufacturing",
        "problem_type": "iot_platform",
        "complexity": "high",
        "reuse_components": ["time_series_store", "anomaly_detector", "scheduling_engine", "dashboard"],
        "reuse_rationale": {
            "why_reusable": ["Time-series ingestion and anomaly detection pipeline is sensor-agnostic", "Scheduling engine handles maintenance windows generically"],
            "why_not_reusable": ["Sensor protocols differ per machine vendor (OPC-UA, MQTT, Modbus)", "Spare parts inventory integration is ERP-specific"],
            "components_kept": ["time_series_store", "anomaly_detector", "scheduling_engine", "dashboard"],
            "components_replaced": ["sensor_protocol_adapters", "erp_inventory_bridge"],
            "estimated_savings_days": 13,
        },
    },
    {
        "public_id": "PROJ-RTL-007",
        "description": "Omni-channel e-commerce platform for a fashion retailer — product catalog, inventory sync, checkout, loyalty program, and personalized recommendations.",
        "domain": "retail",
        "problem_type": "web_app",
        "complexity": "high",
        "reuse_components": ["product_catalog", "checkout_flow", "recommendation_engine", "loyalty_module"],
        "reuse_rationale": {
            "why_reusable": ["Product catalog with faceted search is generic across retail", "Checkout flow with payment gateway abstraction works across merchants"],
            "why_not_reusable": ["Recommendation model needs retraining on client's purchase data", "Loyalty program rules are brand-specific"],
            "components_kept": ["product_catalog", "checkout_flow", "recommendation_engine"],
            "components_replaced": ["loyalty_rules_engine", "brand_specific_cms"],
            "estimated_savings_days": 16,
        },
    },
    {
        "public_id": "PROJ-TL-008",
        "description": "Fleet management and route optimization system for a logistics company — GPS tracking, dynamic routing, driver assignment, and delivery SLA monitoring.",
        "domain": "travel_logistics",
        "problem_type": "platform",
        "complexity": "high",
        "reuse_components": ["map_renderer", "route_optimizer", "gps_tracker", "sla_monitor"],
        "reuse_rationale": {
            "why_reusable": ["Map renderer and GPS tracking module are vendor-agnostic", "Route optimizer algorithm (OR-Tools) works across fleet sizes"],
            "why_not_reusable": ["Driver assignment rules depend on union agreements and local regulations", "SLA thresholds are contract-specific"],
            "components_kept": ["map_renderer", "route_optimizer", "gps_tracker"],
            "components_replaced": ["driver_assignment_rules", "sla_contract_config"],
            "estimated_savings_days": 10,
        },
    },
    {
        "public_id": "PROJ-BNK-009",
        "description": "Credit scoring microservice for an NBFC — bureau data integration, ML scoring model, decision engine, and regulatory reporting.",
        "domain": "banking",
        "problem_type": "ml_pipeline",
        "complexity": "medium",
        "reuse_components": ["scoring_model", "bureau_connector", "decision_engine"],
        "reuse_rationale": {
            "why_reusable": ["Scoring model architecture (GBM + logistic ensemble) is portable", "Decision engine with configurable rule tables is generic"],
            "why_not_reusable": ["Bureau data formats differ (CIBIL vs Experian vs CRIF)", "Regulatory reporting templates are RBI/SEBI specific"],
            "components_kept": ["scoring_model", "decision_engine"],
            "components_replaced": ["bureau_connector", "regulatory_report_templates"],
            "estimated_savings_days": 8,
        },
    },
    {
        "public_id": "PROJ-INS-010",
        "description": "Customer 360 portal for a life insurance company — policy overview, premium payment, claims status, nomination management, and document vault.",
        "domain": "insurance",
        "problem_type": "web_app",
        "complexity": "medium",
        "reuse_components": ["auth_module", "document_vault", "payment_gateway", "notification_engine"],
        "reuse_rationale": {
            "why_reusable": ["Document vault with upload/download/preview is generic", "Payment gateway integration (Razorpay/Stripe wrapper) is reusable"],
            "why_not_reusable": ["Policy data model varies per insurer", "Premium calculation engine is actuarially specific"],
            "components_kept": ["auth_module", "document_vault", "payment_gateway", "notification_engine"],
            "components_replaced": ["policy_model", "premium_calculator"],
            "estimated_savings_days": 9,
        },
    },
    {
        "public_id": "PROJ-HC-011",
        "description": "Clinical trial management system — site management, patient enrollment, adverse event tracking, data monitoring, and regulatory submission prep.",
        "domain": "healthcare",
        "problem_type": "platform",
        "complexity": "high",
        "reuse_components": ["enrollment_tracker", "adverse_event_form", "audit_trail", "report_generator"],
        "reuse_rationale": {
            "why_reusable": ["Audit trail is 21 CFR Part 11 compliant and reusable", "Report generator handles CSV/PDF/XML exports generically"],
            "why_not_reusable": ["Regulatory submission formats differ by country (FDA vs EMA vs CDSCO)", "Protocol-specific CRF designs are unique per trial"],
            "components_kept": ["enrollment_tracker", "audit_trail", "report_generator"],
            "components_replaced": ["crf_designer", "regulatory_submission_adapter"],
            "estimated_savings_days": 14,
        },
    },
    {
        "public_id": "PROJ-MFG-012",
        "description": "Quality inspection automation for an automotive parts manufacturer — computer vision defect detection, SPC charting, and CAPA workflow.",
        "domain": "manufacturing",
        "problem_type": "ml_pipeline",
        "complexity": "medium",
        "reuse_components": ["cv_defect_model", "spc_charts", "capa_workflow"],
        "reuse_rationale": {
            "why_reusable": ["SPC charts (X-bar, R-chart, Cp/Cpk) are industry-standard", "CAPA workflow engine handles multi-step corrective actions generically"],
            "why_not_reusable": ["CV defect model needs retraining per part geometry", "Tolerance specifications are client-specific"],
            "components_kept": ["spc_charts", "capa_workflow"],
            "components_replaced": ["cv_defect_model_weights", "tolerance_config"],
            "estimated_savings_days": 7,
        },
    },
]


async def seed(session: AsyncSession) -> int:
    from sqlalchemy import select
    from app.db.models import PastProject, Tenant

    tenant = (await session.execute(
        select(Tenant).where(Tenant.slug == TENANT_SLUG)
    )).scalar_one_or_none()
    if not tenant:
        tenant = Tenant(name="Development", slug=TENANT_SLUG)
        session.add(tenant)
        await session.flush()

    count = 0
    for proj in PROJECTS:
        existing = (await session.execute(
            select(PastProject).where(PastProject.public_id == proj["public_id"])
        )).scalar_one_or_none()
        if existing:
            continue
        pp = PastProject(
            tenant_id=tenant.id,
            public_id=proj["public_id"],
            description=proj["description"],
            domain=proj["domain"],
            problem_type=proj["problem_type"],
            complexity=proj["complexity"],
            reuse_components=proj["reuse_components"],
            reuse_rationale=proj["reuse_rationale"],
        )
        session.add(pp)
        count += 1
    await session.commit()
    return count


async def main():
    async with AsyncSessionLocal() as session:
        n = await seed(session)
        print(f"Seeded {n} past projects")


if __name__ == "__main__":
    asyncio.run(main())
