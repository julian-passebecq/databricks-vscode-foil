import assert from "assert";

import type {
    FoilCampaignConfig,
    FoilLabProjectConfig,
} from "./FoilLabTypes";
import {compileCampaign} from "./compileCampaign";

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
    objective: "Test the campaign compiler.",
    test: {
        environment: {
            windSpeedMs: [8, 10, 12],
        },
    },
    analyses: [{module: "descriptive_statistics", enabled: true}],
    outputs: {
        gold: true,
        aiBiDashboard: true,
        streamlitApp: true,
        mlflow: false,
    },
};

describe("compileCampaign", () => {
    it("is deterministic for the same project and campaign", () => {
        const first = compileCampaign(project, campaign);
        const second = compileCampaign(project, campaign);

        assert.strictEqual(first.sourceHash, second.sourceHash);
        assert.deepStrictEqual(first.artifacts, second.artifacts);
    });

    it("generates a serverless Python job and safe metadata runner", () => {
        const plan = compileCampaign(project, campaign);
        const job = plan.artifacts.find(
            (artifact) => artifact.relativePath === "resources/campaign.job.yml"
        );
        const runner = plan.artifacts.find(
            (artifact) => artifact.relativePath === "src/run_campaign.py"
        );

        assert.ok(job?.content.includes("environment_key: default"));
        assert.ok(job?.content.includes("spark_python_task:"));
        assert.ok(runner?.content.includes("campaign_registry"));
        assert.ok(runner?.content.includes("statistical, or ML results"));
    });

    it("changes the source hash when the campaign changes", () => {
        const first = compileCampaign(project, campaign);
        const second = compileCampaign(project, {
            ...campaign,
            objective: "A different experiment.",
        });

        assert.notStrictEqual(first.sourceHash, second.sourceHash);
    });
});
