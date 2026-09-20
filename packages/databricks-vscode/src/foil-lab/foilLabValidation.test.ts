import assert from "assert";

import {
    validateAppConfig,
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
                catalog: "foil",
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

        assert.ok(
            result.issues.some((issue) => issue.path === "allowRealData")
        );
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
    it("keeps an unconfigured App as warnings, not project-blocking errors", () => {
        const result = validateAppConfig({
            version: "0.2",
            appId: "foil_virtual_lab",
            appName: "foil-virtual-lab",
            framework: "STREAMLIT",
            deployment: "DATABRICKS_APP",
            catalog: "",
            goldSchema: "foil_gold",
            sqlWarehouseId: "",
            readOnly: true,
            canLaunchCampaigns: false,
            pages: ["overview", "campaigns"],
        });

        assert.ok(result.config);
        assert.strictEqual(
            result.issues.filter((issue) => issue.severity === "error").length,
            0
        );
        assert.ok(
            result.issues.some((issue) => issue.path === "sqlWarehouseId")
        );
    });

    it("rejects invalid Databricks App names", () => {
        const result = validateAppConfig({
            version: "0.2",
            appId: "foil_virtual_lab",
            appName: "FOIL_App",
            framework: "STREAMLIT",
            deployment: "DATABRICKS_APP",
            catalog: "foil",
            goldSchema: "foil_gold",
            sqlWarehouseId: "abc123",
            readOnly: true,
            canLaunchCampaigns: false,
            pages: ["overview"],
        });

        assert.strictEqual(result.config, undefined);
        assert.ok(result.issues.some((issue) => issue.path === "appName"));
    });
});
