import type {FoilAppConfig} from "./FoilLabTypes";

export interface FoilDashboardArtifact {
    relativePath: string;
    content: string;
}

export interface FoilDashboardCompilationPlan {
    resourceKey: string;
    dashboardName: string;
    artifacts: FoilDashboardArtifact[];
    datasets: string[];
}

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAFE_RESOURCE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function yamlQuote(value: string): string {
    return JSON.stringify(value);
}

function fullTable(config: FoilAppConfig, table: string): string {
    return `${config.catalog}.${config.goldSchema}.${table}`;
}

export function compileDashboard(
    config: FoilAppConfig
): FoilDashboardCompilationPlan {
    if (!SAFE_RESOURCE.test(config.appId)) {
        throw new Error("Dashboard resource key is not safe for a Databricks bundle.");
    }
    if (!SAFE_IDENTIFIER.test(config.catalog)) {
        throw new Error("Configure a simple Unity Catalog catalog identifier first.");
    }
    if (!SAFE_IDENTIFIER.test(config.goldSchema)) {
        throw new Error("Gold schema is not a safe Unity Catalog identifier.");
    }
    if (!SAFE_RESOURCE.test(config.sqlWarehouseId)) {
        throw new Error("Configure a valid SQL warehouse ID first.");
    }

    const resourceKey = "foil_results_dashboard";
    const dashboardName = "FOIL Virtual Lab - Results";
    const datasets = [
        "campaign_registry",
        "campaign_scenarios",
        "campaign_design_statistics",
    ];

    const serialized = {
        datasets: [
            {
                name: "campaigns",
                displayName: "FOIL Campaign Registry",
                queryLines: [
                    `SELECT campaign_id, source_hash, technology, machine_id, machine_model_version, classification, objective, compiled_at_utc FROM ${fullTable(config, "campaign_registry")} ORDER BY compiled_at_utc DESC`,
                ],
            },
            {
                name: "scenarios",
                displayName: "FOIL Scenario Matrix",
                queryLines: [
                    `SELECT campaign_id, source_hash, scenario_index, scenario_id, parameters_json FROM ${fullTable(config, "campaign_scenarios")} ORDER BY campaign_id, scenario_index`,
                ],
            },
            {
                name: "designstats",
                displayName: "FOIL Design Statistics",
                queryLines: [
                    `SELECT campaign_id, source_hash, parameter_path, value_count, mean_value, stddev_value, min_value, max_value FROM ${fullTable(config, "campaign_design_statistics")} ORDER BY campaign_id, parameter_path`,
                ],
            },
        ],
        pages: [
            {
                name: "overview",
                displayName: "FOIL Results",
                layout: [],
                pageType: "PAGE_TYPE_CANVAS",
            },
        ],
    };

    const bundle = `resources:
  dashboards:
    ${resourceKey}:
      display_name: ${yamlQuote(dashboardName)}
      file_path: ./dashboard/foil-results.lvdash.json
      warehouse_id: ${yamlQuote(config.sqlWarehouseId)}
      dataset_catalog: ${yamlQuote(config.catalog)}
      dataset_schema: ${yamlQuote(config.goldSchema)}
`;

    const manifest = {
        version: "0.1",
        resourceKey,
        dashboardName,
        sourceLayer: "GOLD",
        warehouseId: config.sqlWarehouseId,
        catalog: config.catalog,
        schema: config.goldSchema,
        datasets,
        notes: [
            "The generated dashboard establishes governed Gold datasets and a native AI/BI asset.",
            "Engineering/statistical calculations stay in Gold; the dashboard is presentation only.",
            "The first compiler intentionally leaves the canvas layout empty until the serialized widget contract is live-validated against Databricks.",
        ],
    };

    return {
        resourceKey,
        dashboardName,
        datasets,
        artifacts: [
            {
                relativePath: "dashboard/foil-results.lvdash.json",
                content: `${JSON.stringify(serialized, null, 4)}\n`,
            },
            {
                relativePath: "foil-dashboard.yml",
                content: bundle,
            },
            {
                relativePath: "dashboard/manifest.json",
                content: `${JSON.stringify(manifest, null, 4)}\n`,
            },
        ],
    };
}
