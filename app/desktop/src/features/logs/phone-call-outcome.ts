import { translateStatus } from "@/lib/i18n";
import type { PhoneCallRecord } from "@/lib/types";

type TranslationFn = (key: string, fallback?: string) => string;

export type PhoneCallOutcome = {
  hint: string;
  label: string;
  tone: "cyan" | "green" | "neutral" | "red" | "yellow";
};

export function phoneCallOutcome(record: PhoneCallRecord, t: TranslationFn): PhoneCallOutcome {
  const reason = record.ended_reason || record.status;
  const normalized = reason?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? "";
  const hasFailure =
    record.status === "failed"
    || Boolean(record.error_message)
    || ["failed", "provider_error", "network_error", "unknown"].includes(normalized);

  if (hasFailure) {
    return {
      hint: t("logs.phoneHint.providerFailure"),
      label: translateStatus(reason || "failed", t),
      tone: "red",
    };
  }

  if (normalized === "caller_hung_up") {
    return {
      hint: t("logs.phoneHint.callerHungUp"),
      label: translateStatus(reason, t),
      tone: "neutral",
    };
  }

  if (["agent_hung_up", "completed"].includes(normalized)) {
    return {
      hint: t("logs.phoneHint.completed"),
      label: translateStatus(reason, t),
      tone: "green",
    };
  }

  if (normalized === "transferred") {
    return {
      hint: t("logs.phoneHint.transferred"),
      label: translateStatus(reason, t),
      tone: "cyan",
    };
  }

  if (["timeout", "timeout_5_minutes"].includes(normalized)) {
    return {
      hint: t("logs.phoneHint.timeout"),
      label: translateStatus(reason, t),
      tone: "yellow",
    };
  }

  if (!record.ended_at && record.status === "active") {
    return {
      hint: t("logs.phoneHint.active"),
      label: translateStatus(record.status, t),
      tone: "cyan",
    };
  }

  return {
    hint: t("logs.phoneHint.review"),
    label: translateStatus(reason, t),
    tone: "neutral",
  };
}
