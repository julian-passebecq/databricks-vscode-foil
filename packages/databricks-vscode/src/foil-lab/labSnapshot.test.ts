import assert from "assert";

import {materializeLabSnapshot, parseLabSnapshot} from "./labSnapshot";

const SNAPSHOT = {
    schema: "foil-lab/campaign-snapshot-v1",
    schemaVersion: 1,
    snapshotId: "SNAP-001",
    generatedAt: "2026-09-20T00:00:00Z",
    source: {
        database: "foil_lab",
        studyId: "STUDY-WIND-001",
        campaignId: "CAMP-WIND-001",
    },
    machine: {
        machineId: "MACHINE-WIND-001",
        revision: "2026-09-19.1",
        technology: "EOLIEN",
        status: "ACTIVE",
        facts: [],
        parameters: [],
        unknowns: [],
    },
    model: {
        modelId: "wind_parametric_v1",
        version: "0.1",
        status: "DRAFT",
        classification: "SYNTHETIC",
        maturityLevel: 1,
        physics: {
            availablePowerRelation: "0.5 * rho * A_effective * |V|^3",
        },
    },
    study: {
        studyId: "STUDY-WIND-001",
        title: "Baseline",
        objective: "Build a synthetic baseline.",
    },
    campaign: {
        campaignId: "CAMP-WIND-001",
        objective: "Run a baseline parameter sweep.",
        classification: "SYNTHETIC",
        inputs: {windSpeed: [6, 8, 10]},
        analyses: [{module: "descriptive_statistics", enabled: true}],
        inputProvenance: {
            "environment.windSpeedMs": {
                evidenceClass: "SYNTHETIC",
            },
        },
        safety: {
            measuredClaimsAllowed: false,
        },
    },
};

describe("FOIL Lab campaign snapshot", () => {
    it("parses and materializes a frozen Mongo lab snapshot", () => {
        const raw = JSON.stringify(SNAPSHOT);
        const parsed = parseLabSnapshot(JSON.parse(raw));
        const materialized = materializeLabSnapshot(
            parsed,
            raw,
            "/tmp/snapshot.json"
        );

        assert.strictEqual(materialized.machine.machineId, "MACHINE-WIND-001");
        assert.strictEqual(
            materialized.machine.modelVersion,
            "wind_parametric_v1@0.1"
        );
        assert.strictEqual(materialized.campaign.campaignId, "CAMP-WIND-001");
        assert.deepStrictEqual(materialized.campaign.test, {
            windSpeed: [6, 8, 10],
        });
        assert.deepStrictEqual(materialized.campaign.inputProvenance, {
            "environment.windSpeedMs": {
                evidenceClass: "SYNTHETIC",
            },
        });
        assert.deepStrictEqual(materialized.campaign.safety, {
            measuredClaimsAllowed: false,
        });
        assert.deepStrictEqual(
            (
                materialized.machine.parameters?.modelDefinition as {
                    physics?: {availablePowerRelation?: string};
                }
            ).physics?.availablePowerRelation,
            "0.5 * rho * A_effective * |V|^3"
        );
    });

    it("rejects snapshots without executable analyses", () => {
        assert.throws(
            () =>
                parseLabSnapshot({
                    ...SNAPSHOT,
                    campaign: {...SNAPSHOT.campaign, analyses: []},
                }),
            /analyses/
        );
    });
});
