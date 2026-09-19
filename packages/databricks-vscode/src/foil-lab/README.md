# FOIL Virtual Lab

This module adds an opinionated R&D control plane on top of the existing Databricks VS Code extension. It does not replace authentication, Unity Catalog, or Declarative Automation Bundle execution; it composes those primitives into a repeatable Foil experiment workflow.

## Contract

The `.foil-lab/` directory is the human- and AI-editable control surface. Machine, campaign, analysis-registry, and app specifications are JSON so an AI can propose changes without directly mutating Databricks resources. JSON Schema validation and FOIL-specific validation run before the existing bundle deployment commands are used.

The initial scaffold is deliberately Eolien-first. Hydrolien is retained as `REFERENCE_ONLY`, so historical models stay available without silently becoming the active machine.

Gold is the intended stable result contract for downstream consumers. AI/BI dashboards, the Streamlit Databricks App, VS Code result views, and future external presentation apps should query Gold rather than re-implement engineering logic in their UI layer.

## Safety boundary

The Free/Demo scaffold defaults to `SYNTHETIC` and keeps arbitrary real-data ingestion disabled. The extension never executes scripts from an imported AI package merely because files appeared in the repository. Future AI campaign import must validate manifests, schemas, dependencies, Free Edition compatibility, and tests before deployment.

## Next implementation layers

The current MVP establishes the editor contract, navigation, validation, and deployment wrappers. The next layers are the lab compiler, live Free Edition capability probes, Gold query/result panels, AI/BI dashboard generation, and a bundle-managed Streamlit Databricks App.
