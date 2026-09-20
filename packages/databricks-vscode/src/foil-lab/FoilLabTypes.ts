export type FoilTechnology = "EOLIEN" | "HYDROLIEN" | "PROPULSION";

export type FoilMachineStatus = "ACTIVE" | "REFERENCE_ONLY" | "EXPERIMENTAL";

export type FoilDataClassification = "SYNTHETIC" | "SANITIZED_APPROVED";

export interface FoilLabProjectConfig {
    version: string;
    name: string;
    activeTechnology: FoilTechnology;
    defaultClassification: FoilDataClassification;
    allowRealData: boolean;
    controlContextFile?: string;
    databricks: {
        target: string;
        catalog?: string;
        goldSchema: string;
        labJob: string;
        appResource: string;
    };
}

export interface FoilMachineConfig {
    machineId: string;
    technology: FoilTechnology;
    status: FoilMachineStatus;
    classification: FoilDataClassification;
    modelVersion: string;
    description?: string;
    parameters?: Record<string, unknown>;
    control?: {
        sourceRepo: string;
        controlMachineId: string;
        revision: string;
        importedAt: string;
        snapshotPath?: string;
        controlDigest?: string;
    };
}

export interface FoilCampaignConfig {
    campaignId: string;
    technology: FoilTechnology;
    machineId: string;
    classification: FoilDataClassification;
    objective: string;
    test?: Record<string, unknown>;
    analyses: Array<{
        module: string;
        enabled?: boolean;
        config?: Record<string, unknown>;
    }>;
    outputs?: {
        gold?: boolean;
        aiBiDashboard?: boolean;
        streamlitApp?: boolean;
        mlflow?: boolean;
    };
    inputProvenance?: Record<string, unknown>;
    safety?: Record<string, unknown>;
    provenance?: Record<string, unknown>;
}

export interface FoilAppConfig {
    version: string;
    appId: string;
    appName: string;
    framework: "STREAMLIT";
    deployment: "DATABRICKS_APP" | "EXTERNAL";
    catalog: string;
    goldSchema: string;
    sqlWarehouseId: string;
    readOnly: boolean;
    canLaunchCampaigns: boolean;
    pages: string[];
}

export interface FoilLabValidationIssue {
    severity: "error" | "warning";
    path: string;
    message: string;
}

export interface FoilMachineSummary {
    fileName: string;
    config?: FoilMachineConfig;
    issues: FoilLabValidationIssue[];
}

export interface FoilCampaignSummary {
    fileName: string;
    config?: FoilCampaignConfig;
    issues: FoilLabValidationIssue[];
}

export interface FoilLabState {
    initialized: boolean;
    project?: FoilLabProjectConfig;
    projectIssues: FoilLabValidationIssue[];
    machines: FoilMachineSummary[];
    campaigns: FoilCampaignSummary[];
    app?: FoilAppConfig;
    appIssues: FoilLabValidationIssue[];
}
