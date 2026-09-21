export type FoilFreeCapabilityStatus = "supported" | "limited" | "unsupported";

export interface FoilFreeCapability {
    id: string;
    label: string;
    value: string;
    status: FoilFreeCapabilityStatus;
}

/**
 * Static capability snapshot used for pre-flight guidance. Live workspace probes
 * will replace or refine these values as the Foil Lab matures.
 */
export const FREE_EDITION_PROFILE = {
    id: "databricks-free-2026-09",
    sourceDate: "2026-09-19",
    capabilities: [
        {
            id: "compute",
            label: "Compute",
            value: "Serverless only",
            status: "supported",
        },
        {
            id: "sql",
            label: "SQL warehouse",
            value: "1 Free Edition warehouse",
            status: "limited",
        },
        {
            id: "jobs",
            label: "Lakeflow Jobs",
            value: "Up to 5 concurrent tasks",
            status: "limited",
        },
        {
            id: "pipelines",
            label: "Declarative Pipelines",
            value: "1 active pipeline per type",
            status: "limited",
        },
        {
            id: "apps",
            label: "Databricks Apps",
            value: "Up to 3 apps; auto-stop applies",
            status: "limited",
        },
        {
            id: "unityCatalog",
            label: "Unity Catalog",
            value: "Supported",
            status: "supported",
        },
        {
            id: "mlflow",
            label: "MLflow",
            value: "Supported for experiments",
            status: "supported",
        },
        {
            id: "dashboards",
            label: "AI/BI dashboards",
            value: "Supported",
            status: "supported",
        },
        {
            id: "classicCompute",
            label: "Classic compute",
            value: "Not available",
            status: "unsupported",
        },
    ] satisfies FoilFreeCapability[],
};
