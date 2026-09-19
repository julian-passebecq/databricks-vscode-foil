import assert from "assert";

import type {FoilAppConfig} from "./FoilLabTypes";
import {compileApp} from "./appCompiler";

const app: FoilAppConfig = {
    version: "0.2",
    appId: "foil_virtual_lab",
    appName: "foil-virtual-lab",
    framework: "STREAMLIT",
    deployment: "DATABRICKS_APP",
    catalog: "foil",
    goldSchema: "foil_gold",
    sqlWarehouseId: "abc123",
    readOnly: true,
    canLaunchCampaigns: false,
    pages: ["overview", "campaigns", "statistics", "data"],
};

describe("compileApp", () => {
    it("generates a Streamlit Databricks App with read-only resources", () => {
        const plan = compileApp(app);
        const bundle = plan.artifacts.find(
            (artifact) => artifact.relativePath === "foil-app.yml"
        );
        const appYaml = plan.artifacts.find(
            (artifact) => artifact.relativePath === "app/app.yaml"
        );
        const python = plan.artifacts.find(
            (artifact) => artifact.relativePath === "app/app.py"
        );

        assert.ok(bundle?.content.includes("permission: CAN_USE"));
        assert.ok(bundle?.content.includes("permission: SELECT"));
        assert.ok(bundle?.content.includes("source_code_path: ./app"));
        assert.ok(appYaml?.content.includes("valueFrom: foil-sql-warehouse"));
        assert.ok(appYaml?.content.includes("streamlit"));
        assert.ok(python?.content.includes("campaign_registry"));
        assert.ok(python?.content.includes("read-only Gold layer"));
    });

    it("rejects an unconfigured warehouse", () => {
        assert.throws(() =>
            compileApp({...app, sqlWarehouseId: ""})
        );
    });

    it("rejects invalid Databricks App names", () => {
        assert.throws(() =>
            compileApp({...app, appName: "FOIL_App"})
        );
    });
});
