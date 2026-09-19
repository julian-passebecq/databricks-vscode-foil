import assert from "assert";

import {
    validateCampaignConfig,
    validateMachineConfig,
    validateProjectConfig,
} from "./foilLabValidation";

describe("FOIL Lab validation", () => {
    it("accepts the synthetic Eolien project contract", () => {
        const result = validateProjectConfig({
            version: "0.1",
            name: "Foil Virtual Lab",
            activeTechnology: "EOLIEN",
            defaultClassification: "SYNTHETIC",
            allowRealData: false,
            databricks: {
                target: "dev",
                goldSchema: "foil_gold",
                labJob: "synthetic_lab",
                appResource: "foil_virtual_lab",
            },
        });

        assert.strictEqual(result.issues.length, 0);
        assert.strictEqual(result.config?.activeTechnology, "EOLIEN");
    });

    it("blocks a Free/Demo project that enables real data", () => {
        const result = validateProjectConfig({
            version: "0.1",
            name: "Foil Virtual Lab",
            activeTechnology: "EOLIEN",
            defaultClassification: "SYNTHETIC",
            allowRealData: true,
            databricks: {
                target: "dev",
                goldSchema: "foil_gold",
                labJob: "synthetic_lab",
                appResource: "foil_virtual_lab",
            },
        });

        assert.ok(result.issues.some((issue) => issue.path === "allowRealData"));
        assert.strictEqual(result.config, undefined);
    });

    it("warns when Hydrolien is marked active", () => {
        const result = validateMachineConfig({
            machineId: "hydro_reference_v1",
            technology: "HYDROLIEN",
            status: "ACTIVE",
            classification: "SYNTHETIC",
            modelVersion: "hydro_reference_proxy_v1",
        });

        assert.ok(result.issues.some((issue) => issue.severity === "warning"));
        assert.strictEqual(result.config?.technology, "HYDROLIEN");
    });

    it("requires at least one analysis module per campaign", () => {
        const result = validateCampaignConfig({
            campaignId: "empty_campaign",
            technology: "EOLIEN",
            machineId: "eolien_lab_v1",
            classification: "SYNTHETIC",
            objective: "Test",
            analyses: [],
        });

        assert.ok(result.issues.some((issue) => issue.path === "analyses"));
        assert.strictEqual(result.config, undefined);
    });
});
