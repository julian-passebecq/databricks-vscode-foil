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
    control: {
        sourceRepo: "julian-passebecq/foil-control-v1",
        controlMachineId: "MACHINE-WIND-001",
        revision: "2026-09-19.1",
        importedAt: "2026-09-20T00:00:00Z",
        controlDigest: "abc123",
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
        assert.ok(runner?.content.includes("deterministic parameter design"));
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

        const manifest = plan.artifacts.find(
            (artifact) => artifact.relativePath === "manifest.json"
        );
        assert.ok(
            manifest?.content.includes('"controlMachineId": "MACHINE-WIND-001"')
        );
        assert.ok(manifest?.content.includes('"controlDigest": "abc123"'));
        assert.ok(
            manifest?.content.includes(
                '"engineeringResultsGeneratedByThisStage": false'
            )
        );

        const queryCatalog = plan.artifacts.find(
            (artifact) => artifact.relativePath === "queries/catalog.json"
        );
        const scenarioQuery = plan.artifacts.find(
            (artifact) =>
                artifact.relativePath === "queries/scenario_matrix.sql"
        );
        assert.ok(queryCatalog?.content.includes('"sourceLayer": "GOLD"'));
        assert.ok(scenarioQuery?.content.includes(":campaign_id"));
    });

    it("generates explicitly synthetic response results for wind_parametric_v1", () => {
        const syntheticMachine: FoilMachineConfig = {
            ...machine,
            machineId: "MACHINE-WIND-001",
            modelVersion: "wind_parametric_v1@0.1",
        };
        const syntheticCampaign: FoilCampaignConfig = {
            ...campaign,
            campaignId: "CAMP-WIND-BASELINE-001",
            machineId: "MACHINE-WIND-001",
            analyses: [
                {module: "descriptive_statistics", enabled: true},
                {module: "response_statistics", enabled: true},
            ],
            test: {
                environment: {
                    windSpeedMs: [6, 9],
                    airDensityKgM3: 1.225,
                    turbulenceIntensityPct: 10,
                },
                machine: {
                    effectiveAreaM2: 2.0,
                },
                control: {
                    pitchDeg: [5, 15],
                    frequencyHz: [0.5, 0.8],
                },
                conversion: {
                    efficiencyProxy: 0.75,
                },
                experiment: {
                    durationH: 1.0,
                },
            },
        };

        const plan = compileCampaign(
            project,
            syntheticMachine,
            syntheticCampaign
        );
        const runner = plan.artifacts.find(
            (artifact) => artifact.relativePath === "src/run_campaign.py"
        );
        const manifest = plan.artifacts.find(
            (artifact) => artifact.relativePath === "manifest.json"
        );
        const responseQuery = plan.artifacts.find(
            (artifact) =>
                artifact.relativePath === "queries/scenario_response.sql"
        );
        const responseStatistics = plan.artifacts.find(
            (artifact) =>
                artifact.relativePath === "src/analyses/response_statistics.py"
        );
        const responseStatisticsQuery = plan.artifacts.find(
            (artifact) =>
                artifact.relativePath === "queries/response_statistics.sql"
        );
        const job = plan.artifacts.find(
            (artifact) => artifact.relativePath === "resources/campaign.job.yml"
        );
        const dashboard = plan.artifacts.find(
            (artifact) =>
                artifact.relativePath === "dashboard/dashboard-intent.json"
        );
        const appPage = plan.artifacts.find(
            (artifact) => artifact.relativePath === "ui/campaign-page.json"
        );

        assert.ok(runner?.content.includes("scenario_response_results"));
        assert.ok(runner?.content.includes("SYNTHETIC_MODEL_OUTPUT"));
        assert.ok(runner?.content.includes("cp_reference = 0.40"));
        assert.ok(runner?.content.includes("turbulence_mean_effect_encoded"));
        assert.ok(
            manifest?.content.includes(
                '"engineeringResultsGeneratedByThisStage": true'
            )
        );
        assert.ok(
            manifest?.content.includes(
                '"engineeringResultClassification": "SYNTHETIC_MODEL_OUTPUT"'
            )
        );
        assert.ok(responseQuery?.content.includes("scenario_response_results"));
        assert.ok(responseQuery?.content.includes(":campaign_id"));
        assert.ok(
            responseStatistics?.content.includes("campaign_response_statistics")
        );
        assert.ok(
            responseStatistics?.content.includes("SYNTHETIC_MODEL_OUTPUT")
        );
        assert.ok(
            responseStatisticsQuery?.content.includes(
                "campaign_response_statistics"
            )
        );
        assert.ok(job?.content.includes("task_key: response_statistics"));
        assert.ok(dashboard?.content.includes("SYNTHETIC_PARAMETRIC_RESPONSE"));
        assert.ok(dashboard?.content.includes("campaign_response_statistics"));
        assert.ok(appPage?.content.includes("synthetic_response"));
        assert.ok(appPage?.content.includes("response_statistics"));
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
