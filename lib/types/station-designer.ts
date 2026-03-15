// Station Designer — TypeScript interfaces

export interface StationTemplate {
    _id: string;
    name: string;
    description: string;
    createdBy?: string;
    craftNodes: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

export interface CreateStationTemplateDto {
    name: string;
    description: string;
    craftNodes?: Record<string, unknown>;
}

// ─── UI Block prop interfaces ────────────────────────────────────────────────

export interface SectionProps {
    bgColor?: string;
    padding?: string;
    children?: React.ReactNode;
}

export interface TwoColumnsProps {
    gap?: string;
    children?: React.ReactNode;
}

export interface ColumnProps {
    children?: React.ReactNode;
}

export interface HeadingProps {
    text?: string;
    level?: "h1" | "h2" | "h3" | "h4";
    align?: "left" | "center" | "right";
    color?: string;
}

export interface ParagraphProps {
    text?: string;
    align?: "left" | "center" | "right";
    size?: "sm" | "base" | "lg";
}

export interface DividerProps {
    spacing?: string;
    color?: string;
}

export interface SpacerProps {
    height?: number;
}

export interface BadgeProps {
    text?: string;
    variant?: "default" | "success" | "warning" | "danger" | "info";
}

export interface InputFieldProps {
    label?: string;
    placeholder?: string;
    fieldType?: "text" | "number" | "date";
    required?: boolean;
}

export interface SelectFieldProps {
    label?: string;
    options?: string;  // comma-separated
    placeholder?: string;
}

export interface TextAreaFieldProps {
    label?: string;
    placeholder?: string;
    rows?: number;
}

export interface ButtonProps {
    label?: string;
    variant?: "primary" | "outline" | "danger" | "success";
    size?: "sm" | "md" | "lg";
    fullWidth?: boolean;
}

export interface InfoCardProps {
    title?: string;
    subtitle?: string;
    content?: string;
    accentColor?: string;
}

export interface StatusIndicatorProps {
    label?: string;
    status?: "pending" | "in_progress" | "completed" | "error";
}
