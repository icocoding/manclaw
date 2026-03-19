export declare const APP_NAME = "manclaw";
export type ServiceStatus = 'running' | 'stopped' | 'degraded' | 'unknown';
export type LogLevel = 'info' | 'warn' | 'error';
export type RiskLevel = 'low' | 'medium' | 'high';
export type ShellExecutionStatus = 'running' | 'completed' | 'failed';
export interface ApiError {
    code: string;
    message: string;
}
export interface ApiResponse<T> {
    ok: boolean;
    data?: T;
    error?: ApiError;
}
export interface ServiceSummary {
    id: string;
    name: string;
    status: ServiceStatus;
    message?: string;
}
export interface ServiceDetail extends ServiceSummary {
    pid?: number;
    uptimeSeconds?: number;
    startedAt?: string;
    command?: string;
    args?: string[];
    cwd?: string;
}
export interface HealthSnapshot {
    generatedAt: string;
    services: ServiceSummary[];
}
export interface SystemSummary {
    services: ServiceSummary[];
}
export interface ConfigDocument {
    format: 'json';
    path: string;
    content: string;
    updatedAt: string;
}
export interface ConfigValidationResult {
    valid: boolean;
    errors: string[];
}
export interface ConfigRevision {
    id: string;
    createdAt: string;
    comment?: string;
}
export interface LogEntry {
    id: string;
    timestamp: string;
    level: LogLevel;
    source: 'app' | 'service' | 'shell' | 'audit';
    message: string;
}
export interface ShellAllowedCommand {
    id: string;
    title: string;
    description: string;
    riskLevel: RiskLevel;
}
export interface ShellExecutionRecord {
    id: string;
    commandId: string;
    status: ShellExecutionStatus;
    startedAt: string;
    completedAt?: string;
    exitCode?: number;
    output: string;
}
export interface ManagedServiceConfig {
    command: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
    autoStart: boolean;
}
export interface ManClawConfig {
    service: ManagedServiceConfig;
    shell: {
        timeoutMs: number;
    };
}
