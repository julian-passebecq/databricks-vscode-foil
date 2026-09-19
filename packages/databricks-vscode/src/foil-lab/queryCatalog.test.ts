import assert from "assert";

import type {FoilCampaignConfig, FoilLabProjectConfig} from "./FoilLabTypes";
import {buildQueryArtifacts} from "./queryCatalog";

const project: FoilLabProjectConfig = {
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
};

const campaign: FoilCampaignConfig = {
    campaignId: "wind_test_001",
    technology: "EOLIEN",
    machineId: "eolien_lab_v1",
    classification: "SYNTHETIC",
    objective: "Test query generation.",
    analyses: [{module: "descriptive_statistics", enabled: true}],
};

describe("buildQueryArtifacts", () => {
    it("emits a reusable read-only Gold query catalog", () => {
        const artifacts = buildQueryArtifacts(project, campaign);
        const catalog = artifacts.find(
            (artifact) => artifact.relativePath === "queries/catalog.json"
        );
        const scenarios = artifacts.find(
            (artifact) => artifact.relativePath === "queries/scenario_matrix.sql"
        );

        assert.ok(catalog?.content.includes('"sourceLayer": "GOLD"'));
        assert.ok(catalog?.content.includes('"cardinality": "one_to_many"'));
        assert.ok(scenarios?.content.includes("campaign_scenarios"));
        assert.ok(scenarios?.content.includes(":campaign_id"));
        assert.ok(!scenarios?.content.includes("CREATE TABLE"));
    });
});
