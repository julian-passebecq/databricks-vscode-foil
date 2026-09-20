import assert from "assert";

import type {FoilAppConfig} from "./FoilLabTypes";
import {compileDashboard} from "./dashboardCompiler";

const CONFIG: FoilAppConfig = {
    version: "0.2",
    appId: "foil_virtual_lab",
    appName: "foil-virtual-lab",
    framework: "STREAMLIT",
    deployment: "DATABRICKS_APP",
    catalog: "foil",
    goldSchema: "foil_gold",
    sqlWarehouseId: "abcdef1234567890",
    readOnly: true,
    canLaunchCampaigns: false,
    pages: [],
};

describe("FOIL dashboard compiler", () => {
    it("builds a Gold-backed AI/BI dashboard bundle resource", () => {
        const plan = compileDashboard(CONFIG);
        const resource = plan.artifacts.find(
            (artifact) => artifact.relativePath === "foil-dashboard.yml"
        );
        assert.ok(resource);
        assert.match(resource.content, /resources:/);
        assert.match(resource.content, /dashboards:/);
        assert.match(resource.content, /foil_results_dashboard:/);
        assert.match(resource.content, /warehouse_id: "abcdef1234567890"/);
        assert.match(resource.content, /dataset_catalog: "foil"/);
        assert.match(resource.content, /dataset_schema: "foil_gold"/);
    });

    it("serializes governed Gold datasets", () => {
        const plan = compileDashboard(CONFIG);
        const dashboard = plan.artifacts.find(
            (artifact) =>
                artifact.relativePath === "dashboard/foil-results.lvdash.json"
        );
        assert.ok(dashboard);
        const parsed = JSON.parse(dashboard.content) as {
            datasets: Array<{queryLines: string[]}>;
            pages: Array<{layout: unknown[]}>;
        };
        assert.strictEqual(parsed.datasets.length, 3);
        assert.match(
            parsed.datasets[0].queryLines[0],
            /foil\.foil_gold\.campaign_registry/
        );
        assert.strictEqual(parsed.pages[0].layout.length, 0);
    });

    it("rejects an unconfigured catalog", () => {
        assert.throws(
            () => compileDashboard({...CONFIG, catalog: ""}),
            /catalog/
        );
    });
});
