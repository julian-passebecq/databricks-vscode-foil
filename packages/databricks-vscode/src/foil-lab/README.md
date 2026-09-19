# FOIL Virtual Lab

This module adds an opinionated R&D control plane on top of the existing Databricks VS Code extension. It does not replace authentication, Unity Catalog, or Declarative Automation Bundle execution; it composes those primitives into a repeatable Foil experiment workflow.

## Contract

The `.foil-lab/` directory is the human- and AI-editable control surface. Machine, campaign, analysis-registry, and app specifications are JSON so an AI can propose changes without directly mutating Databricks resources. JSON Schema validation and FOIL-specific validation run before the existing bundle deployment commands are used.

The initial scaffold is deliberately Eolien-first. Hydrolien is retained as `REFERENCE_ONLY`, so historical models stay available without silently becoming the active machine.

Gold is the intended stable result contract for downstream consumers. AI/BI dashboards, the Streamlit Databricks App, VS Code result views, and future external presentation apps should query Gold rather than re-implement engineering logic in their UI layer.

## Safety boundary

The Free/Demo scaffold defaults to `SYNTHETIC` and keeps arbitrary real-data ingestion disabled. The extension never executes scripts from an imported AI package merely because files appeared in the repository. Future AI campaign import must validate manifests, schemas, dependencies, Free Edition compatibility, and tests before deployment.

## Next implementation layers

The current MVP establishes the editor contract, navigation, validation, deployment wrappers, deterministic campaign compilation, a reproducible Gold scenario matrix, and a bundle-managed read-only Streamlit App. Every campaign expands its test configuration into stable scenario IDs in `campaign_scenarios` plus long-form `scenario_parameters`; future physics, statistics, optimization, and ML modules should consume those scenario IDs instead of generating their own incompatible grids.

The next layers are live Free Edition capability probes, richer Gold query/result panels, AI/BI dashboard compilation, and validated model/analysis modules that attach results back to the scenario contract.

## Gold query contract

Compiled campaigns also emit a read-only query pack under `.foil-lab/build/<campaign>/queries/`. The catalog records dataset grain and relationships while the SQL files provide standard campaign, scenario, parameter, and design-statistics queries. Streamlit, AI/BI generation, VS Code result panels, and external AI handoffs should reuse this contract instead of inventing independent joins.

## Company control repository bridge

The company/project source of truth lives outside Databricks in `julian-passebecq/foil-control-v1`.

The bridge is intentionally file-based:

`foil-control-v1/interfaces/databricks/active_machine.json` → **FOIL Lab: Import FOIL company machine snapshot** → `.foil-lab/machines/eolien_lab_v1.json`.

The imported profile records the control-machine ID and revision inside the Databricks project. Databricks campaigns may vary synthetic scenario parameters, but they do not write engineering facts back into the company control repository.


## AI/BI dashboard compiler

The lab can now generate a native Databricks AI/BI dashboard asset plus its Declarative Automation Bundle resource. The first dashboard compiler binds governed Gold datasets for campaign registry, scenario matrix, and design statistics. It deliberately leaves the canvas layout empty until widget serialization is validated against a live workspace; this avoids treating an unstable presentation detail as a scientific contract.

Campaign manifests persist the imported control-machine provenance (`sourceRepo`, `controlMachineId`, `revision`, `controlDigest`) when a machine was synchronized from `foil-control-v1`. That provenance is part of the deterministic campaign source hash and can be recovered from the Gold `machine_json` field without introducing a second company truth.
