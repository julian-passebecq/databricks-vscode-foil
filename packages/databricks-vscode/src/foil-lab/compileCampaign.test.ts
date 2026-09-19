import assert from "assert";

import type {
    FoilCampaignConfig,
    FoilLabProjectConfig,
    FoilMachineConfig,
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

const machine: FoilMachineConfig = {
    machineId: "eolien_lab_v1",
    technology: "EOLIEN",
    status: "ACTIVE",
    classification: "SYNTHETIC",
    modelVersion: "wind_proxy_v1",
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
        const first = compileCampaign(project, machine, campaign);
        const second = compileCampaign(project, machine, campaign);

        assert.strictEqual(first.sourceHash, second.sourceHash);
        assert.deepStrictEqual(first.artifacts, second.artifacts);
    });

    it("generates a serverless Python job and safe metadata runner", () => {
        const plan = compileCampaign(project, machine, campaign);
        const job = plan.artifacts.find(
            (artifact) => artifact.relativePath === "resources/campaign.job.yml"
        );
        const runner = plan.artifacts.find(
            (artifact) => artifact.relativePath === "src/run_campaign.py"
        );
        const statistics = plan.artifacts.find(
            (artifact) =>
                artifact.relativePath ===
                "src/analyses/descriptive_statistics.py"
        );

        assert.ok(job?.content.includes("environment_key: default"));
        assert.ok(job?.content.includes("spark_python_task:"));
        assert.ok(runner?.content.includes("campaign_registry"));
        assert.ok(runner?.content.includes("campaign_scenarios"));
        assert.ok(runner?.content.includes("scenario_parameters"));
        assert.ok(runner?.content.includes("build_scenarios"));
        assert.ok(runner?.content.includes("scenario_count"));
        assert.ok(runner?.content.includes("statistical, or ML results"));
        assert.ok(job?.content.includes("task_key: descriptive_statistics"));
        assert.ok(job?.content.includes("depends_on:"));
        assert.ok(statistics?.content.includes("campaign_design_statistics"));
        assert.ok(statistics?.content.includes("EXPERIMENT_DESIGN_PARAMETERS"));

        const dashboard = plan.artifacts.find(
            (artifact) =>
                artifact.relativePath === "dashboard/dashboard-intent.json"
        );
        const appPage = plan.artifacts.find(
            (artifact) => artifact.relativePath === "ui/campaign-page.json"
        );
        assert.ok(dashboard?.content.includes("campaign_scenarios"));
        assert.ok(dashboard?.content.includes("scenario_parameters"));
        assert.ok(appPage?.content.includes("scenario_matrix"));

        const queryCatalog = plan.artifacts.find(
            (artifact) => artifact.relativePath === "queries/catalog.json"
        );
        const scenarioQuery = plan.artifacts.find(
            (artifact) => artifact.relativePath === "queries/scenario_matrix.sql"
        );
        assert.ok(queryCatalog?.content.includes('"sourceLayer": "GOLD"'));
        assert.ok(scenarioQuery?.content.includes(":campaign_id"));
    });

    it("changes the source hash when the campaign changes", () => {
        const first = compileCampaign(project, machine, campaign);
        const second = compileCampaign(project, machine, {
            ...campaign,
            objective: "A different experiment.",
        });

        assert.notStrictEqual(first.sourceHash, second.sourceHash);
    });

    it("changes the study hash when the machine version changes", () => {
        const first = compileCampaign(project, machine, campaign);
        const second = compileCampaign(
            project,
            {...machine, modelVersion: "wind_proxy_v2"},
            campaign
        );

        assert.notStrictEqual(first.sourceHash, second.sourceHash);
    });

    it("keeps the study hash stable when only deployment settings change", () => {
        const first = compileCampaign(project, machine, campaign);
        const second = compileCampaign(
            {
                ...project,
                databricks: {...project.databricks, target: "other_dev"},
            },
            machine,
            campaign
        );

        assert.strictEqual(first.sourceHash, second.sourceHash);
        assert.notStrictEqual(first.buildHash, second.buildHash);
    });
});
