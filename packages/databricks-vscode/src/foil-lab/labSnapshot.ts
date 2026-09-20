import {createHash} from "node:crypto";

import type {
    FoilCampaignConfig,
    FoilMachineConfig,
    FoilTechnology,
} from "./FoilLabTypes";

export interface FoilLabCampaignSnapshot {
    schema: "foil-lab/campaign-snapshot-v1";
    schemaVersion: 1;
    snapshotId: string;
    generatedAt: string;
    source: {
        database: "foil_lab";
        studyId: string;
        campaignId: string;
    };
    machine: {
        machineId: string;
        revision: string;
        technology: FoilTechnology;
        status: "ACTIVE" | "REFERENCE_ONLY" | "EXPERIMENTAL";
        facts?: unknown[];
        parameters?: unknown[];
        unknowns?: unknown[];
        controlContract?: Record<string, unknown>;
    };
    model: {
        modelId: string;
        version: string;
        status: string;
        classification: "SYNTHETIC" | "SANITIZED_APPROVED";
        maturityLevel: number;
        [key: string]: unknown;
    };
    study: {
        studyId: string;
        title: string;
        objective: string;
    };
    campaign: {
        campaignId: string;
        objective: string;
        classification: "SYNTHETIC" | "SANITIZED_APPROVED";
        inputs: Record<string, unknown>;
        analyses: Array<{
            module: string;
            enabled?: boolean;
            config?: Record<string, unknown>;
        }>;
        outputs?: {
            gold?: boolean;
            aiBiDashboard?: boolean;
            streamlitApp?: boolean;
            mlflow?: boolean;
        };
        inputProvenance?: Record<string, unknown>;
        safety?: Record<string, unknown>;
        [key: string]: unknown;
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
    record: Record<string, unknown>,
    key: string,
    path: string
): string {
    const value = record[key];
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`${path}.${key} must be a non-empty string.`);
    }
    return value;
}

export function parseLabSnapshot(value: unknown): FoilLabCampaignSnapshot {
    if (!isRecord(value)) {
        throw new Error("FOIL Lab snapshot must be a JSON object.");
    }
    if (
        value.schema !== "foil-lab/campaign-snapshot-v1" ||
        value.schemaVersion !== 1
    ) {
        throw new Error("Unsupported FOIL Lab snapshot schema.");
    }

    const source = value.source;
    const machine = value.machine;
    const model = value.model;
    const study = value.study;
    const campaign = value.campaign;
    if (
        !isRecord(source) ||
        !isRecord(machine) ||
        !isRecord(model) ||
        !isRecord(study) ||
        !isRecord(campaign)
    ) {
        throw new Error(
            "FOIL Lab snapshot requires source, machine, model, study and campaign objects."
        );
    }

    requiredString(value, "snapshotId", "snapshot");
    requiredString(value, "generatedAt", "snapshot");
    requiredString(source, "studyId", "source");
    requiredString(source, "campaignId", "source");
    requiredString(machine, "machineId", "machine");
    requiredString(machine, "revision", "machine");
    requiredString(machine, "technology", "machine");
    requiredString(model, "modelId", "model");
    requiredString(model, "version", "model");
    requiredString(study, "studyId", "study");
    requiredString(study, "objective", "study");
    requiredString(campaign, "campaignId", "campaign");
    requiredString(campaign, "objective", "campaign");

    if (source.database !== "foil_lab") {
        throw new Error("FOIL Lab snapshot source.database must be foil_lab.");
    }
    if (!isRecord(campaign.inputs)) {
        throw new Error("campaign.inputs must be a JSON object.");
    }
    if (!Array.isArray(campaign.analyses) || campaign.analyses.length === 0) {
        throw new Error("campaign.analyses must contain at least one module.");
    }

    return value as unknown as FoilLabCampaignSnapshot;
}

export function materializeLabSnapshot(
    snapshot: FoilLabCampaignSnapshot,
    rawJson: string,
    snapshotPath: string
): {machine: FoilMachineConfig; campaign: FoilCampaignConfig} {
    const snapshotHash = createHash("sha256")
        .update(rawJson, "utf8")
        .digest("hex");

    const machine: FoilMachineConfig = {
        machineId: snapshot.machine.machineId,
        technology: snapshot.machine.technology,
        status: snapshot.machine.status,
        classification: snapshot.model.classification,
        modelVersion: `${snapshot.model.modelId}@${snapshot.model.version}`,
        description:
            "Frozen FOIL Lab machine/model context imported from a versioned campaign snapshot.",
        control: {
            sourceRepo: "mongodb:foil_control+foil_lab",
            controlMachineId: snapshot.machine.machineId,
            revision: snapshot.machine.revision,
            importedAt: new Date().toISOString(),
            snapshotPath,
            controlDigest: snapshotHash,
        },
        parameters: {
            modelId: snapshot.model.modelId,
            modelVersion: snapshot.model.version,
            modelMaturityLevel: snapshot.model.maturityLevel,
            modelDefinition: snapshot.model,
            studyDefinition: snapshot.study,
            referenceFacts: snapshot.machine.facts ?? [],
            parameterDefinitions: snapshot.machine.parameters ?? [],
            unresolvedEngineering: snapshot.machine.unknowns ?? [],
            controlContract: snapshot.machine.controlContract,
            studyId: snapshot.study.studyId,
            snapshotId: snapshot.snapshotId,
        },
    };

    const campaign = {
        campaignId: snapshot.campaign.campaignId,
        technology: snapshot.machine.technology,
        machineId: snapshot.machine.machineId,
        classification: snapshot.campaign.classification,
        objective: snapshot.campaign.objective,
        test: snapshot.campaign.inputs,
        analyses: snapshot.campaign.analyses,
        outputs: snapshot.campaign.outputs ?? {
            gold: true,
            aiBiDashboard: true,
            streamlitApp: true,
            mlflow: false,
        },
        inputProvenance: snapshot.campaign.inputProvenance,
        safety: snapshot.campaign.safety,
        provenance: {
            snapshotId: snapshot.snapshotId,
            snapshotHash,
            generatedAt: snapshot.generatedAt,
            sourceDatabase: snapshot.source.database,
            studyId: snapshot.study.studyId,
            modelId: snapshot.model.modelId,
            modelVersion: snapshot.model.version,
            machineRevision: snapshot.machine.revision,
        },
    } as FoilCampaignConfig;

    return {machine, campaign};
}
