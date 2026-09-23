import { trace } from "@opentelemetry/api";

interface CosmosMetric { operation: string; requestCharge: number; durationMs: number; correlationId: string }
class Telemetry {
  private readonly cosmosMetrics: CosmosMetric[] = [];
  private errors = 0;
  cosmos(operation: string, requestCharge: number, durationMs: number, correlationId: string): void {
    this.cosmosMetrics.push({ operation, requestCharge, durationMs, correlationId });
    trace.getTracer("cosmos-agent").startActiveSpan(`cosmos.${operation}`, (span) => {
      span.setAttributes({ "db.system": "cosmosdb", "db.cosmosdb.request_charge": requestCharge, "app.correlation_id": correlationId });
      span.end();
    });
  }
  error(error: unknown): void {
    this.errors += 1;
    trace.getActiveSpan()?.recordException(error instanceof Error ? error : new Error("Redacted error"));
  }
  snapshot() {
    return {
      cosmosOperations: this.cosmosMetrics.length,
      requestCharge: this.cosmosMetrics.reduce((sum, metric) => sum + metric.requestCharge, 0),
      recent: this.cosmosMetrics.slice(-20),
      errors: this.errors,
      redaction: "Prompts and document bodies are not captured by default.",
    };
  }
}
export const telemetry = new Telemetry();
