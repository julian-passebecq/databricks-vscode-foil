export interface BundleWithIncludes {
    include?: string[];
}

export interface BundleIncludeResult<T extends BundleWithIncludes> {
    bundle: T;
    changed: boolean;
}

export function addBundleInclude<T extends BundleWithIncludes>(
    bundle: T,
    includePath: string
): BundleIncludeResult<T> {
    const includes = bundle.include ?? [];
    if (includes.includes(includePath)) {
        return {bundle, changed: false};
    }

    return {
        bundle: {
            ...bundle,
            include: [...includes, includePath],
        },
        changed: true,
    };
}
