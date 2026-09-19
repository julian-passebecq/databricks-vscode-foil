export const PROJECT_CONFIG = {
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

export const EOLIEN_MACHINE = {
    machineId: "eolien_lab_v1",
    technology: "EOLIEN",
    status: "ACTIVE",
    classification: "SYNTHETIC",
    modelVersion: "wind_proxy_v1",
    description:
        "Active synthetic wind-machine profile. Engineering values remain demo/synthetic until explicitly replaced by approved evidence.",
};

export const HYDRO_REFERENCE_MACHINE = {
    machineId: "hydro_reference_v1",
    technology: "HYDROLIEN",
    status: "REFERENCE_ONLY",
    classification: "SYNTHETIC",
    modelVersion: "hydro_reference_proxy_v1",
    description:
        "Historical/reference branch. Kept available for reusable methodology without becoming the active Foil machine.",
};

export const EXAMPLE_CAMPAIGN = {
    campaignId: "wind_parameter_sweep_example",
    technology: "EOLIEN",
    machineId: "eolien_lab_v1",
    classification: "SYNTHETIC",
    objective:
        "Demonstrate a reproducible wind parameter study and publish Gold, AI/BI and Streamlit-ready outputs.",
    test: {
        environment: {
            windSpeedMs: [6, 8, 10, 12, 14],
            turbulenceIntensity: [0.05, 0.1, 0.15],
        },
        control: {
            frequencyHz: [0.5, 0.75, 1.0],
            pitchDeg: [10, 15, 20],
        },
        seed: 42,
    },
    analyses: [
        {module: "descriptive_statistics", enabled: true},
        {module: "parameter_sweep", enabled: true},
        {module: "regression", enabled: false},
    ],
    outputs: {
        gold: true,
        aiBiDashboard: true,
        streamlitApp: true,
        mlflow: false,
    },
};

export const ANALYSIS_REGISTRY = {
    version: "0.1",
    modules: [
        {id: "campaign_contract", status: "READY"},
        {id: "descriptive_statistics", status: "PLANNED"},
        {id: "parameter_sweep", status: "PLANNED"},
        {id: "correlation", status: "PLANNED"},
        {id: "regression", status: "PLANNED"},
        {id: "anomaly_detection", status: "PLANNED"},
        {id: "forecasting", status: "PLANNED"},
        {id: "monte_carlo", status: "PLANNED"},
    ],
};

export const APP_SPEC = {
    version: "0.1",
    appId: "foil_virtual_lab",
    framework: "STREAMLIT",
    deployment: "DATABRICKS_APP",
    goldSchema: "foil_gold",
    canLaunchCampaigns: true,
    pages: [
        "overview",
        "machine",
        "campaigns",
        "engineering",
        "statistics",
        "machine_learning",
        "economics",
        "data",
        "evidence",
    ],
};
