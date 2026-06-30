from __future__ import annotations


def owner_remediation_summary(what_happened: str, next_steps: list[str]) -> str:
    issue = what_happened.strip() or "An unknown local runtime issue occurred."
    steps = [step.strip() for step in next_steps if step.strip()]
    if not steps:
        steps = ["Open Settings, check the saved configuration, and try again."]
    return "\n".join(
        [
            f"What happened: {issue}",
            "Suggested next steps:",
            *(f"- {step}" for step in steps),
        ]
    )


def realtime_provider_remediation(error: str) -> str:
    return owner_remediation_summary(
        error,
        [
            "Check the selected AI provider API key in Settings.",
            "Confirm the selected model is available, then run a microphone Test Call.",
            "If this affected a customer call, review the Inbox item and call the customer back if needed.",
        ],
    )


def phone_session_start_remediation(error: str) -> str:
    return owner_remediation_summary(
        error,
        [
            "Confirm Runtime is running and the selected realtime provider is ready.",
            "Check the phone provider credentials and click Connect Phone again.",
            "Place a short test call after the connection shows ready.",
        ],
    )


def transfer_failure_remediation(*, target: str, reason: str, error: str) -> str:
    target_label = target.strip() or "staff"
    reason_label = reason.strip() or "not provided"
    return owner_remediation_summary(
        f"Transfer to {target_label} failed. Caller reason: {reason_label}. Error: {error}",
        [
            "Check the transfer target phone number in Settings.",
            "Confirm the phone provider account supports live call transfers.",
            "Use the caller phone number in Inbox or Logs to call the customer back manually.",
        ],
    )
