// Station Designer — TypeScript interfaces

export interface StationTemplate {
    _id: string;
    name: string;
    description: string;
    createdBy?: string;
    craftNodes: Record<string, unknown>; // Craft.js serialized node tree
    createdAt: string;
    updatedAt: string;
}

export interface CreateStationTemplateDto {
    name: string;
    description: string;
    craftNodes?: Record<string, unknown>;
}

// ─── Block prop interfaces ──────────────────────────────────────────────────

export interface BaseBlockProps {
    label?: string;
}

export interface InputBlockProps extends BaseBlockProps {
    materialType?: string;
    quantity?: number;
}

export interface CuttingBlockProps extends BaseBlockProps {
    cutType?: string;
    estimatedTime?: number;
}

export interface GrindingBlockProps extends BaseBlockProps {
    grindType?: string;
    edgeFinish?: string;
}

export interface ProcessingBlockProps extends BaseBlockProps {
    processName?: string;
    estimatedTime?: number;
}

export interface InspectionBlockProps extends BaseBlockProps {
    checkPoints?: string;
    passCriteria?: string;
}

export interface PackagingBlockProps extends BaseBlockProps {
    packType?: string;
    quantity?: number;
}

export interface OutputBlockProps extends BaseBlockProps {
    destination?: string;
}

export interface NoteBlockProps {
    content?: string;
}
